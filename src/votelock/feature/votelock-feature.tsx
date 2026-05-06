import type { Address } from '@solana/kit'

import { useWalletAccountMessageSigner, useWalletUi } from '@wallet-ui/react'
import { ArrowDownUp, BadgeCheck, ClipboardCheck, Fingerprint, History, ReceiptText, ShieldCheck } from 'lucide-react'
import { useMemo, useState } from 'react'

import { Button } from '@/core/ui/button'
import { Input } from '@/core/ui/input'
import { SolanaUiWalletDropdown } from '@/solana/ui/solana-ui-wallet-dropdown'
import { StatusPill } from '@/votelock/ui/status-pill'
import { TallyPanel } from '@/votelock/ui/tally-panel'
import { formatDate, shortAddress } from '@/votelock/util/format'

import type { Proposal, Receipt } from '../data-access/api'

import {
  useAuditQuery,
  useBallotChallengeMutation,
  useHealthQuery,
  useProposalsQuery,
  useSessionChallengeMutation,
  useSessionMutation,
  useSubmitBallotMutation,
  useVerifyMutation,
} from '../data-access/queries'

export function VoteLockFeature() {
  const { account, connected } = useWalletUi()
  const signer = useWalletAccountMessageSigner(account!)
  const [session, setSession] = useState<{ token: string; voter: string } | null>(null)
  const [selectedProposalId, setSelectedProposalId] = useState('prop-solana-delegate-guardrails')
  const [ranking, setRanking] = useState<string[]>([])
  const [lastReceipt, setLastReceipt] = useState<null | Receipt>(null)
  const [verifyId, setVerifyId] = useState('')
  const proposalsQuery = useProposalsQuery()
  const healthQuery = useHealthQuery()
  const auditQuery = useAuditQuery(lastReceipt?.id)
  const sessionChallenge = useSessionChallengeMutation()
  const sessionMutation = useSessionMutation()
  const ballotChallenge = useBallotChallengeMutation(session?.token)
  const submitBallot = useSubmitBallotMutation(session?.token)
  const verifyMutation = useVerifyMutation()
  const proposals = proposalsQuery.data?.proposals ?? []
  const selectedProposal = proposals.find((proposal) => proposal.id === selectedProposalId) ?? proposals[0]
  const activeRanking = ranking.length ? ranking : (selectedProposal?.choices.map((choice) => choice.id) ?? [])
  const isSignedIn = session?.voter === account?.address

  async function signText(text: string) {
    if (!account || !signer) {
      throw new Error('Connect a Solana wallet first.')
    }

    const [result] = await signer.modifyAndSignMessages([{ content: new TextEncoder().encode(text), signatures: {} }])
    const signature = result?.signatures[account.address as Address]

    if (!signature) {
      throw new Error('Wallet did not return a signature for this account.')
    }

    return bytesToBase64(signature)
  }

  async function signIn() {
    if (!account) {
      return
    }

    const challenge = await sessionChallenge.mutateAsync({ voter: account.address })
    const signature = await signText(challenge.message)
    const nextSession = await sessionMutation.mutateAsync({
      challengeId: challenge.challengeId,
      signature,
      voter: account.address,
    })

    setSession({ token: nextSession.token, voter: nextSession.voter })
  }

  async function submitVote() {
    if (!selectedProposal) {
      return
    }

    const challenge = await ballotChallenge.mutateAsync({ proposalId: selectedProposal.id, ranking: activeRanking })
    const signature = await signText(challenge.message)
    const result = await submitBallot.mutateAsync({ challengeId: challenge.challengeId, signature })

    setLastReceipt(result.receipt)
    setVerifyId(result.receipt.id)
  }

  const verified = verifyMutation.data
  const health = healthQuery.data

  return (
    <main className="min-h-full bg-[#07100d] text-zinc-100">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-4 sm:px-6 lg:px-8">
        <header className="grid gap-4 border-b border-lime-300/20 pb-4 md:grid-cols-[1fr_auto] md:items-end">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 border border-lime-300/25 bg-lime-300/10 px-2 py-1 text-xs text-lime-100">
              <ShieldCheck className="size-3.5" />
              Nightshift 079 / Solana week / MPL Core governance receipts
            </div>
            <h1 className="text-3xl font-semibold tracking-normal text-lime-100 sm:text-5xl">VoteLock</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-300">
              Wallet-signed ballot intents, durable ranked tally state, and server-minted MPL Core vote receipt assets
              owned by the connected voter wallet.
            </p>
          </div>
          <div className="grid gap-2">
            <SolanaUiWalletDropdown className="h-9 min-w-64 border-lime-300/25 bg-black/20 text-lime-100" />
            <Button
              className="h-9 justify-start gap-2"
              disabled={!connected || !account || isSignedIn}
              onClick={() => void signIn()}
            >
              <Fingerprint className="size-4" />
              {isSignedIn ? 'Wallet session active' : 'Sign VoteLock session'}
            </Button>
          </div>
        </header>

        <section className="grid gap-5 lg:grid-cols-[1.25fr_.75fr]">
          <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-3">
              <Metric label="RPC" value={String(health?.rpcUrl ?? 'loading')} />
              <Metric
                label="Signer"
                value={
                  health?.runtime
                    ? (health.runtime as { signerConfigured?: boolean }).signerConfigured
                      ? 'configured'
                      : 'missing'
                    : 'checking'
                }
              />
              <Metric
                label="Mint readiness"
                value={health?.mint ? ((health.mint as { ready?: boolean }).ready ? 'ready' : 'gated') : 'checking'}
              />
            </div>
            <ProposalWorkspace
              activeRanking={activeRanking}
              isReady={isSignedIn}
              proposal={selectedProposal}
              proposals={proposals}
              selectedProposalId={selectedProposalId}
              setRanking={setRanking}
              setSelectedProposalId={setSelectedProposalId}
              submitDisabled={!isSignedIn || submitBallot.isPending || ballotChallenge.isPending}
              submitVote={() => void submitVote()}
            />
          </div>

          <aside className="space-y-5">
            <ReceiptPanel receipt={lastReceipt} />
            <VerificationPanel
              isPending={verifyMutation.isPending}
              setVerifyId={setVerifyId}
              verified={verified}
              verify={() => verifyMutation.mutate(verifyId)}
              verifyId={verifyId}
            />
            <div className="border border-lime-300/20 bg-black/25 p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-medium text-lime-100">
                <History className="size-4" />
                Audit history
              </div>
              <div className="space-y-3">
                {(verified?.audit ?? auditQuery.data?.events ?? []).slice(0, 6).map((event) => (
                  <div className="border-l border-lime-300/30 pl-3 text-xs" key={event.id}>
                    <div className="text-zinc-100">{event.type}</div>
                    <div className="text-zinc-400">{event.detail}</div>
                    <div className="mt-1 font-mono text-lime-200/70">{formatDate(event.createdAt)}</div>
                  </div>
                ))}
              </div>
            </div>
          </aside>
        </section>
      </div>
    </main>
  )
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = ''

  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }

  return btoa(binary)
}

function KeyValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 text-xs">
      <span className="text-zinc-500">{label}</span>
      <span className="truncate font-mono text-zinc-200">{value}</span>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-lime-300/20 bg-black/25 p-3">
      <div className="text-xs text-zinc-500 uppercase">{label}</div>
      <div className="mt-1 truncate font-mono text-xs text-lime-100">{value}</div>
    </div>
  )
}

function move(items: string[], from: number, to: number) {
  const next = [...items]
  const [item] = next.splice(from, 1)

  if (item) {
    next.splice(to, 0, item)
  }

  return next
}

function ProposalWorkspace({
  activeRanking,
  isReady,
  proposal,
  proposals,
  selectedProposalId,
  setRanking,
  setSelectedProposalId,
  submitDisabled,
  submitVote,
}: {
  activeRanking: string[]
  isReady: boolean
  proposal?: Proposal
  proposals: Proposal[]
  selectedProposalId: string
  setRanking: (ranking: string[]) => void
  setSelectedProposalId: (id: string) => void
  submitDisabled: boolean
  submitVote: () => void
}) {
  const choicesById = useMemo(() => new Map(proposal?.choices.map((choice) => [choice.id, choice.label])), [proposal])

  if (!proposal) {
    return <div className="border border-lime-300/20 p-5 text-zinc-300">Loading proposal workspace...</div>
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[.7fr_1fr]">
      <div className="border border-lime-300/20 bg-[#0b1712] p-4">
        <div className="mb-4 flex items-center gap-2 text-sm font-medium text-lime-100">
          <ClipboardCheck className="size-4" />
          Active proposals
        </div>
        <div className="space-y-2">
          {proposals.map((item) => (
            <button
              className={`w-full border p-3 text-left transition ${item.id === selectedProposalId ? 'border-lime-300 bg-lime-300/10' : 'border-zinc-800 bg-black/20 hover:border-lime-300/40'}`}
              key={item.id}
              onClick={() => {
                setSelectedProposalId(item.id)
                setRanking(item.choices.map((choice) => choice.id))
              }}
              type="button"
            >
              <div className="text-sm font-medium text-zinc-100">{item.title}</div>
              <div className="mt-1 text-xs text-zinc-400">Closes {formatDate(item.closesAt)}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="border border-lime-300/20 bg-[#10150f]">
        <div className="border-b border-lime-300/20 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-semibold text-lime-100">{proposal.title}</h2>
            <StatusPill status={proposal.status} />
          </div>
          <p className="mt-2 text-sm leading-6 text-zinc-300">{proposal.description}</p>
          <div className="mt-3 grid gap-2 text-xs text-zinc-400 sm:grid-cols-2">
            <div>Quorum target: {proposal.quorum}</div>
            <div>Deadline: {formatDate(proposal.closesAt)}</div>
          </div>
          <div className="mt-3 border border-zinc-800 bg-black/20 p-3 text-xs leading-5 text-zinc-300">
            {proposal.rules}
          </div>
        </div>

        <div className="grid gap-4 p-4 lg:grid-cols-2">
          <div>
            <div className="mb-3 flex items-center gap-2 text-sm font-medium text-lime-100">
              <ArrowDownUp className="size-4" />
              Ranked ballot
            </div>
            <div className="space-y-2">
              {activeRanking.map((choiceId, index) => (
                <div
                  className="grid grid-cols-[auto_1fr_auto] items-center gap-2 border border-zinc-800 bg-black/30 p-2"
                  key={choiceId}
                >
                  <span className="font-mono text-xs text-lime-200">#{index + 1}</span>
                  <span className="min-w-0 truncate text-sm">{choicesById.get(choiceId)}</span>
                  <div className="flex gap-1">
                    <Button
                      disabled={index === 0}
                      onClick={() => setRanking(move(activeRanking, index, index - 1))}
                      size="icon-sm"
                      variant="outline"
                    >
                      ↑
                    </Button>
                    <Button
                      disabled={index === activeRanking.length - 1}
                      onClick={() => setRanking(move(activeRanking, index, index + 1))}
                      size="icon-sm"
                      variant="outline"
                    >
                      ↓
                    </Button>
                  </div>
                </div>
              ))}
            </div>
            <Button className="mt-4 h-9 w-full gap-2" disabled={submitDisabled} onClick={submitVote}>
              <ReceiptText className="size-4" />
              {isReady ? 'Sign ballot and mint receipt' : 'Sign in with wallet first'}
            </Button>
          </div>
          <TallyPanel tally={proposal.tally} />
        </div>
      </div>
    </div>
  )
}

function ReceiptPanel({ receipt }: { receipt: null | Receipt }) {
  return (
    <div className="border border-lime-300/20 bg-black/25 p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-medium text-lime-100">
        <ReceiptText className="size-4" />
        Latest receipt
      </div>
      {receipt ? (
        <div className="space-y-3 text-sm">
          <div className="flex items-center justify-between gap-3">
            <span className="font-mono text-xs text-zinc-300">{receipt.id}</span>
            <StatusPill status={receipt.status} />
          </div>
          <KeyValue label="Owner" value={shortAddress(receipt.voter)} />
          <KeyValue label="Asset" value={shortAddress(receipt.assetAddress)} />
          <KeyValue label="Tx" value={shortAddress(receipt.txSignature)} />
          <a
            className="block truncate text-xs text-lime-200 underline underline-offset-4"
            href={receipt.metadataUrl}
            rel="noreferrer"
            target="_blank"
          >
            {receipt.metadataUrl}
          </a>
        </div>
      ) : (
        <div className="text-sm text-zinc-400">No ballot receipt minted in this browser session yet.</div>
      )}
    </div>
  )
}

function VerificationPanel({
  isPending,
  setVerifyId,
  verified,
  verify,
  verifyId,
}: {
  isPending: boolean
  setVerifyId: (value: string) => void
  verified?: { ok: boolean; receipt: Receipt; tally: { totalVotes: number } }
  verify: () => void
  verifyId: string
}) {
  return (
    <div className="border border-lime-300/20 bg-[#111712] p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-medium text-lime-100">
        <BadgeCheck className="size-4" />
        Operator verification
      </div>
      <div className="flex gap-2">
        <Input
          className="h-9 font-mono text-xs"
          onChange={(event) => setVerifyId(event.target.value)}
          placeholder="receipt id"
          value={verifyId}
        />
        <Button className="h-9" disabled={!verifyId || isPending} onClick={verify}>
          Verify
        </Button>
      </div>
      {verified?.ok ? (
        <div className="mt-4 space-y-2 text-sm">
          <KeyValue label="Receipt" value={verified.receipt.id} />
          <KeyValue label="Voter" value={shortAddress(verified.receipt.voter)} />
          <KeyValue label="Status" value={verified.receipt.status} />
          <KeyValue label="Votes" value={String(verified.tally.totalVotes)} />
        </div>
      ) : null}
    </div>
  )
}
