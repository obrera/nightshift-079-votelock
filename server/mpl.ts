import { MPL_CORE_PROGRAM_ADDRESS } from '@obrera/mpl-core-kit-lib'
import { getCreateV1Instruction } from '@obrera/mpl-core-kit-lib/generated'
import {
  address,
  appendTransactionMessageInstruction,
  createKeyPairSignerFromBytes,
  createSolanaRpc,
  createSolanaRpcSubscriptions,
  createTransactionMessage,
  generateKeyPairSigner,
  getBase58Decoder,
  pipe,
  sendAndConfirmTransactionFactory,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
} from '@solana/kit'

import type { RuntimeConfig } from './config'

import { base58ToBytes, base64ToBytes } from './encoding'

export interface MintReceiptInput {
  metadataUrl: string
  name: string
  receiptId: string
  voter: string
}

export interface MintReceiptResult {
  assetAddress: null | string
  status: 'mint_failed' | 'mint_pending_config' | 'minted'
  txSignature: null | string
}

export function mintReadiness(config: RuntimeConfig) {
  return {
    collectionConfigured: config.collectionAddress.length > 0,
    liveMintEnabled: config.liveMintEnabled,
    mplCoreProgram: MPL_CORE_PROGRAM_ADDRESS,
    ready: config.liveMintEnabled && config.signerConfigured,
    signerConfigured: config.signerConfigured,
  }
}

export async function mintVoteReceipt(config: RuntimeConfig, input: MintReceiptInput): Promise<MintReceiptResult> {
  if (!config.liveMintEnabled || !config.signerConfigured) {
    return {
      assetAddress: null,
      status: 'mint_pending_config',
      txSignature: null,
    }
  }

  try {
    const payer = await createKeyPairSignerFromBytes(parseSignerSecret(config.signerSecret))
    const asset = await generateKeyPairSigner()
    const rpc = createSolanaRpc(config.rpcUrl)
    const rpcSubscriptions = createSolanaRpcSubscriptions(config.rpcSubscriptionsUrl)
    const latestBlockhash = await rpc.getLatestBlockhash().send()
    const instruction = getCreateV1Instruction({
      asset,
      authority: payer,
      collection: config.collectionAddress ? address(config.collectionAddress) : undefined,
      name: input.name,
      owner: address(input.voter),
      payer,
      updateAuthority: payer.address,
      uri: input.metadataUrl,
    })
    const message = pipe(
      createTransactionMessage({ version: 0 }),
      (value) => setTransactionMessageFeePayerSigner(payer, value),
      (value) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash.value, value),
      (value) => appendTransactionMessageInstruction(instruction, value),
    )
    const transaction = await signTransactionMessageWithSigners(message)
    const sendAndConfirmTransaction = sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions })

    await sendAndConfirmTransaction(transaction as Parameters<typeof sendAndConfirmTransaction>[0], {
      commitment: 'confirmed',
    })

    const signature = transaction.signatures[payer.address]

    return {
      assetAddress: asset.address,
      status: 'minted',
      txSignature: signature ? getBase58Decoder().decode(signature) : null,
    }
  } catch (error) {
    console.error('MPL Core receipt mint failed', error)

    return {
      assetAddress: null,
      status: 'mint_failed',
      txSignature: null,
    }
  }
}

function numberListToBytes(value: unknown) {
  if (!Array.isArray(value) || value.some((item) => !Number.isInteger(item) || item < 0 || item > 255)) {
    throw new Error('Signer secret byte list must contain integers from 0 to 255')
  }

  return Uint8Array.from(value)
}

function parseSignerSecret(secret: string) {
  const trimmed = secret.trim()

  if (!trimmed) {
    throw new Error('Signer secret is empty')
  }

  if (trimmed.startsWith('[')) {
    return numberListToBytes(JSON.parse(trimmed))
  }

  if (trimmed.startsWith('base64:')) {
    return base64ToBytes(trimmed.slice('base64:'.length).trim())
  }

  if (/^\d+(?:\s*,\s*\d+)+$/.test(trimmed)) {
    return numberListToBytes(trimmed.split(',').map((value) => Number(value.trim())))
  }

  try {
    return base58ToBytes(trimmed)
  } catch {
    throw new Error('Signer secret must be a JSON byte array, comma-separated byte list, base64:<value>, or base58')
  }
}
