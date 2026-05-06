import type { Tally } from '@/votelock/data-access/api'

export function TallyPanel({ tally }: { tally: Tally }) {
  const max = Math.max(1, ...tally.firstChoice.map((item) => item.votes))

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs text-lime-100/70">
        <span>{tally.method}</span>
        <span>{tally.totalVotes} cast</span>
      </div>
      <div className="space-y-2">
        {tally.firstChoice.map((item) => (
          <div className="grid grid-cols-[1fr_auto] gap-3" key={item.choiceId}>
            <div className="min-w-0">
              <div className="truncate text-sm text-zinc-100">{item.label}</div>
              <div className="mt-1 h-2 rounded-sm bg-zinc-800">
                <div
                  className="h-2 rounded-sm bg-lime-300"
                  style={{ width: `${Math.max(6, (item.votes / max) * 100)}%` }}
                />
              </div>
            </div>
            <div className="font-mono text-sm text-lime-200">{item.votes}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
