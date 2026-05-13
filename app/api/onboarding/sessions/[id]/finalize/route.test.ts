import { beforeEach, describe, expect, it, vi } from "vitest";

const findUnique = vi.fn();
const findUniqueSession = vi.fn();
const create = vi.fn();
const update = vi.fn();
const authorizeOnboardingSession = vi.fn();
const moderateContent = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    onboardingSession: { findUnique: findUniqueSession, update },
    novel: { create, findUnique },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn({
      novel: { create, findUnique },
      onboardingSession: { update },
    }),
  },
}));

vi.mock("@/lib/auth/onboardingAccess", () => ({
  authorizeOnboardingSession,
}));

vi.mock("@/lib/moderation/moderate", () => ({
  moderateContent,
  stringifyForModeration: (v: unknown) => (typeof v === "string" ? v : JSON.stringify(v)),
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

function buildMinimalValidBible(): Record<string, unknown> {
  return {
    meta: { suggested_title: "Test", alternative_titles: ["Alt1", "Alt2", "Alt3"] },
    characters: [
      {
        role: "protagonist",
        name: "Alice",
        age: 20,
        appearance: "A young woman with dark hair",
        personality: "Brave and curious",
        catchphrase: "Let's go!",
        abilities: ["sword fighting"],
        goals: "Save the kingdom",
        motivation: "Protect her family",
        secrets: ["She is the lost princess"],
        relations: [],
      },
      {
        role: "mentor",
        name: "Bob",
        age: 60,
        appearance: "An old wizard with a long beard",
        personality: "Wise and calm",
        catchphrase: "Patience, my child",
        abilities: ["magic"],
        goals: "Train the next hero",
        motivation: "Redeem his past mistakes",
        secrets: ["He caused the catastrophe"],
        relations: [],
      },
      {
        role: "antagonist",
        name: "Carol",
        age: 30,
        appearance: "A mysterious figure in black",
        personality: "Cruel and cunning",
        catchphrase: "You will bow before me",
        abilities: ["dark magic"],
        goals: "Conquer the world",
        motivation: "Revenge for her exile",
        secrets: ["She is Alice's sister"],
        relations: [],
      },
    ],
    world: {
      setting_summary: "A medieval fantasy world with magic and dragons spanning many kingdoms.",
      factions: [
        { name: "Kingdom", alignment: "good", role: "rulers" },
        { name: "Rebels", alignment: "evil", role: "opposition" },
      ],
      rules: ["Magic requires mana", "Dragons are sacred"],
      geography: ["Northern Mountains", "Southern Plains"],
    },
    outline: {
      volume_1: {
        name: "Vol1",
        theme: "Hero's journey",
        chapter_count_estimate: 10,
        chapters: Array.from({ length: 8 }, (_, i) => ({
          index: i + 1,
          title: `Chapter ${i + 1}`,
          summary: "A brief summary of what happens in this chapter.",
        })),
      },
    },
    first_chapter_beats: Array.from({ length: 5 }, (_, i) => ({
      beat: i + 1,
      scene: `Scene ${i + 1}`,
      purpose: "Advance the plot",
    })),
  };
}

const validBible = buildMinimalValidBible();

const validProfile = { genre_main: "web", genre_sub: "xuanhuan" };
const validBody = { bible_draft: validBible, profile: validProfile, action: "save_only" };

describe("POST /api/onboarding/sessions/[id]/finalize", () => {
  it("returns 401 when the caller is not authenticated", async () => {
    authorizeOnboardingSession.mockResolvedValue({
      ok: false,
      code: "UNAUTHORIZED",
      message: "Login required",
      status: 401,
    });

    const { POST } = await import("./route");
    const res = await POST(
      new Request("http://localhost/x", {
        method: "POST",
        body: JSON.stringify(validBody),
      }),
      { params: Promise.resolve({ id: "session-1" }) },
    );

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error.code).toBe("UNAUTHORIZED");
    expect(moderateContent).not.toHaveBeenCalled();
    expect(findUnique).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it("hides another user's session as 404 without finalizing anything", async () => {
    authorizeOnboardingSession.mockResolvedValue({
      ok: false,
      code: "SESSION_NOT_FOUND",
      message: "Onboarding session not found",
      status: 404,
    });

    const { POST } = await import("./route");
    const res = await POST(
      new Request("http://localhost/x", {
        method: "POST",
        body: JSON.stringify(validBody),
      }),
      { params: Promise.resolve({ id: "someone-elses" }) },
    );

    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error.code).toBe("SESSION_NOT_FOUND");
    expect(moderateContent).not.toHaveBeenCalled();
    expect(findUnique).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it("creates a novel when session is valid and Bible passes moderation", async () => {
    authorizeOnboardingSession.mockResolvedValue({
      ok: true,
      userId: "user-1",
      session: {
        id: "session-1",
        title: "My Novel",
        status: "active",
        bible_draft: validBible,
      },
    });
    moderateContent.mockResolvedValue({ allowed: true });
    create.mockResolvedValue({ id: "550e8400-e29b-41d4-a716-446655440000" });
    update.mockResolvedValue({});

    const { POST } = await import("./route");
    const res = await POST(
      new Request("http://localhost/x", {
        method: "POST",
        body: JSON.stringify(validBody),
      }),
      { params: Promise.resolve({ id: "session-1" }) },
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.data.novel_id).toBe("550e8400-e29b-41d4-a716-446655440000");
    expect(create).toHaveBeenCalled();
  });

  it("returns 400 when moderation blocks the Bible", async () => {
    authorizeOnboardingSession.mockResolvedValue({
      ok: true,
      userId: "user-1",
      session: {
        id: "session-1",
        title: null,
        status: "active",
        bible_draft: validBible,
      },
    });
    moderateContent.mockResolvedValue({ allowed: false, code: "MODERATION_BLOCKED", reason: "Blocked" });

    const { POST } = await import("./route");
    const res = await POST(
      new Request("http://localhost/x", {
        method: "POST",
        body: JSON.stringify(validBody),
      }),
      { params: Promise.resolve({ id: "session-1" }) },
    );

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.code).toBe("MODERATION_BLOCKED");
    expect(create).not.toHaveBeenCalled();
  });

  it("returns the onboarding access error when session is invalid", async () => {
    authorizeOnboardingSession.mockResolvedValue({
      ok: false,
      code: "SESSION_NOT_FOUND",
      message: "Not found",
      status: 404,
    });

    const { POST } = await import("./route");
    const res = await POST(
      new Request("http://localhost/x", {
        method: "POST",
        body: JSON.stringify(validBody),
      }),
      { params: Promise.resolve({ id: "missing" }) },
    );

    expect(res.status).toBe(404);
    expect(create).not.toHaveBeenCalled();
  });

  it("returns 400 when Bible draft is missing and session has no fallback", async () => {
    authorizeOnboardingSession.mockResolvedValue({
      ok: true,
      userId: "user-1",
      session: {
        id: "session-1",
        title: null,
        status: "active",
        bible_draft: null,
      },
    });

    const { POST } = await import("./route");
    const res = await POST(
      new Request("http://localhost/x", {
        method: "POST",
        body: JSON.stringify({ profile: validProfile, action: "save_only" }),
      }),
      { params: Promise.resolve({ id: "session-1" }) },
    );

    expect(res.status).toBe(400);
    expect(create).not.toHaveBeenCalled();
  });

  it("returns existing novel on duplicate finalize (idempotent)", async () => {
    const existingNovel = { id: "550e8400-e29b-41d4-a716-446655440000", title: "My Novel", session_id: "session-1" };
    authorizeOnboardingSession.mockResolvedValue({
      ok: true,
      userId: "user-1",
      session: {
        id: "session-1",
        title: "My Novel",
        status: "active",
        bible_draft: validBible,
      },
    });
    moderateContent.mockResolvedValue({ allowed: true });
    findUnique.mockResolvedValue(existingNovel);
    update.mockResolvedValue({});

    const { POST } = await import("./route");
    const res = await POST(
      new Request("http://localhost/x", {
        method: "POST",
        body: JSON.stringify(validBody),
      }),
      { params: Promise.resolve({ id: "session-1" }) },
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.data.novel_id).toBe("550e8400-e29b-41d4-a716-446655440000");
    expect(findUnique).toHaveBeenCalledWith({ where: { session_id: "session-1" } });
    expect(findUnique).toHaveBeenCalledWith({ where: { session_id: "session-1" } });
    expect(create).not.toHaveBeenCalled();
  });
});
