// ncmdump-js 类型声明(手写,给 TS 用户补全提示)

/** 解析出的歌曲元数据(源自 ncm 内嵌 JSON) */
export interface NcmMetadata {
  musicId?: number
  musicName?: string
  artist?: [string, number][]
  /** 由 artist 拼接生成的歌手名,多个用 / 分隔 */
  artistName?: string
  albumId?: number
  album?: string
  bitrate?: number
  duration?: number
  format?: string
  [key: string]: unknown
}

export interface DumpResult {
  /** 可下载的音频 Blob */
  blob: Blob
  /** 完整输出文件名,如 "贝贝.flac" */
  filename: string
  /** 输出扩展名 */
  extension: 'mp3' | 'flac'
  /** 音频格式 */
  format: 'mp3' | 'flac'
  /** 歌曲元数据 */
  metadata: NcmMetadata | null
  /** 封面图片原始字节 */
  image: Uint8Array | null
  /** 解密后的裸音频字节 */
  audio: Uint8Array
  /** 浏览器中直接触发下载 */
  download: () => void
}

export interface DumpOptions {
  /** 是否写入标题/歌手/专辑/封面,默认 true */
  fixMetadata?: boolean
  /** 自定义输出文件名(不含扩展名),默认取歌名 */
  filename?: string
}

export type NcmInput = Blob | ArrayBuffer | Uint8Array

export interface ParseResult {
  format: 'mp3' | 'flac'
  metadata: NcmMetadata | null
  image: Uint8Array | null
  audio: Uint8Array
}

/** 解密一个 ncm 文件并返回可下载的 Blob */
export function dump(input: NcmInput, options?: DumpOptions): Promise<DumpResult>

/** 在浏览器中触发 Blob 下载 */
export function downloadBlob(blob: Blob, filename: string): void

/** 解析 ncm 文件字节,返回音频/元数据/封面(不改动传入数据) */
export function parseNcm(input: ArrayBufferView | ArrayBuffer): ParseResult

/** 统一转成 Uint8Array */
export function toUint8Array(input: Uint8Array | ArrayBuffer): Uint8Array

/** 判断图片字节是否为 PNG */
export function isPng(image: Uint8Array | null | undefined): boolean

/** 由密钥生成 KeyBox 表 */
export function buildKeyBox(key: Uint8Array): Uint8Array

/** 用 KeyBox 原地解密一段数据 */
export function decryptData(keyBox: Uint8Array, buffer: Uint8Array): void

/** AES-128-ECB 解密(去除 PKCS7 填充) */
export function aesEcbDecrypt(key: Uint8Array, src: Uint8Array): Uint8Array

/** 网易云硬编码密钥 */
export const CORE_KEY: Uint8Array
export const MODIFY_KEY: Uint8Array
