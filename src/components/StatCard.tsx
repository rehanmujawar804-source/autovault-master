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
        "bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 hover:shadow-md transition-shadow h-full flex flex-col justify-between",
        ACCENT_BORDER[accent]
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="text-slate-500 text-xs sm:text-sm font-medium truncate" title={title}>{title}</h3>
          <p className={cn("text-lg sm:text-xl md:text-2xl font-extrabold font-mono tabular-nums tracking-tight text-navy-900 mt-1 truncate", valueClassName)} title={value}>
            {value}
          </p>
          {subtitle && (
            <p className="text-[11px] sm:text-xs text-slate-400 mt-1 font-medium line-clamp-2">{subtitle}</p>
          )}
        </div>
        {Icon && (
          <div className={cn("w-8.5 h-8.5 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center shrink-0 shadow-xs mt-0.5", ACCENT_ICON_BG[accent])}>
            <Icon size={18} />
          </div>
        )}
      </div>
    </div>
  );
}
