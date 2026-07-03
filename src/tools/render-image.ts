import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Config } from "../config.js";
import type { Renderers } from "../server.js";
import { uniquePath, removeIfEmpty } from "../files.js";
import { fileContent } from "../content.js";

const MIME: Record<string, string> = { png: "image/png", jpeg: "image/jpeg", webp: "image/webp" };

export function registerRenderImage(server: McpServer, cfg: Config, renderers: Renderers): void {
  server.registerTool(
    "render_image",
    {
      description:
        "Render SVG markup or a full HTML document (authored by you) to an image file on disk. " +
        "Use for illustrations, diagrams, charts, UI mockups, typographic cards. Not photorealistic.",
      inputSchema: {
        source: z.string().min(1).describe("SVG markup (format=svg) or complete HTML document (format=html)"),
        format: z.enum(["svg", "html"]).default("svg"),
        width: z.number().int().min(16).max(4096).default(1200),
        height: z.number().int().min(16).max(4096).default(800),
        output_format: z.enum(["png", "jpeg", "webp"]).default("png"),
        filename: z.string().optional().describe("Optional filename slug")
      }
    },
    async (args) => {
      let outPath: string | undefined;
      try {
        if (args.format === "html" && args.output_format === "webp") {
          return { isError: true, content: [{ type: "text" as const, text: "html format supports png or jpeg output only" }] };
        }
        outPath = await uniquePath(cfg.outputDir, args.filename ?? "image", args.output_format);
        const result =
          args.format === "svg"
            ? await renderers.renderSvg({ source: args.source, width: args.width, height: args.height, outputFormat: args.output_format, outPath })
            : await renderers.renderHtml({ source: args.source, width: args.width, height: args.height, outputFormat: args.output_format as "png" | "jpeg", outPath });
        return { content: await fileContent(result.path, MIME[args.output_format]) };
      } catch (e) {
        if (outPath) await removeIfEmpty(outPath);
        return { isError: true, content: [{ type: "text" as const, text: `render failed: ${e instanceof Error ? e.message : String(e)}` }] };
      }
    }
  );
}
