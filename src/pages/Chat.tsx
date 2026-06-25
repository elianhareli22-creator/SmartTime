import { useState, useRef, useEffect, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import { sendChatMessage, type ChatMessage } from '../lib/queries/chat'
import { fetchTasks } from '../lib/queries/tasks'
import { fetchBlocksForDate } from '../lib/queries/schedule'
import type { Task, ScheduleBlock } from '../lib/types'

const GREETING: ChatMessage = {
  role: 'model',
  text: 'שלום! אני כאן לעזור לך לתכנן את היום שלך. אפשר לבקש ממני להוסיף משימות, לערוך אותן, להזיז בלוקים בלוח הזמנים או לבנות מחדש את היום. במה אוכל לעזור?',
}

function todayStr() {
  return new Date().toISOString().split('T')[0]
}

export default function Chat() {
  const { userId, profile } = useAuth()
  const [messages, setMessages] = useState<ChatMessage[]>([GREETING])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const tasksRef = useRef<Task[]>([])
  const blocksRef = useRef<ScheduleBlock[]>([])
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const refreshContext = useCallback(async () => {
    if (!userId) return
    const [tasks, blocks] = await Promise.all([
      fetchTasks(userId),
      fetchBlocksForDate(userId, todayStr()),
    ])
    tasksRef.current = tasks
    blocksRef.current = blocks
  }, [userId])

  useEffect(() => { refreshContext() }, [refreshContext])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, sending])

  async function handleSend() {
    const text = input.trim()
    if (!text || sending || !userId || !profile) return

    setError(null)
    setInput('')
    const userMessage: ChatMessage = { role: 'user', text }
    const history = messages.filter((m) => m !== GREETING)
    setMessages((prev) => [...prev, userMessage])
    setSending(true)

    try {
      const now = new Date()
      const nowTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
      const today = now.toISOString().split('T')[0]

      const response = await sendChatMessage(text, [...history, userMessage], {
        tasks: tasksRef.current,
        blocks: blocksRef.current,
        profile,
        nowTime,
        today,
      })

      setMessages((prev) => [...prev, { role: 'model', text: response.reply }])

      if (response.actionsPerformed.length > 0) {
        await refreshContext()
      }
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
      <div className="chat-messages">
        {messages.map((m, i) => (
          <div key={i} className={`chat-bubble chat-bubble--${m.role}`}>
            {m.text}
          </div>
        ))}
        {sending && (
          <div className="chat-bubble chat-bubble--model chat-bubble--typing">
            <span></span><span></span><span></span>
          </div>
        )}
        {error && <div className="chat-error">{error}</div>}
        <div ref={messagesEndRef} />
      </div>

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
    </div>
  )
}
