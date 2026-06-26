export type Profile = {
  id: string
  display_name: string | null
  day_start: string  // "HH:MM:SS" from Postgres
  day_end: string    // "HH:MM:SS"
  created_at: string
}

export type Task = {
  id: string
  user_id: string
  title: string
  description: string | null
  estimated_minutes: number
  priority: 'low' | 'medium' | 'high'
  fixed_start: string | null  // "HH:MM:SS"
  status: 'pending' | 'done'
  scheduled_date: string      // "YYYY-MM-DD"
  created_at: string
}

export type ScheduleBlock = {
  id: string
  user_id: string
  task_id: string | null
  date: string        // "YYYY-MM-DD"
  start_time: string  // "HH:MM:SS"
  end_time: string    // "HH:MM:SS"
  block_type: 'task' | 'break'
  title: string
}

export type View = 'day' | 'week' | 'month'

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
