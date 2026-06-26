import type { ScheduleBlock } from '../lib/types'
import { timeStrToMinutes, formatTimeRange } from '../lib/timeUtils'

const PX_PER_MIN = 1.5

type Props = {
  block: ScheduleBlock
  dayStartMin: number
  onMarkDone: (taskId: string) => void
  isDone: boolean
}

export default function ScheduleBlockView({ block, dayStartMin, onMarkDone, isDone }: Props) {
  const startMin = timeStrToMinutes(block.start_time)
  const endMin = timeStrToMinutes(block.end_time)
  const top = (startMin - dayStartMin) * PX_PER_MIN
  const height = Math.max((endMin - startMin) * PX_PER_MIN, 24)

  return (
    <div
      className={`schedule-block${isDone ? ' schedule-block--done' : ''}`}
      style={{ top: `${top}px`, height: `${height}px` }}
    >
      {block.task_id && (
        <input
          type="checkbox"
          className="block-checkbox"
          checked={isDone}
          onChange={() => onMarkDone(block.task_id!)}
          title="סמן כהושלם"
        />
      )}
      <div className="block-content">
        <span className="block-title">{block.title}</span>
        <span className="block-time">{formatTimeRange(block.start_time, block.end_time)}</span>
      </div>
    </div>
  )
}
