import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { renderHtml } from "../../src/render/html.js";
import { withPage } from "../../src/render/browser.js";

describe("renderHtml", () => {
  it("renders HTML to PNG at viewport size", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mg-html-"));
    const out = path.join(dir, "card.png");
    const res = await renderHtml({
      source: `<html><body style="margin:0;background:#111"><h1 style="color:#fff;font-family:sans-serif">Hi</h1></body></html>`,
      width: 400, height: 300, outputFormat: "png", outPath: out
    });
    const meta = await sharp(res.path).metadata();
    expect(meta.width).toBe(400);
    expect(meta.height).toBe(300);
  });

  it("does not hang on external resources (network blocked)", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mg-html-"));
    const out = path.join(dir, "net.png");
    const started = Date.now();
    await renderHtml({
      source: `<html><body><img src="https://example.com/x.png"><p>ok</p></body></html>`,
      width: 200, height: 200, outputFormat: "png", outPath: out
    });
    expect(Date.now() - started).toBeLessThan(15_000);
    expect((await fs.stat(out)).size).toBeGreaterThan(0);
  });
});

describe("network containment (withPage)", () => {
  it("aborts HTTP subresource requests", async () => {
    const failed: string[] = [];
    await withPage({ width: 100, height: 100, timeoutMs: 15_000 }, async (page) => {
      page.on("requestfailed", (r) => { failed.push(r.url()); });
      await page.setContent(`<img src="https://example.com/x.png">`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(500);
    });
    expect(failed.some((u) => u.includes("example.com"))).toBe(true);
  });

  it("kills WebSocket connection attempts", async () => {
    const state = await withPage({ width: 100, height: 100, timeoutMs: 15_000 }, async (page) => {
      await page.setContent("<html><body></body></html>");
      return page.evaluate(() => new Promise<number>((resolve) => {
        const ws = new WebSocket("wss://example.com/socket");
        ws.onclose = () => resolve(ws.readyState);
        ws.onopen = () => resolve(0);
        setTimeout(() => resolve(ws.readyState), 5000);
      }));
    });
    expect(state).toBe(3); // CLOSED — handshake never completed
  });
});
