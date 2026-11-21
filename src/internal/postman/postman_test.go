package postman

import "testing"

func TestImportEnvironment(t *testing.T) {
	got, err := ImportEnvironment([]byte(`{"name":"Local","values":[{"key":"host","value":"localhost","enabled":true}]}`))
	if err != nil {
		t.Fatal(err)
	}
	if got.Name != "Local" || got.Values["host"] != "localhost" {
		t.Fatalf("unexpected environment: %#v", got)
	}
}

func TestImportRejectsInvalidJSON(t *testing.T) {
	if _, err := ImportEnvironment([]byte(`{`)); err == nil {
		t.Fatal("expected invalid JSON error")
	}
}
