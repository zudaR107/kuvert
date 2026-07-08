import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, ArrowDownLeft, ArrowUpRight, Check, Trash2 } from 'lucide-react'
import { api } from '../../lib/api'
import { formatAmount, formatDate, toMinorUnits, fromMinorUnits } from '../../lib/format'
import { Modal } from '../../components/Modal'

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
  const [settledFilter, setSettledFilter] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Debt | null>(null)

  const { data: debts = [], isLoading } = useQuery<Debt[]>({
    queryKey: ['debts', settledFilter],
    queryFn: () => api.get(`/debts?settled=${settledFilter}`),
  })

  const createMutation = useMutation({
    mutationFn: (values: DebtFormValues) => api.post('/debts', toPayload(values)),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['debts'] }); closeModal() },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, values }: { id: string; values: DebtFormValues }) =>
      api.put(`/debts/${id}`, toPayload(values)),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['debts'] }); closeModal() },
  })

  const settleMutation = useMutation({
    mutationFn: (id: string) => api.put(`/debts/${id}`, { settled: true }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['debts'] }),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/debts/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['debts'] }),
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
        <button className="btn-primary" style={{ fontSize: '0.8125rem', padding: '0.4rem 0.875rem' }} onClick={openCreate}>
          <Plus size={15} /> Новый долг
        </button>
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
        <button
          className={settledFilter ? 'btn-ghost' : 'btn-primary'}
          style={{ fontSize: '0.8125rem', padding: '0.375rem 0.75rem' }}
          onClick={() => setSettledFilter(false)}
        >
          Активные
        </button>
        <button
          className={settledFilter ? 'btn-primary' : 'btn-ghost'}
          style={{ fontSize: '0.8125rem', padding: '0.375rem 0.75rem' }}
          onClick={() => setSettledFilter(true)}
        >
          Закрытые
        </button>
      </div>

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

      <Modal open={modalOpen} onClose={closeModal} title={editing ? 'Изменить долг' : 'Новый долг'}>
        <DebtForm
          initial={editing ? {
            counterparty: editing.counterparty,
            type: editing.type,
            amount: String(fromMinorUnits(editing.amount)),
            currency: editing.currency,
            dueDate: editing.dueDate ?? '',
            note: editing.note ?? '',
          } : DEFAULT_FORM}
          submitting={createMutation.isPending || updateMutation.isPending}
          onSubmit={handleSubmit}
        />
      </Modal>
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
        <div style={{ fontWeight: 500, fontSize: '0.875rem', color: 'var(--text-primary)' }}>{debt.counterparty}</div>
        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          {owed ? 'Должны мне' : 'Я должен'}
          {debt.dueDate && ` · до ${formatDate(debt.dueDate)}`}
        </div>
      </button>

      <div style={{ fontWeight: 600, fontSize: '0.9375rem', color: owed ? 'var(--success)' : 'var(--danger)' }}>
        {formatAmount(debt.amount, debt.currency)}
      </div>

      {!debt.settled && (
        <button className="btn-ghost" style={{ padding: '0.4rem' }} onClick={onSettle} aria-label="Отметить погашенным">
          <Check size={16} />
        </button>
      )}
      <button className="btn-ghost" style={{ padding: '0.4rem' }} onClick={onDelete} aria-label="Удалить долг">
        <Trash2 size={16} />
      </button>
    </div>
  )
}

function DebtForm({ initial, submitting, onSubmit }: {
  initial: DebtFormValues
  submitting: boolean
  onSubmit: (values: DebtFormValues) => void
}) {
  const [values, setValues] = useState(initial)

  function set<K extends keyof DebtFormValues>(key: K, value: DebtFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }))
  }

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); onSubmit(values) }}
      style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}
    >
      <div>
        <label className="label" htmlFor="debt-counterparty">Контрагент</label>
        <input
          id="debt-counterparty"
          className="input"
          value={values.counterparty}
          onChange={(e) => set('counterparty', e.target.value)}
          placeholder="Имя человека"
          required
        />
      </div>

      <div>
        <label className="label" htmlFor="debt-type">Тип</label>
        <select
          id="debt-type"
          className="input"
          value={values.type}
          onChange={(e) => set('type', e.target.value as DebtType)}
        >
          <option value="owed">Должны мне</option>
          <option value="owing">Я должен</option>
        </select>
      </div>

      <div style={{ display: 'flex', gap: '0.75rem' }}>
        <div style={{ flex: 1 }}>
          <label className="label" htmlFor="debt-amount">Сумма</label>
          <input
            id="debt-amount"
            className="input"
            type="number"
            step="0.01"
            min="0.01"
            value={values.amount}
            onChange={(e) => set('amount', e.target.value)}
            required
          />
        </div>
        <div style={{ flex: 1 }}>
          <label className="label" htmlFor="debt-currency">Валюта</label>
          <input
            id="debt-currency"
            className="input"
            value={values.currency}
            onChange={(e) => set('currency', e.target.value.toUpperCase())}
            maxLength={3}
            required
          />
        </div>
      </div>

      <div>
        <label className="label" htmlFor="debt-due-date">Срок (необязательно)</label>
        <input
          id="debt-due-date"
          className="input"
          type="date"
          value={values.dueDate}
          onChange={(e) => set('dueDate', e.target.value)}
        />
      </div>

      <div>
        <label className="label" htmlFor="debt-note">Заметка</label>
        <input
          id="debt-note"
          className="input"
          value={values.note}
          onChange={(e) => set('note', e.target.value)}
          placeholder="Необязательно"
        />
      </div>

      <button type="submit" className="btn-primary" disabled={submitting} style={{ justifyContent: 'center', padding: '0.625rem', marginTop: '0.25rem' }}>
        {submitting ? 'Сохранение…' : 'Сохранить'}
      </button>
    </form>
  )
}

function EmptyState({ settledFilter, onCreate }: { settledFilter: boolean; onCreate: () => void }) {
  return (
    <div style={{ textAlign: 'center', padding: '4rem 2rem' }}>
      <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🤝</div>
      <h2 style={{ margin: '0 0 0.5rem', color: 'var(--text-primary)', fontSize: '1.125rem', fontWeight: 600 }}>
        {settledFilter ? 'Закрытых долгов нет' : 'Активных долгов нет'}
      </h2>
      {!settledFilter && (
        <>
          <p style={{ margin: '0 0 1.5rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            Отмечай, кто кому должен.
          </p>
          <button className="btn-primary" onClick={onCreate}><Plus size={16} /> Добавить долг</button>
        </>
      )}
    </div>
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
