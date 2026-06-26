import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { useAuth } from './AuthContext'
import { fetchBlocksForDate } from '../lib/queries/schedule'
import { fetchDoneTaskIdsForDate } from '../lib/queries/tasks'
import { nowMinutes, timeStrToMinutes } from '../lib/timeUtils'
import { todayStr } from '../lib/dateUtils'

export type AppNotification = {
  id: string
  title: string
  firedAt: Date
  threshold: '10' | '1'
  read: boolean
}

type NotificationContextValue = {
  notifications: AppNotification[]
  unreadCount: number
  markAllRead: () => void
}

const NotificationContext = createContext<NotificationContextValue>({
  notifications: [],
  unreadCount: 0,
  markAllRead: () => {},
})

export function useNotifications() {
  return useContext(NotificationContext)
}

const THRESHOLDS: Array<{ key: '10' | '1'; min: number; max: number; label: string }> = [
  { key: '10', min: 9, max: 11, label: '10 דקות' },
  { key: '1',  min: 0, max: 2,  label: 'דקה אחת' },
]

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { userId } = useAuth()
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const notifiedRef = useRef<Set<string>>(new Set())

  const unreadCount = notifications.filter(n => !n.read).length

  function markAllRead() {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })))
  }

  const tick = useCallback(async () => {
    if (!userId) return
    try {
      const today = todayStr()
      const [blocks, doneIds] = await Promise.all([
        fetchBlocksForDate(userId, today),
        fetchDoneTaskIdsForDate(userId, today),
      ])
      const now = nowMinutes()
      const toFire: AppNotification[] = []

      blocks.forEach(block => {
        if (block.task_id && doneIds.has(block.task_id)) return
        const startMin = timeStrToMinutes(block.start_time)
        const diff = startMin - now

        THRESHOLDS.forEach(({ key, min, max, label }) => {
          const id = `${block.id}:${key}`
          if (notifiedRef.current.has(id)) return
          if (diff < min || diff > max) return
          notifiedRef.current.add(id)
          toFire.push({ id, title: block.title, firedAt: new Date(), threshold: key, read: false })
          if ('Notification' in window && Notification.permission === 'granted') {
            new Notification('SmartTime', { body: `${block.title} מתחיל בעוד ${label}` })
          }
        })
      })

      if (toFire.length > 0) {
        setNotifications(prev => [...toFire, ...prev])
      }
    } catch {
      // silently swallow — next tick will retry
    }
  }, [userId])

  useEffect(() => {
    if (!userId) {
      setNotifications([])
      notifiedRef.current = new Set()
      return
    }
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission()
    }
    tick()
    const id = setInterval(tick, 60_000)
    return () => clearInterval(id)
  }, [userId, tick])

  return (
    <NotificationContext.Provider value={{ notifications, unreadCount, markAllRead }}>
      {children}
    </NotificationContext.Provider>
  )
}
