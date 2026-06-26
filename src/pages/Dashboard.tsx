import { useEffect, useState, useRef, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import TimeGrid from '../components/TimeGrid'
import UpcomingPanel from '../components/UpcomingPanel'
import DateNav from '../components/DateNav'
import PendingTasksPanel from '../components/PendingTasksPanel'
import WeekView from '../components/WeekView'
import MonthView from '../components/MonthView'
import { fetchBlocksForDate, fetchBlocksForRange, generateSchedule, updateScheduleBlock } from '../lib/queries/schedule'
import type { UnscheduledTask } from '../lib/queries/schedule'
import { markTaskDone, markTaskPending, fetchPendingTasksForDate, updateTaskFixedStart } from '../lib/queries/tasks'
import { nowMinutes, timeStrToMinutes, minutesToTimeStr } from '../lib/timeUtils'
import { todayStr, getWeekStart, addDays, getMonthStart, getMonthEnd, isToday } from '../lib/dateUtils'
import type { ScheduleBlock, Task, View } from '../lib/types'

const NOTIFY_WINDOW_MIN = 5

export default function Dashboard() {
  const { userId, profile } = useAuth()
  const [selectedDate, setSelectedDate] = useState(todayStr())
  const [view, setView] = useState<View>('day')
  const [blocks, setBlocks] = useState<ScheduleBlock[]>([])
  const [pendingTasks, setPendingTasks] = useState<Task[]>([])
  const [doneTaskIds, setDoneTaskIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [unscheduled, setUnscheduled] = useState<UnscheduledTask[]>([])
  const notifiedRef = useRef<Set<string>>(new Set())
  const loadIdRef = useRef(0)

  const dayStart = profile?.day_start?.slice(0, 5) ?? '08:00'
  const dayEnd = profile?.day_end?.slice(0, 5) ?? '22:00'

  async function loadData(uid: string, date: string, v: View) {
    const myId = ++loadIdRef.current
    setLoading(true)
    setError(null)
    setUnscheduled([])
    try {
      let nextBlocks: ScheduleBlock[]
      let nextTasks: Task[] = []
      if (v === 'day') {
        const [dayBlocks, tasks] = await Promise.all([
          fetchBlocksForDate(uid, date),
          fetchPendingTasksForDate(uid, date),
        ])
        nextBlocks = dayBlocks
        nextTasks = tasks
      } else if (v === 'week') {
        const weekStart = getWeekStart(date)
        const weekEnd = addDays(weekStart, 6)
        nextBlocks = await fetchBlocksForRange(uid, weekStart, weekEnd)
      } else {
        nextBlocks = await fetchBlocksForRange(uid, getMonthStart(date), getMonthEnd(date))
      }
      if (loadIdRef.current !== myId) return // a newer load started; drop stale result
      setBlocks(nextBlocks)
      setPendingTasks(nextTasks)
    } catch {
      if (loadIdRef.current === myId) setError('שגיאה בטעינת לוח הזמנים')
    } finally {
      if (loadIdRef.current === myId) setLoading(false)
    }
  }

  useEffect(() => {
    if (userId) loadData(userId, selectedDate, view)
  }, [userId, selectedDate, view])

  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission()
    }
  }, [])

  const checkNotifications = useCallback(() => {
    if (!('Notification' in window) || Notification.permission !== 'granted') return
    const now = nowMinutes()
    const today = todayStr()
    blocks.forEach(block => {
      if (block.date !== today) return // blocks may span a week/month range
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
    if (!userId) return
    setGenerating(true)
    setError(null)
    notifiedRef.current = new Set()
    try {
      const { blocks: newBlocks, unscheduled: missed } = await generateSchedule(selectedDate)
      setBlocks(newBlocks)
      setUnscheduled(missed)
      setPendingTasks(await fetchPendingTasksForDate(userId, selectedDate))
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

  async function handleBlockMove(blockId: string, newStart: string, newEnd: string) {
    if (blockId.startsWith('fixed-')) {
      const taskId = blockId.slice('fixed-'.length)
      const prevTasks = pendingTasks
      setPendingTasks(prev =>
        prev.map(t => t.id === taskId ? { ...t, fixed_start: newStart } : t)
      )
      try {
        await updateTaskFixedStart(taskId, newStart)
      } catch {
        setPendingTasks(prevTasks)
        setError('שגיאה בעדכון לוח הזמנים')
      }
      return
    }

    const prevBlocks = blocks
    setBlocks(prev => prev.map(b => b.id === blockId
      ? { ...b, start_time: newStart, end_time: newEnd }
      : b
    ))
    try {
      await updateScheduleBlock(blockId, newStart, newEnd)
    } catch {
      setBlocks(prevBlocks)
      setError('שגיאה בעדכון לוח הזמנים')
      return
    }
    try {
      const movedBlock = prevBlocks.find(b => b.id === blockId)
      if (movedBlock?.task_id) {
        const task = pendingTasks.find(t => t.id === movedBlock.task_id)
        if (task?.fixed_start != null) {
          await updateTaskFixedStart(movedBlock.task_id, newStart)
        }
      }
    } catch {
      console.warn('Block moved but fixed_start update failed')
    }
  }

  function handleSelectDate(date: string) {
    setSelectedDate(date)
    setView('day')
  }

  const builtTaskIds = new Set(blocks.map(b => b.task_id).filter(Boolean))
  const synthesizedFixedBlocks: ScheduleBlock[] = view === 'day'
    ? pendingTasks
        .filter(task => task.fixed_start != null && !builtTaskIds.has(task.id))
        .map(task => ({
          id: `fixed-${task.id}`,
          user_id: task.user_id,
          task_id: task.id,
          date: selectedDate,
          start_time: task.fixed_start!,
          end_time: minutesToTimeStr(timeStrToMinutes(task.fixed_start!) + task.estimated_minutes),
          block_type: 'task' as const,
          title: task.title,
        }))
    : []

  const dayBlocks = view === 'day' ? [...blocks, ...synthesizedFixedBlocks] : []

  return (
    <div className="page dashboard-page">
      <div className="dashboard-header">
        <h2>לוח הזמנים שלי</h2>
        {view === 'day' && (
          <button
            className="btn-cta"
            onClick={handleGenerate}
            disabled={generating}
          >
            {generating ? 'בונה את היום שלך...' : 'בנה את היום שלי'}
          </button>
        )}
      </div>

      <DateNav
        date={selectedDate}
        view={view}
        onDateChange={setSelectedDate}
        onViewChange={setView}
      />

      {error && <div className="error-banner">{error}</div>}
      {unscheduled.length > 0 && (
        <div className="warning-banner">
          {unscheduled.length} משימות לא נכנסו ללוח הזמנים: {unscheduled.map(t => t.title).join(', ')}
        </div>
      )}

      {loading ? (
        <div className="loading-text">טוען...</div>
      ) : view === 'day' ? (
        <>
          <PendingTasksPanel tasks={pendingTasks} />
          <TimeGrid
            blocks={dayBlocks}
            dayStart={dayStart}
            dayEnd={dayEnd}
            doneTaskIds={doneTaskIds}
            onMarkDone={handleToggleDone}
            onBlockMove={handleBlockMove}
          />
          {isToday(selectedDate) && (
            <UpcomingPanel blocks={dayBlocks} doneTaskIds={doneTaskIds} />
          )}
        </>
      ) : view === 'week' ? (
        <WeekView
          blocks={blocks}
          selectedDate={selectedDate}
          dayStart={dayStart}
          dayEnd={dayEnd}
          onSelectDate={handleSelectDate}
        />
      ) : (
        <MonthView
          blocks={blocks}
          selectedDate={selectedDate}
          onSelectDate={handleSelectDate}
        />
      )}
    </div>
  )
}
