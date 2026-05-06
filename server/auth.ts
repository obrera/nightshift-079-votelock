import * as ed from '@noble/ed25519'

import { base58ToBytes, base64ToBytes, bytesToBase64, sha256Hex } from './encoding'

export async function createBallotHash(value: string) {
  return sha256Hex(value)
}

export async function createToken(value: string) {
  return bytesToBase64(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))))
}

export function getBearerToken(header: string | undefined) {
  if (!header?.startsWith('Bearer ')) {
    return null
  }

  return header.slice('Bearer '.length)
}

export async function verifyWalletSignature(input: { message: string; signature: string; voter: string }) {
  try {
    return await ed.verifyAsync(
      base64ToBytes(input.signature),
      new TextEncoder().encode(input.message),
      base58ToBytes(input.voter),
    )
  } catch {
    return false
  }
}
