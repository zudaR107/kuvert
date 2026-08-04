// Shared client-side field validation - returns a Russian error message or
// null when valid. Purely a UX layer (instant, precise feedback pointing
// at the actual field) - the server re-validates everything itself
// regardless, so there's no security reliance on any of this.

export function validateRequiredText(value: string, label: string): string | null {
  if (!value.trim()) return `Введите ${label}`
  return null
}

// Accepts either a comma or a dot as the decimal separator (AmountField's
// own display formatting uses a comma) - parsed the same way toMinorUnits
// already does elsewhere.
export function validateAmount(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) return 'Введите сумму'
  const parsed = parseFloat(trimmed.replace(',', '.'))
  if (isNaN(parsed) || parsed <= 0) return 'Сумма должна быть больше нуля'
  return null
}

export function validateDate(value: string): string | null {
  if (!value) return 'Выберите дату'
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || isNaN(new Date(value).getTime())) return 'Неверная дата'
  return null
}
