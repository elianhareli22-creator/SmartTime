import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import DateNav from '../components/DateNav'
import TaskForm from '../components/TaskForm'
import TaskList from '../components/TaskList'
import { fetchTasksForDate, createTask, updateTask, deleteTask, moveTaskToDate } from '../lib/queries/tasks'
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

  const isPast = selectedDate < todayStr()

  return (
    <div className="page tasks-page">
      <h2>המשימות שלי</h2>
      <DateNav
        date={selectedDate}
        view="day"
        onDateChange={setSelectedDate}
        onViewChange={() => {}}
      />
      {error && <div className="error-banner">{error}</div>}
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
