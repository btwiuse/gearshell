// examples/js/mux.js — the duplex multiplexer half of the wanix task fs
// RPC client (session, channels, frame codec). See wanix.js for the wire
// protocol overview and the WanixHandle API that uses these classes.

// ---------------------------------------------------------------------------
// 3. Duplex mux session: multiplexes channels over the byte stream.
//    Same message ids / windowing as the kernel's duplex mux.
// ---------------------------------------------------------------------------

const OpenID = 100, OpenConfirmID = 101, OpenFailureID = 102;
const WindowAdjustID = 103, DataID = 104, EofID = 105, CloseID = 106;
const channelMaxPacket = 1 << 24;
const channelWindowSize = 64 * channelMaxPacket;

function marshalPacket(msg) {
  const buf = [];
  const push32 = (v) => {
    buf.push((v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff);
  };
  buf.push(msg.ID);
  if (msg.ID === OpenID) {
    push32(msg.senderID); push32(msg.windowSize); push32(msg.maxPacketSize);
  } else if (msg.ID === OpenConfirmID) {
    push32(msg.channelID); push32(msg.senderID); push32(msg.windowSize); push32(msg.maxPacketSize);
  } else if (msg.ID === DataID) {
    push32(msg.channelID); push32(msg.length);
    const out = new Uint8Array(9 + msg.length);
    out.set(buf, 0);
    out.set(msg.data, 9);
    return out;
  } else if (msg.ID === WindowAdjustID) {
    push32(msg.channelID); push32(msg.additionalBytes);
  } else {
    push32(msg.channelID); // EofID / CloseID / OpenFailureID
  }
  return new Uint8Array(buf);
}

// Fixed header size (in bytes, after the 1-byte message id) per message id.
const HEADER_SIZES = {
  [OpenID]: 12,          // senderID, windowSize, maxPacketSize
  [OpenConfirmID]: 16,   // channelID, senderID, windowSize, maxPacketSize
  [OpenFailureID]: 4,    // channelID
  [WindowAdjustID]: 8,   // channelID, additionalBytes
  [DataID]: 8,           // channelID, length  (+ payload after)
  [EofID]: 4,            // channelID
  [CloseID]: 4,          // channelID
};

export class MuxSession {
  constructor(conn) {
    this.conn = conn;
    this.channels = [];
    this.incoming = [];   // channels opened by the peer (unused by the fs RPC)
    this.loop();
  }
  async loop() {
    while (true) {
      const msg = await this.decodePacket();
      if (msg === null) { this.conn.close(); return; }
      if (msg.ID === OpenID) {
        // Peer-initiated channel (the kernel never does this for our RPC).
        const ch = this.newChannel();
        ch.remoteId = msg.senderID;
        ch.maxRemotePayload = msg.maxPacketSize;
        ch.remoteWin = msg.windowSize;
        this.incoming.push(ch);
        await this.sendPacket({
          ID: OpenConfirmID, channelID: ch.remoteId, senderID: ch.localId,
          windowSize: ch.myWindow, maxPacketSize: channelMaxPacket,
        });
        continue;
      }
      const ch = this.channels[msg.channelID];
      if (!ch) { console.warn(`wanix.js: packet for unknown channel ${msg.channelID}`); continue; }
      await ch.handle(msg);
    }
  }
  open() {
    const ch = this.newChannel();
    return this.sendPacket({
      ID: OpenID, senderID: ch.localId, windowSize: ch.myWindow, maxPacketSize: channelMaxPacket,
    }).then(() => ch.ready.shift()).then((ok) => {
      if (!ok) throw new Error("wanix.js: channel open rejected");
      return ch;
    });
  }
  newChannel() {
    const ch = new Channel(this);
    ch.localId = this.channels.push(ch) - 1;
    return ch;
  }
  sendPacket(msg) {
    return this.conn.write(marshalPacket(msg));
  }
  async decodePacket() {
    const idBuf = new Uint8Array(1);
    if ((await this.conn.read(idBuf)) === null) return null;
    const id = idBuf[0];
    const headerSize = HEADER_SIZES[id];
    if (headerSize === undefined) {
      console.warn(`wanix.js: unknown mux packet id ${id}`);
      return null;
    }
    const header = new Uint8Array(headerSize);
    if ((await this.conn.read(header)) === null) return null;
    const dv = new DataView(header.buffer);
    if (id === OpenID) {
      return { ID: id, senderID: dv.getUint32(0), windowSize: dv.getUint32(4), maxPacketSize: dv.getUint32(8) };
    }
    const channelID = dv.getUint32(0);
    if (id === OpenConfirmID) {
      return { ID: id, channelID, senderID: dv.getUint32(4), windowSize: dv.getUint32(8), maxPacketSize: dv.getUint32(12) };
    }
    if (id === WindowAdjustID) {
      return { ID: id, channelID, additionalBytes: dv.getUint32(4) };
    }
    if (id === DataID) {
      const length = dv.getUint32(4);
      const data = new Uint8Array(length);
      let got = 0;
      while (got < length) {
        const r = await this.conn.read(data.subarray(got));
        if (r === null) return null;
        got += r;
      }
      return { ID: id, channelID, length, data };
    }
    return { ID: id, channelID }; // EofID / CloseID / OpenFailureID
  }
}

// One mux channel: a reliable ordered byte stream with windowing.
class Channel {
  constructor(session) {
    this.session = session;
    this.localId = 0;
    this.remoteId = 0;
    this.maxRemotePayload = channelMaxPacket;
    this.remoteWin = 0;
    this.myWindow = channelWindowSize;
    this.readBuf = new ReadBuffer();
    this.writers = [];
    this.ready = new WaitQueue();
    this.sentClose = false;
  }
  async read(p) {
    const n = await this.readBuf.read(p);
    if (n !== null && n > 0) await this.adjustWindow(n);
    return n;
  }
  async write(p) {
    while (p.length > 0) {
      const space = Math.min(this.maxRemotePayload, p.length);
      const reserved = Math.min(this.remoteWin, space);
      if (reserved <= 0) {
        await new Promise((resolve) => this.writers.push(resolve));
        continue;
      }
      this.remoteWin -= reserved;
      const toSend = p.subarray(0, reserved);
      await this.session.sendPacket({
        ID: DataID, channelID: this.remoteId, length: toSend.length, data: toSend,
      });
      p = p.subarray(reserved);
    }
  }
  async handle(msg) {
    if (msg.ID === DataID) {
      if (msg.length > this.myWindow) throw new Error("wanix.js: peer overran window");
      this.myWindow -= msg.length;
      this.readBuf.write(msg.data);
    } else if (msg.ID === CloseID) {
      this.readBuf.eof();
      this.sentClose = true;
    } else if (msg.ID === EofID) {
      this.readBuf.eof();
    } else if (msg.ID === OpenFailureID) {
      this.ready.push(false);
    } else if (msg.ID === OpenConfirmID) {
      this.remoteId = msg.senderID;
      this.maxRemotePayload = msg.maxPacketSize;
      this.remoteWin += msg.windowSize;
      this.ready.push(true);
    } else if (msg.ID === WindowAdjustID) {
      this.remoteWin += msg.additionalBytes;
      const writer = this.writers.shift();
      if (writer) writer();
    }
  }
  async adjustWindow(n) {
    this.myWindow += n;
    await this.session.sendPacket({ ID: WindowAdjustID, channelID: this.remoteId, additionalBytes: n });
  }
  async close() {
    if (this.sentClose) return;
    this.sentClose = true;
    this.readBuf.eof();
    await this.session.sendPacket({ ID: CloseID, channelID: this.remoteId });
  }
}

// Byte buffer with a reader-side promise queue (like a pipe).
class ReadBuffer {
  constructor() {
    this.buf = new Uint8Array(0);
    this.readers = [];
    this.eofed = false;
  }
  write(data) {
    const merged = new Uint8Array(this.buf.length + data.length);
    merged.set(this.buf, 0);
    merged.set(data, this.buf.length);
    this.buf = merged;
    while (this.buf.length > 0 && this.readers.length > 0) this.readers.shift()();
  }
  read(p) {
    return new Promise((resolve) => {
      const tryRead = () => {
        if (this.buf.length === 0) {
          if (this.eofed) { resolve(null); return; }
          this.readers.push(tryRead);
          return;
        }
        const n = Math.min(p.length, this.buf.length);
        p.set(this.buf.subarray(0, n));
        this.buf = this.buf.subarray(n);
        resolve(n);
      };
      tryRead();
    });
  }
  eof() {
    this.eofed = true;
    while (this.readers.length > 0) this.readers.shift()();
  }
}

class WaitQueue {
  constructor() {
    this.q = [];
    this.waiters = [];
  }
  push(value) {
    const waiter = this.waiters.shift();
    if (waiter) waiter(value);
    else this.q.push(value);
  }
  shift() {
    if (this.q.length > 0) return Promise.resolve(this.q.shift());
    return new Promise((resolve) => this.waiters.push(resolve));
  }
}

