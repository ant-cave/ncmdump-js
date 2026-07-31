// ncmdump-js 核心测试
// 覆盖:真实 ncm 文件解码 / 非法输入 / dump 输出 / MP3 往返测试
import { describe, it, expect, beforeAll, afterEach } from 'vitest'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { parseBuffer } from 'music-metadata'
import { parseNcm } from '../src/lib/ncm.js'
import { dump } from '../src/index.js'
import { buildNcm } from './helpers/encode.js'

// 真实 ncm 样例(仓库内 test/fixtures/test.ncm)
const NCM_PATH = fileURLToPath(new URL('./fixtures/test.ncm', import.meta.url))
const MP3_PATH = fileURLToPath(new URL('./fixtures/sample.mp3', import.meta.url))
const PNG_PATH = fileURLToPath(new URL('./fixtures/pixel.png', import.meta.url))

let ncmBuffer
let parsed

beforeAll(async () => {
  ncmBuffer = await readFile(NCM_PATH)
  parsed = parseNcm(ncmBuffer)
})

describe('真实 ncm 文件解码(test/test.ncm)', () => {
  it('识别为 flac', () => {
    expect(parsed.format).toBe('flac')
  })

  it('解析出正确的元数据', () => {
    expect(parsed.metadata.musicName).toBe('贝贝')
    expect(parsed.metadata.artistName).toBe('李荣浩')
    expect(parsed.metadata.album).toBe('耳朵')
    expect(parsed.metadata.duration).toBe(4000)
  })

  it('提取封面图片', () => {
    expect(parsed.image).toBeTruthy()
    expect(parsed.image.length).toBeGreaterThan(0)
  })

  it('解密后的音频是合法 FLAC(可被 music-metadata 解析)', async () => {
    const mm = await parseBuffer(parsed.audio)
    expect(mm.format.container).toBe('FLAC')
    expect(mm.format.duration).toBeCloseTo(4, 0)
  })
})

describe('非法输入', () => {
  it('非 ncm 文件抛错', () => {
    expect(() => parseNcm(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]))).toThrow()
  })

  it('过短输入抛错', () => {
    expect(() => parseNcm(new Uint8Array(4))).toThrow()
  })

  it('错误类型抛错', () => {
    expect(() => parseNcm('not-bytes')).toThrow()
  })
})

describe('dump() 输出(flac)', () => {
  it('默认输出带标签的 flac', async () => {
    const result = await dump(ncmBuffer)
    expect(result.extension).toBe('flac')
    expect(result.filename).toBe('贝贝.flac')

    const bytes = new Uint8Array(await result.blob.arrayBuffer())
    const mm = await parseBuffer(bytes)
    expect(mm.format.container).toBe('FLAC')
    expect(mm.common.title).toBe('贝贝')
    expect(mm.common.artist).toContain('李荣浩')
    expect(mm.common.album).toBe('耳朵')
    expect(mm.common.picture?.length).toBeGreaterThan(0)
  })

  it('fixMetadata:false 输出裸音频', async () => {
    const result = await dump(ncmBuffer, { fixMetadata: false })
    const bytes = new Uint8Array(await result.blob.arrayBuffer())
    expect(bytes).toEqual(parsed.audio)
  })

  it('支持自定义文件名', async () => {
    const result = await dump(ncmBuffer, { filename: '我的歌' })
    expect(result.filename).toBe('我的歌.flac')
  })
})

describe('MP3 往返测试(合成 ncm)', () => {
  it('加密→解密得到与原音频一致的 mp3', async () => {
    const mp3 = new Uint8Array(await readFile(MP3_PATH))
    const ncm = buildNcm({
      audio: mp3,
      musicName: '测试歌',
      artistName: '测试手',
      album: '测试专辑',
    })
    const { format, metadata, audio } = parseNcm(ncm)
    expect(format).toBe('mp3')
    expect(metadata.musicName).toBe('测试歌')
    expect(metadata.artistName).toBe('测试手')
    expect(audio).toEqual(mp3)
  })

  it('dump() 写入 mp3 标签与封面并可被 music-metadata 解析', async () => {
    const mp3 = new Uint8Array(await readFile(MP3_PATH))
    const png = new Uint8Array(await readFile(PNG_PATH))
    const ncm = buildNcm({
      audio: mp3,
      musicName: '测试歌',
      artistName: '测试手',
      album: '测试专辑',
      image: png,
    })

    const result = await dump(ncm, { filename: '测试' })
    expect(result.extension).toBe('mp3')
    expect(result.filename).toBe('测试.mp3')

    const bytes = new Uint8Array(await result.blob.arrayBuffer())
    // 写入了新的 ID3v2 标签
    expect(bytes[0]).toBe(0x49) // I
    expect(bytes[1]).toBe(0x44) // D
    expect(bytes[2]).toBe(0x33) // 3

    const mm = await parseBuffer(bytes)
    expect(mm.common.title).toBe('测试歌')
    expect(mm.common.artist).toContain('测试手')
    expect(mm.common.album).toBe('测试专辑')
    expect(mm.common.picture?.length).toBeGreaterThan(0)
  })

  it('原始 mp3 自带 ID3v1 标签时能被剥离,避免重复', async () => {
    const mp3 = new Uint8Array(await readFile(MP3_PATH))
    // 手工附加一个 ID3v1 标签(最后 128 字节以 "TAG" 开头)
    const withId3v1 = new Uint8Array(mp3.length + 128)
    withId3v1.set(mp3)
    withId3v1[mp3.length] = 0x54 // T
    withId3v1[mp3.length + 1] = 0x41 // A
    withId3v1[mp3.length + 2] = 0x47 // G

    const ncm = buildNcm({ audio: withId3v1 })
    const { audio } = parseNcm(ncm)
    const result = await dump(ncm, { filename: 'test' })
    const bytes = new Uint8Array(await result.blob.arrayBuffer())
    // 写标签后不应再出现 ID3v1 的 "TAG" 残留(最后 128 字节)
    const tail = bytes.slice(-128)
    expect(tail[0]).not.toBe(0x54)
    expect(audio.length).toBe(withId3v1.length)
  })
})

describe('缺失封面自动拉取(fetchMissingCover)', () => {
  const ORIGINAL_FETCH = globalThis.fetch

  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH
  })

  // 构造无封面、但元数据带 albumPic 的 ncm
  function buildNoCoverNcm() {
    const mp3 = new Uint8Array([
      0x49, 0x44, 0x33, 0x03, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    ])
    return buildNcm({
      audio: mp3,
      albumPic: 'http://p4.music.126.net/abc==/123.jpg',
    })
  }

  it('未内置封面时自动从 CDN 拉取并写入', async () => {
    const fetchedUrls = []
    // 用仓库内的真实 PNG fixture 作为"拉取到的封面"
    const fakePng = new Uint8Array(await readFile(PNG_PATH))
    globalThis.fetch = async (url) => {
      fetchedUrls.push(url)
      return {
        ok: true,
        arrayBuffer: async () => fakePng.buffer.slice(fakePng.byteOffset, fakePng.byteOffset + fakePng.byteLength),
      }
    }

    const ncm = buildNoCoverNcm()
    const result = await dump(ncm)
    // 构造的合成 ncm 无封面,由 CDN 拉取补齐
    expect(result.image).toBeTruthy()
    expect(result.image).toEqual(fakePng)
    // 拉取时把 http 升级为 https
    expect(fetchedUrls[0]).toMatch(/^https:\/\//)
  })

  it('fetchMissingCover:false 时不发起网络请求', async () => {
    let called = false
    globalThis.fetch = async () => {
      called = true
      return { ok: true, arrayBuffer: async () => new ArrayBuffer(0) }
    }

    const ncm = buildNoCoverNcm()
    const result = await dump(ncm, { fetchMissingCover: false })
    expect(called).toBe(false)
    // 无内置封面且关闭拉取时,image 为 null
    expect(result.image).toBeNull()
  })

  it('拉取失败时静默降级为 null,不抛错', async () => {
    globalThis.fetch = async () => {
      throw new Error('network error')
    }

    const ncm = buildNoCoverNcm()
    const result = await dump(ncm)
    expect(result.image).toBeNull()
  })

  it('无 albumPic 元数据时不发请求', async () => {
    let called = false
    globalThis.fetch = async () => {
      called = true
      return { ok: true, arrayBuffer: async () => new ArrayBuffer(0) }
    }

    // 构造无封面且无 albumPic 的 ncm
    const mp3 = new Uint8Array([0x49, 0x44, 0x33, 0x03, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00])
    const ncm = buildNcm({ audio: mp3 })
    const { metadata } = parseNcm(ncm)
    expect(metadata.albumPic).toBeUndefined()

    const result = await dump(ncm)
    // 没有 albumPic 时 fetchCover 直接返回 null,不调用 fetch
    expect(called).toBe(false)
    expect(result.image).toBeNull()
  })
})
