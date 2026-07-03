import { fal } from "@fal-ai/client";
import type { AspectRatio, ImageParams, MediaProvider, MediaResult, ModelInfo, ProgressFn, VideoParams } from "./types.js";

export type SubscribeFn = (
  endpoint: string,
  opts: { input: Record<string, unknown>; onQueueUpdate?: (u: { status: string }) => void }
) => Promise<{ data: unknown; requestId: string }>;

const IMAGE_MODEL = "fal-ai/flux/schnell";
const VIDEO_MODEL = "fal-ai/kling-video/v2.5-turbo/pro/text-to-video";

const IMAGE_SIZE: Record<AspectRatio, string> = {
  "1:1": "square_hd",
  "16:9": "landscape_16_9",
  "9:16": "portrait_16_9",
  "4:3": "landscape_4_3",
  "3:4": "portrait_4_3"
};

// Kling only accepts these literal aspect ratios / durations (per doc-check); clamp
// the caller's request into the nearest supported value before sending.
const KLING_ASPECT: Record<AspectRatio, "16:9" | "9:16" | "1:1"> = {
  "1:1": "1:1",
  "16:9": "16:9",
  "4:3": "16:9",
  "9:16": "9:16",
  "3:4": "9:16"
};

function toKlingDuration(seconds: number | undefined): "5" | "10" {
  return (seconds ?? 5) <= 7.5 ? "5" : "10";
}

const VIDEO_TIMEOUT_MS = 10 * 60 * 1000; // 10 min

function withDeadline<T>(p: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: NodeJS.Timeout;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([p, deadline]).finally(() => clearTimeout(timer!)) as Promise<T>;
}

const MODELS: ModelInfo[] = [
  { id: IMAGE_MODEL, kind: "image", note: "FLUX schnell — fast, ~cents per image" },
  { id: VIDEO_MODEL, kind: "video", note: "Kling text-to-video — cost-effective" }
];

export class FalProvider implements MediaProvider {
  readonly name = "fal" as const;
  private readonly subscribeFn: SubscribeFn;
  private readonly apiKey: string;

  constructor(apiKey: string, subscribe?: SubscribeFn) {
    this.apiKey = apiKey;
    try {
      // fal.config mutates module-global SDK state — safe while the registry creates at most one FalProvider per process
      if (!subscribe) fal.config({ credentials: apiKey });
      this.subscribeFn = subscribe ?? ((endpoint, opts) => fal.subscribe(endpoint, opts as never) as never);
    } catch (e: unknown) {
      throw new Error(`fal client initialization failed: ${this.safeMessage(e)}`);
    }
  }

  capabilities(): { image: boolean; video: boolean; models: ModelInfo[] } {
    return { image: true, video: true, models: MODELS };
  }

  async generateImage(params: ImageParams): Promise<MediaResult> {
    const model = params.model ?? IMAGE_MODEL;
    try {
      const { data, requestId } = await this.subscribeFn(model, {
        input: { prompt: params.prompt, image_size: IMAGE_SIZE[params.aspectRatio], num_images: params.numImages }
      });
      const images = (data as { images?: Array<{ url: string; content_type?: string }> }).images ?? [];
      return {
        outputs: images.map((i) => ({ url: i.url, mimeType: i.content_type ?? "image/png" })),
        metadata: { model, requestId }
      };
    } catch (err: unknown) {
      throw new Error(`fal image generation failed: ${this.safeMessage(err)}`);
    }
  }

  async generateVideo(params: VideoParams, onProgress?: ProgressFn): Promise<MediaResult> {
    const model = params.model ?? VIDEO_MODEL;
    const aspect = KLING_ASPECT[params.aspectRatio];
    const duration = toKlingDuration(params.durationSeconds);
    try {
      const { data, requestId } = await withDeadline(
        this.subscribeFn(model, {
          input: {
            prompt: params.prompt,
            duration,
            aspect_ratio: aspect
          },
          onQueueUpdate: (u) => {
            // progress is best-effort: a failing reporter must not break generation
            onProgress?.(`fal queue: ${u.status}`).catch(() => {});
          }
        }),
        VIDEO_TIMEOUT_MS,
        "fal video generation timed out after 10 min — the job may still complete on fal.ai; check your fal dashboard"
      );
      const video = (data as { video?: { url: string } }).video;
      if (!video?.url) throw new Error(`fal returned no video url (request ${requestId})`);
      return {
        outputs: [{ url: video.url, mimeType: "video/mp4" }],
        metadata: { model, requestId, aspectRatio: aspect, duration }
      };
    } catch (err: unknown) {
      throw new Error(`fal video generation failed: ${this.safeMessage(err)}`);
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

export function falFactory(key: string): MediaProvider {
  return new FalProvider(key);
}
