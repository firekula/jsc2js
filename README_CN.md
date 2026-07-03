# jsc2js

[English](./README.md) | **中文**

加密 / 解密 Cocos Creator `.jsc` 文件（XXTEA），与 `.js` 源码互转。

## 概述

Cocos Creator 使用 [XXTEA][xxtea] 加密配合 gzip 压缩来保护 JavaScript
源码文件（`.jsc`）。`jsc2js` 是一个命令行工具，支持：

- **解密** `.jsc` → `.js`（默认模式）
- **加密** `.js` → `.jsc`（使用 `-encode`）

## 安装

```bash
# 克隆仓库
git clone https://github.com/firekula/jsc2js.git
cd jsc2js

# 安装依赖
npm install

# 注册为全局命令（可选）
npm link
```

注册后可直接使用 `jsc2js` 命令；如不注册，用 `node index.js` 代替。

要求 **Node.js ≥ 14**。

## 用法

```
jsc2js <path> -k <key> [options]            # 解密 .jsc → .js（默认）
jsc2js <path> -k <key> -encode [options]    # 加密 .js  → .jsc
```

| 参数 | 说明 |
|------|------|
| `-k`, `--key <key>` | XXTEA 加解密密钥（**必填**） |
| `-encode` | 切换为加密模式（`.js` → `.jsc`），默认为解密 |
| `-o`, `--output <dir>` | 输出目录（默认与源文件同目录；目录输入时保留目录结构） |
| `-r`, `--recursive` | 递归处理子目录（目录输入时始终启用） |
| `-h`, `--help` | 显示帮助信息 |

## 示例

### 解密

```bash
# 单个文件（输出到 .jsc 同目录）
jsc2js ./index.jsc -k "mySecretKey"

# 整个目录，保留目录结构
jsc2js ./assets -k "mySecretKey" -o ./decrypted

# 原地解密（.jsc → .js 生成在同一目录树中）
jsc2js ./src -k "abc123"
```

### 加密

```bash
# 单个文件
jsc2js ./script.js -k "mySecretKey" -encode

# 整个目录，镜像输出
jsc2js ./src -k "abc123" -encode -o ./encrypted
```

## 工作原理

```
解密:  .jsc  ── XXTEA 解密 ──►  gzip 数据  ── 解压 ──►  .js
加密:  .js   ── gzip 压缩 ──►  gzip 数据  ── XXTEA 加密 ──►  .jsc
```

1. **Gzip** — JavaScript 源码首先用 gzip（deflate + 头部）压缩。
2. **XXTEA** — 压缩后的数据使用用户提供的密钥通过 XXTEA 分组密码加密，
   密钥长度 128 位。

解密时按顺序尝试三种解压方式：
1. Node.js `zlib.gunzipSync`（原生，最快）
2. [pako][pako] inflate（纯 JavaScript）
3. Python `zlib.decompress`（兜底，处理边缘情况）

## 许可证

MIT

[xxtea]: https://en.wikipedia.org/wiki/XXTEA
[pako]: https://github.com/nodeca/pako
