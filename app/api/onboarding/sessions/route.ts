import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import {
  buildDefaultProfile,
  CreateSessionRequestSchema,
  CreateSessionResponseSchema,
} from "@/lib/validation/schemas";
import { getOptionalUserId } from "@/utils/supabase/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SESSION_COOKIE = "onboarding_session_id";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = CreateSessionRequestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "INVALID_INPUT",
          message: "Invalid onboarding session request",
          retryable: false,
        },
      },
      { status: 400 },
    );
  }

  const input = parsed.data;
  const defaultProfile = buildDefaultProfile(input.genre_main, input.genre_sub);

  try {
    const userId = await getOptionalUserId();
    const session = await prisma.onboardingSession.create({
      data: {
        user_id: userId,
        title: input.title?.trim() || null,
        genre_main: input.genre_main,
        genre_sub: input.genre_sub,
      },
    });

    const data = CreateSessionResponseSchema.parse({
      session_id: session.id,
      default_profile: defaultProfile,
    });

    const response = NextResponse.json({ ok: true, data });
    response.cookies.set(SESSION_COOKIE, session.id, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });

    return response;
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "INTERNAL",
          message,
          retryable: true,
        },
      },
      { status: 500 },
    );
  }
}
