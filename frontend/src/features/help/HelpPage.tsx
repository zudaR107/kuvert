interface Section {
  titel: string
  text: string
  screenshotSlug: string
  screenshotAlt: string
}

const SECTIONS: Section[] = [
  {
    titel: 'Счета',
    text: 'Счёт — это реальные деньги: карта, кошелёк, вклад. Здесь ты заводишь все места, где физически лежат твои деньги.',
    screenshotSlug: 'accounts',
    screenshotAlt: 'Страница со списком счетов',
  },
  {
    titel: 'Бюджет',
    text: 'Раздели доходы по конвертам — категориям расходов вроде «Продукты» или «Транспорт». Конверты настраиваются отдельно, на странице «Конверты», а здесь ты распределяешь по ним деньги на текущий период. Остаток переносится в следующий период автоматически.',
    screenshotSlug: 'budget',
    screenshotAlt: 'Страница бюджета с распределением по конвертам',
  },
  {
    titel: 'Транзакции',
    text: 'Вноси доходы, расходы и переводы между счетами вручную, либо загрузи выписку из банка через импорт CSV — кнопка импорта наверху страницы.',
    screenshotSlug: 'transactions',
    screenshotAlt: 'Список транзакций с кнопкой импорта CSV',
  },
  {
    titel: 'Цели',
    text: 'Заведи цель (например, «Отпуск») с суммой и пополняй её отдельно от обычных конвертов. Когда цель достигнута, она может автоматически начать копиться заново — если она была отмечена как повторяющаяся.',
    screenshotSlug: 'goals',
    screenshotAlt: 'Страница целей с прогрессом накопления',
  },
  {
    titel: 'Долги',
    text: 'Учитывай, кто должен тебе или ты кому-то. Активные и закрытые долги — на отдельных вкладках.',
    screenshotSlug: 'debts',
    screenshotAlt: 'Страница долгов с активными и закрытыми вкладками',
  },
  {
    titel: 'Настройки',
    text: 'Основная валюта платформы задаётся здесь — она используется при отображении всех сумм.',
    screenshotSlug: 'settings',
    screenshotAlt: 'Страница настроек с выбором валюты',
  },
]

export function HelpPage() {
  return (
    <div style={{ maxWidth: 640, margin: '0 auto' }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--text-primary)' }}>
          Как пользоваться Kuvert
        </h1>
        <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.8125rem' }}>
          Бюджет по методу конвертов
        </p>
      </div>

      <p style={{ margin: '0 0 1.5rem', color: 'var(--text-secondary)', fontSize: '0.875rem', lineHeight: 1.6 }}>
        Деньги хранятся на счетах, а распределяются они по конвертам — категориям
        расходов. Счета и конверты настраиваются отдельно и решают разные задачи:
        счёт — это «где лежат деньги», конверт — это «на что они запланированы».
      </p>

      <div className="card" style={{ padding: '1.5rem', marginBottom: '1.5rem' }}>
        <h2 style={{ margin: '0 0 0.75rem', fontSize: '0.9375rem', fontWeight: 600, color: 'var(--text-primary)' }}>
          Первые шаги
        </h2>
        {/* Tailwind's preflight resets ol/ul to `list-style: none`, so the
            numbers need to be explicitly restored - otherwise the paddingLeft
            below just looks like unexplained indentation with no markers. */}
        <ol style={{ margin: 0, paddingLeft: '1.25rem', listStyleType: 'decimal', color: 'var(--text-muted)', fontSize: '0.8125rem', lineHeight: 1.7 }}>
          <li>Добавь хотя бы один счёт на странице «Счета».</li>
          <li>Настрой конверты и распредели по ним деньги на странице «Бюджет».</li>
          <li>Вноси доходы и расходы на странице «Транзакции».</li>
        </ol>
      </div>

      {SECTIONS.map((s) => (
        <div key={s.titel} className="card" style={{ padding: '1.5rem', marginBottom: '1.5rem' }}>
          <h2 style={{ margin: '0 0 0.5rem', fontSize: '0.9375rem', fontWeight: 600, color: 'var(--text-primary)' }}>
            {s.titel}
          </h2>
          <p style={{ margin: '0 0 1rem', color: 'var(--text-muted)', fontSize: '0.8125rem', lineHeight: 1.6 }}>
            {s.text}
          </p>
          {/* TODO(screenshot): drop a PNG at public/guide/kuvert-{s.screenshotSlug}.png */}
          <img
            src={`/guide/kuvert-${s.screenshotSlug}.png`}
            alt={s.screenshotAlt}
            style={{ width: '100%', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}
          />
        </div>
      ))}
    </div>
  )
}
