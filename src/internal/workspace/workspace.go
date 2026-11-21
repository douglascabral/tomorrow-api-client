package workspace

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
)

const (
	fileName              = "workspace.enc"
	formatVersion         = 1
	kdfName               = "pbkdf2-sha256"
	kdfIterations         = 310_000
	saltSize              = 16
	keySize               = 32
	nonceSize             = 12
	minimumWorkspace      = 1
	maximumNameLength     = 64
	maximumFileSize       = 16 * 1024 * 1024
	minimumCipherSize     = 16
	MaximumHistoryEntries = 1000
	workspaceDirMode      = 0o700
	workspaceFileMode     = 0o600
)

var (
	ErrInvalidName       = errors.New("workspace name is invalid")
	ErrInvalidPassword   = errors.New("password is required")
	ErrPasswordMismatch  = errors.New("password confirmation does not match")
	ErrDestinationExists = errors.New("workspace destination already exists")
	ErrInvalidParent     = errors.New("parent folder is invalid")
	ErrInvalidWorkspace  = errors.New("workspace is invalid or password is incorrect")
)

type Data struct {
	Collections  []json.RawMessage `json:"collections"`
	Requests     []json.RawMessage `json:"requests"`
	Environments []json.RawMessage `json:"environments"`
	History      []json.RawMessage `json:"history"`
}

type Metadata struct {
	Version    int    `json:"version"`
	KDF        string `json:"kdf"`
	Iterations int    `json:"iterations"`
	Cipher     string `json:"cipher"`
	Salt       string `json:"salt"`
	Nonce      string `json:"nonce"`
	Ciphertext string `json:"ciphertext"`
}

type Opened struct {
	Path string `json:"path"`
	Name string `json:"name"`
	Data Data   `json:"data"`
}

func Destination(parent, name string) (string, error) {
	name = strings.TrimSpace(name)
	if !validName(name) {
		return "", ErrInvalidName
	}
	absoluteParent, err := filepath.Abs(parent)
	if err != nil {
		return "", ErrInvalidParent
	}
	info, err := os.Stat(absoluteParent)
	if err != nil || !info.IsDir() {
		return "", ErrInvalidParent
	}
	return filepath.Join(absoluteParent, name), nil
}

func Create(parent, name, password, confirmation string) (Opened, error) {
	name = strings.TrimSpace(name)
	if password == "" {
		return Opened{}, ErrInvalidPassword
	}
	if password != confirmation {
		return Opened{}, ErrPasswordMismatch
	}
	destination, err := Destination(parent, name)
	if err != nil {
		return Opened{}, err
	}
	if err = os.Mkdir(destination, workspaceDirMode); err != nil {
		if errors.Is(err, os.ErrExist) {
			return Opened{}, ErrDestinationExists
		}
		return Opened{}, err
	}
	cleanup := true
	defer func() {
		if cleanup {
			_ = os.RemoveAll(destination)
		}
	}()

	data := Data{Collections: []json.RawMessage{}, Requests: []json.RawMessage{}, Environments: []json.RawMessage{}, History: []json.RawMessage{}}
	encoded, err := encrypt(data, password)
	if err != nil {
		return Opened{}, err
	}
	path := filepath.Join(destination, fileName)
	file, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_EXCL, workspaceFileMode)
	if err != nil {
		return Opened{}, err
	}
	if _, err = file.Write(encoded); err != nil {
		_ = file.Close()
		return Opened{}, err
	}
	if err = file.Sync(); err != nil {
		_ = file.Close()
		return Opened{}, err
	}
	if err = file.Close(); err != nil {
		return Opened{}, err
	}
	cleanup = false
	return Opened{Path: destination, Name: name, Data: data}, nil
}

// Save replaces the encrypted workspace data without exposing plaintext on disk.
func Save(path, password string, data Data) error {
	if password == "" || data.Collections == nil || data.Requests == nil || data.Environments == nil || data.History == nil {
		return ErrInvalidWorkspace
	}
	if _, err := Open(path, password); err != nil {
		return err
	}
	encoded, err := encrypt(data, password)
	if err != nil {
		return err
	}
	return writeEncryptedWorkspace(path, encoded)
}

func ChangePassword(path, currentPassword, newPassword, confirmation string) (Opened, error) {
	if newPassword == "" {
		return Opened{}, ErrInvalidPassword
	}
	if newPassword != confirmation {
		return Opened{}, ErrPasswordMismatch
	}
	opened, err := Open(path, currentPassword)
	if err != nil {
		return Opened{}, err
	}
	encoded, err := encrypt(opened.Data, newPassword)
	if err != nil {
		return Opened{}, err
	}
	if err = writeEncryptedWorkspace(path, encoded); err != nil {
		return Opened{}, err
	}
	return opened, nil
}

func writeEncryptedWorkspace(path string, encoded []byte) error {
	temporary, err := os.CreateTemp(path, ".workspace-*")
	if err != nil {
		return err
	}
	temporaryPath := temporary.Name()
	defer os.Remove(temporaryPath)
	if err = temporary.Chmod(workspaceFileMode); err == nil {
		_, err = temporary.Write(encoded)
	}
	if err == nil {
		err = temporary.Sync()
	}
	if closeErr := temporary.Close(); err == nil {
		err = closeErr
	}
	if err != nil {
		return err
	}
	return os.Rename(temporaryPath, filepath.Join(path, fileName))
}

func AppendHistory(path, password string, entry json.RawMessage) error {
	if len(entry) == 0 || !json.Valid(entry) {
		return errors.New("history entry must be valid JSON")
	}
	opened, err := Open(path, password)
	if err != nil {
		return err
	}
	opened.Data.History = append(opened.Data.History, append(json.RawMessage(nil), entry...))
	if len(opened.Data.History) > MaximumHistoryEntries {
		opened.Data.History = opened.Data.History[len(opened.Data.History)-MaximumHistoryEntries:]
	}
	return Save(path, password, opened.Data)
}

func ReadHistory(path, password string) ([]json.RawMessage, error) {
	opened, err := Open(path, password)
	if err != nil {
		return nil, err
	}
	return opened.Data.History, nil
}

func RemoveHistoryEntry(path, password string, index int) error {
	opened, err := Open(path, password)
	if err != nil {
		return err
	}
	if index < 0 || index >= len(opened.Data.History) {
		return errors.New("history index is invalid")
	}
	opened.Data.History = append(opened.Data.History[:index], opened.Data.History[index+1:]...)
	return Save(path, password, opened.Data)
}

func ClearHistory(path, password string) error {
	opened, err := Open(path, password)
	if err != nil {
		return err
	}
	opened.Data.History = []json.RawMessage{}
	return Save(path, password, opened.Data)
}

func Open(path, password string) (Opened, error) {
	if password == "" {
		return Opened{}, ErrInvalidPassword
	}
	absolute, err := filepath.Abs(path)
	if err != nil {
		return Opened{}, ErrInvalidWorkspace
	}
	info, err := os.Stat(absolute)
	if err != nil || !info.IsDir() {
		return Opened{}, ErrInvalidWorkspace
	}
	file, err := os.Open(filepath.Join(absolute, fileName))
	if err != nil {
		return Opened{}, ErrInvalidWorkspace
	}
	defer file.Close()
	fileInfo, err := file.Stat()
	if err != nil || !fileInfo.Mode().IsRegular() || fileInfo.Size() <= 0 || fileInfo.Size() > maximumFileSize {
		return Opened{}, ErrInvalidWorkspace
	}
	limited := io.LimitReader(file, maximumFileSize)
	var metadata Metadata
	decoder := json.NewDecoder(limited)
	decoder.DisallowUnknownFields()
	if decoder.Decode(&metadata) != nil {
		return Opened{}, ErrInvalidWorkspace
	}
	var trailing any
	if err = decoder.Decode(&trailing); !errors.Is(err, io.EOF) {
		return Opened{}, ErrInvalidWorkspace
	}
	data, err := decrypt(metadata, password)
	if err != nil {
		return Opened{}, ErrInvalidWorkspace
	}
	return Opened{Path: absolute, Name: filepath.Base(absolute), Data: data}, nil
}

func validName(name string) bool {
	name = strings.TrimSpace(name)
	return len(name) > 0 && len(name) <= maximumNameLength && name != "." && name != ".." &&
		filepath.Base(name) == name && !strings.ContainsAny(name, "/\\\x00")
}

func encrypt(data Data, password string) ([]byte, error) {
	salt := make([]byte, saltSize)
	nonce := make([]byte, nonceSize)
	if _, err := rand.Read(salt); err != nil {
		return nil, err
	}
	if _, err := rand.Read(nonce); err != nil {
		return nil, err
	}
	key := deriveKey(password, salt, kdfIterations)
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	plaintext, err := json.Marshal(data)
	if err != nil {
		return nil, err
	}
	ciphertext := gcm.Seal(nil, nonce, plaintext, []byte(fmt.Sprintf("workspace:%d", formatVersion)))
	metadata := Metadata{
		Version: formatVersion, KDF: kdfName, Iterations: kdfIterations, Cipher: "aes-256-gcm",
		Salt: base64.StdEncoding.EncodeToString(salt), Nonce: base64.StdEncoding.EncodeToString(nonce),
		Ciphertext: base64.StdEncoding.EncodeToString(ciphertext),
	}
	return json.Marshal(metadata)
}

func decrypt(metadata Metadata, password string) (Data, error) {
	if !validMetadata(metadata) {
		return Data{}, ErrInvalidWorkspace
	}
	salt, saltOK := decodeField(metadata.Salt, saltSize)
	nonce, nonceOK := decodeField(metadata.Nonce, nonceSize)
	ciphertext, cipherOK := decodeField(metadata.Ciphertext, minimumCipherSize)
	if !saltOK || !nonceOK || !cipherOK {
		return Data{}, ErrInvalidWorkspace
	}
	block, err := aes.NewCipher(deriveKey(password, salt, metadata.Iterations))
	if err != nil {
		return Data{}, ErrInvalidWorkspace
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return Data{}, ErrInvalidWorkspace
	}
	plaintext, err := gcm.Open(nil, nonce, ciphertext, []byte(fmt.Sprintf("workspace:%d", metadata.Version)))
	if err != nil {
		return Data{}, ErrInvalidWorkspace
	}
	var data Data
	if err = json.Unmarshal(plaintext, &data); err != nil || data.Collections == nil || data.Requests == nil || data.Environments == nil {
		return Data{}, ErrInvalidWorkspace
	}
	if data.History == nil {
		data.History = []json.RawMessage{}
	}
	return data, nil
}

func validMetadata(metadata Metadata) bool {
	return metadata.Version == formatVersion && metadata.KDF == kdfName &&
		metadata.Iterations == kdfIterations && metadata.Cipher == "aes-256-gcm"
}

func decodeField(encoded string, minimumSize int) ([]byte, bool) {
	decoded, err := base64.StdEncoding.DecodeString(encoded)
	return decoded, err == nil && len(decoded) >= minimumSize
}

func deriveKey(password string, salt []byte, iterations int) []byte {
	blockInput := append(append([]byte(nil), salt...), 0, 0, 0, 1)
	mac := hmac.New(sha256.New, []byte(password))
	_, _ = mac.Write(blockInput)
	previous := mac.Sum(nil)
	result := append([]byte(nil), previous...)
	for round := 1; round < iterations; round++ {
		mac.Reset()
		_, _ = mac.Write(previous)
		previous = mac.Sum(nil)
		for index := range result {
			result[index] ^= previous[index]
		}
	}
	return result[:keySize]
}
