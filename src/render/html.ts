import fs from "node:fs/promises";
import { withPage } from "./browser.js";
import type { RenderedFile } from "./svg.js";

export interface HtmlRenderOptions {
  source: string;
  width: number;
  height: number;
  outputFormat: "png" | "jpeg";
  outPath: string;
  timeoutMs?: number;
}

export async function renderHtml(opts: HtmlRenderOptions): Promise<RenderedFile> {
  const timeoutMs = opts.timeoutMs ?? 15_000;
  await withPage({ width: opts.width, height: opts.height, timeoutMs }, async (page) => {
    await page.setContent(opts.source, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    await page.screenshot({ path: opts.outPath, type: opts.outputFormat });
  });
  const stat = await fs.stat(opts.outPath);
  return { path: opts.outPath, bytes: stat.size, width: opts.width, height: opts.height };
}
