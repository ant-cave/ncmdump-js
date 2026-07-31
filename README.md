# ncmdump-js

纯前端解密网易云音乐 `.ncm` 加密文件,输出 `mp3` / `flac`,支持写入歌曲信息(标题/歌手/专辑)与封面。

全程在浏览器内存中完成,文件不会上传到任何服务器。核心思路与 C++ 版 [ncmdump](https://github.com/taurusxin/ncmdump) 一致:AES-128-ECB 解密密钥 + KeyBox 流式异或还原音频流。

## 特性

- 纯前端运行,支持 `<script>` 标签直接引入,无需任何构建工具
- 自动识别 mp3 / flac
- 解析歌曲标题、歌手、专辑、封面
- 为输出文件写入标签与封面(MP3 用 ID3v2,FLAC 用 Vorbis Comment + PICTURE)
- ncm 未内置封面时自动从网易云 CDN 拉取(可关闭)
- 同时产出 ESM / CJS / UMD 三份产物,浏览器、Node、打包工具都能用
- 附带 TypeScript 类型声明(`index.d.ts`)
- 单元测试包含真实 `test.ncm` 文件验证

## 安装

```bash
npm install ncmdump-js
# 或
pnpm add ncmdump-js
```

## 使用

### 打包工具(Vite / Webpack 等)

```html
<script type="module">
import { dump } from 'ncmdump-js'

document.getElementById('file').addEventListener('change', async (e) => {
  const result = await dump(e.target.files[0])
  result.download() // 直接触发下载 贝贝.flac
})
</script>
```

### 浏览器(`<script>` 标签 + CDN,无需打包)

```html
<script src="https://cdn.jsdelivr.net/npm/ncmdump-js@latest/dist/ncmdump.umd.min.js"></script>
<script>
document.getElementById('file').addEventListener('change', async (e) => {
  const result = await NcmDump.dump(e.target.files[0])
  result.download()
})
</script>
```

### Node.js

```js
import { dump } from 'ncmdump-js'
import { readFile, writeFile } from 'node:fs/promises'

const result = await dump(await readFile('song.ncm'))
await writeFile(result.filename, result.audio)
```

## API

### `dump(input, options?) => Promise<DumpResult>`

解密一个 ncm 文件。

| 参数 | 类型 | 说明 |
|---|---|---|
| `input` | `File` / `Blob` / `ArrayBuffer` / `Uint8Array` | ncm 文件内容 |
| `options.fixMetadata` | `boolean` | 默认 `true`,写入标题/歌手/专辑/封面;`false` 时输出裸音频 |
| `options.filename` | `string` | 自定义输出文件名(不含扩展名),默认取歌名 |
| `options.fetchMissingCover` | `boolean` | 默认 `true`,当 ncm 未内置封面时从网易云 CDN 拉取;`false` 时跳过网络请求 |

返回的 `DumpResult`:

| 字段 | 类型 | 说明 |
|---|---|---|
| `blob` | `Blob` | 可下载的音频文件 |
| `filename` | `string` | 完整文件名,如 `贝贝.flac` |
| `extension` | `'mp3' \| 'flac'` | 音频格式 |
| `metadata` | `object \| null` | 歌曲元数据(`musicName` / `artistName` / `album` 等) |
| `image` | `Uint8Array \| null` | 封面图片字节 |
| `audio` | `Uint8Array` | 解密后的裸音频字节 |
| `download()` | `() => void` | 浏览器中触发下载 |

### 其他导出

- `parseNcm(bytes)` — 只解析,返回 `{ format, metadata, image, audio }`
- `fetchCover(metadata)` — 从网易云 CDN 拉取封面字节,失败返回 `null`
- `downloadBlob(blob, filename)` — 浏览器中触发 Blob 下载
- `buildKeyBox(key)` / `decryptData(keyBox, buffer)` — 底层流解密工具
- `aesEcbDecrypt(key, src)` / `CORE_KEY` / `MODIFY_KEY` — 底层 AES 工具

## 工作原理

1. 读取文件头魔数,确认是 ncm 格式(前 8 字节 `0x4e4554434d414431`,即 "NETCMAD1")
2. 用固定公钥 `CORE_KEY` 对密钥段做 AES-128-ECB 解密,再按字节异或得到真正的 AES 密钥
3. 用该密钥对元数据段 AES-128-ECB 解密并异或,解析出 JSON(歌名/歌手/专辑/封面等)
4. 封面图片段跳过,其余为音频流段
5. 音频流段用 `buildKeyBox` + `decryptData` 逐字节异或还原成裸 mp3 / flac 数据
6. 可选写入标签:MP3 追加 ID3v2,FLAC 追加 Vorbis Comment + PICTURE 封面

## 兼容性

- 浏览器:需要支持 `Blob` / `Uint8Array`,现代浏览器均可(含移动端)
- Node.js:≥ 18(依赖 `Blob`,Node 18+ 内置)
- 可通过 `<script>` 标签(UMD,全局 `NcmDump`)或 ESM / CJS 模块引入

## 开发

```bash
pnpm install
pnpm test    # 单元测试(含与真实 test.ncm 的验证)
pnpm dev     # 本地浏览器 demo
pnpm build   # 构建 dist 三产物
```

## 发布

打 `v*` tag 即触发 GitHub Actions 发布流程(校验版本号一致 → 发布 npm → 生成 GitHub Release):

```bash
pnpm version <version>
git push --tags
```

## 说明

- 本项目仅用于学习与个人合法用途,请尊重音乐版权。
- 封面图的宽高在 FLAC 中标记为未知(0),不影响播放器显示。
- 网易云音乐 3.0+ 部分版本下载的 ncm 文件不内置封面,此时 `dump()` 会默认从网易云 CDN 按 `albumPic` 地址拉取封面;如不需要联网,请传 `fetchMissingCover: false`。

## License

MIT
