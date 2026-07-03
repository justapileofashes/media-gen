import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Config } from "../config.js";
import type { MediaProvider, ProviderName } from "../providers/types.js";
import { defaultProvider } from "../providers/registry.js";
import { persistOutputs } from "../download.js";
import { fileContent } from "../content.js";

export function registerGenerateImage(server: McpServer, cfg: Config, reg: Map<ProviderName, MediaProvider>): void {
  const names = [...reg.keys()] as [ProviderName, ...ProviderName[]];
  server.registerTool(
    "generate_image",
    {
      description: "Generate a photorealistic/AI image from a text prompt via the user's configured provider key. Costs real money per call — use only when the user wants generated (not code-drawn) imagery.",
      inputSchema: {
        prompt: z.string().min(1),
        provider: z.enum(names).default(defaultProvider(reg) as ProviderName),
        model: z.string().optional().describe("Provider model id; sensible default used if omitted"),
        aspect_ratio: z.enum(["1:1", "16:9", "9:16", "4:3", "3:4"]).default("1:1"),
        num_images: z.number().int().min(1).max(4).default(1),
        filename: z.string().optional()
      }
    },
    async (args) => {
      try {
        const provider = reg.get(args.provider);
        if (!provider) return { isError: true, content: [{ type: "text" as const, text: `provider ${args.provider} not configured` }] };
        const result = await provider.generateImage({
          prompt: args.prompt, model: args.model, aspectRatio: args.aspect_ratio, numImages: args.num_images
        });
        const files = await persistOutputs(result, cfg.outputDir, args.filename ?? args.prompt.slice(0, 40));
        const content = [];
        for (const f of files) content.push(...(await fileContent(f.path, f.mimeType)));
        return { content };
      } catch (e) {
        return { isError: true, content: [{ type: "text" as const, text: `generation failed: ${e instanceof Error ? e.message : String(e)}` }] };
      }
    }
  );
}
