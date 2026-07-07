import { useQuery } from '@tanstack/react-query'
import { Plus, Target } from 'lucide-react'
import { api } from '../../lib/api'
import { formatAmount } from '../../lib/format'

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

export function GoalsPage() {
  const { data: goals = [], isLoading } = useQuery<Goal[]>({
    queryKey: ['goals'],
    queryFn: () => api.get('/goals'),
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
        <button className="btn-primary" style={{ fontSize: '0.8125rem', padding: '0.4rem 0.875rem' }}>
          <Plus size={15} /> Новая цель
        </button>
      </div>

      {isLoading ? (
        <SkeletonGrid />
      ) : goals.length === 0 ? (
        <EmptyState />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
          {goals.map((g) => <GoalCard key={g.id} goal={g} />)}
        </div>
      )}
    </div>
  )
}

function GoalCard({ goal }: { goal: Goal }) {
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
        {done && (
          <span style={{
            fontSize: '0.65rem', fontWeight: 700, padding: '0.15rem 0.5rem', borderRadius: 99,
            background: 'var(--success-muted)', color: 'var(--success)',
            textTransform: 'uppercase', letterSpacing: '0.06em',
          }}>
            Достигнуто ✓
          </span>
        )}
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

      <button
        className="btn-primary"
        style={{ width: '100%', marginTop: '0.75rem', justifyContent: 'center', fontSize: '0.8125rem', padding: '0.4rem' }}
      >
        <Plus size={14} /> Пополнить
      </button>
    </div>
  )
}

function EmptyState() {
  return (
    <div style={{ textAlign: 'center', padding: '4rem 2rem' }}>
      <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🎯</div>
      <h2 style={{ margin: '0 0 0.5rem', color: 'var(--text-primary)', fontSize: '1.125rem', fontWeight: 600 }}>
        Целей пока нет
      </h2>
      <p style={{ margin: '0 0 1.5rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
        Определи, на что хочешь копить.
      </p>
      <button className="btn-primary"><Plus size={16} /> Создать первую цель</button>
    </div>
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
