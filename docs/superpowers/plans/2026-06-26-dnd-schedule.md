# Drag-and-Drop Schedule Rescheduling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users drag task blocks on the day TimeGrid to reschedule them, snapping to 5-minute slots, with real-time collision feedback and DB persistence.

**Architecture:** `DndContext` (from @dnd-kit/core) lives inside `TimeGrid.tsx` and tracks drag state (snapped position + collision flag) via `onDragMove`. Each `ScheduleBlock` uses `useDraggable` and receives `dragDeltaY` / `isCollision` props to render the lifted/forbidden visual. On `dragEnd`, `Dashboard.tsx` receives the new times via an `onBlockMove` callback, optimistically updates local state, and persists to Supabase. Break block logic is removed across the app as part of this work.

**Tech Stack:** React 19, TypeScript, @dnd-kit/core, Supabase JS client, Deno edge function

## Global Constraints

- All CSS must use logical properties (`margin-inline-start`, `inset-inline-start`), never `left`/`right`
- No tests exist — visual validation in browser is the verification step
- Query helpers live only in `src/lib/queries/`; components never call Supabase directly
- `minutesToTimeStr(n)` returns `"HH:MM:SS"` — use it for all time strings written to DB
- `timeStrToMinutes(t)` handles both `"HH:MM"` and `"HH:MM:SS"`
- `PX_PER_MIN = 1.5` — the single source of truth for Y-position math (defined in both `TimeGrid.tsx` and `ScheduleBlock.tsx`)
- No AI-looking UI; no rounded-2xl / gradient blobs / default blue palette

---

### Task 1: Install @dnd-kit/core and add query helpers

**Files:**
- Modify: `src/lib/queries/schedule.ts` — add `updateScheduleBlock`
- Modify: `src/lib/queries/tasks.ts` — add `updateTaskFixedStart`

**Interfaces:**
- Produces:
  - `updateScheduleBlock(id: string, start_time: string, end_time: string): Promise<void>`
  - `updateTaskFixedStart(id: string, fixed_start: string): Promise<void>`

- [ ] **Step 1: Install @dnd-kit/core**

```bash
cd /Users/adinizri/projects/smarttime && npm install @dnd-kit/core
```

Expected: package added to `node_modules` and `package.json` dependencies.

- [ ] **Step 2: Add `updateScheduleBlock` to `src/lib/queries/schedule.ts`**

Append to the end of the file:

```ts
export async function updateScheduleBlock(
  id: string,
  start_time: string,
  end_time: string,
): Promise<void> {
  const { error } = await supabase
    .from('schedule_blocks')
    .update({ start_time, end_time })
    .eq('id', id)
  if (error) throw error
}
```

- [ ] **Step 3: Add `updateTaskFixedStart` to `src/lib/queries/tasks.ts`**

Append to the end of the file:

```ts
export async function updateTaskFixedStart(
  id: string,
  fixed_start: string,
): Promise<void> {
  const { error } = await supabase
    .from('tasks')
    .update({ fixed_start })
    .eq('id', id)
  if (error) throw error
}
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/queries/schedule.ts src/lib/queries/tasks.ts package.json package-lock.json
git commit -m "feat: install @dnd-kit/core; add updateScheduleBlock and updateTaskFixedStart queries"
```

---

### Task 2: Remove break block logic

**Files:**
- Modify: `src/components/ScheduleBlock.tsx`
- Modify: `src/components/TimeGrid.tsx`
- Modify: `src/components/UpcomingPanel.tsx`
- Modify: `src/components/WeekView.tsx`
- Modify: `src/App.css`
- Modify: `supabase/functions/generate-schedule/index.ts`

**Interfaces:**
- Consumes: nothing new
- Produces: every component now treats all blocks as task blocks; edge function never inserts `block_type: 'break'`

- [ ] **Step 1: Simplify `src/components/ScheduleBlock.tsx`**

Replace the entire file content:

```tsx
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
```

- [ ] **Step 2: Add break filter to `src/components/TimeGrid.tsx`**

In the `blocks.map(...)` call, change:

```tsx
        {blocks.map(block => (
```

to:

```tsx
        {blocks.filter(b => b.block_type !== 'break').map(block => (
```

- [ ] **Step 3: Remove break class from `src/components/UpcomingPanel.tsx`**

Find and replace (line ~31):

```tsx
            className={`upcoming-item${block.block_type === 'break' ? ' upcoming-break' : ''}`}
```

with:

```tsx
            className="upcoming-item"
```

- [ ] **Step 4: Remove break logic from `src/components/WeekView.tsx`**

Find and replace (around line 70):

```tsx
                    className={`week-block${block.block_type === 'break' ? ' week-block--break' : ' week-block--task'}`}
```

with:

```tsx
                    className="week-block week-block--task"
```

Find and remove the wrapping condition around the week block title (around line 74) — change from:

```tsx
                    {block.block_type !== 'break' && (
                      <span className="week-block-title">{block.title}</span>
                    )}
```

to:

```tsx
                    <span className="week-block-title">{block.title}</span>
```

- [ ] **Step 5: Remove break CSS from `src/App.css`**

Remove the two CSS custom properties at the top of `:root` (around lines 34–35):

```css
  --block-break-bg: #f0ede8;
  --block-break-border: #c8c3bc;
```

Remove the `.schedule-block--break` rule (around lines 569–573):

```css
.schedule-block--break {
  background: var(--block-break-bg);
  border: 1px dashed var(--block-break-border);
  color: var(--muted);
}
```

Remove `.schedule-block--task` rule if it exists as a separate selector (it sets `background` and `border-inline-start`). The base `.schedule-block` style should absorb these — verify the block still has a background color after deletion. If `.schedule-block--task` held the background, move those declarations into `.schedule-block` directly.

Remove the `.week-block--break` rule (around line 1014):

```css
.week-block--break { background: var(--border); }
```

Remove the `.upcoming-break` rule (around line 640):

```css
.upcoming-break { color: var(--muted-light); }
```

- [ ] **Step 6: Remove `'break'` from edge function response schema**

In `supabase/functions/generate-schedule/index.ts`, find the `responseSchema` definition (around line 97) and change:

```ts
              block_type: { type: 'string', enum: ['task', 'break'] },
```

to:

```ts
              block_type: { type: 'string', enum: ['task'] },
```

- [ ] **Step 7: Verify visually**

Run `npm run dev` and open the dashboard. Confirm blocks still render and the app doesn't crash. Check browser console for errors.

- [ ] **Step 8: Commit and deploy edge function**

```bash
git add src/components/ScheduleBlock.tsx src/components/TimeGrid.tsx src/components/UpcomingPanel.tsx src/components/WeekView.tsx src/App.css supabase/functions/generate-schedule/index.ts
git commit -m "refactor: remove break block logic from UI and edge function"
supabase functions deploy generate-schedule
```

---

### Task 3: Wire DnD into ScheduleBlock and TimeGrid

**Files:**
- Modify: `src/components/ScheduleBlock.tsx`
- Modify: `src/components/TimeGrid.tsx`

**Interfaces:**
- Consumes: `updateScheduleBlock`, `updateTaskFixedStart` (used in Task 4, not here)
- Produces:
  - `TimeGrid` new prop: `onBlockMove: (blockId: string, newStart: string, newEnd: string) => Promise<void>`
  - `ScheduleBlockView` new props: `dragDeltaY?: number`, `isCollision?: boolean`

- [ ] **Step 1: Update `src/components/ScheduleBlock.tsx` to be draggable**

Replace the entire file:

```tsx
import { useDraggable } from '@dnd-kit/core'
import type { ScheduleBlock } from '../lib/types'
import { timeStrToMinutes, formatTimeRange } from '../lib/timeUtils'

const PX_PER_MIN = 1.5

type Props = {
  block: ScheduleBlock
  dayStartMin: number
  onMarkDone: (taskId: string) => void
  isDone: boolean
  dragDeltaY?: number
  isCollision?: boolean
}

export default function ScheduleBlockView({
  block, dayStartMin, onMarkDone, isDone, dragDeltaY, isCollision,
}: Props) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: block.id,
    data: { block },
  })

  const startMin = timeStrToMinutes(block.start_time)
  const endMin = timeStrToMinutes(block.end_time)
  const top = (startMin - dayStartMin) * PX_PER_MIN
  const height = Math.max((endMin - startMin) * PX_PER_MIN, 24)

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

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
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
```

- [ ] **Step 2: Update `src/components/TimeGrid.tsx` to host DnD context**

Replace the entire file:

```tsx
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
    if (!block || !dragState || dragState.isCollision) {
      setDragState(null)
      return
    }

    const startMin = timeStrToMinutes(block.start_time)
    const endMin = timeStrToMinutes(block.end_time)
    const duration = endMin - startMin

    const state = computeDragState(active.id as string, block, delta.y)
    if (state.isCollision || state.snappedMin === startMin) {
      setDragState(null)
      return
    }

    const newStart = minutesToTimeStr(state.snappedMin)
    const newEnd = minutesToTimeStr(state.snappedMin + duration)
    setDragState(null)
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
```

- [ ] **Step 3: Add forbidden block CSS to `src/App.css`**

Add after `.schedule-block--done` rule:

```css
:root {
  --block-forbidden: #c0392b;
}

.schedule-block--forbidden {
  background: var(--block-forbidden) !important;
  color: #fff;
}
```

- [ ] **Step 4: Commit**

```bash
git add src/components/ScheduleBlock.tsx src/components/TimeGrid.tsx src/App.css
git commit -m "feat: wire @dnd-kit DnD into TimeGrid and ScheduleBlock with snapping and collision detection"
```

---

### Task 4: Add onBlockMove handler in Dashboard and wire persistence

**Files:**
- Modify: `src/pages/Dashboard.tsx`

**Interfaces:**
- Consumes:
  - `updateScheduleBlock(id: string, start_time: string, end_time: string): Promise<void>` from `src/lib/queries/schedule.ts`
  - `updateTaskFixedStart(id: string, fixed_start: string): Promise<void>` from `src/lib/queries/tasks.ts`
  - `pendingTasks: Task[]` — already in Dashboard state; used to check if a dragged task has `fixed_start`
- Produces: `onBlockMove` prop passed to `TimeGrid`

- [ ] **Step 1: Import new query helpers in `src/pages/Dashboard.tsx`**

Find the existing import line:

```ts
import { fetchBlocksForDate, fetchBlocksForRange, generateSchedule } from '../lib/queries/schedule'
```

Change to:

```ts
import { fetchBlocksForDate, fetchBlocksForRange, generateSchedule, updateScheduleBlock } from '../lib/queries/schedule'
```

Find the existing import line:

```ts
import { markTaskDone, markTaskPending, fetchPendingTasksForDate } from '../lib/queries/tasks'
```

Change to:

```ts
import { markTaskDone, markTaskPending, fetchPendingTasksForDate, updateTaskFixedStart } from '../lib/queries/tasks'
```

- [ ] **Step 2: Add `handleBlockMove` function to Dashboard**

Add this function after `handleToggleDone` (around line 130):

```ts
  async function handleBlockMove(blockId: string, newStart: string, newEnd: string) {
    const prevBlocks = blocks
    setBlocks(prev => prev.map(b => b.id === blockId
      ? { ...b, start_time: newStart, end_time: newEnd }
      : b
    ))
    try {
      await updateScheduleBlock(blockId, newStart, newEnd)
      const movedBlock = prevBlocks.find(b => b.id === blockId)
      if (movedBlock?.task_id) {
        const task = pendingTasks.find(t => t.id === movedBlock.task_id)
        if (task?.fixed_start != null) {
          await updateTaskFixedStart(movedBlock.task_id, newStart)
        }
      }
    } catch {
      setBlocks(prevBlocks)
      setError('שגיאה בעדכון לוח הזמנים')
    }
  }
```

- [ ] **Step 3: Pass `onBlockMove` to `TimeGrid` in the JSX**

Find:

```tsx
          <TimeGrid
            blocks={dayBlocks}
            dayStart={dayStart}
            dayEnd={dayEnd}
            doneTaskIds={doneTaskIds}
            onMarkDone={handleToggleDone}
          />
```

Replace with:

```tsx
          <TimeGrid
            blocks={dayBlocks}
            dayStart={dayStart}
            dayEnd={dayEnd}
            doneTaskIds={doneTaskIds}
            onMarkDone={handleToggleDone}
            onBlockMove={handleBlockMove}
          />
```

- [ ] **Step 4: Build to verify no TypeScript errors**

```bash
npm run build
```

Expected: build completes with no errors.

- [ ] **Step 5: Verify visually**

Run `npm run dev`, open the dashboard, build a schedule, then:
1. Drag a block to a free slot — it should snap to 5-minute increments, show a lifted appearance, and persist after drop (survive page refresh).
2. Drag a block over another block — it should show red tint while overlapping; on release, it snaps back.
3. Drag a block to the edge of the day window — it should clamp and not go out of bounds.
4. Click a checkbox — it should not accidentally start a drag.

- [ ] **Step 6: Commit**

```bash
git add src/pages/Dashboard.tsx
git commit -m "feat: persist block moves to DB; update fixed_start when task has one"
```
