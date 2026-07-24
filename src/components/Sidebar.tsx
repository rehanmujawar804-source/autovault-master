"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRole } from "@/hooks/useRole";
import {
  LayoutDashboard,
  Package,
  Receipt,
  FileText,
  Users,
  Truck,
  BarChart3,
  Car,
  Settings,
  LogOut,
  Wallet,
  PanelLeftClose,
} from "lucide-react";

const NAV_ITEMS = [
  { href: "/dashboard",  label: "Dashboard",  icon: LayoutDashboard },
  { href: "/inventory",  label: "Inventory",  icon: Package },
  { href: "/billing",    label: "Billing",    icon: Receipt },
  { href: "/invoices",   label: "Invoices",   icon: FileText },
  { href: "/customers",  label: "Customers",  icon: Users },
];

const OWNER_ONLY_ITEMS = [
  { href: "/suppliers",  label: "Suppliers",  icon: Truck },
  { href: "/finance",    label: "Finance",    icon: Wallet },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
];

const SHARED_BOTTOM_ITEMS = [
  { href: "/vehicle-fitment", label: "Vehicle Fitment", icon: Car },
];

const OWNER_ONLY_BOTTOM_ITEMS = [
  { href: "/settings", label: "Settings", icon: Settings },
];

function NavLink({
  href,
  label,
  icon: Icon,
  active,
  isCollapsed,
}: {
  href: string;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  active: boolean;
  isCollapsed: boolean;
}) {
  const activeClass = active
    ? "bg-yellow-400 text-navy-950 font-bold shadow-sm"
    : "text-slate-300 hover:bg-white/10 hover:text-white";

  if (isCollapsed) {
    return (
      <Link
        href={href}
        title={label}
        className={`w-10 h-10 flex items-center justify-center rounded-xl text-sm transition-colors duration-150 shrink-0 mx-auto box-border ${activeClass}`}
      >
        <Icon size={18} className={active ? "text-navy-950 shrink-0" : "shrink-0"} />
      </Link>
    );
  }

  return (
    <Link
      href={href}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors duration-150 ${activeClass}`}
    >
      <Icon size={18} className={active ? "text-navy-950 shrink-0" : "shrink-0"} />
      <span className="leading-none truncate min-w-0">{label}</span>
    </Link>
  );
}

export default function Sidebar({
  isCollapsed,
  toggleCollapse,
}: {
  isCollapsed: boolean;
  toggleCollapse: () => void;
}) {
  const pathname = usePathname();
  const { role, loading, isOwner, logout } = useRole();

  return (
    <aside
      className={`fixed top-0 left-0 bottom-0 h-screen z-40 flex flex-col bg-navy-950 text-white border-r border-white/10 transition-[width] duration-200 ease-in-out select-none overflow-x-hidden box-border ${
        isCollapsed ? "w-[72px]" : "w-64"
      }`}
    >
      {/* ── Fixed Brand / Header Block ────────────────────────────────── */}
      <div
        className={`border-b border-white/10 shrink-0 overflow-x-hidden box-border ${
          isCollapsed ? "py-4 px-2 flex items-center justify-center" : "px-3 py-4 flex items-center justify-between"
        }`}
      >
        {isCollapsed ? (
          <button
            type="button"
            onClick={toggleCollapse}
            title="Expand sidebar"
            className="w-10 h-10 rounded-full overflow-hidden shrink-0 ring-2 ring-yellow-400/40 hover:ring-yellow-400 bg-[#0f1a2e] flex items-center justify-center shadow-md cursor-pointer hover:scale-105 transition-all p-0 border-0 focus:outline-none"
          >
            <img
              src="/7star-logo.png"
              alt="7 Star Car Accessories"
              className="object-cover w-full h-full rounded-full pointer-events-none"
            />
          </button>
        ) : (
          <>
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-full overflow-hidden shrink-0 ring-2 ring-yellow-400/40 bg-[#0f1a2e] flex items-center justify-center shadow-md">
                <img
                  src="/7star-logo.png"
                  alt="7 Star Car Accessories"
                  className="object-cover w-full h-full rounded-full"
                />
              </div>

              <div className="min-w-0">
                <div className="text-[13px] font-black text-white leading-tight tracking-tight truncate">
                  7 Star
                </div>
                <div className="text-[10px] text-yellow-400 leading-tight font-semibold tracking-wide truncate">
                  Car Accessories
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={toggleCollapse}
              title="Collapse Sidebar"
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer shrink-0"
            >
              <PanelLeftClose size={18} />
            </button>
          </>
        )}
      </div>

      {/* ── Internal Scrollable Navigation Area ───────────────────────── */}
      <nav className={`flex-1 min-h-0 min-w-0 overflow-y-auto overflow-x-hidden scrollbar-hide py-3 flex flex-col gap-1 ${
        isCollapsed ? "px-2 items-center" : "px-3"
      }`}>
        {NAV_ITEMS.map((item) => (
          <NavLink key={item.href} {...item} active={pathname === item.href} isCollapsed={isCollapsed} />
        ))}

        {!loading && isOwner &&
          OWNER_ONLY_ITEMS.map((item) => (
            <NavLink key={item.href} {...item} active={pathname === item.href} isCollapsed={isCollapsed} />
          ))}

        <div className={`h-px bg-white/10 my-2 shrink-0 ${isCollapsed ? "w-8 mx-auto" : "w-full"}`} />

        {SHARED_BOTTOM_ITEMS.map((item) => (
          <NavLink key={item.href} {...item} active={pathname === item.href} isCollapsed={isCollapsed} />
        ))}

        {!loading && isOwner &&
          OWNER_ONLY_BOTTOM_ITEMS.map((item) => (
            <NavLink key={item.href} {...item} active={pathname === item.href} isCollapsed={isCollapsed} />
          ))}
      </nav>

      {/* ── Fixed Bottom User Profile & Logout Block ─────────────────── */}
      <div className={`border-t border-white/10 shrink-0 overflow-x-hidden box-border ${
        isCollapsed ? "p-2 flex flex-col items-center gap-1.5" : "p-3 space-y-1.5"
      }`}>
        {!loading && role && (
          isCollapsed ? (
            <div
              title={role === "owner" ? "Owner (Full access)" : "Staff (Limited access)"}
              className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center shrink-0 mx-auto cursor-default"
            >
              <div className="w-7 h-7 rounded-full bg-yellow-400 flex items-center justify-center text-[11px] font-black text-navy-950 shrink-0 shadow-xs">
                {role === "owner" ? "OW" : "ST"}
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-white/5">
              <div className="w-7 h-7 rounded-full bg-yellow-400 flex items-center justify-center text-[11px] font-black text-navy-950 shrink-0 shadow-xs">
                {role === "owner" ? "OW" : "ST"}
              </div>
              <div className="min-w-0">
                <div className="text-xs text-white font-semibold capitalize truncate">{role}</div>
                <div className="text-[10px] text-slate-400 leading-tight truncate">
                  {role === "owner" ? "Full access" : "Limited access"}
                </div>
              </div>
            </div>
          )
        )}

        <button
          onClick={logout}
          title={isCollapsed ? "Logout" : undefined}
          className={`flex items-center text-sm text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-colors cursor-pointer shrink-0 ${
            isCollapsed
              ? "w-10 h-10 justify-center rounded-xl mx-auto"
              : "w-full gap-3 px-3 py-2.5 rounded-xl"
          }`}
        >
          <LogOut size={18} className="shrink-0" />
          {!isCollapsed && <span>Logout</span>}
        </button>
      </div>
    </aside>
  );
}
