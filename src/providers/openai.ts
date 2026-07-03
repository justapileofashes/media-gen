import OpenAI from "openai";
import type {
  AspectRatio,
  ImageParams,
  MediaProvider,
  MediaResult,
  ModelInfo,
  ProgressFn,
  VideoParams
} from "./types.js";

type ImageSize = "1024x1024" | "1024x1536" | "1536x1024";
type VideoSize = "1280x720" | "720x1280";
type VideoSeconds = "4" | "8" | "12";

const IMAGE_SIZE: Record<AspectRatio, ImageSize> = {
  "1:1": "1024x1024",
  "16:9": "1536x1024",
  "4:3": "1536x1024",
  "9:16": "1024x1536",
  "3:4": "1024x1536"
};

const VIDEO_SIZE: Record<AspectRatio, VideoSize> = {
  "1:1": "1280x720",
  "16:9": "1280x720",
  "4:3": "1280x720",
  "9:16": "720x1280",
  "3:4": "720x1280"
};

const MODELS: ModelInfo[] = [
  { id: "gpt-image-1", kind: "image", note: "OpenAI flagship image model, strong text rendering" },
  { id: "sora-2", kind: "video", note: "OpenAI Sora video; requires eligible API tier" }
];

// Sora's `seconds` param only accepts these literal values (SDK v6.45, resources/videos.d.ts).
function toVideoSeconds(durationSeconds?: number): VideoSeconds {
  const target = durationSeconds ?? 8;
  if (target <= 4) return "4";
  if (target <= 8) return "8";
  return "12";
}

const POLL_INITIAL_MS = 100;
const POLL_MAX_MS = 5000;
const POLL_TIMEOUT_MS = 10 * 60 * 1000; // 10 min

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class OpenAIProvider implements MediaProvider {
  readonly name = "openai" as const;
  private readonly client: OpenAI;
  private readonly apiKey: string;

  constructor(apiKey: string, client?: OpenAI) {
    this.apiKey = apiKey;
    this.client = client ?? new OpenAI({ apiKey });
  }

  capabilities(): { image: boolean; video: boolean; models: ModelInfo[] } {
    return { image: true, video: true, models: MODELS };
  }

  async generateImage(params: ImageParams): Promise<MediaResult> {
    const model = params.model ?? "gpt-image-1";
    try {
      const res = await this.client.images.generate({
        model,
        prompt: params.prompt,
        n: params.numImages,
        size: IMAGE_SIZE[params.aspectRatio]
      });
      const outputs = (res.data ?? []).flatMap((d) => (d.b64_json ? [{ base64: d.b64_json, mimeType: "image/png" }] : []));
      if (outputs.length === 0) throw new Error("OpenAI returned no image data");
      return { outputs, metadata: { model } };
    } catch (err: unknown) {
      throw new Error(`OpenAI image generation failed: ${this.safeMessage(err)}`);
    }
  }

  async generateVideo(params: VideoParams, onProgress?: ProgressFn): Promise<MediaResult> {
    const model = params.model ?? "sora-2";
    try {
      const seconds = toVideoSeconds(params.durationSeconds);
      const created = await this.client.videos.create({
        model,
        prompt: params.prompt,
        seconds,
        size: VIDEO_SIZE[params.aspectRatio]
      });

      let video = created;
      let delay = POLL_INITIAL_MS;
      const deadline = Date.now() + POLL_TIMEOUT_MS;

      while (video.status !== "completed") {
        if (video.status === "failed") {
          throw new Error(`Sora job failed (id ${video.id})`);
        }
        if (Date.now() > deadline) {
          throw new Error(`Sora job timed out after 10 min (id ${created.id}) — retry later`);
        }
        await sleep(delay);
        delay = Math.min(delay * 2, POLL_MAX_MS);
        video = await this.client.videos.retrieve(created.id);
        if (onProgress) await onProgress(`sora status: ${video.status}`);
      }

      const content = await this.client.videos.downloadContent(created.id);
      const buf = Buffer.from(await content.arrayBuffer());
      return {
        outputs: [{ base64: buf.toString("base64"), mimeType: "video/mp4" }],
        metadata: { model, id: created.id, seconds }
      };
    } catch (err: unknown) {
      throw new Error(`OpenAI video generation failed: ${this.safeMessage(err)}`);
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

export function openaiFactory(key: string): MediaProvider {
  return new OpenAIProvider(key);
}
