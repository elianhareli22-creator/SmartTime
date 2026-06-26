import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import DateNav from '../components/DateNav'
import TaskForm from '../components/TaskForm'
import TaskList from '../components/TaskList'
import { fetchTasksForDate, createTask, updateTask, deleteTask, moveTaskToDate } from '../lib/queries/tasks'
import { generateSchedule } from '../lib/queries/schedule'
import type { UnscheduledTask } from '../lib/queries/schedule'
import { todayStr } from '../lib/dateUtils'
import type { Task } from '../lib/types'

export default function Tasks() {
  const { userId } = useAuth()
  const [selectedDate, setSelectedDate] = useState(todayStr())
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editTarget, setEditTarget] = useState<Task | null>(null)
  const [generating, setGenerating] = useState(false)
  const [unscheduled, setUnscheduled] = useState<UnscheduledTask[]>([])
  const [buildMsg, setBuildMsg] = useState<string | null>(null)

  async function loadTasks() {
    if (!userId) return
    setLoading(true)
    try {
      setTasks(await fetchTasksForDate(userId, selectedDate))
    } catch {
      setError('שגיאה בטעינת משימות')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadTasks() }, [userId, selectedDate])

  async function handleSubmit(data: Parameters<typeof createTask>[1]) {
    if (!userId) return
    setSaving(true)
    setError(null)
    try {
      if (editTarget) {
        await updateTask(editTarget.id, data)
        setEditTarget(null)
      } else {
        await createTask(userId, data)
      }
      await loadTasks()
    } catch {
      setError('שגיאה בשמירת המשימה')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    setError(null)
    try {
      await deleteTask(id)
      await loadTasks()
    } catch {
      setError('שגיאה במחיקת המשימה')
    }
  }

  async function handleMoveToToday(id: string) {
    setError(null)
    try {
      await moveTaskToDate(id, todayStr())
      await loadTasks()
    } catch {
      setError('שגיאה בהעברת המשימה')
    }
  }

  async function handleBuild() {
    if (!userId) return
    setGenerating(true)
    setError(null)
    setBuildMsg(null)
    setUnscheduled([])
    try {
      const { unscheduled: missed } = await generateSchedule(selectedDate)
      setUnscheduled(missed)
      setBuildMsg('לוח הזמנים נבנה. צפה בו בלוח הזמנים.')
    } catch {
      setError('שגיאה בבניית לוח הזמנים. נסה שוב.')
    } finally {
      setGenerating(false)
    }
  }

  const isPast = selectedDate < todayStr()

  return (
    <div className="page tasks-page">
      <div className="dashboard-header">
        <h2>המשימות שלי</h2>
      </div>
      <div className="tasks-toolbar">
        <DateNav
          date={selectedDate}
          view="day"
          onDateChange={setSelectedDate}
          onViewChange={() => {}}
        />
        <button className="btn-cta" onClick={handleBuild} disabled={generating}>
          {generating ? 'בונה את היום שלך...' : 'בנה את היום שלי'}
        </button>
      </div>
      {error && <div className="error-banner">{error}</div>}
      {buildMsg && <div className="info-banner">{buildMsg}</div>}
      {unscheduled.length > 0 && (
        <div className="warning-banner">
          {unscheduled.length} משימות לא נכנסו ללוח הזמנים: {unscheduled.map(t => t.title).join(', ')}
        </div>
      )}
      <div className="tasks-layout">
        <div className="tasks-list-col">
          {loading ? (
            <p className="loading-text">טוען...</p>
          ) : (
            <TaskList
              tasks={tasks}
              onEdit={setEditTarget}
              onDelete={handleDelete}
              onMoveToToday={isPast ? handleMoveToToday : undefined}
            />
          )}
        </div>
        <div className="tasks-form-col">
          <TaskForm
            editTarget={editTarget}
            defaultDate={selectedDate}
            onSubmit={handleSubmit}
            onCancel={() => setEditTarget(null)}
            loading={saving}
          />
        </div>
      </div>
    </div>
  )
}
