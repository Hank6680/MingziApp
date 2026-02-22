export function formatMoney(value: number | string | null | undefined) {
  const amount = typeof value === 'string' ? Number(value) : value
  const safeAmount = Number.isFinite(amount as number) ? (amount as number) : 0
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: 'CAD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(safeAmount)
}
