"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import Sidebar from "@/components/Sidebar";

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

  const mainPaddingLeft = isCollapsed ? "pl-[96px]" : "pl-[280px]";

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-900 text-slate-900 dark:text-slate-100 flex flex-col w-full max-w-full min-w-0">
      <Sidebar isCollapsed={isCollapsed} toggleCollapse={toggleCollapse} />
      <main className={`w-full max-w-full min-w-0 flex-1 pt-6 pr-6 pb-6 box-border transition-[padding-left] duration-200 ease-in-out ${mainPaddingLeft}`}>
        {children}
      </main>
    </div>
  );
}
