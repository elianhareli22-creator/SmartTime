import { useEffect, useState } from 'react'
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragMoveEvent,
  type DragEndEvent,
} from '@dnd-kit/core'
import type { ScheduleBlock } from '../lib/types'
import { timeStrToMinutes, minutesToTimeStr, nowMinutes } from '../lib/timeUtils'
import ScheduleBlockView from './ScheduleBlock'

const PX_PER_MIN = 1.5

type DragState = {
  id: string
  snappedMin: number
  snappedDeltaY: number
  isCollision: boolean
}

type Props = {
  blocks: ScheduleBlock[]
  dayStart: string
  dayEnd: string
  doneTaskIds: Set<string>
  onMarkDone: (taskId: string) => void
  onBlockMove: (blockId: string, newStart: string, newEnd: string) => Promise<void>
}

export default function TimeGrid({ blocks, dayStart, dayEnd, doneTaskIds, onMarkDone, onBlockMove }: Props) {
  const dayStartMin = timeStrToMinutes(dayStart)
  const dayEndMin = timeStrToMinutes(dayEnd)
  const totalHeight = (dayEndMin - dayStartMin) * PX_PER_MIN

  const [nowMin, setNowMin] = useState(nowMinutes())
  const [dragState, setDragState] = useState<DragState | null>(null)

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

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  )

  function computeDragState(activeId: string, block: ScheduleBlock, deltaY: number): DragState {
    const startMin = timeStrToMinutes(block.start_time)
    const endMin = timeStrToMinutes(block.end_time)
    const duration = endMin - startMin

    const rawMin = startMin + deltaY / PX_PER_MIN
    const snappedMin = Math.round(rawMin / 5) * 5
    const clampedMin = Math.min(Math.max(snappedMin, dayStartMin), dayEndMin - duration)
    const clampedEnd = clampedMin + duration

    const isCollision = blocks
      .filter(b => b.id !== activeId && b.block_type !== 'break')
      .some(b => {
        const bStart = timeStrToMinutes(b.start_time)
        const bEnd = timeStrToMinutes(b.end_time)
        return clampedMin < bEnd && clampedEnd > bStart
      })

    return {
      id: activeId,
      snappedMin: clampedMin,
      snappedDeltaY: (clampedMin - startMin) * PX_PER_MIN,
      isCollision,
    }
  }

  function handleDragMove({ active, delta }: DragMoveEvent) {
    const block = active.data.current?.block as ScheduleBlock | undefined
    if (!block) return
    setDragState(computeDragState(active.id as string, block, delta.y))
  }

  async function handleDragEnd({ active, delta }: DragEndEvent) {
    const block = active.data.current?.block as ScheduleBlock | undefined
    if (!block) { setDragState(null); return }

    const state = computeDragState(active.id as string, block, delta.y)
    const startMin = timeStrToMinutes(block.start_time)
    const endMin = timeStrToMinutes(block.end_time)
    const duration = endMin - startMin

    setDragState(null)

    if (state.isCollision || state.snappedMin === startMin) return

    const newStart = minutesToTimeStr(state.snappedMin)
    const newEnd = minutesToTimeStr(state.snappedMin + duration)
    await onBlockMove(block.id, newStart, newEnd)
  }

  const taskBlocks = blocks.filter(b => b.block_type !== 'break')

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
      <DndContext sensors={sensors} onDragMove={handleDragMove} onDragEnd={handleDragEnd}>
        <div className="blocks-col" style={{ height: `${totalHeight}px` }}>
          {showNow && (
            <div className="now-line" style={{ top: `${nowTop}px` }}>
              <span className="now-label">עכשיו</span>
            </div>
          )}
          {taskBlocks.map(block => (
            <ScheduleBlockView
              key={block.id}
              block={block}
              dayStartMin={dayStartMin}
              onMarkDone={onMarkDone}
              isDone={block.task_id ? doneTaskIds.has(block.task_id) : false}
              dragDeltaY={dragState?.id === block.id ? dragState.snappedDeltaY : undefined}
              isCollision={dragState?.id === block.id ? dragState.isCollision : undefined}
            />
          ))}
          {taskBlocks.length === 0 && (
            <div className="grid-empty">לחץ על ״בנה את היום שלי״ כדי לקבל לוח זמנים</div>
          )}
        </div>
      </DndContext>
    </div>
  )
}
