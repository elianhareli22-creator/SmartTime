import { supabase } from '../supabase'
import type { ScheduleBlock } from '../types'

export type UnscheduledTask = {
  id: string
  title: string
  estimated_minutes: number
}

export async function fetchBlocksForDate(userId: string, date: string): Promise<ScheduleBlock[]> {
  const { data, error } = await supabase
    .from('schedule_blocks')
    .select('*')
    .eq('user_id', userId)
    .eq('date', date)
    .order('start_time', { ascending: true })
  if (error) throw error
  return data as ScheduleBlock[]
}

export async function fetchBlocksForRange(
  userId: string,
  startDate: string,
  endDate: string,
): Promise<ScheduleBlock[]> {
  const { data, error } = await supabase
    .from('schedule_blocks')
    .select('*')
    .eq('user_id', userId)
    .gte('date', startDate)
    .lte('date', endDate)
    .order('date', { ascending: true })
    .order('start_time', { ascending: true })
  if (error) throw error
  return data as ScheduleBlock[]
}

export async function generateSchedule(
  date: string,
): Promise<{ blocks: ScheduleBlock[]; unscheduled: UnscheduledTask[] }> {
  const { data, error } = await supabase.functions.invoke('generate-schedule', {
    body: { date },
  })
  if (error) throw error
  const res = data as { blocks: ScheduleBlock[] | null; unscheduled: UnscheduledTask[] | null }
  return { blocks: res.blocks ?? [], unscheduled: res.unscheduled ?? [] }
}

export async function updateScheduleBlock(
  id: string,
  start_time: string,
  end_time: string,
): Promise<void> {
  const { error } = await supabase
    .from('schedule_blocks')
    .update({ start_time, end_time })
    .eq('id', id)
  if (error) throw error
}

export async function deleteScheduleBlock(id: string): Promise<void> {
  const { error } = await supabase.from('schedule_blocks').delete().eq('id', id)
  if (error) throw error
}
