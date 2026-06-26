import type { ScheduleBlock, Task } from '../lib/types'
import { formatTimeRange } from '../lib/timeUtils'

type Props = {
  block: ScheduleBlock
  task: Task | null
  onClose: () => void
  onDelete: () => void
  onEdit: () => void
}

export default function BlockModal({ block, task, onClose, onDelete, onEdit }: Props) {
  return (
    <>
      <div className="block-modal-backdrop" onClick={onClose} />
      <div className="block-modal">
        <button className="block-modal-close" onClick={onClose} aria-label="סגור">✕</button>
        <div className="block-modal-header">
          <span className="block-modal-title">{block.title}</span>
          <span className="block-modal-time">{formatTimeRange(block.start_time, block.end_time)}</span>
        </div>
        {task?.description && (
          <p className="block-modal-description">{task.description}</p>
        )}
        <div className="block-modal-actions">
          <button className="btn-link" onClick={onEdit}>עריכה</button>
          <button className="btn-danger-text" onClick={onDelete}>מחק</button>
        </div>
      </div>
    </>
  )
}
