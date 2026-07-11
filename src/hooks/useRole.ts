"use client";

import { useState } from "react";
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

  function logout() {
    localStorage.removeItem("role");
    setRole(null);
    router.push("/login");
  }

  /**
   * Call inside a page's top level to block staff from viewing an
   * owner-only page (e.g. Analytics, Settings). Redirects to /dashboard.
   * Call inside a useEffect, after `loading` is false.
   */
  function requireOwner() {
    if (role !== "owner") {
      router.push("/dashboard");
    }
  }

  /**
   * Call to block anyone without a role from viewing a protected page.
   * Redirects to /login.
   */
  function requireAuth() {
    if (!role) {
      router.push("/login");
    }
  }

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
