"use strict";
(function() {

var $goVersion = "go1.21.13";
var $testBinary = "0";
Error.stackTraceLimit = Infinity;
var $NaN = NaN;
var $global, $module;
if (typeof window !== "undefined") {
  $global = window;
} else if (typeof self !== "undefined") {
  $global = self;
} else if (typeof global !== "undefined") {
  $global = global;
  $global.require = require;
} else {
  $global = this;
}
if ($global === void 0 || $global.Array === void 0) {
  throw new Error("no global object found");
}
if (typeof module !== "undefined") {
  $module = module;
}
if (!$global.fs && $global.require) {
  try {
    var fs = $global.require("fs");
    if (typeof fs === "object" && fs !== null && Object.keys(fs).length !== 0) {
      $global.fs = fs;
    }
  } catch (e) {
  }
}
if (!$global.fs) {
  var outputBuf = "";
  var decoder = new TextDecoder("utf-8");
  $global.fs = {
    constants: { O_WRONLY: -1, O_RDWR: -1, O_CREAT: -1, O_TRUNC: -1, O_APPEND: -1, O_EXCL: -1 },
    // unused
    writeSync: function writeSync(fd, buf) {
      if ($global.gopherjsWriteSyncHook) {
        outputBuf += decoder.decode(buf);
        $global.gopherjsWriteSyncHook(fd, outputBuf);
        outputBuf = "";
        return buf.length;
      }
      outputBuf += decoder.decode(buf);
      var nl = outputBuf.lastIndexOf("\n");
      if (nl != -1) {
        console.log(outputBuf.substring(0, nl));
        outputBuf = outputBuf.substring(nl + 1);
      }
      return buf.length;
    },
    write: function write(fd, buf, offset, length, position, callback) {
      if (offset !== 0 || length !== buf.length || position !== null) {
        callback(enosys());
        return;
      }
      var n = this.writeSync(fd, buf);
      callback(null, n);
    }
  };
}
var $linknames = {};
var $packages = {}, $idCounter = 0;
var $keys = (m) => {
  return m ? Object.keys(m) : [];
};
var $flushConsole = () => {
};
var $throwRuntimeError;
var $newPanicNilError;
var $throwNilPointerError = () => {
  $throwRuntimeError("invalid memory address or nil pointer dereference");
};
var $call = (fn, rcvr, args) => {
  return fn.apply(rcvr, args);
};
var $makeFunc = (fn) => {
  return function(...args) {
    return $externalize(fn(this, new ($sliceType($jsObjectPtr))($global.Array.prototype.slice.call(args, []))), $emptyInterface);
  };
};
var $unused = (v) => {
};
var $print = console.log;
if ($global.process !== void 0 && $global.require) {
  try {
    var util = $global.require("util");
    $print = function(...args) {
      $global.process.stderr.write(util.format.apply(this, args));
    };
  } catch (e) {
  }
}
var $println = console.log;
var $callstack = (skip, limit) => {
  const oldLimit = Error.stackTraceLimit;
  var stack;
  try {
    Error.stackTraceLimit = skip + limit;
    stack = new Error().stack;
  } finally {
    Error.stackTraceLimit = oldLimit;
  }
  if (!stack) return [];
  stack = stack.trim();
  const firstNl = stack.indexOf("\n");
  const firstLine = firstNl >= 0 ? stack.substring(0, firstNl) : stack;
  if (!firstLine.includes("@") && !firstLine.startsWith("at ")) {
    skip++;
  }
  return stack.split("\n").slice(skip);
};
var $parseCallFrame = (frame) => {
  const posRe = /^(.+?)(?::(\d+)(?::(\d+))?)?$/;
  const parsePos = (fnName, framePos) => {
    const m = posRe.exec(framePos);
    if (m) {
      const file = m[1] || "";
      const line = m[2] || 0;
      const col = m[3] || 0;
      return [fnName, file, line, col];
    }
    return [fnName, "", 0, 0];
  };
  const receiverRe = /^(?:(?:Object|typ\d*)\.)|(?:[a-zA-Z_$][a-zA-Z0-9_$]*\.(github\.com[\\|/]))/;
  const stripReceiver = (fnName) => fnName.replace(receiverRe, "$1");
  $parseCallFrame = (frame2) => {
    const atIdx = frame2.indexOf("@");
    if (atIdx >= 0) {
      const fnName2 = frame2.substring(0, atIdx) || "<none>";
      return parsePos(fnName2, frame2.substring(atIdx + 1));
    }
    const atLeadIdx = frame2.indexOf("at ");
    if (atLeadIdx >= 0) frame2 = frame2.substring(atLeadIdx + 3);
    const openIdx = frame2.lastIndexOf("(");
    if (openIdx === -1) {
      return parsePos("<none>", frame2);
    }
    var fnName = frame2.substring(0, frame2.indexOf("(")).trim();
    const asIdx = fnName.indexOf("[as ");
    if (asIdx > 0) {
      var closeIdx = fnName.indexOf("]");
      if (closeIdx === -1) closeIdx = fnName.length;
      fnName = fnName.substring(asIdx + 4, closeIdx).trim();
    }
    fnName = stripReceiver(fnName);
    var closeIdx = frame2.indexOf(")", openIdx);
    if (closeIdx === -1) closeIdx = frame2.length;
    var pos = frame2.substring(openIdx + 1, closeIdx);
    if (pos === "<anonymous>") {
      return [fnName, "<anonymous>", 0, 0];
    }
    return parsePos(fnName, pos);
  };
  return $parseCallFrame(frame);
};
var $callForAllPackages = (methodName) => {
  var names = $keys($packages);
  for (var i = 0; i < names.length; i++) {
    var f = $packages[names[i]][methodName];
    if (typeof f == "function") {
      f();
    }
  }
};
var $mapArray = (array, f) => {
  var newArray = new array.constructor(array.length);
  for (var i = 0; i < array.length; i++) {
    newArray[i] = f(array[i]);
  }
  return newArray;
};
var $mapIndex = (m, key) => {
  return typeof m.get === "function" ? m.get(key) : void 0;
};
var $mapDelete = (m, key) => {
  typeof m.delete === "function" && m.delete(key);
};
var $methodVal = (recv, name) => {
  var vals = recv.$methodVals || {};
  if (Object.isExtensible(recv)) {
    recv.$methodVals = vals;
  }
  var f = vals[name];
  if (f !== void 0) {
    return f;
  }
  var method = recv[name];
  f = method.bind(recv);
  vals[name] = f;
  return f;
};
var $methodExpr = (typ, name) => {
  var method = typ.prototype[name];
  if (method.$expr === void 0) {
    method.$expr = (...args) => {
      $stackDepthOffset--;
      try {
        if (typ.wrapped) {
          args[0] = new typ(args[0]);
        }
        return Function.call.apply(method, args);
      } finally {
        $stackDepthOffset++;
      }
    };
  }
  return method.$expr;
};
var $ifaceMethodExprs = {};
var $ifaceMethodExpr = (name) => {
  var expr = $ifaceMethodExprs["$" + name];
  if (expr === void 0) {
    expr = $ifaceMethodExprs["$" + name] = (...args) => {
      $stackDepthOffset--;
      try {
        return Function.call.apply(args[0][name], args);
      } finally {
        $stackDepthOffset++;
      }
    };
  }
  return expr;
};
var $subslice = (slice, low, high, max) => {
  if (high === void 0) {
    high = slice.$length;
  }
  if (max === void 0) {
    max = slice.$capacity;
  }
  if (low < 0 || high < low || max < high || high > slice.$capacity || max > slice.$capacity) {
    $throwRuntimeError("slice bounds out of range");
  }
  if (slice === slice.constructor.nil) {
    return slice;
  }
  var s = new slice.constructor(slice.$array);
  s.$offset = slice.$offset + low;
  s.$length = high - low;
  s.$capacity = max - low;
  return s;
};
var $substring = (str, low, high) => {
  if (low < 0 || high < low || high > str.length) {
    $throwRuntimeError("slice bounds out of range");
  }
  return str.substring(low, high);
};
var $sliceToNativeArray = (slice) => {
  if (slice.$array.constructor !== Array) {
    return slice.$array.subarray(slice.$offset, slice.$offset + slice.$length);
  }
  return slice.$array.slice(slice.$offset, slice.$offset + slice.$length);
};
var $sliceToGoArray = (slice, arrayPtrType) => {
  var arrayType = arrayPtrType.elem;
  if (arrayType !== void 0 && slice.$length < arrayType.len) {
    $throwRuntimeError("cannot convert slice with length " + slice.$length + " to pointer to array with length " + arrayType.len);
  }
  if (slice == slice.constructor.nil) {
    return arrayPtrType.nil;
  }
  if (slice.$array.constructor !== Array) {
    return slice.$array.subarray(slice.$offset, slice.$offset + arrayType.len);
  }
  if (slice.$offset == 0 && slice.$length == slice.$capacity && slice.$length == arrayType.len) {
    return slice.$array;
  }
  if (arrayType.len == 0) {
    return new arrayType([]);
  }
  $throwRuntimeError("gopherjs: non-numeric slice to underlying array conversion is not supported for subslices");
};
var $convertSliceType = (slice, desiredType) => {
  if (slice == slice.constructor.nil) {
    return desiredType.nil;
  }
  return $subslice(new desiredType(slice.$array), slice.$offset, slice.$offset + slice.$length, slice.$offset + slice.$capacity);
};
var $decodeRune = (str, pos) => {
  var c0 = str.charCodeAt(pos);
  if (c0 < 128) {
    return [c0, 1];
  }
  if (c0 !== c0 || c0 < 192) {
    return [65533, 1];
  }
  var c1 = str.charCodeAt(pos + 1);
  if (c1 !== c1 || c1 < 128 || 192 <= c1) {
    return [65533, 1];
  }
  if (c0 < 224) {
    var r = (c0 & 31) << 6 | c1 & 63;
    if (r <= 127) {
      return [65533, 1];
    }
    return [r, 2];
  }
  var c2 = str.charCodeAt(pos + 2);
  if (c2 !== c2 || c2 < 128 || 192 <= c2) {
    return [65533, 1];
  }
  if (c0 < 240) {
    var r = (c0 & 15) << 12 | (c1 & 63) << 6 | c2 & 63;
    if (r <= 2047) {
      return [65533, 1];
    }
    if (55296 <= r && r <= 57343) {
      return [65533, 1];
    }
    return [r, 3];
  }
  var c3 = str.charCodeAt(pos + 3);
  if (c3 !== c3 || c3 < 128 || 192 <= c3) {
    return [65533, 1];
  }
  if (c0 < 248) {
    var r = (c0 & 7) << 18 | (c1 & 63) << 12 | (c2 & 63) << 6 | c3 & 63;
    if (r <= 65535 || 1114111 < r) {
      return [65533, 1];
    }
    return [r, 4];
  }
  return [65533, 1];
};
var $encodeRune = (r) => {
  if (r < 0 || r > 1114111 || 55296 <= r && r <= 57343) {
    r = 65533;
  }
  if (r <= 127) {
    return String.fromCharCode(r);
  }
  if (r <= 2047) {
    return String.fromCharCode(192 | r >> 6, 128 | r & 63);
  }
  if (r <= 65535) {
    return String.fromCharCode(224 | r >> 12, 128 | r >> 6 & 63, 128 | r & 63);
  }
  return String.fromCharCode(240 | r >> 18, 128 | r >> 12 & 63, 128 | r >> 6 & 63, 128 | r & 63);
};
var $stringToBytes = (str) => {
  var array = new Uint8Array(str.length);
  for (var i = 0; i < str.length; i++) {
    array[i] = str.charCodeAt(i);
  }
  return array;
};
var $bytesToString = (slice) => {
  if (slice.$length === 0) {
    return "";
  }
  var str = "";
  for (var i = 0; i < slice.$length; i += 1e4) {
    str += String.fromCharCode.apply(void 0, slice.$array.subarray(slice.$offset + i, slice.$offset + Math.min(slice.$length, i + 1e4)));
  }
  return str;
};
var $stringToRunes = (str) => {
  var array = new Int32Array(str.length);
  var rune, j = 0;
  for (var i = 0; i < str.length; i += rune[1], j++) {
    rune = $decodeRune(str, i);
    array[j] = rune[0];
  }
  return array.subarray(0, j);
};
var $runesToString = (slice) => {
  if (slice.$length === 0) {
    return "";
  }
  var str = "";
  for (var i = 0; i < slice.$length; i++) {
    str += $encodeRune(slice.$array[slice.$offset + i]);
  }
  return str;
};
var $copyString = (dst, src) => {
  var n = Math.min(src.length, dst.$length);
  for (var i = 0; i < n; i++) {
    dst.$array[dst.$offset + i] = src.charCodeAt(i);
  }
  return n;
};
var $copySlice = (dst, src) => {
  var n = Math.min(src.$length, dst.$length);
  $copyArray(dst.$array, src.$array, dst.$offset, src.$offset, n, dst.constructor.elem);
  return n;
};
var $copyArray = (dst, src, dstOffset, srcOffset, n, elem) => {
  if (n === 0 || dst === src && dstOffset === srcOffset) {
    return;
  }
  if (src.subarray) {
    dst.set(src.subarray(srcOffset, srcOffset + n), dstOffset);
    return;
  }
  switch (elem.kind) {
    case $kindArray:
    case $kindStruct:
      if (dst === src && dstOffset > srcOffset) {
        for (var i = n - 1; i >= 0; i--) {
          elem.copy(dst[dstOffset + i], src[srcOffset + i]);
        }
        return;
      }
      for (var i = 0; i < n; i++) {
        elem.copy(dst[dstOffset + i], src[srcOffset + i]);
      }
      return;
  }
  if (dst === src && dstOffset > srcOffset) {
    for (var i = n - 1; i >= 0; i--) {
      dst[dstOffset + i] = src[srcOffset + i];
    }
    return;
  }
  for (var i = 0; i < n; i++) {
    dst[dstOffset + i] = src[srcOffset + i];
  }
};
var $clone = (src, type) => {
  var clone = type.zero();
  type.copy(clone, src);
  return clone;
};
var $pointerOfStructConversion = (obj, type) => {
  if (obj === (obj.constructor && obj.constructor.nil)) {
    return type.nil;
  }
  if (obj.$proxies === void 0) {
    obj.$proxies = {};
    obj.$proxies[obj.constructor.id] = obj;
  }
  var proxy = obj.$proxies[type.id];
  if (proxy === void 0) {
    var properties = {};
    for (var i = 0; i < type.elem.fields.length; i++) {
      ((fieldProp) => {
        properties[fieldProp] = {
          get() {
            return obj[fieldProp];
          },
          set(value) {
            obj[fieldProp] = value;
          }
        };
      })(type.elem.fields[i].prop);
    }
    proxy = Object.create(type.prototype, properties);
    proxy.$val = proxy;
    obj.$proxies[type.id] = proxy;
    proxy.$proxies = obj.$proxies;
  }
  return proxy;
};
var $append = function(slice) {
  return $internalAppend(slice, arguments, 1, arguments.length - 1);
};
var $appendSlice = (slice, toAppend) => {
  if (toAppend.constructor === String) {
    var bytes = $stringToBytes(toAppend);
    return $internalAppend(slice, bytes, 0, bytes.length);
  }
  return $internalAppend(slice, toAppend.$array, toAppend.$offset, toAppend.$length);
};
var $internalAppend = (slice, array, offset, length) => {
  if (length === 0) {
    return slice;
  }
  let newLength = slice.$length + length;
  let newSlice = $growSlice(slice, newLength);
  let newArray = newSlice.$array;
  $copyArray(newArray, array, newSlice.$offset + newSlice.$length, offset, length, newSlice.constructor.elem);
  newSlice.$length = newLength;
  return newSlice;
};
const $calculateNewCapacity = (minCapacity, oldCapacity) => {
  return Math.max(minCapacity, oldCapacity < 1024 ? oldCapacity * 2 : Math.floor(oldCapacity * 5 / 4));
};
var $growSlice = (slice, minCapacity) => {
  let array = slice.$array;
  let offset = slice.$offset;
  const length = slice.$length;
  let capacity = slice.$capacity;
  if (minCapacity > capacity) {
    capacity = $calculateNewCapacity(minCapacity, capacity);
    let newArray;
    if (array.constructor === Array) {
      newArray = array.slice(offset, offset + length);
      newArray.length = capacity;
      const zero = slice.constructor.elem.zero;
      for (let i = slice.$length; i < capacity; i++) {
        newArray[i] = zero();
      }
    } else {
      newArray = new array.constructor(capacity);
      newArray.set(array.subarray(offset, offset + length));
    }
    array = newArray;
    offset = 0;
  }
  let newSlice = new slice.constructor(array);
  newSlice.$offset = offset;
  newSlice.$length = length;
  newSlice.$capacity = capacity;
  return newSlice;
};
var $equal = (a, b, type) => {
  if (type === $jsObjectPtr) {
    return a === b;
  }
  switch (type.kind) {
    case $kindComplex64:
    case $kindComplex128:
      return a.$real === b.$real && a.$imag === b.$imag;
    case $kindInt64:
    case $kindUint64:
      return a.$high === b.$high && a.$low === b.$low;
    case $kindArray:
      if (a.length !== b.length) {
        return false;
      }
      for (var i = 0; i < a.length; i++) {
        if (!$equal(a[i], b[i], type.elem)) {
          return false;
        }
      }
      return true;
    case $kindStruct:
      for (var i = 0; i < type.fields.length; i++) {
        var f = type.fields[i];
        if (!$equal(a[f.prop], b[f.prop], f.typ)) {
          return false;
        }
      }
      return true;
    case $kindInterface:
      return $interfaceIsEqual(a, b);
    default:
      return a === b;
  }
};
var $interfaceIsEqual = (a, b) => {
  if (a === $ifaceNil || b === $ifaceNil) {
    return a === b;
  }
  if (a.constructor !== b.constructor) {
    return false;
  }
  if (a.constructor === $jsObjectPtr) {
    return a.object === b.object;
  }
  if (!a.constructor.comparable) {
    $throwRuntimeError("comparing uncomparable type " + a.constructor.string);
  }
  return $equal(a.$val, b.$val, a.constructor);
};
var $unsafeMethodToFunction = (typ, name, isPtr) => {
  if (isPtr) {
    return (r, ...args) => {
      var ptrType = $ptrType(typ);
      if (r.constructor != ptrType) {
        switch (typ.kind) {
          case $kindStruct:
            r = $pointerOfStructConversion(r, ptrType);
            break;
          case $kindArray:
            r = new ptrType(r);
            break;
          default:
            r = new ptrType(r.$get, r.$set, r.$target, r.$index);
        }
      }
      return r[name](...args);
    };
  } else {
    return (r, ...args) => {
      var ptrType = $ptrType(typ);
      if (r.constructor != ptrType) {
        switch (typ.kind) {
          case $kindStruct:
            r = $clone(r, typ);
            break;
          case $kindSlice:
            r = $convertSliceType(r, typ);
            break;
          case $kindComplex64:
          case $kindComplex128:
            r = new typ(r.$real, r.$imag);
            break;
          default:
            r = new typ(r);
        }
      }
      return r[name](...args);
    };
  }
};
var $id = (x) => {
  return x;
};
var $instanceOf = (x, y) => {
  return x instanceof y;
};
var $typeOf = (x) => {
  return typeof x;
};
var $unsafeString = (ptr, len) => {
  var byteSliceType = $sliceType($Uint8);
  return $bytesToString($unsafeSlice(ptr, len, byteSliceType, "String"));
};
var $unsafeStringData = (str) => {
  if (str.length === 0) {
    return $ptrType($Uint8).nil;
  }
  var byteSliceType = $sliceType($Uint8);
  var b = new byteSliceType($stringToBytes(str));
  return $unsafeSliceData(b, byteSliceType);
};
var $unsafeSlice = (ptr, len, typ, methodName = "Slice") => {
  if (len < 0) {
    $throwRuntimeError("unsafe." + methodName + ": len out of range");
  }
  var ptrType = $ptrType(typ.elem);
  if (ptr === ptrType.nil || ptr.$target === void 0) {
    if (len > 0) {
      $throwRuntimeError("unsafe." + methodName + ": ptr is nil and len is not zero");
    }
    return typ.nil;
  }
  if (len === 0) {
    var s = new typ(ptr.$target);
    s.$offset = ptr.$index !== void 0 ? ptr.$index : 0;
    s.$length = 0;
    s.$capacity = 0;
    return s;
  }
  if (ptr.$index === void 0) {
    $throwRuntimeError("unsafe." + methodName + ": pointer does not address a slice or array element (missing index)");
  }
  if (ptr.$target.buffer && ptr.$target.BYTES_PER_ELEMENT && ptr.$target.constructor !== $nativeArray(typ.elem.kind)) {
    $throwRuntimeError("unsafe." + methodName + ": pointer does not match slice element storage layout");
  }
  if (ptr.$index + len > ptr.$target.length) {
    $throwRuntimeError("unsafe." + methodName + ": len out of range");
  }
  var s = new typ(ptr.$target);
  s.$offset = ptr.$index;
  s.$length = len;
  s.$capacity = len;
  return s;
};
var $unsafeSliceData = (slice, typ) => {
  var ptrType = $ptrType(typ.elem);
  if (slice === typ.nil) {
    return ptrType.nil;
  }
  return $indexPtr(slice.$array, slice.$offset, ptrType);
};
var $clearSlice = (slice) => {
  const n = slice.$length;
  if (n === 0) {
    return;
  }
  const arr = slice.$array;
  const off = slice.$offset;
  const zeroFn = slice.constructor.elem.zero;
  for (let i = 0; i < n; i++) {
    arr[off + i] = zeroFn();
  }
};
var $clearMap = (m) => {
  typeof m.clear === "function" && m.clear();
};
var $min = Math.min;
var $max = Math.max;
var $less64 = (x, y) => x.$high < y.$high || x.$high === y.$high && x.$low < y.$low;
var $min64 = (first, ...rest) => rest.reduce((m, x) => $less64(x, m) ? x : m, first);
var $max64 = (first, ...rest) => rest.reduce((m, x) => $less64(m, x) ? x : m, first);
var $minStr = (first, ...rest) => rest.reduce((m, x) => x < m ? x : m, first);
var $maxStr = (first, ...rest) => rest.reduce((m, x) => m < x ? x : m, first);
var $mod = (x, y) => {
  return x % y;
};
var $parseInt = parseInt;
var $parseFloat = (f) => {
  if (f !== void 0 && f !== null && f.constructor === Number) {
    return f;
  }
  return parseFloat(f);
};
var $froundBuf = new Float32Array(1);
var $fround = Math.fround || ((f) => {
  $froundBuf[0] = f;
  return $froundBuf[0];
});
var $imul = Math.imul || ((a, b) => {
  var ah = a >>> 16 & 65535;
  var al = a & 65535;
  var bh = b >>> 16 & 65535;
  var bl = b & 65535;
  return al * bl + (ah * bl + al * bh << 16 >>> 0) >> 0;
});
var $floatKey = (f) => {
  if (f !== f) {
    $idCounter++;
    return "NaN$" + $idCounter;
  }
  return String(f);
};
var $flatten64 = (x) => {
  return x.$high * 4294967296 + x.$low;
};
var $shiftLeft64 = (x, y) => {
  if (y === 0) {
    return x;
  }
  if (y < 32) {
    return new x.constructor(x.$high << y | x.$low >>> 32 - y, x.$low << y >>> 0);
  }
  if (y < 64) {
    return new x.constructor(x.$low << y - 32, 0);
  }
  return new x.constructor(0, 0);
};
var $shiftRightInt64 = (x, y) => {
  if (y === 0) {
    return x;
  }
  if (y < 32) {
    return new x.constructor(x.$high >> y, (x.$low >>> y | x.$high << 32 - y) >>> 0);
  }
  if (y < 64) {
    return new x.constructor(x.$high >> 31, x.$high >> y - 32 >>> 0);
  }
  if (x.$high < 0) {
    return new x.constructor(-1, 4294967295);
  }
  return new x.constructor(0, 0);
};
var $shiftRightUint64 = (x, y) => {
  if (y === 0) {
    return x;
  }
  if (y < 32) {
    return new x.constructor(x.$high >>> y, (x.$low >>> y | x.$high << 32 - y) >>> 0);
  }
  if (y < 64) {
    return new x.constructor(0, x.$high >>> y - 32);
  }
  return new x.constructor(0, 0);
};
var $mul64 = (x, y) => {
  var x48 = x.$high >>> 16;
  var x32 = x.$high & 65535;
  var x16 = x.$low >>> 16;
  var x00 = x.$low & 65535;
  var y48 = y.$high >>> 16;
  var y32 = y.$high & 65535;
  var y16 = y.$low >>> 16;
  var y00 = y.$low & 65535;
  var z48 = 0, z32 = 0, z16 = 0, z00 = 0;
  z00 += x00 * y00;
  z16 += z00 >>> 16;
  z00 &= 65535;
  z16 += x16 * y00;
  z32 += z16 >>> 16;
  z16 &= 65535;
  z16 += x00 * y16;
  z32 += z16 >>> 16;
  z16 &= 65535;
  z32 += x32 * y00;
  z48 += z32 >>> 16;
  z32 &= 65535;
  z32 += x16 * y16;
  z48 += z32 >>> 16;
  z32 &= 65535;
  z32 += x00 * y32;
  z48 += z32 >>> 16;
  z32 &= 65535;
  z48 += x48 * y00 + x32 * y16 + x16 * y32 + x00 * y48;
  z48 &= 65535;
  var hi = (z48 << 16 | z32) >>> 0;
  var lo = (z16 << 16 | z00) >>> 0;
  var r = new x.constructor(hi, lo);
  return r;
};
var $div64 = (x, y, returnRemainder) => {
  if (y.$high === 0 && y.$low === 0) {
    $throwRuntimeError("integer divide by zero");
  }
  var s = 1;
  var rs = 1;
  var xHigh = x.$high;
  var xLow = x.$low;
  if (xHigh < 0) {
    s = -1;
    rs = -1;
    xHigh = -xHigh;
    if (xLow !== 0) {
      xHigh--;
      xLow = 4294967296 - xLow;
    }
  }
  var yHigh = y.$high;
  var yLow = y.$low;
  if (y.$high < 0) {
    s *= -1;
    yHigh = -yHigh;
    if (yLow !== 0) {
      yHigh--;
      yLow = 4294967296 - yLow;
    }
  }
  var high = 0, low = 0, n = 0;
  while (yHigh < 2147483648 && (xHigh > yHigh || xHigh === yHigh && xLow > yLow)) {
    yHigh = (yHigh << 1 | yLow >>> 31) >>> 0;
    yLow = yLow << 1 >>> 0;
    n++;
  }
  for (var i = 0; i <= n; i++) {
    high = high << 1 | low >>> 31;
    low = low << 1 >>> 0;
    if (xHigh > yHigh || xHigh === yHigh && xLow >= yLow) {
      xHigh = xHigh - yHigh;
      xLow = xLow - yLow;
      if (xLow < 0) {
        xHigh--;
        xLow += 4294967296;
      }
      low++;
      if (low === 4294967296) {
        high++;
        low = 0;
      }
    }
    yLow = (yLow >>> 1 | yHigh << 32 - 1) >>> 0;
    yHigh = yHigh >>> 1;
  }
  if (returnRemainder) {
    return new x.constructor(xHigh * rs, xLow * rs);
  }
  return new x.constructor(high * s, low * s);
};
var $divComplex = (n, d) => {
  var ninf = n.$real === Infinity || n.$real === -Infinity || n.$imag === Infinity || n.$imag === -Infinity;
  var dinf = d.$real === Infinity || d.$real === -Infinity || d.$imag === Infinity || d.$imag === -Infinity;
  var nnan = !ninf && (n.$real !== n.$real || n.$imag !== n.$imag);
  var dnan = !dinf && (d.$real !== d.$real || d.$imag !== d.$imag);
  if (nnan || dnan) {
    return new n.constructor(NaN, NaN);
  }
  if (ninf && !dinf) {
    return new n.constructor(Infinity, Infinity);
  }
  if (!ninf && dinf) {
    return new n.constructor(0, 0);
  }
  if (d.$real === 0 && d.$imag === 0) {
    if (n.$real === 0 && n.$imag === 0) {
      return new n.constructor(NaN, NaN);
    }
    return new n.constructor(Infinity, Infinity);
  }
  var a = Math.abs(d.$real);
  var b = Math.abs(d.$imag);
  if (a <= b) {
    var ratio = d.$real / d.$imag;
    var denom = d.$real * ratio + d.$imag;
    return new n.constructor((n.$real * ratio + n.$imag) / denom, (n.$imag * ratio - n.$real) / denom);
  }
  var ratio = d.$imag / d.$real;
  var denom = d.$imag * ratio + d.$real;
  return new n.constructor((n.$imag * ratio + n.$real) / denom, (n.$imag - n.$real * ratio) / denom);
};
var $kindBool = 1;
var $kindInt = 2;
var $kindInt8 = 3;
var $kindInt16 = 4;
var $kindInt32 = 5;
var $kindInt64 = 6;
var $kindUint = 7;
var $kindUint8 = 8;
var $kindUint16 = 9;
var $kindUint32 = 10;
var $kindUint64 = 11;
var $kindUintptr = 12;
var $kindFloat32 = 13;
var $kindFloat64 = 14;
var $kindComplex64 = 15;
var $kindComplex128 = 16;
var $kindArray = 17;
var $kindChan = 18;
var $kindFunc = 19;
var $kindInterface = 20;
var $kindMap = 21;
var $kindPtr = 22;
var $kindSlice = 23;
var $kindString = 24;
var $kindStruct = 25;
var $kindUnsafePointer = 26;
var $methodSynthesizers = [];
var $addMethodSynthesizer = (f) => {
  if ($methodSynthesizers === null) {
    f();
    return;
  }
  $methodSynthesizers.push(f);
};
var $synthesizeMethods = () => {
  $methodSynthesizers.forEach((f) => {
    f();
  });
  $methodSynthesizers = null;
};
var $ifaceKeyFor = (x) => {
  if (x === $ifaceNil) {
    return "nil";
  }
  var c = x.constructor;
  return c.string + "$" + c.keyFor(x.$val);
};
var $identity = (x) => {
  return x;
};
var $typeIDCounter = 0;
var $idKey = (x) => {
  if (x.$id === void 0) {
    $idCounter++;
    x.$id = $idCounter;
  }
  return String(x.$id);
};
var $arrayPtrCtor = () => {
  return function(array) {
    this.$get = () => {
      return array;
    };
    this.$set = function(v) {
      typ.copy(this, v);
    };
    this.$val = array;
  };
};
var $newType = (size, kind, string, named, pkg, exported, constructor) => {
  var typ2;
  switch (kind) {
    case $kindBool:
    case $kindInt:
    case $kindInt8:
    case $kindInt16:
    case $kindInt32:
    case $kindUint:
    case $kindUint8:
    case $kindUint16:
    case $kindUint32:
    case $kindUintptr:
    case $kindUnsafePointer:
      typ2 = function(v) {
        this.$val = v;
      };
      typ2.wrapped = true;
      typ2.keyFor = $identity;
      break;
    case $kindString:
      typ2 = function(v) {
        this.$val = v;
      };
      typ2.wrapped = true;
      typ2.keyFor = (x) => {
        return "$" + x;
      };
      break;
    case $kindFloat32:
    case $kindFloat64:
      typ2 = function(v) {
        this.$val = v;
      };
      typ2.wrapped = true;
      typ2.keyFor = (x) => {
        return $floatKey(x);
      };
      break;
    case $kindInt64:
      typ2 = function(high, low) {
        this.$high = high + Math.floor(Math.ceil(low) / 4294967296) >> 0;
        this.$low = low >>> 0;
        this.$val = this;
      };
      typ2.keyFor = (x) => {
        return x.$high + "$" + x.$low;
      };
      break;
    case $kindUint64:
      typ2 = function(high, low) {
        this.$high = high + Math.floor(Math.ceil(low) / 4294967296) >>> 0;
        this.$low = low >>> 0;
        this.$val = this;
      };
      typ2.keyFor = (x) => {
        return x.$high + "$" + x.$low;
      };
      break;
    case $kindComplex64:
      typ2 = function(real, imag) {
        this.$real = $fround(real);
        this.$imag = $fround(imag);
        this.$val = this;
      };
      typ2.keyFor = (x) => {
        return x.$real + "$" + x.$imag;
      };
      break;
    case $kindComplex128:
      typ2 = function(real, imag) {
        this.$real = real;
        this.$imag = imag;
        this.$val = this;
      };
      typ2.keyFor = (x) => {
        return x.$real + "$" + x.$imag;
      };
      break;
    case $kindArray:
      typ2 = function(v) {
        this.$val = v;
      };
      typ2.wrapped = true;
      typ2.ptr = $newType(4, $kindPtr, "*" + string, false, "", false, $arrayPtrCtor());
      typ2.init = (elem, len) => {
        typ2.elem = elem;
        typ2.len = len;
        typ2.comparable = elem.comparable;
        typ2.keyFor = (x) => {
          return Array.prototype.join.call($mapArray(x, (e) => {
            return String(elem.keyFor(e)).replace(/\\/g, "\\\\").replace(/\$/g, "\\$");
          }), "$");
        };
        typ2.copy = (dst, src) => {
          if (src.length === void 0) {
            if (src.$length < dst.length) {
              $throwRuntimeError("cannot convert slice with length " + src.$length + " to array or pointer to array with length " + dst.length);
            }
            $copyArray(dst, src.$array, 0, src.$offset, dst.length, elem);
          } else {
            $copyArray(dst, src, 0, 0, src.length, elem);
          }
        };
        typ2.ptr.init(typ2);
        Object.defineProperty(typ2.ptr.nil, "nilCheck", { get: $throwNilPointerError });
      };
      break;
    case $kindChan:
      typ2 = function(v) {
        this.$val = v;
      };
      typ2.wrapped = true;
      typ2.keyFor = $idKey;
      typ2.init = (elem, sendOnly, recvOnly) => {
        typ2.elem = elem;
        typ2.sendOnly = sendOnly;
        typ2.recvOnly = recvOnly;
      };
      break;
    case $kindFunc:
      typ2 = function(v) {
        this.$val = v;
      };
      typ2.wrapped = true;
      typ2.init = (params, results, variadic) => {
        typ2.params = params;
        typ2.results = results;
        typ2.variadic = variadic;
        typ2.comparable = false;
      };
      break;
    case $kindInterface:
      typ2 = { implementedBy: {}, missingMethodFor: {} };
      typ2.keyFor = $ifaceKeyFor;
      typ2.init = (methods) => {
        typ2.methods = methods;
        methods.forEach((m) => {
          $ifaceNil[m.prop] = $throwNilPointerError;
        });
      };
      break;
    case $kindMap:
      typ2 = function(v) {
        this.$val = v;
      };
      typ2.wrapped = true;
      typ2.init = (key, elem) => {
        typ2.key = key;
        typ2.elem = elem;
        typ2.comparable = false;
      };
      break;
    case $kindPtr:
      typ2 = constructor || function(getter, setter, target, index) {
        this.$get = getter;
        this.$set = setter;
        this.$target = target;
        if (index !== void 0) this.$index = index;
        this.$val = this;
      };
      typ2.keyFor = $idKey;
      typ2.init = (elem) => {
        typ2.elem = elem;
        typ2.wrapped = elem.kind === $kindArray;
        typ2.nil = new typ2($throwNilPointerError, $throwNilPointerError);
      };
      break;
    case $kindSlice:
      typ2 = function(array) {
        if (array.constructor !== typ2.nativeArray) {
          array = new typ2.nativeArray(array);
        }
        this.$array = array;
        this.$offset = 0;
        this.$length = array.length;
        this.$capacity = array.length;
        this.$val = this;
      };
      typ2.init = (elem) => {
        typ2.elem = elem;
        typ2.comparable = false;
        typ2.nativeArray = $nativeArray(elem.kind);
        typ2.nil = new typ2([]);
        Object.freeze(typ2.nil);
      };
      break;
    case $kindStruct:
      typ2 = function(v) {
        this.$val = v;
      };
      typ2.wrapped = true;
      typ2.ptr = $newType(4, $kindPtr, "*" + string, false, pkg, exported, constructor);
      typ2.ptr.elem = typ2;
      typ2.ptr.prototype.$get = function() {
        return this;
      };
      typ2.ptr.prototype.$set = function(v) {
        typ2.copy(this, v);
      };
      typ2.init = (pkgPath, fields) => {
        typ2.pkgPath = pkgPath;
        typ2.fields = fields;
        fields.forEach((f) => {
          if (!f.typ.comparable) {
            typ2.comparable = false;
          }
        });
        typ2.keyFor = (x) => {
          var val = x.$val;
          return $mapArray(fields, (f) => {
            return String(f.typ.keyFor(val[f.prop])).replace(/\\/g, "\\\\").replace(/\$/g, "\\$");
          }).join("$");
        };
        typ2.copy = (dst, src) => {
          for (var i = 0; i < fields.length; i++) {
            var f = fields[i];
            switch (f.typ.kind) {
              case $kindArray:
              case $kindStruct:
                f.typ.copy(dst[f.prop], src[f.prop]);
                continue;
              default:
                dst[f.prop] = src[f.prop];
                continue;
            }
          }
        };
        var properties = {};
        fields.forEach((f) => {
          properties[f.prop] = { get: $throwNilPointerError, set: $throwNilPointerError };
        });
        typ2.ptr.nil = Object.create(constructor.prototype, properties);
        typ2.ptr.nil.$val = typ2.ptr.nil;
        $addMethodSynthesizer(() => {
          var synthesizeMethod = (target, m, f) => {
            if (target.prototype[m.prop] !== void 0) {
              return;
            }
            target.prototype[m.prop] = function(...args) {
              var v = this.$val[f.prop];
              if (f.typ === $jsObjectPtr) {
                v = new $jsObjectPtr(v);
              }
              if (v.$val === void 0) {
                v = new f.typ(v);
              }
              return v[m.prop](...args);
            };
          };
          fields.forEach((f) => {
            if (f.embedded) {
              $methodSet(f.typ).forEach((m) => {
                synthesizeMethod(typ2, m, f);
                synthesizeMethod(typ2.ptr, m, f);
              });
              $methodSet($ptrType(f.typ)).forEach((m) => {
                synthesizeMethod(typ2.ptr, m, f);
              });
            }
          });
        });
      };
      break;
    default:
      $panic(new $String("invalid kind: " + kind));
  }
  switch (kind) {
    case $kindBool:
    case $kindMap:
      typ2.zero = () => {
        return false;
      };
      break;
    case $kindInt:
    case $kindInt8:
    case $kindInt16:
    case $kindInt32:
    case $kindUint:
    case $kindUint8:
    case $kindUint16:
    case $kindUint32:
    case $kindUintptr:
    case $kindUnsafePointer:
    case $kindFloat32:
    case $kindFloat64:
      typ2.zero = () => {
        return 0;
      };
      break;
    case $kindString:
      typ2.zero = () => {
        return "";
      };
      break;
    case $kindInt64:
    case $kindUint64:
    case $kindComplex64:
    case $kindComplex128:
      var zero = new typ2(0, 0);
      typ2.zero = () => {
        return zero;
      };
      break;
    case $kindPtr:
    case $kindSlice:
      typ2.zero = () => {
        return typ2.nil;
      };
      break;
    case $kindChan:
      typ2.zero = () => {
        return $chanNil;
      };
      break;
    case $kindFunc:
      typ2.zero = () => {
        return $throwNilPointerError;
      };
      break;
    case $kindInterface:
      typ2.zero = () => {
        return $ifaceNil;
      };
      break;
    case $kindArray:
      typ2.zero = () => {
        var arrayClass = $nativeArray(typ2.elem.kind);
        if (arrayClass !== Array) {
          return new arrayClass(typ2.len);
        }
        var array = new Array(typ2.len);
        for (var i = 0; i < typ2.len; i++) {
          array[i] = typ2.elem.zero();
        }
        return array;
      };
      break;
    case $kindStruct:
      typ2.zero = () => {
        return new typ2.ptr();
      };
      break;
    default:
      $panic(new $String("invalid kind: " + kind));
  }
  typ2.id = $typeIDCounter;
  $typeIDCounter++;
  typ2.size = size;
  typ2.kind = kind;
  typ2.string = string;
  typ2.named = named;
  typ2.pkg = pkg;
  typ2.exported = exported;
  typ2.methods = [];
  typ2.methodSetCache = null;
  typ2.comparable = true;
  return typ2;
};
var $methodSet = (typ2) => {
  if (typ2.methodSetCache !== null) {
    return typ2.methodSetCache;
  }
  var base = {};
  var isPtr = typ2.kind === $kindPtr;
  if (isPtr && typ2.elem.kind === $kindInterface) {
    typ2.methodSetCache = [];
    return [];
  }
  var current = [{ typ: isPtr ? typ2.elem : typ2, indirect: isPtr, shadow: void 0 }];
  var seen = {};
  while (current.length > 0) {
    var next = [];
    var mset = {};
    current.forEach((e) => {
      if (seen[e.typ.id]) {
        return;
      }
      seen[e.typ.id] = true;
      const promotePair = (name, m) => {
        if (mset[name] === null) {
          return;
        } else if (e.shadow && e.shadow[name]) {
          return;
        } else if (mset[name] === void 0) {
          mset[name] = m;
        } else if (mset[name] !== m) {
          mset[name] = null;
        }
      };
      const promote = (methods) => {
        methods.forEach((m) => promotePair(m.name, m));
      };
      if (e.typ.named) {
        promote(e.typ.methods);
        if (e.indirect) {
          promote($ptrType(e.typ).methods);
        }
      }
      switch (e.typ.kind) {
        case $kindStruct:
          var nextShadow = {};
          Object.assign(nextShadow, e.shadow);
          e.typ.fields.forEach((f) => {
            nextShadow[f.name] = true;
            promotePair(f.name, null);
          });
          e.typ.fields.forEach((f) => {
            if (f.embedded) {
              var fTyp = f.typ;
              var fIsPtr = fTyp.kind === $kindPtr;
              next.push({
                typ: fIsPtr ? fTyp.elem : fTyp,
                indirect: e.indirect || fIsPtr,
                shadow: nextShadow
              });
            }
          });
          break;
        case $kindInterface:
          promote(e.typ.methods);
          break;
      }
    });
    for (const [name, m] of Object.entries(mset)) {
      if (m !== null && base[name] === void 0) {
        base[name] = m;
      }
    }
    current = next;
  }
  typ2.methodSetCache = [];
  Object.keys(base).sort().forEach((name) => {
    typ2.methodSetCache.push(base[name]);
  });
  return typ2.methodSetCache;
};
var $Bool = $newType(1, $kindBool, "bool", true, "", false, null);
var $Int = $newType(4, $kindInt, "int", true, "", false, null);
var $Int8 = $newType(1, $kindInt8, "int8", true, "", false, null);
var $Int16 = $newType(2, $kindInt16, "int16", true, "", false, null);
var $Int32 = $newType(4, $kindInt32, "int32", true, "", false, null);
var $Int64 = $newType(8, $kindInt64, "int64", true, "", false, null);
var $Uint = $newType(4, $kindUint, "uint", true, "", false, null);
var $Uint8 = $newType(1, $kindUint8, "uint8", true, "", false, null);
var $Uint16 = $newType(2, $kindUint16, "uint16", true, "", false, null);
var $Uint32 = $newType(4, $kindUint32, "uint32", true, "", false, null);
var $Uint64 = $newType(8, $kindUint64, "uint64", true, "", false, null);
var $Uintptr = $newType(4, $kindUintptr, "uintptr", true, "", false, null);
var $Float32 = $newType(4, $kindFloat32, "float32", true, "", false, null);
var $Float64 = $newType(8, $kindFloat64, "float64", true, "", false, null);
var $Complex64 = $newType(8, $kindComplex64, "complex64", true, "", false, null);
var $Complex128 = $newType(16, $kindComplex128, "complex128", true, "", false, null);
var $String = $newType(8, $kindString, "string", true, "", false, null);
var $UnsafePointer = $newType(4, $kindUnsafePointer, "unsafe.Pointer", true, "unsafe", false, null);
var $nativeArray = (elemKind) => {
  switch (elemKind) {
    case $kindInt:
      return Int32Array;
    case $kindInt8:
      return Int8Array;
    case $kindInt16:
      return Int16Array;
    case $kindInt32:
      return Int32Array;
    case $kindUint:
      return Uint32Array;
    case $kindUint8:
      return Uint8Array;
    case $kindUint16:
      return Uint16Array;
    case $kindUint32:
      return Uint32Array;
    case $kindUintptr:
      return Uint32Array;
    case $kindFloat32:
      return Float32Array;
    case $kindFloat64:
      return Float64Array;
    default:
      return Array;
  }
};
var $toNativeArray = (elemKind, array) => {
  var nativeArray = $nativeArray(elemKind);
  if (nativeArray === Array) {
    return array;
  }
  return new nativeArray(array);
};
var $arrayTypes = {};
var $arrayType = (elem, len) => {
  var typeKey = elem.id + "$" + len;
  var typ2 = $arrayTypes[typeKey];
  if (typ2 === void 0) {
    typ2 = $newType(elem.size * len, $kindArray, "[" + len + "]" + elem.string, false, "", false, null);
    $arrayTypes[typeKey] = typ2;
    typ2.init(elem, len);
  }
  return typ2;
};
var $chanType = (elem, sendOnly, recvOnly) => {
  var string = (recvOnly ? "<-" : "") + "chan" + (sendOnly ? "<- " : " ");
  if (!sendOnly && !recvOnly && elem.string[0] == "<") {
    string += "(" + elem.string + ")";
  } else {
    string += elem.string;
  }
  var field = sendOnly ? "SendChan" : recvOnly ? "RecvChan" : "Chan";
  var typ2 = elem[field];
  if (typ2 === void 0) {
    typ2 = $newType(4, $kindChan, string, false, "", false, null);
    elem[field] = typ2;
    typ2.init(elem, sendOnly, recvOnly);
  }
  return typ2;
};
var $Chan = function(elem, capacity) {
  if (capacity < 0 || capacity > 2147483647) {
    $throwRuntimeError("makechan: size out of range");
  }
  this.$elem = elem;
  this.$capacity = capacity;
  this.$buffer = [];
  this.$sendQueue = [];
  this.$recvQueue = [];
  this.$closed = false;
};
var $chanNil = new $Chan(null, 0);
$chanNil.$sendQueue = $chanNil.$recvQueue = { length: 0, push() {
}, shift() {
  return void 0;
}, indexOf() {
  return -1;
} };
var $funcTypes = {};
var $funcType = (params, results, variadic) => {
  var typeKey = $mapArray(params, (p) => {
    return p.id;
  }).join(",") + "$" + $mapArray(results, (r) => {
    return r.id;
  }).join(",") + "$" + variadic;
  var typ2 = $funcTypes[typeKey];
  if (typ2 === void 0) {
    var paramTypes = $mapArray(params, (p) => {
      return p.string;
    });
    if (variadic) {
      paramTypes[paramTypes.length - 1] = "..." + paramTypes[paramTypes.length - 1].substring(2);
    }
    var string = "func(" + paramTypes.join(", ") + ")";
    if (results.length === 1) {
      string += " " + results[0].string;
    } else if (results.length > 1) {
      string += " (" + $mapArray(results, (r) => {
        return r.string;
      }).join(", ") + ")";
    }
    typ2 = $newType(4, $kindFunc, string, false, "", false, null);
    $funcTypes[typeKey] = typ2;
    typ2.init(params, results, variadic);
  }
  return typ2;
};
var $interfaceTypes = {};
var $interfaceType = (methods) => {
  var typeKey = $mapArray(methods, (m) => {
    return m.pkg + "," + m.name + "," + m.typ.id;
  }).join("$");
  var typ2 = $interfaceTypes[typeKey];
  if (typ2 === void 0) {
    var string = "interface {}";
    if (methods.length !== 0) {
      string = "interface { " + $mapArray(methods, (m) => {
        return (m.pkg !== "" ? m.pkg + "." : "") + m.name + m.typ.string.substring(4);
      }).join("; ") + " }";
    }
    typ2 = $newType(8, $kindInterface, string, false, "", false, null);
    $interfaceTypes[typeKey] = typ2;
    typ2.init(methods);
  }
  return typ2;
};
var $emptyInterface = $interfaceType([]);
var $ifaceNil = {};
var $error = $newType(8, $kindInterface, "error", true, "", false, null);
$error.init([{ prop: "Error", name: "Error", pkg: "", typ: $funcType([], [$String], false) }]);
var $mapTypes = {};
var $mapType = (key, elem) => {
  var typeKey = key.id + "$" + elem.id;
  var typ2 = $mapTypes[typeKey];
  if (typ2 === void 0) {
    typ2 = $newType(4, $kindMap, "map[" + key.string + "]" + elem.string, false, "", false, null);
    $mapTypes[typeKey] = typ2;
    typ2.init(key, elem);
  }
  return typ2;
};
var $makeMap = (keyForFunc, entries) => {
  var m = /* @__PURE__ */ new Map();
  for (var i = 0; i < entries.length; i++) {
    var e = entries[i];
    m.set(keyForFunc(e.k), e);
  }
  return m;
};
var $ptrType = (elem) => {
  var typ2 = elem.ptr;
  if (typ2 === void 0) {
    typ2 = $newType(4, $kindPtr, "*" + elem.string, false, "", elem.exported, null);
    elem.ptr = typ2;
    typ2.init(elem);
  }
  return typ2;
};
var $newDataPointer = (data, constructor) => {
  if (constructor.elem.kind === $kindStruct) {
    return data;
  }
  return new constructor(() => {
    return data;
  }, (v) => {
    data = v;
  });
};
var $indexPtrGet = function() {
  return this.$target[this.$index];
};
var $indexPtrSet = function(v) {
  this.$target[this.$index] = v;
};
var $indexPtr = (array, index, constructor) => {
  var makeIndexPtr = () => {
    if (constructor.elem.kind === $kindStruct || constructor.elem.kind === $kindArray) {
      var ptr = array[index];
      if (ptr === void 0) {
        ptr = array[index] = constructor.elem.zero();
      }
      ptr.$val = ptr;
      ptr.$target = array;
      ptr.$index = index;
      ptr.$get = $indexPtrGet;
      ptr.$set = (v) => {
        constructor.elem.copy(array[index], v);
      };
      return ptr;
    }
    return new constructor($indexPtrGet, $indexPtrSet, array, index);
  };
  if (array.buffer) {
    var cache = array.buffer.$ptr = array.buffer.$ptr || {};
    var typeCache = cache[array.name] = cache[array.name] || {};
    var cacheIdx = array.BYTES_PER_ELEMENT * index + array.byteOffset;
    return typeCache[cacheIdx] || (typeCache[cacheIdx] = makeIndexPtr());
  } else {
    array.$ptr = array.$ptr || {};
    return array.$ptr[index] || (array.$ptr[index] = makeIndexPtr());
  }
};
var $sliceType = (elem) => {
  var typ2 = elem.slice;
  if (typ2 === void 0) {
    typ2 = $newType(12, $kindSlice, "[]" + elem.string, false, "", false, null);
    elem.slice = typ2;
    typ2.init(elem);
  }
  return typ2;
};
var $makeSlice = (typ2, length, capacity = length) => {
  if (length < 0 || length > 2147483647) {
    $throwRuntimeError("makeslice: len out of range");
  }
  if (capacity < 0 || capacity < length || capacity > 2147483647) {
    $throwRuntimeError("makeslice: cap out of range");
  }
  var array = new typ2.nativeArray(capacity);
  if (typ2.nativeArray === Array) {
    for (var i = 0; i < capacity; i++) {
      array[i] = typ2.elem.zero();
    }
  }
  var slice = new typ2(array);
  slice.$length = length;
  return slice;
};
var $structTypes = {};
var $structType = (pkgPath, fields) => {
  var typeKey = $mapArray(fields, (f) => {
    return f.name + "," + f.typ.id + "," + f.tag;
  }).join("$");
  var typ2 = $structTypes[typeKey];
  if (typ2 === void 0) {
    var string = "struct { " + $mapArray(fields, (f) => {
      var str = f.typ.string + (f.tag !== "" ? ' "' + f.tag.replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"' : "");
      if (f.embedded) {
        return str;
      }
      return f.name + " " + str;
    }).join("; ") + " }";
    if (fields.length === 0) {
      string = "struct {}";
    }
    typ2 = $newType(0, $kindStruct, string, false, "", false, function(...args) {
      this.$val = this;
      for (var i = 0; i < fields.length; i++) {
        var f = fields[i];
        if (f.name == "_") {
          continue;
        }
        var arg = args[i];
        this[f.prop] = arg !== void 0 ? arg : f.typ.zero();
      }
    });
    $structTypes[typeKey] = typ2;
    typ2.init(pkgPath, fields);
  }
  return typ2;
};
var $assertType = (value, type, returnTuple) => {
  var isInterface = type.kind === $kindInterface, ok, missingMethod = "";
  if (value === $ifaceNil) {
    ok = false;
  } else if (!isInterface) {
    ok = value.constructor === type;
  } else {
    var valueTypeId = value.constructor.id;
    ok = type.implementedBy[valueTypeId];
    if (ok === void 0) {
      ok = true;
      var valueMethodSet = $methodSet(value.constructor);
      var interfaceMethods = type.methods;
      for (var i = 0; i < interfaceMethods.length; i++) {
        var tm = interfaceMethods[i];
        var found = false;
        for (var j = 0; j < valueMethodSet.length; j++) {
          var vm = valueMethodSet[j];
          if (vm.name === tm.name && vm.pkg === tm.pkg && vm.typ === tm.typ) {
            found = true;
            break;
          }
        }
        if (!found) {
          ok = false;
          type.missingMethodFor[valueTypeId] = tm.name;
          break;
        }
      }
      type.implementedBy[valueTypeId] = ok;
    }
    if (!ok) {
      missingMethod = type.missingMethodFor[valueTypeId];
    }
  }
  if (!ok) {
    if (returnTuple) {
      return [type.zero(), false];
    }
    $panic(new $packages["runtime"].TypeAssertionError.ptr(
      $packages["runtime"]._type.ptr.nil,
      value === $ifaceNil ? $packages["runtime"]._type.ptr.nil : new $packages["runtime"]._type.ptr(value.constructor.string),
      new $packages["runtime"]._type.ptr(type.string),
      missingMethod
    ));
  }
  if (!isInterface) {
    value = value.$val;
  }
  if (type === $jsObjectPtr) {
    value = value.object;
  }
  return returnTuple ? [value, true] : value;
};
var $stackDepthOffset = 0;
var $getStackDepth = () => {
  var err = new Error();
  if (err.stack === void 0) {
    return void 0;
  }
  return $stackDepthOffset + err.stack.split("\n").length;
};
var $panicStackDepth = null, $panicValue;
var $callDeferred = (deferred, jsErr, fromPanic) => {
  if (!fromPanic && deferred !== null && $curGoroutine.deferStack.indexOf(deferred) == -1) {
    throw jsErr;
  }
  if (jsErr !== null) {
    var newErr = null;
    try {
      $panic(new $jsErrorPtr(jsErr));
    } catch (err) {
      newErr = err;
    }
    $callDeferred(deferred, newErr);
    return;
  }
  if ($curGoroutine.asleep) {
    return;
  }
  $stackDepthOffset--;
  var outerPanicStackDepth = $panicStackDepth;
  var outerPanicValue = $panicValue;
  var localPanicValue = $curGoroutine.panicStack.pop();
  if (localPanicValue !== void 0) {
    $panicStackDepth = $getStackDepth();
    $panicValue = localPanicValue;
  }
  try {
    while (true) {
      if (deferred === null) {
        deferred = $curGoroutine.deferStack[$curGoroutine.deferStack.length - 1];
        if (deferred === void 0) {
          $panicStackDepth = null;
          if (localPanicValue.Object instanceof Error) {
            throw localPanicValue.Object;
          }
          var msg;
          if (localPanicValue.constructor === $String) {
            msg = localPanicValue.$val;
          } else if (localPanicValue.Error !== void 0) {
            msg = localPanicValue.Error();
          } else if (localPanicValue.String !== void 0) {
            msg = localPanicValue.String();
          } else {
            msg = localPanicValue;
          }
          throw new Error(msg);
        }
      }
      var call = deferred.pop();
      if (call === void 0) {
        $curGoroutine.deferStack.pop();
        if (localPanicValue !== void 0) {
          deferred = null;
          continue;
        }
        return;
      }
      var r = call[0].apply(call[2], call[1]);
      if (r && r.$blk !== void 0) {
        deferred.push([r.$blk, [], r]);
        if (fromPanic) {
          throw null;
        }
        return;
      }
      if (localPanicValue !== void 0 && $panicStackDepth === null) {
        if (fromPanic) {
          throw null;
        }
        return;
      }
    }
  } catch (e) {
    if (fromPanic) {
      throw e;
    }
    $callDeferred(deferred, e, fromPanic);
  } finally {
    if (localPanicValue !== void 0) {
      if ($panicStackDepth !== null) {
        $curGoroutine.panicStack.push(localPanicValue);
      }
      $panicStackDepth = outerPanicStackDepth;
      $panicValue = outerPanicValue;
    }
    $stackDepthOffset++;
  }
};
var $panicnil = "0";
var $panic = (value) => {
  if (value === $ifaceNil && $panicnil !== "1") {
    value = $newPanicNilError();
  }
  $curGoroutine.panicStack.push(value);
  $callDeferred(null, null, true);
};
var $recover = () => {
  if ($panicStackDepth === null || $panicStackDepth !== void 0 && $panicStackDepth !== $getStackDepth() - 2) {
    return $ifaceNil;
  }
  $panicStackDepth = null;
  return $panicValue;
};
var $throw = (err) => {
  throw err;
};
var $noGoroutine = { asleep: false, exit: false, deferStack: [], panicStack: [] };
var $curGoroutine = $noGoroutine, $totalGoroutines = 0, $awakeGoroutines = 0, $checkForDeadlock = true, $exportedFunctions = 0;
var $mainFinished = false;
var $go = (fun, args) => {
  $totalGoroutines++;
  $awakeGoroutines++;
  var $goroutine = () => {
    try {
      $curGoroutine = $goroutine;
      var r = fun(...args);
      if (r && r.$blk !== void 0) {
        fun = () => {
          return r.$blk();
        };
        args = [];
        return;
      }
      $goroutine.exit = true;
    } catch (err) {
      if (!$goroutine.exit) {
        throw err;
      }
    } finally {
      $curGoroutine = $noGoroutine;
      if ($goroutine.exit) {
        $totalGoroutines--;
        $goroutine.asleep = true;
      }
      if ($goroutine.asleep) {
        $awakeGoroutines--;
        if (!$mainFinished && $awakeGoroutines === 0 && $checkForDeadlock && $exportedFunctions === 0) {
          console.error("fatal error: all goroutines are asleep - deadlock!");
          if ($global.process !== void 0) {
            $global.process.exit(2);
          }
        }
      }
    }
  };
  $goroutine.asleep = false;
  $goroutine.exit = false;
  $goroutine.deferStack = [];
  $goroutine.panicStack = [];
  $schedule($goroutine);
};
var $scheduled = [];
var $runScheduled = () => {
  var nextRun = setTimeout($runScheduled);
  try {
    var start = Date.now();
    var r;
    while ((r = $scheduled.shift()) !== void 0) {
      r();
      var elapsed = Date.now() - start;
      if (elapsed > 4 || elapsed < 0) {
        break;
      }
    }
  } finally {
    if ($scheduled.length == 0) {
      clearTimeout(nextRun);
    }
  }
};
var $schedule = (goroutine) => {
  if (goroutine.asleep) {
    goroutine.asleep = false;
    $awakeGoroutines++;
  }
  $scheduled.push(goroutine);
  if ($curGoroutine === $noGoroutine) {
    $runScheduled();
  }
};
var $setTimeout = (f, t) => {
  $awakeGoroutines++;
  return setTimeout(() => {
    $awakeGoroutines--;
    f();
  }, t);
};
var $block = () => {
  if ($curGoroutine === $noGoroutine) {
    $throwRuntimeError("cannot block in JavaScript callback, fix by wrapping code in goroutine");
  }
  $curGoroutine.asleep = true;
};
var $restore = (context, params) => {
  if (context !== void 0 && context.$blk !== void 0) {
    return context;
  }
  return params;
};
var $send = (chan, value) => {
  if (chan.$closed) {
    $throwRuntimeError("send on closed channel");
  }
  var queuedRecv = chan.$recvQueue.shift();
  if (queuedRecv !== void 0) {
    queuedRecv([value, true]);
    return;
  }
  if (chan.$buffer.length < chan.$capacity) {
    chan.$buffer.push(value);
    return;
  }
  var thisGoroutine = $curGoroutine;
  var closedDuringSend;
  chan.$sendQueue.push((closed) => {
    closedDuringSend = closed;
    $schedule(thisGoroutine);
    return value;
  });
  $block();
  return {
    $blk() {
      if (closedDuringSend) {
        $throwRuntimeError("send on closed channel");
      }
    }
  };
};
var $recv = (chan) => {
  var queuedSend = chan.$sendQueue.shift();
  if (queuedSend !== void 0) {
    chan.$buffer.push(queuedSend(false));
  }
  var bufferedValue = chan.$buffer.shift();
  if (bufferedValue !== void 0) {
    return [bufferedValue, true];
  }
  if (chan.$closed) {
    return [chan.$elem.zero(), false];
  }
  var thisGoroutine = $curGoroutine;
  var f = { $blk() {
    return this.value;
  } };
  var queueEntry = (v) => {
    f.value = v;
    $schedule(thisGoroutine);
  };
  chan.$recvQueue.push(queueEntry);
  $block();
  return f;
};
var $close = (chan) => {
  if (chan.$closed) {
    $throwRuntimeError("close of closed channel");
  }
  chan.$closed = true;
  while (true) {
    var queuedSend = chan.$sendQueue.shift();
    if (queuedSend === void 0) {
      break;
    }
    queuedSend(true);
  }
  while (true) {
    var queuedRecv = chan.$recvQueue.shift();
    if (queuedRecv === void 0) {
      break;
    }
    queuedRecv([chan.$elem.zero(), false]);
  }
};
var $select = (comms) => {
  var ready = [];
  var selection = -1;
  for (var i = 0; i < comms.length; i++) {
    var comm = comms[i];
    var chan = comm[0];
    switch (comm.length) {
      case 0:
        selection = i;
        break;
      case 1:
        if (chan.$sendQueue.length !== 0 || chan.$buffer.length !== 0 || chan.$closed) {
          ready.push(i);
        }
        break;
      case 2:
        if (chan.$closed) {
          $throwRuntimeError("send on closed channel");
        }
        if (chan.$recvQueue.length !== 0 || chan.$buffer.length < chan.$capacity) {
          ready.push(i);
        }
        break;
    }
  }
  if (ready.length !== 0) {
    selection = ready[Math.floor(Math.random() * ready.length)];
  }
  if (selection !== -1) {
    var comm = comms[selection];
    switch (comm.length) {
      case 0:
        return [selection];
      case 1:
        return [selection, $recv(comm[0])];
      case 2:
        $send(comm[0], comm[1]);
        return [selection];
    }
  }
  var entries = [];
  var thisGoroutine = $curGoroutine;
  var f = { $blk() {
    return this.selection;
  } };
  var removeFromQueues = () => {
    for (var i2 = 0; i2 < entries.length; i2++) {
      var entry = entries[i2];
      var queue = entry[0];
      var index = queue.indexOf(entry[1]);
      if (index !== -1) {
        queue.splice(index, 1);
      }
    }
  };
  for (var i = 0; i < comms.length; i++) {
    ((i2) => {
      var comm2 = comms[i2];
      switch (comm2.length) {
        case 1:
          var queueEntry = (value) => {
            f.selection = [i2, value];
            removeFromQueues();
            $schedule(thisGoroutine);
          };
          entries.push([comm2[0].$recvQueue, queueEntry]);
          comm2[0].$recvQueue.push(queueEntry);
          break;
        case 2:
          var queueEntry = () => {
            if (comm2[0].$closed) {
              $throwRuntimeError("send on closed channel");
            }
            f.selection = [i2];
            removeFromQueues();
            $schedule(thisGoroutine);
            return comm2[1];
          };
          entries.push([comm2[0].$sendQueue, queueEntry]);
          comm2[0].$sendQueue.push(queueEntry);
          break;
      }
    })(i);
  }
  $block();
  return f;
};
var $jsObjectPtr, $jsErrorPtr;
var $needsExternalization = (t) => {
  switch (t.kind) {
    case $kindBool:
    case $kindInt:
    case $kindInt8:
    case $kindInt16:
    case $kindInt32:
    case $kindUint:
    case $kindUint8:
    case $kindUint16:
    case $kindUint32:
    case $kindUintptr:
    case $kindFloat32:
    case $kindFloat64:
      return false;
    default:
      return t !== $jsObjectPtr;
  }
};
var $externalize = (v, t, makeWrapper) => {
  if (t === $jsObjectPtr) {
    return v;
  }
  switch (t.kind) {
    case $kindBool:
    case $kindInt:
    case $kindInt8:
    case $kindInt16:
    case $kindInt32:
    case $kindUint:
    case $kindUint8:
    case $kindUint16:
    case $kindUint32:
    case $kindUintptr:
    case $kindFloat32:
    case $kindFloat64:
      return v;
    case $kindInt64:
    case $kindUint64:
      return $flatten64(v);
    case $kindArray:
      if ($needsExternalization(t.elem)) {
        return $mapArray(v, (e) => {
          return $externalize(e, t.elem, makeWrapper);
        });
      }
      return v;
    case $kindFunc:
      return $externalizeFunction(v, t, false, makeWrapper);
    case $kindInterface:
      if (v === $ifaceNil) {
        return null;
      }
      if (v.constructor === $jsObjectPtr) {
        return v.$val.object;
      }
      return $externalize(v.$val, v.constructor, makeWrapper);
    case $kindMap:
      if (v.keys === void 0) {
        return null;
      }
      var m = {};
      var keys = Array.from(v.keys());
      for (var i = 0; i < keys.length; i++) {
        var entry = v.get(keys[i]);
        m[$externalize(entry.k, t.key, makeWrapper)] = $externalize(entry.v, t.elem, makeWrapper);
      }
      return m;
    case $kindPtr:
      if (v === t.nil) {
        return null;
      }
      return $externalize(v.$get(), t.elem, makeWrapper);
    case $kindSlice:
      if (v === v.constructor.nil) {
        return null;
      }
      if ($needsExternalization(t.elem)) {
        return $mapArray($sliceToNativeArray(v), (e) => {
          return $externalize(e, t.elem, makeWrapper);
        });
      }
      return $sliceToNativeArray(v);
    case $kindString:
      if ($isASCII(v)) {
        return v;
      }
      var s = "", r;
      for (var i = 0; i < v.length; i += r[1]) {
        r = $decodeRune(v, i);
        var c = r[0];
        if (c > 65535) {
          var h = Math.floor((c - 65536) / 1024) + 55296;
          var l = (c - 65536) % 1024 + 56320;
          s += String.fromCharCode(h, l);
          continue;
        }
        s += String.fromCharCode(c);
      }
      return s;
    case $kindStruct:
      var timePkg = $packages["time"];
      if (timePkg !== void 0 && v.constructor === timePkg.Time.ptr) {
        var milli = $div64(v.UnixNano(), new $Int64(0, 1e6));
        return new Date($flatten64(milli));
      }
      var noJsObject = {};
      var searchJsObject = (v2, t2) => {
        if (t2 === $jsObjectPtr) {
          return v2;
        }
        switch (t2.kind) {
          case $kindPtr:
            if (v2 === t2.nil) {
              return noJsObject;
            }
            return searchJsObject(v2.$get(), t2.elem);
          case $kindStruct:
            if (t2.fields.length === 0) {
              return noJsObject;
            }
            var f2 = t2.fields[0];
            return searchJsObject(v2[f2.prop], f2.typ);
          case $kindInterface:
            return searchJsObject(v2.$val, v2.constructor);
          default:
            return noJsObject;
        }
      };
      var o = searchJsObject(v, t);
      if (o !== noJsObject) {
        return o;
      }
      if (makeWrapper !== void 0) {
        return makeWrapper(v);
      }
      o = {};
      for (var i = 0; i < t.fields.length; i++) {
        var f = t.fields[i];
        if (!f.exported) {
          continue;
        }
        o[f.name] = $externalize(v[f.prop], f.typ, makeWrapper);
      }
      return o;
  }
  $throwRuntimeError("cannot externalize " + t.string);
};
var $externalizeFunction = (v, t, passThis, makeWrapper) => {
  if (v === $throwNilPointerError) {
    return null;
  }
  if (v.$externalizeWrapper === void 0) {
    $checkForDeadlock = false;
    v.$externalizeWrapper = function() {
      var args = [];
      for (var i = 0; i < t.params.length; i++) {
        if (t.variadic && i === t.params.length - 1) {
          var vt = t.params[i].elem, varargs = [];
          for (var j = i; j < arguments.length; j++) {
            varargs.push($internalize(arguments[j], vt, makeWrapper));
          }
          args.push(new t.params[i](varargs));
          break;
        }
        args.push($internalize(arguments[i], t.params[i], makeWrapper));
      }
      var result = v.apply(passThis ? this : void 0, args);
      switch (t.results.length) {
        case 0:
          return;
        case 1:
          return $externalize($copyIfRequired(result, t.results[0]), t.results[0], makeWrapper);
        default:
          for (var i = 0; i < t.results.length; i++) {
            result[i] = $externalize($copyIfRequired(result[i], t.results[i]), t.results[i], makeWrapper);
          }
          return result;
      }
    };
  }
  return v.$externalizeWrapper;
};
var $internalize = (v, t, recv, seen, makeWrapper) => {
  if (t === $jsObjectPtr) {
    return v;
  }
  if (t === $jsObjectPtr.elem) {
    $throwRuntimeError("cannot internalize js.Object, use *js.Object instead");
  }
  if (v && v.__internal_object__ !== void 0) {
    return $assertType(v.__internal_object__, t, false);
  }
  var timePkg = $packages["time"];
  if (timePkg !== void 0 && t === timePkg.Time) {
    if (!(v !== null && v !== void 0 && v.constructor === Date)) {
      $throwRuntimeError("cannot internalize time.Time from " + typeof v + ", must be Date");
    }
    return timePkg.Unix(new $Int64(0, 0), new $Int64(0, v.getTime() * 1e6));
  }
  if (seen === void 0) {
    seen = /* @__PURE__ */ new Map();
  }
  if (!seen.has(t)) {
    seen.set(t, /* @__PURE__ */ new Map());
  }
  if (seen.get(t).has(v)) {
    return seen.get(t).get(v);
  }
  switch (t.kind) {
    case $kindBool:
      return !!v;
    case $kindInt:
      return parseInt(v);
    case $kindInt8:
      return parseInt(v) << 24 >> 24;
    case $kindInt16:
      return parseInt(v) << 16 >> 16;
    case $kindInt32:
      return parseInt(v) >> 0;
    case $kindUint:
      return parseInt(v);
    case $kindUint8:
      return parseInt(v) << 24 >>> 24;
    case $kindUint16:
      return parseInt(v) << 16 >>> 16;
    case $kindUint32:
    case $kindUintptr:
      return parseInt(v) >>> 0;
    case $kindInt64:
    case $kindUint64:
      return new t(0, v);
    case $kindFloat32:
    case $kindFloat64:
      return parseFloat(v);
    case $kindArray:
      if (v === null || v === void 0) {
        $throwRuntimeError("cannot internalize " + v + " as a " + t.string);
      }
      if (v.length !== t.len) {
        $throwRuntimeError("got array with wrong size from JavaScript native");
      }
      return $mapArray(v, (e) => {
        return $internalize(e, t.elem, makeWrapper);
      });
    case $kindFunc:
      return function() {
        var args = [];
        for (var i2 = 0; i2 < t.params.length; i2++) {
          if (t.variadic && i2 === t.params.length - 1) {
            var vt = t.params[i2].elem, varargs = arguments[i2];
            for (var j = 0; j < varargs.$length; j++) {
              args.push($externalize(varargs.$array[varargs.$offset + j], vt, makeWrapper));
            }
            break;
          }
          args.push($externalize(arguments[i2], t.params[i2], makeWrapper));
        }
        var result = v.apply(recv, args);
        switch (t.results.length) {
          case 0:
            return;
          case 1:
            return $internalize(result, t.results[0], makeWrapper);
          default:
            for (var i2 = 0; i2 < t.results.length; i2++) {
              result[i2] = $internalize(result[i2], t.results[i2], makeWrapper);
            }
            return result;
        }
      };
    case $kindInterface:
      if (t.methods.length !== 0) {
        $throwRuntimeError("cannot internalize " + t.string);
      }
      if (v === null) {
        return $ifaceNil;
      }
      if (v === void 0) {
        return new $jsObjectPtr(void 0);
      }
      switch (v.constructor) {
        case Int8Array:
          return new ($sliceType($Int8))(v);
        case Int16Array:
          return new ($sliceType($Int16))(v);
        case Int32Array:
          return new ($sliceType($Int))(v);
        case Uint8Array:
          return new ($sliceType($Uint8))(v);
        case Uint16Array:
          return new ($sliceType($Uint16))(v);
        case Uint32Array:
          return new ($sliceType($Uint))(v);
        case Float32Array:
          return new ($sliceType($Float32))(v);
        case Float64Array:
          return new ($sliceType($Float64))(v);
        case Array:
          return $internalize(v, $sliceType($emptyInterface), makeWrapper);
        case Boolean:
          return new $Bool(!!v);
        case Date:
          if (timePkg === void 0) {
            return new $jsObjectPtr(v);
          }
          return new timePkg.Time($internalize(v, timePkg.Time, makeWrapper));
        case (() => {
        }).constructor:
          var funcType = $funcType([$sliceType($emptyInterface)], [$jsObjectPtr], true);
          return new funcType($internalize(v, funcType, makeWrapper));
        case Number:
          return new $Float64(parseFloat(v));
        case String:
          return new $String($internalize(v, $String, makeWrapper));
        default:
          if ($global.Node && v instanceof $global.Node) {
            return new $jsObjectPtr(v);
          }
          var mapType = $mapType($String, $emptyInterface);
          return new mapType($internalize(v, mapType, recv, seen, makeWrapper));
      }
    case $kindMap:
      var m = /* @__PURE__ */ new Map();
      seen.get(t).set(v, m);
      var keys = $keys(v);
      for (var i = 0; i < keys.length; i++) {
        var k = $internalize(keys[i], t.key, recv, seen, makeWrapper);
        m.set(t.key.keyFor(k), { k, v: $internalize(v[keys[i]], t.elem, recv, seen, makeWrapper) });
      }
      return m;
    case $kindPtr:
      if (t.elem.kind === $kindStruct) {
        return $internalize(v, t.elem, makeWrapper);
      }
    case $kindSlice:
      if (v == null) {
        return t.zero();
      }
      return new t($mapArray(v, (e) => {
        return $internalize(e, t.elem, makeWrapper);
      }));
    case $kindString:
      v = String(v);
      if ($isASCII(v)) {
        return v;
      }
      var s = "";
      var i = 0;
      while (i < v.length) {
        var h = v.charCodeAt(i);
        if (55296 <= h && h <= 56319) {
          var l = v.charCodeAt(i + 1);
          var c = (h - 55296) * 1024 + l - 56320 + 65536;
          s += $encodeRune(c);
          i += 2;
          continue;
        }
        s += $encodeRune(h);
        i++;
      }
      return s;
    case $kindStruct:
      var noJsObject = {};
      var searchJsObject = (t2) => {
        if (t2 === $jsObjectPtr) {
          return v;
        }
        if (t2 === $jsObjectPtr.elem) {
          $throwRuntimeError("cannot internalize js.Object, use *js.Object instead");
        }
        switch (t2.kind) {
          case $kindPtr:
            return searchJsObject(t2.elem);
          case $kindStruct:
            if (t2.fields.length === 0) {
              return noJsObject;
            }
            var f2 = t2.fields[0];
            var o2 = searchJsObject(f2.typ);
            if (o2 !== noJsObject) {
              var n2 = new t2.ptr();
              n2[f2.prop] = o2;
              return n2;
            }
            return noJsObject;
          default:
            return noJsObject;
        }
      };
      var o = searchJsObject(t);
      if (o !== noJsObject) {
        return o;
      }
      var n = new t.ptr();
      for (var i = 0; i < t.fields.length; i++) {
        var f = t.fields[i];
        if (!f.exported) {
          continue;
        }
        var jsProp = v[f.name];
        n[f.prop] = $internalize(jsProp, f.typ, recv, seen, makeWrapper);
      }
      return n;
  }
  $throwRuntimeError("cannot internalize " + t.string);
};
var $copyIfRequired = (v, typ) => {
  if (v && v.constructor && v.constructor.copy) {
    return new v.constructor($clone(v.$val, v.constructor));
  }
  if (typ.copy) {
    var clone = typ.zero();
    typ.copy(clone, v);
    return clone;
  }
  return v;
};
var $isASCII = (s) => {
  for (var i = 0; i < s.length; i++) {
    if (s.charCodeAt(i) >= 128) {
      return false;
    }
  }
  return true;
};

$packages["github.com/gopherjs/gopherjs/js"] = (function() {
	var $pkg = {}, $init, Object, Error, sliceType, ptrType, ptrType$1, init;
	Object = $newType(0, $kindStruct, "js.Object", true, "github.com/gopherjs/gopherjs/js", true, function(object_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.object = null;
			return;
		}
		this.object = object_;
	});
	Error = $newType(0, $kindStruct, "js.Error", true, "github.com/gopherjs/gopherjs/js", true, function(Object_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.Object = null;
			return;
		}
		this.Object = Object_;
	});
	$pkg.Object = Object;
	$pkg.Error = Error;
	$pkg.$finishSetup = function() {
		sliceType = $sliceType($emptyInterface);
		ptrType = $ptrType(Object);
		ptrType$1 = $ptrType(Error);
		$ptrType(Object).prototype.Get = function Get(key) {
			var key, o;
			o = this;
			return o.object[$externalize(key, $String)];
		};
		$ptrType(Object).prototype.Set = function Set(key, value) {
			var key, o, value;
			o = this;
			o.object[$externalize(key, $String)] = $externalize(value, $emptyInterface);
		};
		$ptrType(Object).prototype.Delete = function Delete(key) {
			var key, o;
			o = this;
			delete o.object[$externalize(key, $String)];
		};
		$ptrType(Object).prototype.Length = function Length() {
			var o;
			o = this;
			return $parseInt(o.object.length);
		};
		$ptrType(Object).prototype.Index = function Index(i) {
			var i, o;
			o = this;
			return o.object[i];
		};
		$ptrType(Object).prototype.SetIndex = function SetIndex(i, value) {
			var i, o, value;
			o = this;
			o.object[i] = $externalize(value, $emptyInterface);
		};
		$ptrType(Object).prototype.Call = function Call(name, args) {
			var args, name, o, obj;
			o = this;
			return (obj = o.object, obj[$externalize(name, $String)].apply(obj, $externalize(args, sliceType)));
		};
		$ptrType(Object).prototype.Invoke = function Invoke(args) {
			var args, o;
			o = this;
			return o.object.apply(undefined, $externalize(args, sliceType));
		};
		$ptrType(Object).prototype.New = function New(args) {
			var args, o;
			o = this;
			return new ($global.Function.prototype.bind.apply(o.object, [undefined].concat($externalize(args, sliceType))));
		};
		$ptrType(Object).prototype.Bool = function Bool() {
			var o;
			o = this;
			return !!(o.object);
		};
		$ptrType(Object).prototype.String = function String() {
			var o;
			o = this;
			return $internalize(o.object, $String);
		};
		$ptrType(Object).prototype.Int = function Int() {
			var o;
			o = this;
			return $parseInt(o.object) >> 0;
		};
		$ptrType(Object).prototype.Int64 = function Int64() {
			var o;
			o = this;
			return $internalize(o.object, $Int64);
		};
		$ptrType(Object).prototype.Uint64 = function Uint64() {
			var o;
			o = this;
			return $internalize(o.object, $Uint64);
		};
		$ptrType(Object).prototype.Float = function Float() {
			var o;
			o = this;
			return $parseFloat(o.object);
		};
		$ptrType(Object).prototype.Interface = function Interface() {
			var o;
			o = this;
			return $internalize(o.object, $emptyInterface);
		};
		$ptrType(Object).prototype.Unsafe = function Unsafe() {
			var o;
			o = this;
			return o.object;
		};
		$ptrType(Error).prototype.Error = function Error$1() {
			var err;
			err = this;
			return "JavaScript error: " + $internalize(err.Object.message, $String);
		};
		$ptrType(Error).prototype.Stack = function Stack() {
			var err;
			err = this;
			return $internalize(err.Object.stack, $String);
		};
		init = function init$1() {
			var e;
			e = new Error.ptr(null);
			$unused(e);
		};
		ptrType.methods = [{prop: "Get", name: "Get", pkg: "", typ: $funcType([$String], [ptrType], false)}, {prop: "Set", name: "Set", pkg: "", typ: $funcType([$String, $emptyInterface], [], false)}, {prop: "Delete", name: "Delete", pkg: "", typ: $funcType([$String], [], false)}, {prop: "Length", name: "Length", pkg: "", typ: $funcType([], [$Int], false)}, {prop: "Index", name: "Index", pkg: "", typ: $funcType([$Int], [ptrType], false)}, {prop: "SetIndex", name: "SetIndex", pkg: "", typ: $funcType([$Int, $emptyInterface], [], false)}, {prop: "Call", name: "Call", pkg: "", typ: $funcType([$String, sliceType], [ptrType], true)}, {prop: "Invoke", name: "Invoke", pkg: "", typ: $funcType([sliceType], [ptrType], true)}, {prop: "New", name: "New", pkg: "", typ: $funcType([sliceType], [ptrType], true)}, {prop: "Bool", name: "Bool", pkg: "", typ: $funcType([], [$Bool], false)}, {prop: "String", name: "String", pkg: "", typ: $funcType([], [$String], false)}, {prop: "Int", name: "Int", pkg: "", typ: $funcType([], [$Int], false)}, {prop: "Int64", name: "Int64", pkg: "", typ: $funcType([], [$Int64], false)}, {prop: "Uint64", name: "Uint64", pkg: "", typ: $funcType([], [$Uint64], false)}, {prop: "Float", name: "Float", pkg: "", typ: $funcType([], [$Float64], false)}, {prop: "Interface", name: "Interface", pkg: "", typ: $funcType([], [$emptyInterface], false)}, {prop: "Unsafe", name: "Unsafe", pkg: "", typ: $funcType([], [$Uintptr], false)}];
		ptrType$1.methods = [{prop: "Error", name: "Error", pkg: "", typ: $funcType([], [$String], false)}, {prop: "Stack", name: "Stack", pkg: "", typ: $funcType([], [$String], false)}];
		Object.init("github.com/gopherjs/gopherjs/js", [{prop: "object", name: "object", embedded: false, exported: false, typ: ptrType, tag: ""}]);
		Error.init("", [{prop: "Object", name: "Object", embedded: true, exported: true, typ: ptrType, tag: ""}]);
	};
	$init = function() {
		$pkg.$init = function() {};
		/* */ var $f, $c = false, $s = 0, $r; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		init();
		/* */ } return; } if ($f === undefined) { $f = { $blk: $init }; } $f.$s = $s; $f.$r = $r; return $f;
	};
	$pkg.$init = $init;
	return $pkg;
})();
$packages["runtime"] = (function() {
	var $pkg = {}, $init, js, _type, TypeAssertionError, PanicNilError, errorString, ptrType$1, ptrType$2, arrayType, ptrType$3, buildVersion, newPanicNilError, init, throw$1, getEnvString, syncPanicNilFromGodebug;
	js = $packages["github.com/gopherjs/gopherjs/js"];
	_type = $newType(0, $kindStruct, "runtime._type", true, "runtime", false, function(str_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.str = "";
			return;
		}
		this.str = str_;
	});
	TypeAssertionError = $newType(0, $kindStruct, "runtime.TypeAssertionError", true, "runtime", true, function(_interface_, concrete_, asserted_, missingMethod_) {
		this.$val = this;
		if (arguments.length === 0) {
			this._interface = ptrType$1.nil;
			this.concrete = ptrType$1.nil;
			this.asserted = ptrType$1.nil;
			this.missingMethod = "";
			return;
		}
		this._interface = _interface_;
		this.concrete = concrete_;
		this.asserted = asserted_;
		this.missingMethod = missingMethod_;
	});
	PanicNilError = $newType(0, $kindStruct, "runtime.PanicNilError", true, "runtime", true, function(_$0_) {
		this.$val = this;
		if (arguments.length === 0) {
			this._$0 = arrayType.zero();
			return;
		}
		this._$0 = _$0_;
	});
	errorString = $newType(8, $kindString, "runtime.errorString", true, "runtime", false, null);
	$pkg._type = _type;
	$pkg.TypeAssertionError = TypeAssertionError;
	$pkg.PanicNilError = PanicNilError;
	$pkg.errorString = errorString;
	$pkg.$finishSetup = function() {
		ptrType$1 = $ptrType(_type);
		ptrType$2 = $ptrType(PanicNilError);
		arrayType = $arrayType(ptrType$2, 0);
		ptrType$3 = $ptrType(TypeAssertionError);
		$ptrType(_type).prototype.string = function string() {
			var t;
			t = this;
			return t.str;
		};
		$ptrType(_type).prototype.pkgpath = function pkgpath() {
			var t;
			t = this;
			return "";
		};
		$ptrType(TypeAssertionError).prototype.RuntimeError = function RuntimeError() {
		};
		$ptrType(TypeAssertionError).prototype.Error = function Error$1() {
			var as, cs, e, inter, msg;
			e = this;
			inter = "interface";
			if (!(e._interface === ptrType$1.nil)) {
				inter = e._interface.string();
			}
			as = e.asserted.string();
			if (e.concrete === ptrType$1.nil) {
				return "interface conversion: " + inter + " is nil, not " + as;
			}
			cs = e.concrete.string();
			if (e.missingMethod === "") {
				msg = "interface conversion: " + inter + " is " + cs + ", not " + as;
				if (cs === as) {
					if (!(e.concrete.pkgpath() === e.asserted.pkgpath())) {
						msg = msg + (" (types from different packages)");
					} else {
						msg = msg + (" (types from different scopes)");
					}
				}
				return msg;
			}
			return "interface conversion: " + cs + " is not " + as + ": missing method " + e.missingMethod;
		};
		$ptrType(PanicNilError).prototype.Error = function Error$2() {
			return "panic called with nil argument";
		};
		$ptrType(PanicNilError).prototype.RuntimeError = function RuntimeError$1() {
		};
		newPanicNilError = function newPanicNilError$1() {
			return new PanicNilError.ptr(arrayType.zero());
		};
		init = function init$1() {
			var e, jsPkg;
			jsPkg = $packages[$externalize("github.com/gopherjs/gopherjs/js", $String)];
			$jsObjectPtr = jsPkg.Object.ptr;
			$jsErrorPtr = jsPkg.Error.ptr;
			$throwRuntimeError = throw$1;
			$newPanicNilError = newPanicNilError;
			buildVersion = $internalize($goVersion, $String);
			syncPanicNilFromGodebug(getEnvString("GODEBUG"));
			e = $ifaceNil;
			e = new TypeAssertionError.ptr(ptrType$1.nil, ptrType$1.nil, ptrType$1.nil, "");
			$unused(e);
		};
		errorString.prototype.RuntimeError = function RuntimeError$2() {
			var e;
			e = this.$val;
		};
		$ptrType(errorString).prototype.RuntimeError = function(...$args) { return new errorString(this.$get()).RuntimeError(...$args); };
		errorString.prototype.Error = function Error$3() {
			var e;
			e = this.$val;
			return "runtime error: " + (e);
		};
		$ptrType(errorString).prototype.Error = function(...$args) { return new errorString(this.$get()).Error(...$args); };
		throw$1 = function throw$2(s) {
			var s;
			$panic(new errorString((s)));
		};
		getEnvString = function getEnvString$1(key) {
			var env, key, process, value;
			process = $global.process;
			if (process === undefined) {
				return "";
			}
			env = process.env;
			if (env === undefined) {
				return "";
			}
			value = env[$externalize(key, $String)];
			if (value === undefined) {
				return "";
			}
			return $internalize(value, $String);
		};
		syncPanicNilFromGodebug = function syncPanicNilFromGodebug$1(godebug) {
			var godebug, m, panicnil, re;
			panicnil = "0";
			if (!(godebug === "")) {
				re = new ($global.RegExp)($externalize("(?:^|,)panicnil=(\\d+)(?:,|$)", $String));
				m = re.exec($externalize(godebug, $String));
				if (!(m === null) && !(m === undefined) && $parseInt(m.length) >= 2) {
					panicnil = $internalize(m[1], $String);
				}
			}
			$panicnil = $externalize(panicnil, $String);
		};
		ptrType$1.methods = [{prop: "string", name: "string", pkg: "runtime", typ: $funcType([], [$String], false)}, {prop: "pkgpath", name: "pkgpath", pkg: "runtime", typ: $funcType([], [$String], false)}];
		ptrType$3.methods = [{prop: "RuntimeError", name: "RuntimeError", pkg: "", typ: $funcType([], [], false)}, {prop: "Error", name: "Error", pkg: "", typ: $funcType([], [$String], false)}];
		ptrType$2.methods = [{prop: "Error", name: "Error", pkg: "", typ: $funcType([], [$String], false)}, {prop: "RuntimeError", name: "RuntimeError", pkg: "", typ: $funcType([], [], false)}];
		errorString.methods = [{prop: "RuntimeError", name: "RuntimeError", pkg: "", typ: $funcType([], [], false)}, {prop: "Error", name: "Error", pkg: "", typ: $funcType([], [$String], false)}];
		_type.init("runtime", [{prop: "str", name: "str", embedded: false, exported: false, typ: $String, tag: ""}]);
		TypeAssertionError.init("runtime", [{prop: "_interface", name: "_interface", embedded: false, exported: false, typ: ptrType$1, tag: ""}, {prop: "concrete", name: "concrete", embedded: false, exported: false, typ: ptrType$1, tag: ""}, {prop: "asserted", name: "asserted", embedded: false, exported: false, typ: ptrType$1, tag: ""}, {prop: "missingMethod", name: "missingMethod", embedded: false, exported: false, typ: $String, tag: ""}]);
		PanicNilError.init("runtime", [{prop: "_$0", name: "_", embedded: false, exported: false, typ: arrayType, tag: ""}]);
	};
	$init = function() {
		$pkg.$init = function() {};
		/* */ var $f, $c = false, $s = 0, $r; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		$r = js.$init(); /* */ $s = 1; case 1: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		buildVersion = "";
		init();
		/* */ } return; } if ($f === undefined) { $f = { $blk: $init }; } $f.$s = $s; $f.$r = $r; return $f;
	};
	$pkg.$init = $init;
	return $pkg;
})();
$packages["github.com/btwiuse/digitalrain"] = (function() {
	var $pkg = {}, $init, js, Duration, DigitalRain, waterDrop, GlyphCanvas, ptrType, sliceType, sliceType$1, funcType, ptrType$1, sliceType$2, ptrType$2, ptrType$3, funcType$1, sliceType$3, mapType, mapType$1, lowGlyphCanvases, highGlyphCanvases, backgrounds, overlap, githubLinkColor, githubLinkOverColor, githubLink, level1Cols, level2Cols, index, main, itoa, ftoa, randi, NewDigitalRain, shortLink, NewGlyphCanvas;
	js = $packages["github.com/gopherjs/gopherjs/js"];
	Duration = $newType(8, $kindFloat64, "main.Duration", true, "github.com/btwiuse/digitalrain", true, null);
	DigitalRain = $newType(0, $kindStruct, "main.DigitalRain", true, "github.com/btwiuse/digitalrain", true, function(parent_, canvas_, ctx_, width_, height_, ratio_, timestamp_, lowGlyphCanvas_, highGlyphCanvas_, drops_, linkover_, screenCols_, minSpeed_, maxSpeed_, brightness_, Clicked_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.parent = null;
			this.canvas = null;
			this.ctx = null;
			this.width = 0;
			this.height = 0;
			this.ratio = 0;
			this.timestamp = 0;
			this.lowGlyphCanvas = ptrType.nil;
			this.highGlyphCanvas = ptrType.nil;
			this.drops = sliceType$2.nil;
			this.linkover = false;
			this.screenCols = 0;
			this.minSpeed = 0;
			this.maxSpeed = 0;
			this.brightness = 0;
			this.Clicked = $throwNilPointerError;
			return;
		}
		this.parent = parent_;
		this.canvas = canvas_;
		this.ctx = ctx_;
		this.width = width_;
		this.height = height_;
		this.ratio = ratio_;
		this.timestamp = timestamp_;
		this.lowGlyphCanvas = lowGlyphCanvas_;
		this.highGlyphCanvas = highGlyphCanvas_;
		this.drops = drops_;
		this.linkover = linkover_;
		this.screenCols = screenCols_;
		this.minSpeed = minSpeed_;
		this.maxSpeed = maxSpeed_;
		this.brightness = brightness_;
		this.Clicked = Clicked_;
	});
	waterDrop = $newType(0, $kindStruct, "main.waterDrop", true, "github.com/btwiuse/digitalrain", false, function(col_, row_, start_, speed_, glyphs_, spedup_, created_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.col = 0;
			this.row = 0;
			this.start = 0;
			this.speed = 0;
			this.glyphs = sliceType$3.nil;
			this.spedup = false;
			this.created = 0;
			return;
		}
		this.col = col_;
		this.row = row_;
		this.start = start_;
		this.speed = speed_;
		this.glyphs = glyphs_;
		this.spedup = spedup_;
		this.created = created_;
	});
	GlyphCanvas = $newType(0, $kindStruct, "main.GlyphCanvas", true, "github.com/btwiuse/digitalrain", true, function(jso_, glyphs_) {
		this.$val = this;
		if (arguments.length === 0) {
			this.jso = null;
			this.glyphs = false;
			return;
		}
		this.jso = jso_;
		this.glyphs = glyphs_;
	});
	$pkg.Duration = Duration;
	$pkg.DigitalRain = DigitalRain;
	$pkg.waterDrop = waterDrop;
	$pkg.GlyphCanvas = GlyphCanvas;
	$pkg.$finishSetup = function() {
		ptrType = $ptrType(GlyphCanvas);
		sliceType = $sliceType(ptrType);
		sliceType$1 = $sliceType($String);
		funcType = $funcType([], [], false);
		ptrType$1 = $ptrType(waterDrop);
		sliceType$2 = $sliceType(ptrType$1);
		ptrType$2 = $ptrType(DigitalRain);
		ptrType$3 = $ptrType(js.Object);
		funcType$1 = $funcType([ptrType$3], [], false);
		sliceType$3 = $sliceType($Int);
		mapType = $mapType($Int, ptrType$3);
		mapType$1 = $mapType($Int, mapType);
		main = function main$1() {
			var sheet;
			sheet = $global.document.createElement($externalize("style", $String));
			sheet.innerHTML = $externalize("html, body { \n\t\t\tpadding:0; margin:0; border:0; width:100%; height:100%; overflow:hidden;\n\t\t}\n\t\thtml{\n\t\t\tbackground: black;\n\t\t}", $String);
			$global.document.head.appendChild(sheet);
			$global.document.title = $externalize("whoa", $String);
			$global.addEventListener($externalize("load", $String), $externalize((function main·func1() {
					var {_r, _r$1, _tuple, _tuple$1, cover, err, rain1, rain2, $s, $r, $c} = $restore(this, {});
					/* */ $s = $s || 0; s: while (true) { switch ($s) { case 0:
					rain1 = [rain1];
					rain2 = [rain2];
					lowGlyphCanvases = new sliceType([NewGlyphCanvas("#6ba5b8"), NewGlyphCanvas("#3b806d")]);
					highGlyphCanvases = new sliceType([NewGlyphCanvas("#5b95a8"), NewGlyphCanvas("#5b9b9b")]);
					backgrounds = new sliceType$1(["#dcedfe", "#000000"]);
					_tuple = NewDigitalRain($global.document.body, level2Cols, 2, 8, 0.25);
					rain1[0] = _tuple[0];
					err = _tuple[1];
					/* */ if (!($interfaceIsEqual(err, $ifaceNil))) { $s = 1; continue; }
					/* */ $s = 2; continue;
					/* if (!($interfaceIsEqual(err, $ifaceNil))) { */ case 1:
						_r = err.Error(); /* */ $s = 3; case 3: if($c) { $c = false; _r = _r.$blk(); } if (_r && _r.$blk !== undefined) { break s; }
						console.log(_r);
						$s = -1; return;
					/* } */ case 2:
					cover = $global.document.createElement($externalize("div", $String));
					cover.style.height = $externalize("100%", $String);
					cover.style.width = $externalize("100%", $String);
					cover.style[$externalize("background-image", $String)] = $externalize("radial-gradient(ellipse farthest-corner at 45px 45px , #00FFFF 0%, rgba(0, 0, 255, 0) 50%, #0000FF 95%)", $String);
					cover.style.opacity = $externalize("0.18", $String);
					cover.style.position = $externalize("absolute", $String);
					$global.document.body.appendChild(cover);
					$global.addEventListener($externalize("resize", $String), $externalize((function(rain1, rain2) { return function main·func1·func1() {
							rain1[0].layout();
						}; })(rain1, rain2), funcType));
					_tuple$1 = NewDigitalRain($global.document.body, level1Cols, 2, 12, 1);
					rain2[0] = _tuple$1[0];
					err = _tuple$1[1];
					/* */ if (!($interfaceIsEqual(err, $ifaceNil))) { $s = 4; continue; }
					/* */ $s = 5; continue;
					/* if (!($interfaceIsEqual(err, $ifaceNil))) { */ case 4:
						_r$1 = err.Error(); /* */ $s = 6; case 6: if($c) { $c = false; _r$1 = _r$1.$blk(); } if (_r$1 && _r$1.$blk !== undefined) { break s; }
						console.log(_r$1);
						$s = -1; return;
					/* } */ case 5:
					$global.addEventListener($externalize("resize", $String), $externalize((function(rain1, rain2) { return function main·func1·func2() {
							rain2[0].layout();
						}; })(rain1, rain2), funcType));
					rain2[0].Clicked = (function(rain1, rain2) { return function main·func1·func3() {
							var _r$2, _r$3, _r$4, _r$5, _r$6, x, x$1, x$2, x$3, x$4;
							return;
							index = index + (1) >> 0;
							rain1[0].lowGlyphCanvas = (x = (_r$2 = index % 2, _r$2 === _r$2 ? _r$2 : $throwRuntimeError("integer divide by zero")), ((x < 0 || x >= lowGlyphCanvases.$length) ? ($throwRuntimeError("index out of range"), undefined) : lowGlyphCanvases.$array[lowGlyphCanvases.$offset + x]));
							rain1[0].highGlyphCanvas = (x$1 = (_r$3 = index % 2, _r$3 === _r$3 ? _r$3 : $throwRuntimeError("integer divide by zero")), ((x$1 < 0 || x$1 >= highGlyphCanvases.$length) ? ($throwRuntimeError("index out of range"), undefined) : highGlyphCanvases.$array[highGlyphCanvases.$offset + x$1]));
							rain2[0].lowGlyphCanvas = (x$2 = (_r$4 = index % 2, _r$4 === _r$4 ? _r$4 : $throwRuntimeError("integer divide by zero")), ((x$2 < 0 || x$2 >= lowGlyphCanvases.$length) ? ($throwRuntimeError("index out of range"), undefined) : lowGlyphCanvases.$array[lowGlyphCanvases.$offset + x$2]));
							rain2[0].highGlyphCanvas = (x$3 = (_r$5 = index % 2, _r$5 === _r$5 ? _r$5 : $throwRuntimeError("integer divide by zero")), ((x$3 < 0 || x$3 >= highGlyphCanvases.$length) ? ($throwRuntimeError("index out of range"), undefined) : highGlyphCanvases.$array[highGlyphCanvases.$offset + x$3]));
							$global.document.body.style.background = $externalize((x$4 = (_r$6 = index % 2, _r$6 === _r$6 ? _r$6 : $throwRuntimeError("integer divide by zero")), ((x$4 < 0 || x$4 >= backgrounds.$length) ? ($throwRuntimeError("index out of range"), undefined) : backgrounds.$array[backgrounds.$offset + x$4])), $String);
						}; })(rain1, rain2);
					$s = -1; return;
					/* */ } return; } var $f = {$blk: main·func1, $c: true, $r, _r, _r$1, _tuple, _tuple$1, cover, err, rain1, rain2, $s};return $f;
				}), funcType));
		};
		itoa = function itoa$1(i) {
			var i;
			return $internalize(new ($global.String)(i), $String);
		};
		ftoa = function ftoa$1(f) {
			var f;
			return $internalize(new ($global.String)(f), $String);
		};
		randi = function randi$1() {
			return (($parseFloat($global.Math.random()) * 2.147483647e+09 >> 0));
		};
		NewDigitalRain = function NewDigitalRain$1(parent, screenCols, minSpeed, maxSpeed, brightness) {
			var brightness, err, maxSpeed, minSpeed, parent, rain, screenCols;
			rain = new DigitalRain.ptr(parent, null, null, 0, 0, 0, 0, ptrType.nil, ptrType.nil, sliceType$2.nil, false, 0, 0, 0, 0, $throwNilPointerError);
			rain.screenCols = screenCols;
			rain.minSpeed = minSpeed;
			rain.maxSpeed = maxSpeed;
			rain.brightness = brightness;
			err = rain.start();
			if (!($interfaceIsEqual(err, $ifaceNil))) {
				return [ptrType$2.nil, err];
			}
			return [rain, $ifaceNil];
		};
		$pkg.NewDigitalRain = NewDigitalRain;
		$ptrType(DigitalRain).prototype.start = function start() {
			var _i, _ref, f, r, raf, s, $deferred;
			/* */ var $err = null; try { $deferred = []; $curGoroutine.deferStack.push($deferred);
			r = this;
			raf = "";
			_ref = new sliceType$1(["requestAnimationFrame", "webkitRequestAnimationFrame", "mozRequestAnimationFrame"]);
			_i = 0;
			while (true) {
				if (!(_i < _ref.$length)) { break; }
				s = ((_i < 0 || _i >= _ref.$length) ? ($throwRuntimeError("index out of range"), undefined) : _ref.$array[_ref.$offset + _i]);
				if (!($global[$externalize(s, $String)] === undefined)) {
					raf = s;
					break;
				}
				_i++;
			}
			if (raf === "") {
				$panic(new $String("requestAnimationFrame is not available"));
			}
			$deferred.push([$methodVal(r, "layout"), []]);
			f = $throwNilPointerError;
			f = (function DigitalRain·start·func1(timestampJS) {
					var timestampJS;
					$global[$externalize(raf, $String)]($externalize(f, funcType$1));
					r.loop(($parseFloat(timestampJS) / 1000));
				});
			$global[$externalize(raf, $String)]($externalize(f, funcType$1));
			return $ifaceNil;
			/* */ } catch(err) { $err = err; return $ifaceNil; } finally { $callDeferred($deferred, $err); }
		};
		$ptrType(DigitalRain).prototype.layout = function layout() {
			var _r, _r$1, _tmp, _tmp$1, _tmp$2, height, r, ratio, width, x, x$1;
			r = this;
			ratio = $parseFloat($global.devicePixelRatio);
			width = $parseFloat(r.parent.offsetWidth) * ratio;
			height = $parseFloat(r.parent.offsetHeight) * ratio;
			if (!(r.canvas === null) && (r.width === width) && (r.height === height) && (r.ratio === ratio)) {
				return;
			}
			_tmp = width;
			_tmp$1 = height;
			_tmp$2 = ratio;
			r.width = _tmp;
			r.height = _tmp$1;
			r.ratio = _tmp$2;
			if (!(r.canvas === null)) {
				r.parent.removeChild(r.canvas);
			}
			r.canvas = $global.document.createElement($externalize("canvas", $String));
			r.ctx = r.canvas.getContext($externalize("2d", $String));
			r.canvas.width = r.width;
			r.canvas.height = r.height;
			r.canvas.style.width = $externalize(ftoa(r.width / r.ratio) + "px", $String);
			r.canvas.style.height = $externalize(ftoa(r.height / r.ratio) + "px", $String);
			r.canvas.style.position = $externalize("absolute", $String);
			r.parent.appendChild(r.canvas);
			if (r.highGlyphCanvas === ptrType.nil) {
				r.highGlyphCanvas = (x = (_r = index % 2, _r === _r ? _r : $throwRuntimeError("integer divide by zero")), ((x < 0 || x >= highGlyphCanvases.$length) ? ($throwRuntimeError("index out of range"), undefined) : highGlyphCanvases.$array[highGlyphCanvases.$offset + x]));
			}
			if (r.lowGlyphCanvas === ptrType.nil) {
				r.lowGlyphCanvas = (x$1 = (_r$1 = index % 2, _r$1 === _r$1 ? _r$1 : $throwRuntimeError("integer divide by zero")), ((x$1 < 0 || x$1 >= lowGlyphCanvases.$length) ? ($throwRuntimeError("index out of range"), undefined) : lowGlyphCanvases.$array[lowGlyphCanvases.$offset + x$1]));
			}
			r.canvas.addEventListener($externalize("click", $String), $externalize((function DigitalRain·layout·func1(ev) {
					var {ev, $s, $r, $c} = $restore(this, {ev});
					/* */ $s = $s || 0; s: while (true) { switch ($s) { case 0:
					/* */ if (r.overLink($parseInt(ev.x) >> 0, $parseInt(ev.y) >> 0)) { $s = 1; continue; }
					/* */ $s = 2; continue;
					/* if (r.overLink($parseInt(ev.x) >> 0, $parseInt(ev.y) >> 0)) { */ case 1:
						$global.location = $externalize(githubLink, $String);
						$s = 3; continue;
					/* } else { */ case 2:
						/* */ if (!(r.Clicked === $throwNilPointerError)) { $s = 4; continue; }
						/* */ $s = 5; continue;
						/* if (!(r.Clicked === $throwNilPointerError)) { */ case 4:
							$r = r.Clicked(); /* */ $s = 6; case 6: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
						/* } */ case 5:
					/* } */ case 3:
					$s = -1; return;
					/* */ } return; } var $f = {$blk: DigitalRain·layout·func1, $c: true, $r, ev, $s};return $f;
				}), funcType$1));
			r.canvas.addEventListener($externalize("mousemove", $String), $externalize((function DigitalRain·layout·func2(ev) {
					var ev;
					if (r.overLink($parseInt(ev.x) >> 0, $parseInt(ev.y) >> 0)) {
						r.canvas.style.cursor = $externalize("pointer", $String);
						r.linkover = true;
					} else {
						r.canvas.style.cursor = $externalize("default", $String);
						r.linkover = false;
					}
				}), funcType$1));
			r.loop(r.timestamp);
		};
		$ptrType(DigitalRain).prototype.overLink = function overLink(x, y) {
			var r, x, y;
			r = this;
			return x > (((r.width / r.ratio >> 0)) - 320 >> 0) && y > (((r.height / r.ratio >> 0)) - 50 >> 0);
		};
		$ptrType(DigitalRain).prototype.dropWaterAtCol = function dropWaterAtCol(col, speed, length, start$1, created) {
			var _r, col, created, i, length, r, speed, start$1, wd, x;
			r = this;
			wd = new waterDrop.ptr(0, 0, 0, 0, sliceType$3.nil, false, 0);
			wd.col = col;
			wd.speed = speed;
			wd.glyphs = $makeSlice(sliceType$3, length);
			i = 0;
			while (true) {
				if (!(i < length)) { break; }
				(x = wd.glyphs, ((i < 0 || i >= x.$length) ? ($throwRuntimeError("index out of range"), undefined) : x.$array[x.$offset + i] = (_r = randi() % 72, _r === _r ? _r : $throwRuntimeError("integer divide by zero"))));
				i = i + (1) >> 0;
			}
			r.drops = $append(r.drops, wd);
			wd.row = start$1;
			wd.start = wd.row;
			wd.created = created;
		};
		$ptrType(DigitalRain).prototype.dropRandomWaterDrop = function dropRandomWaterDrop(timestamp) {
			var _i, _q, _r, _r$1, _r$2, _r$3, _ref, col, colcnt, drop, length, r, speed, start$1, timestamp;
			r = this;
			col = (_r = randi() % r.screenCols, _r === _r ? _r : $throwRuntimeError("integer divide by zero"));
			colcnt = 0;
			_ref = r.drops;
			_i = 0;
			while (true) {
				if (!(_i < _ref.$length)) { break; }
				drop = ((_i < 0 || _i >= _ref.$length) ? ($throwRuntimeError("index out of range"), undefined) : _ref.$array[_ref.$offset + _i]);
				if ((drop.col === col) && (((drop.row >> 0)) - drop.glyphs.$length >> 0) < 0) {
					colcnt = colcnt + (1) >> 0;
					if (colcnt > overlap) {
						return;
					}
				}
				_i++;
			}
			speed = (((_r$1 = randi() % ((r.maxSpeed - r.minSpeed >> 0)), _r$1 === _r$1 ? _r$1 : $throwRuntimeError("integer divide by zero")) + r.minSpeed >> 0));
			length = (_r$2 = randi() % 30, _r$2 === _r$2 ? _r$2 : $throwRuntimeError("integer divide by zero")) + 10 >> 0;
			start$1 = ((((_r$3 = randi() % r.maxRows(), _r$3 === _r$3 ? _r$3 : $throwRuntimeError("integer divide by zero"))) - (_q = r.maxRows() / 2, (_q === _q && _q !== 1/0 && _q !== -1/0) ? _q >> 0 : $throwRuntimeError("integer divide by zero")) >> 0));
			r.dropWaterAtCol(col, speed, length, start$1, timestamp);
		};
		$ptrType(DigitalRain).prototype.maxRows = function maxRows() {
			var cellSize, r;
			r = this;
			cellSize = r.width / (r.screenCols);
			return (((r.height / cellSize) + 2 >> 0));
		};
		$ptrType(DigitalRain).prototype.drawGlyphAt = function drawGlyphAt(nidx, col, row, brightness, head) {
			var brightness, col, head, nidx, r, row;
			r = this;
			if (col < 0 || col > r.screenCols || row < -1 || row > (r.maxRows())) {
				return;
			}
			r.drawGlyphElAt(r.lowGlyphCanvas, nidx, col, row, brightness);
			if (head) {
				r.drawGlyphElAt(r.highGlyphCanvas, nidx, col, row, brightness);
			}
		};
		$ptrType(DigitalRain).prototype.drawGlyphElAt = function drawGlyphElAt(glyphCanvas, nidx, col, row, brightness) {
			var _q, _r, brightness, cellSize, col, cx, cy, glyph, glyphCanvas, gx, gy, nidx, r, row;
			r = this;
			if (brightness <= 0.05) {
				return;
			}
			if (brightness > 1) {
				brightness = 1;
			}
			cellSize = r.width / (r.screenCols);
			gy = $imul(((_q = nidx / 18, (_q === _q && _q !== 1/0 && _q !== -1/0) ? _q >> 0 : $throwRuntimeError("integer divide by zero"))), 100);
			gx = $imul(((_r = nidx % 18, _r === _r ? _r : $throwRuntimeError("integer divide by zero"))), 100);
			cx = cellSize * (col) + cellSize / 2 - (cellSize * 1.5) / 2;
			cy = cellSize * (row);
			glyph = glyphCanvas.Glyph(gx, gy);
			if (!(glyph === null)) {
				r.ctx.save();
				r.ctx.globalAlpha = brightness;
				r.ctx.drawImage(glyph, cx, cy, cellSize * 1.5, cellSize * 1.5);
				r.ctx.restore();
			}
		};
		shortLink = function shortLink$1(link) {
			var i, link;
			i = 0;
			while (true) {
				if (!(i < link.length)) { break; }
				if ((link.charCodeAt(i) === 58) && (i + 2 >> 0) < link.length && (link.charCodeAt((i + 1 >> 0)) === 47) && (link.charCodeAt((i + 2 >> 0)) === 47)) {
					return $substring(link, (i + 3 >> 0));
				}
				i = i + (1) >> 0;
			}
			return link;
		};
		$ptrType(DigitalRain).prototype.drawTitle = function drawTitle(text, color, fontSize, y) {
			var color, fontSize, ny, pad, r, text, x, y;
			r = this;
			ny = y + (fontSize * 1.5);
			pad = 15 * r.ratio;
			x = r.width - pad;
			y = r.height - pad - y;
			r.ctx.save();
			r.ctx.font = $externalize(itoa(((fontSize >> 0))) + "px Menlo, Consolas, Monospace, Helvetica, Arial, Sans-Serif", $String);
			r.ctx.textAlign = $externalize("right", $String);
			r.ctx.lineWidth = 0;
			r.ctx.shadowColor = $externalize(color, $String);
			r.ctx.shadowBlur = (fontSize);
			r.ctx.fillStyle = $externalize(color, $String);
			r.ctx.fillText($externalize(text, $String), x, y);
			r.ctx.restore();
			return ny;
		};
		$ptrType(DigitalRain).prototype.drawTitles = function drawTitles() {
			var r, y;
			r = this;
			y = 0;
			if (r.linkover) {
				y = r.drawTitle(shortLink(githubLink), githubLinkOverColor, 15 * r.ratio, y);
			} else {
				y = r.drawTitle(shortLink(githubLink), githubLinkColor, 15 * r.ratio, y);
			}
		};
		$ptrType(DigitalRain).prototype.loop = function loop(timestamp) {
			var _i, _r, _r$1, _r$2, _r$3, _ref, age, brightness, drop, drops, elapsed, gbrightness, gcount, gl, glyph, i, r, ri, ri$1, row, timestamp, x, x$1, $deferred;
			/* */ var $err = null; try { $deferred = []; $curGoroutine.deferStack.push($deferred);
			r = this;
			if ((timestamp === 0) || (r.timestamp === 0)) {
				r.timestamp = timestamp;
				return;
			}
			elapsed = timestamp - r.timestamp;
			r.timestamp = timestamp;
			r.dropRandomWaterDrop(timestamp);
			r.ctx.clearRect(0, 0, r.width, r.height);
			$deferred.push([$methodVal(r, "drawTitles"), []]);
			drops = sliceType$2.nil;
			_ref = r.drops;
			_i = 0;
			while (true) {
				if (!(_i < _ref.$length)) { break; }
				drop = ((_i < 0 || _i >= _ref.$length) ? ($throwRuntimeError("index out of range"), undefined) : _ref.$array[_ref.$offset + _i]);
				ri = randi();
				if (!drop.spedup) {
					if ((_r = ri % 250, _r === _r ? _r : $throwRuntimeError("integer divide by zero")) === 0) {
						drop.speed = drop.speed * (((_r$1 = ri % 3, _r$1 === _r$1 ? _r$1 : $throwRuntimeError("integer divide by zero"))) + 0.8);
						drop.spedup = true;
					}
				}
				gbrightness = r.brightness;
				age = timestamp - drop.created;
				if (age < 1) {
					gbrightness = (age / 1);
				}
				drop.row = drop.row + ((elapsed) / 1 * drop.speed);
				gl = drop.glyphs.$length;
				if ((((drop.row >> 0)) - gl >> 0) > r.maxRows()) {
					_i++;
					continue;
				}
				drops = $append(drops, drop);
				gcount = ((drop.row - drop.start >> 0));
				if (gcount > drop.glyphs.$length) {
					gcount = drop.glyphs.$length;
				}
				i = 0;
				while (true) {
					if (!(i < gcount)) { break; }
					ri$1 = randi();
					glyph = (x = drop.glyphs, ((i < 0 || i >= x.$length) ? ($throwRuntimeError("index out of range"), undefined) : x.$array[x.$offset + i]));
					brightness = 1 - ((i) / (gcount));
					if ((_r$2 = ri$1 % 50, _r$2 === _r$2 ? _r$2 : $throwRuntimeError("integer divide by zero")) === 0) {
						glyph = (_r$3 = ri$1 % 72, _r$3 === _r$3 ? _r$3 : $throwRuntimeError("integer divide by zero"));
						(x$1 = drop.glyphs, ((i < 0 || i >= x$1.$length) ? ($throwRuntimeError("index out of range"), undefined) : x$1.$array[x$1.$offset + i] = glyph));
					}
					row = drop.row - (i);
					r.drawGlyphAt(glyph, drop.col, row, brightness * gbrightness, i === 0);
					i = i + (1) >> 0;
				}
				_i++;
			}
			r.drops = drops;
			/* */ } catch(err) { $err = err; } finally { $callDeferred($deferred, $err); }
		};
		NewGlyphCanvas = function NewGlyphCanvas$1(color) {
			var _1, _i, _ref, _rune, c, cellSize, col, color, ctx, fontSize, glyphCanvas, i, i$1, row;
			glyphCanvas = new GlyphCanvas.ptr($global.document.createElement($externalize("canvas", $String)), false);
			glyphCanvas.jso.width = 1900;
			glyphCanvas.jso.height = 500;
			ctx = glyphCanvas.jso.getContext($externalize("2d", $String));
			col = 0;
			row = 1;
			_ref = "02345789ABCEGIJMNPRVXYZ:>+*~\xEF\xBD\xA1\xEF\xBD\xA4\xE3\x82\xA4\xE3\x82\xA8\xE3\x82\xAB\xE3\x82\xAF\xE3\x82\xB3\xE3\x82\xB7\xE3\x82\xBB\xE3\x82\xBF\xE3\x83\x84\xE3\x83\x88\xE3\x83\x8B\xE3\x83\x8F\xE3\x83\x95\xE3\x83\x9B\xE3\x83\x9F\xE3\x83\xA1\xE3\x83\xA4\xE3\x83\xA9\xE3\x83\x8F\xE3\x83\x92\xE3\x83\xAB\xD8\xB1\xD8\xB9\xD9\x84\xD8\xAD\xD9\x88\xD8\xAF\xD7\xA1\xD7\xA6\xD7\xA9\xD7\x90\xD7\x99\xE0\xB8\x94\xE0\xB8\x9F\xE0\xB8\xA7\xE3\x85\x8F\xE3\x85\x93\xE3\x85\x97\xE3\x85\x9C-\xE3\x85\xA3\xC5\x81";
			_i = 0;
			while (true) {
				if (!(_i < _ref.length)) { break; }
				_rune = $decodeRune(_ref, _i);
				i = _i;
				c = _rune[0];
				if (col === 18) {
					row = row + (1) >> 0;
					col = 0;
				}
				cellSize = 100;
				fontSize = 86;
				if (i <= 36) {
					fontSize = fontSize * (0.87);
				}
				ctx.save();
				ctx.textAlign = $externalize("center", $String);
				ctx.font = $externalize(itoa(((fontSize >> 0))) + "px Monaco, Helvetica, Arial, Sans-Serif", $String);
				ctx.shadowColor = $externalize("rgba(255,255,255,0.1)", $String);
				ctx.shadowBlur = (fontSize) * 0.5;
				_1 = c;
				if ((_1 === (50)) || (_1 === (52)) || (_1 === (57))) {
					ctx.scale(-1, 1);
					ctx.translate(-(cellSize * (col) + cellSize / 2), cellSize * (row) + (fontSize - cellSize));
				} else {
					ctx.translate(cellSize * (col) + cellSize / 2, cellSize * (row) + (fontSize - cellSize));
				}
				i$1 = 0;
				while (true) {
					if (!(i$1 < 3)) { break; }
					ctx.fillStyle = $externalize(color, $String);
					ctx.fillText($externalize(($encodeRune(c)), $String), 0, 0);
					i$1 = i$1 + (1) >> 0;
				}
				ctx.restore();
				col = col + (1) >> 0;
				_i += _rune[1];
			}
			return glyphCanvas;
		};
		$pkg.NewGlyphCanvas = NewGlyphCanvas;
		$ptrType(GlyphCanvas).prototype.Glyph = function Glyph(gx, gy) {
			var _entry, _entry$1, _key, _key$1, ctx, gc, gx, gy, mx, my;
			gc = this;
			if (gc.glyphs === false) {
				gc.glyphs = new $global.Map();
			}
			mx = (_entry = $mapIndex(gc.glyphs,$Int.keyFor(gx)), _entry !== undefined ? _entry.v : false);
			if (mx === false) {
				mx = new $global.Map();
				_key = gx; (gc.glyphs || $throwRuntimeError("assignment to entry in nil map")).set($Int.keyFor(_key), { k: _key, v: mx });
			}
			my = (_entry$1 = $mapIndex(mx,$Int.keyFor(gy)), _entry$1 !== undefined ? _entry$1.v : null);
			if (my === null) {
				my = $global.document.createElement($externalize("canvas", $String));
				my.width = 100;
				my.height = 100;
				ctx = my.getContext($externalize("2d", $String));
				ctx.drawImage(gc.jso, gx, gy, 100, 100, 0, 0, 100, 100);
				_key$1 = gy; (mx || $throwRuntimeError("assignment to entry in nil map")).set($Int.keyFor(_key$1), { k: _key$1, v: my });
			}
			return my;
		};
		ptrType$2.methods = [{prop: "start", name: "start", pkg: "github.com/btwiuse/digitalrain", typ: $funcType([], [$error], false)}, {prop: "layout", name: "layout", pkg: "github.com/btwiuse/digitalrain", typ: $funcType([], [], false)}, {prop: "overLink", name: "overLink", pkg: "github.com/btwiuse/digitalrain", typ: $funcType([$Int, $Int], [$Bool], false)}, {prop: "dropWaterAtCol", name: "dropWaterAtCol", pkg: "github.com/btwiuse/digitalrain", typ: $funcType([$Int, $Float64, $Int, $Float64, Duration], [], false)}, {prop: "dropRandomWaterDrop", name: "dropRandomWaterDrop", pkg: "github.com/btwiuse/digitalrain", typ: $funcType([Duration], [], false)}, {prop: "maxRows", name: "maxRows", pkg: "github.com/btwiuse/digitalrain", typ: $funcType([], [$Int], false)}, {prop: "drawGlyphAt", name: "drawGlyphAt", pkg: "github.com/btwiuse/digitalrain", typ: $funcType([$Int, $Int, $Float64, $Float64, $Bool], [], false)}, {prop: "drawGlyphElAt", name: "drawGlyphElAt", pkg: "github.com/btwiuse/digitalrain", typ: $funcType([ptrType, $Int, $Int, $Float64, $Float64], [], false)}, {prop: "drawTitle", name: "drawTitle", pkg: "github.com/btwiuse/digitalrain", typ: $funcType([$String, $String, $Float64, $Float64], [$Float64], false)}, {prop: "drawTitles", name: "drawTitles", pkg: "github.com/btwiuse/digitalrain", typ: $funcType([], [], false)}, {prop: "loop", name: "loop", pkg: "github.com/btwiuse/digitalrain", typ: $funcType([Duration], [], false)}];
		ptrType.methods = [{prop: "Glyph", name: "Glyph", pkg: "", typ: $funcType([$Int, $Int], [ptrType$3], false)}];
		DigitalRain.init("github.com/btwiuse/digitalrain", [{prop: "parent", name: "parent", embedded: false, exported: false, typ: ptrType$3, tag: ""}, {prop: "canvas", name: "canvas", embedded: false, exported: false, typ: ptrType$3, tag: ""}, {prop: "ctx", name: "ctx", embedded: false, exported: false, typ: ptrType$3, tag: ""}, {prop: "width", name: "width", embedded: false, exported: false, typ: $Float64, tag: ""}, {prop: "height", name: "height", embedded: false, exported: false, typ: $Float64, tag: ""}, {prop: "ratio", name: "ratio", embedded: false, exported: false, typ: $Float64, tag: ""}, {prop: "timestamp", name: "timestamp", embedded: false, exported: false, typ: Duration, tag: ""}, {prop: "lowGlyphCanvas", name: "lowGlyphCanvas", embedded: false, exported: false, typ: ptrType, tag: ""}, {prop: "highGlyphCanvas", name: "highGlyphCanvas", embedded: false, exported: false, typ: ptrType, tag: ""}, {prop: "drops", name: "drops", embedded: false, exported: false, typ: sliceType$2, tag: ""}, {prop: "linkover", name: "linkover", embedded: false, exported: false, typ: $Bool, tag: ""}, {prop: "screenCols", name: "screenCols", embedded: false, exported: false, typ: $Int, tag: ""}, {prop: "minSpeed", name: "minSpeed", embedded: false, exported: false, typ: $Int, tag: ""}, {prop: "maxSpeed", name: "maxSpeed", embedded: false, exported: false, typ: $Int, tag: ""}, {prop: "brightness", name: "brightness", embedded: false, exported: false, typ: $Float64, tag: ""}, {prop: "Clicked", name: "Clicked", embedded: false, exported: true, typ: funcType, tag: ""}]);
		waterDrop.init("github.com/btwiuse/digitalrain", [{prop: "col", name: "col", embedded: false, exported: false, typ: $Int, tag: ""}, {prop: "row", name: "row", embedded: false, exported: false, typ: $Float64, tag: ""}, {prop: "start", name: "start", embedded: false, exported: false, typ: $Float64, tag: ""}, {prop: "speed", name: "speed", embedded: false, exported: false, typ: $Float64, tag: ""}, {prop: "glyphs", name: "glyphs", embedded: false, exported: false, typ: sliceType$3, tag: ""}, {prop: "spedup", name: "spedup", embedded: false, exported: false, typ: $Bool, tag: ""}, {prop: "created", name: "created", embedded: false, exported: false, typ: Duration, tag: ""}]);
		GlyphCanvas.init("github.com/btwiuse/digitalrain", [{prop: "jso", name: "jso", embedded: false, exported: false, typ: ptrType$3, tag: ""}, {prop: "glyphs", name: "glyphs", embedded: false, exported: false, typ: mapType$1, tag: ""}]);
	};
	$init = function() {
		$pkg.$init = function() {};
		/* */ var $f, $c = false, $s = 0, $r; if (this !== undefined && this.$blk !== undefined) { $f = this; $c = true; $s = $f.$s; $r = $f.$r; } s: while (true) { switch ($s) { case 0:
		$r = js.$init(); /* */ $s = 1; case 1: if($c) { $c = false; $r = $r.$blk(); } if ($r && $r.$blk !== undefined) { break s; }
		lowGlyphCanvases = sliceType.nil;
		highGlyphCanvases = sliceType.nil;
		backgrounds = sliceType$1.nil;
		overlap = 0;
		githubLinkColor = "rgba(107,165,184,.5)";
		githubLinkOverColor = "rgba(107,165,184,1)";
		githubLink = "http://github.com/tidwall/digitalrain";
		level1Cols = 40;
		level2Cols = 60;
		index = 1;
		if ($pkg === $mainPkg) {
			main();
			$mainFinished = true;
		}
		/* */ } return; } if ($f === undefined) { $f = { $blk: $init }; } $f.$s = $s; $f.$r = $r; return $f;
	};
	$pkg.$init = $init;
	return $pkg;
})();
$callForAllPackages("$finishSetup");
$synthesizeMethods();
$callForAllPackages("$initLinknames");
var $mainPkg = $packages["github.com/btwiuse/digitalrain"];
$packages["runtime"].$init();
$go($mainPkg.$init, []);
$flushConsole();

}).call(this);
//# sourceMappingURL=digitalrain.js.map
