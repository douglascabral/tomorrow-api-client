package scripts

import (
	"testing"
	"time"
)

func TestExecuteExposesOnlyRequestResponseAndEnvironment(t *testing.T) {
	result, err := Execute(`request.url = environment.baseUrl + "/users"; if (response.status !== 200) throw new Error("bad response"); if (typeof fetch !== "undefined" || typeof require !== "undefined") throw new Error("unexpected API")`, Context{
		Request: map[string]any{"url": ""}, Response: map[string]any{"status": 200}, Environment: map[string]any{"baseUrl": "https://local.test"},
	})
	if err != nil {
		t.Fatal(err)
	}
	if result.Request["url"] != "https://local.test/users" {
		t.Fatalf("request url = %v", result.Request["url"])
	}
}

func TestExecuteInterruptsUnboundedScript(t *testing.T) {
	started := time.Now()
	if _, err := Execute(`while (true) {}`, Context{}); err == nil {
		t.Fatal("expected script timeout")
	}
	if time.Since(started) > 2*time.Second {
		t.Fatal("script timeout was not enforced")
	}
}
