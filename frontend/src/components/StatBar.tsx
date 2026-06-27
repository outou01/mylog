interface Props {
  label: string;
  value: number;
  max?: number;
  color: string;
}

export default function StatBar({ label, value, max = 100, color }: Props) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  return (
    <div className="stat-bar">
      <div className="stat-bar-header">
        <span className="stat-label">{label}</span>
        <span className="stat-value" style={{ color }}>{value} / {max}</span>
      </div>
      <div className="stat-bar-track">
        <div className="stat-bar-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}
