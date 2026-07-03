import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Config } from "../config.js";
import type { Renderers } from "../server.js";
import { uniquePath, removeIfEmpty } from "../files.js";
import { fileContent } from "../content.js";

const MAX_FRAMES = 3600;

export function registerRenderVideo(server: McpServer, cfg: Config, renderers: Renderers): void {
  server.registerTool(
    "render_video",
    {
      description:
        "Render an MP4 from JavaScript canvas animation code you author. Provide draw(ctx, t, frame) as a pure " +
        "function of time t in seconds (deterministic — no requestAnimationFrame, no Date.now). Optional setup(ctx) " +
        "runs once. Use for motion graphics, animated diagrams, explainers. Returns file path plus sample frames.",
      inputSchema: {
        draw_code: z.string().min(1).describe("JS defining function draw(ctx, t, frame) and optionally setup(ctx)"),
        duration_seconds: z.number().min(0.5).max(60).default(5),
        fps: z.union([z.literal(24), z.literal(30), z.literal(60)]).default(30),
        width: z.number().int().min(16).max(1920).default(1280),
        height: z.number().int().min(16).max(1080).default(720),
        filename: z.string().optional()
      }
    },
    async (args, extra) => {
      let outPath: string | undefined;
      try {
        const frames = Math.round(args.duration_seconds * args.fps);
        // Defense-in-depth: with current zod caps (duration <= 60, fps <= 60) no
        // schema-valid input can exceed MAX_FRAMES (3600). This guard protects
        // against future schema widening rather than being reachable today.
        if (frames > MAX_FRAMES) {
          return {
            isError: true,
            content: [{ type: "text" as const, text: `frame budget exceeded: ${frames} frames > ${MAX_FRAMES}. Reduce duration or fps.` }]
          };
        }
        const progressToken = extra._meta?.progressToken;
        const onProgress =
          progressToken === undefined
            ? undefined
            : async (done: number, total: number, message: string) => {
                await extra.sendNotification({
                  method: "notifications/progress",
                  params: { progressToken, progress: done, total, message }
                });
              };
        outPath = await uniquePath(cfg.outputDir, args.filename ?? "video", "mp4");
        const result = await renderers.renderVideo({
          drawCode: args.draw_code,
          durationSeconds: args.duration_seconds,
          fps: args.fps,
          width: args.width,
          height: args.height,
          outPath,
          onProgress
        });
        const content: Awaited<ReturnType<typeof fileContent>> = [
          {
            type: "text",
            text: `Saved: ${result.path} (${result.bytes} bytes, ${result.frames} frames, ${result.durationSeconds}s). Sample frames below.`
          }
        ];
        for (const sample of result.samplePaths) {
          content.push(...(await fileContent(sample, "image/png")));
        }
        return { content };
      } catch (e) {
        if (outPath) await removeIfEmpty(outPath);
        return { isError: true, content: [{ type: "text" as const, text: `render failed: ${e instanceof Error ? e.message : String(e)}` }] };
      }
    }
  );
}
