import { supabase } from '../supabase'
import type { ScheduleBlock } from '../types'

export async function fetchTodayBlocks(userId: string): Promise<ScheduleBlock[]> {
  const today = new Date().toISOString().split('T')[0]
  const { data, error } = await supabase
    .from('schedule_blocks')
    .select('*')
    .eq('user_id', userId)
    .eq('date', today)
    .order('start_time', { ascending: true })
  if (error) throw error
  return data as ScheduleBlock[]
}

export async function generateSchedule(): Promise<ScheduleBlock[]> {
  const { data, error } = await supabase.functions.invoke('generate-schedule')
  if (error) throw error
  return (data as { blocks: ScheduleBlock[] }).blocks
}
