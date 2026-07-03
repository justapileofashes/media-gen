import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Config } from "../config.js";
import type { MediaProvider, ProviderName } from "../providers/types.js";
import { defaultProvider } from "../providers/registry.js";
import { persistOutputs } from "../download.js";

export function registerGenerateVideo(server: McpServer, cfg: Config, reg: Map<ProviderName, MediaProvider>): void {
  const names = [...reg.keys()] as [ProviderName, ...ProviderName[]];
  server.registerTool(
    "generate_video",
    {
      description: "Generate an AI video from a text prompt via the user's configured provider key. Slow (minutes) and costs real money — confirm with the user before calling.",
      inputSchema: {
        prompt: z.string().min(1),
        provider: z.enum(names).default(defaultProvider(reg) as ProviderName),
        model: z.string().optional(),
        duration_seconds: z.number().min(1).max(20).optional(),
        aspect_ratio: z.enum(["1:1", "16:9", "9:16", "4:3", "3:4"]).default("16:9"),
        filename: z.string().optional()
      }
    },
    async (args, extra) => {
      try {
        const provider = reg.get(args.provider);
        if (!provider) return { isError: true, content: [{ type: "text" as const, text: `provider ${args.provider} not configured` }] };
        if (!provider.capabilities().video) {
          const capable = [...reg.values()].filter((p) => p.capabilities().video).map((p) => p.name);
          return {
            isError: true,
            content: [{ type: "text" as const, text: `${args.provider} cannot generate video. Video-capable configured providers: ${capable.join(", ") || "none"}` }]
          };
        }
        const progressToken = extra._meta?.progressToken;
        let tick = 0;
        const onProgress = progressToken === undefined ? undefined : async (message: string) => {
          await extra.sendNotification({
            method: "notifications/progress",
            params: { progressToken, progress: ++tick, message }
          });
        };
        const result = await provider.generateVideo({
          prompt: args.prompt, model: args.model, durationSeconds: args.duration_seconds,
          aspectRatio: args.aspect_ratio
        }, onProgress);
        const files = await persistOutputs(result, cfg.outputDir, args.filename ?? args.prompt.slice(0, 40));
        return { content: [{ type: "text" as const, text: `Saved: ${files.map((f) => f.path).join(", ")}` }] };
      } catch (e) {
        return { isError: true, content: [{ type: "text" as const, text: `generation failed: ${e instanceof Error ? e.message : String(e)}` }] };
      }
    }
  );
}
