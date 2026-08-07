import { useState, useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Button, Field, Toast } from '@zudar107/schloss-ui'
import { api } from '../../lib/api'
import { useToast } from '../../hooks/useToast'
import { useUserProfile } from '../../hooks/useUserProfile'

const CURRENCIES = ['RUB', 'USD', 'EUR', 'GBP', 'KZT', 'AMD', 'GEL']

const DATE_FORMAT_LABELS: Record<string, string> = { dmy: 'ДД.ММ.ГГГГ', mdy: 'ММ/ДД/ГГГГ', ymd: 'ГГГГ-ММ-ДД' }
const WEEK_START_LABELS: Record<string, string> = { monday: 'Понедельник', sunday: 'Воскресенье' }

export function SettingsPage() {
  const qc = useQueryClient()
  const toast = useToast()
  const [currency, setCurrency] = useState('RUB')
  const [saved, setSaved] = useState(false)

  const { data: profile, isLoading } = useUserProfile()

  useEffect(() => {
    if (profile) setCurrency(profile.currency)
  }, [profile])

  const updateMutation = useMutation({
    mutationFn: (newCurrency: string) => api.put('/users/me', { currency: newCurrency }),
    onSuccess: (updated) => {
      qc.setQueryData(['userProfile'], updated)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    },
    onError: () => toast.showError('Не удалось сохранить настройки'),
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    updateMutation.mutate(currency)
  }

  return (
    <div style={{ maxWidth: 500, margin: '0 auto' }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--text-primary)' }}>
          Настройки
        </h1>
        <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.8125rem' }}>
          Профиль и предпочтения
        </p>
      </div>

      <div className="card" style={{ padding: '1.5rem' }}>
        {isLoading ? (
          <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Загрузка…</div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {profile && (
              <div>
                <div className="label">Аккаунт</div>
                <div style={{ fontSize: '0.875rem', color: 'var(--text-primary)' }}>{profile.name}</div>
                <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>{profile.email}</div>
              </div>
            )}

            <Field
              as="select"
              id="settings-currency"
              label="Основная валюта"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
            >
              {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </Field>

            <Button
              type="submit"
              variant="primary"
              disabled={updateMutation.isPending}
              style={{ justifyContent: 'center', padding: '0.625rem' }}
            >
              {updateMutation.isPending ? 'Сохранение…' : saved ? 'Сохранено ✓' : 'Сохранить'}
            </Button>
          </form>
        )}
      </div>

      {profile && (
        <div className="card" style={{ padding: '1.5rem', marginTop: '1rem' }}>
          <div className="label">Формат даты и первый день недели</div>
          <p style={{ margin: '0.25rem 0 0', fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
            {DATE_FORMAT_LABELS[profile.dateFormat ?? 'dmy']}, неделя с «{WEEK_START_LABELS[profile.weekStart ?? 'monday']}»
          </p>
          <p style={{ margin: '0.5rem 0 0', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Меняется в настройках аккаунта Schlüssel (доступны через значок профиля в шапке) — применяется сразу во всех сервисах платформы.
          </p>
        </div>
      )}

      {toast.toast && (
        <Toast open variant={toast.toast.variant} message={toast.toast.message} onDismiss={toast.dismiss} />
      )}
    </div>
  )
}
