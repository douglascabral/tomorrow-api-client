package requests

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"
)

const (
	defaultTimeout      = 30 * time.Second
	maximumTimeout      = 120 * time.Second
	defaultUserAgent    = "Tomorrow/1.0.0"
	maximumResponseSize = 8 * 1024 * 1024
	maximumRequestSize  = 32 * 1024 * 1024
)

var ErrInvalidURL = errors.New("request URL must be an absolute HTTP URL")

type Request struct {
	TimeoutSeconds     int               `json:"timeoutSeconds,omitempty"`
	Name               string            `json:"name,omitempty"`
	Method             string            `json:"method"`
	URL                string            `json:"url"`
	Headers            map[string]string `json:"headers"`
	Query              map[string]string `json:"query,omitempty"`
	Environment        map[string]string `json:"environment,omitempty"`
	AuthType           string            `json:"authType,omitempty"`
	AuthToken          string            `json:"authToken,omitempty"`
	AuthUsername       string            `json:"authUsername,omitempty"`
	AuthPassword       string            `json:"authPassword,omitempty"`
	PreRequestScript   string            `json:"preRequestScript,omitempty"`
	PostResponseScript string            `json:"postResponseScript,omitempty"`
	TestScript         string            `json:"testScript,omitempty"`
	BearerToken        string            `json:"bearerToken,omitempty"`
	Username           string            `json:"username,omitempty"`
	Password           string            `json:"password,omitempty"`
	Body               string            `json:"body,omitempty"`
	BodyType           string            `json:"bodyType,omitempty"`
	FilePath           string            `json:"filePath,omitempty"`
	FilePaths          []string          `json:"filePaths,omitempty"`
	MultipartFiles     []MultipartFile   `json:"multipartFiles,omitempty"`
}

type MultipartFile struct {
	Name  string   `json:"name"`
	Paths []string `json:"paths,omitempty"`
	Path  string   `json:"path,omitempty"`
}

type Response struct {
	URL           string            `json:"url"`
	StatusCode    int               `json:"statusCode"`
	Status        string            `json:"status"`
	Headers       map[string]string `json:"headers"`
	Body          string            `json:"body"`
	DurationMs    int64             `json:"durationMs"`
	Environment   map[string]string `json:"environment,omitempty"`
	ScriptResults []ScriptResult    `json:"scriptResults,omitempty"`
}

type ScriptResult struct {
	Name   string `json:"name"`
	Passed bool   `json:"passed"`
	Error  string `json:"error,omitempty"`
}

func Send(input Request) (Response, error) {
	started := time.Now()
	timeout := requestTimeout(input.TimeoutSeconds)
	request, cleanup, err := newHTTPRequest(input)
	if err != nil {
		return Response{}, err
	}
	defer cleanup()
	response, err := (&http.Client{Timeout: timeout}).Do(request)
	if err != nil {
		return Response{}, err
	}
	defer response.Body.Close()
	return readResponse(response, started)
}

func newHTTPRequest(input Request) (*http.Request, func(), error) {
	target, err := requestURL(input)
	if err != nil {
		return nil, func() {}, err
	}
	ctx, cancel := context.WithTimeout(context.Background(), requestTimeout(input.TimeoutSeconds))
	body, contentType, closeBody, err := prepareBody(input)
	if err != nil {
		cancel()
		return nil, func() {}, err
	}
	request, err := http.NewRequestWithContext(ctx, requestMethod(input.Method), target, body)
	if err != nil {
		cancel()
		closeBody()
		return nil, func() {}, err
	}
	applyHeaders(request, input, contentType)
	return request, func() { closeBody(); cancel() }, nil
}

func requestTimeout(seconds int) time.Duration {
	if seconds <= 0 {
		return defaultTimeout
	}
	if seconds > int(maximumTimeout/time.Second) {
		return maximumTimeout
	}
	return time.Duration(seconds) * time.Second
}

func requestURL(input Request) (string, error) {
	target, err := url.ParseRequestURI(strings.TrimSpace(input.URL))
	if err != nil || target.Host == "" || (target.Scheme != "http" && target.Scheme != "https") {
		return "", ErrInvalidURL
	}
	query := target.Query()
	for key, value := range input.Query {
		query.Set(key, value)
	}
	target.RawQuery = query.Encode()
	return target.String(), nil
}

func requestMethod(method string) string {
	method = strings.ToUpper(strings.TrimSpace(method))
	if method == "" {
		return http.MethodGet
	}
	return method
}

func applyHeaders(request *http.Request, input Request, contentType string) {
	request.Header.Set("User-Agent", defaultUserAgent)
	for key, value := range input.Headers {
		request.Header.Set(key, value)
	}
	if contentType != "" && request.Header.Get("Content-Type") == "" {
		request.Header.Set("Content-Type", contentType)
	}
	if input.BearerToken != "" {
		request.Header.Set("Authorization", "Bearer "+input.BearerToken)
	}
	if input.Username != "" {
		request.SetBasicAuth(input.Username, input.Password)
	}
}

func readResponse(response *http.Response, started time.Time) (Response, error) {
	body, err := readResponseBody(response.Body)
	if err != nil {
		return Response{}, err
	}
	return Response{URL: response.Request.URL.String(), StatusCode: response.StatusCode, Status: response.Status, Headers: responseHeaders(response.Header), Body: string(body), DurationMs: time.Since(started).Milliseconds()}, nil
}

func readResponseBody(body io.Reader) ([]byte, error) {
	data, err := io.ReadAll(io.LimitReader(body, maximumResponseSize+1))
	if len(data) > maximumResponseSize {
		data = data[:maximumResponseSize]
	}
	return data, err
}

func responseHeaders(source http.Header) map[string]string {
	headers := make(map[string]string, len(source))
	for key, values := range source {
		headers[key] = strings.Join(values, ", ")
	}
	return headers
}

func prepareBody(input Request) (io.Reader, string, func(), error) {
	if input.BodyType == "Binary file" {
		return openBinary(input.FilePath)
	}
	if input.BodyType == "Multipart" {
		return createMultipart(input)
	}
	if input.BodyType == "Form URL-encoded" {
		return strings.NewReader(parseForm(input.Body).Encode()), "application/x-www-form-urlencoded", func() {}, nil
	}
	if input.BodyType == "Text" {
		return strings.NewReader(input.Body), "text/plain; charset=utf-8", func() {}, nil
	}
	contentType := ""
	if input.Body != "" {
		contentType = "application/json"
	}
	return strings.NewReader(input.Body), contentType, func() {}, nil
}

func parseForm(body string) url.Values {
	values := make(url.Values)
	for _, line := range strings.Split(body, "\n") {
		key, value, found := strings.Cut(line, "=")
		if found && strings.TrimSpace(key) != "" {
			values.Set(strings.TrimSpace(key), strings.TrimSpace(value))
		}
	}
	return values
}

func openBinary(path string) (io.Reader, string, func(), error) {
	file, err := os.Open(path)
	if err != nil {
		return nil, "", func() {}, err
	}
	info, err := file.Stat()
	if err != nil || !info.Mode().IsRegular() || info.Size() > maximumRequestSize {
		_ = file.Close()
		return nil, "", func() {}, errors.New("binary request file is invalid or too large")
	}
	return file, "application/octet-stream", func() { _ = file.Close() }, nil
}

func createMultipart(input Request) (io.Reader, string, func(), error) {
	buffer := &bytes.Buffer{}
	writer := multipart.NewWriter(buffer)
	fields, err := parseFields(input.Body)
	if err != nil {
		return nil, "", func() {}, err
	}
	for key, value := range fields {
		if err = writer.WriteField(key, value); err != nil {
			return nil, "", func() {}, err
		}
	}
	if err = addNamedMultipartFiles(writer, buffer, input.MultipartFiles); err != nil {
		return nil, "", func() {}, err
	}
	for _, path := range input.FilePaths {
		if err = addBoundedMultipartFile(writer, buffer, "file", path); err != nil {
			return nil, "", func() {}, err
		}
	}
	if err = writer.Close(); err != nil {
		return nil, "", func() {}, err
	}
	return buffer, writer.FormDataContentType(), func() {}, nil
}

func addNamedMultipartFiles(writer *multipart.Writer, buffer *bytes.Buffer, files []MultipartFile) error {
	for _, file := range files {
		paths := file.Paths
		if len(paths) == 0 && file.Path != "" {
			paths = []string{file.Path}
		}
		for _, path := range paths {
			if err := addBoundedMultipartFile(writer, buffer, file.Name, path); err != nil {
				return err
			}
		}
	}
	return nil
}

func addBoundedMultipartFile(writer *multipart.Writer, buffer *bytes.Buffer, name, path string) error {
	if err := addMultipartFile(writer, name, path); err != nil {
		return err
	}
	if buffer.Len() > maximumRequestSize {
		return errors.New("multipart request exceeds the maximum size")
	}
	return nil
}

func parseFields(body string) (map[string]string, error) {
	fields := make(map[string]string)
	if body == "" {
		return fields, nil
	}
	var values map[string]any
	if json.Unmarshal([]byte(body), &values) == nil {
		for key, value := range values {
			fields[key] = fmt.Sprint(value)
		}
		return fields, nil
	}
	for key, value := range parseForm(body) {
		if len(value) > 0 {
			fields[key] = value[0]
		}
	}
	return fields, nil
}

func addMultipartFile(writer *multipart.Writer, name string, path string) error {
	file, err := os.Open(path)
	if err != nil {
		return err
	}
	defer file.Close()
	info, err := file.Stat()
	if err != nil || !info.Mode().IsRegular() || info.Size() > maximumRequestSize {
		return errors.New("multipart file is invalid or too large")
	}
	part, err := writer.CreateFormFile(name, filepath.Base(path))
	if err != nil {
		return err
	}
	_, err = io.Copy(part, io.LimitReader(file, maximumRequestSize+1))
	return err
}
