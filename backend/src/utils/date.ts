import { z } from 'zod'

export function isIsoCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

export const isoDateSchema = z.string().refine(isIsoCalendarDate, {
  message: 'Invalid calendar date; expected YYYY-MM-DD',
})
