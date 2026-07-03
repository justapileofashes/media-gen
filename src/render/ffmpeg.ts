import { spawn } from "node:child_process";
import path from "node:path";
import ffmpegPath from "ffmpeg-static";

export const FRAME_PATTERN = "frame-%05d.png";

export function frameName(i: number): string {
  return `frame-${String(i).padStart(5, "0")}.png`;
}

export async function encodeFrames(framesDir: string, fps: number, outPath: string): Promise<void> {
  if (!ffmpegPath) throw new Error("ffmpeg binary not found (ffmpeg-static)");
  // ffmpeg-static's CJS type declarations resolve to a namespace object under
  // Node16 module resolution, so the null guard above doesn't narrow to
  // `string` on its own — narrow explicitly once here rather than casting at
  // every call site.
  const bin: string = ffmpegPath as unknown as string;
  const args = [
    "-y",
    "-framerate", String(fps),
    "-i", path.join(framesDir, FRAME_PATTERN),
    "-c:v", "libx264",
    "-pix_fmt", "yuv420p",
    "-movflags", "+faststart",
    outPath
  ];
  await new Promise<void>((resolve, reject) => {
    const proc = spawn(bin, args, { windowsHide: true });
    let stderr = "";
    proc.stderr.on("data", (d: Buffer) => { stderr = (stderr + d.toString()).slice(-2000); });
    proc.on("error", (e) => reject(new Error(`ffmpeg spawn failed: ${e.message}`)));
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited ${code}: ${stderr}`));
    });
  });
}
