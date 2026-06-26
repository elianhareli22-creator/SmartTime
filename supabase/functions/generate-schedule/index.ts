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
