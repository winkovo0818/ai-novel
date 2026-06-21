import { cookies } from "next/headers";

import { Sidebar } from "@/components/layout/Sidebar";
import { ConfirmProvider } from "@/components/ui/ConfirmDialog";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const sidebarCollapsed = (await cookies()).get("sidebar-collapsed")?.value === "true";

  return (
    <ConfirmProvider>
      <div
        data-app-shell
        data-sidebar-collapsed={sidebarCollapsed}
        className="flex h-screen bg-background overflow-hidden relative"
      >
        <Sidebar defaultCollapsed={sidebarCollapsed} />
        <main className="flex-1 ml-0 flex flex-col h-full overflow-hidden relative bg-background mesh-gradient-bg">
          {/* Subtle noise overlay to add tactile feel to the mesh gradient */}
          <div className="app-noise-overlay absolute inset-0 opacity-[0.015] pointer-events-none z-0" />

          <div className="flex-1 overflow-hidden flex flex-col relative z-10">
            {children}
          </div>
        </main>
      </div>
    </ConfirmProvider>
  );
}
