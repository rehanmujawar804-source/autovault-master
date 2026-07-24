"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import Sidebar from "@/components/Sidebar";

const NO_SIDEBAR_ROUTES = ["/login"];

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

  useEffect(() => {
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

  if (hideSidebar) {
    return <>{children}</>;
  }

  return (
    <div className="flex">
      <Sidebar />
      <main className="flex-1 min-w-0 p-6">{children}</main>
    </div>
  );
}
