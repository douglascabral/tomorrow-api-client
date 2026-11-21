package requests

import (
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func newTestServer(t *testing.T, handler http.HandlerFunc) string {
	t.Helper()
	server := httptest.NewServer(handler)
	t.Cleanup(server.Close)
	return server.URL
}

func TestSendReturnsResponseAndRequestData(t *testing.T) {
	serverURL := newTestServer(t, func(writer http.ResponseWriter, request *http.Request) {
		if request.Method != http.MethodPost || request.Header.Get("X-Test") != "yes" {
			t.Errorf("unexpected request: %s %#v", request.Method, request.Header)
		}
		writer.WriteHeader(http.StatusCreated)
		_, _ = writer.Write([]byte(`{"ok":true}`))
	})
	response, err := Send(Request{Method: http.MethodPost, URL: serverURL, Headers: map[string]string{"X-Test": "yes"}})
	if err != nil {
		t.Fatal(err)
	}
	if response.StatusCode != http.StatusCreated || response.Body != `{"ok":true}` || response.DurationMs < 0 {
		t.Fatalf("unexpected response: %#v", response)
	}
}

func TestSendEncodesURLFormBody(t *testing.T) {
	serverURL := newTestServer(t, func(writer http.ResponseWriter, request *http.Request) {
		if request.Header.Get("Content-Type") != "application/x-www-form-urlencoded" {
			t.Errorf("content type = %q", request.Header.Get("Content-Type"))
		}
		_ = request.ParseForm()
		if request.Form.Get("name") != "Ada Lovelace" {
			t.Errorf("form = %#v", request.Form)
		}
		writer.WriteHeader(http.StatusNoContent)
	})
	_, err := Send(Request{Method: http.MethodPost, URL: serverURL, BodyType: "Form URL-encoded", Body: "name=Ada Lovelace"})
	if err != nil {
		t.Fatal(err)
	}
}

func TestSendStreamsBinaryFileBody(t *testing.T) {
	file, err := os.CreateTemp(t.TempDir(), "upload")
	if err != nil {
		t.Fatal(err)
	}
	if _, err = file.WriteString("binary payload"); err != nil {
		t.Fatal(err)
	}
	if err = file.Close(); err != nil {
		t.Fatal(err)
	}
	serverURL := newTestServer(t, func(writer http.ResponseWriter, request *http.Request) {
		body, readErr := io.ReadAll(request.Body)
		if readErr != nil {
			t.Error(readErr)
		}
		if string(body) != "binary payload" {
			t.Errorf("body = %q", body)
		}
		if request.Header.Get("Content-Type") != "application/octet-stream" {
			t.Errorf("content type = %q", request.Header.Get("Content-Type"))
		}
		writer.WriteHeader(http.StatusNoContent)
	})
	_, err = Send(Request{Method: http.MethodPut, URL: serverURL, BodyType: "Binary file", FilePath: file.Name()})
	if err != nil {
		t.Fatal(err)
	}
}

func TestSendEncodesMultipartTextFields(t *testing.T) {
	serverURL := newTestServer(t, func(writer http.ResponseWriter, request *http.Request) {
		if err := request.ParseMultipartForm(1024); err != nil {
			t.Error(err)
		}
		if request.FormValue("name") != "Ada" {
			t.Errorf("field = %q", request.FormValue("name"))
		}
		writer.WriteHeader(http.StatusNoContent)
	})
	_, err := Send(Request{Method: http.MethodPost, URL: serverURL, BodyType: "Multipart", Body: `{"name":"Ada"}`})
	if err != nil {
		t.Fatal(err)
	}
}

func TestSendEncodesNamedMultipartFileFields(t *testing.T) {
	path := filepath.Join(t.TempDir(), "avatar.png")
	secondPath := filepath.Join(t.TempDir(), "avatar-small.png")
	for filePath, contents := range map[string]string{path: "image payload", secondPath: "small image"} {
		if err := os.WriteFile(filePath, []byte(contents), 0600); err != nil {
			t.Fatal(err)
		}
	}
	serverURL := newTestServer(t, func(writer http.ResponseWriter, request *http.Request) {
		if err := request.ParseMultipartForm(1024); err != nil {
			t.Error(err)
			return
		}
		files := request.MultipartForm.File["avatar"]
		if len(files) != 2 {
			t.Errorf("avatar files = %d, want 2", len(files))
			return
		}
		file, err := files[0].Open()
		if err != nil {
			t.Errorf("avatar file = %v", err)
			return
		}
		defer file.Close()
		body, err := io.ReadAll(file)
		if err != nil {
			t.Error(err)
		}
		if files[0].Filename != "avatar.png" || string(body) != "image payload" || files[1].Filename != "avatar-small.png" {
			t.Errorf("uploaded files = %#v, %q", files, body)
		}
		writer.WriteHeader(http.StatusNoContent)
	})
	_, err := Send(Request{Method: http.MethodPost, URL: serverURL, BodyType: "Multipart", MultipartFiles: []MultipartFile{{Name: "avatar", Paths: []string{path, secondPath}}}})
	if err != nil {
		t.Fatal(err)
	}
}

func TestSendRejectsNonHTTPURL(t *testing.T) {
	if _, err := Send(Request{URL: "file:///tmp/private"}); err != ErrInvalidURL {
		t.Fatalf("error = %v", err)
	}
}

func TestSendAppliesQueryAndBearerAuthentication(t *testing.T) {
	serverURL := newTestServer(t, func(writer http.ResponseWriter, request *http.Request) {
		if request.URL.Query().Get("page") != "2" {
			t.Errorf("query = %q", request.URL.RawQuery)
		}
		if request.Header.Get("Authorization") != "Bearer private-token" {
			t.Errorf("authorization header = %q", request.Header.Get("Authorization"))
		}
		writer.WriteHeader(http.StatusNoContent)
	})
	response, err := Send(Request{Method: http.MethodGet, URL: serverURL, Query: map[string]string{"page": "2"}, BearerToken: "private-token"})
	if err != nil {
		t.Fatal(err)
	}
	if response.StatusCode != http.StatusNoContent {
		t.Fatalf("status = %d", response.StatusCode)
	}
}

func TestSendUserAgent(t *testing.T) {
	tests := []struct {
		name      string
		headers   map[string]string
		userAgent string
	}{
		{name: "default", userAgent: "Tomorrow/1.0.0"},
		{name: "custom", headers: map[string]string{"User-Agent": "CustomClient/2.0"}, userAgent: "CustomClient/2.0"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			serverURL := newTestServer(t, func(writer http.ResponseWriter, request *http.Request) {
				if got := request.UserAgent(); got != test.userAgent {
					t.Errorf("User-Agent = %q, want %q", got, test.userAgent)
				}
				writer.WriteHeader(http.StatusNoContent)
			})
			if _, err := Send(Request{Method: http.MethodGet, URL: serverURL, Headers: test.headers}); err != nil {
				t.Fatal(err)
			}
		})
	}
}

func TestRequestTimeoutUsesDefaultAndCapsConfiguredValue(t *testing.T) {
	if got := requestTimeout(0); got != defaultTimeout {
		t.Errorf("default timeout = %s, want %s", got, defaultTimeout)
	}
	if got := requestTimeout(60); got != 60*time.Second {
		t.Errorf("configured timeout = %s, want 60s", got)
	}
	if got := requestTimeout(int(^uint(0) >> 1)); got != maximumTimeout {
		t.Errorf("capped timeout = %s, want %s", got, maximumTimeout)
	}
}
