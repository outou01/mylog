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

export const fetchMonthCalendar = (year: number, month: number) =>
  api.get<DayCell[]>("/calendar/month", { params: { year, month } }).then((r) => r.data);

export const fetchWeekCompare = () =>
  api.get<WeekCompare>("/calendar/compare").then((r) => r.data);

export const fetchWeeklyHours = () =>
  api.get<WeekHoursCompare>("/calendar/weekly-hours").then((r) => r.data);

export const fetchPatterns = () =>
  api.get<PatternInsight>("/calendar/patterns").then((r) => r.data);
