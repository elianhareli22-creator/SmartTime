import { useEffect, useState } from 'react'
import type { ScheduleBlock } from '../lib/types'
import { timeStrToMinutes, nowMinutes } from '../lib/timeUtils'
import ScheduleBlockView from './ScheduleBlock'

const PX_PER_MIN = 1.5

type Props = {
  blocks: ScheduleBlock[]
  dayStart: string  // "HH:MM"
  dayEnd: string    // "HH:MM"
  doneTaskIds: Set<string>
  onMarkDone: (taskId: string) => void
}

export default function TimeGrid({ blocks, dayStart, dayEnd, doneTaskIds, onMarkDone }: Props) {
  const dayStartMin = timeStrToMinutes(dayStart)
  const dayEndMin = timeStrToMinutes(dayEnd)
  const totalHeight = (dayEndMin - dayStartMin) * PX_PER_MIN

  const [nowMin, setNowMin] = useState(nowMinutes())
  useEffect(() => {
    const id = setInterval(() => setNowMin(nowMinutes()), 60_000)
    return () => clearInterval(id)
  }, [])

  const showNow = nowMin >= dayStartMin && nowMin <= dayEndMin
  const nowTop = (nowMin - dayStartMin) * PX_PER_MIN

  const hours: number[] = []
  for (let h = Math.ceil(dayStartMin / 60); h <= Math.floor(dayEndMin / 60); h++) {
    hours.push(h)
  }

  return (
    <div className="day-grid">
      <div className="time-col">
        {hours.map(h => (
          <div
            key={h}
            className="time-label"
            style={{ top: `${(h * 60 - dayStartMin) * PX_PER_MIN}px` }}
          >
            {String(h).padStart(2, '0')}:00
          </div>
        ))}
      </div>
      <div className="blocks-col" style={{ height: `${totalHeight}px` }}>
        {showNow && (
          <div className="now-line" style={{ top: `${nowTop}px` }}>
            <span className="now-label">עכשיו</span>
          </div>
        )}
        {blocks.map(block => (
          <ScheduleBlockView
            key={block.id}
            block={block}
            dayStartMin={dayStartMin}
            onMarkDone={onMarkDone}
            isDone={block.task_id ? doneTaskIds.has(block.task_id) : false}
          />
        ))}
        {blocks.length === 0 && (
          <div className="grid-empty">לחץ על ״בנה את היום שלי״ כדי לקבל לוח זמנים</div>
        )}
      </div>
    </div>
  )
}
