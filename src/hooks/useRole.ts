"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";

export type Role = "owner" | "staff" | null;

/**
 * Centralized auth/role hook.
 *
 * Reads the role from localStorage synchronously on mount via a useState
 * lazy initializer. This avoids the need for a useEffect + setState pattern
 * (which caused a "flash of wrong content" bug and a lint violation).
 *
 * `loading` is kept for API compatibility but is always false because the
 * role is available before first render.
 */
export function useRole() {
  const [role, setRole] = useState<Role>(() => {
    if (typeof window === "undefined") return null;
    return (localStorage.getItem("role") as Role) ?? null;
  });
  const router = useRouter();

  const logout = useCallback(() => {
    localStorage.removeItem("role");
    setRole(null);
    if (typeof window !== "undefined") {
      window.location.href = "/login";
    } else {
      router.push("/login");
    }
  }, [router]);

  /**
   * Call inside a page's top level to block unauthorized access to an
   * owner-only page (e.g. Analytics, Settings, Finance, Suppliers).
   * Unauthenticated users are sent to /login.
   * Logged-in Staff users are sent to /dashboard.
   */
  const requireOwner = useCallback(() => {
    if (typeof window === "undefined") return;
    const currentRole = localStorage.getItem("role") as Role;
    if (!currentRole) {
      window.location.href = "/login";
    } else if (currentRole !== "owner") {
      router.push("/dashboard");
    }
  }, [router]);

  /**
   * Call to block anyone without a role from viewing a protected page.
   * Redirects to /login.
   */
  const requireAuth = useCallback(() => {
    if (typeof window === "undefined") return;
    const currentRole = localStorage.getItem("role") as Role;
    if (!currentRole) {
      window.location.href = "/login";
    }
  }, []);

  return {
    role,
    isOwner: role === "owner",
    isStaff: role === "staff",
    loading: false,
    logout,
    requireOwner,
    requireAuth,
  };
}
