;; examples/wasi/cat.wat — read a file from the task namespace and print it.
;;
;; A wasi task's namespace is the task's own fs (the same binds a terminal
;; sees), surfaced through one WASI preopen: directory fd 3, mounted at
;; "/". Preview1 programs discover preopens with fd_prestat_get; this
;; example hardcodes fd 3 (browser_wasi_shim assigns stdio 0..2, then
;; preopens in order) to stay short. Paths are preopen-relative: absolute
;; paths fail with ERRNO_NOTCAPABLE.
;;
;; Rebuild with:  wasm-tools parse examples/wasi/cat.wat -o examples/wasi/cat.wasm
;; Run with:      cat examples/wasi/hello.wasm  (or any file in the task ns)
;;
;; Scratch layout:
;;   0      arg count        4      arg buf size
;;   16..   argv ptr array   256    opened fd
;;   260    nread            264    nwritten
;;   512    "cat: missing file argument\n"
;;   544    "cat: cannot open: "
;;   576    iovec { buf = 1024, len = 512 }
;;   592    "\n"
;;   1024   read buffer (512 bytes)

(module
  (import "wasi_snapshot_preview1" "fd_write"
    (func $fd_write (param i32 i32 i32 i32) (result i32)))
  (import "wasi_snapshot_preview1" "fd_read"
    (func $fd_read (param i32 i32 i32 i32) (result i32)))
  (import "wasi_snapshot_preview1" "fd_close"
    (func $fd_close (param i32) (result i32)))
  (import "wasi_snapshot_preview1" "path_open"
    (func $path_open (param i32 i32 i32 i32 i32 i32 i32 i32 i32) (result i32)))
  (import "wasi_snapshot_preview1" "args_sizes_get"
    (func $args_sizes_get (param i32 i32) (result i32)))
  (import "wasi_snapshot_preview1" "args_get"
    (func $args_get (param i32 i32) (result i32)))

  (memory (export "memory") 2)
  (data (i32.const 512) "cat: missing file argument\n")
  (data (i32.const 544) "cat: cannot open: ")
  (data (i32.const 592) "\n")

  (func $strlen (param $p i32) (result i32)
    (local $n i32)
    (block $done
      (loop $loop
        (br_if $done
          (i32.eqz (i32.load8_u (i32.add (local.get $p) (local.get $n)))))
        (local.set $n (i32.add (local.get $n) (i32.const 1)))
        (br $loop)))
    (local.get $n))

  (func $print (param $p i32)
    (local $len i32)
    (local.set $len (call $strlen (local.get $p)))
    (i32.store (i32.const 576) (local.get $p))
    (i32.store (i32.const 580) (local.get $len))
    (drop (call $fd_write (i32.const 1) (i32.const 576) (i32.const 1) (i32.const 264))))

  (func (export "_start")
    (local $path i32) (local $pathlen i32) (local $fd i32) (local $nread i32)

    (drop (call $args_sizes_get (i32.const 0) (i32.const 4)))
    (drop (call $args_get (i32.const 16) (i32.const 2048)))

    ;; need argv[1]; argv[0] is the module path itself
    (if (i32.lt_u (i32.load (i32.const 0)) (i32.const 2))
      (then
        (call $print (i32.const 512))
        (return)))
    (local.set $path (i32.load (i32.const 20)))
    (local.set $pathlen (call $strlen (local.get $path)))

    ;; path_open(dirfd=3, dirflags=0, path, len, oflags=0, rights, rights, 0, &fd)
    ;; fs_rights_base includes PATH_OPEN (1<<16) and FD_READ (1<<1) so
    ;; strict WASI runtimes (e.g. wasmtime) accept the open; the wanix
    ;; runtime's browser_wasi_shim ignores rights entirely.
    (if (i32.ne
          (call $path_open (i32.const 3) (i32.const 0) (local.get $path)
            (local.get $pathlen) (i32.const 0)
            (i32.const 65538) (i32.const 2)
            (i32.const 0) (i32.const 256))
          (i32.const 0))
      (then
        (call $print (i32.const 544))
        (call $print (local.get $path))
        (call $print (i32.const 592))
        (return)))
    (local.set $fd (i32.load (i32.const 256)))

    ;; copy loop: fd_read(fd, iovec, 1, &nread) -> fd_write(1, iovec, 1, &nw)
    ;; ($print above also touches the iovec slot, so rebuild it first)
    (i32.store (i32.const 576) (i32.const 1024))
    (i32.store (i32.const 580) (i32.const 512))
    (block $done
      (loop $loop
        (drop (call $fd_read (local.get $fd) (i32.const 576) (i32.const 1) (i32.const 260)))
        (local.set $nread (i32.load (i32.const 260)))
        (br_if $done (i32.eqz (local.get $nread)))
        (drop (call $fd_write (i32.const 1) (i32.const 576) (i32.const 1) (i32.const 264)))
        (br $loop)))

    (drop (call $fd_close (local.get $fd)))
  )
)
