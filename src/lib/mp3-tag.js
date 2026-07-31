// MP3 标签写入:基于 browser-id3-writer 写 ID3v2 标题/歌手/专辑/封面
// 写之前会剥离源音频自带的 ID3v2 / ID3v1 标签,避免出现重复标签。
import ID3Writer from 'browser-id3-writer'
import { isPng } from './ncm.js'

// 去掉开头的 ID3v2 标签(synchsafe 长度)
function stripId3v2(audio) {
  if (audio.length < 10 || audio[0] !== 0x49 || audio[1] !== 0x44 || audio[2] !== 0x33) {
    return audio
  }
  const size =
    ((audio[6] & 0x7f) << 21) |
    ((audio[7] & 0x7f) << 14) |
    ((audio[8] & 0x7f) << 7) |
    (audio[9] & 0x7f)
  const total = 10 + size
  if (total > audio.length) return audio
  return audio.subarray(total)
}

// 去掉末尾的 ID3v1 标签(最后 128 字节以 "TAG" 开头)
function stripId3v1(audio) {
  if (
    audio.length >= 128 &&
    audio[audio.length - 128] === 0x54 &&
    audio[audio.length - 127] === 0x41 &&
    audio[audio.length - 126] === 0x47
  ) {
    return audio.subarray(0, audio.length - 128)
  }
  return audio
}

/**
 * 为 mp3 音频写入标题/歌手/专辑与封面,返回 Blob
 * @param {Uint8Array} audio 已解密的 mp3 数据
 * @param {object|null} metadata
 * @param {Uint8Array|null} image
 * @returns {Blob}
 */
export function writeMp3Tags(audio, metadata, image) {
  const clean = stripId3v1(stripId3v2(audio))
  const writer = new ID3Writer(clean)

  if (metadata) {
    if (metadata.musicName) writer.setFrame('TIT2', metadata.musicName)
    if (metadata.artistName) writer.setFrame('TPE1', String(metadata.artistName).split('/'))
    if (metadata.album) writer.setFrame('TALB', metadata.album)
  }

  if (image && image.length > 0) {
    writer.setFrame('APIC', {
      type: 3,
      data: image,
      description: 'cover',
      useUnicodeEncoding: false,
    })
  }

  writer.addTag()
  return writer.getBlob()
}
