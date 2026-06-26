import { useState, useEffect } from 'react'
import type { Task, BreakTemplate } from '../lib/types'
import { todayStr } from '../lib/dateUtils'
import { timeStrToMinutes } from '../lib/timeUtils'

type FormData = {
  title: string
  estimated_minutes: string
  priority: 'low' | 'medium' | 'high'
  fixed_start: string
  scheduled_date: string
}

type Props = {
  editTarget: Task | null
  defaultDate?: string
  breakTemplates: BreakTemplate[]
  onSubmit: (data: {
    title: string
    estimated_minutes: number
    priority: 'low' | 'medium' | 'high'
    fixed_start: string | null
    scheduled_date: string
  }) => Promise<void>
  onCancel: () => void
  loading: boolean
}

const EMPTY: FormData = {
  title: '',
  estimated_minutes: '30',
  priority: 'medium',
  fixed_start: '',
  scheduled_date: '',
}

function findBreakConflict(
  fixedStart: string,
  estimatedMinutes: number,
  scheduledDate: string,
  breakTemplates: BreakTemplate[],
): BreakTemplate | null {
  if (!fixedStart || !scheduledDate || isNaN(estimatedMinutes) || estimatedMinutes <= 0) return null
  const taskStart = timeStrToMinutes(fixedStart)
  const taskEnd = taskStart + estimatedMinutes
  const d = new Date(scheduledDate + 'T12:00:00')
  const dow = d.getDay()
  for (const t of breakTemplates) {
    let applies = false
    switch (t.recurrence_type) {
      case 'daily': applies = true; break
      case 'weekly': applies = t.recurrence_day_of_week === dow; break
      case 'date': applies = t.recurrence_date === scheduledDate; break
      case 'date_range':
        applies = !!t.recurrence_date_start && !!t.recurrence_date_end &&
          t.recurrence_date_start <= scheduledDate && scheduledDate <= t.recurrence_date_end
        break
    }
    if (!applies) continue
    const bs = timeStrToMinutes(t.start_time)
    const be = timeStrToMinutes(t.end_time)
    if (taskStart < be && taskEnd > bs) return t
  }
  return null
}

export default function TaskForm({ editTarget, defaultDate, breakTemplates, onSubmit, onCancel, loading }: Props) {
  const [form, setForm] = useState<FormData>(EMPTY)
  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>({})

  useEffect(() => {
    if (editTarget) {
      setForm({
        title: editTarget.title,
        estimated_minutes: String(editTarget.estimated_minutes),
        priority: editTarget.priority as 'low' | 'medium' | 'high',
        fixed_start: editTarget.fixed_start ? editTarget.fixed_start.slice(0, 5) : '',
        scheduled_date: editTarget.scheduled_date ?? todayStr(),
      })
    } else {
      setForm({ ...EMPTY, scheduled_date: defaultDate ?? todayStr() })
    }
    setErrors({})
  }, [editTarget, defaultDate])

  function validate(): boolean {
    const errs: Partial<Record<keyof FormData, string>> = {}
    if (!form.title.trim()) errs.title = 'נדרש שם משימה'
    const mins = parseInt(form.estimated_minutes)
    if (!form.estimated_minutes || isNaN(mins) || mins <= 0) {
      errs.estimated_minutes = 'נדרשת משך זמן חיובי'
    }
    if (!form.scheduled_date) errs.scheduled_date = 'נדרש תאריך'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validate()) return
    await onSubmit({
      title: form.title.trim(),
      estimated_minutes: parseInt(form.estimated_minutes),
      priority: form.priority,
      fixed_start: form.fixed_start || null,
      scheduled_date: form.scheduled_date,
    })
    setForm({ ...EMPTY, scheduled_date: defaultDate ?? todayStr() })
    setErrors({})
  }

  function field(key: keyof FormData, label: string, input: React.ReactNode, extra?: React.ReactNode) {
    return (
      <div className="form-field">
        <label className="form-label">{label}</label>
        {input}
        {errors[key] && <span className="form-error">{errors[key]}</span>}
        {extra}
      </div>
    )
  }

  const breakConflict = findBreakConflict(
    form.fixed_start,
    parseInt(form.estimated_minutes),
    form.scheduled_date,
    breakTemplates,
  )

  return (
    <form onSubmit={handleSubmit} className="task-form">
      <h3>{editTarget ? 'עריכת משימה' : 'משימה חדשה'}</h3>

      {field('title', 'שם המשימה *',
        <input
          className="form-input"
          value={form.title}
          onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
          placeholder="לדוגמה: לכתוב דו״ח שבועי"
        />
      )}

      {field('estimated_minutes', 'משך (דקות) *',
        <input
          className="form-input"
          type="number"
          min={1}
          value={form.estimated_minutes}
          onChange={e => setForm(f => ({ ...f, estimated_minutes: e.target.value }))}
        />
      )}

      {field('priority', 'עדיפות',
        <select
          className="form-input"
          value={form.priority}
          onChange={e => setForm(f => ({ ...f, priority: e.target.value as 'low' | 'medium' | 'high' }))}
        >
          <option value="high">גבוהה</option>
          <option value="medium">בינונית</option>
          <option value="low">נמוכה</option>
        </select>
      )}

      {field('scheduled_date', 'תאריך *',
        <input
          className="form-input"
          type="date"
          value={form.scheduled_date}
          onChange={e => setForm(f => ({ ...f, scheduled_date: e.target.value }))}
        />
      )}

      {field('fixed_start', 'שעת התחלה',
        <input
          className="form-input"
          type="time"
          value={form.fixed_start}
          onChange={e => setForm(f => ({ ...f, fixed_start: e.target.value }))}
        />,
        breakConflict && (
          <span className="form-warning">
            שעה זו חופפת להפסקת {breakConflict.title} ({breakConflict.start_time.slice(0, 5)}–{breakConflict.end_time.slice(0, 5)})
          </span>
        )
      )}

      <div className="form-actions">
        <button type="submit" className="btn-primary" disabled={loading}>
          {loading ? 'שומר...' : editTarget ? 'עדכן' : 'הוסף משימה'}
        </button>
        {editTarget && (
          <button type="button" className="btn-secondary" onClick={onCancel}>
            ביטול
          </button>
        )}
      </div>
    </form>
  )
}
