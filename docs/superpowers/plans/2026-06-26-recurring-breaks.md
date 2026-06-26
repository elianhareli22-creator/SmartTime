# Recurring Breaks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add recurring break templates that the AI scheduler and repair pass respect, visible as pinned break blocks in the TimeGrid with a delete-from-today modal, managed from the Profile page.

**Architecture:** A new `break_templates` table stores recurring time windows; the edge function fetches applicable ones each run, injects them as constraints into Gemini's prompt and as pre-seeded blocks into `repairBlocks`; the frontend renders them with a distinct style, lets users delete instances via a popover modal, and manages templates in the Profile page.

**Tech Stack:** React 19 + TypeScript, Supabase Postgres + RLS, Deno edge functions, CSS custom properties (RTL-first, no new libraries).

## Global Constraints

- All CSS must use logical properties (`margin-inline-start`, `padding-inline-end`, `inset-inline-start`) — never `left`/`right`
- No AI-looking UI — use existing palette variables (`--ink`, `--paper`, `--surface`, `--border`, `--accent`, `--muted`)
- All user-facing strings in Hebrew
- Every DB query goes through `src/lib/queries/*.ts` — never raw Supabase in components/pages
- Schema changes: migration → apply → `generate_typescript_types` → overwrite `database.types.ts` — all in one commit
- `PX_PER_MIN = 1.5` in TimeGrid — all block positioning is `(minuteOffset * 1.5)px`
- Time strings from DB are always `"HH:MM:SS"`; `timeStrToMinutes()` handles both `"HH:MM"` and `"HH:MM:SS"`

---

## Parallel Execution Plan

```
Wave 1: Task 1 (migration + types)
Wave 2: Task 2 (query helpers) ──┐  both depend on Task 1, independent of each other
         Task 3 (edge function) ──┘
Wave 3: Task 4 (Profile UI) ─────┐  all depend on Task 2, independent of each other
         Task 5 (TimeGrid+Modal) ─┤
         Task 6 (TaskForm warn) ──┘
```

---

## File Map

**New files:**
- `supabase/migrations/20260626100000_add_break_templates.sql`
- `src/lib/queries/breaks.ts`
- `src/components/BreakBlockView.tsx`
- `src/components/BreakModal.tsx`

**Modified files:**
- `src/lib/database.types.ts` — regenerated (never hand-edited)
- `src/lib/types.ts` — add `BreakTemplate` type
- `src/lib/queries/schedule.ts` — add `deleteScheduleBlock`
- `supabase/functions/generate-schedule/index.ts` — breaks injection
- `src/pages/Profile.tsx` — break management section
- `src/components/TimeGrid.tsx` — render breaks, `onBreakDelete` prop
- `src/components/TaskForm.tsx` — conflict warning, `breakTemplates` prop
- `src/pages/Tasks.tsx` — fetch + pass break templates
- `src/pages/Dashboard.tsx` — `handleBreakDelete` handler
- `src/App.css` — break block style, popover, profile section, conflict warning

---

## Task 1: DB Migration + TypeScript Types

**Agent type:** backend-engineer  
**Depends on:** nothing  

**Files:**
- Create: `supabase/migrations/20260626100000_add_break_templates.sql`
- Modify: `src/lib/database.types.ts` (regenerated)
- Modify: `src/lib/types.ts`

**Interfaces:**
- Produces: `BreakTemplate` TypeScript type exported from `src/lib/types.ts`
- Produces: `break_templates` table in Supabase with RLS

---

- [ ] **Step 1: Write the migration file**

Create `supabase/migrations/20260626100000_add_break_templates.sql`:

```sql
CREATE TABLE break_templates (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  title                  text NOT NULL,
  start_time             time NOT NULL,
  end_time               time NOT NULL,
  recurrence_type        text NOT NULL CHECK (recurrence_type IN ('date', 'date_range', 'daily', 'weekly')),
  recurrence_date        date,
  recurrence_date_start  date,
  recurrence_date_end    date,
  recurrence_day_of_week smallint,
  created_at             timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE break_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users own break_templates"
  ON break_templates FOR ALL
  USING (auth.uid() = user_id);
```

- [ ] **Step 2: Apply the migration**

Use the `mcp__supabase__apply_migration` tool with the SQL above (name: `add_break_templates`).

- [ ] **Step 3: Regenerate TypeScript types**

Use `mcp__supabase__generate_typescript_types` tool. Copy the output and overwrite `src/lib/database.types.ts` entirely. The new type will include a `break_templates` table entry.

- [ ] **Step 4: Add `BreakTemplate` to `src/lib/types.ts`**

Append after the `ChatMessage` type:

```ts
export type BreakTemplate = {
  id: string
  user_id: string
  title: string
  start_time: string              // "HH:MM:SS"
  end_time: string                // "HH:MM:SS"
  recurrence_type: 'date' | 'date_range' | 'daily' | 'weekly'
  recurrence_date: string | null          // "YYYY-MM-DD"
  recurrence_date_start: string | null    // "YYYY-MM-DD"
  recurrence_date_end: string | null      // "YYYY-MM-DD"
  recurrence_day_of_week: number | null   // 0=Sun…6=Sat
  created_at: string
}
```

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260626100000_add_break_templates.sql \
        src/lib/database.types.ts \
        src/lib/types.ts
git commit -m "feat: add break_templates schema and BreakTemplate type"
```

---

## Task 2: Query Helpers

**Agent type:** general-purpose  
**Depends on:** Task 1 (needs `break_templates` table + `BreakTemplate` type)  
**Parallel with:** Task 3  

**Files:**
- Create: `src/lib/queries/breaks.ts`
- Modify: `src/lib/queries/schedule.ts`

**Interfaces:**
- Produces: `getBreakTemplates(userId: string): Promise<BreakTemplate[]>`
- Produces: `createBreakTemplate(userId, input): Promise<BreakTemplate>`
- Produces: `updateBreakTemplate(id, input): Promise<BreakTemplate>`
- Produces: `deleteBreakTemplate(id: string): Promise<void>`
- Produces: `deleteScheduleBlock(id: string): Promise<void>` (added to schedule.ts)

---

- [ ] **Step 1: Create `src/lib/queries/breaks.ts`**

```ts
import { supabase } from '../supabase'
import type { BreakTemplate } from '../types'

export async function getBreakTemplates(userId: string): Promise<BreakTemplate[]> {
  const { data, error } = await supabase
    .from('break_templates')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return data as BreakTemplate[]
}

export async function createBreakTemplate(
  userId: string,
  input: Omit<BreakTemplate, 'id' | 'user_id' | 'created_at'>,
): Promise<BreakTemplate> {
  const { data, error } = await supabase
    .from('break_templates')
    .insert({ ...input, user_id: userId })
    .select()
    .single()
  if (error) throw error
  return data as BreakTemplate
}

export async function updateBreakTemplate(
  id: string,
  input: Partial<Omit<BreakTemplate, 'id' | 'user_id' | 'created_at'>>,
): Promise<BreakTemplate> {
  const { data, error } = await supabase
    .from('break_templates')
    .update(input)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data as BreakTemplate
}

export async function deleteBreakTemplate(id: string): Promise<void> {
  const { error } = await supabase.from('break_templates').delete().eq('id', id)
  if (error) throw error
}
```

- [ ] **Step 2: Add `deleteScheduleBlock` to `src/lib/queries/schedule.ts`**

Append at the end of `src/lib/queries/schedule.ts`:

```ts
export async function deleteScheduleBlock(id: string): Promise<void> {
  const { error } = await supabase.from('schedule_blocks').delete().eq('id', id)
  if (error) throw error
}
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/queries/breaks.ts src/lib/queries/schedule.ts
git commit -m "feat: add break_templates query helpers and deleteScheduleBlock"
```

---

## Task 3: Edge Function — Break Injection

**Agent type:** backend-engineer  
**Depends on:** Task 1 (table exists)  
**Parallel with:** Task 2  

**Files:**
- Modify: `supabase/functions/generate-schedule/index.ts`

**Interfaces:**
- Consumes: `break_templates` table (Supabase service role client)
- Produces: edge function that inserts `block_type: 'break'` blocks alongside task blocks, instructs Gemini to avoid break windows, and repairs tasks around break windows

---

- [ ] **Step 1: Replace the full `supabase/functions/generate-schedule/index.ts`**

The complete updated file:

```ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response('Unauthorized', { status: 401, headers: corsHeaders })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    )
    if (authError || !user) {
      return new Response('Unauthorized', { status: 401, headers: corsHeaders })
    }

    const userId = user.id

    let today = new Date().toISOString().split('T')[0]
    try {
      const body = await req.json()
      if (body?.date && /^\d{4}-\d{2}-\d{2}$/.test(body.date)) {
        today = body.date
      }
    } catch { /* no body — use today */ }

    const [
      { data: tasks, error: tasksError },
      { data: profile, error: profileError },
      { data: allBreakTemplates, error: breaksError },
    ] = await Promise.all([
      supabase.from('tasks').select('*').eq('user_id', userId).eq('status', 'pending').eq('scheduled_date', today),
      supabase.from('profiles').select('*').eq('id', userId).single(),
      supabase.from('break_templates').select('*').eq('user_id', userId),
    ])

    if (tasksError) throw tasksError
    if (profileError) throw profileError
    if (breaksError) throw breaksError

    const dayStart = profile.day_start.slice(0, 5)
    const dayEnd = profile.day_end.slice(0, 5)

    const applicableBreaks = getApplicableBreaks(allBreakTemplates ?? [], today)
    const breakBlocks: AiBlock[] = applicableBreaks.map((b) => ({
      task_id: null,
      title: b.title,
      start_time: b.start_time.slice(0, 5),
      end_time: b.end_time.slice(0, 5),
      block_type: 'break' as const,
    }))

    if ((!tasks || tasks.length === 0) && breakBlocks.length === 0) {
      await supabase.from('schedule_blocks').delete().eq('user_id', userId).eq('date', today)
      return new Response(JSON.stringify({ blocks: [], unscheduled: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const taskList = (tasks ?? []).map((t: Record<string, unknown>) => ({
      id: t.id,
      title: t.title,
      estimated_minutes: t.estimated_minutes,
      priority: t.priority,
      deadline: t.deadline,
      fixed_start: t.fixed_start ? (t.fixed_start as string).slice(0, 5) : null,
    }))

    const reservedStr = breakBlocks.length > 0
      ? `\nReserved break windows (do NOT place any task here): ${JSON.stringify(
          breakBlocks.map((b) => ({ title: b.title, start: b.start_time, end: b.end_time }))
        )}`
      : ''

    const prompt = `You are a schedule optimizer. Arrange these tasks into a time-blocked day.

Day window: ${dayStart}–${dayEnd}
Tasks: ${JSON.stringify(taskList)}${reservedStr}

Rules:
- Place high-priority and deadline-bound tasks earlier in the day
- Tasks with fixed_start MUST start at exactly that time (block_type "task")
- Do NOT add breaks — schedule tasks back-to-back. Every block must be block_type "task"
- Do NOT place any task during the reserved break windows listed above
- Every block must fit within ${dayStart}–${dayEnd}
- Return ONLY a JSON object with a "blocks" array`

    const geminiKey = Deno.env.get('GEMINI_API_KEY')!
    const geminiUrl =
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${geminiKey}`

    const responseSchema = {
      type: 'object',
      properties: {
        blocks: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              task_id: { type: 'string', nullable: true },
              title: { type: 'string' },
              start_time: { type: 'string' },
              end_time: { type: 'string' },
              block_type: { type: 'string', enum: ['task'] },
            },
            required: ['task_id', 'title', 'start_time', 'end_time', 'block_type'],
          },
        },
      },
      required: ['blocks'],
    }

    let aiBlocks: AiBlock[] | null = null

    if (tasks && tasks.length > 0) {
      for (let attempt = 0; attempt < 2; attempt++) {
        const attemptPrompt = attempt === 1
          ? prompt + '\n\nIMPORTANT: Output raw JSON only — no markdown, no code fences.'
          : prompt

        try {
          const res = await fetch(geminiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: attemptPrompt }] }],
              generationConfig: { responseMimeType: 'application/json', responseSchema },
            }),
          })

          if (res.ok) {
            const json = await res.json()
            const text = json?.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
            const parsed = JSON.parse(text)
            if (Array.isArray(parsed?.blocks)) {
              aiBlocks = parsed.blocks
              break
            }
          }
        } catch {
          // retry on next attempt
        }
      }

      if (!aiBlocks) {
        aiBlocks = buildDeterministicSchedule(tasks, dayStart, dayEnd, breakBlocks)
      }
    } else {
      aiBlocks = []
    }

    const repairedBlocks = repairBlocks(aiBlocks, tasks ?? [], dayStart, dayEnd, breakBlocks)

    await supabase.from('schedule_blocks').delete().eq('user_id', userId).eq('date', today)

    const toInsert = repairedBlocks.map((b) => ({
      user_id: userId,
      task_id: b.task_id ?? null,
      date: today,
      start_time: b.start_time,
      end_time: b.end_time,
      block_type: b.block_type,
      title: b.title,
    }))

    const { data: inserted, error: insertError } = await supabase
      .from('schedule_blocks')
      .insert(toInsert)
      .select()

    if (insertError) throw insertError

    const scheduledTaskIds = new Set(repairedBlocks.map((b) => b.task_id).filter(Boolean))
    const unscheduled = (tasks ?? [])
      .filter((t: Record<string, unknown>) => !scheduledTaskIds.has(t.id as string))
      .map((t: Record<string, unknown>) => ({
        id: t.id as string,
        title: t.title as string,
        estimated_minutes: t.estimated_minutes as number,
      }))

    return new Response(JSON.stringify({ blocks: inserted, unscheduled }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error(err)
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

type BreakTemplateRow = {
  recurrence_type: string
  recurrence_date: string | null
  recurrence_date_start: string | null
  recurrence_date_end: string | null
  recurrence_day_of_week: number | null
  title: string
  start_time: string
  end_time: string
}

function getApplicableBreaks(templates: BreakTemplateRow[], date: string): BreakTemplateRow[] {
  const d = new Date(date + 'T12:00:00Z')
  const dow = d.getUTCDay()
  return templates.filter((t) => {
    switch (t.recurrence_type) {
      case 'daily': return true
      case 'weekly': return t.recurrence_day_of_week === dow
      case 'date': return t.recurrence_date === date
      case 'date_range':
        return !!t.recurrence_date_start && !!t.recurrence_date_end &&
          t.recurrence_date_start <= date && date <= t.recurrence_date_end
      default: return false
    }
  })
}

type AiBlock = {
  task_id: string | null
  title: string
  start_time: string
  end_time: string
  block_type: 'task' | 'break'
}

function timeToMinutes(t: string): number {
  const parts = t.split(':')
  return parseInt(parts[0]) * 60 + parseInt(parts[1])
}

function minutesToTime(m: number): string {
  const h = Math.floor(m / 60)
  const min = m % 60
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`
}

function nextSafeStart(
  startMin: number,
  breaks: AiBlock[],
  duration: number,
  dayEndMin: number,
): number | null {
  let s = startMin
  for (let i = 0; i <= breaks.length; i++) {
    const e = s + duration
    if (e > dayEndMin) return null
    const conflict = breaks.find((b) => {
      const bs = timeToMinutes(b.start_time)
      const be = timeToMinutes(b.end_time)
      return s < be && e > bs
    })
    if (!conflict) return s
    s = timeToMinutes(conflict.end_time)
  }
  return null
}

function repairBlocks(
  aiBlocks: AiBlock[],
  tasks: Record<string, unknown>[],
  dayStart: string,
  dayEnd: string,
  breakBlocks: AiBlock[],
): AiBlock[] {
  const dayStartMin = timeToMinutes(dayStart)
  const dayEndMin = timeToMinutes(dayEnd)
  const taskMap = new Map(tasks.map((t) => [t.id as string, t]))

  const validBreaks = breakBlocks
    .filter((b) => timeToMinutes(b.start_time) >= dayStartMin && timeToMinutes(b.end_time) <= dayEndMin)
    .sort((a, b) => timeToMinutes(a.start_time) - timeToMinutes(b.start_time))

  const fixedPinned: AiBlock[] = tasks
    .filter((t) => t.fixed_start)
    .map((t) => ({
      task_id: t.id as string,
      title: t.title as string,
      start_time: (t.fixed_start as string).slice(0, 5),
      end_time: minutesToTime(
        timeToMinutes((t.fixed_start as string).slice(0, 5)) + (t.estimated_minutes as number)
      ),
      block_type: 'task' as const,
    }))

  const nonFixed = aiBlocks.filter((b) => {
    if (b.task_id && taskMap.get(b.task_id)?.fixed_start) return false
    const s = timeToMinutes(b.start_time)
    const e = timeToMinutes(b.end_time)
    return s >= dayStartMin && e <= dayEndMin && s < e
  })

  const tasksToPack = [...fixedPinned, ...nonFixed].sort(
    (a, b) => timeToMinutes(a.start_time) - timeToMinutes(b.start_time)
  )

  const packed: AiBlock[] = [...validBreaks]
  let cursor = dayStartMin

  for (const block of tasksToPack) {
    const rawStart = Math.max(timeToMinutes(block.start_time), cursor)
    const duration = timeToMinutes(block.end_time) - timeToMinutes(block.start_time)
    const safe = nextSafeStart(rawStart, validBreaks, duration, dayEndMin)
    if (safe === null) continue
    packed.push({ ...block, start_time: minutesToTime(safe), end_time: minutesToTime(safe + duration) })
    cursor = safe + duration
  }

  const placedIds = new Set(packed.filter((b) => b.task_id).map((b) => b.task_id))
  for (const task of tasks) {
    if (placedIds.has(task.id as string)) continue
    const safe = nextSafeStart(cursor, validBreaks, task.estimated_minutes as number, dayEndMin)
    if (safe === null) continue
    const e = safe + (task.estimated_minutes as number)
    packed.push({
      task_id: task.id as string,
      title: task.title as string,
      start_time: minutesToTime(safe),
      end_time: minutesToTime(e),
      block_type: 'task',
    })
    cursor = e
  }

  return packed
}

function buildDeterministicSchedule(
  tasks: Record<string, unknown>[],
  dayStart: string,
  dayEnd: string,
  breakBlocks: AiBlock[],
): AiBlock[] {
  const dayEndMin = timeToMinutes(dayEnd)
  const dayStartMin = timeToMinutes(dayStart)
  const order: Record<string, number> = { high: 0, medium: 1, low: 2 }

  const validBreaks = breakBlocks
    .filter((b) => timeToMinutes(b.start_time) >= dayStartMin && timeToMinutes(b.end_time) <= dayEndMin)
    .sort((a, b) => timeToMinutes(a.start_time) - timeToMinutes(b.start_time))

  const sorted = [...tasks].sort((a, b) => {
    const pa = order[a.priority as string] ?? 1
    const pb = order[b.priority as string] ?? 1
    if (pa !== pb) return pa - pb
    if (a.deadline && b.deadline) return (a.deadline as string).localeCompare(b.deadline as string)
    if (a.deadline) return -1
    if (b.deadline) return 1
    return 0
  })

  const blocks: AiBlock[] = [...validBreaks]
  let cursor = dayStartMin

  for (const task of sorted) {
    const rawStart = task.fixed_start
      ? timeToMinutes((task.fixed_start as string).slice(0, 5))
      : cursor
    const safe = nextSafeStart(rawStart, validBreaks, task.estimated_minutes as number, dayEndMin)
    if (safe === null) continue
    const end = safe + (task.estimated_minutes as number)
    blocks.push({
      task_id: task.id as string,
      title: task.title as string,
      start_time: minutesToTime(safe),
      end_time: minutesToTime(end),
      block_type: 'task',
    })
    cursor = end
  }

  return blocks
}
```

- [ ] **Step 2: Deploy the edge function**

```bash
supabase functions deploy generate-schedule
```

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/generate-schedule/index.ts
git commit -m "feat: inject recurring breaks into schedule generation"
```

---

## Task 4: Profile — Break Management UI

**Agent type:** frontend-engineer  
**Depends on:** Task 2 (query helpers + `BreakTemplate` type)  
**Parallel with:** Tasks 5 and 6  

**Files:**
- Modify: `src/pages/Profile.tsx`
- Modify: `src/App.css`

**Interfaces:**
- Consumes: `getBreakTemplates`, `createBreakTemplate`, `updateBreakTemplate`, `deleteBreakTemplate` from `src/lib/queries/breaks.ts`
- Consumes: `BreakTemplate` from `src/lib/types.ts`

---

- [ ] **Step 1: Add CSS for the breaks section to `src/App.css`**

Append at the end of `src/App.css`:

```css
/* ── Breaks section (Profile) ─────────────────────────── */

.breaks-section {
  margin-block-start: 2rem;
}

.breaks-section h3 {
  font-size: 1rem;
  font-weight: 700;
  margin-block-end: 1rem;
  color: var(--ink);
}

.break-template-list {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.break-template-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.6rem 0;
  border-block-end: 1px solid var(--border);
}

.break-template-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
}

.break-template-title {
  font-weight: 500;
  font-size: 0.9rem;
}

.break-template-meta {
  font-size: 0.78rem;
  color: var(--muted);
}

.break-template-actions {
  display: flex;
  gap: 0.25rem;
}

.btn-icon {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--muted);
  padding: 0.2rem 0.4rem;
  border-radius: var(--radius-sm);
  font-size: 0.85rem;
  line-height: 1;
}

.btn-icon:hover {
  color: var(--ink);
  background: var(--border);
}

.btn-icon--danger:hover {
  color: var(--danger);
  background: #fee2e2;
}

.break-form {
  margin-block-start: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 1rem;
  background: var(--paper);
  border-radius: var(--radius);
  border: 1px solid var(--border);
}

.break-form-row {
  display: flex;
  gap: 0.75rem;
}

.break-form-row .form-field {
  flex: 1;
}

.break-form-actions {
  display: flex;
  gap: 0.5rem;
  margin-block-start: 0.25rem;
}
```

- [ ] **Step 2: Replace `src/pages/Profile.tsx` with the updated version**

```tsx
import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { updateProfile } from '../lib/queries/profile'
import {
  getBreakTemplates,
  createBreakTemplate,
  updateBreakTemplate,
  deleteBreakTemplate,
} from '../lib/queries/breaks'
import type { BreakTemplate } from '../lib/types'

const DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']

function recurrenceLabel(t: BreakTemplate): string {
  switch (t.recurrence_type) {
    case 'daily': return 'כל יום'
    case 'weekly': return `כל ${DAYS[t.recurrence_day_of_week!]}`
    case 'date': return t.recurrence_date!.split('-').reverse().join('/')
    case 'date_range': {
      const fmt = (d: string) => d.split('-').reverse().join('/')
      return `${fmt(t.recurrence_date_start!)} – ${fmt(t.recurrence_date_end!)}`
    }
    default: return ''
  }
}

type BreakFormState = {
  title: string
  start_time: string
  end_time: string
  recurrence_type: 'daily' | 'weekly' | 'date' | 'date_range'
  recurrence_day_of_week: string
  recurrence_date: string
  recurrence_date_start: string
  recurrence_date_end: string
}

const EMPTY_BREAK: BreakFormState = {
  title: '',
  start_time: '',
  end_time: '',
  recurrence_type: 'daily',
  recurrence_day_of_week: '0',
  recurrence_date: '',
  recurrence_date_start: '',
  recurrence_date_end: '',
}

export default function Profile() {
  const { userId, profile, setProfile } = useAuth()
  const [displayName, setDisplayName] = useState('')
  const [dayStart, setDayStart] = useState('08:00')
  const [dayEnd, setDayEnd] = useState('22:00')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [breaks, setBreaks] = useState<BreakTemplate[]>([])
  const [breakForm, setBreakForm] = useState<BreakFormState>(EMPTY_BREAK)
  const [breakFormOpen, setBreakFormOpen] = useState(false)
  const [editBreakId, setEditBreakId] = useState<string | null>(null)
  const [breakSaving, setBreakSaving] = useState(false)
  const [breakError, setBreakError] = useState<string | null>(null)

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.display_name ?? '')
      setDayStart(profile.day_start.slice(0, 5))
      setDayEnd(profile.day_end.slice(0, 5))
    }
  }, [profile])

  useEffect(() => {
    if (!userId) return
    getBreakTemplates(userId).then(setBreaks).catch(() => {})
  }, [userId])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!userId) return
    if (dayStart >= dayEnd) {
      setError('שעת הסיום חייבת להיות אחרי שעת ההתחלה')
      return
    }
    setSaving(true)
    setError(null)
    setSaved(false)
    try {
      const updated = await updateProfile(userId, {
        display_name: displayName.trim() || null,
        day_start: dayStart,
        day_end: dayEnd,
      })
      setProfile(updated)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch {
      setError('שגיאה בשמירת הפרופיל')
    } finally {
      setSaving(false)
    }
  }

  function openAddBreak() {
    setBreakForm(EMPTY_BREAK)
    setEditBreakId(null)
    setBreakFormOpen(true)
    setBreakError(null)
  }

  function openEditBreak(t: BreakTemplate) {
    setBreakForm({
      title: t.title,
      start_time: t.start_time.slice(0, 5),
      end_time: t.end_time.slice(0, 5),
      recurrence_type: t.recurrence_type,
      recurrence_day_of_week: String(t.recurrence_day_of_week ?? 0),
      recurrence_date: t.recurrence_date ?? '',
      recurrence_date_start: t.recurrence_date_start ?? '',
      recurrence_date_end: t.recurrence_date_end ?? '',
    })
    setEditBreakId(t.id)
    setBreakFormOpen(true)
    setBreakError(null)
  }

  async function handleBreakSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!userId) return
    if (!breakForm.title.trim() || !breakForm.start_time || !breakForm.end_time) {
      setBreakError('נדרשים שם, שעת התחלה ושעת סיום')
      return
    }
    if (breakForm.start_time >= breakForm.end_time) {
      setBreakError('שעת הסיום חייבת להיות אחרי שעת ההתחלה')
      return
    }
    setBreakSaving(true)
    setBreakError(null)
    try {
      const input: Omit<BreakTemplate, 'id' | 'user_id' | 'created_at'> = {
        title: breakForm.title.trim(),
        start_time: breakForm.start_time,
        end_time: breakForm.end_time,
        recurrence_type: breakForm.recurrence_type,
        recurrence_date: breakForm.recurrence_type === 'date' ? breakForm.recurrence_date : null,
        recurrence_date_start: breakForm.recurrence_type === 'date_range' ? breakForm.recurrence_date_start : null,
        recurrence_date_end: breakForm.recurrence_type === 'date_range' ? breakForm.recurrence_date_end : null,
        recurrence_day_of_week: breakForm.recurrence_type === 'weekly' ? Number(breakForm.recurrence_day_of_week) : null,
      }
      if (editBreakId) {
        const updated = await updateBreakTemplate(editBreakId, input)
        setBreaks(prev => prev.map(b => b.id === editBreakId ? updated : b))
      } else {
        const created = await createBreakTemplate(userId, input)
        setBreaks(prev => [...prev, created])
      }
      setBreakFormOpen(false)
      setEditBreakId(null)
    } catch {
      setBreakError('שגיאה בשמירת ההפסקה')
    } finally {
      setBreakSaving(false)
    }
  }

  async function handleBreakDelete(id: string) {
    try {
      await deleteBreakTemplate(id)
      setBreaks(prev => prev.filter(b => b.id !== id))
    } catch {
      setBreakError('שגיאה במחיקת ההפסקה')
    }
  }

  if (!profile) return <div className="loading">טוען...</div>

  return (
    <div className="page">
      <h2>הפרופיל שלי</h2>
      {error && <div className="error-banner">{error}</div>}
      {saved && <div className="success-banner">הפרופיל נשמר בהצלחה ✓</div>}
      <form onSubmit={handleSubmit} className="profile-form">
        <div className="form-field">
          <label className="form-label">שם להצגה</label>
          <input
            className="form-input"
            value={displayName}
            onChange={e => setDisplayName(e.target.value)}
            placeholder="השם שלך"
          />
        </div>
        <div className="form-field">
          <label className="form-label">תחילת יום עבודה</label>
          <input
            className="form-input"
            type="time"
            value={dayStart}
            onChange={e => setDayStart(e.target.value)}
          />
        </div>
        <div className="form-field">
          <label className="form-label">סיום יום עבודה</label>
          <input
            className="form-input"
            type="time"
            value={dayEnd}
            onChange={e => setDayEnd(e.target.value)}
          />
        </div>
        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? 'שומר...' : 'שמור'}
        </button>
      </form>

      <div className="breaks-section">
        <h3>הפסקות קבועות</h3>
        {breakError && <div className="error-banner">{breakError}</div>}
        <div className="break-template-list">
          {breaks.map(t => (
            <div key={t.id} className="break-template-row">
              <div className="break-template-info">
                <span className="break-template-title">{t.title}</span>
                <span className="break-template-meta">
                  {t.start_time.slice(0, 5)}–{t.end_time.slice(0, 5)} · {recurrenceLabel(t)}
                </span>
              </div>
              <div className="break-template-actions">
                <button className="btn-icon" onClick={() => openEditBreak(t)} title="ערוך">✎</button>
                <button className="btn-icon btn-icon--danger" onClick={() => handleBreakDelete(t.id)} title="מחק">✕</button>
              </div>
            </div>
          ))}
        </div>
        {!breakFormOpen && (
          <button className="btn-secondary" style={{ marginBlockStart: '0.75rem' }} onClick={openAddBreak}>
            + הוסף הפסקה
          </button>
        )}
        {breakFormOpen && (
          <form onSubmit={handleBreakSubmit} className="break-form">
            <div className="form-field">
              <label className="form-label">שם ההפסקה</label>
              <input
                className="form-input"
                value={breakForm.title}
                onChange={e => setBreakForm(f => ({ ...f, title: e.target.value }))}
                placeholder="לדוגמה: הפסקת צהריים"
              />
            </div>
            <div className="break-form-row">
              <div className="form-field">
                <label className="form-label">שעת התחלה</label>
                <input
                  className="form-input"
                  type="time"
                  value={breakForm.start_time}
                  onChange={e => setBreakForm(f => ({ ...f, start_time: e.target.value }))}
                />
              </div>
              <div className="form-field">
                <label className="form-label">שעת סיום</label>
                <input
                  className="form-input"
                  type="time"
                  value={breakForm.end_time}
                  onChange={e => setBreakForm(f => ({ ...f, end_time: e.target.value }))}
                />
              </div>
            </div>
            <div className="form-field">
              <label className="form-label">חזרה</label>
              <select
                className="form-input"
                value={breakForm.recurrence_type}
                onChange={e => setBreakForm(f => ({ ...f, recurrence_type: e.target.value as BreakFormState['recurrence_type'] }))}
              >
                <option value="daily">כל יום</option>
                <option value="weekly">יום בשבוע</option>
                <option value="date">תאריך ספציפי</option>
                <option value="date_range">טווח תאריכים</option>
              </select>
            </div>
            {breakForm.recurrence_type === 'weekly' && (
              <div className="form-field">
                <label className="form-label">יום בשבוע</label>
                <select
                  className="form-input"
                  value={breakForm.recurrence_day_of_week}
                  onChange={e => setBreakForm(f => ({ ...f, recurrence_day_of_week: e.target.value }))}
                >
                  {DAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
                </select>
              </div>
            )}
            {breakForm.recurrence_type === 'date' && (
              <div className="form-field">
                <label className="form-label">תאריך</label>
                <input
                  className="form-input"
                  type="date"
                  value={breakForm.recurrence_date}
                  onChange={e => setBreakForm(f => ({ ...f, recurrence_date: e.target.value }))}
                />
              </div>
            )}
            {breakForm.recurrence_type === 'date_range' && (
              <div className="break-form-row">
                <div className="form-field">
                  <label className="form-label">מתאריך</label>
                  <input
                    className="form-input"
                    type="date"
                    value={breakForm.recurrence_date_start}
                    onChange={e => setBreakForm(f => ({ ...f, recurrence_date_start: e.target.value }))}
                  />
                </div>
                <div className="form-field">
                  <label className="form-label">עד תאריך</label>
                  <input
                    className="form-input"
                    type="date"
                    value={breakForm.recurrence_date_end}
                    onChange={e => setBreakForm(f => ({ ...f, recurrence_date_end: e.target.value }))}
                  />
                </div>
              </div>
            )}
            <div className="break-form-actions">
              <button type="submit" className="btn-primary" disabled={breakSaving}>
                {breakSaving ? 'שומר...' : editBreakId ? 'עדכן' : 'הוסף'}
              </button>
              <button type="button" className="btn-secondary" onClick={() => { setBreakFormOpen(false); setEditBreakId(null) }}>
                ביטול
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Verify in browser**

Navigate to `/profile`. Confirm:
- "הפסקות קבועות" section appears below day window settings
- "הוסף הפסקה" button opens the inline form
- Recurrence type selector shows/hides conditional fields correctly
- Save adds to list; edit populates form; delete removes from list
- Hebrew day names appear in weekly dropdown

- [ ] **Step 4: Commit**

```bash
git add src/pages/Profile.tsx src/App.css
git commit -m "feat: add break template management to Profile page"
```

---

## Task 5: TimeGrid Break Rendering + BreakModal

**Agent type:** frontend-engineer  
**Depends on:** Task 2 (query helpers, `deleteScheduleBlock`)  
**Parallel with:** Tasks 4 and 6  

**Files:**
- Create: `src/components/BreakBlockView.tsx`
- Create: `src/components/BreakModal.tsx`
- Modify: `src/components/TimeGrid.tsx`
- Modify: `src/pages/Dashboard.tsx`
- Modify: `src/App.css`

**Interfaces:**
- Consumes: `deleteScheduleBlock(id: string): Promise<void>` from `src/lib/queries/schedule.ts`
- Consumes: `ScheduleBlock` from `src/lib/types.ts`

---

- [ ] **Step 1: Add CSS for break blocks and the popover to `src/App.css`**

Append at the end of `src/App.css` (after any breaks-section CSS if Task 4 ran first):

```css
/* ── Break blocks ─────────────────────────────────────── */

.schedule-block--break {
  position: absolute;
  background: var(--border);
  border-inline-start: 3px solid var(--muted);
  border-radius: var(--radius-sm);
  display: flex;
  align-items: center;
  padding-inline-start: 0.5rem;
  cursor: pointer;
  user-select: none;
  box-sizing: border-box;
}

.schedule-block--break:hover {
  background: var(--border-strong);
}

.break-block-label {
  font-size: 0.75rem;
  color: var(--muted);
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ── Break popover ────────────────────────────────────── */

.break-popover {
  position: absolute;
  inset-inline-start: 0;
  background: var(--surface);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius);
  padding: 0.75rem 1rem;
  box-shadow: var(--shadow-sm);
  z-index: 200;
  min-width: 180px;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.break-popover-title {
  font-weight: 600;
  font-size: 0.9rem;
  color: var(--ink);
}

.break-popover-time {
  font-size: 0.8rem;
  color: var(--muted);
}

.break-popover-close {
  position: absolute;
  inset-block-start: 0.4rem;
  inset-inline-start: 0.4rem;
  background: none;
  border: none;
  cursor: pointer;
  color: var(--muted);
  font-size: 0.9rem;
  line-height: 1;
  padding: 0.1rem 0.3rem;
}
```

- [ ] **Step 2: Create `src/components/BreakBlockView.tsx`**

```tsx
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
```

- [ ] **Step 3: Create `src/components/BreakModal.tsx`**

```tsx
import type { ScheduleBlock } from '../lib/types'
import { formatTimeRange } from '../lib/timeUtils'

type Props = {
  block: ScheduleBlock
  top: number
  onDelete: (blockId: string) => Promise<void>
  onClose: () => void
}

export default function BreakModal({ block, top, onDelete, onClose }: Props) {
  async function handleDelete() {
    await onDelete(block.id)
    onClose()
  }

  return (
    <div className="break-popover" style={{ top: `${top}px` }}>
      <button className="break-popover-close" onClick={onClose} title="סגור">✕</button>
      <span className="break-popover-title">{block.title}</span>
      <span className="break-popover-time">{formatTimeRange(block.start_time, block.end_time)}</span>
      <button className="btn-secondary" style={{ fontSize: '0.82rem' }} onClick={handleDelete}>
        הסר מהיום
      </button>
    </div>
  )
}
```

- [ ] **Step 4: Update `src/components/TimeGrid.tsx`**

Replace the full file:

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
import BreakBlockView from './BreakBlockView'
import BreakModal from './BreakModal'

const PX_PER_MIN = 1.5

type DragState = {
  id: string
  snappedMin: number
  snappedDeltaY: number
  isCollision: boolean
}

type ActiveBreak = {
  block: ScheduleBlock
  top: number
}

type Props = {
  blocks: ScheduleBlock[]
  dayStart: string
  dayEnd: string
  doneTaskIds: Set<string>
  onMarkDone: (taskId: string) => void
  onBlockMove: (blockId: string, newStart: string, newEnd: string) => Promise<void>
  onBreakDelete: (blockId: string) => Promise<void>
}

export default function TimeGrid({ blocks, dayStart, dayEnd, doneTaskIds, onMarkDone, onBlockMove, onBreakDelete }: Props) {
  const dayStartMin = timeStrToMinutes(dayStart)
  const dayEndMin = timeStrToMinutes(dayEnd)
  const totalHeight = (dayEndMin - dayStartMin) * PX_PER_MIN

  const [nowMin, setNowMin] = useState(nowMinutes())
  const [dragState, setDragState] = useState<DragState | null>(null)
  const [activeBreak, setActiveBreak] = useState<ActiveBreak | null>(null)

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
  const breakBlocks = blocks.filter(b => b.block_type === 'break')

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
        <div
          className="blocks-col"
          style={{ height: `${totalHeight}px` }}
          onClick={e => { if (activeBreak && e.target === e.currentTarget) setActiveBreak(null) }}
        >
          {showNow && (
            <div className="now-line" style={{ top: `${nowTop}px` }}>
              <span className="now-label">עכשיו</span>
            </div>
          )}
          {breakBlocks.map(block => (
            <BreakBlockView
              key={block.id}
              block={block}
              dayStartMin={dayStartMin}
              onClick={(b, top) => setActiveBreak({ block: b, top })}
            />
          ))}
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
          {taskBlocks.length === 0 && breakBlocks.length === 0 && (
            <div className="grid-empty">לחץ על ״בנה את היום שלי״ כדי לקבל לוח זמנים</div>
          )}
          {activeBreak && (
            <BreakModal
              block={activeBreak.block}
              top={activeBreak.top}
              onDelete={onBreakDelete}
              onClose={() => setActiveBreak(null)}
            />
          )}
        </div>
      </DndContext>
    </div>
  )
}
```

- [ ] **Step 5: Update `src/pages/Dashboard.tsx`**

Add `deleteScheduleBlock` to the imports from `schedule`:

```ts
import { fetchBlocksForDate, fetchBlocksForRange, generateSchedule, updateScheduleBlock, deleteScheduleBlock } from '../lib/queries/schedule'
```

Add this handler inside the `Dashboard` component (after `handleBlockMove`):

```ts
async function handleBreakDelete(blockId: string) {
  const prevBlocks = blocks
  setBlocks(prev => prev.filter(b => b.id !== blockId))
  try {
    await deleteScheduleBlock(blockId)
  } catch {
    setBlocks(prevBlocks)
    setError('שגיאה בהסרת ההפסקה')
  }
}
```

Pass `onBreakDelete` to `<TimeGrid>`. Find the existing `<TimeGrid ... />` JSX and add the prop:

```tsx
<TimeGrid
  blocks={blocks.filter(b => b.date === selectedDate)}
  dayStart={dayStart}
  dayEnd={dayEnd}
  doneTaskIds={doneTaskIds}
  onMarkDone={handleToggleDone}
  onBlockMove={handleBlockMove}
  onBreakDelete={handleBreakDelete}
/>
```

- [ ] **Step 6: Verify in browser**

Run `npm run dev`. Navigate to Dashboard. After building a schedule with breaks configured:
- Break blocks render in muted gray with a left border stripe
- Clicking a break block shows the popover with title, time, and "הסר מהיום"
- Clicking "הסר מהיום" removes the block from the grid immediately
- Clicking elsewhere closes the popover
- Task blocks remain draggable; break blocks do not drag

- [ ] **Step 7: Commit**

```bash
git add src/components/BreakBlockView.tsx \
        src/components/BreakModal.tsx \
        src/components/TimeGrid.tsx \
        src/pages/Dashboard.tsx \
        src/App.css
git commit -m "feat: render break blocks in TimeGrid with delete modal"
```

---

## Task 6: TaskForm Conflict Warning

**Agent type:** frontend-engineer  
**Depends on:** Task 2 (query helpers + `BreakTemplate` type)  
**Parallel with:** Tasks 4 and 5  

**Files:**
- Modify: `src/components/TaskForm.tsx`
- Modify: `src/pages/Tasks.tsx`
- Modify: `src/App.css`

**Interfaces:**
- Consumes: `getBreakTemplates(userId)` from `src/lib/queries/breaks.ts`
- Consumes: `BreakTemplate` from `src/lib/types.ts`
- Consumes: `timeStrToMinutes` from `src/lib/timeUtils.ts`

---

- [ ] **Step 1: Add conflict warning CSS to `src/App.css`**

Append:

```css
/* ── TaskForm conflict warning ───────────────────────── */

.form-warning {
  font-size: 0.78rem;
  color: var(--cta);
  margin-block-start: 0.25rem;
}
```

- [ ] **Step 2: Update `src/components/TaskForm.tsx`**

Add `BreakTemplate` import and a `breakTemplates` prop. Add a helper that computes the conflict. Show a warning below the `fixed_start` field.

Replace the full file:

```tsx
import { useState, useEffect } from 'react'
import type { Task, BreakTemplate } from '../lib/types'
import { todayStr } from '../lib/dateUtils'
import { timeStrToMinutes } from '../lib/timeUtils'

type FormData = {
  title: string
  estimated_minutes: string
  priority: 'low' | 'medium' | 'high'
  fixed_start: string
  scheduled_date: string
}

type Props = {
  editTarget: Task | null
  defaultDate?: string
  breakTemplates: BreakTemplate[]
  onSubmit: (data: {
    title: string
    estimated_minutes: number
    priority: 'low' | 'medium' | 'high'
    fixed_start: string | null
    scheduled_date: string
  }) => Promise<void>
  onCancel: () => void
  loading: boolean
}

const EMPTY: FormData = {
  title: '',
  estimated_minutes: '30',
  priority: 'medium',
  fixed_start: '',
  scheduled_date: '',
}

function findBreakConflict(
  fixedStart: string,
  estimatedMinutes: number,
  scheduledDate: string,
  breakTemplates: BreakTemplate[],
): BreakTemplate | null {
  if (!fixedStart || !scheduledDate || isNaN(estimatedMinutes) || estimatedMinutes <= 0) return null
  const taskStart = timeStrToMinutes(fixedStart)
  const taskEnd = taskStart + estimatedMinutes
  const d = new Date(scheduledDate + 'T12:00:00')
  const dow = d.getDay()
  for (const t of breakTemplates) {
    let applies = false
    switch (t.recurrence_type) {
      case 'daily': applies = true; break
      case 'weekly': applies = t.recurrence_day_of_week === dow; break
      case 'date': applies = t.recurrence_date === scheduledDate; break
      case 'date_range':
        applies = !!t.recurrence_date_start && !!t.recurrence_date_end &&
          t.recurrence_date_start <= scheduledDate && scheduledDate <= t.recurrence_date_end
        break
    }
    if (!applies) continue
    const bs = timeStrToMinutes(t.start_time)
    const be = timeStrToMinutes(t.end_time)
    if (taskStart < be && taskEnd > bs) return t
  }
  return null
}

export default function TaskForm({ editTarget, defaultDate, breakTemplates, onSubmit, onCancel, loading }: Props) {
  const [form, setForm] = useState<FormData>(EMPTY)
  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>({})

  useEffect(() => {
    if (editTarget) {
      setForm({
        title: editTarget.title,
        estimated_minutes: String(editTarget.estimated_minutes),
        priority: editTarget.priority as 'low' | 'medium' | 'high',
        fixed_start: editTarget.fixed_start ? editTarget.fixed_start.slice(0, 5) : '',
        scheduled_date: editTarget.scheduled_date ?? todayStr(),
      })
    } else {
      setForm({ ...EMPTY, scheduled_date: defaultDate ?? todayStr() })
    }
    setErrors({})
  }, [editTarget, defaultDate])

  function validate(): boolean {
    const errs: Partial<Record<keyof FormData, string>> = {}
    if (!form.title.trim()) errs.title = 'נדרש שם משימה'
    const mins = parseInt(form.estimated_minutes)
    if (!form.estimated_minutes || isNaN(mins) || mins <= 0) {
      errs.estimated_minutes = 'נדרשת משך זמן חיובי'
    }
    if (!form.scheduled_date) errs.scheduled_date = 'נדרש תאריך'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validate()) return
    await onSubmit({
      title: form.title.trim(),
      estimated_minutes: parseInt(form.estimated_minutes),
      priority: form.priority,
      fixed_start: form.fixed_start || null,
      scheduled_date: form.scheduled_date,
    })
    setForm({ ...EMPTY, scheduled_date: defaultDate ?? todayStr() })
    setErrors({})
  }

  function field(key: keyof FormData, label: string, input: React.ReactNode, extra?: React.ReactNode) {
    return (
      <div className="form-field">
        <label className="form-label">{label}</label>
        {input}
        {errors[key] && <span className="form-error">{errors[key]}</span>}
        {extra}
      </div>
    )
  }

  const breakConflict = findBreakConflict(
    form.fixed_start,
    parseInt(form.estimated_minutes),
    form.scheduled_date,
    breakTemplates,
  )

  return (
    <form onSubmit={handleSubmit} className="task-form">
      <h3>{editTarget ? 'עריכת משימה' : 'משימה חדשה'}</h3>

      {field('title', 'שם המשימה *',
        <input
          className="form-input"
          value={form.title}
          onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
          placeholder="לדוגמה: לכתוב דו״ח שבועי"
        />
      )}

      {field('estimated_minutes', 'משך (דקות) *',
        <input
          className="form-input"
          type="number"
          min={1}
          value={form.estimated_minutes}
          onChange={e => setForm(f => ({ ...f, estimated_minutes: e.target.value }))}
        />
      )}

      {field('priority', 'עדיפות',
        <select
          className="form-input"
          value={form.priority}
          onChange={e => setForm(f => ({ ...f, priority: e.target.value as 'low' | 'medium' | 'high' }))}
        >
          <option value="high">גבוהה</option>
          <option value="medium">בינונית</option>
          <option value="low">נמוכה</option>
        </select>
      )}

      {field('scheduled_date', 'תאריך *',
        <input
          className="form-input"
          type="date"
          value={form.scheduled_date}
          onChange={e => setForm(f => ({ ...f, scheduled_date: e.target.value }))}
        />
      )}

      {field('fixed_start', 'שעת התחלה',
        <input
          className="form-input"
          type="time"
          value={form.fixed_start}
          onChange={e => setForm(f => ({ ...f, fixed_start: e.target.value }))}
        />,
        breakConflict && (
          <span className="form-warning">
            שעה זו חופפת להפסקת {breakConflict.title} ({breakConflict.start_time.slice(0, 5)}–{breakConflict.end_time.slice(0, 5)})
          </span>
        )
      )}

      <div className="form-actions">
        <button type="submit" className="btn-primary" disabled={loading}>
          {loading ? 'שומר...' : editTarget ? 'עדכן' : 'הוסף משימה'}
        </button>
        {editTarget && (
          <button type="button" className="btn-secondary" onClick={onCancel}>
            ביטול
          </button>
        )}
      </div>
    </form>
  )
}
```

- [ ] **Step 3: Update `src/pages/Tasks.tsx`**

Add break template loading and pass it to `TaskForm`.

Add import at the top:

```ts
import { getBreakTemplates } from '../lib/queries/breaks'
import type { BreakTemplate } from '../lib/types'
```

Add state inside the component (after `buildMsg` state):

```ts
const [breakTemplates, setBreakTemplates] = useState<BreakTemplate[]>([])
```

Add effect to load break templates once (after the existing `useEffect` for tasks):

```ts
useEffect(() => {
  if (!userId) return
  getBreakTemplates(userId).then(setBreakTemplates).catch(() => {})
}, [userId])
```

Pass `breakTemplates` to `<TaskForm>`:

```tsx
<TaskForm
  editTarget={editTarget}
  defaultDate={selectedDate}
  breakTemplates={breakTemplates}
  onSubmit={handleSubmit}
  onCancel={() => setEditTarget(null)}
  loading={saving}
/>
```

- [ ] **Step 4: Verify in browser**

Navigate to `/tasks`. Configure a break template (e.g., Lunch 13:00–14:00 daily) in Profile first. Then:
- Create a task with `fixed_start = 13:30` and `estimated_minutes = 60` (ends 14:30 → overlaps lunch)
- Confirm the warning `שעה זו חופפת להפסקת הפסקת צהריים (13:00–14:00)` appears below the time field
- Confirm the task can still be saved (non-blocking)
- Confirm no warning appears when `fixed_start` is outside break window

- [ ] **Step 5: Commit**

```bash
git add src/components/TaskForm.tsx src/pages/Tasks.tsx src/App.css
git commit -m "feat: show break conflict warning in TaskForm"
```
