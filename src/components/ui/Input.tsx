import { cn } from "@/lib/cn";

export function Input({
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-yellow-400 focus:ring-2 focus:ring-yellow-400/30 transition-colors placeholder:text-slate-400 bg-slate-50 hover:bg-white",
        className
      )}
      {...props}
    />
  );
}

export function Textarea({
  className,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-yellow-400 focus:ring-2 focus:ring-yellow-400/30 transition-colors resize-none placeholder:text-slate-400 bg-slate-50 hover:bg-white",
        className
      )}
      {...props}
    />
  );
}

export function Select({
  className,
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-yellow-400 focus:ring-2 focus:ring-yellow-400/30 transition-colors bg-white",
        className
      )}
      {...props}
    >
      {children}
    </select>
  );
}
