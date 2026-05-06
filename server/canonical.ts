export interface BallotIntent {
  challengeId: string
  issuedAt: string
  proposalId: string
  ranking: string[]
  receiptId: string
  voter: string
}

export interface SessionIntent {
  challengeId: string
  domain: string
  issuedAt: string
  statement: string
  voter: string
}

export function ballotMessage(intent: BallotIntent) {
  return [
    'VoteLock Ballot Intent',
    `challenge: ${intent.challengeId}`,
    `receipt: ${intent.receiptId}`,
    `proposal: ${intent.proposalId}`,
    `voter: ${intent.voter}`,
    `ranking: ${intent.ranking.join(' > ')}`,
    `issuedAt: ${intent.issuedAt}`,
  ].join('\n')
}

export function sessionMessage(intent: SessionIntent) {
  return [
    'VoteLock SIWS Session',
    intent.statement,
    `domain: ${intent.domain}`,
    `voter: ${intent.voter}`,
    `challenge: ${intent.challengeId}`,
    `issuedAt: ${intent.issuedAt}`,
  ].join('\n')
}
