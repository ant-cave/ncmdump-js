// ncm 文件解析与音频解密核心
// 对应 C++ 版 src/ncmcrypt.cpp 的构造函数与 Dump 方法。
import { aesEcbDecrypt, CORE_KEY, MODIFY_KEY } from './aes.js'
import { buildKeyBox, decryptData } from './keybox.js'

// 文件头魔数 "CTENFDAM"
const MAGIC = Uint8Array.from([0x43, 0x54, 0x45, 0x4e, 0x46, 0x44, 0x41, 0x4d])
// PNG 魔数,用于判断封面格式
const PNG_MAGIC = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

/**
 * 把多种输入统一转成 Uint8Array
 * @param {Uint8Array|ArrayBuffer|ArrayBufferView} input
 * @returns {Uint8Array}
 */
export function toUint8Array(input) {
  if (input instanceof Uint8Array) return input
  if (input instanceof ArrayBuffer) return new Uint8Array(input)
  throw new Error('输入必须是 Uint8Array 或 ArrayBuffer')
}

// 读取小端序 uint32
function readUint32(data, offset) {
  return (
    data[offset] |
    (data[offset + 1] << 8) |
    (data[offset + 2] << 16) |
    ((data[offset + 3] << 24) >>> 0)
  )
}

// Base64 解码(Uint8Array -> Uint8Array)
function base64Decode(data) {
  let binary = ''
  for (let i = 0; i < data.length; i++) binary += String.fromCharCode(data[i])
  const decoded = atob(binary)
  const out = new Uint8Array(decoded.length)
  for (let i = 0; i < decoded.length; i++) out[i] = decoded.charCodeAt(i)
  return out
}

// 解析元数据里的歌手数组:形如 [["歌手名", id], ...]
function formatArtist(artistJson) {
  if (!Array.isArray(artistJson)) return ''
  const names = []
  for (const artist of artistJson) {
    // 每个元素是 [名字, id]
    if (Array.isArray(artist) && artist.length > 0 && typeof artist[0] === 'string') {
      names.push(artist[0])
    }
  }
  return names.join('/')
}

/**
 * 解析 ncm 文件,并返回解密后的音频与元数据
 * @param {Uint8Array|ArrayBuffer|ArrayBufferView} input
 * @returns {{ format: 'mp3'|'flac', metadata: object|null, image: Uint8Array|null, audio: Uint8Array }}
 */
export function parseNcm(input) {
  const src = toUint8Array(input)
  // 拷贝一份再处理:避免解密(XOR)时原地改写调用方传入的 Buffer/视图
  const data = new Uint8Array(src.length)
  data.set(src)
  if (data.length < 16) throw new Error('Not netease protected file')

  // 1. 校验文件头魔数
  for (let i = 0; i < 8; i++) {
    if (data[i] !== MAGIC[i]) throw new Error('Not netease protected file')
  }

  let offset = 8
  // 2. 跳过 2 字节预留位
  offset += 2

  // 3. 读取并解密密钥数据
  const keyLen = readUint32(data, offset)
  offset += 4
  if (keyLen <= 0) throw new Error('Broken NCM file')

  const keyData = data.slice(offset, offset + keyLen)
  offset += keyLen
  // 每个字节异或 0x64
  for (let i = 0; i < keyData.length; i++) keyData[i] ^= 0x64

  // 用 CORE_KEY 做 AES-128-ECB 解密
  const mKeyData = aesEcbDecrypt(CORE_KEY, keyData)
  // 前 17 字节为固定前缀,第 17 字节起才是真正的流密钥
  const key = mKeyData.subarray(17)
  const keyBox = buildKeyBox(key)

  // 4. 读取并解密元数据段(以 "music:" 开头的 JSON)
  const metaLen = readUint32(data, offset)
  offset += 4
  let metadata = null
  if (metaLen > 0) {
    const modifyData = data.slice(offset, offset + metaLen)
    offset += metaLen
    // 每个字节异或 0x63
    for (let i = 0; i < modifyData.length; i++) modifyData[i] ^= 0x63

    // 去掉前 22 字节前缀 "163 key(Don't modify):" 后 Base64 解码
    const decoded = base64Decode(modifyData.subarray(22))
    // 用 MODIFY_KEY 做 AES-128-ECB 解密
    const decryptDataBytes = aesEcbDecrypt(MODIFY_KEY, decoded)
    // 去掉前 6 字节前缀 "music:" 后即为 JSON
    const jsonBytes = decryptDataBytes.subarray(6)
    const jsonStr = new TextDecoder('utf-8').decode(jsonBytes)
    metadata = JSON.parse(jsonStr)
    metadata.artistName = formatArtist(metadata.artist)
  }

  // 5. 跳过 5 字节(CRC32 + 图片版本),然后读取封面帧
  offset += 5
  const coverFrameLen = readUint32(data, offset)
  offset += 4
  const imageLen = readUint32(data, offset)
  offset += 4

  let image = null
  if (imageLen > 0) {
    image = data.slice(offset, offset + imageLen)
  }
  offset += imageLen
  // 封面帧长度包含图片数据之外的内容,跳过剩余部分
  offset += coverFrameLen - imageLen

  // 6. 剩余即为加密的音频流,原地解密
  const audio = data.slice(offset)
  decryptData(keyBox, audio)

  // 7. 判断格式:以 ID3 开头为 mp3,否则按 flac 处理
  let format = 'flac'
  if (audio.length >= 3 && audio[0] === 0x49 && audio[1] === 0x44 && audio[2] === 0x33) {
    format = 'mp3'
  }

  return { format, metadata, image, audio }
}

/**
 * 判断图片数据是否为 PNG 格式
 * @param {Uint8Array} image
 * @returns {boolean}
 */
export function isPng(image) {
  if (!image || image.length < 8) return false
  for (let i = 0; i < 8; i++) {
    if (image[i] !== PNG_MAGIC[i]) return false
  }
  return true
}
