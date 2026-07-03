#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

// ── XXTEA implementation ──────────────────────────────────────────────

const DELTA = 0x9e3779b9;

function mx(sum, y, z, p, e, k) {
  return ((z >>> 5 ^ y << 2) + (y >>> 3 ^ z << 4)) ^ ((sum ^ y) + (k[p & 3 ^ e] ^ z));
}

function toUint32Array(bytes) {
  const n = bytes.length;
  const u32 = new Uint32Array(Math.ceil(n / 4));
  for (let i = 0; i < n; i++) {
    u32[i >>> 2] |= bytes[i] << ((i & 3) << 3);
  }
  return u32;
}

function toBytes(u32, length) {
  const bytes = Buffer.alloc(length);
  for (let i = 0; i < length; i++) {
    bytes[i] = (u32[i >>> 2] >>> ((i & 3) << 3)) & 0xff;
  }
  return bytes;
}

function strToKey(str) {
  let buf = Buffer.from(str, "utf8");
  if (buf.length > 16) buf = buf.subarray(0, 16);
  else if (buf.length < 16) buf = Buffer.concat([buf, Buffer.alloc(16 - buf.length)]);
  return toUint32Array(buf);
}

function xxteaDecrypt(data, key) {
  if (data.length === 0) return data;
  const v = toUint32Array(data);
  const k = strToKey(key);
  const n = v.length;
  if (n < 2) return data;

  let rounds = 6 + Math.floor(52 / n);
  let sum = (rounds * DELTA) >>> 0;
  let y = v[0];

  while (rounds-- > 0) {
    let e = (sum >>> 2) & 3;
    let p;
    for (p = n - 1; p > 0; p--) {
      let z = v[p - 1];
      v[p] = (v[p] - mx(sum, y, z, p, e, k)) >>> 0;
      y = v[p];
    }
    let z = v[n - 1];
    v[0] = (v[0] - mx(sum, y, z, 0, e, k)) >>> 0;
    y = v[0];
    sum = (sum - DELTA) >>> 0;
  }

  return toBytes(v, data.length);
}

function xxteaEncrypt(data, key) {
  if (data.length === 0) return data;

  // Pad to multiple of 4 bytes: XXTEA operates on full uint32 words,
  // and the padding bytes get modified during encryption. They must be
  // preserved in the output so that decryption can reconstruct the
  // exact uint32 array. (gzip is self-delimiting, so extra trailing
  // zero-bytes are harmless for the decompressor.)
  let padded = data;
  const rem = data.length % 4;
  if (rem !== 0) {
    padded = Buffer.alloc(data.length + (4 - rem));
    data.copy(padded);
  }

  const v = toUint32Array(padded);
  const k = strToKey(key);
  const n = v.length;
  if (n < 2) return data;

  let rounds = 6 + Math.floor(52 / n);
  let sum = 0;
  let z = v[n - 1];
  let y;

  do {
    sum += DELTA;
    let e = (sum >>> 2) & 3;
    let p;
    for (p = 0; p < n - 1; p++) {
      y = v[p + 1];
      z = v[p] += mx(sum, y, z, p, e, k);
    }
    y = v[0];
    z = v[n - 1] += mx(sum, y, z, n - 1, e, k);
  } while (--rounds);

  return toBytes(v, padded.length);
}

// ── File processing ───────────────────────────────────────────────────

const zlib = require("zlib");
const pako = require("pako");
const { execSync } = require("child_process");

function tryGunzip(data) {
  if (data.length >= 2 && data[0] === 0x1f && data[1] === 0x8b) {
    // Try Node.js zlib first (fast, native)
    try { return zlib.gunzipSync(data); } catch (_) {}
    // Try raw deflate via pako (pure JS, handles some edge cases)
    try { return Buffer.from(pako.inflate(data.subarray(10))); } catch (_) {}
    // Last resort: Python zlib (handles rare deflate streams that JS libs reject)
    try {
      console.log("  [info] JS inflate failed, falling back to Python zlib...");
      return execSync(
        'python -c "import sys,zlib;sys.stdout.buffer.write(zlib.decompress(sys.stdin.buffer.read(),-15))"',
        { input: data.subarray(10), maxBuffer: 512 * 1024 * 1024 }
      );
    } catch (_) {}
    return data;
  }
  return data;
}

function tryGzip(data) {
  // Compress with gzip (deflate + gzip header) using pako
  return Buffer.from(pako.gzip(data));
}

function decryptFile(jscPath, key, outputDir) {
  const encrypted = fs.readFileSync(jscPath);
  if (encrypted.length === 0) {
    console.error(`  [skip] ${jscPath}: empty file`);
    return;
  }

  const decrypted = tryGunzip(xxteaDecrypt(encrypted, key));

  const relPath = path.basename(jscPath).replace(/\.jsc$/, ".js");
  const outPath = outputDir
    ? path.join(outputDir, relPath)
    : path.join(path.dirname(jscPath), relPath);

  if (outputDir) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  fs.writeFileSync(outPath, decrypted);
  console.log(`  [ok] ${jscPath} -> ${outPath}`);
}

function findAllJsc(dir) {
  const results = [];
  function walk(d) {
    const entries = fs.readdirSync(d, { withFileTypes: true });
    for (const ent of entries) {
      const full = path.join(d, ent.name);
      if (ent.isDirectory()) {
        walk(full);
      } else if (ent.isFile() && ent.name.endsWith(".jsc")) {
        results.push(full);
      }
    }
  }
  walk(dir);
  return results;
}

function findAllJs(dir) {
  const results = [];
  function walk(d) {
    const entries = fs.readdirSync(d, { withFileTypes: true });
    for (const ent of entries) {
      const full = path.join(d, ent.name);
      if (ent.isDirectory()) {
        walk(full);
      } else if (ent.isFile() && ent.name.endsWith(".js")) {
        results.push(full);
      }
    }
  }
  walk(dir);
  return results;
}

function mirrorOutputPath(jscPath, inputRootDir, outputRootDir) {
  const rel = path.relative(inputRootDir, jscPath);
  const outRel = rel.replace(/\.jsc$/, ".js");
  const outPath = path.join(outputRootDir, outRel);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  return outPath;
}

function decryptFileWithMirror(jscPath, key, inputRootDir, outputRootDir) {
  const encrypted = fs.readFileSync(jscPath);
  if (encrypted.length === 0) {
    console.error(`  [skip] ${jscPath}: empty file`);
    return;
  }

  const decrypted = tryGunzip(xxteaDecrypt(encrypted, key));
  const outPath = mirrorOutputPath(jscPath, inputRootDir, outputRootDir);
  fs.writeFileSync(outPath, decrypted);
  console.log(`  [ok] ${path.relative(inputRootDir, jscPath)} -> ${path.relative(outputRootDir, outPath)}`);
}

// ── Encrypt helpers ────────────────────────────────────────────────────

function encryptFile(jsPath, key, outputDir) {
  const source = fs.readFileSync(jsPath);
  if (source.length === 0) {
    console.error(`  [skip] ${jsPath}: empty file`);
    return;
  }

  const encrypted = xxteaEncrypt(tryGzip(source), key);

  const relPath = path.basename(jsPath).replace(/\.js$/, ".jsc");
  const outPath = outputDir
    ? path.join(outputDir, relPath)
    : path.join(path.dirname(jsPath), relPath);

  if (outputDir) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  fs.writeFileSync(outPath, encrypted);
  console.log(`  [ok] ${jsPath} -> ${outPath}`);
}

function mirrorOutputPathJs(jsPath, inputRootDir, outputRootDir) {
  const rel = path.relative(inputRootDir, jsPath);
  const outRel = rel.replace(/\.js$/, ".jsc");
  const outPath = path.join(outputRootDir, outRel);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  return outPath;
}

function encryptFileWithMirror(jsPath, key, inputRootDir, outputRootDir) {
  const source = fs.readFileSync(jsPath);
  if (source.length === 0) {
    console.error(`  [skip] ${jsPath}: empty file`);
    return;
  }

  const encrypted = xxteaEncrypt(tryGzip(source), key);
  const outPath = mirrorOutputPathJs(jsPath, inputRootDir, outputRootDir);
  fs.writeFileSync(outPath, encrypted);
  console.log(`  [ok] ${path.relative(inputRootDir, jsPath)} -> ${path.relative(outputRootDir, outPath)}`);
}

// ── CLI ───────────────────────────────────────────────────────────────

function printUsage() {
  console.log(`
  jsc2js — Decrypt Cocos Creator .jsc files (XXTEA) to .js, and vice versa

  Usage:
    jsc2js <path> -k <key> [options]            (decrypt .jsc → .js, default)
    jsc2js <path> -k <key> -encode [options]    (encrypt .js → .jsc)

  Arguments:
    <path>            Path to a .jsc/.js file or a directory containing them

  Options:
    -k, --key <key>   XXTEA encryption/decryption key (required)
    -encode            Encrypt .js → .jsc instead of the default decrypt mode
    -o, --output <dir> Output directory (default: same as input for single files,
                       mirrors input structure for directories)
    -r, --recursive    Process directory recursively (default for directories)
    -h, --help         Show this help

  Examples:
    jsc2js ./index.jsc -k "mySecretKey"
    jsc2js ./assets -k "mySecretKey" -o ./decrypted
    jsc2js ./src -k "abc123" -r
    jsc2js ./script.js -k "mySecretKey" -encode
    jsc2js ./src -k "abc123" -encode -o ./encrypted
`);
}

function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes("-h") || args.includes("--help")) {
    printUsage();
    process.exit(0);
  }

  let key = "";
  let outputDir = "";
  let inputPath = "";
  let encode = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "-k" || args[i] === "--key") {
      key = args[++i];
    } else if (args[i] === "-o" || args[i] === "--output") {
      outputDir = args[++i];
    } else if (args[i] === "-encode") {
      encode = true;
    } else if (args[i] === "-r" || args[i] === "--recursive") {
      // recursive is the default for directories; flag accepted but no-op
    } else if (!args[i].startsWith("-")) {
      inputPath = args[i];
    }
  }

  if (!inputPath) {
    console.error("Error: <path> is required.");
    printUsage();
    process.exit(1);
  }

  if (!key) {
    console.error("Error: -k <key> is required.");
    printUsage();
    process.exit(1);
  }

  const resolved = path.resolve(inputPath);
  const stat = fs.statSync(resolved);

  if (stat.isFile()) {
    if (encode) {
      if (!resolved.endsWith(".js")) {
        console.error(`Warning: ${resolved} does not have .js extension. Processing anyway...`);
      }
      console.log(`Encrypting 1 file with key "${key}"...`);
      encryptFile(resolved, key, outputDir || null);
    } else {
      if (!resolved.endsWith(".jsc")) {
        console.error(`Warning: ${resolved} does not have .jsc extension. Processing anyway...`);
      }
      console.log(`Decrypting 1 file with key "${key}"...`);
      decryptFile(resolved, key, outputDir || null);
    }
  } else if (stat.isDirectory()) {
    if (encode) {
      const files = findAllJs(resolved);
      if (files.length === 0) {
        console.error("No .js files found in directory.");
        process.exit(1);
      }
      console.log(`Found ${files.length} .js file(s). Encrypting with key "${key}"...`);

      if (outputDir) {
        const resolvedOutput = path.resolve(outputDir);
        for (const f of files) {
          encryptFileWithMirror(f, key, resolved, resolvedOutput);
        }
        console.log(`\nDone. ${files.length} file(s) encrypted to ${resolvedOutput}`);
      } else {
        for (const f of files) {
          encryptFile(f, key, null);
        }
        console.log(`\nDone. ${files.length} file(s) encrypted in-place.`);
      }
    } else {
      const files = findAllJsc(resolved);
      if (files.length === 0) {
        console.error("No .jsc files found in directory.");
        process.exit(1);
      }
      console.log(`Found ${files.length} .jsc file(s). Decrypting with key "${key}"...`);

      if (outputDir) {
        const resolvedOutput = path.resolve(outputDir);
        for (const f of files) {
          decryptFileWithMirror(f, key, resolved, resolvedOutput);
        }
        console.log(`\nDone. ${files.length} file(s) decrypted to ${resolvedOutput}`);
      } else {
        for (const f of files) {
          decryptFile(f, key, null);
        }
        console.log(`\nDone. ${files.length} file(s) decrypted in-place.`);
      }
    }
  } else {
    console.error(`Error: ${resolved} is not a valid file or directory.`);
    process.exit(1);
  }
}

main();
