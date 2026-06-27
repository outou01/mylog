import axios from "axios";

const api = axios.create({ baseURL: "/api" });

export interface AiReview {
  id: number;
  daily_log_id: number;
  hp: number;
  mp: number;
  stress: number;
  comment: string;
  next_action: string;
  encouragement: string;
  created_at: string;
}

export interface DailyLog {
  id: number;
  date: string;
  sleep_hours: number;
  overtime_hours: number;
  mood_score: number;
  did_workout: boolean;
  did_create: boolean;
  did_code: boolean;
  drank_alcohol: boolean;
  memo: string | null;
  created_at: string;
  updated_at: string;
  ai_review: AiReview | null;
}

export interface DailyLogCreate {
  date: string;
  sleep_hours: number;
  overtime_hours: number;
  mood_score: number;
  did_workout: boolean;
  did_create: boolean;
  did_code: boolean;
  drank_alcohol: boolean;
  memo: string;
}

export interface QuickLogParsed {
  date: string;
  sleep_hours: number;
  overtime_hours: number;
  mood_score: number;
  did_workout: boolean;
  did_create: boolean;
  did_code: boolean;
  drank_alcohol: boolean;
  memo: string;
}

export const fetchLogs = () => api.get<DailyLog[]>("/daily-logs").then((r) => r.data);
export const fetchLatestLog = () => api.get<DailyLog>("/daily-logs/latest").then((r) => r.data);
export const createLog = (data: DailyLogCreate) => api.post<DailyLog>("/daily-logs", data).then((r) => r.data);
export const generateReview = (id: number) => api.post<AiReview>(`/ai-review/${id}`).then((r) => r.data);
export const parseQuickLog = (text: string) =>
  api.post<QuickLogParsed>("/quick-log/parse", { text }).then((r) => r.data);

export interface WeeklyStats {
  week_start: string;
  week_end: string;
  log_count: number;
  avg_sleep: number;
  avg_mood: number;
  avg_overtime: number;
  workout_days: number;
  create_days: number;
  code_days: number;
  alcohol_days: number;
  no_alcohol_days: number;
}

export interface WeeklyReport {
  stats: WeeklyStats;
  good_things: string;
  progress: string;
  next_action: string;
  advice: string;
}

export const fetchWeeklyReport = () =>
  api.get<WeeklyReport>("/weekly-report/latest").then((r) => r.data);
