import { existsSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

export const APP_NAME = 'VoteLock'
export const BUILD_ID = '079'
export const LIVE_URL = 'https://votelock079.colmena.dev'

export type RuntimeConfig = ReturnType<typeof getRuntimeConfig>

export function getRuntimeConfig() {
  const publicBaseUrl = normalizeBaseUrl(
    process.env.PUBLIC_BASE_URL ?? process.env.VOTELOCK_PUBLIC_BASE_URL ?? LIVE_URL,
  )
  const rpcUrl = process.env.SOLANA_RPC_URL ?? 'https://api.devnet.solana.com'
  const rpcSubscriptionsUrl =
    process.env.SOLANA_RPC_SUBSCRIPTIONS_URL ?? rpcUrl.replace('https://', 'wss://').replace('http://', 'ws://')
  const dbPath = resolve(process.env.SQLITE_PATH ?? process.env.VOTELOCK_DB_PATH ?? './data/votelock.sqlite')
  const signerSecret = process.env.VOTELOCK_SIGNER_SECRET ?? process.env.SOLANA_SIGNER_SECRET ?? ''
  const collectionAddress = process.env.VOTELOCK_COLLECTION_ADDRESS ?? ''
  const liveMintEnabled = process.env.VOTELOCK_ENABLE_LIVE_MINT === 'true'

  ensureDir(dbPath)

  return {
    collectionAddress,
    dbPath,
    liveMintEnabled,
    publicBaseUrl,
    rpcSubscriptionsUrl,
    rpcUrl,
    signerConfigured: signerSecret.length > 0,
    signerSecret,
  }
}

function ensureDir(filePath: string) {
  const dir = dirname(filePath)

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
}

function normalizeBaseUrl(value: string) {
  return value.endsWith('/') ? value.slice(0, -1) : value
}
