// AES-128-ECB 解密封装
// 说明:WebCrypto API 不支持 ECB 模式,这里使用 aes-js 纯 JS 库完成解密。
// 对应 C++ 版 src/ncmcrypt.cpp 中的 aesEcbDecrypt。
import aesjs from 'aes-js'

// 网易云硬编码的两个 AES-128 密钥(与 C++ 版 sCoreKey / sModifyKey 一致,去掉末尾的 \\0)
export const CORE_KEY = Uint8Array.from([
  0x68, 0x7a, 0x48, 0x52, 0x41, 0x6d, 0x73, 0x6f,
  0x35, 0x6b, 0x49, 0x6e, 0x62, 0x61, 0x78, 0x57,
]) // "hzHRAmso5kInbaxW"

export const MODIFY_KEY = Uint8Array.from([
  0x23, 0x31, 0x34, 0x6c, 0x6a, 0x6b, 0x5f, 0x21,
  0x5c, 0x5d, 0x26, 0x30, 0x55, 0x3c, 0x27, 0x28,
]) // "#14ljk_!\\]&0U<'("

/**
 * AES-128-ECB 解密
 * @param {Uint8Array} key  16 字节密钥
 * @param {Uint8Array} src  密文
 * @returns {Uint8Array} 明文(去除 PKCS7 填充)
 */
export function aesEcbDecrypt(key, src) {
  const blockCount = src.length >> 4
  if (blockCount <= 0) return new Uint8Array(0)

  // 只取整块数据,aes-js 要求输入是 16 的整数倍
  const blockData = src.slice(0, blockCount << 4)
  const ecb = new aesjs.ModeOfOperation.ecb(key)
  const out = new Uint8Array(ecb.decrypt(blockData))

  // 去除 PKCS7 填充:最后一字节为填充长度,若异常则视为无填充
  let pad = out[out.length - 1]
  if (pad > 16) pad = 0
  return out.subarray(0, out.length - pad)
}
