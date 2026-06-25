export type Task = {
  id: string
  user_id: string
  title: string
  estimated_minutes: number
  priority: 'low' | 'medium' | 'high'
  deadline: string | null
  fixed_start: string | null
  status: 'pending' | 'done'
  created_at: string
}

export type Profile = {
  id: string
  display_name: string | null
  day_start: string
  day_end: string
  created_at: string
}

export type ScheduleBlock = {
  id: string
  user_id: string
  task_id: string | null
  date: string
  start_time: string
  end_time: string
  block_type: 'task' | 'break'
}
