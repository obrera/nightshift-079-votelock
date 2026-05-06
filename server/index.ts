import { Hono } from 'hono'
import { serveStatic } from 'hono/bun'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { createBallotHash, createToken, getBearerToken, verifyWalletSignature } from './auth'
import { ballotMessage, sessionMessage } from './canonical'
import { APP_NAME, BUILD_ID, getRuntimeConfig, LIVE_URL } from './config'
import { createStore } from './db'
import { mintReadiness, mintVoteReceipt } from './mpl'

const config = getRuntimeConfig()
const store = createStore(config)
const app = new Hono()
const challengeTtlMs = 1000 * 60 * 5

app.get('/api/health', async (context) => {
  const metadata = await endpointStatus(`${config.publicBaseUrl}/api/receipts/sample/metadata.json`)
  const image = await endpointStatus(`${config.publicBaseUrl}/api/receipts/sample/image.svg`)

  return context.json({
    app: APP_NAME,
    build: BUILD_ID,
    liveUrl: LIVE_URL,
    mint: mintReadiness(config),
    publicBaseUrl: config.publicBaseUrl,
    rpcUrl: config.rpcUrl,
    runtime: {
      collectionConfigured: config.collectionAddress.length > 0,
      dbPath: config.dbPath,
      image,
      metadata,
      signerConfigured: config.signerConfigured,
    },
    status: 'ok',
  })
})

app.get('/api/proposals', (context) => context.json({ proposals: hydrateProposals(store.listProposals()) }))

app.get('/api/proposals/:id', (context) => {
  const proposal = store.getProposal(context.req.param('id'))

  if (!proposal) {
    return context.json({ error: 'Proposal not found' }, 404)
  }

  return context.json({ proposal: hydrateProposal(proposal) })
})

app.post('/api/auth/challenge', async (context) => {
  const body = await context.req.json<{ voter: string }>()
  const challengeId = crypto.randomUUID()
  const issuedAt = new Date().toISOString()
  const message = sessionMessage({
    challengeId,
    domain: new URL(config.publicBaseUrl).host,
    issuedAt,
    statement: 'Sign in to VoteLock to request ballot challenges and verify MPL Core vote receipts.',
    voter: body.voter,
  })

  store.createChallenge({
    expiresAt: new Date(Date.now() + challengeTtlMs).toISOString(),
    id: challengeId,
    kind: 'session',
    message,
    voter: body.voter,
  })

  return context.json({ challengeId, message })
})

app.post('/api/auth/session', async (context) => {
  const body = await context.req.json<{ challengeId: string; signature: string; voter: string }>()
  const challenge = store.getChallenge(body.challengeId)

  if (!challenge || challenge.kind !== 'session' || challenge.used_at || new Date(challenge.expires_at) < new Date()) {
    return context.json({ error: 'Session challenge is invalid or expired' }, 400)
  }

  if (
    challenge.voter !== body.voter ||
    !(await verifyWalletSignature({ message: challenge.message, signature: body.signature, voter: body.voter }))
  ) {
    return context.json({ error: 'Wallet signature could not be verified' }, 401)
  }

  const token = await createToken(`${body.voter}:${body.signature}:${challenge.id}`)
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 8).toISOString()

  store.markChallengeUsed(challenge.id)
  store.createSession({ expiresAt, message: challenge.message, signature: body.signature, token, voter: body.voter })
  store.addAudit({
    actor: body.voter,
    detail: 'Wallet signed a VoteLock SIWS-style session challenge.',
    proposalId: null,
    receiptId: null,
    type: 'session.created',
  })

  return context.json({ expiresAt, token, voter: body.voter })
})

app.post('/api/ballots/challenge', async (context) => {
  const session = requireSession(context.req.header('authorization'))

  if (!session.ok) {
    return context.json({ error: session.error }, 401)
  }

  const body = await context.req.json<{ proposalId: string; ranking: string[] }>()
  const proposal = store.getProposal(body.proposalId)
  const choices = store.getChoices(body.proposalId)
  const choiceIds = new Set(choices.map((choice) => choice.id))

  if (!proposal || proposal.status !== 'active') {
    return context.json({ error: 'Proposal is not active' }, 400)
  }

  if (store.hasVote(body.proposalId, session.voter)) {
    return context.json({ error: 'This wallet has already voted on the proposal' }, 409)
  }

  if (body.ranking.length !== choices.length || body.ranking.some((choiceId) => !choiceIds.has(choiceId))) {
    return context.json({ error: 'Ranking must include each proposal choice exactly once' }, 400)
  }

  const challengeId = crypto.randomUUID()
  const receiptId = `votelock-${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`
  const issuedAt = new Date().toISOString()
  const message = ballotMessage({
    challengeId,
    issuedAt,
    proposalId: body.proposalId,
    ranking: body.ranking,
    receiptId,
    voter: session.voter,
  })

  store.createChallenge({
    expiresAt: new Date(Date.now() + challengeTtlMs).toISOString(),
    id: challengeId,
    kind: 'ballot',
    message,
    proposalId: body.proposalId,
    ranking: JSON.stringify(body.ranking),
    receiptId,
    voter: session.voter,
  })

  return context.json({ challengeId, message, receiptId })
})

app.post('/api/ballots/submit', async (context) => {
  const session = requireSession(context.req.header('authorization'))

  if (!session.ok) {
    return context.json({ error: session.error }, 401)
  }

  const body = await context.req.json<{ challengeId: string; signature: string }>()
  const challenge = store.getChallenge(body.challengeId)

  if (
    !challenge ||
    challenge.kind !== 'ballot' ||
    challenge.used_at ||
    !challenge.proposal_id ||
    !challenge.receipt_id ||
    !challenge.ranking ||
    new Date(challenge.expires_at) < new Date()
  ) {
    return context.json({ error: 'Ballot challenge is invalid or expired' }, 400)
  }

  if (
    challenge.voter !== session.voter ||
    !(await verifyWalletSignature({ message: challenge.message, signature: body.signature, voter: session.voter }))
  ) {
    return context.json({ error: 'Ballot signature could not be verified' }, 401)
  }

  if (store.hasVote(challenge.proposal_id, session.voter)) {
    return context.json({ error: 'This wallet has already voted on the proposal' }, 409)
  }

  const ballotHash = await createBallotHash(challenge.message)
  const metadataUrl = `${config.publicBaseUrl}/api/receipts/${challenge.receipt_id}/metadata.json`
  const createdAt = new Date().toISOString()

  store.markChallengeUsed(challenge.id)
  store.createVote({
    ballotHash,
    id: challenge.receipt_id,
    proposalId: challenge.proposal_id,
    ranking: challenge.ranking,
    signature: body.signature,
    voter: session.voter,
  })
  store.createReceipt({
    assetAddress: null,
    ballotHash,
    createdAt,
    id: challenge.receipt_id,
    metadataUrl,
    proposalId: challenge.proposal_id,
    ranking: challenge.ranking,
    signature: body.signature,
    status: 'mint_pending',
    txSignature: null,
    voter: session.voter,
  })

  const mint = await mintVoteReceipt(config, {
    metadataUrl,
    name: `VoteLock Receipt ${challenge.receipt_id.slice(-8)}`,
    receiptId: challenge.receipt_id,
    voter: session.voter,
  })

  store.updateReceiptMint({
    assetAddress: mint.assetAddress,
    receiptId: challenge.receipt_id,
    status: mint.status,
    txSignature: mint.txSignature,
  })
  store.addAudit({
    actor: session.voter,
    detail: `Wallet signed ballot intent; server signer submitted MPL Core mint path with status ${mint.status}.`,
    proposalId: challenge.proposal_id,
    receiptId: challenge.receipt_id,
    type: 'ballot.receipt',
  })

  return context.json({
    receipt: store.getReceipt(challenge.receipt_id),
    tally: store.tally(challenge.proposal_id),
  })
})

app.get('/api/receipts/:id', (context) => {
  const receipt = store.getReceipt(context.req.param('id'))

  if (!receipt) {
    return context.json({ error: 'Receipt not found' }, 404)
  }

  return context.json(verifyReceipt(receipt.id))
})

app.get('/api/verify', (context) => {
  const receiptId = context.req.query('receiptId')

  if (!receiptId) {
    return context.json({ error: 'receiptId is required' }, 400)
  }

  return context.json(verifyReceipt(receiptId))
})

app.get('/api/receipts/:id/metadata.json', (context) => {
  const receipt = store.getReceipt(context.req.param('id'))
  const sample = context.req.param('id') === 'sample'
  const proposal = receipt ? store.getProposal(receipt.proposalId) : null

  if (!receipt && !sample) {
    return context.json({ error: 'Receipt not found' }, 404)
  }

  return context.json({
    attributes: [
      { trait_type: 'Build', value: BUILD_ID },
      { trait_type: 'Proposal', value: proposal?.id ?? 'health-sample' },
      { trait_type: 'Receipt status', value: receipt?.status ?? 'sample' },
      { trait_type: 'Tally status', value: receipt ? store.tally(receipt.proposalId).method : 'readiness probe' },
    ],
    description:
      'VoteLock MPL Core vote receipt. The voter signs the ballot intent; the server signer submits and mints the receipt asset.',
    external_url: `${config.publicBaseUrl}/?verify=${receipt?.id ?? 'sample'}`,
    image: `${config.publicBaseUrl}/api/receipts/${receipt?.id ?? 'sample'}/image.svg`,
    name: `VoteLock Receipt ${receipt?.id ?? 'sample'}`,
    properties: {
      category: 'governance/voting',
      files: [
        { type: 'image/svg+xml', uri: `${config.publicBaseUrl}/api/receipts/${receipt?.id ?? 'sample'}/image.svg` },
      ],
    },
  })
})

app.get('/api/receipts/:id/image.svg', (context) => {
  const receiptId = context.req.param('id')
  const receipt = store.getReceipt(receiptId)
  const title = receipt ? receipt.proposalId : 'readiness-sample'
  const status = receipt ? receipt.status : 'sample'
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" role="img" aria-label="VoteLock receipt">
  <rect width="1200" height="630" fill="#07100d"/>
  <path d="M0 72h1200M0 558h1200" stroke="#45f08b" stroke-width="3" opacity=".65"/>
  <rect x="88" y="86" width="1024" height="458" rx="18" fill="#0e1b16" stroke="#d9f99d" stroke-width="2"/>
  <text x="130" y="160" fill="#d9f99d" font-family="monospace" font-size="42">VoteLock MPL Core Receipt</text>
  <text x="130" y="236" fill="#f8fafc" font-family="monospace" font-size="30">${escapeSvg(title)}</text>
  <text x="130" y="312" fill="#94a3b8" font-family="monospace" font-size="24">receipt ${escapeSvg(receiptId)}</text>
  <text x="130" y="386" fill="#45f08b" font-family="monospace" font-size="28">status ${escapeSvg(status)}</text>
  <text x="130" y="464" fill="#facc15" font-family="monospace" font-size="22">wallet signed ballot intent; server signer minted/submitted asset</text>
</svg>`

  return context.body(svg, 200, { 'content-type': 'image/svg+xml; charset=utf-8' })
})

app.get('/api/audit', (context) => context.json({ events: store.getAudit(context.req.query('receiptId')) }))

app.use('/assets/*', serveStatic({ root: './dist' }))
app.use('/vite.svg', serveStatic({ path: './dist/vite.svg' }))
app.get('*', async (context) => context.html(await readIndex()))

const port = Number(process.env.PORT ?? 4179)

export default {
  fetch: app.fetch,
  port,
}

console.log(`VoteLock API listening on ${port}`)

async function endpointStatus(url: string) {
  if (!url.startsWith('https://')) {
    return { ok: false, status: 0, url }
  }

  try {
    const response = await fetch(url, { method: 'GET' })

    return { ok: response.ok, status: response.status, url }
  } catch {
    return { ok: false, status: 0, url }
  }
}

function escapeSvg(value: string) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
}

function hydrateProposal(proposal: NonNullable<ReturnType<typeof store.getProposal>>) {
  return {
    ...proposal,
    choices: store.getChoices(proposal.id),
    tally: store.tally(proposal.id),
  }
}

function hydrateProposals(proposals: ReturnType<typeof store.listProposals>) {
  return proposals.map(hydrateProposal)
}

async function readIndex() {
  try {
    return await readFile(join(process.cwd(), 'dist/index.html'), 'utf8')
  } catch {
    return '<!doctype html><div id="root">VoteLock API is running. Build the Vite app with bun run build.</div>'
  }
}

function requireSession(header: string | undefined): { error: string; ok: false } | { ok: true; voter: string } {
  const token = getBearerToken(header)

  if (!token) {
    return { error: 'Missing wallet session', ok: false }
  }

  const session = store.getSession(token)

  if (!session || new Date(session.expires_at) < new Date()) {
    return { error: 'Wallet session is invalid or expired', ok: false }
  }

  return { ok: true, voter: session.voter }
}

function verifyReceipt(receiptId: string) {
  const receipt = store.getReceipt(receiptId)

  if (!receipt) {
    return {
      ok: false,
      reason: 'Receipt not found',
    }
  }

  return {
    audit: store.getAudit(receiptId),
    ok: true,
    proposal: hydrateProposal(store.getProposal(receipt.proposalId)!),
    receipt,
    tally: store.tally(receipt.proposalId),
  }
}
