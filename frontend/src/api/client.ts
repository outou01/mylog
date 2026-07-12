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
  create_hours: number;
  workout_hours: number;
  study_hours: number;
  code_hours: number;
  job_search_hours: number;
  pachinko_reason: string | null;
  pachinko_feeling_after: string | null;
  pachinko_creation_minutes_after: number | null;
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

export interface AriaPresenceMessage {
  message: string;
  is_ai: boolean;
}

export const fetchAriaPresence = (page: string) =>
  api.get<AriaPresenceMessage>("/aria/presence", { params: { page } }).then((r) => r.data);

export interface VictoryCondition {
  condition: string;
  achieved: boolean;
}

export const fetchVictoryCondition = () =>
  api.get<VictoryCondition>("/aria/victory-condition").then((r) => r.data);

export const achieveVictoryCondition = () =>
  api.post<VictoryCondition>("/aria/victory-condition/achieve").then((r) => r.data);

export interface HomeSeed {
  id: number;
  title: string;
  dream_title: string | null;
  dream_icon: string | null;
  category_label: string;
  section: string | null;
  purpose: string | null;
  estimated_minutes: number;
  status: string;
  last_touched_label: string;
  planted_today: boolean;
  today_time: string | null;
}

export interface SoilStatus {
  state: "rich" | "ok" | "dry" | "unknown" | string;
  label: string;
  sleep_score: number;
  mood_score: number;
  recovery_score: number;
  avg_sleep: number;
  log_days: number;
  comment: string;
}

export interface WeeklySoilReport {
  week_start: string;
  avg_sleep: number;
  prev_avg_sleep: number;
  avg_mood: number;
  prev_avg_mood: number;
  workout_days: number;
  alcohol_days: number;
  overtime_hours: number;
  message: string;
  is_ai: boolean;
}

export const fetchSoilStatus = () =>
  api.get<SoilStatus>("/soil/status").then((r) => r.data);

export const fetchSoilToday = () =>
  api.get<DailyLog | null>("/soil/today").then((r) => r.data);

export const logUsualDay = () =>
  api.post<{ created: boolean; log: DailyLog }>("/soil/usual").then((r) => r.data);

export const fetchWeeklySoilReport = () =>
  api.get<WeeklySoilReport>("/soil/weekly-report").then((r) => r.data);

export const fetchSoilAriaComment = () =>
  api.get<{ message: string; is_ai: boolean }>("/soil/aria-comment").then((r) => r.data);

export interface SoilActionDef {
  id: number;
  name: string;
  category_key: string;
  base_score: number;
  default_minutes: number | null;
  icon: string | null;
  is_quick: boolean;
}

export interface SoilLogEntry {
  id: number;
  action_name: string;
  category_key: string;
  category_name: string;
  performed_on: string;
  date_label: string;
  duration_minutes: number | null;
  source_type: "manual" | "calendar" | string;
}

export interface SoilFieldCard {
  key: string;
  name: string;
  icon: string;
  color: string;
  score: number;
  label: string;
  recent: Array<{ date_label: string; name: string; duration_minutes: number | null }>;
  suggestion: string;
}

export interface SoilSummary {
  headline: string;
  overall_score: number;
  overall_note: string;
  categories: SoilFieldCard[];
  recent_logs: SoilLogEntry[];
  aria_message: string;
}

export const fetchSoilSummary = () =>
  api.get<SoilSummary>("/soil/summary").then((r) => r.data);

export const fetchSoilActions = () =>
  api.get<SoilActionDef[]>("/soil/actions").then((r) => r.data);

export const createSoilLog = (data: {
  action_definition_id?: number;
  action_name?: string;
  category_key?: string;
  duration_minutes?: number;
  performed_on?: string;
}) => api.post<SoilLogEntry>("/soil/logs", data).then((r) => r.data);

export const deleteSoilLog = (id: number) =>
  api.delete(`/soil/logs/${id}`).then((r) => r.data);

export interface DashboardHome {
  soil: {
    state: string;
    label: string;
    comment: string;
  };
  field: {
    weekly_minutes: number;
    progress_percent: number;
    message: string;
    total_minutes: number;
    level: number;
    level_title: string;
    next_title: string | null;
    next_remaining_minutes: number | null;
    streak_days: number;
  };
  purpose: {
    text: string;
  };
  current_seed: HomeSeed | null;
  seeds: HomeSeed[];
  life_gauge: {
    work_percent: number;
    self_percent: number;
    work_minutes: number;
    self_minutes: number;
    has_data: boolean;
  };
  timeline: Array<{
    date_label: string;
    title: string;
    note: string | null;
  }>;
  aria: {
    name: string;
    face: string;
    mood: "normal" | "worried" | "proud" | "steady" | string;
    message: string;
  };
  aria_message: string;
}

export const fetchDashboardHome = () =>
  api.get<DashboardHome>("/dashboard/home").then((r) => r.data);

export interface FocusAction {
  kind: "habit" | "seed" | "calendar" | "rest" | string;
  key: string;
  seed_id: number | null;
  icon: string;
  title: string;
  reason: string;
  standard_minutes: number;
  minimum_minutes: number;
  minimum_label: string;
}

export interface FocusHabit {
  key: string;
  label: string;
  icon: string;
  status: "done" | "minimum" | "today" | "off" | string;
  standard_minutes: number;
  minimum_minutes: number;
  cue: string;
  completed_minutes: number;
}

export interface FocusField {
  key: string;
  name: string;
  icon: string;
  color: string;
  score: number;
  connection_label: string;
  connection_tone: "hot" | "warm" | "connected" | "reconnect" | "rest" | "quiet";
  days_since_touch: number | null;
}

export interface FocusHome {
  action: FocusAction;
  habits: FocusHabit[];
  fields: FocusField[];
  principle: { id: number; icon: string; title: string; text: string };
  creation_resume_note: string | null;
}

export const fetchFocusHome = () =>
  api.get<FocusHome>("/dashboard/focus").then((r) => r.data);

export const updateFocusHabit = (key: string, minutes: number) =>
  api.put<FocusHabit>(`/dashboard/focus/habits/${key}`, { minutes }).then((r) => r.data);

export const updateCreationResumeNote = (note: string) =>
  api.put<{ note: string }>("/dashboard/focus/resume-note/creation", { note }).then((r) => r.data);

export const updateDashboardPurpose = (text: string) =>
  api.patch<{ text: string }>("/dashboard/purpose", { text }).then((r) => r.data);
