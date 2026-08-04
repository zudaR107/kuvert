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

// "2026-07-01" -> "Июль 2026" - used to suggest a budget period name from
// its start date, so the user isn't forced to type out the month by hand.
// ru-RU's long month+year format includes a trailing "г." ("года") - e.g.
// "июль 2026 г." - which reads fine in a full sentence but not as a
// standalone period name, so it's stripped here.
export function formatMonthYear(iso: string): string {
  const formatted = new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric' })
    .format(new Date(iso))
    .replace(/\s*г\.?$/i, '')
  return formatted.charAt(0).toUpperCase() + formatted.slice(1)
}
