import { describe, it, expect, vi } from "vitest";
import { OpenAIProvider } from "../../src/providers/openai.js";

function fakeClient(overrides: Record<string, unknown> = {}) {
  return {
    images: {
      generate: vi.fn(async () => ({ data: [{ b64_json: "aW1n" }] }))
    },
    videos: {
      create: vi.fn(async () => ({ id: "vid_1", status: "queued" })),
      retrieve: vi.fn(async () => ({ id: "vid_1", status: "completed" })),
      downloadContent: vi.fn(async () => new Response(Buffer.from("mp4data")))
    },
    ...overrides
  } as never;
}

describe("OpenAIProvider", () => {
  it("maps aspect ratio to size and returns base64 output", async () => {
    const client = fakeClient();
    const p = new OpenAIProvider("sk-x", client);
    const res = await p.generateImage({ prompt: "a cat", aspectRatio: "16:9", numImages: 1 });
    const call = (client as never as { images: { generate: ReturnType<typeof vi.fn> } }).images.generate.mock.calls[0][0];
    expect(call.model).toBe("gpt-image-1");
    expect(call.size).toBe("1536x1024");
    expect(res.outputs[0].base64).toBe("aW1n");
    expect(res.outputs[0].mimeType).toBe("image/png");
  });

  it("polls video to completion and returns bytes", async () => {
    const p = new OpenAIProvider("sk-x", fakeClient());
    const res = await p.generateVideo({ prompt: "waves", aspectRatio: "16:9" }, async () => {});
    expect(res.outputs[0].base64).toBeDefined();
    expect(res.outputs[0].mimeType).toBe("video/mp4");
  });

  it("surfaces clamped video duration in metadata", async () => {
    const p = new OpenAIProvider("sk-x", fakeClient());
    const res = await p.generateVideo({ prompt: "waves", aspectRatio: "16:9", durationSeconds: 20 }, async () => {});
    expect(res.metadata.seconds).toBe("12"); // 20 clamps to nearest allowed bucket
  });

  it("reports capabilities", () => {
    const p = new OpenAIProvider("sk-x", fakeClient());
    const caps = p.capabilities();
    expect(caps.image).toBe(true);
    expect(caps.video).toBe(true);
    expect(caps.models.length).toBeGreaterThan(0);
  });

  it("never includes the api key in thrown errors", async () => {
    const client = fakeClient({ images: { generate: vi.fn(async () => { throw new Error("401 unauthorized"); }) } });
    const p = new OpenAIProvider("sk-supersecret", client);
    await expect(p.generateImage({ prompt: "x", aspectRatio: "1:1", numImages: 1 }))
      .rejects.toThrow(/^((?!supersecret).)*$/s);
  });
});
