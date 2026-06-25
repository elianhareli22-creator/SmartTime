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
  estimated_minutes: number
  priority: 'low' | 'medium' | 'high'
  deadline: string | null
  fixed_start: string | null  // "HH:MM:SS"
  status: 'pending' | 'done'
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
