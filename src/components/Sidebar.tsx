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
  Coins,
  Star,
  Wallet,
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
}: {
  href: string;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all duration-150 ${
        active
          ? "bg-yellow-400 text-navy-950 font-bold shadow-sm"
          : "text-slate-300 hover:bg-white/8 hover:text-white"
      }`}
    >
      <Icon size={17} className={active ? "text-navy-950" : ""} />
      <span className="leading-none">{label}</span>
    </Link>
  );
}

export default function Sidebar() {
  const pathname = usePathname();
  const { role, loading, isOwner, logout } = useRole();

  return (
    <aside className="w-64 bg-navy-950 text-white min-h-screen flex flex-col border-r border-white/5 shrink-0">
      {/* ── Brand Block ───────────────────────────────────────────── */}
      <div className="px-4 py-5 border-b border-white/8">
        <div className="flex items-center gap-3">
          {/* Logo image wrapper - clips corners of the white background to show a perfect circle */}
          <div className="w-11 h-11 rounded-full overflow-hidden shrink-0 ring-2 ring-yellow-400/40 bg-[#0f1a2e] flex items-center justify-center shadow-md">
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
      </div>


      {/* ── Navigation ────────────────────────────────────────────── */}
      <nav className="flex-1 px-3 py-4 flex flex-col gap-0.5 overflow-y-auto">
        {NAV_ITEMS.map((item) => (
          <NavLink key={item.href} {...item} active={pathname === item.href} />
        ))}

        {!loading && isOwner &&
          OWNER_ONLY_ITEMS.map((item) => (
            <NavLink key={item.href} {...item} active={pathname === item.href} />
          ))}

        <div className="h-px bg-white/8 my-3" />

        {SHARED_BOTTOM_ITEMS.map((item) => (
          <NavLink key={item.href} {...item} active={pathname === item.href} />
        ))}

        {!loading && isOwner &&
          OWNER_ONLY_BOTTOM_ITEMS.map((item) => (
            <NavLink key={item.href} {...item} active={pathname === item.href} />
          ))}
      </nav>

      {/* ── User / Logout block ───────────────────────────────────── */}
      <div className="px-3 py-4 border-t border-white/8 space-y-1">
        {!loading && role && (
          <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-white/5 mb-2">
            <div className="w-7 h-7 rounded-full bg-yellow-400 flex items-center justify-center text-[11px] font-black text-navy-950 shrink-0">
              {role === "owner" ? "OW" : "ST"}
            </div>
            <div className="min-w-0">
              <div className="text-xs text-white font-semibold capitalize truncate">{role}</div>
              <div className="text-[10px] text-slate-400 leading-tight">
                {role === "owner" ? "Full access" : "Limited access"}
              </div>
            </div>
          </div>
        )}
        <button
          onClick={logout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-colors cursor-pointer"
        >
          <LogOut size={16} />
          Logout
        </button>
      </div>
    </aside>
  );
}
