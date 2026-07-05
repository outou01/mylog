import axios from "axios";

const api = axios.create({ baseURL: "/api" });

export type DreamCategory = "creation" | "social" | "job_search" | "workout" | string;

export interface Dream {
  id: number;
  title: string;
  category: DreamCategory;
  description: string | null;
  image_url: string | null;
  icon: string | null;
  progress: number;
  linked_project_id: number | null;
}

export interface DreamPayload {
  title: string;
  category: string;
  description: string | null;
  image_url: string | null;
  icon: string | null;
  progress: number;
}

export interface DreamProject {
  id: number;
  dream_id: number;
  title: string;
  category: string;
  description: string | null;
  current_position: string | null;
  steps: string[];
}

export interface SeedTask {
  id: number;
  title: string;
  category: string;
  dream_id: number | null;
  project_id: number | null;
  section: string | null;
  description: string | null;
  purpose: string | null;
  estimated_minutes: number;
  status: string;
  notes: string | null;
}

export interface SeedPayload {
  title: string;
  category: string;
  dream_id: number | null;
  project_id: number | null;
  section: string | null;
  description: string | null;
  purpose: string | null;
  estimated_minutes: number;
  status: string;
  notes: string | null;
}

export interface ProjectDetail {
  dream: Dream;
  project: DreamProject;
  seeds: SeedTask[];
}

export interface PlantedSeed {
  schedule_block_id: number;
  date: string;
  start_time: string;
  end_time: string;
}

export const fetchDreams = () =>
  api.get<Dream[]>("/dreams").then((r) => r.data);

export const createDream = (data: DreamPayload) =>
  api.post<Dream>("/dreams", data).then((r) => r.data);

export const updateDream = (id: number, data: DreamPayload) =>
  api.patch<Dream>(`/dreams/${id}`, data).then((r) => r.data);

export const deleteDream = (id: number) =>
  api.delete(`/dreams/${id}`).then((r) => r.data);

export const fetchProjectDetail = (dreamId: number) =>
  api.get<ProjectDetail>(`/dreams/${dreamId}/project`).then((r) => r.data);

export const fetchSeeds = () =>
  api.get<SeedTask[]>("/dreams/seeds/list").then((r) => r.data);

export const createSeed = (data: SeedPayload) =>
  api.post<SeedTask>("/dreams/seeds", data).then((r) => r.data);

export const updateSeed = (id: number, data: SeedPayload) =>
  api.patch<SeedTask>(`/dreams/seeds/${id}`, data).then((r) => r.data);

export const deleteSeed = (id: number) =>
  api.delete(`/dreams/seeds/${id}`).then((r) => r.data);

export const plantSeed = (id: number) =>
  api.post<PlantedSeed>(`/dreams/seeds/${id}/plant`, {}).then((r) => r.data);
