# Drag-and-Drop Schedule Rescheduling

**Date:** 2026-06-26  
**Branch:** feat/multi-date-tasks-and-chat  
**Status:** Approved

## Summary

Allow users to drag task blocks on the TimeGrid to reschedule them. Drops are only accepted at collision-free positions. The new time persists to the database. Break block logic is removed as part of this work.

---

## Section 1: Architecture

### What changes

| Area | Change |
|---|---|
| `ScheduleBlock.tsx` | Becomes draggable via `useDraggable`; break logic removed |
| `TimeGrid.tsx` | Wraps `blocks-col` in `DndContext` + `useDroppable`; passes `onBlockMove` callback |
| `Dashboard.tsx` | Adds `onBlockMove(blockId, newStart, newEnd)` handler; calls query helpers + updates local state |
| `src/lib/queries/schedule.ts` | New `updateScheduleBlock(id, start_time, end_time)` |
| `src/lib/queries/tasks.ts` | New `updateTaskFixedStart(id, fixed_start)` |
| `App.css` | Break block styles removed; unified block style |
| `generate-schedule` edge function | Break block generation removed from prompt + repair logic |

### New dependency

`@dnd-kit/core` — the standard React DnD library. Used for `DndContext`, `useDraggable`, `useDroppable`. No sortable preset; we use raw drag delta + our own Y-coordinate math.

### DnD context placement

`DndContext` lives inside `TimeGrid.tsx`, wrapping the `blocks-col` div. `Dashboard.tsx` owns `blocks` state and passes `onBlockMove` down. This keeps DnD scoped to the day grid and leaves Dashboard as the single source of truth for block data.

---

## Section 2: Drag Interaction

### Snapping

Snapped to 5-minute boundaries in real time:

```
snappedMin = Math.round((originalStartMin + deltaY / PX_PER_MIN) / 5) * 5
```

Block is clamped to `[dayStartMin, dayEndMin - duration]` — cannot drag outside the day window.

### Duration preservation

Only start/end shift by the same delta. Block duration is never changed by dragging.

### Visual state while dragging

| State | Appearance |
|---|---|
| Lifted (no collision) | Reduced opacity + subtle box-shadow |
| Forbidden (would collide) | Red tint + `cursor: not-allowed` |

Real-time collision check on every snap position change during drag.

### On drop

| Outcome | Action |
|---|---|
| Position is clear | Optimistic local update → persist to DB |
| Position collides | Block animates back to original position; no DB call |
| DB call fails | Revert local state; show error banner |

---

## Section 3: Data Layer

### New query: `updateScheduleBlock`

```ts
// src/lib/queries/schedule.ts
export async function updateScheduleBlock(
  id: string,
  start_time: string,
  end_time: string,
): Promise<void>
```

Updates `start_time` and `end_time` on the matching `schedule_blocks` row.

### New query: `updateTaskFixedStart`

```ts
// src/lib/queries/tasks.ts
export async function updateTaskFixedStart(
  id: string,
  fixed_start: string,
): Promise<void>
```

Called only when the dragged block has a `task_id` and the corresponding task has a non-null `fixed_start`. Dashboard already holds `pendingTasks` so the check is local — no extra fetch needed.

### Drop persist sequence

1. Optimistic `setBlocks(...)` update
2. `updateScheduleBlock(block.id, newStart, newEnd)`
3. If `block.task_id` and task has `fixed_start` → `updateTaskFixedStart(block.task_id, newStart)`
4. On any error → revert `setBlocks` + set error banner

---

## Section 4: Break Block Removal

Break blocks are removed entirely from UI and generation. No DB migration needed — `block_type` column keeps its check constraint; we simply stop inserting `'break'` values.

### Files to clean up

| File | Change |
|---|---|
| `ScheduleBlock.tsx` | Remove `isBreak` branch; remove `schedule-block--break` class usage |
| `App.css` | Remove `.schedule-block--break` rule; unify into single `.schedule-block` style |
| `generate-schedule/index.ts` | Remove break generation from AI prompt; remove break entries from `repairBlocks` and `buildDeterministicSchedule` |

Old break blocks already in the DB are filtered out explicitly in `TimeGrid.tsx` with `.filter(b => b.block_type !== 'break')` so they never reach the render loop.

---

## Collision Detection Rule

Two blocks collide when their time intervals overlap:

```
newStart < otherEnd && newEnd > otherStart
```

Applied against all blocks except the one being dragged.
