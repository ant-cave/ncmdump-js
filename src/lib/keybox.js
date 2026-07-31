// 音频流解密用的 KeyBox(类似 RC4 的 KSA)与逐字节异或解密
// 对应 C++ 版 src/ncmcrypt.cpp 中的 buildKeyBox 与 Dump 里的置换异或。

/**
 * 由解密后的密钥生成 256 字节的 KeyBox 表
 * @param {Uint8Array} key
 * @returns {Uint8Array}
 */
export function buildKeyBox(key) {
  const keyBox = new Uint8Array(256)
  for (let i = 0; i < 256; i++) keyBox[i] = i

  let swap = 0
  let c = 0
  let lastByte = 0
  let keyOffset = 0

  for (let i = 0; i < 256; i++) {
    swap = keyBox[i]
    c = (swap + lastByte + key[keyOffset++]) & 0xff
    if (keyOffset >= key.length) keyOffset = 0
    keyBox[i] = keyBox[c]
    keyBox[c] = swap
    lastByte = c
  }

  return keyBox
}

/**
 * 用 KeyBox 原地解密一段数据(逐字节异或)
 * @param {Uint8Array} keyBox
 * @param {Uint8Array} buffer 将被原地修改
 */
export function decryptData(keyBox, buffer) {
  for (let i = 0; i < buffer.length; i++) {
    const j = (i + 1) & 0xff
    buffer[i] ^=
      keyBox[(keyBox[j] + keyBox[(keyBox[j] + j) & 0xff]) & 0xff]
  }
}
