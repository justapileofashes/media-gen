import { describe, it, expect, vi } from "vitest";
import { FalProvider } from "../../src/providers/fal.js";

describe("FalProvider", () => {
  it("generates images via flux with mapped image_size", async () => {
    const subscribe = vi.fn(async () => ({
      data: { images: [{ url: "https://fal.media/x.png", content_type: "image/png" }] },
      requestId: "r1"
    }));
    const p = new FalProvider("f-key", subscribe);
    const res = await p.generateImage({ prompt: "a fox", aspectRatio: "16:9", numImages: 1 });
    expect(subscribe).toHaveBeenCalledWith("fal-ai/flux/schnell", expect.objectContaining({
      input: expect.objectContaining({ prompt: "a fox", image_size: "landscape_16_9", num_images: 1 })
    }));
    expect(res.outputs[0].url).toBe("https://fal.media/x.png");
  });

  it("generates video and forwards queue progress", async () => {
    const subscribe = vi.fn(async (_e: string, opts: { onQueueUpdate?: (u: { status: string }) => void }) => {
      opts.onQueueUpdate?.({ status: "IN_PROGRESS" });
      return { data: { video: { url: "https://fal.media/v.mp4" } }, requestId: "r2" };
    });
    const p = new FalProvider("f-key", subscribe as never);
    const messages: string[] = [];
    const res = await p.generateVideo({ prompt: "rain", aspectRatio: "16:9", durationSeconds: 5 }, async (m) => { messages.push(m); });
    expect(res.outputs[0].url).toBe("https://fal.media/v.mp4");
    expect(res.outputs[0].mimeType).toBe("video/mp4");
    expect(messages.some((m) => m.includes("IN_PROGRESS"))).toBe(true);
  });

  it("reports capabilities", () => {
    const p = new FalProvider("f-key", vi.fn() as never);
    const caps = p.capabilities();
    expect(caps.image).toBe(true);
    expect(caps.video).toBe(true);
    expect(caps.models.length).toBeGreaterThan(0);
  });

  it("never includes the api key in errors", async () => {
    const subscribe = vi.fn(async () => {
      throw new Error("401 unauthorized for key f-supersecret");
    });
    const p = new FalProvider("f-supersecret", subscribe as never);
    await expect(p.generateImage({ prompt: "x", aspectRatio: "1:1", numImages: 1 }))
      .rejects.toThrow(/^((?!supersecret).)*$/s);
  });

  it("clamps kling aspect and duration and echoes them in metadata", async () => {
    const subscribe = vi.fn(async () => ({ data: { video: { url: "https://fal.media/v.mp4" } }, requestId: "r3" }));
    const p = new FalProvider("f-key", subscribe as never);
    const res = await p.generateVideo({ prompt: "x", aspectRatio: "4:3", durationSeconds: 8 });
    const input = (subscribe.mock.calls[0][1] as { input: Record<string, unknown> }).input;
    expect(input.aspect_ratio).toBe("16:9");
    expect(input.duration).toBe("10");
    expect(res.metadata.aspectRatio).toBe("16:9");
    expect(res.metadata.duration).toBe("10");
  });

  it("does not fail generation when onProgress rejects", async () => {
    const subscribe = vi.fn(async (_e: string, opts: { onQueueUpdate?: (u: { status: string }) => void }) => {
      opts.onQueueUpdate?.({ status: "IN_PROGRESS" });
      return { data: { video: { url: "https://fal.media/v.mp4" } }, requestId: "r4" };
    });
    const p = new FalProvider("f-key", subscribe as never);
    const res = await p.generateVideo({ prompt: "x", aspectRatio: "16:9" }, async () => { throw new Error("transport down"); });
    expect(res.outputs[0].url).toBe("https://fal.media/v.mp4");
  });

  it("times out video generation after 10 minutes", async () => {
    vi.useFakeTimers();
    try {
      const subscribe = vi.fn(() => new Promise(() => {})); // never resolves
      const p = new FalProvider("f-key", subscribe as never);
      const pending = p.generateVideo({ prompt: "x", aspectRatio: "16:9" });
      const assertion = expect(pending).rejects.toThrow(/timed out after 10 min/);
      await vi.advanceTimersByTimeAsync(10 * 60 * 1000 + 1);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });
});
