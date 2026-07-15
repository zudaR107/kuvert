import { useState } from 'react'
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, ClipboardList, Plus, Wallet } from 'lucide-react'
import { EmptyState, ICON_SIZE, Button, Amount, Field, Modal, Toast } from '@zudar107/schloss-ui'
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
      style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}
    >
      <Field
        id="period-name"
        label="Название"
        value={values.name}
        onChange={(e) => set('name', e.target.value)}
        placeholder={suggestedName}
      />

      <div style={{ display: 'flex', gap: '0.75rem' }}>
        <div style={{ flex: 1 }}>
          <Field
            id="period-start"
            label="Начало"
            type="date"
            value={values.startDate}
            onChange={(e) => set('startDate', e.target.value)}
            required
          />
        </div>
        <div style={{ flex: 1 }}>
          <Field
            id="period-end"
            label="Конец"
            type="date"
            value={values.endDate}
            onChange={(e) => set('endDate', e.target.value)}
            required
          />
        </div>
      </div>
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
