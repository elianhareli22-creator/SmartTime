import { useRef } from 'react'
import { useDraggable } from '@dnd-kit/core'
import type { ScheduleBlock } from '../lib/types'
import { timeStrToMinutes, formatTimeRange } from '../lib/timeUtils'

const PX_PER_MIN = 1.5
const BLOCK_GAP = 2

type Props = {
  block: ScheduleBlock
  dayStartMin: number
  onMarkDone: (taskId: string) => void
  isDone: boolean
  dragDeltaY?: number
  isCollision?: boolean
  onBlockClick?: (block: ScheduleBlock) => void
}

export default function ScheduleBlockView({
  block, dayStartMin, onMarkDone, isDone, dragDeltaY, isCollision, onBlockClick,
}: Props) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: block.id,
    data: { block },
  })

  const pointerDownPos = useRef<{ x: number; y: number } | null>(null)

  const startMin = timeStrToMinutes(block.start_time)
  const endMin = timeStrToMinutes(block.end_time)
  const top = (startMin - dayStartMin) * PX_PER_MIN + BLOCK_GAP
  const height = Math.max((endMin - startMin) * PX_PER_MIN - BLOCK_GAP, 22)

  const style: React.CSSProperties = {
    top: `${top}px`,
    height: `${height}px`,
    ...(isDragging && dragDeltaY !== undefined ? {
      transform: `translateY(${dragDeltaY}px)`,
      zIndex: 100,
      opacity: isCollision ? 0.85 : 0.75,
      boxShadow: isCollision ? 'none' : '0 4px 16px rgba(0,0,0,0.18)',
      background: isCollision ? 'var(--block-forbidden, #c0392b)' : undefined,
      cursor: isCollision ? 'not-allowed' : 'grabbing',
    } : { cursor: 'grab' }),
  }

  function handlePointerDown(e: React.PointerEvent) {
    pointerDownPos.current = { x: e.clientX, y: e.clientY }
    // Forward to dnd-kit so drag still works
    if (listeners?.onPointerDown) {
      (listeners.onPointerDown as (e: React.PointerEvent) => void)(e)
    }
  }

  function handlePointerUp(e: React.PointerEvent) {
    if (!pointerDownPos.current) return
    const dx = e.clientX - pointerDownPos.current.x
    const dy = e.clientY - pointerDownPos.current.y
    if (Math.sqrt(dx * dx + dy * dy) < 5) {
      onBlockClick?.(block)
    }
    pointerDownPos.current = null
  }

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      className={`schedule-block${isDone ? ' schedule-block--done' : ''}${isDragging && isCollision ? ' schedule-block--forbidden' : ''}`}
      style={style}
    >
      {block.task_id && (
        <input
          type="checkbox"
          className="block-checkbox"
          checked={isDone}
          onChange={e => { e.stopPropagation(); onMarkDone(block.task_id!) }}
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
