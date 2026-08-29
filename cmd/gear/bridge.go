package main

import (
	"fmt"
	"io"
	"os"
	"strings"
)

// bridgeRoot returns the jsfs projection of the GearShell API. The kernel
// jsfs roots at globalThis with window.GearShell = api, so opening
// /js/GearShell/<method>:json and writing the args JSON array triggers the
// call; reading back returns the result. Overridable (GEAR_JSFS_ROOT) for
// tests and for a future host-side bridge.
func bridgeRoot() string {
	if r := os.Getenv("GEAR_JSFS_ROOT"); r != "" {
		return r
	}
	return "/js/GearShell"
}

// callFn is the jsfs invocation; swapped in tests.
var callFn = bridgeCall

// bridgeCall performs one synchronous jsfs funcfile round-trip.
func bridgeCall(method, args string) (string, error) {
	path := bridgeRoot() + "/" + dottedPath(method) + ":json"
	f, err := os.OpenFile(path, os.O_RDWR, 0)
	if err != nil {
		return "", fmt.Errorf("gear: cannot open %s", path)
	}
	defer f.Close()
	if _, err := io.WriteString(f, args); err != nil {
		return "", fmt.Errorf("gear: call failed")
	}
	// The :json funcfile is a synthetic view: the write triggers the call
	// and the read returns the result regardless of offset, but seek to 0
	// as insurance for pipe-like implementations.
	if _, err := f.Seek(0, io.SeekStart); err != nil {
		return "", fmt.Errorf("gear: call failed")
	}
	out, err := io.ReadAll(io.LimitReader(f, 1<<20))
	if err != nil {
		return "", fmt.Errorf("gear: call failed")
	}
	res := string(out)
	if strings.TrimSpace(res) == "" {
		return "", fmt.Errorf("gear: no response (args must be a JSON array)")
	}
	return res, nil
}

// callAndPrint runs one method and prints the raw response to w (the
// cobra command's stdout in production; a buffer in tests).
func callAndPrint(w io.Writer, method, payload string) error {
	out, err := callFn(method, payload)
	if err != nil {
		return err
	}
	fmt.Fprintln(w, out)
	return nil
}

// dottedPath maps the dotted method to jsfs path segments
// (panels.list -> panels/list).
func dottedPath(method string) string {
	return strings.Join(strings.Split(method, "."), "/")
}
