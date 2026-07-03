import { describe, it, expect, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../../src/server.js";
import type { Config } from "../../src/config.js";

async function connect(cfg: Config, overrides?: Parameters<typeof createServer>[1]) {
  const server = createServer(cfg, overrides);
  const client = new Client({ name: "test", version: "0.0.0" });
  const [ct, st] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(st), client.connect(ct)]);
  return client;
}

async function tmpCfg(): Promise<Config> {
  return { outputDir: await fs.mkdtemp(path.join(os.tmpdir(), "mg-tool-")), keys: {} };
}

describe("render_image tool", () => {
  it("is listed with schema", async () => {
    const client = await connect(await tmpCfg());
    const tools = await client.listTools();
    const names = tools.tools.map((t) => t.name);
    expect(names).toContain("render_image");
  });

  it("renders svg via injected renderer and returns path text + inline image", async () => {
    const cfg = await tmpCfg();
    const fakePng = path.join(cfg.outputDir, "fake.png");
    await fs.mkdir(cfg.outputDir, { recursive: true });
    await fs.writeFile(fakePng, Buffer.from("89504e470d0a1a0a", "hex"));
    const renderSvg = vi.fn(async (o: { outPath: string }) => ({ path: fakePng, bytes: 8, width: 100, height: 100 }));
    const client = await connect(cfg, { renderers: { renderSvg: renderSvg as never } });
    const res = await client.callTool({ name: "render_image", arguments: { source: "<svg xmlns='http://www.w3.org/2000/svg'/>" } });
    expect(res.isError ?? false).toBe(false);
    const blocks = res.content as Array<{ type: string; text?: string; mimeType?: string }>;
    expect(blocks.some((b) => b.type === "text" && b.text?.includes(fakePng))).toBe(true);
    expect(blocks.some((b) => b.type === "image" && b.mimeType === "image/png")).toBe(true);
    expect(renderSvg).toHaveBeenCalledOnce();
  });

  it("returns isError for renderer failure without throwing", async () => {
    const cfg = await tmpCfg();
    const renderSvg = vi.fn(async () => { throw new Error("bad svg near line 3"); });
    const client = await connect(cfg, { renderers: { renderSvg: renderSvg as never } });
    const res = await client.callTool({ name: "render_image", arguments: { source: "<svg/>" } });
    expect(res.isError).toBe(true);
    expect(JSON.stringify(res.content)).toContain("bad svg near line 3");
  });

  it("rejects html+webp combination", async () => {
    const client = await connect(await tmpCfg());
    const res = await client.callTool({
      name: "render_image",
      arguments: { source: "<html></html>", format: "html", output_format: "webp" }
    });
    expect(res.isError).toBe(true);
  });

  it("routes format=html to renderHtml with mapped options", async () => {
    const cfg = await tmpCfg();
    const fakePng = path.join(cfg.outputDir, "html.png");
    await fs.mkdir(cfg.outputDir, { recursive: true });
    await fs.writeFile(fakePng, Buffer.from("89504e470d0a1a0a", "hex"));
    const renderHtml = vi.fn(async () => ({ path: fakePng, bytes: 8, width: 640, height: 480 }));
    const client = await connect(cfg, { renderers: { renderHtml: renderHtml as never } });
    const res = await client.callTool({
      name: "render_image",
      arguments: { source: "<html><body>hi</body></html>", format: "html", width: 640, height: 480, output_format: "jpeg" }
    });
    expect(res.isError ?? false).toBe(false);
    expect(renderHtml).toHaveBeenCalledOnce();
    const args = renderHtml.mock.calls[0][0] as { source: string; width: number; height: number; outputFormat: string; outPath: string };
    expect(args.width).toBe(640);
    expect(args.height).toBe(480);
    expect(args.outputFormat).toBe("jpeg");
    expect(args.outPath.endsWith(".jpeg")).toBe(true);
  });

  it("prefixes renderer errors with 'render failed:'", async () => {
    const cfg = await tmpCfg();
    const renderSvg = vi.fn(async () => { throw new Error("boom"); });
    const client = await connect(cfg, { renderers: { renderSvg: renderSvg as never } });
    const res = await client.callTool({ name: "render_image", arguments: { source: "<svg/>" } });
    expect(res.isError).toBe(true);
    expect(JSON.stringify(res.content)).toContain("render failed: boom");
  });

  it("leaves no zero-byte reserved file in outputDir when the renderer fails", async () => {
    const cfg = await tmpCfg();
    const renderSvg = vi.fn(async () => { throw new Error("bad svg near line 3"); });
    const client = await connect(cfg, { renderers: { renderSvg: renderSvg as never } });
    const res = await client.callTool({ name: "render_image", arguments: { source: "<svg/>" } });
    expect(res.isError).toBe(true);
    const entries = await fs.readdir(cfg.outputDir).catch(() => [] as string[]);
    const pngFiles = entries.filter((f) => f.endsWith(".png"));
    for (const f of pngFiles) {
      const stat = await fs.stat(path.join(cfg.outputDir, f));
      expect(stat.size).toBeGreaterThan(0);
    }
  });

  it("omits inline image block for files >= 1MB", async () => {
    const cfg = await tmpCfg();
    const bigPng = path.join(cfg.outputDir, "big.png");
    await fs.mkdir(cfg.outputDir, { recursive: true });
    await fs.writeFile(bigPng, Buffer.alloc(1_000_000));
    const renderSvg = vi.fn(async () => ({ path: bigPng, bytes: 1_000_000, width: 10, height: 10 }));
    const client = await connect(cfg, { renderers: { renderSvg: renderSvg as never } });
    const res = await client.callTool({ name: "render_image", arguments: { source: "<svg/>" } });
    expect(res.isError ?? false).toBe(false);
    const blocks = res.content as Array<{ type: string }>;
    expect(blocks.some((b) => b.type === "image")).toBe(false);
    expect(blocks.some((b) => b.type === "text")).toBe(true);
  });
});
