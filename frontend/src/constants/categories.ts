export const SCHEDULE_CATEGORIES = [
  { key: "creation", label: "創作", shortLabel: "創作", fieldKey: "creation" },
  { key: "workout", label: "筋トレ", shortLabel: "筋トレ", fieldKey: "body" },
  { key: "job_search", label: "転職活動", shortLabel: "転職", fieldKey: "knowledge" },
  { key: "social", label: "発信・交流", shortLabel: "交流", fieldKey: "life" },
  { key: "reading", label: "読書", shortLabel: "読書", fieldKey: "knowledge" },
  { key: "meditation", label: "瞑想", shortLabel: "瞑想", fieldKey: "mind" },
] as const;

export const FIELD_CATEGORIES = [
  { key: "body", name: "身体", icon: "💪", color: "#f9734a" },
  { key: "mind", name: "心", icon: "🧘", color: "#9fc9d8" },
  { key: "knowledge", name: "知識", icon: "📚", color: "#5d9cec" },
  { key: "creation", name: "創作", icon: "🎨", color: "#a970d6" },
  { key: "life", name: "発信・交流", icon: "🤝", color: "#58b77b" },
] as const;

export function scheduleCategoryLabel(key: string) {
  return SCHEDULE_CATEGORIES.find((category) => category.key === key)?.label ?? key;
}

export function scheduleKeysForField(fieldKey: string): string[] {
  return SCHEDULE_CATEGORIES
    .filter((category) => category.fieldKey === fieldKey)
    .map((category) => category.key);
}
