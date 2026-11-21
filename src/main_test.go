package main

import (
	"bytes"
	"encoding/json"
	"image"
	"net/http"
	"net/http/httptest"
	"os"
	"reflect"
	"strings"
	"testing"

	"tomorrow/internal/requests"
	"tomorrow/internal/workspace"
)

func newWorkspaceService(t *testing.T, name string) (*WorkspaceService, string) {
	t.Helper()
	created, err := workspace.Create(t.TempDir(), name, "secret", "secret")
	if err != nil {
		t.Fatal(err)
	}
	opened, err := workspace.Open(created.Path, "secret")
	if err != nil {
		t.Fatal(err)
	}
	return &WorkspaceService{opened: opened, password: "secret"}, created.Path
}

func TestWritePostmanExportCreatesFile(t *testing.T) {
	path := t.TempDir() + "/collection.postman_collection.json"
	contents := `{"info":{"name":"Example"},"item":[]}`
	if err := writePostmanExport(path, contents); err != nil {
		t.Fatal(err)
	}
	got, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if string(got) != contents {
		t.Fatalf("export contents = %q, want %q", got, contents)
	}
}

func TestApplicationIconsUseDedicatedSizes(t *testing.T) {
	icons := []struct {
		name string
		data []byte
		size int
	}{
		{name: "titlebar", data: titlebarIcon, size: titlebarIconSize},
		{name: "small", data: smallApplicationIcon, size: smallApplicationIconSize},
		{name: "medium", data: mediumApplicationIcon, size: mediumApplicationIconSize},
		{name: "large", data: largeApplicationIcon, size: largeApplicationIconSize},
		{name: "application", data: applicationIcon, size: applicationIconSize},
	}
	for _, icon := range icons {
		config, _, err := image.DecodeConfig(bytes.NewReader(icon.data))
		if err != nil || config.Width != icon.size || config.Height != icon.size {
			t.Errorf("%s icon size = %dx%d, error = %v; want %dx%d", icon.name, config.Width, config.Height, err, icon.size, icon.size)
		}
	}
}

func TestLinuxDesktopEntryMapsApplicationToTomorrowIcon(t *testing.T) {
	data, err := os.ReadFile("linux/org.tomorrow.Tomorrow.desktop")
	if err != nil {
		t.Fatal(err)
	}
	entry := string(data)
	for _, expected := range []string{"Icon=" + linuxIconThemeName, "StartupWMClass=" + linuxApplicationID} {
		if !strings.Contains(entry, expected) {
			t.Errorf("desktop entry is missing %q", expected)
		}
	}
}

func TestCollectionsPersistEditableHeaderAndQueryRows(t *testing.T) {
	service, _ := newWorkspaceService(t, "Key-value rows")
	request := RequestNode{
		ID: "request", Name: "List", Kind: "request",
		HeaderRows:      []KeyValueRow{{ID: "header-1", Key: "Accept", Value: "application/json", Enabled: true}},
		QueryRows:       []KeyValueRow{{ID: "query-1", Key: "page", Value: "2", Enabled: false}},
		AuthCredentials: []KeyValueRow{{ID: "credential-1", Key: "X-Token", Value: "secret", Enabled: true}},
	}
	if err := service.SaveCollections([]RequestNode{{ID: "collection", Name: "API", Kind: "collection", Children: []RequestNode{request}}}); err != nil {
		t.Fatal(err)
	}
	collections, err := service.Collections()
	if err != nil {
		t.Fatal(err)
	}
	storedRequest := collections[0].Children[0]
	if !reflect.DeepEqual(storedRequest.HeaderRows, request.HeaderRows) || !reflect.DeepEqual(storedRequest.QueryRows, request.QueryRows) || !reflect.DeepEqual(storedRequest.AuthCredentials, request.AuthCredentials) {
		t.Fatalf("rows = %#v", storedRequest)
	}
}

func TestWorkspaceServicePersistsEnvironments(t *testing.T) {
	service, _ := newWorkspaceService(t, "Environments")
	expected := []Environment{{ID: "development", Name: "Development", Values: map[string]string{"baseUrl": "https://local.test"}}}
	if err := service.SaveEnvironments(expected); err != nil {
		t.Fatal(err)
	}
	actual, err := service.Environments()
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(actual, expected) {
		t.Fatalf("environments = %#v, want %#v", actual, expected)
	}
}

func TestWorkspaceServiceChangesPasswordAndPreservesWorkspaceData(t *testing.T) {
	service, path := newWorkspaceService(t, "Password change")
	if err := service.SaveCollections([]RequestNode{{ID: "collection", Name: "API", Kind: "collection"}}); err != nil {
		t.Fatal(err)
	}
	if err := service.ChangePassword("secret", "new secret", "new secret"); err != nil {
		t.Fatalf("change password: %v", err)
	}
	if _, err := workspace.Open(path, "new secret"); err != nil {
		t.Fatalf("open with new password: %v", err)
	}
	if _, err := workspace.Open(path, "secret"); err == nil {
		t.Fatal("old password still opens workspace")
	}
	collections, err := service.Collections()
	if err != nil || len(collections) != 1 || collections[0].ID != "collection" {
		t.Fatalf("collections after password change = %#v, error = %v", collections, err)
	}
}

func TestWorkspaceServiceRunsScriptsAndRecordsHistory(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		if request.URL.Path != "/scripted" {
			t.Errorf("path = %q", request.URL.Path)
		}
		writer.WriteHeader(http.StatusCreated)
		_, _ = writer.Write([]byte(`{"ok":true,"userId":"ada"}`))
	}))
	defer server.Close()
	service, path := newWorkspaceService(t, "Scripts")
	result, err := service.SendRequest(requests.Request{
		Name: "Scripted", Method: http.MethodGet, URL: "http://invalid.local",
		Environment:        map[string]string{"baseUrl": server.URL},
		PreRequestScript:   `request.url = environment.baseUrl + "/scripted"`,
		PostResponseScript: `if (response.status !== 201) throw new Error("unexpected status"); environment.userId = JSON.parse(response.body).userId; environment.foo = 100`,
		TestScript:         `if (response.body !== "{\"ok\":true,\"userId\":\"ada\"}" || environment.userId !== "ada" || environment.foo !== "100") throw new Error("unexpected response or environment")`,
	})
	if err != nil {
		t.Fatal(err)
	}
	if result.StatusCode != http.StatusCreated || len(result.ScriptResults) != 3 {
		t.Fatalf("response = %#v", result)
	}
	if result.Environment["userId"] != "ada" {
		t.Fatalf("environment = %#v, want userId ada", result.Environment)
	}
	if result.Environment["foo"] != "100" {
		t.Fatalf("environment foo = %q, want 100", result.Environment["foo"])
	}
	for _, item := range result.ScriptResults {
		if !item.Passed {
			t.Errorf("script %s failed: %s", item.Name, item.Error)
		}
	}
	history, err := workspace.ReadHistory(path, "secret")
	if err != nil {
		t.Fatal(err)
	}
	if len(history) != 1 {
		t.Fatalf("history length = %d", len(history))
	}
}

func TestWorkspaceServiceShowsNewestHistoryFirstAndPersistsCleanup(t *testing.T) {
	service, path := newWorkspaceService(t, "History actions")
	service.opened.Data.History = []json.RawMessage{
		json.RawMessage(`{"name":"Older","method":"GET","url":"https://api.test/old","timestamp":"2026-01-01T00:00:00Z"}`),
		json.RawMessage(`{"name":"Newer","method":"POST","url":"https://api.test/new","timestamp":"2026-01-02T00:00:00Z"}`),
	}
	if err := workspace.Save(path, service.password, service.opened.Data); err != nil {
		t.Fatal(err)
	}

	history, err := service.RequestHistory()
	if err != nil || len(history) != 2 || history[0].Name != "Newer" {
		t.Fatalf("history = %#v, error = %v", history, err)
	}
	if err = service.RemoveHistoryEntry(0); err != nil {
		t.Fatal(err)
	}
	history, err = service.RequestHistory()
	if err != nil || len(history) != 1 || history[0].Name != "Older" {
		t.Fatalf("history after removal = %#v, error = %v", history, err)
	}
	if err = service.ClearHistory(); err != nil {
		t.Fatal(err)
	}
	persisted, err := workspace.ReadHistory(path, service.password)
	if err != nil || len(persisted) != 0 {
		t.Fatalf("persisted history after clear = %#v, error = %v", persisted, err)
	}
}

func TestWorkspaceServiceKeepsHTTPResponseWhenScriptFails(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, _ *http.Request) { writer.WriteHeader(http.StatusNoContent) }))
	defer server.Close()
	service, _ := newWorkspaceService(t, "Script failure")
	result, err := service.SendRequest(requests.Request{Method: http.MethodGet, URL: server.URL, TestScript: `throw new Error("test failed")`})
	if err != nil {
		t.Fatal(err)
	}
	if result.StatusCode != http.StatusNoContent || len(result.ScriptResults) != 1 || result.ScriptResults[0].Passed {
		t.Fatalf("response = %#v", result)
	}
}
