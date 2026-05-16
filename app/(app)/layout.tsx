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
        <main className="flex-1 ml-[var(--width-sidebar)] flex flex-col h-full overflow-hidden relative bg-background">
          {/* Subtle background gradient to add depth to the main area */}
          <div className="absolute inset-0 bg-gradient-to-tr from-secondary/20 via-transparent to-primary/5 pointer-events-none" />

          <div className="flex-1 overflow-hidden flex flex-col relative z-10">
            {children}
          </div>
        </main>
      </div>
    </ConfirmProvider>
  );
}
