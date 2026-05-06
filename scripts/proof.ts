import * as ed from '@noble/ed25519'
import bs58 from 'bs58'

const baseUrl = process.env.VOTELOCK_PROOF_BASE_URL ?? 'http://127.0.0.1:4179'

async function apiGet<T>(path: string) {
  const response = await fetch(`${baseUrl}${path}`)

  return parse<T>(response)
}

async function apiPost<T>(path: string, body: unknown, token?: string) {
  const response = await fetch(`${baseUrl}${path}`, {
    body: JSON.stringify(body),
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    method: 'POST',
  })

  return parse<T>(response)
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = ''

  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }

  return btoa(binary)
}

async function ensureLocalServer() {
  if (!baseUrl.startsWith('http://127.0.0.1:4179')) {
    return null
  }

  try {
    const response = await fetch(`${baseUrl}/api/health`)

    if (response.ok) {
      return null
    }
  } catch {
    // Start the local server below.
  }

  const server = Bun.spawn(['bun', 'run', 'server/index.ts'], {
    env: {
      ...process.env,
      PORT: '4179',
      PUBLIC_BASE_URL: baseUrl,
      SQLITE_PATH: './data/proof.sqlite',
    },
    stderr: 'pipe',
    stdout: 'pipe',
  })

  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/api/health`)

      if (response.ok) {
        return server
      }
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
  }

  server.kill()
  throw new Error('Unable to start local VoteLock server for proof.')
}

async function main() {
  const server = await ensureLocalServer()

  try {
    await runProof()
  } finally {
    server?.kill()
  }
}

async function parse<T>(response: Response) {
  const payload = (await response.json()) as { error?: string } & T

  if (!response.ok) {
    throw new Error(payload.error ?? `HTTP ${response.status}`)
  }

  return payload
}

async function runProof() {
  const secretKey = ed.utils.randomSecretKey()
  const publicKey = await ed.getPublicKeyAsync(secretKey)
  const voter = bs58.encode(publicKey)
  const health = await apiGet<Record<string, unknown>>('/api/health')
  const proposals = await apiGet<{ proposals: { choices: { id: string }[]; id: string }[] }>('/api/proposals')
  const proposal = proposals.proposals[0]

  if (!proposal) {
    throw new Error('No seeded proposal returned by API.')
  }

  const authChallenge = await apiPost<{ challengeId: string; message: string }>('/api/auth/challenge', { voter })
  const authSignature = await sign(authChallenge.message, secretKey)
  const session = await apiPost<{ token: string; voter: string }>('/api/auth/session', {
    challengeId: authChallenge.challengeId,
    signature: authSignature,
    voter,
  })
  const ranking = proposal.choices.map((choice) => choice.id)
  const ballotChallenge = await apiPost<{ challengeId: string; message: string; receiptId: string }>(
    '/api/ballots/challenge',
    {
      proposalId: proposal.id,
      ranking,
    },
    session.token,
  )
  const ballotSignature = await sign(ballotChallenge.message, secretKey)
  const submitted = await apiPost<{
    receipt: {
      assetAddress: null | string
      id: string
      metadataUrl: string
      status: string
      txSignature: null | string
    }
  }>(
    '/api/ballots/submit',
    {
      challengeId: ballotChallenge.challengeId,
      signature: ballotSignature,
    },
    session.token,
  )
  const verified = await apiGet<{ ok: boolean }>(`/api/verify?receiptId=${submitted.receipt.id}`)
  const metadata = await fetch(submitted.receipt.metadataUrl)
  const image = await fetch(`${baseUrl}/api/receipts/${submitted.receipt.id}/image.svg`)

  if (!verified.ok || !metadata.ok || !image.ok) {
    throw new Error('Receipt verification, metadata, or image endpoint failed.')
  }

  console.log(
    JSON.stringify(
      {
        assetAddress: submitted.receipt.assetAddress,
        baseUrl,
        healthMint: health.mint,
        imageStatus: image.status,
        metadataStatus: metadata.status,
        proposalId: proposal.id,
        receiptId: submitted.receipt.id,
        receiptStatus: submitted.receipt.status,
        txSignature: submitted.receipt.txSignature,
        voter,
      },
      null,
      2,
    ),
  )
}

async function sign(message: string, secretKey: Uint8Array) {
  const signature = await ed.signAsync(new TextEncoder().encode(message), secretKey)

  return bytesToBase64(signature)
}

await main()
