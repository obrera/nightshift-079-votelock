export function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

export function shortAddress(value?: null | string) {
  if (!value) {
    return 'not minted'
  }

  return `${value.slice(0, 4)}...${value.slice(-4)}`
}
