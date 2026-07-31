// 测试辅助工具:把裸音频"加密"成 ncm 文件(仅用于往返测试,不进发布包)
// 逻辑与 ncmcrypt 解密过程互逆,用于验证 JS 解码器对 MP3 等格式的整条链路。
import aesjs from 'aes-js'
import { CORE_KEY, MODIFY_KEY } from '../../src/lib/aes.js'
import { buildKeyBox, decryptData } from '../../src/lib/keybox.js'

const MAGIC = Uint8Array.from([0x43, 0x54, 0x45, 0x4e, 0x46, 0x44, 0x41, 0x4d])

// 拼接 Uint8Array
function concat(parts) {
  const total = parts.reduce((s, p) => s + p.length, 0)
  const out = new Uint8Array(total)
  let off = 0
  for (const p of parts) {
    out.set(p, off)
    off += p.length
  }
  return out
}

// 小端序 uint32
function u32le(value) {
  return Uint8Array.from([value & 0xff, (value >> 8) & 0xff, (value >> 16) & 0xff, (value >> 24) & 0xff])
}

// AES-128-ECB 加密(自动补齐 PKCS7 填充)
function aesEcbEncrypt(key, data) {
  const pad = 16 - (data.length % 16)
  const padded = new Uint8Array(data.length + pad)
  padded.set(data)
  for (let i = data.length; i < padded.length; i++) padded[i] = pad
  const ecb = new aesjs.ModeOfOperation.ecb(key)
  return new Uint8Array(ecb.encrypt(padded))
}

// Base64 编码
function base64Encode(data) {
  let bin = ''
  for (let i = 0; i < data.length; i++) bin += String.fromCharCode(data[i])
  return btoa(bin)
}

const enc = new TextEncoder()

/**
 * 把音频加密为 ncm 文件字节
 * @param {{ audio: Uint8Array, musicName?: string, artistName?: string, album?: string, image?: Uint8Array, albumPic?: string }} param
 * @returns {Uint8Array}
 */
export function buildNcm({ audio, musicName = '测试歌曲', artistName = '测试歌手', album = '测试专辑', image, albumPic }) {
  // 1. 密钥:17 字节固定前缀 + 随机 key
  const keyPrefix = Uint8Array.from({ length: 17 }, () => Math.floor(Math.random() * 256))
  const key = Uint8Array.from({ length: 17 }, () => Math.floor(Math.random() * 256))
  const keyRaw = concat([keyPrefix, key])
  const keyData = aesEcbEncrypt(CORE_KEY, keyRaw)
  // 与解码器对应:存储前每个字节异或 0x64(解码时再异或回来)
  for (let i = 0; i < keyData.length; i++) keyData[i] ^= 0x64
  const keyBox = buildKeyBox(key)

  // 2. 加密音频(流异或是对称运算)
  const encryptedAudio = audio.slice()
  decryptData(keyBox, encryptedAudio)

  // 3. 元数据段
  const metaJson = JSON.stringify({
    musicName,
    artist: [[artistName, 1]],
    album,
    format: 'mp3',
    bitrate: 48000,
    duration: 1000,
    albumPic,
  })
  const metaEnc = aesEcbEncrypt(MODIFY_KEY, concat([enc.encode('music:'), enc.encode(metaJson)]))
  const metaB64 = enc.encode(base64Encode(metaEnc))
  const metaRaw = concat([enc.encode("163 key(Don't modify):"), metaB64])
  for (let i = 0; i < metaRaw.length; i++) metaRaw[i] ^= 0x63

  // 4. 封面帧(可选)
  const imageLen = image ? image.length : 0
  const coverFrameLen = imageLen + 0

  // 5. 组装文件
  const parts = [
    MAGIC,
    Uint8Array.from([0x01, 0x69]), // 2 字节预留位
    u32le(keyData.length), keyData,
    u32le(metaRaw.length), metaRaw,
    Uint8Array.from([0, 0, 0, 0, 0]), // CRC32 + 图片版本
    u32le(coverFrameLen),
    u32le(imageLen),
  ]
  if (imageLen > 0) parts.push(image)
  parts.push(encryptedAudio)

  return concat(parts)
}
