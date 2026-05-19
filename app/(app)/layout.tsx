import { cookies } from "next/headers";

import { Sidebar } from "@/components/layout/Sidebar";
import { ConfirmProvider } from "@/components/ui/ConfirmDialog";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const sidebarCollapsed = (await cookies()).get("sidebar-collapsed")?.value === "true";
  const sidebarWidth = sidebarCollapsed ? "80px" : "260px";

  return (
    <ConfirmProvider>
      <div
        className="flex h-screen bg-background overflow-hidden relative"
        style={{ "--width-sidebar": sidebarWidth } as React.CSSProperties}
      >
        <Sidebar defaultCollapsed={sidebarCollapsed} />
        <main className="flex-1 ml-[var(--width-sidebar)] flex flex-col h-full overflow-hidden relative bg-background mesh-gradient-bg">
          {/* Subtle noise overlay to add tactile feel to the mesh gradient */}
          <div className="absolute inset-0 opacity-[0.015] pointer-events-none z-0" style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")` }} />

          <div className="flex-1 overflow-hidden flex flex-col relative z-10">
            {children}
          </div>
        </main>
      </div>
    </ConfirmProvider>
  );
}
