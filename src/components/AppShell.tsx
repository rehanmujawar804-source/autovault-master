"use client";

import { usePathname } from "next/navigation";
import Sidebar from "@/components/Sidebar";

const NO_SIDEBAR_ROUTES = ["/login"];

export default function AppShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const hideSidebar = NO_SIDEBAR_ROUTES.includes(pathname);

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
