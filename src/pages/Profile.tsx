import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { updateProfile } from '../lib/queries/profile'
import {
  getBreakTemplates,
  createBreakTemplate,
  updateBreakTemplate,
  deleteBreakTemplate,
} from '../lib/queries/breaks'
import type { BreakTemplate } from '../lib/types'

const DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']

function recurrenceLabel(t: BreakTemplate): string {
  switch (t.recurrence_type) {
    case 'daily': return 'כל יום'
    case 'weekly': return `כל ${DAYS[t.recurrence_day_of_week!]}`
    case 'date': return t.recurrence_date!.split('-').reverse().join('/')
    case 'date_range': {
      const fmt = (d: string) => d.split('-').reverse().join('/')
      return `${fmt(t.recurrence_date_start!)} – ${fmt(t.recurrence_date_end!)}`
    }
    default: return ''
  }
}

type BreakFormState = {
  title: string
  start_time: string
  end_time: string
  recurrence_type: 'daily' | 'weekly' | 'date' | 'date_range'
  recurrence_day_of_week: string
  recurrence_date: string
  recurrence_date_start: string
  recurrence_date_end: string
}

const EMPTY_BREAK: BreakFormState = {
  title: '',
  start_time: '',
  end_time: '',
  recurrence_type: 'daily',
  recurrence_day_of_week: '0',
  recurrence_date: '',
  recurrence_date_start: '',
  recurrence_date_end: '',
}

export default function Profile() {
  const { userId, profile, setProfile } = useAuth()
  const [displayName, setDisplayName] = useState('')
  const [dayStart, setDayStart] = useState('08:00')
  const [dayEnd, setDayEnd] = useState('22:00')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [breaks, setBreaks] = useState<BreakTemplate[]>([])
  const [breakForm, setBreakForm] = useState<BreakFormState>(EMPTY_BREAK)
  const [breakFormOpen, setBreakFormOpen] = useState(false)
  const [editBreakId, setEditBreakId] = useState<string | null>(null)
  const [breakSaving, setBreakSaving] = useState(false)
  const [breakError, setBreakError] = useState<string | null>(null)

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.display_name ?? '')
      setDayStart(profile.day_start.slice(0, 5))
      setDayEnd(profile.day_end.slice(0, 5))
    }
  }, [profile])

  useEffect(() => {
    if (!userId) return
    getBreakTemplates(userId).then(setBreaks).catch(() => {})
  }, [userId])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!userId) return
    if (dayStart >= dayEnd) {
      setError('שעת הסיום חייבת להיות אחרי שעת ההתחלה')
      return
    }
    setSaving(true)
    setError(null)
    setSaved(false)
    try {
      const updated = await updateProfile(userId, {
        display_name: displayName.trim() || null,
        day_start: dayStart,
        day_end: dayEnd,
      })
      setProfile(updated)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch {
      setError('שגיאה בשמירת הפרופיל')
    } finally {
      setSaving(false)
    }
  }

  function openAddBreak() {
    setBreakForm(EMPTY_BREAK)
    setEditBreakId(null)
    setBreakFormOpen(true)
    setBreakError(null)
  }

  function openEditBreak(t: BreakTemplate) {
    setBreakForm({
      title: t.title,
      start_time: t.start_time.slice(0, 5),
      end_time: t.end_time.slice(0, 5),
      recurrence_type: t.recurrence_type,
      recurrence_day_of_week: String(t.recurrence_day_of_week ?? 0),
      recurrence_date: t.recurrence_date ?? '',
      recurrence_date_start: t.recurrence_date_start ?? '',
      recurrence_date_end: t.recurrence_date_end ?? '',
    })
    setEditBreakId(t.id)
    setBreakFormOpen(true)
    setBreakError(null)
  }

  async function handleBreakSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!userId) return
    if (!breakForm.title.trim() || !breakForm.start_time || !breakForm.end_time) {
      setBreakError('נדרשים שם, שעת התחלה ושעת סיום')
      return
    }
    if (breakForm.start_time >= breakForm.end_time) {
      setBreakError('שעת הסיום חייבת להיות אחרי שעת ההתחלה')
      return
    }
    setBreakSaving(true)
    setBreakError(null)
    try {
      const input: Omit<BreakTemplate, 'id' | 'user_id' | 'created_at'> = {
        title: breakForm.title.trim(),
        start_time: breakForm.start_time,
        end_time: breakForm.end_time,
        recurrence_type: breakForm.recurrence_type,
        recurrence_date: breakForm.recurrence_type === 'date' ? breakForm.recurrence_date : null,
        recurrence_date_start: breakForm.recurrence_type === 'date_range' ? breakForm.recurrence_date_start : null,
        recurrence_date_end: breakForm.recurrence_type === 'date_range' ? breakForm.recurrence_date_end : null,
        recurrence_day_of_week: breakForm.recurrence_type === 'weekly' ? Number(breakForm.recurrence_day_of_week) : null,
      }
      if (editBreakId) {
        const updated = await updateBreakTemplate(editBreakId, input)
        setBreaks(prev => prev.map(b => b.id === editBreakId ? updated : b))
      } else {
        const created = await createBreakTemplate(userId, input)
        setBreaks(prev => [...prev, created])
      }
      setBreakFormOpen(false)
      setEditBreakId(null)
    } catch {
      setBreakError('שגיאה בשמירת ההפסקה')
    } finally {
      setBreakSaving(false)
    }
  }

  async function handleBreakDelete(id: string) {
    try {
      await deleteBreakTemplate(id)
      setBreaks(prev => prev.filter(b => b.id !== id))
    } catch {
      setBreakError('שגיאה במחיקת ההפסקה')
    }
  }

  if (!profile) return <div className="loading">טוען...</div>

  return (
    <div className="page">
      <h2>הפרופיל שלי</h2>
      {error && <div className="error-banner">{error}</div>}
      {saved && <div className="success-banner">הפרופיל נשמר בהצלחה ✓</div>}
      <form onSubmit={handleSubmit} className="profile-form">
        <div className="form-field">
          <label className="form-label">שם להצגה</label>
          <input
            className="form-input"
            value={displayName}
            onChange={e => setDisplayName(e.target.value)}
            placeholder="השם שלך"
          />
        </div>
        <div className="form-field">
          <label className="form-label">תחילת יום עבודה</label>
          <input
            className="form-input"
            type="time"
            value={dayStart}
            onChange={e => setDayStart(e.target.value)}
          />
        </div>
        <div className="form-field">
          <label className="form-label">סיום יום עבודה</label>
          <input
            className="form-input"
            type="time"
            value={dayEnd}
            onChange={e => setDayEnd(e.target.value)}
          />
        </div>
        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? 'שומר...' : 'שמור'}
        </button>
      </form>

      <div className="breaks-section">
        <h3>הפסקות קבועות</h3>
        {breakError && <div className="error-banner">{breakError}</div>}
        <div className="break-template-list">
          {breaks.map(t => (
            <div key={t.id} className="break-template-row">
              <div className="break-template-info">
                <span className="break-template-title">{t.title}</span>
                <span className="break-template-meta">
                  {t.start_time.slice(0, 5)}–{t.end_time.slice(0, 5)} · {recurrenceLabel(t)}
                </span>
              </div>
              <div className="break-template-actions">
                <button className="btn-icon" onClick={() => openEditBreak(t)} title="ערוך">✎</button>
                <button className="btn-icon btn-icon--danger" onClick={() => handleBreakDelete(t.id)} title="מחק">✕</button>
              </div>
            </div>
          ))}
        </div>
        {!breakFormOpen && (
          <button className="btn-secondary" style={{ marginBlockStart: '0.75rem' }} onClick={openAddBreak}>
            + הוסף הפסקה
          </button>
        )}
        {breakFormOpen && (
          <form onSubmit={handleBreakSubmit} className="break-form">
            <div className="form-field">
              <label className="form-label">שם ההפסקה</label>
              <input
                className="form-input"
                value={breakForm.title}
                onChange={e => setBreakForm(f => ({ ...f, title: e.target.value }))}
                placeholder="לדוגמה: הפסקת צהריים"
              />
            </div>
            <div className="break-form-row">
              <div className="form-field">
                <label className="form-label">שעת התחלה</label>
                <input
                  className="form-input"
                  type="time"
                  value={breakForm.start_time}
                  onChange={e => setBreakForm(f => ({ ...f, start_time: e.target.value }))}
                />
              </div>
              <div className="form-field">
                <label className="form-label">שעת סיום</label>
                <input
                  className="form-input"
                  type="time"
                  value={breakForm.end_time}
                  onChange={e => setBreakForm(f => ({ ...f, end_time: e.target.value }))}
                />
              </div>
            </div>
            <div className="form-field">
              <label className="form-label">חזרה</label>
              <select
                className="form-input"
                value={breakForm.recurrence_type}
                onChange={e => setBreakForm(f => ({ ...f, recurrence_type: e.target.value as BreakFormState['recurrence_type'] }))}
              >
                <option value="daily">כל יום</option>
                <option value="weekly">יום בשבוע</option>
                <option value="date">תאריך ספציפי</option>
                <option value="date_range">טווח תאריכים</option>
              </select>
            </div>
            {breakForm.recurrence_type === 'weekly' && (
              <div className="form-field">
                <label className="form-label">יום בשבוע</label>
                <select
                  className="form-input"
                  value={breakForm.recurrence_day_of_week}
                  onChange={e => setBreakForm(f => ({ ...f, recurrence_day_of_week: e.target.value }))}
                >
                  {DAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
                </select>
              </div>
            )}
            {breakForm.recurrence_type === 'date' && (
              <div className="form-field">
                <label className="form-label">תאריך</label>
                <input
                  className="form-input"
                  type="date"
                  value={breakForm.recurrence_date}
                  onChange={e => setBreakForm(f => ({ ...f, recurrence_date: e.target.value }))}
                />
              </div>
            )}
            {breakForm.recurrence_type === 'date_range' && (
              <div className="break-form-row">
                <div className="form-field">
                  <label className="form-label">מתאריך</label>
                  <input
                    className="form-input"
                    type="date"
                    value={breakForm.recurrence_date_start}
                    onChange={e => setBreakForm(f => ({ ...f, recurrence_date_start: e.target.value }))}
                  />
                </div>
                <div className="form-field">
                  <label className="form-label">עד תאריך</label>
                  <input
                    className="form-input"
                    type="date"
                    value={breakForm.recurrence_date_end}
                    onChange={e => setBreakForm(f => ({ ...f, recurrence_date_end: e.target.value }))}
                  />
                </div>
              </div>
            )}
            <div className="break-form-actions">
              <button type="submit" className="btn-primary" disabled={breakSaving}>
                {breakSaving ? 'שומר...' : editBreakId ? 'עדכן' : 'הוסף'}
              </button>
              <button type="button" className="btn-secondary" onClick={() => { setBreakFormOpen(false); setEditBreakId(null) }}>
                ביטול
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
