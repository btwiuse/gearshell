;; examples/wasi/hello.wat — the smallest possible WASI program.
;;
;; A `type="wasi"` task runs a wasm32-wasi module: the kernel compiles the
;; binary and starts it in a WASI preview1 runtime whose stdio is wired to
;; the task's own fd 0/1/2 (so stdout appears in the terminal). This file
;; is hand-written WebAssembly text — no toolchain needed — and shows the
;; WASI ABI directly: one fd_write call with a single iovec.
;;
;; Rebuild with:  wasm-tools parse examples/wasi/hello.wat -o examples/wasi/hello.wasm
;;
;; Layout (bytes 0..127 of linear memory):
;;   0..7   the iovec { buf_ptr, buf_len }
;;   8..    the literal message
;;   100    scratch for fd_write's nwritten

(module
  (import "wasi_snapshot_preview1" "fd_write"
    (func $fd_write (param i32 i32 i32 i32) (result i32)))

  (memory (export "memory") 1)
  (data (i32.const 8) "hello from WASI!\n")

  (func (export "_start")
    ;; iovec points at the message
    (i32.store (i32.const 0) (i32.const 8))
    (i32.store (i32.const 4) (i32.const 17))
    ;; fd_write(1 /* stdout */, iovec, 1, &nwritten)
    (drop (call $fd_write (i32.const 1) (i32.const 0) (i32.const 1) (i32.const 100)))
  )
)
