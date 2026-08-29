package main

import (
	"bytes"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// runCmd executes the gear root command with a fake stdout/stderr.
func runCmd(t *testing.T, args ...string) (string, string, error) {
	t.Helper()
	root := NewRootCommand()
	var out, errOut bytes.Buffer
	root.SetOut(&out)
	root.SetErr(&errOut)
	root.SetArgs(args)
	err := root.Execute()
	return out.String(), errOut.String(), err
}

// fakeBridge installs a stub callFn and restores it on test end.
func fakeBridge(t *testing.T, fn func(method, payload string) (string, error)) {
	t.Helper()
	old := callFn
	callFn = fn
	t.Cleanup(func() { callFn = old })
}

func TestDottedPath(t *testing.T) {
	cases := map[string]string{
		"panels.list":           "panels/list",
		"config.providers.save": "config/providers/save",
		"ping":                  "ping",
		"agents.prompt-wait":    "agents/prompt-wait",
	}
	for in, want := range cases {
		if got := dottedPath(in); got != want {
			t.Errorf("dottedPath(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestRawPassthrough(t *testing.T) {
	var gotMethod, gotPayload string
	fakeBridge(t, func(method, payload string) (string, error) {
		gotMethod, gotPayload = method, payload
		return `{"ok":true}`, nil
	})
	out, _, err := runCmd(t, "panels.list", "[1,2]")
	if err != nil {
		t.Fatal(err)
	}
	if gotMethod != "panels.list" || gotPayload != "[1,2]" {
		t.Errorf("got (%q, %q), want (panels.list, [1,2])", gotMethod, gotPayload)
	}
	if strings.TrimSpace(out) != `{"ok":true}` {
		t.Errorf("out = %q, want {\"ok\":true}", out)
	}
}

func TestDefaultPayload(t *testing.T) {
	fakeBridge(t, func(method, payload string) (string, error) {
		if payload != "[]" {
			t.Errorf("default payload = %q, want []", payload)
		}
		return "pong", nil
	})
	if _, _, err := runCmd(t, "ping"); err != nil {
		t.Fatal(err)
	}
}

func TestVersionPings(t *testing.T) {
	var method string
	fakeBridge(t, func(m, _ string) (string, error) {
		method = m
		return "pong", nil
	})
	if _, _, err := runCmd(t, "version"); err != nil {
		t.Fatal(err)
	}
	if method != "ping" {
		t.Errorf("version called %q, want ping", method)
	}
}

func TestOpenURL(t *testing.T) {
	var method, payload string
	fakeBridge(t, func(m, p string) (string, error) {
		method, payload = m, p
		return "{}", nil
	})
	if _, _, err := runCmd(t, "open", "https://example.com"); err != nil {
		t.Fatal(err)
	}
	if method != "browser.open" {
		t.Errorf("method = %q, want browser.open", method)
	}
	if payload != `["https://example.com"]` {
		t.Errorf("payload = %q", payload)
	}
}

func TestOpenFile(t *testing.T) {
	var method, payload string
	fakeBridge(t, func(m, p string) (string, error) {
		method, payload = m, p
		return "{}", nil
	})
	dir, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	if _, _, err := runCmd(t, "open", "notes.txt"); err != nil {
		t.Fatal(err)
	}
	if method != "files.open" {
		t.Errorf("method = %q, want files.open", method)
	}
	want := filepath.Join(dir, "notes.txt")
	if payload != `["`+want+`"]` {
		t.Errorf("payload = %q, want [%q]", payload, want)
	}
}

func TestOpenAbsFile(t *testing.T) {
	var payload string
	fakeBridge(t, func(_, p string) (string, error) {
		payload = p
		return "{}", nil
	})
	if _, _, err := runCmd(t, "open", "/etc/hosts"); err != nil {
		t.Fatal(err)
	}
	if payload != `["/etc/hosts"]` {
		t.Errorf("payload = %q, want [\"/etc/hosts\"]", payload)
	}
}

func TestOpenMissingArg(t *testing.T) {
	fakeBridge(t, func(_, _ string) (string, error) { return "", nil })
	if _, _, err := runCmd(t, "open"); err == nil {
		t.Fatal("want error for missing arg")
	}
}

func TestNoArgsUsage(t *testing.T) {
	_, _, err := runCmd(t)
	if err == nil {
		t.Fatal("want usage error")
	}
	var ee *exitError
	if !errors.As(err, &ee) || ee.code != 2 {
		t.Errorf("want exit code 2, got %v", err)
	}
}

func TestPromptWaitSuccess(t *testing.T) {
	old := promptWaitInterval
	promptWaitInterval = time.Millisecond
	t.Cleanup(func() { promptWaitInterval = old })
	calls := 0
	fakeBridge(t, func(_, _ string) (string, error) {
		calls++
		if calls == 1 {
			return `{"ok":false,"busy":true,"retryAfterMs":0}`, nil
		}
		return `{"ok":true,"response":"hi"}`, nil
	})
	out, _, err := runCmd(t, "agents.prompt-wait", "task-1", "hello", "5")
	if err != nil {
		t.Fatal(err)
	}
	if calls != 2 {
		t.Errorf("calls = %d, want 2", calls)
	}
	if !strings.Contains(out, `"ok":true`) {
		t.Errorf("out = %q, want ok:true", out)
	}
}

func TestPromptWaitTimeout(t *testing.T) {
	old := promptWaitInterval
	promptWaitInterval = time.Millisecond
	t.Cleanup(func() { promptWaitInterval = old })
	fakeBridge(t, func(_, _ string) (string, error) {
		return `{"ok":false,"busy":true}`, nil
	})
	_, _, err := runCmd(t, "agents.prompt-wait", "task-1", "hello", "1")
	if err == nil {
		t.Fatal("want timeout error")
	}
	var ee *exitError
	if !errors.As(err, &ee) || ee.code != 1 {
		t.Errorf("want exit code 1, got %v", err)
	}
}

func TestPromptWaitNoArgs(t *testing.T) {
	_, _, err := runCmd(t, "agents.prompt-wait")
	if err == nil {
		t.Fatal("want usage error")
	}
	var ee *exitError
	if !errors.As(err, &ee) || ee.code != 2 {
		t.Errorf("want exit code 2, got %v", err)
	}
}

func TestBridgeCallErrors(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("GEAR_JSFS_ROOT", dir)
	// Missing funcfile: cannot open.
	if _, err := bridgeCall("ping", "[]"); err == nil {
		t.Fatal("want error for missing funcfile")
	} else if !strings.Contains(err.Error(), "cannot open") {
		t.Errorf("err = %v, want cannot open", err)
	}
	// Funcfile that swallows input: symlink to /dev/null (write succeeds,
	// read returns EOF -> empty) simulates the no-response branch.
	empty := filepath.Join(dir, "ping:json")
	if err := os.Symlink("/dev/null", empty); err != nil {
		t.Fatal(err)
	}
	if _, err := bridgeCall("ping", "[]"); err == nil {
		t.Fatal("want no-response error for empty funcfile")
	} else if !strings.Contains(err.Error(), "no response") {
		t.Errorf("err = %v, want no response", err)
	}
}
