// audio-tags.js — dependency-free music metadata + lyrics extraction.
//
// Two synchronous concerns over already-loaded bytes (no new runtime
// deps; the codebase is buildless and CDN-free by discipline):
//   1. parseAudioTags(bytes) — ID3v2 (2.2 / 2.3 / 2.4) text frames
//      (title / artist / album / track) plus embedded USLT lyrics.
//      MP3 is the only common container with ID3v2; FLAC/OGG/WAV fall
//      back to filename titles. Frame walking is bounded and stops at
//      the first non-frame byte, so untagged or corrupt files cost a
//      few microseconds.
//   2. parseLrc(text) — the [mm:ss.xx] sidecar format into a sorted
//      [{ time, text }] list that drives synced lyric display.
// Kept as a standalone module so the Music panel is not the only
// caller: any VFS file handler (a media inspector, a future podcast
// surface) can reuse both.

const ID3_MAX_SCAN = 4 * 1024 * 1024; // safety cap for frame walking

function decodeText(bytes, start, end, encoding) {
  const slice = bytes.subarray(start, end);
  if (encoding === 3) return new TextDecoder("utf-8").decode(slice);
  if (encoding === 1 || encoding === 2) {
    // UTF-16 with optional BOM; sniff it, default to BE when absent.
    if (slice.length >= 2) {
      if (slice[0] === 0xff && slice[1] === 0xfe) {
        return new TextDecoder("utf-16le").decode(slice.subarray(2));
      }
      if (slice[0] === 0xfe && slice[1] === 0xff) {
        return new TextDecoder("utf-16be").decode(slice.subarray(2));
      }
    }
    return new TextDecoder("utf-16be").decode(slice);
  }
  return new TextDecoder("iso-8859-1").decode(slice);
}

function readSyncsafe(bytes, offset) {
  return (
    ((bytes[offset] & 0x7f) << 21) |
    ((bytes[offset + 1] & 0x7f) << 14) |
    ((bytes[offset + 2] & 0x7f) << 7) |
    (bytes[offset + 3] & 0x7f)
  );
}

function readUint32(bytes, offset) {
  return (
    (bytes[offset] << 24) |
    (bytes[offset + 1] << 16) |
    (bytes[offset + 2] << 8) |
    bytes[offset + 3]
  );
}

function textFrameValue(bytes, start, end) {
  const encoding = bytes[start];
  return decodeText(bytes, start + 1, end, encoding)
    .replace(/\u0000+$/, "")
    .trim();
}

function usltFrameValue(bytes, start, end) {
  const encoding = bytes[start];
  // Skip the 3-byte language code, then the null-terminated descriptor.
  let cursor = start + 4;
  while (cursor < end && bytes[cursor] !== 0) cursor++;
  cursor += 1;
  if (
    (encoding === 1 || encoding === 2) && cursor < end && bytes[cursor] === 0
  ) {
    cursor += 1; // UTF-16 terminator is two bytes wide
  }
  return decodeText(bytes, cursor, end, encoding)
    .replace(/\u0000+$/, "")
    .trim();
}

function frameId(bytes, offset, width) {
  let id = "";
  for (let i = 0; i < width; i++) id += String.fromCharCode(bytes[offset + i]);
  return id;
}

// Returns { title, artist, album, track, lyrics } (absent keys omitted)
// or null when the bytes carry no ID3v2 header.
export function parseAudioTags(data) {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  if (
    bytes.length < 10 || bytes[0] !== 0x49 || bytes[1] !== 0x44 ||
    bytes[2] !== 0x33
  ) {
    return null;
  }
  const major = bytes[3];
  const flags = bytes[5];
  const tagSize = readSyncsafe(bytes, 6);
  const end = Math.min(bytes.length, 10 + tagSize, ID3_MAX_SCAN);
  let offset = 10;
  if (flags & 0x40) {
    // Extended header: the size field excludes its own 4 bytes; v2.4
    // sizes are syncsafe, v2.3 plain big-endian.
    const size = major === 4
      ? readSyncsafe(bytes, offset)
      : readUint32(bytes, offset);
    offset += 4 + size;
  }
  const meta = scanFrames(bytes, major, offset, end);
  return meta && (meta.title || meta.artist || meta.album || meta.lyrics)
    ? meta
    : null;
}

// Walk the ID3 frame area, collecting the text frames the player
// displays plus the first USLT lyrics frame. Stops at the first
// non-frame byte (padding).
function scanFrames(bytes, major, offset, end) {
  const meta = {};
  let lyrics = null;
  while (offset + 6 <= end && bytes[offset] !== 0) {
    let id;
    let size;
    let headerLen;
    if (major === 2) {
      id = frameId(bytes, offset, 3);
      size = (bytes[offset + 3] << 16) | (bytes[offset + 4] << 8) |
        bytes[offset + 5];
      headerLen = 6;
    } else {
      id = frameId(bytes, offset, 4);
      size = major === 4
        ? readSyncsafe(bytes, offset + 4)
        : readUint32(bytes, offset + 4);
      headerLen = 10;
    }
    if (size <= 0) break; // zero-length frame usually marks padding
    const frameStart = offset + headerLen;
    const frameEnd = Math.min(end, frameStart + size);
    if (id === "TIT2" || id === "TT2") {
      meta.title = textFrameValue(bytes, frameStart, frameEnd);
    } else if (id === "TPE1" || id === "TP1") {
      meta.artist = textFrameValue(bytes, frameStart, frameEnd);
    } else if (id === "TALB" || id === "TAL") {
      meta.album = textFrameValue(bytes, frameStart, frameEnd);
    } else if (id === "TRCK" || id === "TRK") {
      meta.track = textFrameValue(bytes, frameStart, frameEnd);
    } else if ((id === "USLT" || id === "ULT") && !lyrics) {
      lyrics = usltFrameValue(bytes, frameStart, frameEnd);
    }
    offset += headerLen + size;
  }
  if (lyrics) meta.lyrics = lyrics;
  return meta;
}

// Parses an .lrc sidecar into a time-sorted [{ time, text }] list.
// Lines may carry several timestamps ([00:01.00][00:05.50]…); metadata
// headers like [ti:…] are ignored by construction.
export function parseLrc(text) {
  const lines = [];
  const tagRe = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;
  for (const rawLine of String(text).split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const stamps = [];
    let match;
    while ((match = tagRe.exec(line))) {
      const minutes = Number(match[1]);
      const seconds = Number(match[2]);
      const fraction = match[3] ? Number(`0.${match[3].padEnd(3, "0")}`) : 0;
      stamps.push(minutes * 60 + seconds + fraction);
    }
    if (stamps.length === 0) continue;
    const content = line.replace(tagRe, "").trim();
    for (const time of stamps) lines.push({ time, text: content });
  }
  lines.sort((a, b) => a.time - b.time);
  return lines;
}
