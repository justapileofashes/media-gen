import { describe, it, expect, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { persistOutputs } from "../../src/download.js";

describe("persistOutputs", () => {
  it("writes base64 outputs with mime-derived extension", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mg-dl-"));
    const files = await persistOutputs(
      { outputs: [{ base64: Buffer.from("png!").toString("base64"), mimeType: "image/png" }], metadata: {} },
      dir, "cat"
    );
    expect(files).toHaveLength(1);
    expect(files[0].path).toMatch(/cat-.*\.png$/);
    expect(files[0].mimeType).toBe("image/png");
    expect((await fs.readFile(files[0].path)).toString()).toBe("png!");
  });

  it("fetches url outputs", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mg-dl-"));
    const fetchFn = vi.fn(async () => new Response(Buffer.from("vid"))) as never;
    const files = await persistOutputs(
      { outputs: [{ url: "https://x/y.mp4", mimeType: "video/mp4" }], metadata: {} },
      dir, "clip", fetchFn
    );
    expect(files[0].path.endsWith(".mp4")).toBe(true);
    expect(files[0].mimeType).toBe("video/mp4");
  });

  it("includes url in error when fetch fails", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mg-dl-"));
    const fetchFn = vi.fn(async () => new Response(null, { status: 500 })) as never;
    await expect(persistOutputs(
      { outputs: [{ url: "https://x/lost.mp4", mimeType: "video/mp4" }], metadata: {} }, dir, "clip", fetchFn
    )).rejects.toThrow(/https:\/\/x\/lost\.mp4/);
  });

  it("includes url in error when fetch itself throws", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mg-dl-"));
    const fetchFn = vi.fn(async () => { throw new Error("getaddrinfo ENOTFOUND"); }) as never;
    await expect(persistOutputs(
      { outputs: [{ url: "https://x/gone.mp4", mimeType: "video/mp4" }], metadata: {} }, dir, "clip", fetchFn
    )).rejects.toThrow(/https:\/\/x\/gone\.mp4/);
  });

  it("leaves no empty reserved file behind when the fetch fails", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mg-dl-"));
    const fetchFn = vi.fn(async () => new Response(null, { status: 500 })) as never;
    await expect(persistOutputs(
      { outputs: [{ url: "https://x/lost.mp4", mimeType: "video/mp4" }], metadata: {} }, dir, "clip", fetchFn
    )).rejects.toThrow();
    const entries = await fs.readdir(dir);
    for (const f of entries) {
      const stat = await fs.stat(path.join(dir, f));
      expect(stat.size).toBeGreaterThan(0);
    }
  });

  it("rejects an output with neither base64 nor url", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mg-dl-"));
    await expect(persistOutputs(
      { outputs: [{ mimeType: "image/png" }], metadata: {} }, dir, "empty"
    )).rejects.toThrow(/neither base64 nor url/);
  });

  it("falls back to .bin extension for an unknown mime type", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mg-dl-"));
    const files = await persistOutputs(
      { outputs: [{ base64: Buffer.from("x").toString("base64"), mimeType: "application/octet-stream" }], metadata: {} },
      dir, "blob"
    );
    expect(files[0].path.endsWith(".bin")).toBe(true);
  });
});
