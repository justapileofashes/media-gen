import { describe, it, expect, vi } from "vitest";
import { GeminiProvider } from "../../src/providers/gemini.js";

function fakeClient() {
  const doneOp = {
    done: true,
    response: { generatedVideos: [{ video: { videoBytes: Buffer.from("mp4").toString("base64") } }] }
  };
  return {
    models: {
      generateImages: vi.fn(async () => ({ generatedImages: [{ image: { imageBytes: "aW1n" } }] })),
      generateVideos: vi.fn(async () => ({ done: false }))
    },
    operations: {
      getVideosOperation: vi.fn(async () => doneOp)
    }
  } as never;
}

describe("GeminiProvider", () => {
  it("generates images with aspect ratio config", async () => {
    const client = fakeClient();
    const p = new GeminiProvider("g-key", client, 0);
    const res = await p.generateImage({ prompt: "a dog", aspectRatio: "9:16", numImages: 2 });
    const call = (client as never as { models: { generateImages: ReturnType<typeof vi.fn> } }).models.generateImages.mock.calls[0][0];
    expect(call.model).toBe("imagen-4.0-generate-001");
    expect(call.config.aspectRatio).toBe("9:16");
    expect(call.config.numberOfImages).toBe(2);
    expect(res.outputs[0].base64).toBe("aW1n");
  });

  it("polls video operation until done", async () => {
    const p = new GeminiProvider("g-key", fakeClient(), 0);
    const res = await p.generateVideo({ prompt: "clouds", aspectRatio: "16:9" }, async () => {});
    expect(res.outputs[0].mimeType).toBe("video/mp4");
    expect(res.outputs[0].base64).toBeDefined();
  });

  it("never includes the api key in errors", async () => {
    const client = {
      models: { generateImages: vi.fn(async () => { throw new Error("401 unauthorized for key g-supersecret"); }), generateVideos: vi.fn() },
      operations: { getVideosOperation: vi.fn() }
    } as never;
    const p = new GeminiProvider("g-supersecret", client, 0);
    await expect(p.generateImage({ prompt: "x", aspectRatio: "1:1", numImages: 1 }))
      .rejects.toThrow(/^((?!supersecret).)*$/s);
  });

  it("surfaces the uri when Veo returns a link instead of bytes", async () => {
    const doneOp = { done: true, response: { generatedVideos: [{ video: { uri: "https://files.gemini/video123.mp4" } }] } };
    const client = {
      models: { generateImages: vi.fn(), generateVideos: vi.fn(async () => ({ done: false })) },
      operations: { getVideosOperation: vi.fn(async () => doneOp) }
    } as never;
    const p = new GeminiProvider("g-key", client, 0);
    await expect(p.generateVideo({ prompt: "clouds", aspectRatio: "16:9" }))
      .rejects.toThrow(/https:\/\/files\.gemini\/video123\.mp4/);
  });
});
