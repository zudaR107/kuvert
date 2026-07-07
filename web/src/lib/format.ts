// All amounts are stored as integer minor units (kopecks/cents).
// These helpers convert to/from display format.

export function formatAmount(minorUnits: number, currency = 'RUB'): string {
  const major = minorUnits / 100
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(major)
}

export function toMinorUnits(major: number): number {
  return Math.round(major * 100)
}

export function fromMinorUnits(minor: number): number {
  return minor / 100
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function today(): string {
  return new Date().toISOString().slice(0, 10)
}
