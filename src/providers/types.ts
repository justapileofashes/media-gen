export type ProviderName = "openai" | "gemini" | "fal";
export type AspectRatio = "1:1" | "16:9" | "9:16" | "4:3" | "3:4";

export interface ModelInfo {
  id: string;
  kind: "image" | "video";
  note: string; // quality/cost hint shown to Claude
}

export interface ImageParams {
  prompt: string;
  model?: string;
  aspectRatio: AspectRatio;
  numImages: number;
}

export interface VideoParams {
  prompt: string;
  model?: string;
  durationSeconds?: number;
  aspectRatio: AspectRatio;
  imagePath?: string;
}

export interface MediaOutput {
  url?: string;      // exactly one of url/base64 set
  base64?: string;
  mimeType: string;
}

export interface MediaResult {
  outputs: MediaOutput[];
  metadata: Record<string, unknown>;
}

export type ProgressFn = (message: string) => Promise<void>;

export interface MediaProvider {
  readonly name: ProviderName;
  capabilities(): { image: boolean; video: boolean; models: ModelInfo[] };
  generateImage(params: ImageParams): Promise<MediaResult>;
  generateVideo(params: VideoParams, onProgress?: ProgressFn): Promise<MediaResult>;
}
