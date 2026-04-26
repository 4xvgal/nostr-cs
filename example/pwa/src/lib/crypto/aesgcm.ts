// AES-256-GCM encrypt/decrypt + sha256, using browser Web Crypto.
// One-shot (in-memory) — fine for typical CS attachments (<100MB).

function toBase64(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(s)
}

function fromBase64(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function toHex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export async function sha256Hex(data: ArrayBuffer | Uint8Array): Promise<string> {
  const buf =
    data instanceof Uint8Array
      ? data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
      : data
  const hash = await crypto.subtle.digest('SHA-256', buf as ArrayBuffer)
  return toHex(new Uint8Array(hash))
}

export interface EncryptResult {
  ciphertext: Uint8Array
  keyB64: string
  ivB64: string
  plaintextSha256: string
  ciphertextSha256: string
}

export async function encryptBlob(plaintext: Uint8Array): Promise<EncryptResult> {
  const keyBytes = crypto.getRandomValues(new Uint8Array(32))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const cryptoKey = await crypto.subtle.importKey('raw', keyBytes as BufferSource, { name: 'AES-GCM' }, false, ['encrypt'])
  const ctBuf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, cryptoKey, plaintext as BufferSource)
  const ciphertext = new Uint8Array(ctBuf)
  const [plaintextSha256, ciphertextSha256] = await Promise.all([sha256Hex(plaintext), sha256Hex(ciphertext)])
  return {
    ciphertext,
    keyB64: toBase64(keyBytes),
    ivB64: toBase64(iv),
    plaintextSha256,
    ciphertextSha256,
  }
}

export async function decryptBlob(args: {
  ciphertext: Uint8Array
  keyB64: string
  ivB64: string
  expectedPlaintextSha256?: string
  expectedCiphertextSha256?: string
}): Promise<Uint8Array> {
  if (args.expectedCiphertextSha256) {
    const got = await sha256Hex(args.ciphertext)
    if (got !== args.expectedCiphertextSha256) {
      throw new Error('ciphertext sha256 mismatch (transport corruption or wrong blob)')
    }
  }
  const keyBytes = fromBase64(args.keyB64)
  const iv = fromBase64(args.ivB64)
  const cryptoKey = await crypto.subtle.importKey('raw', keyBytes as BufferSource, { name: 'AES-GCM' }, false, ['decrypt'])
  const ptBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv as BufferSource }, cryptoKey, args.ciphertext as BufferSource)
  const plaintext = new Uint8Array(ptBuf)
  if (args.expectedPlaintextSha256) {
    const got = await sha256Hex(plaintext)
    if (got !== args.expectedPlaintextSha256) {
      throw new Error('plaintext sha256 mismatch (decryption produced wrong content)')
    }
  }
  return plaintext
}
