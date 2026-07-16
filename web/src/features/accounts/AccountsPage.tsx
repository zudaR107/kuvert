import { useState } from 'react'
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { Plus, Wallet, CreditCard, PiggyBank, Landmark, Archive, ArchiveRestore } from 'lucide-react'
import {
  EmptyState, ICON_SIZE, Button, SegmentedControl, Amount, Field, AmountField, Modal, Toast,
  handleArrowFieldNavigation,
} from '@zudar107/schloss-ui'
import { api } from '../../lib/api'
import { formatAmount, toMinorUnits, fromMinorUnits } from '../../lib/format'
import { useToast } from '../../hooks/useToast'

const ACCOUNT_FORM_ID = 'account-form'

type AccountType = 'checking' | 'cash' | 'credit' | 'savings'

interface Account {
  id: string
  name: string
  type: AccountType
  currency: string
  initialBalance: number
  color: string
}

const TYPE_LABELS: Record<AccountType, string> = {
  checking: 'Расчётный',
  cash: 'Наличные',
  credit: 'Кредитный',
  savings: 'Накопительный',
}

const TYPE_ICONS: Record<AccountType, React.ReactNode> = {
  checking: <Landmark size={20} />,
  cash: <Wallet size={20} />,
  credit: <CreditCard size={20} />,
  savings: <PiggyBank size={20} />,
}

interface AccountFormValues {
  name: string
  type: AccountType
  currency: string
  initialBalance: string
  color: string
}

const ACCOUNT_NAME_PLACEHOLDER = 'Основная карта'

const DEFAULT_FORM: AccountFormValues = {
  name: '', type: 'checking', currency: 'RUB', initialBalance: '0', color: '#3b82f6',
}

export function AccountsPage() {
  const qc = useQueryClient()
  const toast = useToast()
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Account | null>(null)
  const [showArchived, setShowArchived] = useState(false)

  const { data: accounts = [], isLoading } = useQuery<Account[]>({
    queryKey: ['accounts', showArchived],
    queryFn: () => api.get(`/accounts?archived=${showArchived}`),
    placeholderData: keepPreviousData,
  })

  const createMutation = useMutation({
    mutationFn: (values: AccountFormValues) => api.post('/accounts', toPayload(values)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['accounts'] })
      // A non-zero initial balance also creates a real transaction
      // server-side (see api/src/features/accounts/router.ts) - without
      // this, an already-cached Transactions page (or the Budget page's
      // toBeBudgeted, which depends on income transactions) keeps
      // showing stale data until a hard reload.
      qc.invalidateQueries({ queryKey: ['transactions'] })
      qc.invalidateQueries({ queryKey: ['budget'] })
      closeModal()
      toast.showSuccess('Счёт создан')
    },
    onError: () => toast.showError('Не удалось создать счёт'),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, values }: { id: string; values: AccountFormValues }) =>
      // initialBalance is deliberately left out here - see toUpdatePayload.
      api.put(`/accounts/${id}`, toUpdatePayload(values)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['accounts'] })
      closeModal()
      toast.showSuccess('Счёт обновлён')
    },
    onError: () => toast.showError('Не удалось обновить счёт'),
  })

  const archiveMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/accounts/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['accounts'] })
      toast.showSuccess('Счёт архивирован')
    },
    onError: () => toast.showError('Не удалось архивировать счёт'),
  })

  const restoreMutation = useMutation({
    mutationFn: (id: string) => api.post(`/accounts/${id}/restore`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['accounts'] })
      toast.showSuccess('Счёт восстановлен')
    },
    onError: () => toast.showError('Не удалось восстановить счёт'),
  })

  function openCreate() {
    setEditing(null)
    setModalOpen(true)
  }

  function openEdit(account: Account) {
    setEditing(account)
    setModalOpen(true)
  }

  function closeModal() {
    setModalOpen(false)
    setEditing(null)
  }

  function handleSubmit(values: AccountFormValues) {
    if (editing) updateMutation.mutate({ id: editing.id, values })
    else createMutation.mutate(values)
  }

  const isEditing = editing !== null

  return (
    <div style={{ maxWidth: 860, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--text-primary)' }}>
            Счета
          </h1>
          <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.8125rem' }}>
            {accounts.length} {accounts.length === 1 ? 'счёт' : 'счетов'}
          </p>
        </div>
        <Button variant="primary" style={{ fontSize: '0.8125rem', padding: '0.4rem 0.875rem' }} onClick={openCreate}>
          <Plus size={15} /> Новый счёт
        </Button>
      </div>

      <div style={{ marginBottom: '1rem' }}>
        <SegmentedControl
          options={[
            { value: 'active', label: 'Активные' },
            { value: 'archived', label: 'Архивные' },
          ]}
          value={showArchived ? 'archived' : 'active'}
          onChange={(v) => setShowArchived(v === 'archived')}
        />
      </div>

      {isLoading ? (
        <SkeletonGrid />
      ) : accounts.length === 0 ? (
        showArchived ? (
          <ArchivedEmptyState />
        ) : (
          <EmptyState
            icon={<Landmark size={ICON_SIZE.illustrative} strokeWidth={2} />}
            title="Счетов пока нет"
            description="Счёт — это реальные деньги: карта, кошелёк, вклад. Категории расходов — в «Бюджете»."
            actionLabel="Добавить счёт"
            actionIcon={<Plus size={16} />}
            onAction={openCreate}
          />
        )
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '1rem' }}>
          {accounts.map((a) => (
            <AccountCard
              key={a.id}
              account={a}
              archived={showArchived}
              onEdit={() => openEdit(a)}
              onArchive={() => archiveMutation.mutate(a.id)}
              onRestore={() => restoreMutation.mutate(a.id)}
            />
          ))}
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={closeModal}
        title={editing ? 'Изменить счёт' : 'Новый счёт'}
        icon={<Landmark size={ICON_SIZE.default} strokeWidth={2} />}
        actions={[{
          label: (createMutation.isPending || updateMutation.isPending) ? 'Сохранение…' : 'Сохранить',
          onClick: () => (document.getElementById(ACCOUNT_FORM_ID) as HTMLFormElement | null)?.requestSubmit(),
          variant: 'primary',
        }]}
      >
        <AccountForm
          formId={ACCOUNT_FORM_ID}
          isEditing={isEditing}
          initial={editing ? {
            name: editing.name,
            type: editing.type,
            currency: editing.currency,
            initialBalance: String(fromMinorUnits(editing.initialBalance)),
            color: editing.color,
          } : DEFAULT_FORM}
          onSubmit={handleSubmit}
        />
      </Modal>

      {toast.toast && (
        <Toast
          open
          variant={toast.toast.variant}
          message={toast.toast.message}
          onDismiss={toast.dismiss}
        />
      )}
    </div>
  )
}

function toPayload(values: AccountFormValues) {
  return {
    name: values.name,
    type: values.type,
    currency: values.currency,
    initialBalance: toMinorUnits(parseFloat(values.initialBalance) || 0),
    color: values.color,
  }
}

// initialBalance only has a real, one-time effect at creation (it becomes
// an opening transaction there - see api/src/features/accounts/router.ts).
// PUT /accounts/:id never touches transactions, so sending it here would
// silently rewrite a column nothing else reads without changing the
// actual (transaction-derived) balance at all - omitted entirely instead
// of resending a value the edit form no longer even shows.
function toUpdatePayload(values: AccountFormValues) {
  const { name, type, currency, color } = toPayload(values)
  return { name, type, currency, color }
}

function AccountCard({ account, archived, onEdit, onArchive, onRestore }: {
  account: Account
  archived: boolean
  onEdit: () => void
  onArchive: () => void
  onRestore: () => void
}) {
  const { data } = useQuery<{ balance: number }>({
    queryKey: ['accountBalance', account.id],
    queryFn: () => api.get(`/accounts/${account.id}/balance`),
  })

  return (
    <div className="card" style={{ padding: '1.25rem', position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: account.color, opacity: 0.8 }} />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10,
            background: `${account.color}20`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: account.color,
          }}>
            {TYPE_ICONS[account.type]}
          </div>
          <div>
            <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-primary)' }}>{account.name}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{TYPE_LABELS[account.type]}</div>
          </div>
        </div>
        {archived ? (
          <Button
            variant="ghost"
            style={{ padding: '0.3rem', border: 'none' }}
            onClick={onRestore}
            aria-label="Восстановить счёт"
          >
            <ArchiveRestore size={15} />
          </Button>
        ) : (
          <Button
            variant="ghost"
            style={{ padding: '0.3rem', border: 'none' }}
            onClick={onArchive}
            aria-label="Архивировать счёт"
          >
            <Archive size={15} />
          </Button>
        )}
      </div>

      <div style={{ fontSize: '1.375rem', fontWeight: 700, marginBottom: '0.75rem' }}>
        {data ? (
          <Amount value={data.balance}>{formatAmount(Math.abs(data.balance), account.currency)}</Amount>
        ) : '…'}
      </div>

      {!archived && (
        <Button variant="ghost" style={{ width: '100%', justifyContent: 'center', fontSize: '0.8125rem', border: 'none' }} onClick={onEdit}>
          Изменить
        </Button>
      )}
    </div>
  )
}

function ArchivedEmptyState() {
  return (
    <div style={{ textAlign: 'center', padding: '4rem 2rem' }}>
      <div style={{
        width: 52, height: 52, borderRadius: 14,
        background: 'var(--bg-base)', color: 'var(--text-muted)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        margin: '0 auto 1rem',
      }}>
        <Landmark size={ICON_SIZE.illustrative} strokeWidth={2} />
      </div>
      <h2 style={{ margin: 0, color: 'var(--text-primary)', fontSize: '1.125rem', fontWeight: 600 }}>
        Архивных счетов нет
      </h2>
    </div>
  )
}

function AccountForm({ formId, initial, isEditing, onSubmit }: {
  formId: string
  initial: AccountFormValues
  isEditing: boolean
  onSubmit: (values: AccountFormValues) => void
}) {
  const [values, setValues] = useState(initial)

  function set<K extends keyof AccountFormValues>(key: K, value: AccountFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }))
  }

  return (
    <form
      id={formId}
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit({ ...values, name: values.name.trim() || ACCOUNT_NAME_PLACEHOLDER })
      }}
      onKeyDown={handleArrowFieldNavigation}
      style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}
    >
      <Field
        id="account-name"
        label="Название"
        value={values.name}
        onChange={(e) => set('name', e.target.value)}
        placeholder={ACCOUNT_NAME_PLACEHOLDER}
      />

      <Field
        as="select"
        id="account-type"
        label="Тип"
        value={values.type}
        onChange={(e) => set('type', e.target.value as AccountType)}
      >
        {Object.entries(TYPE_LABELS).map(([value, label]) => (
          <option key={value} value={value}>{label}</option>
        ))}
      </Field>

      <div style={{ display: 'flex', gap: '0.75rem' }}>
        <div style={{ flex: 1 }}>
          <Field
            id="account-currency"
            label="Валюта"
            value={values.currency}
            onChange={(e) => set('currency', e.target.value.toUpperCase())}
            maxLength={3}
            required
          />
        </div>
        {!isEditing && (
          <div style={{ flex: 1 }}>
            <AmountField
              id="account-balance"
              label="Начальный баланс"
              currencyCode={values.currency}
              value={values.initialBalance}
              onChange={(v) => set('initialBalance', v)}
            />
          </div>
        )}
      </div>

      <Field
        id="account-color"
        label="Цвет"
        type="color"
        value={values.color}
        onChange={(e) => set('color', e.target.value)}
        style={{ padding: 2 }}
      />
    </form>
  )
}

function SkeletonGrid() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '1rem' }}>
      {[1, 2, 3].map((i) => (
        <div key={i} className="card" style={{ padding: '1.25rem' }}>
          <div style={{ display: 'flex', gap: '0.625rem', marginBottom: '1rem' }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--border)' }} />
            <div style={{ flex: 1 }}>
              <div style={{ height: 14, background: 'var(--border)', borderRadius: 4, marginBottom: 6, width: '60%' }} />
              <div style={{ height: 11, background: 'var(--border)', borderRadius: 4, width: '40%' }} />
            </div>
          </div>
          <div style={{ height: 22, background: 'var(--border)', borderRadius: 4, width: '50%' }} />
        </div>
      ))}
    </div>
  )
}
