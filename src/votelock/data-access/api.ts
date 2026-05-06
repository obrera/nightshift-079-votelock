export interface AuditEvent {
  actor: string
  createdAt: string
  detail: string
  id: number
  proposalId: null | string
  receiptId: null | string
  type: string
}

export interface Choice {
  id: string
  label: string
  proposalId: string
}

export interface Proposal {
  choices: Choice[]
  closesAt: string
  createdAt: string
  description: string
  id: string
  quorum: number
  rules: string
  status: string
  tally: Tally
  title: string
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

export interface Tally {
  firstChoice: { choiceId: string; label: string; votes: number }[]
  method: string
  totalVotes: number
}

export async function apiGet<T>(path: string) {
  const response = await fetch(path)

  return parseResponse<T>(response)
}

export async function apiPost<T>(path: string, body: unknown, token?: string) {
  const response = await fetch(path, {
    body: JSON.stringify(body),
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    method: 'POST',
  })

  return parseResponse<T>(response)
}

async function parseResponse<T>(response: Response) {
  const payload = (await response.json()) as { error?: string } & T

  if (!response.ok) {
    throw new Error(payload.error ?? `Request failed with HTTP ${response.status}`)
  }

  return payload
}
