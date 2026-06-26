import type { ScheduleBlock } from '../lib/types'
import { getWeekDates, isToday, formatDayLabel } from '../lib/dateUtils'
import { timeStrToMinutes } from '../lib/timeUtils'

const PX_PER_MIN = 0.9

type Props = {
  blocks: ScheduleBlock[]
  selectedDate: string
  dayStart: string  // "HH:MM"
  dayEnd: string    // "HH:MM"
  onSelectDate: (date: string) => void
}

export default function WeekView({ blocks, selectedDate, dayStart, dayEnd, onSelectDate }: Props) {
  const dates = getWeekDates(selectedDate)
  const dayStartMin = timeStrToMinutes(dayStart)
  const dayEndMin = timeStrToMinutes(dayEnd)
  const totalHeight = (dayEndMin - dayStartMin) * PX_PER_MIN

  const byDate = new Map<string, ScheduleBlock[]>()
  for (const b of blocks) {
    const list = byDate.get(b.date) ?? []
    list.push(b)
    byDate.set(b.date, list)
  }

  const hours: number[] = []
  for (let h = Math.ceil(dayStartMin / 60); h <= Math.floor(dayEndMin / 60); h++) {
    hours.push(h)
  }

  return (
    <div className="week-view">
      <div className="week-time-col">
        <div className="week-day-header" />
        <div style={{ height: `${totalHeight}px`, position: 'relative' }}>
          {hours.map(h => (
            <div
              key={h}
              className="week-time-label"
              style={{ top: `${(h * 60 - dayStartMin) * PX_PER_MIN}px` }}
            >
              {String(h).padStart(2, '0')}:00
            </div>
          ))}
        </div>
      </div>

      {dates.map(date => {
        const dayBlocks = byDate.get(date) ?? []
        return (
          <div
            key={date}
            className={`week-day-col${isToday(date) ? ' week-day-col--today' : ''}`}
            onClick={() => onSelectDate(date)}
          >
            <div className="week-day-header">
              <span className="week-day-name">{formatDayLabel(date)}</span>
            </div>
            <div style={{ height: `${totalHeight}px`, position: 'relative' }}>
              {dayBlocks.map(block => {
                const s = timeStrToMinutes(block.start_time)
                const e = timeStrToMinutes(block.end_time)
                const top = (s - dayStartMin) * PX_PER_MIN
                const height = Math.max((e - s) * PX_PER_MIN, 6)
                return (
                  <div
                    key={block.id}
                    className={`week-block week-block--${block.block_type}`}
                    style={{ top: `${top}px`, height: `${height}px` }}
                    title={block.title}
                  >
                    <span className="week-block-title">{block.title}</span>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
