// examples/js/wanix.js — a compact, self-contained client for the wanix
// task namespace RPC, written so a plain `type="js"` worker needs nothing
// but this file to read/write files, spawn programs, and print to the
// terminal.
//
// A wanix JS worker is a module Worker whose script is the task's command.
// The kernel starts it and hands it a MessagePort in the first message:
//
//   { worker: { id, tid, ppid, port, p9, cmd, env, url, debug } }
//
// `port` carries a byte stream to the kernel's task filesystem. The wire
// protocol is the same duplex multiplexer + CBOR RPC that the kernel's own
// gojs/wasi workers use (see the gojs/worker/lib.js bundle upstream); this
// file reimplements just enough of it to call the fs API. ~250 lines, no
// external deps.
//
// PORTABILITY: the kernel runs the worker script from a blob: URL, and a
// blob worker cannot resolve relative OR root-absolute imports (only full
// URLs), so the examples import this module dynamically with
// `await import(`${location.origin}/examples/js/wanix.js`)`. If you
// host the shell under a subpath, add that prefix to the import (or
// inline this file and mux.js into your worker).
//
// Wire reference (RFC 8949 CBOR, duplex mux, big-endian):
//   mux packets : 1-byte id | fixed header | (Data) 4-byte len + payload
//   rpc frames  : 4-byte len + one CBOR value, over an opened channel
//   a call      : frame {S: "Selector"} then frame [args...]; the kernel
//                 answers frame {E, C} then frame <value>.

import { MuxSession } from "/examples/js/mux.js";

// ---------------------------------------------------------------------------
// 1. Transport: a MessagePort as a byte stream.
//    The kernel posts raw Uint8Array chunks (transferred zero-copy); we
//    buffer them and serve reads of exact lengths.
// ---------------------------------------------------------------------------

class Conn {
  constructor(port) {
    this.port = port;
    this.chunks = [];      // incoming Uint8Array chunks
    this.waiters = [];     // pending read() resolvers
    this.closed = false;
    port.onmessage = (event) => {
      this.chunks.push(new Uint8Array(event.data));
      const waiter = this.waiters.shift();
      if (waiter) waiter();
    };
  }
  read(p) {
    // Read up to p.length bytes; resolves null when the port closes.
    return new Promise((resolve) => {
      const tryRead = () => {
        if (this.closed) { resolve(null); return; }
        if (this.chunks.length === 0) { this.waiters.push(tryRead); return; }
        let written = 0;
        while (written < p.length) {
          const chunk = this.chunks.shift();
          if (chunk === undefined) { resolve(written); return; }
          const buf = chunk.subarray(0, p.length - written);
          p.set(buf, written);
          written += buf.length;
          if (chunk.length > buf.length) {
            this.chunks.unshift(chunk.subarray(buf.length));
          }
        }
        resolve(written);
      };
      tryRead();
    });
  }
  write(p) {
    this.port.postMessage(p, [p.buffer]);
    return Promise.resolve(p.byteLength);
  }
  close() {
    if (this.closed) return;
    this.closed = true;
    for (const waiter of this.waiters) waiter();
    try { this.port.close(); } catch { /* already closed */ }
  }
}

// ---------------------------------------------------------------------------
// 2. Minimal CBOR codec (RFC 8949, definite lengths only).
//    Values we need: null, bool, int, float64, string, bytes, array, map,
//    and skipping tags. Objects become maps with string keys.
// ---------------------------------------------------------------------------

function encodeHead(dst, major, arg) {
  if (arg < 24) {
    dst.push((major << 5) | arg);
  } else if (arg <= 0xff) {
    dst.push((major << 5) | 24, arg);
  } else if (arg <= 0xffff) {
    dst.push((major << 5) | 25, (arg >> 8) & 0xff, arg & 0xff);
  } else if (arg <= 0xffffffff) {
    dst.push((major << 5) | 26, (arg >>> 24) & 0xff, (arg >>> 16) & 0xff, (arg >>> 8) & 0xff, arg & 0xff);
  } else {
    dst.push((major << 5) | 27);
    for (let i = 7; i >= 0; i--) dst.push(Math.floor(arg / 2 ** (i * 8)) % 256);
  }
}

function cborEncode(value, dst) {
  if (value === null || value === undefined) {
    dst.push(0xf6);
  } else if (value === true) {
    dst.push(0xf5);
  } else if (value === false) {
    dst.push(0xf4);
  } else if (typeof value === "number") {
    if (Number.isInteger(value) && Math.abs(value) < 2 ** 53) {
      if (value >= 0) encodeHead(dst, 0, value);
      else encodeHead(dst, 1, -value - 1);
    } else {
      dst.push(0xfb); // float64
      const buf = new DataView(new ArrayBuffer(8));
      buf.setFloat64(0, value);
      for (let i = 0; i < 8; i++) dst.push(buf.getUint8(i));
    }
  } else if (typeof value === "string") {
    const bytes = new TextEncoder().encode(value);
    encodeHead(dst, 3, bytes.length);
    for (const b of bytes) dst.push(b);
  } else if (value instanceof Uint8Array) {
    encodeHead(dst, 2, value.length);
    for (const b of value) dst.push(b);
  } else if (Array.isArray(value)) {
    encodeHead(dst, 4, value.length);
    for (const item of value) cborEncode(item, dst);
  } else if (typeof value === "object") {
    const keys = Object.keys(value);
    encodeHead(dst, 5, keys.length);
    for (const key of keys) {
      cborEncode(key, dst);
      cborEncode(value[key], dst);
    }
  } else {
    throw new Error("wanix.js: cannot CBOR-encode " + typeof value);
  }
}

class CborReader {
  constructor(bytes) {
    this.bytes = bytes;
    this.pos = 0;
  }
  readHead() {
    const b = this.bytes[this.pos++];
    const major = b >> 5;
    let info = b & 0x1f;
    if (info === 24) info = this.bytes[this.pos++];
    else if (info === 25) info = (this.bytes[this.pos++] << 8) | this.bytes[this.pos++];
    else if (info === 26) {
      info = 0;
      for (let i = 0; i < 4; i++) info = info * 256 + this.bytes[this.pos++];
    } else if (info === 27) {
      info = 0;
      for (let i = 0; i < 8; i++) info = info * 256 + this.bytes[this.pos++];
    }
    return { major, info };
  }
  take(n) {
    const out = this.bytes.subarray(this.pos, this.pos + n);
    this.pos += n;
    return out;
  }
  decode() {
    const { major, info } = this.readHead();
    if (major === 0) return info;
    if (major === 1) return -1 - info;
    if (major === 2) return this.take(info);
    if (major === 3) return new TextDecoder().decode(this.take(info));
    if (major === 4) {
      const out = [];
      for (let i = 0; i < info; i++) out.push(this.decode());
      return out;
    }
    if (major === 5) {
      const out = {};
      for (let i = 0; i < info; i++) {
        const key = this.decode();
        out[key] = this.decode();
      }
      return out;
    }
    if (major === 6) return this.decode(); // tag: skip, decode content
    if (major === 7) {
      if (info === 20) return false;
      if (info === 21) return true;
      if (info === 22 || info === 23) return null;
      if (info === 25) {
        const b = this.take(2);
        return new DataView(b.buffer, b.byteOffset, 2).getFloat16(0);
      }
      if (info === 26) {
        const b = this.take(4);
        return new DataView(b.buffer, b.byteOffset, 4).getFloat32(0);
      }
      if (info === 27) {
        const b = this.take(8);
        return new DataView(b.buffer, b.byteOffset, 8).getFloat64(0);
      }
      throw new Error("wanix.js: unexpected CBOR simple value " + info);
    }
    throw new Error("wanix.js: unexpected CBOR major type " + major);
  }
}
// ---------------------------------------------------------------------------
// 4. RPC frames over a channel: 4-byte length + one CBOR value.
// ---------------------------------------------------------------------------

async function frameWrite(channel, value) {
  const body = [];
  cborEncode(value, body);
  const frame = new Uint8Array(4 + body.length);
  new DataView(frame.buffer).setUint32(0, body.length);
  frame.set(body, 4);
  await channel.write(frame);
}

async function frameRead(channel) {
  const prefix = new Uint8Array(4);
  if ((await channel.read(prefix)) === null) return null;
  const size = new DataView(prefix.buffer).getUint32(0);
  const body = new Uint8Array(size);
  let got = 0;
  while (got < size) {
    const r = await channel.read(body.subarray(got));
    if (r === null) return null;
    got += r;
  }
  return new CborReader(body).decode();
}

// ---------------------------------------------------------------------------
// 3. The fs handle: the API the example scripts actually use.
// ---------------------------------------------------------------------------

export class WanixHandle {
  constructor(port) {
    this.session = new MuxSession(new Conn(port));
  }
  async call(selector, args) {
    const ch = await this.session.open();
    try {
      await frameWrite(ch, { S: selector });
      await frameWrite(ch, args);
      const header = await frameRead(ch);       // {E, C}
      if (header && header.E !== undefined && header.E !== null) {
        throw new Error(String(header.E));
      }
      const value = await frameRead(ch);
      if (!header || !header.C) await ch.close();
      return { value, header };
    } catch (err) {
      await ch.close();
      throw err;
    }
  }
  // --- helpers for the examples ---
  async readFile(name) { return (await this.call("ReadFile", [name])).value; }
  async readText(name) {
    const bytes = await this.readFile(name);
    return bytes ? new TextDecoder().decode(bytes) : "";
  }
  async writeFile(name, contents) {
    if (typeof contents === "string") contents = new TextEncoder().encode(contents);
    return (await this.call("WriteFile", [name, contents])).value;
  }
  async appendFile(name, contents) {
    if (typeof contents === "string") contents = new TextEncoder().encode(contents);
    return (await this.call("AppendFile", [name, contents])).value;
  }
  async readDir(name) { return (await this.call("ReadDir", [name])).value || []; }
  async stat(name) { return (await this.call("Stat", [name])).value; }
  async makeDir(name) { return (await this.call("Mkdir", [name])).value; }
  async remove(name) { return (await this.call("Remove", [name])).value; }
  // spawn a child task and wait for it to exit; args are command words.
  async spawn(name, args = [], opts = {}) {
    const value = await this.call("Spawn", [name, args, opts]);
    return value.value && value.value.pid;
  }
  async wait(pid) {
    const value = await this.call("Wait", [pid]);
    return value.value && value.value.exitCode;
  }
}
