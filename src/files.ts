import fs from "node:fs/promises";
import path from "node:path";

export function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return slug || "media";
}

function timestamp(): string {
  const d = new Date();
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

/** Reserves and returns a unique output path. The file is pre-created empty (atomic reservation) — callers must either write to it or remove it on failure (see removeIfEmpty). */
export async function uniquePath(dir: string, slug: string, ext: string): Promise<string> {
  await fs.mkdir(dir, { recursive: true });
  const base = `${slugify(slug)}-${timestamp()}`;
  for (let n = 0; ; n++) {
    const name = n === 0 ? `${base}.${ext}` : `${base}-${n}.${ext}`;
    const full = path.join(dir, name);
    try {
      const handle = await fs.open(full, "wx"); // reserve atomically
      await handle.close();
      return full;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
    }
  }
}

/** Removes a reserved-but-unused output file; ignores errors (best-effort cleanup). */
export async function removeIfEmpty(filePath: string): Promise<void> {
  try {
    const stat = await fs.stat(filePath);
    if (stat.size === 0) await fs.unlink(filePath);
  } catch {
    // best-effort: never mask the original failure
  }
}
