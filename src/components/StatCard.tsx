import { cn } from "@/lib/cn";

type Accent = "neutral" | "navy" | "amber" | "green" | "red" | "blue";

type StatCardProps = {
  title: string;
  value: string;
  valueClassName?: string;
  subtitle?: string;
  icon?: React.ComponentType<{ size?: number; className?: string }>;
  accent?: Accent;
};

const ACCENT_BORDER: Record<Accent, string> = {
  neutral: "",
  navy: "border-l-[3px] border-l-navy-700 rounded-l-none",
  amber: "border-l-[3px] border-l-amber-500 rounded-l-none",
  green: "border-l-[3px] border-l-green-600 rounded-l-none",
  red: "border-l-[3px] border-l-red-500 rounded-l-none",
  blue: "border-l-[3px] border-l-blue-500 rounded-l-none",
};

const ACCENT_ICON_BG: Record<Accent, string> = {
  neutral: "bg-slate-100 text-slate-500",
  navy: "bg-navy-50 text-navy-700",
  amber: "bg-amber-50 text-amber-700",
  green: "bg-green-50 text-green-700",
  red: "bg-red-50 text-red-600",
  blue: "bg-blue-50 text-blue-600",
};

export default function StatCard({
  title,
  value,
  valueClassName = "",
  subtitle,
  icon: Icon,
  accent = "neutral",
}: StatCardProps) {
  return (
    <div
      className={cn(
        "bg-white rounded-2xl border border-slate-200 p-5 hover:shadow-md transition-shadow",
        ACCENT_BORDER[accent]
      )}
    >
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-slate-500 text-sm">{title}</h3>
          <p className={cn("text-2xl font-semibold text-navy-900 mt-1", valueClassName)}>
            {value}
          </p>
          {subtitle && (
            <p className="text-xs text-slate-400 mt-1">{subtitle}</p>
          )}
        </div>
        {Icon && (
          <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center shrink-0", ACCENT_ICON_BG[accent])}>
            <Icon size={18} />
          </div>
        )}
      </div>
    </div>
  );
}
