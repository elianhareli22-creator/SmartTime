import { useState, useEffect } from 'react'
import type { Task } from '../lib/types'
import { todayStr } from '../lib/dateUtils'

type FormData = {
  title: string
  estimated_minutes: string
  priority: 'low' | 'medium' | 'high'
  deadline: string
  fixed_start: string
  scheduled_date: string
}

type Props = {
  editTarget: Task | null
  defaultDate?: string
  onSubmit: (data: {
    title: string
    estimated_minutes: number
    priority: 'low' | 'medium' | 'high'
    deadline: string | null
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
  deadline: '',
  fixed_start: '',
  scheduled_date: '',
}

export default function TaskForm({ editTarget, defaultDate, onSubmit, onCancel, loading }: Props) {
  const [form, setForm] = useState<FormData>(EMPTY)
  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>({})

  useEffect(() => {
    if (editTarget) {
      setForm({
        title: editTarget.title,
        estimated_minutes: String(editTarget.estimated_minutes),
        priority: editTarget.priority as 'low' | 'medium' | 'high',
        deadline: editTarget.deadline ? editTarget.deadline.slice(0, 16) : '',
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
      deadline: form.deadline || null,
      fixed_start: form.fixed_start || null,
      scheduled_date: form.scheduled_date,
    })
    setForm({ ...EMPTY, scheduled_date: defaultDate ?? todayStr() })
    setErrors({})
  }

  function field(key: keyof FormData, label: string, input: React.ReactNode) {
    return (
      <div className="form-field">
        <label className="form-label">{label}</label>
        {input}
        {errors[key] && <span className="form-error">{errors[key]}</span>}
      </div>
    )
  }

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

      {field('deadline', 'דדליין (אופציונלי)',
        <input
          className="form-input"
          type="datetime-local"
          value={form.deadline}
          onChange={e => setForm(f => ({ ...f, deadline: e.target.value }))}
        />
      )}

      {field('fixed_start', 'שעת התחלה קבועה (אופציונלי)',
        <input
          className="form-input"
          type="time"
          value={form.fixed_start}
          onChange={e => setForm(f => ({ ...f, fixed_start: e.target.value }))}
        />
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
