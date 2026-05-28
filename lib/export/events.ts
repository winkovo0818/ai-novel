import { prisma } from "@/lib/db";
import { errorMessage, logWarn } from "@/lib/observability/logger";

export interface ExportEventInput {
  userId?: string | null;
  novelId?: string | null;
  scope: "novel" | "profile";
  format: string;
  status: "ok" | "err";
  errorCode?: string;
}

export async function recordExportEvent(input: ExportEventInput): Promise<void> {
  try {
    const exportEvent = (
      prisma as typeof prisma & {
        exportEvent?: {
          create(args: {
            data: {
              user_id: string | null;
              novel_id: string | null;
              scope: string;
              format: string;
              status: string;
              error_code: string | null;
            };
          }): Promise<unknown>;
        };
      }
    ).exportEvent;
    if (!exportEvent) return;

    await exportEvent.create({
      data: {
        user_id: input.userId ?? null,
        novel_id: input.novelId ?? null,
        scope: input.scope,
        format: input.format,
        status: input.status,
        error_code: input.errorCode ?? null,
      },
    });
  } catch (err) {
    logWarn("export.event_persist_failed", {
      scope: input.scope,
      format: input.format,
      status: input.status,
      error: errorMessage(err),
    });
  }
}
