import { useState } from 'react'
import type { Task } from '../lib/types'

const PRIORITY_LABEL: Record<string, string> = { high: 'גבוהה', medium: 'בינונית', low: 'נמוכה' }
const PRIORITY_CLASS: Record<string, string> = { high: 'priority-high', medium: 'priority-medium', low: 'priority-low' }

type Props = {
  tasks: Task[]
  onEdit: (task: Task) => void
  onDelete: (id: string) => Promise<void>
  onMoveToToday?: (id: string) => Promise<void>
}

export default function TaskList({ tasks, onEdit, onDelete, onMoveToToday }: Props) {
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  async function handleDelete(id: string) {
    setDeletingId(id)
    await onDelete(id)
    setConfirmId(null)
    setDeletingId(null)
  }

  if (tasks.length === 0) {
    return <p className="empty-state">אין משימות עדיין. הוסף את המשימה הראשונה שלך.</p>
  }

  return (
    <ul className="task-list">
      {tasks.map(task => (
        <li key={task.id} className={`task-item${task.status === 'done' ? ' task-done' : ''}`}>
          <div
            className="task-item-main"
            onClick={() => confirmId !== task.id && onEdit(task)}
            style={{ cursor: 'pointer' }}
          >
            <span className={`priority-dot ${PRIORITY_CLASS[task.priority]}`} title={PRIORITY_LABEL[task.priority]} />
            <span className="task-title">{task.title}</span>
            <span className="task-meta">{task.estimated_minutes} דק׳</span>
            {task.fixed_start && (
              <span className="task-meta">מתחיל: {task.fixed_start.slice(0, 5)}</span>
            )}
            {task.status === 'done' && <span className="task-badge-done">✓ הושלם</span>}
          </div>
          <div className="task-item-actions">
            {confirmId === task.id ? (
              <>
                <button
                  className="btn-danger-text"
                  onClick={() => handleDelete(task.id)}
                  disabled={deletingId === task.id}
                >
                  {deletingId === task.id ? 'מוחק...' : 'מחק'}
                </button>
                <button className="btn-link" onClick={() => setConfirmId(null)}>ביטול</button>
              </>
            ) : (
              <>
                <button className="btn-link" onClick={() => setConfirmId(task.id)}>מחק</button>
                {onMoveToToday && task.status === 'pending' && (
                  <button className="btn-link" onClick={() => onMoveToToday(task.id)}>העבר להיום</button>
                )}
              </>
            )}
          </div>
        </li>
      ))}
    </ul>
  )
}
