import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { encryptApiKey } from "./encryption";

const findFirst = vi.fn();
const fetchMock = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    embeddingModel: { findFirst },
  },
}));

const ORIGINAL_ENV = { ...process.env };
const ORIGINAL_FETCH = globalThis.fetch;

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  globalThis.fetch = ORIGINAL_FETCH;
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  process.env.MODEL_KEY_ENCRYPTION_SECRET = "test-secret-key-for-encryption-32chars!";
  delete process.env.EDGEFN_API_KEY;
  delete process.env.EDGEFN_BASE_URL;
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

function okResponse(embeddings: number[][]) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ embeddings, model: "test" }),
    text: async () => "",
  } as unknown as Response;
}

function openAiOkResponse(embeddings: number[][]) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ data: embeddings.map((embedding) => ({ embedding })), model: "test" }),
    text: async () => "",
  } as unknown as Response;
}

function makeVec(dim: number) {
  return Array.from({ length: dim }, (_, i) => i / dim);
}

describe("createEmbeddings — DB-first resolver", () => {
  it("uses default+enabled DB row, decrypting api_key and hitting its base_url + model", async () => {
    findFirst.mockResolvedValue({
      id: "row-1",
      base_url: "https://api.siliconflow.cn/v1/",
      api_key: encryptApiKey("sk-from-db"),
      model: "BAAI/bge-m3",
      dim: 1024,
    });
    fetchMock.mockResolvedValue(okResponse([makeVec(1024)]));
    const { createEmbeddings } = await import("./embeddings");
    const out = await createEmbeddings(["hello"]);
    expect(out[0].length).toBe(1024);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.siliconflow.cn/v1/embeddings");
    const opts = init as RequestInit;
    expect(opts.headers).toEqual({
      Authorization: "Bearer sk-from-db",
      "Content-Type": "application/json",
    });
    expect(JSON.parse(opts.body as string)).toEqual({ model: "BAAI/bge-m3", input: ["hello"] });
  });

  it("falls back to EDGEFN env when DB has no enabled default", async () => {
    findFirst.mockResolvedValue(null);
    process.env.EDGEFN_API_KEY = "sk-from-env";
    process.env.EDGEFN_BASE_URL = "https://api.edgefn.net/v1";
    fetchMock.mockResolvedValue(okResponse([makeVec(1024)]));
    const { createEmbeddings } = await import("./embeddings");
    await createEmbeddings(["x"]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.edgefn.net/v1/embeddings");
    expect((init as RequestInit).headers).toMatchObject({ Authorization: "Bearer sk-from-env" });
  });

  it("falls back to env when DB query throws (table missing etc.)", async () => {
    findFirst.mockRejectedValue(new Error("relation embedding_models does not exist"));
    process.env.EDGEFN_API_KEY = "sk-from-env";
    fetchMock.mockResolvedValue(okResponse([makeVec(1024)]));
    const { createEmbeddings } = await import("./embeddings");
    await createEmbeddings(["x"]);
    expect(fetchMock).toHaveBeenCalled();
  });

  it("throws when neither DB nor env has a configuration", async () => {
    findFirst.mockResolvedValue(null);
    const { createEmbeddings } = await import("./embeddings");
    await expect(createEmbeddings(["x"])).rejects.toThrow(/no enabled default/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects responses whose embeddings are not 1024-dim", async () => {
    findFirst.mockResolvedValue(null);
    process.env.EDGEFN_API_KEY = "k";
    fetchMock.mockResolvedValue(okResponse([makeVec(512)]));
    const { createEmbeddings } = await import("./embeddings");
    await expect(createEmbeddings(["x"])).rejects.toThrow(/dimension mismatch/);
  });

  it("accepts OpenAI-compatible data[].embedding responses", async () => {
    findFirst.mockResolvedValue(null);
    process.env.EDGEFN_API_KEY = "k";
    fetchMock.mockResolvedValue(openAiOkResponse([makeVec(1024)]));
    const { createEmbeddings } = await import("./embeddings");
    const out = await createEmbeddings(["x"]);
    expect(out[0]).toHaveLength(1024);
  });

  it("throws a clear error when the response shape is unsupported", async () => {
    findFirst.mockResolvedValue(null);
    process.env.EDGEFN_API_KEY = "k";
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ object: "list" }),
      text: async () => "",
    } as unknown as Response);
    const { createEmbeddings } = await import("./embeddings");
    await expect(createEmbeddings(["x"])).rejects.toThrow(/response shape is invalid/);
  });
});
