import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, CreditCard, Receipt, Trash2 } from 'lucide-react'
import { EmptyState as SharedEmptyState, ICON_SIZE, Button, Badge, Amount, StatTile, Field, Modal, Toast } from '@zudar107/schloss-ui'
import { api } from '../../lib/api'
import { formatAmount, formatDate, toMinorUnits, fromMinorUnits, today } from '../../lib/format'
import { useToast } from '../../hooks/useToast'

const TX_FORM_ID = 'transaction-form'

type TxType = 'income' | 'expense' | 'transfer'

interface Account { id: string; name: string; currency: string }
interface Envelope { id: string; name: string }

interface Transaction {
  id: string
  accountId: string
  envelopeId: string | null
  toAccountId: string | null
  type: TxType
  amount: number
  date: string
  note: string | null
}

interface Filters {
  accountId: string
  envelopeId: string
  type: string
  from: string
  to: string
}

const EMPTY_FILTERS: Filters = { accountId: '', envelopeId: '', type: '', from: '', to: '' }

interface TxFormValues {
  accountId: string
  envelopeId: string
  toAccountId: string
  type: TxType
  amount: string
  date: string
  note: string
}

function defaultForm(accounts: Account[]): TxFormValues {
  return {
    accountId: accounts[0]?.id ?? '',
    envelopeId: '',
    toAccountId: '',
    type: 'expense',
    amount: '',
    date: today(),
    note: '',
  }
}

export function TransactionsPage() {
  const qc = useQueryClient()
  const toast = useToast()
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Transaction | null>(null)

  const { data: accounts = [] } = useQuery<Account[]>({
    queryKey: ['accounts'],
    queryFn: () => api.get('/accounts'),
  })
  const { data: envelopes = [] } = useQuery<Envelope[]>({
    queryKey: ['envelopes'],
    queryFn: () => api.get('/envelopes'),
  })

  const query = buildQuery(filters)
  const { data: transactions = [], isLoading } = useQuery<Transaction[]>({
    queryKey: ['transactions', query],
    queryFn: () => api.get(`/transactions${query ? `?${query}` : ''}`),
  })

  const accountById = new Map(accounts.map((a) => [a.id, a]))
  const envelopeById = new Map(envelopes.map((e) => [e.id, e]))

  const createMutation = useMutation({
    mutationFn: (values: TxFormValues) => api.post('/transactions', toPayload(values)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transactions'] })
      closeModal()
      toast.showSuccess('Транзакция создана')
    },
    onError: () => toast.showError('Не удалось создать транзакцию'),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, values }: { id: string; values: TxFormValues }) =>
      api.put(`/transactions/${id}`, toPayload(values)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transactions'] })
      closeModal()
      toast.showSuccess('Транзакция обновлена')
    },
    onError: () => toast.showError('Не удалось обновить транзакцию'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/transactions/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transactions'] })
      toast.showSuccess('Транзакция удалена')
    },
    onError: () => toast.showError('Не удалось удалить транзакцию'),
  })

  function openCreate() {
    setEditing(null)
    setModalOpen(true)
  }

  function openEdit(tx: Transaction) {
    setEditing(tx)
    setModalOpen(true)
  }

  function closeModal() {
    setModalOpen(false)
    setEditing(null)
  }

  function handleSubmit(values: TxFormValues) {
    if (editing) updateMutation.mutate({ id: editing.id, values })
    else createMutation.mutate(values)
  }

  return (
    <div style={{ maxWidth: 860, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--text-primary)' }}>
            Транзакции
          </h1>
          <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.8125rem' }}>
            {transactions.length} {transactions.length === 1 ? 'запись' : 'записей'}
          </p>
        </div>
        <Button
          variant="primary"
          style={{ fontSize: '0.8125rem', padding: '0.4rem 0.875rem' }}
          onClick={openCreate}
          disabled={accounts.length === 0}
        >
          <Plus size={15} /> Новая транзакция
        </Button>
      </div>

      <TransactionFilters
        filters={filters}
        accounts={accounts}
        envelopes={envelopes}
        onChange={setFilters}
      />

      {!isLoading && transactions.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem', marginBottom: '1.25rem' }}>
          <StatTile
            label="Доходы"
            value={formatAmount(transactions.filter((t) => t.type === 'income').reduce((sum, t) => sum + t.amount, 0))}
          />
          <StatTile
            label="Расходы"
            value={formatAmount(transactions.filter((t) => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0))}
          />
        </div>
      )}

      {isLoading ? (
        <SkeletonList />
      ) : transactions.length === 0 ? (
        <EmptyState accounts={accounts} onCreate={openCreate} />
      ) : (
        <div className="card" style={{ overflow: 'hidden' }}>
          {transactions.map((tx) => (
            <TransactionRow
              key={tx.id}
              tx={tx}
              account={accountById.get(tx.accountId)}
              envelope={tx.envelopeId ? envelopeById.get(tx.envelopeId) : undefined}
              onEdit={() => openEdit(tx)}
              onDelete={() => deleteMutation.mutate(tx.id)}
            />
          ))}
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={closeModal}
        title={editing ? 'Изменить транзакцию' : 'Новая транзакция'}
        icon={<Receipt size={ICON_SIZE.default} strokeWidth={2} />}
        actions={[{
          label: (createMutation.isPending || updateMutation.isPending) ? 'Сохранение…' : 'Сохранить',
          onClick: () => (document.getElementById(TX_FORM_ID) as HTMLFormElement | null)?.requestSubmit(),
          variant: 'primary',
        }]}
      >
        <TransactionForm
          formId={TX_FORM_ID}
          accounts={accounts}
          envelopes={envelopes}
          initial={editing ? {
            accountId: editing.accountId,
            envelopeId: editing.envelopeId ?? '',
            toAccountId: editing.toAccountId ?? '',
            type: editing.type,
            amount: String(fromMinorUnits(editing.amount)),
            date: editing.date,
            note: editing.note ?? '',
          } : defaultForm(accounts)}
          onSubmit={handleSubmit}
        />
      </Modal>

      {toast.toast && (
        <Toast open variant={toast.toast.variant} message={toast.toast.message} onDismiss={toast.dismiss} />
      )}
    </div>
  )
}

function buildQuery(filters: Filters): string {
  const params = new URLSearchParams()
  if (filters.accountId) params.set('accountId', filters.accountId)
  if (filters.envelopeId) params.set('envelopeId', filters.envelopeId)
  if (filters.type) params.set('type', filters.type)
  if (filters.from) params.set('from', filters.from)
  if (filters.to) params.set('to', filters.to)
  return params.toString()
}

function toPayload(values: TxFormValues) {
  return {
    accountId: values.accountId,
    envelopeId: values.type === 'transfer' ? null : (values.envelopeId || null),
    toAccountId: values.type === 'transfer' ? (values.toAccountId || null) : null,
    type: values.type,
    amount: toMinorUnits(parseFloat(values.amount) || 0),
    date: values.date,
    note: values.note || null,
  }
}

const TYPE_LABELS: Record<TxType, string> = {
  income: 'Доход',
  expense: 'Расход',
  transfer: 'Перевод',
}

const TYPE_BADGE_VARIANTS: Record<TxType, 'success' | 'danger' | 'info'> = {
  income: 'success',
  expense: 'danger',
  transfer: 'info',
}

const TYPE_COLORS: Record<TxType, string> = {
  income: 'var(--success)',
  expense: 'var(--danger)',
  transfer: 'var(--info)',
}

function TransactionFilters({ filters, accounts, envelopes, onChange }: {
  filters: Filters
  accounts: Account[]
  envelopes: Envelope[]
  onChange: (filters: Filters) => void
}) {
  function set<K extends keyof Filters>(key: K, value: Filters[K]) {
    onChange({ ...filters, [key]: value })
  }

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' }}>
      <select className="input" style={{ width: 'auto' }} aria-label="Счёт" value={filters.accountId} onChange={(e) => set('accountId', e.target.value)}>
        <option value="">Все счета</option>
        {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
      </select>
      <select className="input" style={{ width: 'auto' }} aria-label="Конверт" value={filters.envelopeId} onChange={(e) => set('envelopeId', e.target.value)}>
        <option value="">Все конверты</option>
        {envelopes.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
      </select>
      <select className="input" style={{ width: 'auto' }} aria-label="Тип" value={filters.type} onChange={(e) => set('type', e.target.value)}>
        <option value="">Все типы</option>
        <option value="income">Доход</option>
        <option value="expense">Расход</option>
        <option value="transfer">Перевод</option>
      </select>
      <input className="input" style={{ width: 'auto' }} type="date" aria-label="С" value={filters.from} onChange={(e) => set('from', e.target.value)} />
      <input className="input" style={{ width: 'auto' }} type="date" aria-label="По" value={filters.to} onChange={(e) => set('to', e.target.value)} />
    </div>
  )
}

function TransactionRow({ tx, account, envelope, onEdit, onDelete }: {
  tx: Transaction
  account: Account | undefined
  envelope: Envelope | undefined
  onEdit: () => void
  onDelete: () => void
}) {
  const amountText = formatAmount(tx.amount, account?.currency)
  return (
    <div style={{ padding: '0.875rem 1rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '0.875rem' }}>
      <Badge variant={TYPE_BADGE_VARIANTS[tx.type]} dot>{TYPE_LABELS[tx.type]}</Badge>

      <button
        onClick={onEdit}
        style={{ flex: 1, minWidth: 0, background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0 }}
      >
        <div style={{ fontWeight: 500, fontSize: '0.875rem', color: 'var(--text-primary)' }}>
          {tx.note || account?.name || 'Транзакция'}
        </div>
        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          {formatDate(tx.date)}
          {account && ` · ${account.name}`}
          {envelope && ` · ${envelope.name}`}
        </div>
      </button>

      <div style={{ fontWeight: 600, fontSize: '0.9375rem' }}>
        {tx.type === 'transfer' ? (
          <span style={{ color: TYPE_COLORS.transfer }}>{amountText}</span>
        ) : (
          <Amount value={tx.type === 'income' ? tx.amount : -tx.amount}>{amountText}</Amount>
        )}
      </div>

      <Button variant="ghost" style={{ padding: '0.4rem', border: 'none' }} onClick={onDelete} aria-label="Удалить транзакцию">
        <Trash2 size={16} />
      </Button>
    </div>
  )
}

function TransactionForm({ formId, accounts, envelopes, initial, onSubmit }: {
  formId: string
  accounts: Account[]
  envelopes: Envelope[]
  initial: TxFormValues
  onSubmit: (values: TxFormValues) => void
}) {
  const [values, setValues] = useState(initial)

  function set<K extends keyof TxFormValues>(key: K, value: TxFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }))
  }

  return (
    <form
      id={formId}
      onSubmit={(e) => { e.preventDefault(); onSubmit(values) }}
      style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}
    >
      <Field as="select" id="tx-type" label="Тип" value={values.type} onChange={(e) => set('type', e.target.value as TxType)}>
        <option value="expense">Расход</option>
        <option value="income">Доход</option>
        <option value="transfer">Перевод</option>
      </Field>

      <Field
        as="select"
        id="tx-account"
        label={values.type === 'transfer' ? 'Со счёта' : 'Счёт'}
        value={values.accountId}
        onChange={(e) => set('accountId', e.target.value)}
        required
      >
        {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
      </Field>

      {values.type === 'transfer' ? (
        <Field
          as="select"
          id="tx-to-account"
          label="На счёт"
          value={values.toAccountId}
          onChange={(e) => set('toAccountId', e.target.value)}
          required
        >
          <option value="">Выберите счёт</option>
          {accounts.filter((a) => a.id !== values.accountId).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </Field>
      ) : (
        <Field
          as="select"
          id="tx-envelope"
          label="Конверт"
          value={values.envelopeId}
          onChange={(e) => set('envelopeId', e.target.value)}
        >
          <option value="">Без конверта</option>
          {envelopes.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
        </Field>
      )}

      <div style={{ display: 'flex', gap: '0.75rem' }}>
        <div style={{ flex: 1 }}>
          <Field
            id="tx-amount"
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
            id="tx-date"
            label="Дата"
            type="date"
            value={values.date}
            onChange={(e) => set('date', e.target.value)}
            required
          />
        </div>
      </div>

      <Field
        id="tx-note"
        label="Заметка"
        value={values.note}
        onChange={(e) => set('note', e.target.value)}
        placeholder="Необязательно"
      />
    </form>
  )
}

function EmptyState({ accounts, onCreate }: { accounts: Account[]; onCreate: () => void }) {
  // No accounts yet isn't actionable from this page - there's nothing to
  // create a transaction against, so it doesn't fit the shared
  // EmptyState's required action button (the fix is on another page).
  if (accounts.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '4rem 2rem' }}>
        <CreditCard size={ICON_SIZE.illustrative} strokeWidth={2} style={{ color: 'var(--text-muted)', marginBottom: '1rem' }} />
        <h2 style={{ margin: '0 0 0.5rem', color: 'var(--text-primary)', fontSize: '1.125rem', fontWeight: 600 }}>
          Сначала добавь счёт
        </h2>
        <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
          Транзакции привязаны к счетам — создай хотя бы один на странице «Счета».
        </p>
      </div>
    )
  }
  return (
    <SharedEmptyState
      icon={<Receipt size={ICON_SIZE.illustrative} strokeWidth={2} />}
      title="Транзакций пока нет"
      description="Запиши первый доход или расход."
      actionLabel="Добавить транзакцию"
      actionIcon={<Plus size={16} />}
      onAction={onCreate}
    />
  )
}

function SkeletonList() {
  return (
    <div className="card" style={{ overflow: 'hidden' }}>
      {[1, 2, 3, 4].map((i) => (
        <div key={i} style={{ padding: '0.875rem 1rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '0.875rem' }}>
          <div style={{ width: 18, height: 18, borderRadius: 4, background: 'var(--border)', flexShrink: 0 }} />
          <div style={{ flex: 1, height: 14, background: 'var(--border)', borderRadius: 4, maxWidth: 220 }} />
          <div style={{ width: 80, height: 14, background: 'var(--border)', borderRadius: 4 }} />
        </div>
      ))}
    </div>
  )
}
