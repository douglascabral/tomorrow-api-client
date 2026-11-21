package workspace

import (
	"encoding/hex"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"testing"
)

const testWorkspacePassword = "secret"

func createTestWorkspace(t *testing.T, name string) Opened {
	t.Helper()
	created, err := Create(t.TempDir(), name, testWorkspacePassword, testWorkspacePassword)
	if err != nil {
		t.Fatal(err)
	}
	return created
}

func TestCreateAndOpenWorkspace(t *testing.T) {
	parent := t.TempDir()
	created, err := Create(parent, "Personal", "correct horse", "correct horse")
	if err != nil {
		t.Fatalf("Create() error = %v", err)
	}
	if created.Path != filepath.Join(parent, "Personal") {
		t.Fatalf("created path = %q", created.Path)
	}
	opened, err := Open(created.Path, "correct horse")
	if err != nil {
		t.Fatalf("Open() error = %v", err)
	}
	if opened.Name != "Personal" || opened.Data.Collections == nil {
		t.Fatalf("unexpected opened workspace: %#v", opened)
	}
	contents, err := os.ReadFile(filepath.Join(created.Path, fileName))
	if err != nil {
		t.Fatal(err)
	}
	if string(contents) == `{"collections":[],"requests":[],"environments":[]}` {
		t.Fatal("workspace data was stored as plaintext")
	}
}

func TestSavePersistsEncryptedWorkspaceChanges(t *testing.T) {
	created := createTestWorkspace(t, "Personal")
	created.Data.Collections = []json.RawMessage{json.RawMessage(`{"name":"API"}`)}
	created.Data.History = []json.RawMessage{json.RawMessage(`{"status":200}`)}
	if err := Save(created.Path, testWorkspacePassword, created.Data); err != nil {
		t.Fatal(err)
	}
	opened, err := Open(created.Path, testWorkspacePassword)
	if err != nil {
		t.Fatal(err)
	}
	if len(opened.Data.Collections) != 1 || len(opened.Data.History) != 1 {
		t.Fatalf("saved data missing: %#v", opened.Data)
	}
	if _, err := Open(created.Path, "wrong"); !errors.Is(err, ErrInvalidWorkspace) {
		t.Fatalf("wrong password error = %v", err)
	}
}

func TestAppendHistoryPersistsNewestEntries(t *testing.T) {
	created := createTestWorkspace(t, "History")
	if err := AppendHistory(created.Path, testWorkspacePassword, json.RawMessage(`{"status":200}`)); err != nil {
		t.Fatal(err)
	}
	entries, err := ReadHistory(created.Path, testWorkspacePassword)
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 1 || string(entries[0]) != `{"status":200}` {
		t.Fatalf("history entries = %s", entries)
	}
	if err := AppendHistory(created.Path, testWorkspacePassword, json.RawMessage(`not-json`)); err == nil {
		t.Fatal("expected invalid history entry rejection")
	}
}

func TestRemoveHistoryEntryPersistsRemoval(t *testing.T) {
	created := createTestWorkspace(t, "History removal")
	entries := []json.RawMessage{json.RawMessage(`{"name":"first"}`), json.RawMessage(`{"name":"second"}`)}
	if err := Save(created.Path, testWorkspacePassword, Data{Collections: []json.RawMessage{}, Requests: []json.RawMessage{}, Environments: []json.RawMessage{}, History: entries}); err != nil {
		t.Fatal(err)
	}
	if err := RemoveHistoryEntry(created.Path, testWorkspacePassword, 0); err != nil {
		t.Fatal(err)
	}
	remaining, err := ReadHistory(created.Path, testWorkspacePassword)
	if err != nil {
		t.Fatal(err)
	}
	if len(remaining) != 1 || string(remaining[0]) != `{"name":"second"}` {
		t.Fatalf("remaining history = %s", remaining)
	}
}

func TestRemoveHistoryEntryRejectsInvalidIndex(t *testing.T) {
	created := createTestWorkspace(t, "Invalid history index")
	if err := RemoveHistoryEntry(created.Path, testWorkspacePassword, 0); err == nil {
		t.Fatal("expected invalid history index rejection")
	}
}

func TestClearHistoryPersistsEmptyHistory(t *testing.T) {
	created := createTestWorkspace(t, "Clear history")
	if err := AppendHistory(created.Path, testWorkspacePassword, json.RawMessage(`{"name":"first"}`)); err != nil {
		t.Fatal(err)
	}
	if err := ClearHistory(created.Path, testWorkspacePassword); err != nil {
		t.Fatal(err)
	}
	remaining, err := ReadHistory(created.Path, testWorkspacePassword)
	if err != nil {
		t.Fatal(err)
	}
	if len(remaining) != 0 {
		t.Fatalf("history after clear = %s", remaining)
	}
}

func TestCreateRejectsMismatchedPasswordAndExistingDestination(t *testing.T) {
	parent := t.TempDir()
	if _, err := Create(parent, "Personal", "first", "second"); !errors.Is(err, ErrPasswordMismatch) {
		t.Fatalf("mismatch error = %v", err)
	}
	created, err := Create(parent, "Personal", "secret", "secret")
	if err != nil {
		t.Fatal(err)
	}
	if _, err = Create(parent, "Personal", "secret", "secret"); !errors.Is(err, ErrDestinationExists) {
		t.Fatalf("conflict error = %v", err)
	}
	if _, err = os.Stat(filepath.Join(created.Path, fileName)); err != nil {
		t.Fatalf("existing workspace was changed: %v", err)
	}
}

func TestCreateRejectsInvalidNameAndParent(t *testing.T) {
	parent := t.TempDir()
	for _, name := range []string{"", "..", "../outside", "a/b"} {
		if _, err := Create(parent, name, "secret", "secret"); !errors.Is(err, ErrInvalidName) {
			t.Errorf("Create(%q) error = %v", name, err)
		}
	}
	if _, err := Create(filepath.Join(parent, "missing"), "Personal", "secret", "secret"); !errors.Is(err, ErrInvalidParent) {
		t.Fatalf("invalid parent error = %v", err)
	}
}

func TestOpenRejectsWrongPasswordAndInvalidData(t *testing.T) {
	parent := t.TempDir()
	created, err := Create(parent, "Personal", "secret", "secret")
	if err != nil {
		t.Fatal(err)
	}
	if _, err = Open(created.Path, "wrong"); !errors.Is(err, ErrInvalidWorkspace) {
		t.Fatalf("wrong password error = %v", err)
	}
	path := filepath.Join(created.Path, fileName)
	if err = os.WriteFile(path, []byte("not a workspace"), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err = Open(created.Path, "secret"); !errors.Is(err, ErrInvalidWorkspace) {
		t.Fatalf("invalid file error = %v", err)
	}
}

func TestOpenRejectsUnsupportedVersion(t *testing.T) {
	metadata := Metadata{Version: formatVersion + 1, KDF: kdfName, Iterations: kdfIterations, Cipher: "aes-256-gcm"}
	if _, err := decrypt(metadata, "secret"); !errors.Is(err, ErrInvalidWorkspace) {
		t.Fatalf("unsupported version error = %v", err)
	}
}

func TestDeriveKeyMatchesPBKDF2SHA256(t *testing.T) {
	key := deriveKey("password", []byte("salt"), 1)
	const expected = "120fb6cffcf8b32c43e7225256c4f837a86548c92ccc35480805987cb70be17b"
	if hex.EncodeToString(key) != expected {
		t.Fatalf("derived key = %x, want %s", key, expected)
	}
}
