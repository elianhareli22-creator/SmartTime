import { useState, useRef, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import Spinner from '../components/Spinner'
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

const storageKey = (uid: string) => `chat_session_id_${uid}`

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
  const [error, setError] = useState<string | null>(null)
  const [loadingInitial, setLoadingInitial] = useState(true)

  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!userId) return

    const storedId = localStorage.getItem(storageKey(userId!))

    const sessionPromise = storedId
      ? fetchMessages(storedId)
          .then((msgs) => {
            if (msgs.length > 0) {
              setCurrentSessionId(storedId)
              setActiveMessages([GREETING, ...msgs.map(toWireMessage)])
            } else {
              localStorage.removeItem(storageKey(userId!))
            }
          })
          .catch(() => localStorage.removeItem(storageKey(userId!)))
      : Promise.resolve()

    Promise.all([
      fetchSessions(userId).then(setSessions).catch(console.error),
      sessionPromise,
    ]).finally(() => setLoadingInitial(false))
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
      setViewingSessionId(null)
      setError('שגיאה בטעינת השיחה. נסה שוב.')
    } finally {
      setLoadingViewed(false)
    }
  }

  async function handleNewChat() {
    if (!userId) return
    localStorage.removeItem(storageKey(userId!))
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
    setSending(true)

    let sessionId = currentSessionId
    const isFirstMessage = !sessionId

    try {
      if (!sessionId) {
        sessionId = await createSession(userId)
        localStorage.setItem(storageKey(userId!), sessionId)
        setCurrentSessionId(sessionId)
      }

      setInput('')
      await appendMessage(sessionId, 'user', text)

      // history = prior turns only; the edge function appends `text` itself
      const history = activeMessages.filter((m) => m !== GREETING)
      setActiveMessages((prev) => [...prev, { role: 'user', text }])

      const now = new Date()
      const nowTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`

      const response = await sendChatMessage(text, history, nowTime, todayStr())
      await appendMessage(sessionId, 'model', response.reply)
      setActiveMessages((prev) => [...prev, { role: 'model', text: response.reply }])

      if (isFirstMessage) {
        // Title the session after the first exchange, then refresh sidebar
        titleChatSession(sessionId)
          .then(() => fetchSessions(userId))
          .then(setSessions)
          .catch(console.error)
      } else {
        fetchSessions(userId).then(setSessions).catch(console.error)
      }
    } catch (err) {
      setInput(text)
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
          disabled={sending}
        >
          + שיחה חדשה
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
        {loadingInitial ? (
          <div className="content-loader"><Spinner /></div>
        ) : (
          <>
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
          </>
        )}
      </div>
    </div>
  )
}
