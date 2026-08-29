package main

import (
	"encoding/json"
	"fmt"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/spf13/cobra"
)

// exitError carries the process exit code so main can mirror the bash CLI's
// exit conventions: 2 for usage errors, 1 for call failures. fang prints
// Error() to stderr exactly once; main only maps the code.
type exitError struct {
	code int
	msg  string
}

func (e *exitError) Error() string { return e.msg }

// promptWaitInterval is overridable in tests to avoid real sleeps.
var promptWaitInterval = time.Second

// NewRootCommand returns the root cobra.Command for the gear CLI.
func NewRootCommand() *cobra.Command {
	root := &cobra.Command{
		Use:   "gear [command] [flags] [args]",
		Short: "GearShell workspace control (jsfs fd bridge)",
		Long: `gear talks to the GearShell workspace API over the jsfs fd bridge:
it opens /js/GearShell/<method.dotted.path>:json, writes the args JSON
array, and prints the response.

usage:
  gear <method.dotted.path> '<json-args-array>'   raw protocol call
  gear open <file|url>                            browser.open / files.open sugar
  gear version                                    alias for ping
  gear agents.prompt-wait <id> <text> [timeout]   poll agents.prompt until ok

methods:
  ping
  config.getShell   config.updateShell   config.getWorkspace   config.getSystem   config.getTaskBinds
  config.getBinds   config.addBind   config.updateBind   config.removeBind   config.setBinds
  config.updateRuntime   config.reload
  config.providers.list  config.providers.save  config.providers.remove
  config.plugins.list  config.plugins.install  config.plugins.remove  config.plugins.setEnabled
  config.audit.list  config.audit.undo  config.audit.clear
  panels.list  panels.open  panels.close  panels.focus
  browser.open  files.open
  tasks.list  tasks.create  tasks.cancel  tasks.output
  agents.list  agents.prompt  agents.read  agents.interrupt
  music.play  music.pause  music.resume  music.stop  music.nowPlaying
  events.on  events.off  events.emit  events.drain  events.pending
  open <file|url>

examples:
  gear ping
  gear panels.list
  gear tasks.create '[{"name":"x","cmd":"echo hi"}]'
  gear config.updateShell '[{"foo":"bar"}]'
  gear config.getSystem
  gear config.updateBind '["opfs",{"type":"ns","dst":"opfs","src":"#web/opfs","mode":"0755"}]'
  gear config.removeBind '["tmp"]'
  gear config.setBinds '[{"id":"root","type":"ns","dst":".","src":"#ramfs/new"},{"id":"task","type":"ns","dst":"task","src":"#task"}]'
  gear config.updateRuntime '[{"allowOrigins":"https://example.com"}]'
  gear agents.read '["task-1",{"rows":50}]'
  gear open https://example.com

note: system bind/runtime changes only apply on reload;
gear config.reload restarts the workspace (kills all tasks).
provider apiKeys are redacted from every gear response;
config.providers.save with an empty apiKey keeps the stored key.`,
		Args: cobra.ArbitraryArgs,
		RunE: rootPassthrough,
	}
	root.AddCommand(newVersionCommand())
	root.AddCommand(newOpenCommand())
	return root
}

// rootPassthrough implements the raw protocol: gear <method> '<json-args>'.
// The dotted method is accepted verbatim, matching the bash CLI exactly.
func rootPassthrough(cmd *cobra.Command, args []string) error {
	if len(args) < 1 {
		return &exitError{
			code: 2,
			msg:  "usage: gear <method.dotted.path> [json-args-array] (try: gear help)",
		}
	}
	method := args[0]
	if method == "agents.prompt-wait" {
		return promptWait(cmd, args[1:])
	}
	payload := "[]"
	if len(args) > 1 {
		payload = args[1]
	}
	return callAndPrint(cmd.OutOrStdout(), method, payload)
}

// newVersionCommand maps `gear version` to the ping method, as the bash
// CLI did.
func newVersionCommand() *cobra.Command {
	return &cobra.Command{
		Use:   "version",
		Short: "Report the workspace state (alias for ping)",
		Args:  cobra.NoArgs,
		RunE: func(cmd *cobra.Command, args []string) error {
			return callAndPrint(cmd.OutOrStdout(), "ping", "[]")
		},
	}
}

// newOpenCommand implements `gear open <file|url>`: http(s) URLs open a
// browser iframe panel; anything else is resolved against the current
// directory (symlinks evaluated, like the bash `cd dir && pwd -P`) and
// opened in the file browser.
func newOpenCommand() *cobra.Command {
	return &cobra.Command{
		Use:   "open <file|url>",
		Short: "Open a URL in a browser iframe panel, or a file in the file browser",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			target := args[0]
			if strings.HasPrefix(target, "http://") || strings.HasPrefix(target, "https://") {
				return callAndPrint(cmd.OutOrStdout(), "browser.open", jsonArray(target))
			}
			resolved, err := resolveFilePath(target)
			if err != nil {
				return err
			}
			return callAndPrint(cmd.OutOrStdout(), "files.open", jsonArray(resolved))
		},
	}
}

// resolveFilePath mirrors the bash open sugar: absolute paths pass through;
// relative paths resolve against the current directory with symlinks
// evaluated.
func resolveFilePath(target string) (string, error) {
	if strings.HasPrefix(target, "/") {
		return target, nil
	}
	abs, err := filepath.Abs(target)
	if err != nil {
		return "", err
	}
	if ev, err := filepath.EvalSymlinks(abs); err == nil {
		return ev, nil
	}
	return abs, nil
}

// promptWait polls agents.prompt until the response carries "ok":true or
// the timeout elapses (default 30s). The jsfs bridge is synchronous, so
// agents.prompt answers {busy, retryAfterMs} while terminal output is still
// landing; this sugar mirrors the bash loop.
func promptWait(cmd *cobra.Command, args []string) error {
	if len(args) < 2 {
		return &exitError{
			code: 2,
			msg:  "usage: gear agents.prompt-wait <session-id> <text> [timeout-secs]",
		}
	}
	w := cmd.OutOrStdout()
	id := args[0]
	text := args[1]
	timeoutSecs := 30
	if len(args) > 2 {
		if n, err := strconv.Atoi(args[2]); err == nil {
			timeoutSecs = n
		}
	}
	payload, err := json.Marshal([]string{id, text})
	if err != nil {
		return err
	}
	deadline := time.Now().Add(time.Duration(timeoutSecs) * time.Second)
	for {
		out, err := callFn("agents.prompt", string(payload))
		if err != nil {
			return err
		}
		if strings.Contains(out, `"ok":true`) {
			fmt.Fprintln(w, out)
			return nil
		}
		if time.Now().After(deadline) {
			fmt.Fprintln(w, out)
			return &exitError{code: 1, msg: "gear: agents.prompt-wait timed out"}
		}
		time.Sleep(promptWaitInterval)
	}
}

// jsonArray builds the JSON args array for a single string argument.
func jsonArray(s string) string {
	b, err := json.Marshal([]string{s})
	if err != nil {
		return `[""]`
	}
	return string(b)
}
