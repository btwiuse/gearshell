// GearShell dev server with cross-origin isolation, in the style of
// ../wanix/examples/serve.go.
//
// The wanix wasi worker needs SharedArrayBuffer, which requires the page
// to be cross-origin isolated (COOP same-origin + COEP). Plain
// `python3 -m http.server` cannot send those headers, so wasi tasks fail
// silently. Run this from the repo root:
//
//   go run scripts/dev-server.go [port]      # default 8080
//
// COEP is set to `credentialless` (not `require-corp`): the shell embeds
// cross-origin iframes (codigo / crush panels) that send no CORP header
// and would be blocked by require-corp; credentialless strips credentials
// from those requests, which the shell's public CDN resources tolerate,
// and still grants SharedArrayBuffer. Production hosting needs the same
// two headers for wasi workers to run (GitHub Pages cannot set them; any
// COOP/COEP-capable host works).
package main

import (
	"log"
	"net/http"
	"os"
)

func main() {
	port := "8080"
	if len(os.Args) > 1 {
		port = os.Args[1]
	}
	root, err := os.Getwd()
	if err != nil {
		log.Fatal(err)
	}
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cross-Origin-Opener-Policy", "same-origin")
		w.Header().Set("Cross-Origin-Embedder-Policy", "credentialless")
		// No caching in dev: every boot must see the latest sources.
		w.Header().Set("Cache-Control", "no-store")
		http.FileServer(http.Dir(root)).ServeHTTP(w, r)
	})
	log.Printf("GearShell dev server (cross-origin isolated) on http://127.0.0.1:%s serving %s", port, root)
	if err := http.ListenAndServe("127.0.0.1:"+port, handler); err != nil {
		log.Fatal(err)
	}
}
