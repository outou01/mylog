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
  energy_level: number;
  day_type: string;
  did_job_search: boolean;
  did_study: boolean;
  went_outside: boolean;
  ate_good_food: boolean;
  took_walk: boolean;
  visited_cafe: boolean;
  visited_akihabara: boolean;
  napped: boolean;
  played_games: boolean;
  talked_with_friends: boolean;
  did_nothing: boolean;
  discharge_activities: string | null;
  victory_condition: string | null;
  victory_achieved: boolean;
  created_at: string;
  updated_at: string;
  ai_review: AiReview | null;
}

export type DailyLogUpdate = Partial<Omit<DailyLog, "id" | "date" | "created_at" | "updated_at" | "ai_review">>;

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
  energy_level: number;
  day_type: string;
  did_job_search: boolean;
  did_study: boolean;
  went_outside: boolean;
  ate_good_food: boolean;
  took_walk: boolean;
  visited_cafe: boolean;
  visited_akihabara: boolean;
  napped: boolean;
  played_games: boolean;
  talked_with_friends: boolean;
  did_nothing: boolean;
  discharge_activities: string;
  victory_condition: string;
  victory_achieved: boolean;
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
export const fetchLog = (id: number) => api.get<DailyLog>(`/daily-logs/${id}`).then((r) => r.data);
export const createLog = (data: Partial<DailyLogCreate> & { date: string; sleep_hours: number; mood_score: number }) =>
  api.post<DailyLog>("/daily-logs", data).then((r) => r.data);
export const updateLog = (id: number, data: DailyLogUpdate) =>
  api.patch<DailyLog>(`/daily-logs/${id}`, data).then((r) => r.data);
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

export interface BriefingOut {
  today: string;
  month: string;
  theme_text: string | null;
  week_start: string;
  week_end: string;
  workout_days: number;
  create_days: number;
  code_days: number;
  alcohol_days: number;
  avg_sleep: number;
  avg_mood: number;
  last_next_action: string | null;
  ai_advice: string;
  suggested_action: string;
}

export const fetchWeekendBriefing = () =>
  api.get<BriefingOut>("/briefing/weekend").then((r) => r.data);
export const upsertMonthlyTheme = (theme_text: string) =>
  api.post("/briefing/theme", { theme_text }).then((r) => r.data);
export const saveWeekendNote = (next_action: string) =>
  api.post("/briefing/note", { next_action }).then((r) => r.data);

export interface AriaMessage {
  message: string;
  mood: "happy" | "worried" | "proud" | "normal";
}

export const fetchAriaMessage = () =>
  api.get<AriaMessage>("/aria/message").then((r) => r.data);

export const fetchVictoryCondition = () =>
  api.get<{ condition: string }>("/aria/victory-condition").then((r) => r.data);
