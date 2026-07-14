import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Target } from 'lucide-react'
import { EmptyState, ICON_SIZE, Button, Badge, StatTile, Field, Modal, Toast } from '@zudar107/schloss-ui'
import { api } from '../../lib/api'
import { formatAmount, toMinorUnits, today } from '../../lib/format'
import { useToast } from '../../hooks/useToast'

const GOAL_FORM_ID = 'goal-form'
const CONTRIBUTION_FORM_ID = 'contribution-form'

interface Goal {
  id: string
  name: string
  icon: string
  color: string
  targetAmount: number
  currentAmount: number
  deadline: string | null
  recurring: boolean
  monthlyNeeded: number | null
}

interface Account { id: string; name: string }

interface GoalFormValues {
  name: string
  targetAmount: string
  deadline: string
  recurring: boolean
  recurringDay: string
}

const DEFAULT_GOAL_FORM: GoalFormValues = {
  name: '', targetAmount: '', deadline: '', recurring: false, recurringDay: '1',
}

interface ContributionFormValues {
  accountId: string
  amount: string
  date: string
  note: string
}

function defaultContributionForm(accounts: Account[]): ContributionFormValues {
  return { accountId: accounts[0]?.id ?? '', amount: '', date: today(), note: '' }
}

export function GoalsPage() {
  const qc = useQueryClient()
  const toast = useToast()
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [contributingGoal, setContributingGoal] = useState<Goal | null>(null)

  const { data: goals = [], isLoading } = useQuery<Goal[]>({
    queryKey: ['goals'],
    queryFn: () => api.get('/goals'),
  })

  const { data: accounts = [] } = useQuery<Account[]>({
    queryKey: ['accounts'],
    queryFn: () => api.get('/accounts'),
  })

  const createMutation = useMutation({
    mutationFn: (values: GoalFormValues) => api.post('/goals', {
      name: values.name,
      targetAmount: toMinorUnits(parseFloat(values.targetAmount) || 0),
      deadline: values.deadline || null,
      recurring: values.recurring,
      recurringDay: values.recurring ? parseInt(values.recurringDay, 10) : null,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['goals'] })
      setCreateModalOpen(false)
      toast.showSuccess('Цель создана')
    },
    onError: () => toast.showError('Не удалось создать цель'),
  })

  const contributeMutation = useMutation({
    mutationFn: ({ goalId, values }: { goalId: string; values: ContributionFormValues }) =>
      api.post(`/goals/${goalId}/contribute`, {
        accountId: values.accountId,
        amount: toMinorUnits(parseFloat(values.amount) || 0),
        date: values.date,
        note: values.note || null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['goals'] })
      setContributingGoal(null)
      toast.showSuccess('Пополнение записано')
    },
    onError: () => toast.showError('Не удалось записать пополнение'),
  })

  return (
    <div style={{ maxWidth: 860, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--text-primary)' }}>
            Цели
          </h1>
          <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.8125rem' }}>
            {goals.length} активных целей
          </p>
        </div>
        <Button variant="primary" style={{ fontSize: '0.8125rem', padding: '0.4rem 0.875rem' }} onClick={() => setCreateModalOpen(true)}>
          <Plus size={15} /> Новая цель
        </Button>
      </div>

      {!isLoading && goals.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem', marginBottom: '1.25rem' }}>
          <StatTile label="Накоплено" value={formatAmount(goals.reduce((sum, g) => sum + g.currentAmount, 0))} accent />
          <StatTile
            label="Осталось накопить"
            value={formatAmount(goals.reduce((sum, g) => sum + Math.max(0, g.targetAmount - g.currentAmount), 0))}
          />
        </div>
      )}

      {isLoading ? (
        <SkeletonGrid />
      ) : goals.length === 0 ? (
        <EmptyState
          icon={<Target size={ICON_SIZE.illustrative} strokeWidth={2} />}
          title="Целей пока нет"
          description="Определи, на что хочешь копить."
          actionLabel="Создать первую цель"
          actionIcon={<Plus size={16} />}
          onAction={() => setCreateModalOpen(true)}
        />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
          {goals.map((g) => (
            <GoalCard key={g.id} goal={g} onContribute={() => setContributingGoal(g)} />
          ))}
        </div>
      )}

      <Modal
        open={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        title="Новая цель"
        icon={<Target size={ICON_SIZE.default} strokeWidth={2} />}
        actions={[{
          label: createMutation.isPending ? 'Сохранение…' : 'Сохранить',
          onClick: () => (document.getElementById(GOAL_FORM_ID) as HTMLFormElement | null)?.requestSubmit(),
          variant: 'primary',
        }]}
      >
        <GoalForm formId={GOAL_FORM_ID} onSubmit={(v) => createMutation.mutate(v)} />
      </Modal>

      <Modal
        open={contributingGoal !== null}
        onClose={() => setContributingGoal(null)}
        title={contributingGoal ? `Пополнить «${contributingGoal.name}»` : 'Пополнить цель'}
        icon={<Plus size={ICON_SIZE.default} strokeWidth={2} />}
        actions={[{
          label: contributeMutation.isPending ? 'Сохранение…' : 'Пополнить',
          onClick: () => (document.getElementById(CONTRIBUTION_FORM_ID) as HTMLFormElement | null)?.requestSubmit(),
          variant: 'primary',
        }]}
      >
        {contributingGoal && (
          <ContributionForm
            formId={CONTRIBUTION_FORM_ID}
            accounts={accounts}
            onSubmit={(values) => contributeMutation.mutate({ goalId: contributingGoal.id, values })}
          />
        )}
      </Modal>

      {toast.toast && (
        <Toast open variant={toast.toast.variant} message={toast.toast.message} onDismiss={toast.dismiss} />
      )}
    </div>
  )
}

function GoalCard({ goal, onContribute }: { goal: Goal; onContribute: () => void }) {
  const pct = Math.min(100, (goal.currentAmount / goal.targetAmount) * 100)
  const done = goal.currentAmount >= goal.targetAmount

  return (
    <div className="card" style={{ padding: '1.25rem', position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: goal.color, opacity: 0.8 }} />

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10,
            background: `${goal.color}20`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: goal.color, fontSize: '1.125rem',
          }}>
            <Target size={20} />
          </div>
          <div>
            <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-primary)' }}>{goal.name}</div>
            {goal.deadline && (
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>до {goal.deadline}</div>
            )}
          </div>
        </div>
        {done && <Badge variant="success">Достигнуто ✓</Badge>}
      </div>

      {/* Progress */}
      <div style={{ marginBottom: '0.75rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem', marginBottom: '0.375rem' }}>
          <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>
            {formatAmount(goal.currentAmount)}
          </span>
          <span style={{ color: 'var(--text-muted)' }}>
            {formatAmount(goal.targetAmount)}
          </span>
        </div>
        <div className="progress-bar">
          <div
            className="progress-fill"
            style={{ width: `${pct}%`, background: done ? 'var(--success)' : goal.color }}
          />
        </div>
        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem', textAlign: 'right' }}>
          {pct.toFixed(0)}%
        </div>
      </div>

      {/* Monthly suggestion */}
      {goal.monthlyNeeded !== null && !done && (
        <div style={{
          fontSize: '0.8rem', color: 'var(--text-secondary)',
          padding: '0.5rem 0.625rem', background: 'var(--bg-base)',
          borderRadius: 8, display: 'flex', justifyContent: 'space-between',
        }}>
          <span>Рекомендуется в месяц</span>
          <strong style={{ color: 'var(--text-primary)' }}>{formatAmount(goal.monthlyNeeded)}</strong>
        </div>
      )}

      {!done && (
        <Button
          variant="primary"
          style={{ width: '100%', marginTop: '0.75rem', justifyContent: 'center', fontSize: '0.8125rem', padding: '0.4rem' }}
          onClick={onContribute}
        >
          <Plus size={14} /> Пополнить
        </Button>
      )}
    </div>
  )
}

function GoalForm({ formId, onSubmit }: {
  formId: string
  onSubmit: (values: GoalFormValues) => void
}) {
  const [values, setValues] = useState<GoalFormValues>(DEFAULT_GOAL_FORM)

  function set<K extends keyof GoalFormValues>(key: K, value: GoalFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }))
  }

  return (
    <form
      id={formId}
      onSubmit={(e) => { e.preventDefault(); onSubmit(values) }}
      style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}
    >
      <Field
        id="goal-name"
        label="Название"
        value={values.name}
        onChange={(e) => set('name', e.target.value)}
        placeholder="Отпуск, подушка безопасности…"
        required
      />

      <Field
        id="goal-target"
        label="Целевая сумма"
        type="number"
        step="0.01"
        min="0.01"
        prefix="₽"
        value={values.targetAmount}
        onChange={(e) => set('targetAmount', e.target.value)}
        required
      />

      <Field
        id="goal-deadline"
        label="Срок (необязательно)"
        type="date"
        value={values.deadline}
        onChange={(e) => set('deadline', e.target.value)}
      />

      <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
        <input
          type="checkbox"
          checked={values.recurring}
          onChange={(e) => set('recurring', e.target.checked)}
        />
        Повторять цель после достижения
      </label>

      {values.recurring && (
        <Field
          id="goal-recurring-day"
          label="День месяца для нового цикла"
          type="number"
          min="1"
          max="28"
          value={values.recurringDay}
          onChange={(e) => set('recurringDay', e.target.value)}
        />
      )}
    </form>
  )
}

function ContributionForm({ formId, accounts, onSubmit }: {
  formId: string
  accounts: Account[]
  onSubmit: (values: ContributionFormValues) => void
}) {
  const [values, setValues] = useState<ContributionFormValues>(() => defaultContributionForm(accounts))

  function set<K extends keyof ContributionFormValues>(key: K, value: ContributionFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }))
  }

  return (
    <form
      id={formId}
      onSubmit={(e) => { e.preventDefault(); onSubmit(values) }}
      style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}
    >
      <Field
        as="select"
        id="contribution-account"
        label="Счёт списания"
        value={values.accountId}
        onChange={(e) => set('accountId', e.target.value)}
        required
      >
        {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
      </Field>

      <Field
        id="contribution-amount"
        label="Сумма"
        type="number"
        step="0.01"
        min="0.01"
        prefix="₽"
        value={values.amount}
        onChange={(e) => set('amount', e.target.value)}
        required
      />

      <Field
        id="contribution-date"
        label="Дата"
        type="date"
        value={values.date}
        onChange={(e) => set('date', e.target.value)}
        required
      />

      <Field
        id="contribution-note"
        label="Заметка"
        value={values.note}
        onChange={(e) => set('note', e.target.value)}
        placeholder="Необязательно"
      />
    </form>
  )
}

function SkeletonGrid() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
      {[1, 2, 3].map((i) => (
        <div key={i} className="card" style={{ padding: '1.25rem' }}>
          <div style={{ display: 'flex', gap: '0.625rem', marginBottom: '1rem' }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--border)' }} />
            <div style={{ flex: 1 }}>
              <div style={{ height: 14, background: 'var(--border)', borderRadius: 4, marginBottom: 6, width: '60%' }} />
              <div style={{ height: 11, background: 'var(--border)', borderRadius: 4, width: '40%' }} />
            </div>
          </div>
          <div style={{ height: 6, background: 'var(--border)', borderRadius: 99 }} />
        </div>
      ))}
    </div>
  )
}
