import { Sidebar } from "@/components/layout/Sidebar";
import { ConfirmProvider } from "@/components/ui/ConfirmDialog";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ConfirmProvider>
      <div className="flex h-screen bg-background overflow-hidden">
        <Sidebar />
        <main className="flex-1 ml-[var(--width-sidebar)] flex flex-col h-full overflow-hidden relative">
          {/* Subtle background gradient to add depth to the main area */}
          <div className="absolute inset-0 bg-gradient-to-tr from-secondary/10 via-transparent to-primary/5 pointer-events-none" />

          <div className="flex-1 overflow-hidden flex flex-col relative z-10">
            {children}
          </div>
        </main>
      </div>
    </ConfirmProvider>
  );
}
