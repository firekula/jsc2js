# Update Log

## v1.1.0 (2026-07-04)

### Added
- `-encode` flag: encrypt `.js` files back to `.jsc` format.
- `xxteaEncrypt()` — XXTEA encryption (forward direction of the cipher).
- `findAllJs()` — recursively discover `.js` files in a directory.
- `encryptFile()` / `encryptFileWithMirror()` — file-level encode helpers
  (plain output and directory-structure mirroring).
- `tryGzip()` — compress source with gzip before XXTEA encryption.
- Automatic 4‑byte alignment padding before encryption so that non-aligned
  gzip payloads survive a full encrypt → decrypt round-trip.

### Changed
- CLI now prints mode-specific messages: "Encrypting" vs "Decrypting".
- `printUsage()` updated with encode examples and flag descriptions.
- `package.json` description updated to reflect bidirectional support.

### Fixed
- Encode → decode round-trip was broken for input data whose length was
  not a multiple of 4 bytes.  Padding bytes modified by XXTEA during
  encryption are now preserved in the output so that the decryption side
  can reconstruct the exact `Uint32Array`.

## v1.0.0 (2026-06-17)

### Added
- Initial release: decrypt `.jsc` → `.js`.
- XXTEA decryption (`xxteaDecrypt`).
- Gzip decompression with three fallback backends (Node.js zlib, pako, Python).
- Single-file and recursive directory processing.
- Directory-structure mirroring with `-o`.
