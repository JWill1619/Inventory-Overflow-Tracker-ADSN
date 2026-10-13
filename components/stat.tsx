import { number } from "@/lib/display";
export default function Stat({
  icon,
  value,
  label,
  hint,
}: {
  icon: React.ReactNode;
  value: number;
  label: string;
  hint: string;
}) {
  return (
    <div className="stat">
      <div className="stat-top">
        <span>{label}</span>
        <span className="stat-icon">{icon}</span>
      </div>
      <strong>{number(value)}</strong>
      <p>{hint}</p>
    </div>
  );
}
