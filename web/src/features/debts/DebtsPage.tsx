import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, ArrowDownLeft, ArrowUpRight, Check, Handshake, Trash2 } from 'lucide-react'
import { EmptyState as SharedEmptyState, ICON_SIZE, Button, Badge, SegmentedControl, Amount, StatTile, Field, Modal, Toast } from '@zudar107/schloss-ui'
import { api } from '../../lib/api'
import { formatAmount, formatDate, toMinorUnits, fromMinorUnits } from '../../lib/format'
import { useToast } from '../../hooks/useToast'

const DEBT_FORM_ID = 'debt-form'

type DebtType = 'owed' | 'owing'

interface Debt {
  id: string
  counterparty: string
  type: DebtType
  amount: number
  currency: string
  dueDate: string | null
  note: string | null
  settled: boolean
}

interface DebtFormValues {
  counterparty: string
  type: DebtType
  amount: string
  currency: string
  dueDate: string
  note: string
}

const DEFAULT_FORM: DebtFormValues = {
  counterparty: '', type: 'owed', amount: '', currency: 'RUB', dueDate: '', note: '',
}

export function DebtsPage() {
  const qc = useQueryClient()
  const toast = useToast()
  const [settledFilter, setSettledFilter] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Debt | null>(null)

  const { data: debts = [], isLoading } = useQuery<Debt[]>({
    queryKey: ['debts', settledFilter],
    queryFn: () => api.get(`/debts?settled=${settledFilter}`),
  })

  const createMutation = useMutation({
    mutationFn: (values: DebtFormValues) => api.post('/debts', toPayload(values)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['debts'] })
      closeModal()
      toast.showSuccess('Долг создан')
    },
    onError: () => toast.showError('Не удалось создать долг'),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, values }: { id: string; values: DebtFormValues }) =>
      api.put(`/debts/${id}`, toPayload(values)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['debts'] })
      closeModal()
      toast.showSuccess('Долг обновлён')
    },
    onError: () => toast.showError('Не удалось обновить долг'),
  })

  const settleMutation = useMutation({
    mutationFn: (id: string) => api.put(`/debts/${id}`, { settled: true }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['debts'] })
      toast.showSuccess('Долг отмечен погашенным')
    },
    onError: () => toast.showError('Не удалось отметить долг погашенным'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/debts/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['debts'] })
      toast.showSuccess('Долг удалён')
    },
    onError: () => toast.showError('Не удалось удалить долг'),
  })

  function openCreate() {
    setEditing(null)
    setModalOpen(true)
  }

  function openEdit(debt: Debt) {
    setEditing(debt)
    setModalOpen(true)
  }

  function closeModal() {
    setModalOpen(false)
    setEditing(null)
  }

  function handleSubmit(values: DebtFormValues) {
    if (editing) updateMutation.mutate({ id: editing.id, values })
    else createMutation.mutate(values)
  }

  return (
    <div style={{ maxWidth: 860, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--text-primary)' }}>
            Долги
          </h1>
          <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.8125rem' }}>
            {debts.length} {settledFilter ? 'закрытых' : 'активных'}
          </p>
        </div>
        <Button variant="primary" style={{ fontSize: '0.8125rem', padding: '0.4rem 0.875rem' }} onClick={openCreate}>
          <Plus size={15} /> Новый долг
        </Button>
      </div>

      <div style={{ marginBottom: '1rem' }}>
        <SegmentedControl
          options={[
            { value: 'active', label: 'Активные' },
            { value: 'settled', label: 'Закрытые' },
          ]}
          value={settledFilter ? 'settled' : 'active'}
          onChange={(v) => setSettledFilter(v === 'settled')}
        />
      </div>

      {!isLoading && debts.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem', marginBottom: '1.25rem' }}>
          <StatTile
            label="Мне должны"
            value={formatAmount(debts.filter((d) => d.type === 'owed').reduce((sum, d) => sum + d.amount, 0))}
          />
          <StatTile
            label="Я должен"
            value={formatAmount(debts.filter((d) => d.type === 'owing').reduce((sum, d) => sum + d.amount, 0))}
          />
        </div>
      )}

      {isLoading ? (
        <SkeletonList />
      ) : debts.length === 0 ? (
        <EmptyState settledFilter={settledFilter} onCreate={openCreate} />
      ) : (
        <div className="card" style={{ overflow: 'hidden' }}>
          {debts.map((d) => (
            <DebtRow
              key={d.id}
              debt={d}
              onEdit={() => openEdit(d)}
              onSettle={() => settleMutation.mutate(d.id)}
              onDelete={() => deleteMutation.mutate(d.id)}
            />
          ))}
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={closeModal}
        title={editing ? 'Изменить долг' : 'Новый долг'}
        icon={<Handshake size={ICON_SIZE.default} strokeWidth={2} />}
        actions={[{
          label: (createMutation.isPending || updateMutation.isPending) ? 'Сохранение…' : 'Сохранить',
          onClick: () => (document.getElementById(DEBT_FORM_ID) as HTMLFormElement | null)?.requestSubmit(),
          variant: 'primary',
        }]}
      >
        <DebtForm
          formId={DEBT_FORM_ID}
          initial={editing ? {
            counterparty: editing.counterparty,
            type: editing.type,
            amount: String(fromMinorUnits(editing.amount)),
            currency: editing.currency,
            dueDate: editing.dueDate ?? '',
            note: editing.note ?? '',
          } : DEFAULT_FORM}
          onSubmit={handleSubmit}
        />
      </Modal>

      {toast.toast && (
        <Toast open variant={toast.toast.variant} message={toast.toast.message} onDismiss={toast.dismiss} />
      )}
    </div>
  )
}

function toPayload(values: DebtFormValues) {
  return {
    counterparty: values.counterparty,
    type: values.type,
    amount: toMinorUnits(parseFloat(values.amount) || 0),
    currency: values.currency,
    dueDate: values.dueDate || null,
    note: values.note || null,
  }
}

function DebtRow({ debt, onEdit, onSettle, onDelete }: {
  debt: Debt
  onEdit: () => void
  onSettle: () => void
  onDelete: () => void
}) {
  const owed = debt.type === 'owed'
  return (
    <div
      style={{
        padding: '0.875rem 1rem', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', gap: '0.875rem',
      }}
    >
      <div style={{
        width: 36, height: 36, borderRadius: 8, flexShrink: 0,
        background: owed ? 'var(--success-muted)' : 'var(--danger-muted)',
        color: owed ? 'var(--success)' : 'var(--danger)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {owed ? <ArrowDownLeft size={18} /> : <ArrowUpRight size={18} />}
      </div>

      <button
        onClick={onEdit}
        style={{ flex: 1, minWidth: 0, background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0 }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ fontWeight: 500, fontSize: '0.875rem', color: 'var(--text-primary)' }}>{debt.counterparty}</span>
          {debt.settled && <Badge variant="neutral">Закрыт</Badge>}
        </div>
        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          {owed ? 'Должны мне' : 'Я должен'}
          {debt.dueDate && ` · до ${formatDate(debt.dueDate)}`}
        </div>
      </button>

      <div style={{ fontWeight: 600, fontSize: '0.9375rem' }}>
        <Amount value={owed ? debt.amount : -debt.amount}>{formatAmount(debt.amount, debt.currency)}</Amount>
      </div>

      {!debt.settled && (
        <Button variant="ghost" style={{ padding: '0.4rem', border: 'none' }} onClick={onSettle} aria-label="Отметить погашенным">
          <Check size={16} />
        </Button>
      )}
      <Button variant="ghost" style={{ padding: '0.4rem', border: 'none' }} onClick={onDelete} aria-label="Удалить долг">
        <Trash2 size={16} />
      </Button>
    </div>
  )
}

function DebtForm({ formId, initial, onSubmit }: {
  formId: string
  initial: DebtFormValues
  onSubmit: (values: DebtFormValues) => void
}) {
  const [values, setValues] = useState(initial)

  function set<K extends keyof DebtFormValues>(key: K, value: DebtFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }))
  }

  return (
    <form
      id={formId}
      onSubmit={(e) => { e.preventDefault(); onSubmit(values) }}
      style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}
    >
      <Field
        id="debt-counterparty"
        label="Контрагент"
        value={values.counterparty}
        onChange={(e) => set('counterparty', e.target.value)}
        placeholder="Имя человека"
        required
      />

      <Field
        as="select"
        id="debt-type"
        label="Тип"
        value={values.type}
        onChange={(e) => set('type', e.target.value as DebtType)}
      >
        <option value="owed">Должны мне</option>
        <option value="owing">Я должен</option>
      </Field>

      <div style={{ display: 'flex', gap: '0.75rem' }}>
        <div style={{ flex: 1 }}>
          <Field
            id="debt-amount"
            label="Сумма"
            type="number"
            step="0.01"
            min="0.01"
            prefix="₽"
            value={values.amount}
            onChange={(e) => set('amount', e.target.value)}
            required
          />
        </div>
        <div style={{ flex: 1 }}>
          <Field
            id="debt-currency"
            label="Валюта"
            value={values.currency}
            onChange={(e) => set('currency', e.target.value.toUpperCase())}
            maxLength={3}
            required
          />
        </div>
      </div>

      <Field
        id="debt-due-date"
        label="Срок (необязательно)"
        type="date"
        value={values.dueDate}
        onChange={(e) => set('dueDate', e.target.value)}
      />

      <Field
        id="debt-note"
        label="Заметка"
        value={values.note}
        onChange={(e) => set('note', e.target.value)}
        placeholder="Необязательно"
      />
    </form>
  )
}

function EmptyState({ settledFilter, onCreate }: { settledFilter: boolean; onCreate: () => void }) {
  // The "closed debts" tab being empty isn't actionable - there's nothing
  // to create from there, so it doesn't fit the shared EmptyState's
  // required action button. Only the "active debts" case (which does have
  // a real call to action) uses the shared component.
  if (settledFilter) {
    return (
      <div style={{ textAlign: 'center', padding: '4rem 2rem' }}>
        <div style={{
          width: 52, height: 52, borderRadius: 14,
          background: 'var(--bg-base)', color: 'var(--text-muted)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 1rem',
        }}>
          <Handshake size={ICON_SIZE.illustrative} strokeWidth={2} />
        </div>
        <h2 style={{ margin: 0, color: 'var(--text-primary)', fontSize: '1.125rem', fontWeight: 600 }}>
          Закрытых долгов нет
        </h2>
      </div>
    )
  }
  return (
    <SharedEmptyState
      icon={<Handshake size={ICON_SIZE.illustrative} strokeWidth={2} />}
      title="Активных долгов нет"
      description="Отмечай, кто кому должен."
      actionLabel="Добавить долг"
      actionIcon={<Plus size={16} />}
      onAction={onCreate}
    />
  )
}

function SkeletonList() {
  return (
    <div className="card" style={{ overflow: 'hidden' }}>
      {[1, 2, 3].map((i) => (
        <div key={i} style={{ padding: '0.875rem 1rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '0.875rem' }}>
          <div style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--border)', flexShrink: 0 }} />
          <div style={{ flex: 1, height: 14, background: 'var(--border)', borderRadius: 4, maxWidth: 200 }} />
          <div style={{ width: 80, height: 14, background: 'var(--border)', borderRadius: 4 }} />
        </div>
      ))}
    </div>
  )
}
