import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Mail, Archive, RefreshCw } from 'lucide-react'
import { EmptyState, ICON_SIZE, Button, Badge, Field, Modal, Toast } from '@zudar107/schloss-ui'
import { api } from '../../lib/api'
import { useToast } from '../../hooks/useToast'

const ENVELOPE_FORM_ID = 'envelope-form'

interface Category {
  id: string
  name: string
  color: string
}

interface Envelope {
  id: string
  name: string
  categoryId: string | null
  icon: string
  color: string
  rolloverEnabled: boolean
}

interface EnvelopeFormValues {
  name: string
  categoryId: string
  color: string
  rolloverEnabled: boolean
}

const ENVELOPE_NAME_PLACEHOLDER = 'Продукты'

const DEFAULT_FORM: EnvelopeFormValues = {
  name: '', categoryId: '', color: '#3b82f6', rolloverEnabled: true,
}

export function EnvelopesPage() {
  const qc = useQueryClient()
  const toast = useToast()
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Envelope | null>(null)

  const { data: envelopes = [], isLoading } = useQuery<Envelope[]>({
    queryKey: ['envelopes'],
    queryFn: () => api.get('/envelopes'),
  })

  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ['envelopeCategories'],
    queryFn: () => api.get('/envelopes/categories'),
  })

  const createMutation = useMutation({
    mutationFn: (values: EnvelopeFormValues) => api.post('/envelopes', toPayload(values)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['envelopes'] })
      qc.invalidateQueries({ queryKey: ['budget'] })
      closeModal()
      toast.showSuccess('Конверт создан')
    },
    onError: () => toast.showError('Не удалось создать конверт'),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, values }: { id: string; values: EnvelopeFormValues }) =>
      api.put(`/envelopes/${id}`, toPayload(values)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['envelopes'] })
      qc.invalidateQueries({ queryKey: ['budget'] })
      closeModal()
      toast.showSuccess('Конверт обновлён')
    },
    onError: () => toast.showError('Не удалось обновить конверт'),
  })

  const archiveMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/envelopes/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['envelopes'] })
      qc.invalidateQueries({ queryKey: ['budget'] })
      toast.showSuccess('Конверт архивирован')
    },
    onError: () => toast.showError('Не удалось архивировать конверт'),
  })

  function openCreate() {
    setEditing(null)
    setModalOpen(true)
  }

  function openEdit(envelope: Envelope) {
    setEditing(envelope)
    setModalOpen(true)
  }

  function closeModal() {
    setModalOpen(false)
    setEditing(null)
  }

  function handleSubmit(values: EnvelopeFormValues) {
    if (editing) updateMutation.mutate({ id: editing.id, values })
    else createMutation.mutate(values)
  }

  const categoryById = new Map(categories.map((c) => [c.id, c]))

  return (
    <div style={{ maxWidth: 860, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--text-primary)' }}>
            Конверты
          </h1>
          <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.8125rem' }}>
            {envelopes.length} {envelopes.length === 1 ? 'конверт' : 'конвертов'}
          </p>
        </div>
        <Button variant="primary" style={{ fontSize: '0.8125rem', padding: '0.4rem 0.875rem' }} onClick={openCreate}>
          <Plus size={15} /> Новый конверт
        </Button>
      </div>

      {isLoading ? (
        <SkeletonGrid />
      ) : envelopes.length === 0 ? (
        <EmptyState
          icon={<Mail size={ICON_SIZE.illustrative} strokeWidth={2} />}
          title="Конвертов пока нет"
          description="Конверт — это статья бюджета: продукты, транспорт, развлечения. Создай его здесь, а деньги в него распредели на странице «Бюджет»."
          actionLabel="Добавить конверт"
          actionIcon={<Plus size={16} />}
          onAction={openCreate}
        />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '1rem' }}>
          {envelopes.map((e) => (
            <EnvelopeCard
              key={e.id}
              envelope={e}
              category={e.categoryId ? categoryById.get(e.categoryId) : undefined}
              onEdit={() => openEdit(e)}
              onArchive={() => archiveMutation.mutate(e.id)}
            />
          ))}
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={closeModal}
        title={editing ? 'Изменить конверт' : 'Новый конверт'}
        icon={<Mail size={ICON_SIZE.default} strokeWidth={2} />}
        actions={[{
          label: (createMutation.isPending || updateMutation.isPending) ? 'Сохранение…' : 'Сохранить',
          onClick: () => (document.getElementById(ENVELOPE_FORM_ID) as HTMLFormElement | null)?.requestSubmit(),
          variant: 'primary',
        }]}
      >
        <EnvelopeForm
          formId={ENVELOPE_FORM_ID}
          categories={categories}
          initial={editing ? {
            name: editing.name,
            categoryId: editing.categoryId ?? '',
            color: editing.color,
            rolloverEnabled: editing.rolloverEnabled,
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

function toPayload(values: EnvelopeFormValues) {
  return {
    name: values.name,
    categoryId: values.categoryId || null,
    color: values.color,
    rolloverEnabled: values.rolloverEnabled,
  }
}

function EnvelopeCard({ envelope, category, onEdit, onArchive }: {
  envelope: Envelope
  category?: Category
  onEdit: () => void
  onArchive: () => void
}) {
  return (
    <div className="card" style={{ padding: '1.25rem', position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: envelope.color, opacity: 0.8 }} />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10,
            background: `${envelope.color}20`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: envelope.color,
          }}>
            <Mail size={18} />
          </div>
          <div>
            <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-primary)' }}>{envelope.name}</div>
            {category && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{category.name}</div>}
          </div>
        </div>
        <Button
          variant="ghost"
          style={{ padding: '0.3rem', border: 'none' }}
          onClick={onArchive}
          aria-label="Архивировать конверт"
        >
          <Archive size={15} />
        </Button>
      </div>

      {envelope.rolloverEnabled && (
        <Badge variant="neutral">
          <RefreshCw size={11} /> Остаток переносится
        </Badge>
      )}

      <Button
        variant="ghost"
        style={{ width: '100%', justifyContent: 'center', fontSize: '0.8125rem', border: 'none', marginTop: '0.75rem' }}
        onClick={onEdit}
      >
        Изменить
      </Button>
    </div>
  )
}

function EnvelopeForm({ formId, categories, initial, onSubmit }: {
  formId: string
  categories: Category[]
  initial: EnvelopeFormValues
  onSubmit: (values: EnvelopeFormValues) => void
}) {
  const [values, setValues] = useState(initial)

  function set<K extends keyof EnvelopeFormValues>(key: K, value: EnvelopeFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }))
  }

  return (
    <form
      id={formId}
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit({ ...values, name: values.name.trim() || ENVELOPE_NAME_PLACEHOLDER })
      }}
      style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}
    >
      <Field
        id="envelope-name"
        label="Название"
        value={values.name}
        onChange={(e) => set('name', e.target.value)}
        placeholder={ENVELOPE_NAME_PLACEHOLDER}
      />

      {categories.length > 0 && (
        <Field
          as="select"
          id="envelope-category"
          label="Категория (необязательно)"
          value={values.categoryId}
          onChange={(e) => set('categoryId', e.target.value)}
        >
          <option value="">Без категории</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Field>
      )}

      <Field
        id="envelope-color"
        label="Цвет"
        type="color"
        value={values.color}
        onChange={(e) => set('color', e.target.value)}
        style={{ padding: 2 }}
      />

      <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
        <input
          type="checkbox"
          checked={values.rolloverEnabled}
          onChange={(e) => set('rolloverEnabled', e.target.checked)}
        />
        Переносить остаток на следующий период
      </label>
    </form>
  )
}

function SkeletonGrid() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '1rem' }}>
      {[1, 2, 3].map((i) => (
        <div key={i} className="card" style={{ padding: '1.25rem' }}>
          <div style={{ display: 'flex', gap: '0.625rem', marginBottom: '1rem' }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--border)' }} />
            <div style={{ flex: 1 }}>
              <div style={{ height: 14, background: 'var(--border)', borderRadius: 4, marginBottom: 6, width: '60%' }} />
              <div style={{ height: 11, background: 'var(--border)', borderRadius: 4, width: '40%' }} />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
