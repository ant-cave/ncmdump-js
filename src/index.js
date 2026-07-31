// ncmdump-js 公开入口
// 纯前端解密网易云音乐 ncm 加密文件,输出 mp3/flac(可选写入歌曲信息与封面)。
import { parseNcm } from './lib/ncm.js'
import { writeMp3Tags } from './lib/mp3-tag.js'
import { writeFlacTags } from './lib/flac-tag.js'

// 重新导出底层工具,便于高级用法
export { parseNcm, toUint8Array, isPng } from './lib/ncm.js'
export { buildKeyBox, decryptData } from './lib/keybox.js'
export { aesEcbDecrypt, CORE_KEY, MODIFY_KEY } from './lib/aes.js'

// 把 File / Blob / ArrayBuffer / Uint8Array 统一解析为原始字节
async function resolveInput(input) {
  if (typeof Blob !== 'undefined' && input instanceof Blob) {
    return new Uint8Array(await input.arrayBuffer())
  }
  return input
}

/**
 * 解密一个 ncm 文件
 * @param {File|Blob|ArrayBuffer|Uint8Array} input
 * @param {{ fixMetadata?: boolean, filename?: string }} [options]
 *   - fixMetadata 默认 true,写入标题/歌手/专辑/封面;false 只输出裸音频
 *   - filename 自定义输出文件名(不含扩展名),默认取元数据歌名
 * @returns {Promise<{
 *   blob: Blob,
 *   filename: string,
 *   extension: 'mp3'|'flac',
 *   format: 'mp3'|'flac',
 *   metadata: object|null,
 *   image: Uint8Array|null,
 *   audio: Uint8Array,
 *   download: () => void,
 * }>}
 */
export async function dump(input, options = {}) {
  const { fixMetadata = true, filename } = options
  const bytes = await resolveInput(input)
  const { format, metadata, image, audio } = parseNcm(bytes)

  const mime = format === 'mp3' ? 'audio/mpeg' : 'audio/flac'
  let blob
  if (fixMetadata) {
    if (format === 'mp3') {
      blob = writeMp3Tags(audio, metadata, image)
    } else {
      blob = new Blob([writeFlacTags(audio, metadata, image)], { type: mime })
    }
  } else {
    blob = new Blob([audio], { type: mime })
  }

  const base = filename || (metadata && metadata.musicName) || 'output'
  const fullName = `${base}.${format}`

  return {
    blob,
    filename: fullName,
    extension: format,
    format,
    metadata,
    image,
    audio,
    download() {
      downloadBlob(blob, fullName)
    },
  }
}

/**
 * 在浏览器中触发 Blob 下载
 * @param {Blob} blob
 * @param {string} filename
 */
export function downloadBlob(blob, filename) {
  if (typeof document === 'undefined') {
    throw new Error('downloadBlob 仅在浏览器环境可用')
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
