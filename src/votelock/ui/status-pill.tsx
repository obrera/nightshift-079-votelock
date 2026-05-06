import { Badge } from '@/core/ui/badge'

export function StatusPill({ status }: { status: string }) {
  const variant = status.includes('minted') ? 'default' : status.includes('failed') ? 'destructive' : 'outline'

  return (
    <Badge className="rounded-sm tracking-normal uppercase" variant={variant}>
      {status}
    </Badge>
  )
}
