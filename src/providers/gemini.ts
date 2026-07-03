import { GoogleGenAI } from "@google/genai";
import type { ImageParams, MediaProvider, MediaResult, ModelInfo, ProgressFn, VideoParams } from "./types.js";

const MODELS: ModelInfo[] = [
  { id: "imagen-4.0-generate-001", kind: "image", note: "Google Imagen 4, photoreal" },
  { id: "veo-3.0-generate-001", kind: "video", note: "Google Veo 3, top-tier video with audio" }
];

const MAX_POLLS = 60; // x poll interval = 10 min at default

export class GeminiProvider implements MediaProvider {
  readonly name = "gemini" as const;
  private readonly client: GoogleGenAI;
  private readonly pollMs: number;
  private readonly apiKey: string;

  constructor(apiKey: string, client?: GoogleGenAI, pollMs = 10_000) {
    this.apiKey = apiKey;
    this.pollMs = pollMs;
    try {
      this.client = client ?? new GoogleGenAI({ apiKey });
    } catch (e: unknown) {
      throw new Error(`Gemini client initialization failed: ${this.safeMessage(e)}`);
    }
  }

  capabilities(): { image: boolean; video: boolean; models: ModelInfo[] } {
    return { image: true, video: true, models: MODELS };
  }

  async generateImage(params: ImageParams): Promise<MediaResult> {
    const model = params.model ?? "imagen-4.0-generate-001";
    try {
      const res = await this.client.models.generateImages({
        model,
        prompt: params.prompt,
        config: { numberOfImages: params.numImages, aspectRatio: params.aspectRatio }
      });
      const outputs = (res.generatedImages ?? []).flatMap((g) =>
        g.image?.imageBytes ? [{ base64: g.image.imageBytes, mimeType: "image/png" }] : []
      );
      if (outputs.length === 0) throw new Error("Gemini returned no image data");
      return { outputs, metadata: { model } };
    } catch (err: unknown) {
      throw new Error(`Gemini image generation failed: ${this.safeMessage(err)}`);
    }
  }

  async generateVideo(params: VideoParams, onProgress?: ProgressFn): Promise<MediaResult> {
    const model = params.model ?? "veo-3.0-generate-001";
    try {
      let op = await this.client.models.generateVideos({
        model,
        prompt: params.prompt,
        config: { aspectRatio: params.aspectRatio }
      });
      for (let i = 0; i < MAX_POLLS && !op.done; i++) {
        await new Promise((resolve) => setTimeout(resolve, this.pollMs));
        op = await this.client.operations.getVideosOperation({ operation: op });
        if (onProgress) await onProgress(`veo generating (poll ${i + 1})`);
      }
      if (!op.done) throw new Error("Veo job timed out after 10 min — retry later");
      const video = op.response?.generatedVideos?.[0]?.video;
      if (!video) throw new Error("Veo returned no video");
      const b64 = video.videoBytes;
      if (!b64) {
        const uri = video.uri;
        throw new Error(
          uri
            ? `Veo returned a download link instead of inline bytes — fetch it manually: ${uri}`
            : "Veo returned no video data"
        );
      }
      return { outputs: [{ base64: b64, mimeType: "video/mp4" }], metadata: { model } };
    } catch (err: unknown) {
      throw new Error(`Gemini video generation failed: ${this.safeMessage(err)}`);
    }
  }

  // Defense in depth: strip the API key from any upstream error text before it
  // propagates, in case an SDK/network error ever echoes request details.
  private safeMessage(err: unknown): string {
    const raw = err instanceof Error ? err.message : String(err);
    if (!this.apiKey) return raw;
    return raw.split(this.apiKey).join("[redacted]");
  }
}

export function geminiFactory(key: string): MediaProvider {
  return new GeminiProvider(key);
}
