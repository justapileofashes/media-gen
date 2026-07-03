import fs from "node:fs/promises";

const INLINE_LIMIT = 1_000_000;

type Block = { type: "text"; text: string } | { type: "image"; data: string; mimeType: string };

export async function fileContent(filePath: string, mimeType: string): Promise<Block[]> {
  const stat = await fs.stat(filePath);
  const blocks: Block[] = [{ type: "text", text: `Saved: ${filePath} (${stat.size} bytes)` }];
  if (stat.size < INLINE_LIMIT && mimeType.startsWith("image/")) {
    const data = await fs.readFile(filePath);
    blocks.push({ type: "image", data: data.toString("base64"), mimeType });
  }
  return blocks;
}
