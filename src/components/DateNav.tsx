import { useRef } from 'react'
import type { View } from '../lib/types'
import { addDays, getWeekDates, getMonthStart, isToday, todayStr } from '../lib/dateUtils'

type Props = {
  date: string
  view: View
  onDateChange: (date: string) => void
  onViewChange: (view: View) => void
  showViewToggle?: boolean
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

export default function DateNav({ date, view, onDateChange, onViewChange, showViewToggle = true }: Props) {
  const dateInputRef = useRef<HTMLInputElement>(null)

  return (
    <div className="date-nav">
      <div className="date-nav-center">
        <button className="date-nav-arrow" onClick={() => onDateChange(navigate(date, view, -1))}>‹</button>
        <span className="date-nav-label">
          {rangeLabel(date, view)}
          {view === 'day' && isToday(date) && <span className="date-nav-today"> (היום)</span>}
        </span>
        <button className="date-nav-arrow" onClick={() => onDateChange(navigate(date, view, 1))}>›</button>
        <button
          className="date-nav-today-btn"
          onClick={() => onDateChange(todayStr())}
          disabled={isToday(date)}
        >
          היום
        </button>
        <span className="date-nav-calendar-wrap">
          <button
            className="date-nav-calendar-btn"
            onClick={() => dateInputRef.current?.showPicker()}
            aria-label="בחר תאריך"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
          </button>
          <input
            ref={dateInputRef}
            type="date"
            value={date}
            onChange={e => e.target.value && onDateChange(e.target.value)}
            className="date-nav-hidden-input"
          />
        </span>
      </div>
      {showViewToggle && (
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
      )}
    </div>
  )
}
