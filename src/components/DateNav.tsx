import type { View } from '../lib/types'
import { addDays, getWeekDates, getMonthStart, isToday } from '../lib/dateUtils'

type Props = {
  date: string
  view: View
  onDateChange: (date: string) => void
  onViewChange: (view: View) => void
}

function rangeLabel(date: string, view: View): string {
  const d = new Date(date + 'T00:00:00')
  if (view === 'day') {
    return d.toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' })
  }
  if (view === 'week') {
    const dates = getWeekDates(date)
    const s = new Date(dates[0] + 'T00:00:00').toLocaleDateString('he-IL', { day: 'numeric', month: 'short' })
    const e = new Date(dates[6] + 'T00:00:00').toLocaleDateString('he-IL', { day: 'numeric', month: 'short' })
    return `${s} – ${e}`
  }
  return d.toLocaleDateString('he-IL', { month: 'long', year: 'numeric' })
}

function navigate(date: string, view: View, dir: -1 | 1): string {
  if (view === 'day') return addDays(date, dir)
  if (view === 'week') return addDays(date, dir * 7)
  const d = new Date(getMonthStart(date) + 'T00:00:00')
  d.setMonth(d.getMonth() + dir)
  return d.toISOString().split('T')[0]
}

const VIEW_LABELS: Record<View, string> = { day: 'יום', week: 'שבוע', month: 'חודש' }

export default function DateNav({ date, view, onDateChange, onViewChange }: Props) {
  return (
    <div className="date-nav">
      <div className="date-nav-center">
        <button className="date-nav-arrow" onClick={() => onDateChange(navigate(date, view, -1))}>‹</button>
        <span className="date-nav-label">
          {rangeLabel(date, view)}
          {view === 'day' && isToday(date) && <span className="date-nav-today"> (היום)</span>}
        </span>
        <button className="date-nav-arrow" onClick={() => onDateChange(navigate(date, view, 1))}>›</button>
      </div>
      <div className="view-toggle">
        {(['day', 'week', 'month'] as View[]).map(v => (
          <button
            key={v}
            className={`view-toggle-btn${view === v ? ' active' : ''}`}
            onClick={() => onViewChange(v)}
          >
            {VIEW_LABELS[v]}
          </button>
        ))}
      </div>
    </div>
  )
}
