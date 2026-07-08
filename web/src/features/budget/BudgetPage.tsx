import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { api } from '../../lib/api'
import { formatAmount, fromMinorUnits, toMinorUnits, today } from '../../lib/format'
import { Modal } from '../../components/Modal'

interface Period { id: string; name: string; startDate: string; endDate: string }
interface Envelope { id: string; name: string; icon: string; color: string; rolloverEnabled: boolean }
interface BudgetRow {
  envelope: Envelope
  allocated: number
  carriedOver: number
  available: number
  spent: number
}
interface BudgetData {
  period: Period
  envelopes: BudgetRow[]
  toBeBudgeted: number
}

interface PeriodFormValues {
  name: string
  startDate: string
  endDate: string
}

function defaultPeriodForm(): PeriodFormValues {
  const d = today()
  return { name: '', startDate: d, endDate: d }
}

export function BudgetPage() {
  const qc = useQueryClient()
  const [periodIndex, setPeriodIndex] = useState(0)
  const [modalOpen, setModalOpen] = useState(false)

  const { data: periods = [] } = useQuery<Period[]>({
    queryKey: ['periods'],
    queryFn: () => api.get('/periods'),
  })

  const currentPeriod = periods[periodIndex]

  const { data: budget, isLoading } = useQuery<BudgetData>({
    queryKey: ['budget', currentPeriod?.id],
    queryFn: () => api.get(`/periods/${currentPeriod!.id}/budget`),
    enabled: !!currentPeriod,
  })

  const allocateMutation = useMutation({
    mutationFn: ({ envelopeId, allocated }: { envelopeId: string; allocated: number }) =>
      api.put(`/periods/${currentPeriod!.id}/budget/${envelopeId}`, { allocated }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['budget'] }),
  })

  const createPeriodMutation = useMutation({
    mutationFn: (values: PeriodFormValues) => api.post('/periods', values),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['periods'] })
      setPeriodIndex(0)
      setModalOpen(false)
    },
  })

  const periodModal = (
    <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Новый бюджетный период">
      <PeriodForm submitting={createPeriodMutation.isPending} onSubmit={(v) => createPeriodMutation.mutate(v)} />
    </Modal>
  )

  if (!periods.length) {
    return (
      <>
        <EmptyState onCreate={() => setModalOpen(true)} />
        {periodModal}
      </>
    )
  }

  const tbb = budget?.toBeBudgeted ?? 0

  return (
    <div style={{ maxWidth: 860, margin: '0 auto' }}>
      {/* Period navigation */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <button
            className="btn-ghost"
            style={{ padding: '0.375rem' }}
            onClick={() => setPeriodIndex((i) => Math.min(i + 1, periods.length - 1))}
            disabled={periodIndex >= periods.length - 1}
          >
            <ChevronLeft size={18} />
          </button>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--text-primary)' }}>
              {currentPeriod?.name ?? '—'}
            </h1>
            <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
              {currentPeriod ? `${currentPeriod.startDate} — ${currentPeriod.endDate}` : ''}
            </p>
          </div>
          <button
            className="btn-ghost"
            style={{ padding: '0.375rem' }}
            onClick={() => setPeriodIndex((i) => Math.max(i - 1, 0))}
            disabled={periodIndex === 0}
          >
            <ChevronRight size={18} />
          </button>
        </div>
        <button
          className="btn-primary"
          style={{ fontSize: '0.8125rem', padding: '0.4rem 0.875rem' }}
          onClick={() => setModalOpen(true)}
        >
          <Plus size={15} /> Новый бюджет
        </button>
      </div>

      {/* To Be Budgeted banner */}
      <div
        className="card"
        style={{
          padding: '1rem 1.25rem',
          marginBottom: '1rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: tbb >= 0 ? 'var(--success-muted)' : 'var(--danger-muted)',
          borderColor: tbb >= 0 ? 'var(--success)' : 'var(--danger)',
        }}
      >
        <div>
          <span style={{ fontSize: '0.8125rem', fontWeight: 500, color: tbb >= 0 ? 'var(--success)' : 'var(--danger)' }}>
            Осталось распределить
          </span>
        </div>
        <span style={{ fontSize: '1.25rem', fontWeight: 700, color: tbb >= 0 ? 'var(--success)' : 'var(--danger)' }}>
          {formatAmount(tbb)}
        </span>
      </div>

      {/* Envelope list */}
      {isLoading ? (
        <SkeletonList />
      ) : (
        <div className="card" style={{ overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Конверт', 'Выделено', 'Потрачено', 'Доступно'].map((h) => (
                  <th key={h} style={{ padding: '0.625rem 1rem', textAlign: h === 'Конверт' ? 'left' : 'right', color: 'var(--text-muted)', fontWeight: 500, fontSize: '0.75rem' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {budget?.envelopes.map((row) => (
                <EnvelopeRow
                  key={row.envelope.id}
                  row={row}
                  onAllocate={(amount) => allocateMutation.mutate({ envelopeId: row.envelope.id, allocated: amount })}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
      {periodModal}
    </div>
  )
}

function PeriodForm({ submitting, onSubmit }: {
  submitting: boolean
  onSubmit: (values: PeriodFormValues) => void
}) {
  const [values, setValues] = useState<PeriodFormValues>(defaultPeriodForm)

  function set<K extends keyof PeriodFormValues>(key: K, value: PeriodFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }))
  }

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); onSubmit(values) }}
      style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}
    >
      <div>
        <label className="label" htmlFor="period-name">Название</label>
        <input
          id="period-name"
          className="input"
          value={values.name}
          onChange={(e) => set('name', e.target.value)}
          placeholder="Июль 2026"
          required
        />
      </div>

      <div style={{ display: 'flex', gap: '0.75rem' }}>
        <div style={{ flex: 1 }}>
          <label className="label" htmlFor="period-start">Начало</label>
          <input
            id="period-start"
            className="input"
            type="date"
            value={values.startDate}
            onChange={(e) => set('startDate', e.target.value)}
            required
          />
        </div>
        <div style={{ flex: 1 }}>
          <label className="label" htmlFor="period-end">Конец</label>
          <input
            id="period-end"
            className="input"
            type="date"
            value={values.endDate}
            onChange={(e) => set('endDate', e.target.value)}
            required
          />
        </div>
      </div>

      <button type="submit" className="btn-primary" disabled={submitting} style={{ justifyContent: 'center', padding: '0.625rem', marginTop: '0.25rem' }}>
        {submitting ? 'Сохранение…' : 'Сохранить'}
      </button>
    </form>
  )
}

function EnvelopeRow({ row, onAllocate }: { row: BudgetRow; onAllocate: (amount: number) => void }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(String(fromMinorUnits(row.allocated)))

  const pct = row.allocated > 0 ? Math.min(100, (row.spent / (row.allocated + row.carriedOver)) * 100) : 0
  const over = row.available < 0

  return (
    <tr
      style={{ borderBottom: '1px solid var(--border)', transition: 'background 120ms' }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-base)' }}
      onMouseLeave={(e) => { e.currentTarget.style.background = '' }}
    >
      {/* Name */}
      <td style={{ padding: '0.75rem 1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
          <div style={{
            width: 28, height: 28, borderRadius: 6,
            background: `${row.envelope.color}20`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '0.875rem',
          }}>
            💰
          </div>
          <div>
            <div style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{row.envelope.name}</div>
            {row.carriedOver > 0 && (
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                +{formatAmount(row.carriedOver)} перенесено
              </div>
            )}
          </div>
        </div>
        {/* Progress bar */}
        <div className="progress-bar" style={{ marginTop: 6, width: 160 }}>
          <div
            className="progress-fill"
            style={{
              width: `${pct}%`,
              background: over ? 'var(--danger)' : pct > 85 ? 'var(--warning)' : 'var(--success)',
            }}
          />
        </div>
      </td>

      {/* Allocated (editable) */}
      <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
        {editing ? (
          <input
            autoFocus
            type="number"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onBlur={() => {
              setEditing(false)
              const n = parseFloat(value)
              if (!isNaN(n)) onAllocate(toMinorUnits(n))
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur()
              if (e.key === 'Escape') { setEditing(false); setValue(String(fromMinorUnits(row.allocated))) }
            }}
            style={{ width: 90, textAlign: 'right', padding: '0.25rem 0.375rem', border: '1px solid var(--accent)', borderRadius: 6, outline: 'none', fontSize: '0.875rem', background: 'var(--bg-surface)', color: 'var(--text-primary)' }}
          />
        ) : (
          <button
            onClick={() => setEditing(true)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontWeight: 500, color: 'var(--text-primary)', fontSize: '0.875rem', padding: '0.25rem 0.375rem', borderRadius: 4 }}
          >
            {formatAmount(row.allocated)}
          </button>
        )}
      </td>

      {/* Spent */}
      <td style={{ padding: '0.75rem 1rem', textAlign: 'right', color: 'var(--text-secondary)' }}>
        {formatAmount(row.spent)}
      </td>

      {/* Available */}
      <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 600, color: over ? 'var(--danger)' : 'var(--success)' }}>
        {formatAmount(row.available)}
      </td>
    </tr>
  )
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div style={{ textAlign: 'center', padding: '4rem 2rem' }}>
      <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📋</div>
      <h2 style={{ margin: '0 0 0.5rem', color: 'var(--text-primary)', fontSize: '1.125rem', fontWeight: 600 }}>
        Бюджет не создан
      </h2>
      <p style={{ margin: '0 0 1.5rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
        Создай бюджетный период и первые конверты.
      </p>
      <button className="btn-primary" onClick={onCreate}><Plus size={16} /> Создать бюджет</button>
    </div>
  )
}

function SkeletonList() {
  return (
    <div className="card" style={{ overflow: 'hidden' }}>
      {[1, 2, 3, 4].map((i) => (
        <div key={i} style={{ padding: '0.875rem 1rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ width: 28, height: 28, borderRadius: 6, background: 'var(--border)', flexShrink: 0 }} />
          <div style={{ flex: 1, height: 14, background: 'var(--border)', borderRadius: 4, maxWidth: 160 }} />
          <div style={{ width: 80, height: 14, background: 'var(--border)', borderRadius: 4 }} />
          <div style={{ width: 80, height: 14, background: 'var(--border)', borderRadius: 4 }} />
          <div style={{ width: 80, height: 14, background: 'var(--border)', borderRadius: 4 }} />
        </div>
      ))}
    </div>
  )
}
