import bs58 from 'bs58'

export function base58ToBytes(value: string) {
  return bs58.decode(value)
}

export function base64ToBytes(value: string) {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0))
}

export function bytesToBase58(bytes: Uint8Array) {
  return bs58.encode(bytes)
}

export function bytesToBase64(bytes: Uint8Array) {
  let binary = ''

  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }

  return btoa(binary)
}

export async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))

  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}
