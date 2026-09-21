"use client";

import { useState, useEffect, useCallback } from "react";
import { usePathname } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import { useStore } from "@/lib/store";
import { AlertTriangle, Menu, X } from "lucide-react";

const NO_SIDEBAR_ROUTES = ["/login"];
const SIDEBAR_COLLAPSED_KEY = "autovault_sidebar_collapsed";

export function applyGlobalTheme() {
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem("autovault_settings");
    const settings = raw ? JSON.parse(raw) : null;
    const theme = settings?.theme || "light";
    let isDark = false;
    if (theme === "dark") {
      isDark = true;
    } else if (theme === "system") {
      isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    }
    if (isDark) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  } catch {
    document.documentElement.classList.remove("dark");
  }
}

export default function AppShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const hideSidebar = NO_SIDEBAR_ROUTES.includes(pathname);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  let quotaExceeded = false;
  try {
    const store = useStore();
    quotaExceeded = Boolean(store?.quotaExceeded);
  } catch {
    // Non-blocking if context not mounted
  }

  const closeMobile = useCallback(() => {
    setIsMobileOpen(false);
  }, []);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
      if (saved === "true") {
        setIsCollapsed(true);
      }
    } catch {
      // Fallback to expanded
    }

    applyGlobalTheme();
    const handleStorage = (e: StorageEvent) => {
      if (e.key === "autovault_settings") {
        applyGlobalTheme();
      }
    };
    window.addEventListener("storage", handleStorage);
    window.addEventListener("autovault_theme_change", applyGlobalTheme);
    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("autovault_theme_change", applyGlobalTheme);
    };
  }, [pathname]);

  // Lock body scroll when mobile drawer is open
  useEffect(() => {
    if (isMobileOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isMobileOpen]);

  // Close mobile drawer on Esc key or resize to desktop (>= 1024px)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isMobileOpen) {
        setIsMobileOpen(false);
      }
    };
    const handleResize = () => {
      if (window.innerWidth >= 1024 && isMobileOpen) {
        setIsMobileOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", handleResize);
    };
  }, [isMobileOpen]);

  // Close mobile drawer automatically when pathname changes
  useEffect(() => {
    setIsMobileOpen(false);
  }, [pathname]);

  const toggleCollapse = () => {
    setIsCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next));
      } catch {
        // Non-blocking
      }
      return next;
    });
  };

  if (hideSidebar) {
    return <>{children}</>;
  }

  const desktopPaddingLeft = isCollapsed ? "lg:pl-[96px]" : "lg:pl-[280px]";
  const focusClass =
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400 focus-visible:ring-offset-2 focus-visible:ring-offset-navy-950";

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-900 text-slate-900 dark:text-slate-100 flex flex-col w-full max-w-full min-w-0">
      {/* ── Mobile Top Sticky Bar (< 1024px / lg:hidden) ────────────────── */}
      <header className="lg:hidden sticky top-0 z-30 h-14 bg-navy-950 text-white border-b border-white/10 px-4 flex items-center justify-between shrink-0 shadow-md">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={() => setIsMobileOpen(true)}
            title="Open navigation menu"
            aria-label="Open navigation menu"
            aria-expanded={isMobileOpen}
            className={`w-11 h-11 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center text-slate-200 hover:text-white transition-colors cursor-pointer shrink-0 ${focusClass}`}
          >
            <Menu size={22} />
          </button>

          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-full overflow-hidden shrink-0 ring-2 ring-yellow-400/40 bg-[#0f1a2e] flex items-center justify-center">
              <img
                src="/7star-logo.png"
                alt="7 Star Car Accessories"
                className="object-cover w-full h-full rounded-full"
              />
            </div>
            <span className="text-sm font-black text-white truncate tracking-tight">
              7 Star Car Accessories
            </span>
          </div>
        </div>
      </header>

      {/* ── Mobile Drawer Backdrop Overlay (< 1024px / lg:hidden) ───────── */}
      {isMobileOpen && (
        <div
          onClick={closeMobile}
          aria-hidden="true"
          className="fixed inset-0 bg-black/60 z-40 backdrop-blur-xs transition-opacity duration-300 lg:hidden"
        />
      )}

      {/* ── Mobile Drawer Container (Slide-over transform) ─────────────── */}
      <div
        className={`fixed top-0 bottom-0 left-0 z-50 w-64 bg-navy-950 shadow-2xl transition-transform duration-300 ease-in-out lg:hidden ${
          isMobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="relative h-full flex flex-col">
          <button
            type="button"
            onClick={closeMobile}
            title="Close navigation menu"
            aria-label="Close navigation menu"
            className={`absolute top-4 right-3 z-50 w-8 h-8 rounded-lg bg-white/10 text-slate-300 hover:text-white flex items-center justify-center transition-colors cursor-pointer ${focusClass}`}
          >
            <X size={18} />
          </button>
          <Sidebar
            isCollapsed={false}
            toggleCollapse={toggleCollapse}
            onNavigate={closeMobile}
          />
        </div>
      </div>

      {/* ── Desktop Fixed Sidebar (>= 1024px / hidden lg:block) ───────── */}
      <div className="hidden lg:block">
        <Sidebar isCollapsed={isCollapsed} toggleCollapse={toggleCollapse} />
      </div>

      {/* ── Main App Content Container ────────────────────────────────── */}
      <main className={`w-full max-w-full min-w-0 flex-1 p-4 sm:p-6 lg:pt-6 lg:pr-6 lg:pb-6 box-border transition-[padding-left] duration-200 ease-in-out ${desktopPaddingLeft}`}>
        {quotaExceeded && (
          <div className="mb-4 bg-amber-500/15 border border-amber-500/40 text-amber-900 dark:text-amber-200 px-4 py-3 rounded-xl text-xs font-semibold flex items-center justify-between shadow-sm">
            <div className="flex items-center gap-2">
              <AlertTriangle size={16} className="text-amber-600 dark:text-amber-400 shrink-0" />
              <span>
                Storage Limit Reached — AutoVault could not save your latest changes to browser memory (5MB limit). Please export a JSON backup in Settings to prevent data loss.
              </span>
            </div>
          </div>
        )}
        {children}
      </main>
    </div>
  );
}


