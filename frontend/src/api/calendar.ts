import axios from "axios";

const api = axios.create({ baseURL: "/api" });

export interface DayCell {
  date: string;
  mood_score: number | null;
  energy_level: number | null;
  sleep_hours: number | null;
  did_workout: boolean;
  did_create: boolean;
  victory_achieved: boolean;
  has_log: boolean;
}

export interface WeekStats {
  week_start: string;
  week_end: string;
  log_count: number;
  avg_sleep: number;
  avg_mood: number;
  avg_energy: number;
  workout_days: number;
  create_days: number;
  recovery_days: number;
  alcohol_days: number;
}

export interface WeekCompare {
  this_week: WeekStats;
  last_week: WeekStats;
  aria_comment: string;
}

export interface ActivityHours {
  create_hours: number;
  workout_hours: number;
  study_hours: number;
  code_hours: number;
  job_search_hours: number;
  total_advance_hours: number;
}

export interface WeekHoursCompare {
  this_week: ActivityHours;
  last_week: ActivityHours;
  week_start: string;
  last_week_start: string;
}

export interface PatternInsight {
  insights: string[];
  aria_comment: string;
}

export interface ScheduleBlock {
  id: number | null;
  date: string;
  start_time: string;
  end_time: string;
  title: string;
  category: "work" | "self" | "life" | "rest" | string;
  note: string | null;
  editable: boolean;
  dream_id: number | null;
  project_id: number | null;
  seed_task_id: number | null;
  completed: boolean;
}

export interface WeekSchedule {
  week_start: string;
  week_end: string;
  day_start_hour: number;
  day_end_hour: number;
  schedule_message: string;
  blocks: ScheduleBlock[];
}

export interface ScheduleMessage {
  message: string;
  is_fallback: boolean;
}

export interface ScheduleBlockPayload {
  date: string;
  start_time: string;
  end_time: string;
  title: string;
  category: string;
  note: string | null;
  dream_id?: number | null;
  project_id?: number | null;
  seed_task_id?: number | null;
  completed?: boolean;
}

export interface TimeCategoryTotal {
  key: string;
  label: string;
  color: string;
  minutes: number;
  hours: number;
}

export interface NamedTimeTotal {
  id: number;
  title: string;
  minutes: number;
  hours: number;
}

export interface TimeAnalysisSection {
  label: string;
  start_date: string;
  end_date: string;
  scale_minutes: number;
  scale_label: string;
  total_minutes: number;
  categories: TimeCategoryTotal[];
}

export interface FieldLevel {
  level: number;
  title: string;
  current_threshold_minutes: number;
  next_title: string | null;
  next_threshold_minutes: number | null;
  remaining_minutes: number | null;
}

export interface FieldSummary {
  total_minutes: number;
  total_hours: number;
  categories: TimeCategoryTotal[];
  dreams: NamedTimeTotal[];
  projects: NamedTimeTotal[];
  level: FieldLevel;
}

export interface TimeAnalysis {
  selected_date: string;
  field_summary: FieldSummary;
  daily: TimeAnalysisSection;
  weekly: TimeAnalysisSection;
  monthly: TimeAnalysisSection;
}

export interface TimeAnalysisComment {
  scope: "daily" | "weekly" | "monthly";
  start_date: string;
  end_date: string;
  comment: string;
  is_fallback: boolean;
}

export const fetchMonthCalendar = (year: number, month: number) =>
  api.get<DayCell[]>("/calendar/month", { params: { year, month } }).then((r) => r.data);

export const fetchWeekCompare = () =>
  api.get<WeekCompare>("/calendar/compare").then((r) => r.data);

export const fetchWeeklyHours = () =>
  api.get<WeekHoursCompare>("/calendar/weekly-hours").then((r) => r.data);

export const fetchPatterns = () =>
  api.get<PatternInsight>("/calendar/patterns").then((r) => r.data);

export const fetchWeekSchedule = (week_start?: string) =>
  api.get<WeekSchedule>("/calendar/schedule-week", { params: { week_start } }).then((r) => r.data);

export const createScheduleMessage = (week_start?: string) =>
  api.post<ScheduleMessage>("/calendar/schedule-message", null, { params: { week_start } }).then((r) => r.data);

export const fetchTimeAnalysis = (target_date?: string) =>
  api.get<TimeAnalysis>("/calendar/time-analysis", { params: { target_date } }).then((r) => r.data);

export const createTimeAnalysisComment = (scope: TimeAnalysisComment["scope"], target_date?: string) =>
  api.post<TimeAnalysisComment>("/calendar/time-analysis/comment", { scope, target_date }).then((r) => r.data);

export const createScheduleBlock = (data: ScheduleBlockPayload) =>
  api.post<ScheduleBlock>("/calendar/schedule-blocks", data).then((r) => r.data);

export const updateScheduleBlock = (id: number, data: ScheduleBlockPayload) =>
  api.patch<ScheduleBlock>(`/calendar/schedule-blocks/${id}`, data).then((r) => r.data);

export const deleteScheduleBlock = (id: number) =>
  api.delete(`/calendar/schedule-blocks/${id}`).then((r) => r.data);

export const autoPlanWeek = (week_start?: string) =>
  api.post<WeekSchedule>("/calendar/schedule-week/auto-plan", null, { params: { week_start } }).then((r) => r.data);
