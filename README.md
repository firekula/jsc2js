# jsc2js

**English** | [中文](./README_CN.md)

Encrypt / decrypt Cocos Creator `.jsc` files (XXTEA) to / from `.js` source.

## Overview

Cocos Creator uses [XXTEA][xxtea] encryption with gzip compression to protect
JavaScript source files (`.jsc`).  `jsc2js` provides a command-line tool to:

- **decrypt** `.jsc` → `.js`  (default mode)
- **encrypt** `.js`   → `.jsc` (with `-encode`)

## Installation

```bash
# Clone the repo
git clone https://github.com/firekula/jsc2js.git
cd jsc2js

# Install dependencies
npm install

# (Optional) Register as a global command
npm link
```

Once linked you can use `jsc2js` directly; otherwise use `node index.js`.

Requires **Node.js ≥ 14**.

## Usage

```
jsc2js <path> -k <key> [options]            # decrypt .jsc → .js (default)
jsc2js <path> -k <key> -encode [options]    # encrypt .js   → .jsc
```

| Option | Description |
|--------|-------------|
| `-k`, `--key <key>` | XXTEA encryption / decryption key (**required**) |
| `-encode` | Encrypt `.js` → `.jsc` instead of the default decrypt mode |
| `-o`, `--output <dir>` | Output directory (default: same as source; directory input mirrors structure) |
| `-r`, `--recursive` | Process directory recursively (always on for directories) |
| `-h`, `--help` | Show help |

## Examples

### Decrypt

```bash
# Single file (output next to the .jsc)
jsc2js ./index.jsc -k "mySecretKey"

# Entire directory, keep folder structure
jsc2js ./assets -k "mySecretKey" -o ./decrypted

# Decrypt in-place (overwrites .jsc → .js in the same tree)
jsc2js ./src -k "abc123"
```

### Encrypt

```bash
# Single file
jsc2js ./script.js -k "mySecretKey" -encode

# Entire directory, mirrored output
jsc2js ./src -k "abc123" -encode -o ./encrypted
```

## How it works

```
Decrypt:  .jsc  ── XXTEA decrypt ──►  gzip data  ── gunzip ──►  .js
Encrypt:  .js   ── gzip ──►  gzip data  ── XXTEA encrypt ──►  .jsc
```

1. **Gzip** — JavaScript source is compressed with gzip (deflate + header).
2. **XXTEA** — The compressed data is encrypted with the XXTEA block cipher
   using a 128-bit key derived from the user-supplied password.

During decryption, three inflate backends are tried in order:
1. Node.js `zlib.gunzipSync` (fast, native)
2. [pako][pako] inflate (pure JavaScript)
3. Python `zlib.decompress` (fallback for edge cases)

## License

MIT

[xxtea]: https://en.wikipedia.org/wiki/XXTEA
[pako]: https://github.com/nodeca/pako
