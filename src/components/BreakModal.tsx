import type { ScheduleBlock } from '../lib/types'
import { formatTimeRange } from '../lib/timeUtils'

type Props = {
  block: ScheduleBlock
  top: number
  onDelete: (blockId: string) => Promise<void>
  onClose: () => void
}

export default function BreakModal({ block, top, onDelete, onClose }: Props) {
  async function handleDelete() {
    await onDelete(block.id)
    onClose()
  }

  return (
    <div className="break-popover" style={{ top: `${top}px` }}>
      <button className="break-popover-close" onClick={onClose} title="סגור">✕</button>
      <span className="break-popover-title">{block.title}</span>
      <span className="break-popover-time">{formatTimeRange(block.start_time, block.end_time)}</span>
      <button className="btn-secondary" style={{ fontSize: '0.82rem' }} onClick={handleDelete}>
        הסר מהיום
      </button>
    </div>
  )
}
