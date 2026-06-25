import { useState } from 'react'
import type { Task } from '../lib/types'

type Props = { tasks: Task[] }

const PRIORITY_LABEL: Record<string, string> = { high: 'גבוה', medium: 'בינוני', low: 'נמוך' }

export default function PendingTasksPanel({ tasks }: Props) {
  const [open, setOpen] = useState(true)
  if (tasks.length === 0) return null

  return (
    <div className="pending-panel">
      <button className="pending-panel-toggle" onClick={() => setOpen(o => !o)}>
        <span>משימות ממתינות ({tasks.length})</span>
        <span>{open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <ul className="pending-panel-list">
          {tasks.map(t => (
            <li key={t.id} className="pending-panel-item">
              <span className={`priority-dot priority-${t.priority}`} />
              <span className="pending-title">{t.title}</span>
              <span className="pending-duration">{t.estimated_minutes} דק׳</span>
              <span className={`pending-priority-label priority-label-${t.priority}`}>
                {PRIORITY_LABEL[t.priority]}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
