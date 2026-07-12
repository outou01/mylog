"""Shared category definitions used across scheduling, growth, and recommendations."""

SCHEDULE_CATEGORIES = [
    {"key": "creation", "label": "創作", "color": "#a970d6", "field_key": "creation"},
    {"key": "workout", "label": "筋トレ", "color": "#f9734a", "field_key": "body"},
    {"key": "job_search", "label": "転職活動", "color": "#5d9cec", "field_key": "knowledge"},
    {"key": "social", "label": "発信・交流", "color": "#58b77b", "field_key": "life"},
    {"key": "reading", "label": "読書", "color": "#72a7e8", "field_key": "knowledge"},
    {"key": "meditation", "label": "瞑想", "color": "#9fc9d8", "field_key": "mind"},
]

FIELD_CATEGORIES = [
    {"key": "body", "name": "身体", "icon": "💪", "color": "#f9734a"},
    {"key": "mind", "name": "心", "icon": "🧘", "color": "#9fc9d8"},
    {"key": "knowledge", "name": "知識", "icon": "📚", "color": "#5d9cec"},
    {"key": "creation", "name": "創作", "icon": "🎨", "color": "#a970d6"},
    {"key": "life", "name": "発信・交流", "icon": "🤝", "color": "#58b77b"},
]

SCHEDULE_TO_FIELD = {
    category["key"]: category["field_key"] for category in SCHEDULE_CATEGORIES
}
SCHEDULE_LABELS = {
    category["key"]: category["label"] for category in SCHEDULE_CATEGORIES
}
