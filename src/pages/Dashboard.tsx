import { useEffect, useState, useRef, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import TimeGrid from '../components/TimeGrid'
import UpcomingPanel from '../components/UpcomingPanel'
import { fetchTodayBlocks, generateSchedule } from '../lib/queries/schedule'
import { markTaskDone } from '../lib/queries/tasks'
import { nowMinutes, timeStrToMinutes } from '../lib/timeUtils'
import type { ScheduleBlock } from '../lib/types'

const NOTIFY_WINDOW_MIN = 5

export default function Dashboard() {
  const { userId, profile } = useAuth()
  const [blocks, setBlocks] = useState<ScheduleBlock[]>([])
  const [doneTaskIds, setDoneTaskIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const notifiedRef = useRef<Set<string>>(new Set())

  const dayStart = profile?.day_start?.slice(0, 5) ?? '08:00'
  const dayEnd = profile?.day_end?.slice(0, 5) ?? '22:00'

  async function loadBlocks() {
    if (!userId) return
    try {
      setBlocks(await fetchTodayBlocks(userId))
    } catch {
      setError('שגיאה בטעינת לוח הזמנים')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadBlocks() }, [userId])

  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission()
    }
  }, [])

  const checkNotifications = useCallback(() => {
    if (!('Notification' in window) || Notification.permission !== 'granted') return
    const now = nowMinutes()
    blocks.forEach(block => {
      if (block.block_type === 'break') return
      if (notifiedRef.current.has(block.id)) return
      if (block.task_id && doneTaskIds.has(block.task_id)) return
      const startMin = timeStrToMinutes(block.start_time)
      if (startMin - now <= NOTIFY_WINDOW_MIN && startMin - now > 0) {
        new Notification('SmartTime', { body: `${block.title} מתחיל בקרוב` })
        notifiedRef.current.add(block.id)
      }
    })
  }, [blocks, doneTaskIds])

  useEffect(() => {
    const id = setInterval(checkNotifications, 60_000)
    return () => clearInterval(id)
  }, [checkNotifications])

  async function handleGenerate() {
    setGenerating(true)
    setError(null)
    notifiedRef.current = new Set()
    try {
      const newBlocks = await generateSchedule()
      setBlocks(newBlocks)
    } catch {
      setError('שגיאה בבניית לוח הזמנים. נסה שוב.')
    } finally {
      setGenerating(false)
    }
  }

  async function handleMarkDone(taskId: string) {
    setDoneTaskIds(prev => new Set([...prev, taskId]))
    try {
      await markTaskDone(taskId)
    } catch {
      setDoneTaskIds(prev => { const s = new Set(prev); s.delete(taskId); return s })
    }
  }

  const hasTasks = blocks.some(b => b.block_type === 'task')

  return (
    <div className="page dashboard-page">
      <div className="dashboard-header">
        <h2>לוח הזמנים שלי — היום</h2>
        <button
          className="btn-primary"
          onClick={handleGenerate}
          disabled={generating}
        >
          {generating ? 'בונה את היום שלך...' : 'בנה את היום שלי ✨'}
        </button>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {loading ? (
        <div className="loading-text">טוען...</div>
      ) : !hasTasks && blocks.length === 0 ? (
        <div className="dashboard-empty">
          <p>אין משימות עדיין.</p>
          <Link to="/tasks" className="btn-primary" style={{ display: 'inline-block', marginTop: '0.75rem' }}>
            הוסף משימות
          </Link>
        </div>
      ) : (
        <>
          <TimeGrid
            blocks={blocks}
            dayStart={dayStart}
            dayEnd={dayEnd}
            doneTaskIds={doneTaskIds}
            onMarkDone={handleMarkDone}
          />
          <UpcomingPanel blocks={blocks} doneTaskIds={doneTaskIds} />
        </>
      )}
    </div>
  )
}
