import fs from "node:fs/promises";
import { uniquePath, removeIfEmpty } from "./files.js";
import type { MediaResult } from "./providers/types.js";

const EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "video/mp4": "mp4"
};

export interface PersistedFile {
  path: string;
  mimeType: string;
}

export async function persistOutputs(
  result: MediaResult,
  dir: string,
  slug: string,
  fetchFn: typeof fetch = fetch
): Promise<PersistedFile[]> {
  const files: PersistedFile[] = [];
  for (const out of result.outputs) {
    const ext = EXT[out.mimeType] ?? "bin";
    const dest = await uniquePath(dir, slug, ext);
    try {
      if (out.base64) {
        await fs.writeFile(dest, Buffer.from(out.base64, "base64"));
      } else if (out.url) {
        let res: Response;
        try {
          res = await fetchFn(out.url);
        } catch (e) {
          throw new Error(`download failed (${e instanceof Error ? e.message : String(e)}) — result still at: ${out.url}`);
        }
        if (!res.ok || !res.body) throw new Error(`download failed (HTTP ${res.status}) — result still at: ${out.url}`);
        await fs.writeFile(dest, Buffer.from(await res.arrayBuffer()));
      } else {
        throw new Error("provider output had neither base64 nor url");
      }
    } catch (e) {
      await removeIfEmpty(dest);
      throw e;
    }
    files.push({ path: dest, mimeType: out.mimeType });
  }
  return files;
}
