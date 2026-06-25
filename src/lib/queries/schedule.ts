import { supabase } from '../supabase'
import type { ScheduleBlock } from '../types'

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

export async function generateSchedule(date: string): Promise<ScheduleBlock[]> {
  const { data, error } = await supabase.functions.invoke('generate-schedule', {
    body: { date },
  })
  if (error) throw error
  return (data as { blocks: ScheduleBlock[] }).blocks
}
