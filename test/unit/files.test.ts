import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { slugify, uniquePath, removeIfEmpty } from "../../src/files.js";

describe("slugify", () => {
  it("lowercases and strips unsafe chars", () => {
    expect(slugify("My Cool Image!.png")).toBe("my-cool-image-png");
  });
  it("blocks path traversal", () => {
    expect(slugify("..\\..\\etc\\passwd")).not.toContain(".");
    expect(slugify("../../etc/passwd")).not.toMatch(/[\\/.]/);
  });
  it("never returns empty", () => {
    expect(slugify("///")).toBe("media");
  });
  it("caps length at 60", () => {
    expect(slugify("x".repeat(200)).length).toBeLessThanOrEqual(60);
  });
});

describe("uniquePath", () => {
  it("creates dir and avoids collisions", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mg-"));
    const a = await uniquePath(dir, "img", "png");
    await fs.writeFile(a, "x");
    const b = await uniquePath(dir, "img", "png");
    expect(b).not.toBe(a);
    expect(path.isAbsolute(b)).toBe(true);
    expect(b.endsWith(".png")).toBe(true);
  });

  it("returns distinct paths under concurrent calls", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mg-"));
    const paths = await Promise.all([
      uniquePath(dir, "img", "png"),
      uniquePath(dir, "img", "png"),
      uniquePath(dir, "img", "png")
    ]);
    expect(new Set(paths).size).toBe(3);
  });
});

describe("removeIfEmpty", () => {
  it("deletes an empty (0-byte) file", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mg-"));
    const p = await uniquePath(dir, "img", "png");
    await removeIfEmpty(p);
    await expect(fs.stat(p)).rejects.toThrow();
  });

  it("leaves a non-empty file untouched", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mg-"));
    const p = await uniquePath(dir, "img", "png");
    await fs.writeFile(p, "not empty");
    await removeIfEmpty(p);
    expect((await fs.readFile(p)).toString()).toBe("not empty");
  });

  it("ignores a missing path without throwing", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mg-"));
    await expect(removeIfEmpty(path.join(dir, "does-not-exist.png"))).resolves.toBeUndefined();
  });
});
