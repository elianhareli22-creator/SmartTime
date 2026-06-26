import { useState, useRef, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { sendChatMessage, type WireMessage } from '../lib/queries/chat'
import { todayStr } from '../lib/dateUtils'

const GREETING: WireMessage = {
  role: 'model',
  text: 'שלום! אני כאן לעזור לך לתכנן את היום שלך. אפשר לבקש ממני להוסיף משימות, לערוך אותן, להזיז בלוקים בלוח הזמנים או לבנות מחדש את היום. במה אוכל לעזור?',
}

export default function Chat() {
  const { userId } = useAuth()
  const [messages, setMessages] = useState<WireMessage[]>([GREETING])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, sending])

  async function handleSend() {
    const text = input.trim()
    if (!text || sending || !userId) return

    setError(null)
    setInput('')
    const userMessage: WireMessage = { role: 'user', text }
    // Prior turns only (exclude the greeting and the message we're about to
    // send) — the Edge Function appends `text` as the final user turn itself.
    const history = messages.filter((m) => m !== GREETING)
    setMessages((prev) => [...prev, userMessage])
    setSending(true)

    try {
      const now = new Date()
      const nowTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
      const today = todayStr()

      const response = await sendChatMessage(text, history, nowTime, today)
      setMessages((prev) => [...prev, { role: 'model', text: response.reply }])
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
