import { Database } from 'bun:sqlite'

import type { RuntimeConfig } from './config'

export interface AuditEvent {
  actor: string
  createdAt: string
  detail: string
  id: number
  proposalId: null | string
  receiptId: null | string
  type: string
}

export interface Proposal {
  closesAt: string
  createdAt: string
  description: string
  id: string
  quorum: number
  rules: string
  status: string
  title: string
}

export interface ProposalChoice {
  id: string
  label: string
  proposalId: string
}

export interface Receipt {
  assetAddress: null | string
  ballotHash: string
  createdAt: string
  id: string
  metadataUrl: string
  proposalId: string
  ranking: string
  signature: string
  status: string
  txSignature: null | string
  voter: string
}

export function createStore(config: RuntimeConfig) {
  const db = new Database(config.dbPath)
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS proposals (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      rules TEXT NOT NULL,
      quorum INTEGER NOT NULL,
      closes_at TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS proposal_choices (
      id TEXT NOT NULL,
      proposal_id TEXT NOT NULL,
      label TEXT NOT NULL,
      PRIMARY KEY (proposal_id, id)
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      voter TEXT NOT NULL,
      signature TEXT NOT NULL,
      message TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS challenges (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      voter TEXT NOT NULL,
      proposal_id TEXT,
      receipt_id TEXT,
      message TEXT NOT NULL,
      ranking TEXT,
      expires_at TEXT NOT NULL,
      used_at TEXT
    );
    CREATE TABLE IF NOT EXISTS votes (
      id TEXT PRIMARY KEY,
      proposal_id TEXT NOT NULL,
      voter TEXT NOT NULL,
      ranking TEXT NOT NULL,
      ballot_hash TEXT NOT NULL,
      signature TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE (proposal_id, voter)
    );
    CREATE TABLE IF NOT EXISTS receipts (
      id TEXT PRIMARY KEY,
      proposal_id TEXT NOT NULL,
      voter TEXT NOT NULL,
      ranking TEXT NOT NULL,
      ballot_hash TEXT NOT NULL,
      signature TEXT NOT NULL,
      status TEXT NOT NULL,
      metadata_url TEXT NOT NULL,
      asset_address TEXT,
      tx_signature TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS audit_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      actor TEXT NOT NULL,
      proposal_id TEXT,
      receipt_id TEXT,
      detail TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `)

  seedProposal(db)

  return {
    addAudit(event: Omit<AuditEvent, 'createdAt' | 'id'>) {
      db.query(
        'INSERT INTO audit_events (type, actor, proposal_id, receipt_id, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      ).run(event.type, event.actor, event.proposalId, event.receiptId, event.detail, new Date().toISOString())
    },
    createChallenge(input: {
      expiresAt: string
      id: string
      kind: string
      message: string
      proposalId?: string
      ranking?: string
      receiptId?: string
      voter: string
    }) {
      db.query(
        'INSERT INTO challenges (id, kind, voter, proposal_id, receipt_id, message, ranking, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      ).run(
        input.id,
        input.kind,
        input.voter,
        input.proposalId ?? null,
        input.receiptId ?? null,
        input.message,
        input.ranking ?? null,
        input.expiresAt,
      )
    },
    createReceipt(receipt: Receipt) {
      db.query(
        'INSERT INTO receipts (id, proposal_id, voter, ranking, ballot_hash, signature, status, metadata_url, asset_address, tx_signature, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      ).run(
        receipt.id,
        receipt.proposalId,
        receipt.voter,
        receipt.ranking,
        receipt.ballotHash,
        receipt.signature,
        receipt.status,
        receipt.metadataUrl,
        receipt.assetAddress,
        receipt.txSignature,
        receipt.createdAt,
      )
    },
    createSession(input: { expiresAt: string; message: string; signature: string; token: string; voter: string }) {
      db.query(
        'INSERT INTO sessions (token, voter, signature, message, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      ).run(input.token, input.voter, input.signature, input.message, input.expiresAt, new Date().toISOString())
    },
    createVote(input: {
      ballotHash: string
      id: string
      proposalId: string
      ranking: string
      signature: string
      voter: string
    }) {
      db.query(
        'INSERT INTO votes (id, proposal_id, voter, ranking, ballot_hash, signature, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      ).run(
        input.id,
        input.proposalId,
        input.voter,
        input.ranking,
        input.ballotHash,
        input.signature,
        new Date().toISOString(),
      )
    },
    getAudit(receiptId?: string) {
      const query = receiptId
        ? db.query('SELECT * FROM audit_events WHERE receipt_id = ? ORDER BY id DESC LIMIT 80').all(receiptId)
        : db.query('SELECT * FROM audit_events ORDER BY id DESC LIMIT 80').all()

      return (query as Record<string, unknown>[]).map(mapAudit)
    },
    getChallenge(id: string) {
      return db
        .query<
          {
            expires_at: string
            id: string
            kind: string
            message: string
            proposal_id: null | string
            ranking: null | string
            receipt_id: null | string
            used_at: null | string
            voter: string
          },
          string
        >('SELECT * FROM challenges WHERE id = ?')
        .get(id)
    },
    getChoices(proposalId: string) {
      return db
        .query<
          { id: string; label: string; proposal_id: string },
          string
        >('SELECT * FROM proposal_choices WHERE proposal_id = ? ORDER BY id')
        .all(proposalId)
        .map(mapChoice)
    },
    getProposal(id: string) {
      const proposal = db.query<Record<string, unknown>, string>('SELECT * FROM proposals WHERE id = ?').get(id)

      return proposal ? mapProposal(proposal) : null
    },
    getReceipt(id: string) {
      const receipt = db.query<Record<string, unknown>, string>('SELECT * FROM receipts WHERE id = ?').get(id)

      return receipt ? mapReceipt(receipt) : null
    },
    getReceiptByProposalVoter(proposalId: string, voter: string) {
      const receipt = db
        .query<Record<string, unknown>, [string, string]>('SELECT * FROM receipts WHERE proposal_id = ? AND voter = ?')
        .get(proposalId, voter)

      return receipt ? mapReceipt(receipt) : null
    },
    getSession(token: string) {
      return db
        .query<{ expires_at: string; voter: string }, string>('SELECT voter, expires_at FROM sessions WHERE token = ?')
        .get(token)
    },
    hasVote(proposalId: string, voter: string) {
      return Boolean(db.query('SELECT id FROM votes WHERE proposal_id = ? AND voter = ?').get(proposalId, voter))
    },
    listProposals() {
      return db
        .query<Record<string, unknown>, []>('SELECT * FROM proposals ORDER BY closes_at ASC')
        .all()
        .map(mapProposal)
    },
    markChallengeUsed(id: string) {
      db.query('UPDATE challenges SET used_at = ? WHERE id = ?').run(new Date().toISOString(), id)
    },
    tally(proposalId: string) {
      const choices = this.getChoices(proposalId)
      const votes = db
        .query<{ ranking: string }, string>('SELECT ranking FROM votes WHERE proposal_id = ?')
        .all(proposalId)
      const firstChoice = new Map(choices.map((choice) => [choice.id, 0]))

      for (const vote of votes) {
        const [first] = JSON.parse(vote.ranking) as string[]

        if (first) {
          firstChoice.set(first, (firstChoice.get(first) ?? 0) + 1)
        }
      }

      return {
        firstChoice: choices.map((choice) => ({
          choiceId: choice.id,
          label: choice.label,
          votes: firstChoice.get(choice.id) ?? 0,
        })),
        method: 'ranked-choice first-preference snapshot',
        totalVotes: votes.length,
      }
    },
    updateReceiptMint(input: {
      assetAddress: null | string
      receiptId: string
      status: string
      txSignature: null | string
    }) {
      db.query('UPDATE receipts SET status = ?, asset_address = ?, tx_signature = ? WHERE id = ?').run(
        input.status,
        input.assetAddress,
        input.txSignature,
        input.receiptId,
      )
    },
  }
}

function mapAudit(row: Record<string, unknown>): AuditEvent {
  return {
    actor: String(row.actor),
    createdAt: String(row.created_at),
    detail: String(row.detail),
    id: Number(row.id),
    proposalId: row.proposal_id ? String(row.proposal_id) : null,
    receiptId: row.receipt_id ? String(row.receipt_id) : null,
    type: String(row.type),
  }
}

function mapChoice(row: { id: string; label: string; proposal_id: string }): ProposalChoice {
  return {
    id: row.id,
    label: row.label,
    proposalId: row.proposal_id,
  }
}

function mapProposal(row: Record<string, unknown>): Proposal {
  return {
    closesAt: String(row.closes_at),
    createdAt: String(row.created_at),
    description: String(row.description),
    id: String(row.id),
    quorum: Number(row.quorum),
    rules: String(row.rules),
    status: String(row.status),
    title: String(row.title),
  }
}

function mapReceipt(row: Record<string, unknown>): Receipt {
  return {
    assetAddress: row.asset_address ? String(row.asset_address) : null,
    ballotHash: String(row.ballot_hash),
    createdAt: String(row.created_at),
    id: String(row.id),
    metadataUrl: String(row.metadata_url),
    proposalId: String(row.proposal_id),
    ranking: String(row.ranking),
    signature: String(row.signature),
    status: String(row.status),
    txSignature: row.tx_signature ? String(row.tx_signature) : null,
    voter: String(row.voter),
  }
}

function seedProposal(db: Database) {
  const existing = db.query('SELECT id FROM proposals LIMIT 1').get()

  if (existing) {
    return
  }

  const now = new Date()
  const closesAt = new Date(now.getTime() + 1000 * 60 * 60 * 24 * 9)
  db.query(
    'INSERT INTO proposals (id, title, description, rules, quorum, closes_at, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  ).run(
    'prop-solana-delegate-guardrails',
    'Solana Governance Delegate Guardrails',
    'Rank the operating policy for a shared treasury delegate during Solana week. Receipts prove participation without revealing private wallet inventory.',
    'Rank all choices. One receipt can be minted per wallet. Duplicate ballots are rejected before mint. First-preference snapshot is shown immediately and audit history remains durable.',
    12,
    closesAt.toISOString(),
    'active',
    now.toISOString(),
  )

  for (const [id, label] of [
    ['choice-priority-voting', 'Priority voting with monthly delegate rotation'],
    ['choice-capped-spend', 'Capped spend authority with emergency veto'],
    ['choice-observer-only', 'Observer-only delegate until next epoch'],
  ]) {
    db.query('INSERT INTO proposal_choices (id, proposal_id, label) VALUES (?, ?, ?)').run(
      id,
      'prop-solana-delegate-guardrails',
      label,
    )
  }
}
