package main

import (
	"embed"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"log"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/events"
	"tomorrow/internal/requests"
	"tomorrow/internal/scripts"
	"tomorrow/internal/workspace"
)

//go:embed frontend/dist
var frontendAssets embed.FS

const (
	titlebarIconSize          = 16
	smallApplicationIconSize  = 32
	mediumApplicationIconSize = 48
	largeApplicationIconSize  = 128
	applicationIconSize       = 256
	linuxApplicationID        = "org.tomorrow.Tomorrow"
	linuxIconThemeName        = "tomorrow"
)

//go:embed icons/tomorrow-16.png
var titlebarIcon []byte

//go:embed icons/tomorrow-32.png
var smallApplicationIcon []byte

//go:embed icons/tomorrow-48.png
var mediumApplicationIcon []byte

//go:embed icons/tomorrow-128.png
var largeApplicationIcon []byte

//go:embed icons/tomorrow-256.png
var applicationIcon []byte

type WorkspaceService struct {
	app      *application.App
	mu       sync.Mutex
	opened   workspace.Opened
	password string
}

type RequestNode struct {
	ID                 string            `json:"id"`
	Name               string            `json:"name"`
	Kind               string            `json:"kind"`
	Method             string            `json:"method,omitempty"`
	URL                string            `json:"url,omitempty"`
	Headers            map[string]string `json:"headers,omitempty"`
	Query              map[string]string `json:"query,omitempty"`
	HeaderRows         []KeyValueRow     `json:"headerRows,omitempty"`
	QueryRows          []KeyValueRow     `json:"queryRows,omitempty"`
	AuthCredentials    []KeyValueRow     `json:"authCredentials,omitempty"`
	AuthType           string            `json:"authType,omitempty"`
	AuthToken          string            `json:"authToken,omitempty"`
	AuthUsername       string            `json:"authUsername,omitempty"`
	AuthPassword       string            `json:"authPassword,omitempty"`
	BodyType           string            `json:"bodyType,omitempty"`
	PreRequestScript   string            `json:"preRequestScript,omitempty"`
	PostResponseScript string            `json:"postResponseScript,omitempty"`
	TestScript         string            `json:"testScript,omitempty"`
	Body               string            `json:"body,omitempty"`
	FilePath           string            `json:"filePath,omitempty"`
	Children           []RequestNode     `json:"children,omitempty"`
}

type KeyValueRow struct {
	ID      string `json:"id"`
	Key     string `json:"key"`
	Value   string `json:"value"`
	Enabled bool   `json:"enabled"`
}

type Environment struct {
	ID         string            `json:"id"`
	Name       string            `json:"name"`
	Values     map[string]string `json:"values"`
	SecretKeys []string          `json:"secretKeys,omitempty"`
}

type RequestHistory struct {
	Name      string `json:"name"`
	Method    string `json:"method"`
	URL       string `json:"url"`
	Status    int    `json:"status"`
	Timestamp string `json:"timestamp"`
	Error     string `json:"error,omitempty"`
}

type WorkspaceInfo struct {
	Path string `json:"path"`
	Name string `json:"name"`
}

func (s *WorkspaceService) SelectFolder() (string, error) {
	path, err := s.app.Dialog.OpenFile().
		SetTitle("Choose workspace folder").
		CanChooseDirectories(true).
		CanChooseFiles(false).
		PromptForSingleSelection()
	if err != nil {
		return "", nil
	}
	return path, nil
}

func (s *WorkspaceService) SelectFile() (string, error) {
	path, err := s.app.Dialog.OpenFile().
		SetTitle("Choose request file").
		CanChooseDirectories(false).
		CanChooseFiles(true).
		PromptForSingleSelection()
	if err != nil {
		return "", nil
	}
	return path, nil
}

func (s *WorkspaceService) SelectFiles() ([]string, error) {
	paths, err := s.app.Dialog.OpenFile().
		SetTitle("Choose request files").
		CanChooseDirectories(false).
		CanChooseFiles(true).
		PromptForMultipleSelection()
	if err != nil {
		return []string{}, nil
	}
	return paths, nil
}

func (s *WorkspaceService) SavePostmanExport(filename, contents string) error {
	path, err := s.app.Dialog.SaveFileWithOptions(&application.SaveFileDialogOptions{
		Title:    "Export Postman JSON",
		Filename: filepath.Base(filename),
	}).
		AddFilter("JSON files", "*.json").
		PromptForSingleSelection()
	if err != nil || path == "" {
		return err
	}
	return writePostmanExport(path, contents)
}

func writePostmanExport(path, contents string) error {
	return os.WriteFile(path, []byte(contents), 0o600)
}

func (s *WorkspaceService) CreateWorkspace(parent, name, password, confirmation string) (WorkspaceInfo, error) {
	opened, err := workspace.Create(parent, name, password, confirmation)
	if err == nil {
		s.setWorkspace(opened, password)
	}
	return WorkspaceInfo{Path: opened.Path, Name: opened.Name}, err
}

func (s *WorkspaceService) OpenWorkspace(path, password string) (WorkspaceInfo, error) {
	opened, err := workspace.Open(path, password)
	if err == nil {
		s.setWorkspace(opened, password)
	}
	return WorkspaceInfo{Path: opened.Path, Name: opened.Name}, err
}

func (s *WorkspaceService) ChangePassword(currentPassword, newPassword, confirmation string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	opened, err := workspace.ChangePassword(s.opened.Path, currentPassword, newPassword, confirmation)
	if err != nil {
		return err
	}
	s.opened = opened
	s.password = newPassword
	return nil
}

func (s *WorkspaceService) setWorkspace(opened workspace.Opened, password string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.opened, s.password = opened, password
}

func (s *WorkspaceService) Collections() ([]RequestNode, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	var collections []RequestNode
	for _, item := range s.opened.Data.Collections {
		var collection RequestNode
		if err := json.Unmarshal(item, &collection); err != nil {
			return nil, err
		}
		collections = append(collections, collection)
	}
	if collections == nil {
		collections = []RequestNode{}
	}
	return collections, nil
}

func (s *WorkspaceService) RequestHistory() ([]RequestHistory, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	entries := make([]RequestHistory, 0, len(s.opened.Data.History))
	for _, raw := range s.opened.Data.History {
		var item RequestHistory
		if err := json.Unmarshal(raw, &item); err != nil {
			return nil, err
		}
		entries = append(entries, item)
	}
	for left, right := 0, len(entries)-1; left < right; left, right = left+1, right-1 {
		entries[left], entries[right] = entries[right], entries[left]
	}
	return entries, nil
}

func (s *WorkspaceService) RemoveHistoryEntry(index int) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if index < 0 || index >= len(s.opened.Data.History) {
		return errors.New("history index is invalid")
	}
	storageIndex := len(s.opened.Data.History) - 1 - index
	if err := workspace.RemoveHistoryEntry(s.opened.Path, s.password, storageIndex); err != nil {
		return err
	}
	s.opened.Data.History = append(s.opened.Data.History[:storageIndex], s.opened.Data.History[storageIndex+1:]...)
	return nil
}

func (s *WorkspaceService) ClearHistory() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := workspace.ClearHistory(s.opened.Path, s.password); err != nil {
		return err
	}
	s.opened.Data.History = []json.RawMessage{}
	return nil
}

func (s *WorkspaceService) SaveCollections(collections []RequestNode) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	encoded := make([]json.RawMessage, 0, len(collections))
	for _, collection := range collections {
		data, err := json.Marshal(collection)
		if err != nil {
			return err
		}
		encoded = append(encoded, data)
	}
	s.opened.Data.Collections = encoded
	if err := workspace.Save(s.opened.Path, s.password, s.opened.Data); err != nil {
		return err
	}
	return nil
}

func (s *WorkspaceService) Environments() ([]Environment, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	environments := make([]Environment, 0, len(s.opened.Data.Environments))
	for _, item := range s.opened.Data.Environments {
		var environment Environment
		if err := json.Unmarshal(item, &environment); err != nil {
			return nil, err
		}
		environments = append(environments, environment)
	}
	return environments, nil
}

func (s *WorkspaceService) SaveEnvironments(environments []Environment) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	encoded := make([]json.RawMessage, 0, len(environments))
	for _, environment := range environments {
		data, err := json.Marshal(environment)
		if err != nil {
			return err
		}
		encoded = append(encoded, data)
	}
	s.opened.Data.Environments = encoded
	return workspace.Save(s.opened.Path, s.password, s.opened.Data)
}

func (s *WorkspaceService) SendRequest(input requests.Request) (requests.Response, error) {
	result := requests.Response{}
	requestContext := requestMap(input)
	scriptEnvironment := cloneStringMap(input.Environment)
	if input.PreRequestScript != "" {
		executed, err := scripts.Execute(input.PreRequestScript, scripts.Context{Request: requestContext, Environment: toAnyMap(input.Environment)})
		result.ScriptResults = append(result.ScriptResults, requests.ScriptResult{Name: "Pre-request", Passed: err == nil, Error: scriptError(err)})
		if err != nil {
			return result, err
		}
		applyRequestMap(&input, executed.Request)
	}
	if input.AuthType == "bearer" {
		input.Headers = cloneHeaders(input.Headers)
		input.BearerToken = input.AuthToken
	}
	if input.AuthType == "basic" {
		input.Username, input.Password = input.AuthUsername, input.AuthPassword
	}
	if input.BodyType == "Multipart" && input.FilePath != "" {
		input.FilePaths = []string{input.FilePath}
	}
	response, err := requests.Send(input)
	if err != nil {
		if recordErr := s.recordHistory(input, requests.Response{}, err); recordErr != nil {
			return result, recordErr
		}
		return result, err
	}
	if err = s.recordHistory(input, response, nil); err != nil {
		return response, err
	}
	if input.PostResponseScript != "" {
		executed, scriptErr := scripts.Execute(input.PostResponseScript, scripts.Context{Request: requestMap(input), Response: responseMap(response), Environment: toAnyMap(scriptEnvironment), MutableEnvironment: true})
		response.ScriptResults = append(response.ScriptResults, requests.ScriptResult{Name: "Post-response", Passed: scriptErr == nil, Error: scriptError(scriptErr)})
		if scriptErr == nil {
			scriptEnvironment = toEnvironmentStringMap(executed.Environment)
			response.Environment = cloneStringMap(scriptEnvironment)
		}
	}
	if input.TestScript != "" {
		_, scriptErr := scripts.Execute(input.TestScript, scripts.Context{Request: requestMap(input), Response: responseMap(response), Environment: toAnyMap(scriptEnvironment)})
		response.ScriptResults = append(response.ScriptResults, requests.ScriptResult{Name: "Tests", Passed: scriptErr == nil, Error: scriptError(scriptErr)})
	}
	response.ScriptResults = append(response.ScriptResults, result.ScriptResults...)
	return response, nil
}

func (s *WorkspaceService) recordHistory(input requests.Request, response requests.Response, requestErr error) error {
	entry := RequestHistory{Name: input.Name, Method: input.Method, URL: input.URL, Status: response.StatusCode, Timestamp: time.Now().UTC().Format(time.RFC3339)}
	if requestErr != nil {
		entry.Error = requestErr.Error()
	}
	encoded, err := json.Marshal(entry)
	if err != nil {
		return err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if err = workspace.AppendHistory(s.opened.Path, s.password, encoded); err != nil {
		return err
	}
	s.opened.Data.History = append(s.opened.Data.History, encoded)
	if len(s.opened.Data.History) > workspace.MaximumHistoryEntries {
		s.opened.Data.History = s.opened.Data.History[len(s.opened.Data.History)-workspace.MaximumHistoryEntries:]
	}
	return nil
}

func scriptError(err error) string {
	if err == nil {
		return ""
	}
	return err.Error()
}

func requestMap(input requests.Request) map[string]any {
	headers := input.Headers
	if headers == nil {
		headers = map[string]string{}
	}
	query := input.Query
	if query == nil {
		query = map[string]string{}
	}
	return map[string]any{"method": input.Method, "url": input.URL, "headers": headers, "query": query, "body": input.Body, "bodyType": input.BodyType, "filePath": input.FilePath, "authType": input.AuthType, "authToken": input.AuthToken, "authUsername": input.AuthUsername, "authPassword": input.AuthPassword}
}

func responseMap(input requests.Response) map[string]any {
	return map[string]any{"status": input.StatusCode, "statusText": input.Status, "headers": input.Headers, "body": input.Body, "durationMs": input.DurationMs}
}

func applyRequestMap(input *requests.Request, values map[string]any) {
	if method, ok := values["method"].(string); ok {
		input.Method = method
	}
	if target, ok := values["url"].(string); ok {
		input.URL = target
	}
	if body, ok := values["body"].(string); ok {
		input.Body = body
	}
	if headers, ok := values["headers"].(map[string]interface{}); ok {
		input.Headers = toStringMap(headers)
	}
	if query, ok := values["query"].(map[string]interface{}); ok {
		input.Query = toStringMap(query)
	}
	if bodyType, ok := values["bodyType"].(string); ok {
		input.BodyType = bodyType
	}
	if filePath, ok := values["filePath"].(string); ok {
		input.FilePath = filePath
	}
	if authType, ok := values["authType"].(string); ok {
		input.AuthType = authType
	}
	if token, ok := values["authToken"].(string); ok {
		input.AuthToken = token
	}
	if username, ok := values["authUsername"].(string); ok {
		input.AuthUsername = username
	}
	if password, ok := values["authPassword"].(string); ok {
		input.AuthPassword = password
	}
}

func toStringMap(values map[string]interface{}) map[string]string {
	result := make(map[string]string, len(values))
	for key, value := range values {
		if text, ok := value.(string); ok {
			result[key] = text
		}
	}
	return result
}

func toEnvironmentStringMap(values map[string]interface{}) map[string]string {
	result := make(map[string]string, len(values))
	for key, value := range values {
		switch typed := value.(type) {
		case string:
			result[key] = typed
		case int, int8, int16, int32, int64, uint, uint8, uint16, uint32, uint64, float32, float64, bool:
			result[key] = fmt.Sprint(typed)
		}
	}
	return result
}

func cloneStringMap(values map[string]string) map[string]string {
	cloned := make(map[string]string, len(values))
	for key, value := range values {
		cloned[key] = value
	}
	return cloned
}

func toAnyMap(values map[string]string) map[string]any {
	result := make(map[string]any, len(values))
	for key, value := range values {
		result[key] = value
	}
	return result
}

func cloneHeaders(headers map[string]string) map[string]string {
	copy := make(map[string]string, len(headers)+1)
	for key, value := range headers {
		copy[key] = value
	}
	return copy
}

func main() {
	assets, err := fs.Sub(frontendAssets, "frontend/dist")
	if err != nil {
		log.Fatal(err)
	}
	app := application.New(application.Options{
		Name:        "Tomorrow",
		Description: "Offline-first HTTP API client",
		Icon:        applicationIcon,
		Linux:       application.LinuxOptions{ApplicationID: linuxApplicationID},
		Assets: application.AssetOptions{
			Handler: application.AssetFileServerFS(assets),
		},
	})
	app.RegisterService(application.NewService(&WorkspaceService{app: app}))
	window := app.Window.NewWithOptions(application.WebviewWindowOptions{
		Title: "Tomorrow", Width: 1280, Height: 800, MinWidth: 960, MinHeight: 640,
		Linux: application.LinuxWindow{Icon: titlebarIcon},
	})
	window.OnWindowEvent(events.Linux.WindowLoadFinished, func(_ *application.WindowEvent) {
		setLinuxWindowIcon(window)
	})
	window.Center()
	window.Show()
	if err := app.Run(); err != nil {
		log.Fatal(err)
	}
}
