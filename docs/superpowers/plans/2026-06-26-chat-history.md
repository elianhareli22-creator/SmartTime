# Chat History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist chat messages to Supabase, add a sidebar listing past sessions, allow resuming an active session after page refresh, and let the user start a new titled session via a "New chat" button.

**Architecture:** Two new tables (`chat_sessions`, `chat_messages`) hold session metadata and per-message rows. The frontend reads `localStorage` to resume the active session on mount and lazily creates a DB session on the first message sent. A new `title-chat-session` edge function calls Gemini to produce a 4–6 word Hebrew title when the user starts a fresh chat.

**Tech Stack:** React 19 + TypeScript, Supabase (Postgres + RLS + Edge Functions), Deno, Gemini API (`gemini-3.1-flash-lite`), CSS logical properties (RTL-first).

## Global Constraints

- All CSS must use logical properties — `margin-inline-start`, `padding-inline-end`, `inset-inline-start` etc. Never `left`/`right`.
- No AI-looking UI: no `rounded-2xl`, no gradient blobs, no generic shadows.
- All UI copy is in Hebrew.
- No automated tests exist; validation is visual via browser automation.
- Every DB operation goes through `src/lib/queries/*.ts`. Never call `supabase` directly from a component.
- `src/lib/database.types.ts` is generated — never hand-edit.
- Schema change workflow: apply migration → generate types → overwrite `database.types.ts`.

---

### Task 1: Schema migration + DB types + domain types

**Files:**
- Create: `supabase/migrations/20260626000000_add_chat_history.sql`
- Modify: `src/lib/database.types.ts` (regenerated — overwrite entirely)
- Modify: `src/lib/types.ts`

**Interfaces:**
- Produces: `ChatSession` and `ChatMessage` types in `src/lib/types.ts`, consumed by Tasks 2 and 4.

- [ ] **Step 1: Write the migration SQL file**

Create `supabase/migrations/20260626000000_add_chat_history.sql` with this exact content:

```sql
CREATE TABLE chat_sessions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  title      text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE chat_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users own sessions"
  ON chat_sessions FOR ALL
  USING (auth.uid() = user_id);

CREATE TABLE chat_messages (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES chat_sessions ON DELETE CASCADE,
  role       text NOT NULL CHECK (role IN ('user', 'model')),
  text       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users own messages via session"
  ON chat_messages FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM chat_sessions s
      WHERE s.id = chat_messages.session_id
        AND s.user_id = auth.uid()
    )
  );
```

- [ ] **Step 2: Apply the migration**

Use the `mcp__supabase__apply_migration` tool with the SQL above and migration name `add_chat_history`.

Expected: migration applied with no errors.

- [ ] **Step 3: Regenerate database types**

Use the `mcp__supabase__generate_typescript_types` tool.

Copy the full output and overwrite `src/lib/database.types.ts` entirely. The generated file must include `chat_sessions` and `chat_messages` table types.

- [ ] **Step 4: Add domain types to `src/lib/types.ts`**

Append these two types at the end of `src/lib/types.ts`:

```ts
export type ChatSession = {
  id: string
  user_id: string
  title: string | null
  created_at: string
}

export type ChatMessage = {
  id: string
  session_id: string
  role: 'user' | 'model'
  text: string
  created_at: string
}
```

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260626000000_add_chat_history.sql \
        src/lib/database.types.ts \
        src/lib/types.ts
git commit -m "feat: add chat_sessions + chat_messages schema and domain types"
```

---

### Task 2: Query helpers

**Files:**
- Modify: `src/lib/queries/chat.ts`

**Interfaces:**
- Consumes: `ChatSession`, `ChatMessage` from `src/lib/types.ts` (Task 1)
- Produces:
  - `createSession(userId: string): Promise<string>`
  - `appendMessage(sessionId: string, role: 'user' | 'model', text: string): Promise<void>`
  - `fetchSessions(userId: string): Promise<ChatSession[]>`
  - `fetchMessages(sessionId: string): Promise<ChatMessage[]>`
  - `updateSessionTitle(sessionId: string, title: string): Promise<void>`
  - `titleChatSession(sessionId: string): Promise<string | null>`
  - `sendChatMessage(message: string, history: WireMessage[], nowTime: string, today: string): Promise<ChatResponse>` (unchanged signature)
  - `WireMessage` type (renamed from the old `ChatMessage`)

- [ ] **Step 1: Rewrite `src/lib/queries/chat.ts`**

Replace the entire file with:

```ts
import { supabase } from '../supabase'
import type { ChatSession, ChatMessage } from '../types'

// Wire format sent to the chat edge function — not stored in DB
export type WireMessage = { role: 'user' | 'model'; text: string }

export type ToolCallResult = {
  tool: string
  args: Record<string, unknown>
  result: 'ok' | 'error'
  detail?: string
}

export type ChatResponse = {
  reply: string
  actionsPerformed: ToolCallResult[]
}

export async function createSession(userId: string): Promise<string> {
  const { data, error } = await supabase
    .from('chat_sessions')
    .insert({ user_id: userId })
    .select('id')
    .single()
  if (error) throw error
  return data.id
}

export async function appendMessage(
  sessionId: string,
  role: 'user' | 'model',
  text: string,
): Promise<void> {
  const { error } = await supabase
    .from('chat_messages')
    .insert({ session_id: sessionId, role, text })
  if (error) throw error
}

export async function fetchSessions(userId: string): Promise<ChatSession[]> {
  const { data, error } = await supabase
    .from('chat_sessions')
    .select('id, user_id, title, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function fetchMessages(sessionId: string): Promise<ChatMessage[]> {
  const { data, error } = await supabase
    .from('chat_messages')
    .select('id, session_id, role, text, created_at')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return data ?? []
}

export async function updateSessionTitle(sessionId: string, title: string): Promise<void> {
  const { error } = await supabase
    .from('chat_sessions')
    .update({ title })
    .eq('id', sessionId)
  if (error) throw error
}

export async function titleChatSession(sessionId: string): Promise<string | null> {
  const { data, error } = await supabase.functions.invoke('title-chat-session', {
    body: { sessionId },
  })
  if (error) throw error
  return (data as { title: string | null }).title
}

export async function sendChatMessage(
  message: string,
  history: WireMessage[],
  nowTime: string,
  today: string,
): Promise<ChatResponse> {
  const { data, error } = await supabase.functions.invoke('chat', {
    body: { message, history, nowTime, today },
  })
  if (error) throw error
  return data as ChatResponse
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npm run build 2>&1 | head -30
```

Expected: no type errors. If you see errors about `ChatMessage` being ambiguous, ensure `Chat.tsx` (which still uses the old inline type) is updated in Task 4 before this check — or fix the import there now.

- [ ] **Step 3: Commit**

```bash
git add src/lib/queries/chat.ts
git commit -m "feat: add chat session + message query helpers"
```

---

### Task 3: `title-chat-session` edge function

**Files:**
- Create: `supabase/functions/title-chat-session/index.ts`

**Interfaces:**
- Consumes: `chat_sessions` and `chat_messages` tables (Task 1); `GEMINI_API_KEY` Supabase secret (already set for the `chat` function).
- Produces: HTTP endpoint `POST /functions/v1/title-chat-session` → `{ title: string | null }`

- [ ] **Step 1: Create the edge function**

Create `supabase/functions/title-chat-session/index.ts`:

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

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabase = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    )
    if (authError || !user) {
      return new Response('Unauthorized', { status: 401, headers: corsHeaders })
    }

    const { sessionId } = await req.json()

    // Confirm session belongs to this user
    const { data: session, error: sessionError } = await supabase
      .from('chat_sessions')
      .select('id')
      .eq('id', sessionId)
      .eq('user_id', user.id)
      .single()
    if (sessionError || !session) {
      return new Response('Not found', { status: 404, headers: corsHeaders })
    }

    const { data: messages, error: msgError } = await supabase
      .from('chat_messages')
      .select('role, text')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true })
      .limit(10)
    if (msgError) throw msgError

    if (!messages || messages.length === 0) {
      return new Response(
        JSON.stringify({ title: null }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const transcript = messages
      .map((m) => `${m.role === 'user' ? 'משתמש' : 'עוזר'}: ${m.text}`)
      .join('\n')

    const geminiKey = Deno.env.get('GEMINI_API_KEY')!
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${geminiKey}`

    const res = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          role: 'user',
          parts: [{
            text: `סכם את השיחה הבאה ב-4–6 מילים בעברית כשם קצר לשיחה. השב עם השם בלבד, ללא פיסוק:\n\n${transcript}`,
          }],
        }],
      }),
    })

    if (!res.ok) throw new Error(`Gemini error: ${res.status} ${await res.text()}`)
    const json = await res.json()
    const title: string | null = json?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? null

    if (title) {
      const { error: updateError } = await supabase
        .from('chat_sessions')
        .update({ title })
        .eq('id', sessionId)
      if (updateError) throw updateError
    }

    return new Response(
      JSON.stringify({ title }),
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
```

- [ ] **Step 2: Deploy the edge function**

```bash
supabase functions deploy title-chat-session
```

Expected: deployment succeeds. If you see "supabase CLI not linked", run `supabase link` first with the project ref.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/title-chat-session/index.ts
git commit -m "feat: add title-chat-session edge function"
```

---

### Task 4: Frontend — Chat.tsx layout + CSS

**Files:**
- Modify: `src/pages/Chat.tsx`
- Modify: `src/App.css`

**Interfaces:**
- Consumes:
  - `createSession(userId)`, `appendMessage(sessionId, role, text)`, `fetchSessions(userId)`, `fetchMessages(sessionId)`, `titleChatSession(sessionId)`, `sendChatMessage(msg, history, nowTime, today)`, `WireMessage` from `src/lib/queries/chat.ts` (Task 2)
  - `ChatSession`, `ChatMessage` from `src/lib/types.ts` (Task 1)

- [ ] **Step 1: Rewrite `src/pages/Chat.tsx`**

Replace the entire file with:

```tsx
import { useState, useRef, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import {
  createSession,
  appendMessage,
  fetchSessions,
  fetchMessages,
  titleChatSession,
  sendChatMessage,
  type WireMessage,
} from '../lib/queries/chat'
import type { ChatSession, ChatMessage } from '../lib/types'
import { todayStr } from '../lib/dateUtils'

const STORAGE_KEY = 'chat_session_id'

const GREETING: WireMessage = {
  role: 'model',
  text: 'שלום! אני כאן לעזור לך לתכנן את היום שלך. אפשר לבקש ממני להוסיף משימות, לערוך אותן, להזיז בלוקים בלוח הזמנים או לבנות מחדש את היום. במה אוכל לעזור?',
}

function toWireMessage(m: ChatMessage): WireMessage {
  return { role: m.role, text: m.text }
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`
}

export default function Chat() {
  const { userId } = useAuth()

  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null)
  const [activeMessages, setActiveMessages] = useState<WireMessage[]>([GREETING])

  const [sessions, setSessions] = useState<ChatSession[]>([])

  // null = viewing active session; set = viewing that past session read-only
  const [viewingSessionId, setViewingSessionId] = useState<string | null>(null)
  const [viewedMessages, setViewedMessages] = useState<WireMessage[]>([])
  const [loadingViewed, setLoadingViewed] = useState(false)

  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [titling, setTitling] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!userId) return

    const storedId = localStorage.getItem(STORAGE_KEY)
    if (storedId) {
      fetchMessages(storedId)
        .then((msgs) => {
          if (msgs.length > 0) {
            setCurrentSessionId(storedId)
            setActiveMessages([GREETING, ...msgs.map(toWireMessage)])
          } else {
            localStorage.removeItem(STORAGE_KEY)
          }
        })
        .catch(() => localStorage.removeItem(STORAGE_KEY))
    }

    fetchSessions(userId).then(setSessions).catch(console.error)
  }, [userId])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [activeMessages, viewedMessages, sending])

  const isViewingPast = viewingSessionId !== null
  const displayMessages = isViewingPast ? viewedMessages : activeMessages

  async function handleViewSession(sessionId: string) {
    // Clicking active session while viewing past → return to live view
    if (sessionId === currentSessionId) {
      setViewingSessionId(null)
      return
    }
    // Already viewing this past session → no-op
    if (viewingSessionId === sessionId) return

    setViewingSessionId(sessionId)
    setLoadingViewed(true)
    try {
      const msgs = await fetchMessages(sessionId)
      setViewedMessages(msgs.map(toWireMessage))
    } catch {
      setViewedMessages([])
    } finally {
      setLoadingViewed(false)
    }
  }

  async function handleNewChat() {
    if (!userId) return
    setTitling(true)
    try {
      if (currentSessionId) {
        await titleChatSession(currentSessionId)
        const updated = await fetchSessions(userId)
        setSessions(updated)
      }
    } catch {
      // title generation failure is non-fatal; session stays untitled
    } finally {
      setTitling(false)
    }
    localStorage.removeItem(STORAGE_KEY)
    setCurrentSessionId(null)
    setActiveMessages([GREETING])
    setViewingSessionId(null)
    setViewedMessages([])
    setError(null)
  }

  async function handleSend() {
    const text = input.trim()
    if (!text || sending || !userId) return

    setError(null)
    setInput('')
    setSending(true)

    let sessionId = currentSessionId

    try {
      if (!sessionId) {
        sessionId = await createSession(userId)
        localStorage.setItem(STORAGE_KEY, sessionId)
        setCurrentSessionId(sessionId)
      }

      await appendMessage(sessionId, 'user', text)

      // history = prior turns only; the edge function appends `text` itself
      const history = activeMessages.filter((m) => m !== GREETING)
      setActiveMessages((prev) => [...prev, { role: 'user', text }])

      const now = new Date()
      const nowTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`

      const response = await sendChatMessage(text, history, nowTime, todayStr())
      await appendMessage(sessionId, 'model', response.reply)
      setActiveMessages((prev) => [...prev, { role: 'model', text: response.reply }])

      fetchSessions(userId).then(setSessions).catch(console.error)
    } catch (err) {
      setError('שגיאה בשליחת ההודעה. נסה שוב.')
      console.error(err)
    } finally {
      setSending(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="chat-page">
      <aside className="chat-sidebar">
        <button
          className="chat-new-btn"
          onClick={handleNewChat}
          disabled={titling || sending}
        >
          {titling ? '...' : '+ שיחה חדשה'}
        </button>
        <ul className="chat-session-list">
          {sessions.map((s) => {
            const isActive = !viewingSessionId && s.id === currentSessionId
            const isViewing = viewingSessionId === s.id
            return (
              <li
                key={s.id}
                className={`chat-session-item${isActive || isViewing ? ' chat-session-item--active' : ''}`}
                onClick={() => handleViewSession(s.id)}
              >
                <span className="chat-session-title">
                  {s.title ?? 'שיחה פעילה'}
                </span>
                <span className="chat-session-date">{formatDate(s.created_at)}</span>
              </li>
            )
          })}
        </ul>
      </aside>

      <div className="chat-main">
        <div className="chat-messages">
          {loadingViewed ? (
            <div className="chat-loading">טוען...</div>
          ) : (
            displayMessages.map((m, i) => (
              <div key={i} className={`chat-bubble chat-bubble--${m.role}`}>
                {m.text}
              </div>
            ))
          )}
          {sending && (
            <div className="chat-bubble chat-bubble--model chat-bubble--typing">
              <span></span><span></span><span></span>
            </div>
          )}
          {error && <div className="chat-error">{error}</div>}
          <div ref={messagesEndRef} />
        </div>

        {isViewingPast ? (
          <div className="chat-readonly-notice">שיחה זו הסתיימה</div>
        ) : (
          <div className="chat-input-area">
            <textarea
              className="chat-input"
              rows={1}
              placeholder="הקלד הודעה..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={sending}
            />
            <button
              className="chat-send-btn"
              onClick={handleSend}
              disabled={sending || !input.trim()}
            >
              שלח
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Update CSS in `src/App.css`**

Replace the existing `.chat-page` block and all subsequent chat rules (lines 650–777) with:

```css
/* ── Chat page ───────────────────────────────────────── */

.chat-page {
  display: flex;
  flex-direction: row;
  height: calc(100vh - 52px);
  margin: -2rem -1.25rem;
  padding: 0;
  overflow: hidden;
}

/* Sidebar — inline-start (right in RTL) */
.chat-sidebar {
  width: 220px;
  flex-shrink: 0;
  border-inline-end: 1px solid var(--border);
  background: var(--surface);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.chat-new-btn {
  margin: 0.75rem;
  padding: 0.5rem 0.75rem;
  background: var(--accent);
  color: #fff;
  border: none;
  border-radius: var(--radius);
  font-size: 0.85rem;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  transition: background 0.15s;
  text-align: center;
}

.chat-new-btn:hover:not(:disabled) { background: var(--accent-hover); }
.chat-new-btn:disabled { opacity: 0.45; cursor: not-allowed; }

.chat-session-list {
  list-style: none;
  overflow-y: auto;
  flex: 1;
  padding: 0.25rem 0;
}

.chat-session-item {
  padding: 0.55rem 0.875rem;
  cursor: pointer;
  border-radius: 0;
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  border-inline-start: 3px solid transparent;
  transition: background 0.1s;
}

.chat-session-item:hover {
  background: var(--paper);
}

.chat-session-item--active {
  background: var(--paper);
  border-inline-start-color: var(--accent);
}

.chat-session-title {
  font-size: 0.82rem;
  color: var(--ink);
  line-height: 1.4;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.chat-session-date {
  font-size: 0.75rem;
  color: var(--muted-light);
}

/* Main chat area */
.chat-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-inline-size: 0;
  overflow: hidden;
}

.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 1.5rem 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
}

/* push messages to the bottom when there are few */
.chat-messages::before {
  content: '';
  flex: 1;
}

.chat-loading {
  text-align: center;
  color: var(--muted);
  font-size: 0.875rem;
  padding: 2rem;
}

.chat-bubble {
  max-width: 68%;
  padding: 0.65rem 0.95rem;
  border-radius: var(--radius-lg);
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 0.9rem;
}

.chat-bubble--model {
  align-self: flex-start;
  background: var(--surface);
  border: 1px solid var(--border);
  color: var(--ink);
  border-bottom-right-radius: var(--radius-sm);
}

.chat-bubble--user {
  align-self: flex-end;
  background: var(--accent);
  color: #fff;
  border-bottom-left-radius: var(--radius-sm);
}

.chat-bubble--typing {
  display: flex;
  gap: 0.2rem;
  align-items: center;
  padding: 0.6rem 1rem;
}

.chat-bubble--typing span {
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--muted);
  animation: chat-blink 1.2s infinite;
}

.chat-bubble--typing span:nth-child(2) { animation-delay: 0.2s; }
.chat-bubble--typing span:nth-child(3) { animation-delay: 0.4s; }

@keyframes chat-blink {
  0%, 80%, 100% { opacity: 0.2; transform: scale(0.8); }
  40%           { opacity: 1;   transform: scale(1); }
}

.chat-error {
  color: var(--danger);
  font-size: 0.85rem;
  text-align: center;
  padding: 0.5rem;
}

.chat-readonly-notice {
  padding: 0.75rem 1.25rem;
  border-block-start: 1px solid var(--border);
  background: var(--paper);
  color: var(--muted);
  font-size: 0.85rem;
  text-align: center;
}

.chat-input-area {
  display: flex;
  gap: 0.75rem;
  align-items: flex-end;
  padding: 0.75rem 1.25rem;
  border-block-start: 1px solid var(--border);
  background: var(--surface);
}

.chat-input {
  flex: 1;
  resize: none;
  padding: 0.6rem 0.875rem;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  font-family: inherit;
  font-size: 0.9rem;
  background: var(--paper);
  color: var(--ink);
  direction: rtl;
  line-height: 1.5;
  transition: border-color 0.12s, box-shadow 0.12s;
}

.chat-input:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(30, 58, 95, 0.1);
}

.chat-send-btn {
  background: var(--accent);
  color: #fff;
  border: none;
  border-radius: var(--radius);
  padding: 0.6rem 1.25rem;
  font-size: 0.9rem;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  transition: background 0.15s;
  white-space: nowrap;
  flex-shrink: 0;
}

.chat-send-btn:hover:not(:disabled) { background: var(--accent-hover); }
.chat-send-btn:disabled { opacity: 0.45; cursor: not-allowed; }
```

- [ ] **Step 3: Verify TypeScript compiles with no errors**

```bash
npm run build 2>&1 | head -40
```

Expected: clean build.

- [ ] **Step 4: Start dev server and visually validate**

```bash
npm run dev
```

Open `http://localhost:5173/chat` in the browser and verify:

1. **Sidebar appears** on the inline-start side (right in RTL), chat area fills the rest.
2. **Send a message** → message appears in chat, is saved (check Supabase `chat_messages` table), sidebar shows "שיחה פעילה".
3. **Refresh the page** → same messages reload, session resumes seamlessly.
4. **Click "New chat"** → sidebar updates with a generated Hebrew title for the previous session, fresh greeting appears.
5. **Click the titled past session** in sidebar → shows its messages, "שיחה זו הסתיימה" appears instead of the input.
6. **Click the active session** (or start typing) → returns to live chat.
7. **Click "New chat" immediately** (no messages sent) → no empty session appears in sidebar, greeted again.

- [ ] **Step 5: Commit**

```bash
git add src/pages/Chat.tsx src/App.css
git commit -m "feat: chat history — sidebar, session persistence, new chat flow"
```

---

## Validation checklist (run after all tasks complete)

- [ ] Send a message → page refresh → session resumes with prior messages intact
- [ ] Click "New chat" → sidebar shows generated Hebrew title for previous session → fresh greeting
- [ ] Click a past session → read-only view, "שיחה זו הסתיימה" notice, no input
- [ ] Click back to active session → input restored, live chat continues
- [ ] "New chat" with zero messages → no empty session in sidebar
- [ ] RTL layout looks correct (sidebar on right, chat on left)
