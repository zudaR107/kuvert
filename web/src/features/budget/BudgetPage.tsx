import { useState } from 'react'
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, ClipboardList, Pencil, Plus, Trash2, Wallet } from 'lucide-react'
import {
  EmptyState, ICON_SIZE, Button, Amount, Field, DateRangeField, Modal, Toast,
  handleArrowFieldNavigation, formatGroupedNumber, parseGroupedNumber,
} from '@zudar107/schloss-ui'
import { api } from '../../lib/api'
import { formatAmount, formatMonthYear, fromMinorUnits, toMinorUnits, today } from '../../lib/format'
import { useToast } from '../../hooks/useToast'

const PERIOD_FORM_ID = 'period-form'

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
  const toast = useToast()
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
    placeholderData: keepPreviousData,
  })

  const allocateMutation = useMutation({
    mutationFn: ({ envelopeId, allocated }: { envelopeId: string; allocated: number }) =>
      api.put(`/periods/${currentPeriod!.id}/budget/${envelopeId}`, { allocated }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['budget'] }),
    onError: () => toast.showError('Не удалось обновить распределение'),
  })

  const createPeriodMutation = useMutation({
    mutationFn: (values: PeriodFormValues) => api.post('/periods', values),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['periods'] })
      setPeriodIndex(0)
      setModalOpen(false)
      toast.showSuccess('Бюджетный период создан')
    },
    onError: () => toast.showError('Не удалось создать бюджетный период'),
  })

  const deletePeriodMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/periods/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['periods'] })
      setPeriodIndex((i) => Math.max(0, i - 1))
      toast.showSuccess('Бюджетный период удалён')
    },
    onError: () => toast.showError('Не удалось удалить бюджетный период'),
  })

  function handleDeletePeriod() {
    if (!currentPeriod) return
    // No confirm() dialog - matches every other destructive action in
    // the app (Accounts/Envelopes archive, Debts/Goals delete), none of
    // which interrupt with a browser-native confirmation either.
    deletePeriodMutation.mutate(currentPeriod.id)
  }

  const periodModal = (
    <Modal
      open={modalOpen}
      onClose={() => setModalOpen(false)}
      title="Новый бюджетный период"
      icon={<ClipboardList size={ICON_SIZE.default} strokeWidth={2} />}
      actions={[{
        label: createPeriodMutation.isPending ? 'Сохранение…' : 'Сохранить',
        onClick: () => (document.getElementById(PERIOD_FORM_ID) as HTMLFormElement | null)?.requestSubmit(),
        variant: 'primary',
      }]}
    >
      <PeriodForm formId={PERIOD_FORM_ID} onSubmit={(v) => createPeriodMutation.mutate(v)} />
    </Modal>
  )

  const toastNode = toast.toast && (
    <Toast open variant={toast.toast.variant} message={toast.toast.message} onDismiss={toast.dismiss} />
  )

  if (!periods.length) {
    return (
      <>
        <EmptyState
          icon={<ClipboardList size={ICON_SIZE.illustrative} strokeWidth={2} />}
          title="Бюджет не создан"
          description="Раздели доходы по конвертам — счета настраиваются отдельно, на странице «Счета»."
          actionLabel="Создать бюджет"
          actionIcon={<Plus size={16} />}
          onAction={() => setModalOpen(true)}
        />
        {periodModal}
        {toastNode}
      </>
    )
  }

  const tbb = budget?.toBeBudgeted ?? 0

  return (
    <div style={{ maxWidth: 860, margin: '0 auto' }}>
      {/* Period navigation */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <Button
            variant="ghost"
            style={{ padding: '0.375rem', border: 'none' }}
            onClick={() => setPeriodIndex((i) => Math.min(i + 1, periods.length - 1))}
            disabled={periodIndex >= periods.length - 1}
          >
            <ChevronLeft size={18} />
          </Button>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--text-primary)' }}>
              {currentPeriod?.name ?? '—'}
            </h1>
            <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
              {currentPeriod ? `${currentPeriod.startDate} — ${currentPeriod.endDate}` : ''}
            </p>
          </div>
          <Button
            variant="ghost"
            style={{ padding: '0.375rem', border: 'none' }}
            onClick={() => setPeriodIndex((i) => Math.max(i - 1, 0))}
            disabled={periodIndex === 0}
          >
            <ChevronRight size={18} />
          </Button>
          <Button
            variant="ghost"
            style={{ padding: '0.375rem', border: 'none' }}
            onClick={handleDeletePeriod}
            disabled={!currentPeriod || deletePeriodMutation.isPending}
            aria-label="Удалить бюджетный период"
          >
            <Trash2 size={16} />
          </Button>
        </div>
        <Button
          variant="primary"
          style={{ fontSize: '0.8125rem', padding: '0.4rem 0.875rem' }}
          onClick={() => setModalOpen(true)}
        >
          <Plus size={15} /> Новый бюджет
        </Button>
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
      {toastNode}
    </div>
  )
}

function PeriodForm({ formId, onSubmit }: {
  formId: string
  onSubmit: (values: PeriodFormValues) => void
}) {
  const [values, setValues] = useState<PeriodFormValues>(defaultPeriodForm)
  const suggestedName = formatMonthYear(values.startDate)

  function set<K extends keyof PeriodFormValues>(key: K, value: PeriodFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }))
  }

  return (
    <form
      id={formId}
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit({ ...values, name: values.name.trim() || suggestedName })
      }}
      onKeyDown={handleArrowFieldNavigation}
      style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}
    >
      <Field
        id="period-name"
        label="Название"
        value={values.name}
        onChange={(e) => set('name', e.target.value)}
        placeholder={suggestedName}
      />

      <DateRangeField
        id="period-range"
        label="Период"
        start={values.startDate}
        end={values.endDate}
        onChange={(startDate, endDate) => setValues((v) => ({ ...v, startDate, endDate }))}
        required
      />
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
            color: row.envelope.color,
          }}>
            <Wallet size={ICON_SIZE.default} strokeWidth={2} />
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
          <div style={{ position: 'relative', display: 'inline-block' }}>
            <span
              style={{
                position: 'absolute', left: '0.5rem', top: '50%', transform: 'translateY(-50%)',
                color: 'var(--text-muted)', fontSize: '0.875rem', pointerEvents: 'none',
              }}
            >
              ₽
            </span>
            <input
              autoFocus
              type="text"
              inputMode="decimal"
              value={formatGroupedNumber(value)}
              onChange={(e) => {
                const cleaned = parseGroupedNumber(e.target.value)
                if (/^-?\d*\.?\d*$/.test(cleaned)) setValue(cleaned)
              }}
              onFocus={(e) => { if (value === '0') e.target.select() }}
              onBlur={() => {
                setEditing(false)
                const n = parseFloat(value)
                if (!isNaN(n)) onAllocate(toMinorUnits(n))
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur()
                if (e.key === 'Escape') { setEditing(false); setValue(String(fromMinorUnits(row.allocated))) }
              }}
              style={{
                width: 112, textAlign: 'right', padding: '0.375rem 0.5rem 0.375rem 1.5rem',
                border: '1px solid var(--accent)', borderRadius: 8, outline: 'none',
                fontSize: '0.875rem', fontWeight: 500,
                background: 'var(--bg-surface)', color: 'var(--text-primary)',
                boxShadow: '0 0 0 3px var(--accent-muted)',
                transition: 'border-color 150ms, box-shadow 150ms',
              }}
            />
          </div>
        ) : (
          <button
            onClick={() => setEditing(true)}
            title="Нажмите, чтобы распределить"
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--accent)'
              e.currentTarget.style.color = 'var(--text-inverted)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'var(--accent-muted)'
              e.currentTarget.style.color = 'var(--accent)'
            }}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '0.375rem',
              padding: '0.375rem 0.75rem',
              background: 'var(--accent-muted)', color: 'var(--accent)',
              border: 'none', borderRadius: 999,
              fontWeight: 700, fontSize: '0.875rem', fontFamily: 'inherit',
              cursor: 'pointer',
              transition: 'background 150ms, color 150ms',
            }}
          >
            {formatAmount(row.allocated)}
            <Pencil size={12} strokeWidth={2.5} />
          </button>
        )}
      </td>

      {/* Spent */}
      <td style={{ padding: '0.75rem 1rem', textAlign: 'right', color: 'var(--text-secondary)' }}>
        {formatAmount(row.spent)}
      </td>

      {/* Available */}
      <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 600 }}>
        <Amount value={row.available}>{formatAmount(Math.abs(row.available))}</Amount>
      </td>
    </tr>
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
