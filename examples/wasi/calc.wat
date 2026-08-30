;; examples/wasi/calc.wat — a WASI microservice: compute and write a file.
;;
;; Usage (as a child task, spawned by the js orchestrator in
;; examples/js/calc.js):  calc.wasm <op> <a> <b>
;;   op: "add" | "mul" | "sub"
;; Computes a <op> b and writes the decimal result + "\n" to svc/wasi.txt
;; in the task namespace (preopen fd 3). The orchestrator creates svc/
;; and reads the file back after the child exits — the whole point of the
;; microservice pattern is that each worker kind is a black box that
;; communicates through the shared filesystem.
;;
;; Rebuild:  wasm-tools parse examples/wasi/calc.wat -o examples/wasi/calc.wasm
;;
;; Scratch layout:
;;   0      arg count         4      argv byte size
;;   16..   argv ptr array    128    argv string data
;;   256    opened fd         260    nwritten
;;   512    "svc/wasi.txt"  544    "calc: bad args\n"
;;   576    "calc: cannot open svc/wasi.txt\n"
;;   1024   decimal digit scratch (write backward from 1039)
;;   2048   fd_write iovec    2056   "\n"
;;
;; path_open rights: RIGHTS_PATH_OPEN (1<<13 = 8192) | RIGHTS_FD_WRITE
;; (1<<6 = 64) = 8256; oflags = OFLAGS_CREAT (1) | OFLAGS_TRUNC (8) = 9.
;; browser_wasi_shim ignores rights but real runtimes (wasmtime) check
;; them, so declare the minimal set.

(module
  (import "wasi_snapshot_preview1" "fd_write"
    (func $fd_write (param i32 i32 i32 i32) (result i32)))
  (import "wasi_snapshot_preview1" "fd_close"
    (func $fd_close (param i32) (result i32)))
  (import "wasi_snapshot_preview1" "path_open"
    (func $path_open (param i32 i32 i32 i32 i32 i32 i32 i32 i32) (result i32)))
  (import "wasi_snapshot_preview1" "args_sizes_get"
    (func $args_sizes_get (param i32 i32) (result i32)))
  (import "wasi_snapshot_preview1" "args_get"
    (func $args_get (param i32 i32) (result i32)))

  (memory (export "memory") 2)
  (data (i32.const 512) "svc/wasi.txt\00")
  (data (i32.const 544) "calc: bad args\n")
  (data (i32.const 576) "calc: cannot open svc/wasi.txt\n")
  (data (i32.const 2056) "\n")

  (func $strlen (param $p i32) (result i32)
    (local $n i32)
    (block $done
      (loop $loop
        (br_if $done
          (i32.eqz (i32.load8_u (i32.add (local.get $p) (local.get $n)))))
        (local.set $n (i32.add (local.get $n) (i32.const 1)))
        (br $loop)))
    (local.get $n))

  ;; print a NUL-terminated string to stdout (fd 1)
  (func $print (param $p i32)
    (i32.store (i32.const 2048) (local.get $p))
    (i32.store (i32.const 2052) (call $strlen (local.get $p)))
    (drop (call $fd_write (i32.const 1) (i32.const 2048) (i32.const 1) (i32.const 260))))

  ;; parse a NUL-terminated decimal string into an i32
  (func $atoi (param $p i32) (result i32)
    (local $acc i32) (local $c i32)
    (block $done
      (loop $loop
        (local.set $c (i32.load8_u (local.get $p)))
        (br_if $done (i32.eqz (local.get $c)))
        (local.set $acc
          (i32.add (i32.mul (local.get $acc) (i32.const 10))
            (i32.sub (local.get $c) (i32.const 48))))
        (local.set $p (i32.add (local.get $p) (i32.const 1)))
        (br $loop)))
    (local.get $acc))

  ;; write decimal $n + "\n" to the file whose fd is at scratch 256
  (func $writeDec (param $n i32)
    (local $count i32) (local $tmp i32) (local $i i32)
    (local.set $tmp (local.get $n))
    (if (i32.eqz (local.get $tmp))
      (then
        (i32.store8 (i32.const 1024) (i32.const 48))
        (local.set $count (i32.const 1))))
    (block $bail
      (br_if $bail (i32.eqz (local.get $tmp)))
      (loop $digits
        (i32.store8
          (i32.add (i32.const 1024) (local.get $count))
          (i32.add (i32.const 48) (i32.rem_u (local.get $tmp) (i32.const 10))))
        (local.set $tmp (i32.div_u (local.get $tmp) (i32.const 10)))
        (local.set $count (i32.add (local.get $count) (i32.const 1)))
        (br_if $digits (i32.ne (local.get $tmp) (i32.const 0)))))
    (block $out_done
      (loop $out
        (br_if $out_done (i32.ge_u (local.get $i) (local.get $count)))
        (local.set $tmp (i32.sub (local.get $count) (i32.const 1)))
        (i32.store (i32.const 2048)
          (i32.add (i32.const 1024) (i32.sub (local.get $tmp) (local.get $i))))
        (i32.store (i32.const 2052) (i32.const 1))
        (drop (call $fd_write (i32.load (i32.const 256)) (i32.const 2048) (i32.const 1) (i32.const 260)))
        (local.set $i (i32.add (local.get $i) (i32.const 1)))
        (br $out)))
    (i32.store (i32.const 2048) (i32.const 2056))
    (i32.store (i32.const 2052) (i32.const 1))
    (drop (call $fd_write (i32.load (i32.const 256)) (i32.const 2048) (i32.const 1) (i32.const 260))))

  (func (export "_start")
    (local $op i32) (local $a i32) (local $b i32) (local $fd i32)
    (local $acc i32)

    (drop (call $args_sizes_get (i32.const 0) (i32.const 4)))
    (drop (call $args_get (i32.const 16) (i32.const 128)))

    ;; need argv[1..3] (argv[0] is the module path)
    (if (i32.lt_u (i32.load (i32.const 0)) (i32.const 4))
      (then
        (call $print (i32.const 544))
        (return)))
    (local.set $op (i32.load (i32.const 20)))
    (local.set $a (call $atoi (i32.load (i32.const 24))))
    (local.set $b (call $atoi (i32.load (i32.const 28))))

    ;; op dispatch by first byte: 'a'=add 'm'=mul 's'=sub
    (local.set $acc
      (if (result i32) (i32.eq (i32.load8_u (local.get $op)) (i32.const 97))
        (then (i32.add (local.get $a) (local.get $b)))
        (else (if (result i32) (i32.eq (i32.load8_u (local.get $op)) (i32.const 109))
          (then (i32.mul (local.get $a) (local.get $b)))
          (else (i32.sub (local.get $a) (local.get $b)))))))

    ;; path_open(dirfd=3, 0, "svc/wasi.txt", len, oflags=9, rights=8256, 0, &fd)
    (if (i32.ne
          (call $path_open (i32.const 3) (i32.const 0)
            (i32.const 512) (call $strlen (i32.const 512))
            (i32.const 9) (i32.const 8256) (i32.const 0)
            (i32.const 0) (i32.const 256))
          (i32.const 0))
      (then
        (call $print (i32.const 576))
        (return)))
    (local.set $fd (i32.load (i32.const 256)))
    (call $writeDec (local.get $acc))
    (drop (call $fd_close (local.get $fd)))
  )
)
