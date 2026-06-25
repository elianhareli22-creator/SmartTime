import type { ScheduleBlock } from '../lib/types'
import { getMonthCells, isToday } from '../lib/dateUtils'

const WEEK_HEADERS = ['ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳', 'א׳'] // Mon–Sun

type Props = {
  blocks: ScheduleBlock[]
  selectedDate: string
  onSelectDate: (date: string) => void
}

export default function MonthView({ blocks, selectedDate, onSelectDate }: Props) {
  const cells = getMonthCells(selectedDate)

  const byDate = new Map<string, ScheduleBlock[]>()
  for (const b of blocks) {
    const list = byDate.get(b.date) ?? []
    list.push(b)
    byDate.set(b.date, list)
  }

  return (
    <div className="month-view">
      <div className="month-header-row">
        {WEEK_HEADERS.map(d => (
          <div key={d} className="month-weekday-label">{d}</div>
        ))}
      </div>
      <div className="month-grid">
        {cells.map((date, i) => {
          if (!date) return <div key={`pad-${i}`} className="month-cell month-cell--empty" />
          const dayBlocks = byDate.get(date) ?? []
          const taskBlocks = dayBlocks.filter(b => b.block_type === 'task')
          const visible = taskBlocks.slice(0, 3)
          const overflow = taskBlocks.length - visible.length
          const dayNum = parseInt(date.split('-')[2])
          return (
            <div
              key={date}
              className={`month-cell${isToday(date) ? ' month-cell--today' : ''}`}
              onClick={() => onSelectDate(date)}
            >
              <span className={`month-day-num${isToday(date) ? ' month-day-num--today' : ''}`}>
                {dayNum}
              </span>
              <div className="month-blocks">
                {visible.map(b => (
                  <div key={b.id} className="month-block" title={b.title}>{b.title}</div>
                ))}
                {overflow > 0 && <div className="month-overflow">+{overflow}</div>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
