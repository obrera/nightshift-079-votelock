import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { apiGet, apiPost, type AuditEvent, type Proposal, type Receipt, type Tally } from './api'

export function useAuditQuery(receiptId?: string) {
  return useQuery({
    queryFn: () => apiGet<{ events: AuditEvent[] }>(`/api/audit${receiptId ? `?receiptId=${receiptId}` : ''}`),
    queryKey: ['audit', receiptId],
  })
}

export function useBallotChallengeMutation(token?: string) {
  return useMutation({
    mutationFn: (input: { proposalId: string; ranking: string[] }) =>
      apiPost<{ challengeId: string; message: string; receiptId: string }>('/api/ballots/challenge', input, token),
  })
}

export function useHealthQuery() {
  return useQuery({
    queryFn: () => apiGet<Record<string, unknown>>('/api/health'),
    queryKey: ['health'],
  })
}

export function useProposalsQuery() {
  return useQuery({
    queryFn: () => apiGet<{ proposals: Proposal[] }>('/api/proposals'),
    queryKey: ['proposals'],
  })
}

export function useSessionChallengeMutation() {
  return useMutation({
    mutationFn: (input: { voter: string }) =>
      apiPost<{ challengeId: string; message: string }>('/api/auth/challenge', input),
  })
}

export function useSessionMutation() {
  return useMutation({
    mutationFn: (input: { challengeId: string; signature: string; voter: string }) =>
      apiPost<{ expiresAt: string; token: string; voter: string }>('/api/auth/session', input),
  })
}

export function useSubmitBallotMutation(token?: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: { challengeId: string; signature: string }) =>
      apiPost<{ receipt: Receipt; tally: Tally }>('/api/ballots/submit', input, token),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['proposals'] })
      void queryClient.invalidateQueries({ queryKey: ['audit'] })
    },
  })
}

export function useVerifyMutation() {
  return useMutation({
    mutationFn: (receiptId: string) =>
      apiGet<{ audit: AuditEvent[]; ok: boolean; proposal: Proposal; receipt: Receipt; tally: Tally }>(
        `/api/verify?receiptId=${encodeURIComponent(receiptId)}`,
      ),
  })
}
