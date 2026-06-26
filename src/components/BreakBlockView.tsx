import { timeStrToMinutes, formatTimeRange } from '../lib/timeUtils'
import type { ScheduleBlock } from '../lib/types'

const PX_PER_MIN = 1.5
const BLOCK_GAP = 2

type Props = {
  block: ScheduleBlock
  dayStartMin: number
  onClick: (block: ScheduleBlock, top: number) => void
}

export default function BreakBlockView({ block, dayStartMin, onClick }: Props) {
  const startMin = timeStrToMinutes(block.start_time)
  const endMin = timeStrToMinutes(block.end_time)
  const top = (startMin - dayStartMin) * PX_PER_MIN + BLOCK_GAP
  const height = Math.max((endMin - startMin) * PX_PER_MIN - BLOCK_GAP, 18)

  return (
    <div
      className="schedule-block--break"
      style={{ top: `${top}px`, height: `${height}px`, insetInlineStart: 0, insetInlineEnd: 0 }}
      onClick={() => onClick(block, top)}
    >
      <span className="break-block-label">
        {block.title} · {formatTimeRange(block.start_time, block.end_time)}
      </span>
    </div>
  )
}
