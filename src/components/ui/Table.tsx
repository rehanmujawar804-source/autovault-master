import { cn } from "@/lib/cn";

export function Table({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">{children}</table>
    </div>
  );
}

export function THead({ children }: { children: React.ReactNode }) {
  return <thead className="bg-slate-50">{children}</thead>;
}

export function TRow({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <tr className={cn("border-t border-slate-100", className)}>
      {children}
    </tr>
  );
}

export function TH({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <th
      className={cn(
        "text-left p-4 font-medium text-slate-500 text-xs uppercase tracking-wide",
        className
      )}
    >
      {children}
    </th>
  );
}

export function TD({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <td className={cn("p-4 text-slate-700", className)}>{children}</td>;
}

export function EmptyState({ message }: { message: string }) {
  return (
    <tr>
      <td colSpan={100} className="p-10 text-center text-slate-400 text-sm">
        {message}
      </td>
    </tr>
  );
}
