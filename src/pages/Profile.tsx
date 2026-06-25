import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { updateProfile } from '../lib/queries/profile'

export default function Profile() {
  const { userId, profile, setProfile } = useAuth()
  const [displayName, setDisplayName] = useState('')
  const [dayStart, setDayStart] = useState('08:00')
  const [dayEnd, setDayEnd] = useState('22:00')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.display_name ?? '')
      setDayStart(profile.day_start.slice(0, 5))
      setDayEnd(profile.day_end.slice(0, 5))
    }
  }, [profile])

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
    </div>
  )
}
