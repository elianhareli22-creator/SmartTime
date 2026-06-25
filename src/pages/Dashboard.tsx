import { useEffect, useState, useRef, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import TimeGrid from '../components/TimeGrid'
import UpcomingPanel from '../components/UpcomingPanel'
import { fetchBlocksForDate, generateSchedule } from '../lib/queries/schedule'
import { markTaskDone, markTaskPending } from '../lib/queries/tasks'
import { nowMinutes, timeStrToMinutes } from '../lib/timeUtils'
import { todayStr } from '../lib/dateUtils'
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
      setBlocks(await fetchBlocksForDate(userId, todayStr()))
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
      const newBlocks = await generateSchedule(todayStr())
      setBlocks(newBlocks)
    } catch {
      setError('שגיאה בבניית לוח הזמנים. נסה שוב.')
    } finally {
      setGenerating(false)
    }
  }

  async function handleToggleDone(taskId: string) {
    const wasDone = doneTaskIds.has(taskId)
    setDoneTaskIds(prev => {
      const s = new Set(prev)
      wasDone ? s.delete(taskId) : s.add(taskId)
      return s
    })
    try {
      wasDone ? await markTaskPending(taskId) : await markTaskDone(taskId)
    } catch {
      setDoneTaskIds(prev => {
        const s = new Set(prev)
        wasDone ? s.add(taskId) : s.delete(taskId)
        return s
      })
    }
  }

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
      ) : (
        <>
          <TimeGrid
            blocks={blocks}
            dayStart={dayStart}
            dayEnd={dayEnd}
            doneTaskIds={doneTaskIds}
            onMarkDone={handleToggleDone}
          />
          <UpcomingPanel blocks={blocks} doneTaskIds={doneTaskIds} />
        </>
      )}
    </div>
  )
}
