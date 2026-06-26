import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const TOOL_DECLARATIONS = [
  {
    name: 'create_task',
    description: 'Create a new task for the user',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        estimated_minutes: { type: 'integer' },
        priority: { type: 'string', enum: ['low', 'medium', 'high'] },
        deadline: { type: 'string', nullable: true },
        fixed_start: { type: 'string', nullable: true, description: 'שעת התחלה קבועה בפורמט HH:MM (למשל 12:30). מלא רק כשהמשתמש ציין שעה מפורשת.' },
        scheduled_date: { type: 'string', nullable: true, description: 'YYYY-MM-DD; defaults to today' },
      },
      required: ['title', 'estimated_minutes', 'priority'],
    },
  },
  {
    name: 'update_task',
    description: 'Update fields on an existing task',
    parameters: {
      type: 'object',
      properties: {
        task_id: { type: 'string' },
        title: { type: 'string', nullable: true },
        estimated_minutes: { type: 'integer', nullable: true },
        priority: { type: 'string', enum: ['low', 'medium', 'high'], nullable: true },
        deadline: { type: 'string', nullable: true },
        fixed_start: { type: 'string', nullable: true, description: 'שעת התחלה קבועה בפורמט HH:MM (למשל 12:30). מלא רק כשהמשתמש ציין שעה מפורשת.' },
        scheduled_date: { type: 'string', nullable: true, description: 'YYYY-MM-DD' },
      },
      required: ['task_id'],
    },
  },
  {
    name: 'delete_task',
    description: 'Delete a task by ID',
    parameters: {
      type: 'object',
      properties: {
        task_id: { type: 'string' },
      },
      required: ['task_id'],
    },
  },
  {
    name: 'move_block',
    description: "Move a schedule block to a new time on today's schedule",
    parameters: {
      type: 'object',
      properties: {
        block_id: { type: 'string' },
        new_start_time: { type: 'string', description: 'HH:MM format' },
        new_end_time: { type: 'string', description: 'HH:MM format' },
      },
      required: ['block_id', 'new_start_time', 'new_end_time'],
    },
  },
  {
    name: 'get_schedule',
    description: "Read the schedule blocks for a specific date (use for any date other than today)",
    parameters: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'YYYY-MM-DD' },
      },
      required: ['date'],
    },
  },
  {
    name: 'generate_schedule',
    description: "Regenerate the AI schedule from pending tasks for a given date (default: today)",
    parameters: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'YYYY-MM-DD; defaults to today' },
      },
    },
  },
]

type GeminiPart = {
  text?: string
  functionCall?: { name: string; args: Record<string, unknown> }
  functionResponse?: { name: string; response: Record<string, unknown> }
}
type GeminiContent = { role: string; parts: GeminiPart[] }

type ToolCallResult = {
  tool: string
  args: Record<string, unknown>
  result: 'ok' | 'error'
  detail?: string
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

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabase = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    )
    if (authError || !user) {
      return new Response('Unauthorized', { status: 401, headers: corsHeaders })
    }

    const userId = user.id
    const { message, history, nowTime, today: clientToday } = await req.json()
    const today = clientToday ?? new Date().toISOString().split('T')[0]

    // The DB is the source of truth — fetch context here rather than trusting
    // the client to send (and not spoof) it.
    const [
      { data: tasks, error: tasksError },
      { data: blocks, error: blocksError },
      { data: profile, error: profileError },
    ] = await Promise.all([
      supabase.from('tasks').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
      supabase.from('schedule_blocks').select('*').eq('user_id', userId).eq('date', today).order('start_time', { ascending: true }),
      supabase.from('profiles').select('*').eq('id', userId).single(),
    ])
    if (tasksError) throw tasksError
    if (blocksError) throw blocksError
    if (profileError) throw profileError

    const systemInstruction = buildSystemInstruction({
      tasks: tasks ?? [],
      blocks: blocks ?? [],
      profile,
      nowTime: nowTime ?? new Date().toISOString().slice(11, 16),
      today,
    })

    const contents: GeminiContent[] = [
      ...history.map((m: { role: string; text: string }) => ({
        role: m.role,
        parts: [{ text: m.text }],
      })),
      { role: 'user', parts: [{ text: message }] },
    ]

    const geminiKey = Deno.env.get('GEMINI_API_KEY')!
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${geminiKey}`

    const actionsPerformed: ToolCallResult[] = []
    let currentContents = [...contents]
    let reply = ''

    for (let round = 0; round < 5; round++) {
      const res = await fetch(geminiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemInstruction }] },
          contents: currentContents,
          tools: [{ function_declarations: TOOL_DECLARATIONS }],
        }),
      })

      if (!res.ok) {
        const errText = await res.text()
        console.error(`Gemini error: ${res.status} ${errText}`)
        const isQuota = res.status === 429 || errText.includes('RESOURCE_EXHAUSTED')
        return new Response(
          JSON.stringify({
            reply: isQuota
              ? 'שירות ה-AI אינו זמין כעת — ייתכן שאזל המכסה של מנוע ה-AI. נסה שוב מאוחר יותר.'
              : 'שירות ה-AI נתקל בשגיאה זמנית. נסה שוב בעוד רגע.',
            actionsPerformed,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }

      const json = await res.json()
      const candidate = json?.candidates?.[0]
      if (!candidate) throw new Error('No candidate from Gemini')

      const parts: GeminiPart[] = candidate.content?.parts ?? []
      const functionCallParts = parts.filter((p) => p.functionCall)
      const textParts = parts.filter((p) => p.text)

      if (functionCallParts.length === 0) {
        reply = textParts.map((p) => p.text ?? '').join('')
        break
      }

      currentContents.push({ role: 'model', parts: functionCallParts })

      const functionResponseParts: GeminiPart[] = []
      for (const part of functionCallParts) {
        const { name, args } = part.functionCall!
        const toolResult = await executeTool(name, args, userId, supabase, authHeader, supabaseUrl, today)
        actionsPerformed.push(toolResult)
        functionResponseParts.push({
          functionResponse: {
            name,
            response: { result: toolResult.result, detail: toolResult.detail ?? '' },
          },
        })
      }

      currentContents.push({ role: 'user', parts: functionResponseParts })
    }

    return new Response(
      JSON.stringify({ reply, actionsPerformed }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    console.error(err)
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})

function buildSystemInstruction(context: {
  tasks: Record<string, unknown>[]
  blocks: Record<string, unknown>[]
  profile: Record<string, unknown>
  nowTime: string
  today: string
}): string {
  const taskLines = context.tasks.length
    ? context.tasks.map((t) =>
        `- [${t.id}] "${t.title}" | ${t.estimated_minutes}min | עדיפות: ${t.priority} | תאריך: ${t.scheduled_date} | deadline: ${t.deadline ?? 'אין'} | fixed_start: ${t.fixed_start ?? 'אין'} | סטטוס: ${t.status}`
      ).join('\n')
    : 'אין משימות'

  const blockLines = context.blocks.length
    ? context.blocks.map((b) =>
        `- [${b.id}] "${b.title}" | ${b.start_time}–${b.end_time} | סוג: ${b.block_type} | task_id: ${b.task_id ?? 'אין'}`
      ).join('\n')
    : 'אין בלוקים'

  return `אתה עוזר תכנון יומי חכם של SmartTime. עזור למשתמש לתכנן את יומו בצורה יעילה.

**היום:** ${context.today}
**שעה נוכחית:** ${context.nowTime}
**יום עבודה:** ${context.profile.day_start}–${context.profile.day_end}
**שם:** ${context.profile.display_name ?? 'משתמש'}

**משימות קיימות (השתמש ב-ID לפעולות):**
${taskLines}

**לוח זמנים להיום (השתמש ב-ID לפעולות):**
${blockLines}

כשמשתמש מבקש לבצע פעולה — השתמש בכלים המתאימים. לאחר ביצוע, ענה בעברית בצורה ידידותית וקצרה.

**תאריכים:** "היום" הוא ${context.today}. פענח ביטויים יחסיים ("מחר", "מחרתיים", "יום חמישי") ביחס אליו והעבר אותם לכלים בפורמט YYYY-MM-DD. הבלוקים המוצגים למעלה הם של היום בלבד — לכל תאריך אחר קרא תחילה ל-get_schedule כדי לקבל את הבלוקים וה-IDs שלהם לפני עריכה.

**שעות:** ביטוי של שעה ("ב-12:30", "בשעה 9", "ב-14:00") ממופה ל-\`fixed_start\` בפורמט HH:MM. **אל תשמיט שעה שהמשתמש ציין** — אם ציין שעה, חובה למלא \`fixed_start\`.

**משך חובה (estimated_minutes):** אם המשתמש לא ציין משך — **שאל אותו לפני קריאה ל-\`create_task\`**. אל תמציא משך ואל תשתמש בערך ברירת מחדל.

**יצירת משימה ללא שעה:** כאשר המשתמש מבקש ליצור משימה ולא ציין שעה — **שאל כיצד להמשיך**, עם שלוש אפשרויות:
1. המשתמש בוחר שעה → הגדר \`fixed_start\` לשעה שנבחרה → המשימה תופיע אוטומטית בלוח.
2. המשתמש רוצה שה-AI יקבע — צור את המשימה עם \`fixed_start\` = ${context.nowTime} (השעה הנוכחית), ולאחר מכן **שאל אם השעה מתאימה** או שהמשתמש מעדיף שעה אחרת; אם כן — עדכן את \`fixed_start\` בהתאם.
3. המשתמש רוצה שהמשימה תחכה לתכנון — צור ללא \`fixed_start\` (המשימה תקובע כשהמשתמש יפעיל "בנה את היום").

**הצגה בלוח הזמנים:** משימה עם \`fixed_start\` מופיעה אוטומטית בלוח ביום שלה — **אין צורך ב-"בנה את היום"**. משימה **ללא** \`fixed_start\` מוצגת רק לאחר הפעלת "בנה את היום". ציין זאת בתשובה למשתמש.`
}

async function executeTool(
  name: string,
  args: Record<string, unknown>,
  userId: string,
  supabase: ReturnType<typeof createClient>,
  authHeader: string,
  supabaseUrl: string,
  today: string,
): Promise<ToolCallResult> {
  try {
    if (name === 'create_task') {
      const insert: Record<string, unknown> = {
        user_id: userId,
        title: args.title,
        estimated_minutes: args.estimated_minutes,
        priority: args.priority,
        deadline: args.deadline ?? null,
        fixed_start: args.fixed_start ?? null,
      }
      if (args.scheduled_date) insert.scheduled_date = args.scheduled_date
      const { error } = await supabase.from('tasks').insert(insert)
      if (error) throw error
      return { tool: name, args, result: 'ok' }
    }

    if (name === 'update_task') {
      const { task_id, ...fields } = args
      const update: Record<string, unknown> = {}
      if (fields.title !== undefined) update.title = fields.title
      if (fields.estimated_minutes !== undefined) update.estimated_minutes = fields.estimated_minutes
      if (fields.priority !== undefined) update.priority = fields.priority
      if (fields.deadline !== undefined) update.deadline = fields.deadline
      if (fields.fixed_start !== undefined) update.fixed_start = fields.fixed_start
      if (fields.scheduled_date !== undefined) update.scheduled_date = fields.scheduled_date
      const { error } = await supabase.from('tasks').update(update).eq('id', task_id).eq('user_id', userId)
      if (error) throw error
      return { tool: name, args, result: 'ok' }
    }

    if (name === 'delete_task') {
      const { error } = await supabase.from('tasks').delete().eq('id', args.task_id).eq('user_id', userId)
      if (error) throw error
      return { tool: name, args, result: 'ok' }
    }

    if (name === 'move_block') {
      const { error } = await supabase
        .from('schedule_blocks')
        .update({ start_time: args.new_start_time, end_time: args.new_end_time })
        .eq('id', args.block_id)
        .eq('user_id', userId)
      if (error) throw error
      return { tool: name, args, result: 'ok' }
    }

    if (name === 'get_schedule') {
      const { data, error } = await supabase
        .from('schedule_blocks')
        .select('id, title, start_time, end_time, block_type, task_id')
        .eq('user_id', userId)
        .eq('date', args.date)
        .order('start_time', { ascending: true })
      if (error) throw error
      const detail = (data && data.length)
        ? data.map((b) => `[${b.id}] "${b.title}" ${b.start_time}–${b.end_time} (${b.block_type}) task_id:${b.task_id ?? 'אין'}`).join('\n')
        : 'אין בלוקים בתאריך זה'
      return { tool: name, args, result: 'ok', detail }
    }

    if (name === 'generate_schedule') {
      const res = await fetch(`${supabaseUrl}/functions/v1/generate-schedule`, {
        method: 'POST',
        headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: args.date ?? today }),
      })
      if (!res.ok) throw new Error('generate-schedule failed')
      return { tool: name, args, result: 'ok' }
    }

    return { tool: name, args, result: 'error', detail: `Unknown tool: ${name}` }
  } catch (err) {
    return { tool: name, args, result: 'error', detail: String(err) }
  }
}
