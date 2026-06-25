import { useMemo } from 'react'
import type { ScheduleBlock } from '../lib/types'
import { timeStrToMinutes, nowMinutes, formatTimeRange } from '../lib/timeUtils'

type Props = {
  blocks: ScheduleBlock[]
  doneTaskIds: Set<string>
}

export default function UpcomingPanel({ blocks, doneTaskIds }: Props) {
  const upcoming = useMemo(() => {
    const now = nowMinutes()
    return blocks
      .filter(b => {
        const end = timeStrToMinutes(b.end_time)
        const taskDone = b.task_id ? doneTaskIds.has(b.task_id) : false
        return end > now && !taskDone
      })
      .slice(0, 3)
  }, [blocks, doneTaskIds])

  if (upcoming.length === 0) return null

  return (
    <div className="upcoming-panel">
      <h3 className="upcoming-title">הבא בתור</h3>
      <div className="upcoming-list">
        {upcoming.map(block => (
          <div
            key={block.id}
            className={`upcoming-item${block.block_type === 'break' ? ' upcoming-break' : ''}`}
          >
            <span className="upcoming-time">{formatTimeRange(block.start_time, block.end_time)}</span>
            <span className="upcoming-name">{block.title}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
