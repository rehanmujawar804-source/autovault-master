import { cn } from "@/lib/cn";

type ButtonVariant = "primary" | "accent" | "gold" | "outline" | "ghost" | "danger";
type ButtonSize = "sm" | "md";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: "bg-navy-950 text-white hover:bg-navy-800 active:bg-navy-950",
  accent:  "bg-amber-500 text-navy-950 hover:bg-amber-600 font-semibold",
  gold:    "bg-yellow-400 text-navy-950 hover:bg-yellow-300 font-bold shadow-sm",
  outline: "bg-white border border-slate-200 text-slate-700 hover:bg-slate-50",
  ghost:   "bg-transparent text-slate-600 hover:bg-slate-100",
  danger:  "bg-red-600 text-white hover:bg-red-700",
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: "px-3 py-1.5 text-xs",
  md: "px-4 py-2.5 text-sm",
};

export default function Button({
  variant = "primary",
  size = "md",
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-xl transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer",
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}
