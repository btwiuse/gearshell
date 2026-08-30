;; examples/wasi/args.wat — argv and environment through the WASI ABI.
;;
;; Shows that a wasi task receives exactly what the kernel parsed from the
;; task's cmd and env: argv[0] is the resolved module path, argv[1..] are
;; the remaining command words, and every KEY=VALUE env entry is present.
;; The WASI functions args_sizes_get / args_get / environ_sizes_get /
;; environ_get are the only way a preview1 module can see its command line.
;;
;; Rebuild with:  wasm-tools parse examples/wasi/args.wat -o examples/wasi/args.wasm
;;
;; Scratch layout:
;;   0      arg count        4      arg buf byte size
;;   8..15  one iovec        16..   argv ptr array (grows with argc)
;;   100    nwritten scratch 512    argv string buffer
;;   2048   environ ptr array      2560  environ string buffer
;;   4096+  label strings (well above the ptr arrays so a long argv
;;          cannot clobber them); 4140..4149 printDec digit scratch

(module
  (import "wasi_snapshot_preview1" "fd_write"
    (func $fd_write (param i32 i32 i32 i32) (result i32)))
  (import "wasi_snapshot_preview1" "args_sizes_get"
    (func $args_sizes_get (param i32 i32) (result i32)))
  (import "wasi_snapshot_preview1" "args_get"
    (func $args_get (param i32 i32) (result i32)))
  (import "wasi_snapshot_preview1" "environ_sizes_get"
    (func $environ_sizes_get (param i32 i32) (result i32)))
  (import "wasi_snapshot_preview1" "environ_get"
    (func $environ_get (param i32 i32) (result i32)))

  (memory (export "memory") 2)
  (data (i32.const 4096) "argv:\n\00")
  (data (i32.const 4104) "  arg[\00")
  (data (i32.const 4112) "env:\n\00")
  (data (i32.const 4120) "  env[\00")
  (data (i32.const 4128) "] = \00")
  (data (i32.const 4133) "\n\00")

  ;; strlen(p) -> length (bytes up to the NUL)
  (func $strlen (param $p i32) (result i32)
    (local $n i32)
    (block $done
      (loop $loop
        (br_if $done
          (i32.eqz (i32.load8_u (i32.add (local.get $p) (local.get $n)))))
        (local.set $n (i32.add (local.get $n) (i32.const 1)))
        (br $loop)))
    (local.get $n))

  ;; write the bytes at $p (length $len) to stdout
  (func $raw (param $p i32) (param $len i32)
    (i32.store (i32.const 8) (local.get $p))
    (i32.store (i32.const 12) (local.get $len))
    (drop (call $fd_write (i32.const 1) (i32.const 8) (i32.const 1) (i32.const 100))))

  ;; write a NUL-terminated string to stdout
  (func $print (param $p i32)
    (call $raw (local.get $p) (call $strlen (local.get $p))))

  ;; write the decimal value of $n to stdout (digits land in scratch 4140..4149)
  (func $printDec (param $n i32)
    (local $count i32) (local $tmp i32) (local $i i32)
    (local.set $tmp (local.get $n))
    (if (i32.eqz (local.get $tmp))
      (then
        (i32.store8 (i32.const 4140) (i32.const 48))
        (local.set $count (i32.const 1))))
    (block $bail
      (br_if $bail (i32.eqz (local.get $tmp)))
      (loop $digits
        (i32.store8
          (i32.add (i32.const 4140) (local.get $count))
          (i32.add (i32.const 48) (i32.rem_u (local.get $tmp) (i32.const 10))))
        (local.set $tmp (i32.div_u (local.get $tmp) (i32.const 10)))
        (local.set $count (i32.add (local.get $count) (i32.const 1)))
        (br_if $digits (i32.ne (local.get $tmp) (i32.const 0)))))
    (block $out_done
      (loop $out
        (br_if $out_done (i32.ge_u (local.get $i) (local.get $count)))
        (local.set $tmp (i32.sub (local.get $count) (i32.const 1)))
        (call $raw
          (i32.add (i32.const 4140) (i32.sub (local.get $tmp) (local.get $i)))
          (i32.const 1))
        (local.set $i (i32.add (local.get $i) (i32.const 1)))
        (br $out))))

  ;; write one list entry ("arg[3] = value\n" style), value is NUL-terminated
  (func $printEntry (param $label i32) (param $idx i32) (param $value i32)
    (call $print (local.get $label))
    (call $printDec (local.get $idx))
    (call $print (i32.const 4128))                       ;; "] = "
    (call $print (local.get $value))
    (call $raw (i32.const 4133) (i32.const 1)))         ;; "\n"

  (func (export "_start")
    (local $i i32)
    (local $count i32)

    ;; --- argv ---
    (drop (call $args_sizes_get (i32.const 0) (i32.const 4)))
    (drop (call $args_get (i32.const 16) (i32.const 512)))
    (local.set $count (i32.load (i32.const 0)))
    (call $print (i32.const 4096))                       ;; "argv:\n"
    (local.set $i (i32.const 0))
    (block $args_done
      (loop $args_loop
        (br_if $args_done (i32.ge_u (local.get $i) (local.get $count)))
        (call $printEntry (i32.const 4104) (local.get $i)  ;; "  arg["
          (i32.load (i32.add (i32.const 16) (i32.shl (local.get $i) (i32.const 2)))))
        (local.set $i (i32.add (local.get $i) (i32.const 1)))
        (br $args_loop)))

    ;; --- env ---
    (drop (call $environ_sizes_get (i32.const 0) (i32.const 4)))
    (drop (call $environ_get (i32.const 2048) (i32.const 2560)))
    (local.set $count (i32.load (i32.const 0)))
    (call $print (i32.const 4112))                       ;; "env:\n"
    (local.set $i (i32.const 0))
    (block $env_done
      (loop $env_loop
        (br_if $env_done (i32.ge_u (local.get $i) (local.get $count)))
        (call $printEntry (i32.const 4120) (local.get $i)  ;; "  env["
          (i32.load (i32.add (i32.const 2048) (i32.shl (local.get $i) (i32.const 2)))))
        (local.set $i (i32.add (local.get $i) (i32.const 1)))
        (br $env_loop)))
  )
)
