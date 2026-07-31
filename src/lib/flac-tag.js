// FLAC 标签写入:手写 FLAC 元数据块(VORBIS_COMMENT + PICTURE)
// FLAC 文件结构:4 字节 "fLaC" + 若干元数据块 + 音频帧数据。
// 每个元数据块:1 字节(最高位为 last 标志,低 7 位为类型)+ 3 字节大端长度 + 数据。
import { isPng } from './ncm.js'

// 拼接多个 Uint8Array
function concat(parts) {
  const total = parts.reduce((sum, p) => sum + p.length, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const p of parts) {
    out.set(p, offset)
    offset += p.length
  }
  return out
}

// 小端序 uint32
function u32le(value) {
  return Uint8Array.from([value & 0xff, (value >> 8) & 0xff, (value >> 16) & 0xff, (value >> 24) & 0xff])
}

// 大端序 uint32
function u32be(value) {
  return Uint8Array.from([(value >> 24) & 0xff, (value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff])
}

// 构建一个元数据块(含块头)
function buildBlock(type, payload, isLast) {
  const len = payload.length
  const header = new Uint8Array(4)
  header[0] = (isLast ? 0x80 : 0) | (type & 0x7f)
  header[1] = (len >> 16) & 0xff
  header[2] = (len >> 8) & 0xff
  header[3] = len & 0xff
  return concat([header, payload])
}

// 构建 VORBIS_COMMENT 块数据
// 注意:FLAC 的 VORBIS_COMMENT 块不含 Ogg Vorbis 的 "vorbis" 魔数,
// 数据直接以 vendor 长度开头(小端序),与 FLAC 规范一致。
function buildVorbisComment(metadata) {
  const enc = new TextEncoder()
  const vendor = 'reference libFLAC 1.4.3 20230623'

  const comments = []
  if (metadata.musicName) comments.push(`TITLE=${metadata.musicName}`)
  if (metadata.artistName) comments.push(`ARTIST=${metadata.artistName}`)
  if (metadata.album) comments.push(`ALBUM=${metadata.album}`)

  const parts = []
  const vendorBytes = enc.encode(vendor)
  parts.push(u32le(vendorBytes.length), vendorBytes)
  parts.push(u32le(comments.length))
  for (const comment of comments) {
    const cb = enc.encode(comment)
    parts.push(u32le(cb.length), cb)
  }
  return concat(parts)
}

// 构建 PICTURE 块数据(FLAC 块内使用大端序)
function buildPicture(image) {
  const enc = new TextEncoder()
  const mime = isPng(image) ? 'image/png' : 'image/jpeg'
  const mimeBytes = enc.encode(mime)
  const descBytes = enc.encode('')

  return concat([
    u32be(3), // 图片类型:front cover
    u32be(mimeBytes.length), mimeBytes,
    u32be(descBytes.length), descBytes,
    u32be(0), // 宽(未知)
    u32be(0), // 高(未知)
    u32be(0), // 位深(未知)
    u32be(0), // 调色板颜色数(未知)
    u32be(image.length), image,
  ])
}

/**
 * 为 flac 音频写入标题/歌手/专辑与封面
 * 解析现有元数据块,移除旧的 VORBIS_COMMENT / PICTURE,再重新组装
 * @param {Uint8Array} audio 已解密的 flac 数据
 * @param {object|null} metadata
 * @param {Uint8Array|null} image
 * @returns {Uint8Array}
 */
export function writeFlacTags(audio, metadata, image) {
  // 校验 "fLaC" 魔数
  if (
    audio.length < 4 ||
    audio[0] !== 0x66 || audio[1] !== 0x4c ||
    audio[2] !== 0x61 || audio[3] !== 0x43
  ) {
    throw new Error('Invalid FLAC file')
  }

  // 解析现有元数据块,移除 VORBIS_COMMENT(4)/PICTURE(6)
  let offset = 4
  const kept = []
  while (offset < audio.length) {
    const header = audio[offset]
    const isLast = (header & 0x80) !== 0
    const type = header & 0x7f
    const len = (audio[offset + 1] << 16) | (audio[offset + 2] << 8) | audio[offset + 3]
    offset += 4
    const payload = audio.slice(offset, offset + len)
    offset += len
    if (type !== 4 && type !== 6) {
      kept.push({ type, payload })
    }
    if (isLast) break
  }
  const audioStart = offset

  // 组装新块
  const blocks = [...kept]
  if (metadata) {
    blocks.push({ type: 4, payload: buildVorbisComment(metadata) })
  }
  if (image && image.length > 0) {
    blocks.push({ type: 6, payload: buildPicture(image) })
  }

  const parts = [Uint8Array.from([0x66, 0x4c, 0x61, 0x43])] // "fLaC"
  for (let i = 0; i < blocks.length; i++) {
    const isLast = i === blocks.length - 1
    parts.push(buildBlock(blocks[i].type, blocks[i].payload, isLast))
  }
  parts.push(audio.subarray(audioStart))

  return concat(parts)
}
