import { supabase } from '../supabase'
import type { Task } from '../types'

export async function createTask(
  userId: string,
  input: {
    title: string
    estimated_minutes: number
    priority: 'low' | 'medium' | 'high'
    deadline?: string | null
    fixed_start?: string | null
    scheduled_date?: string
  }
): Promise<Task> {
  const { data, error } = await supabase
    .from('tasks')
    .insert({ ...input, user_id: userId })
    .select()
    .single()
  if (error) throw error
  return data as Task
}

export async function updateTask(
  id: string,
  input: {
    title?: string
    estimated_minutes?: number
    priority?: 'low' | 'medium' | 'high'
    deadline?: string | null
    fixed_start?: string | null
    scheduled_date?: string
  }
): Promise<Task> {
  const { data, error } = await supabase
    .from('tasks')
    .update(input)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data as Task
}

export async function deleteTask(id: string): Promise<void> {
  const { error } = await supabase.from('tasks').delete().eq('id', id)
  if (error) throw error
}

export async function markTaskDone(id: string): Promise<void> {
  const { error } = await supabase
    .from('tasks')
    .update({ status: 'done' })
    .eq('id', id)
  if (error) throw error
}

export async function markTaskPending(id: string): Promise<void> {
  const { error } = await supabase
    .from('tasks')
    .update({ status: 'pending' })
    .eq('id', id)
  if (error) throw error
}

export async function fetchPendingTasksForDate(userId: string, date: string): Promise<Task[]> {
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'pending')
    .eq('scheduled_date', date)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data as Task[]
}

export async function fetchTasksForDate(userId: string, date: string): Promise<Task[]> {
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('user_id', userId)
    .eq('scheduled_date', date)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data as Task[]
}

export async function moveTaskToDate(id: string, date: string): Promise<void> {
  const { error } = await supabase
    .from('tasks')
    .update({ scheduled_date: date })
    .eq('id', id)
  if (error) throw error
}

export async function updateTaskFixedStart(
  id: string,
  fixed_start: string,
): Promise<void> {
  const { error } = await supabase
    .from('tasks')
    .update({ fixed_start })
    .eq('id', id)
  if (error) throw error
}
