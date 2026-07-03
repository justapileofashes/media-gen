import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { MediaProvider, ProviderName } from "../providers/types.js";

const SETUP = `No BYOK providers configured. render_image/render_video (Claude-rendered, free) always work.
To enable photoreal generate_image/generate_video, set one or more env vars for this MCP server:
  OPENAI_API_KEY  (gpt-image-1 images, Sora video)
  GEMINI_API_KEY  (Imagen images, Veo video)
  FAL_KEY         (FLUX images, Kling video)
Set them in .mcp.json "env" (use \${VAR} expansion) or via: claude mcp add media-gen -e FAL_KEY=... -- node dist/index.js`;

export function registerListProviders(server: McpServer, reg: Map<ProviderName, MediaProvider>): void {
  server.registerTool(
    "list_providers",
    { description: "List configured BYOK generation providers, their models and capabilities.", inputSchema: {} },
    async () => {
      if (reg.size === 0) return { content: [{ type: "text" as const, text: SETUP }] };
      const lines = [...reg.values()].map((p) => {
        const caps = p.capabilities();
        const models = caps.models.map((m) => `    - ${m.id} (${m.kind}): ${m.note}`).join("\n");
        return `${p.name}: image=${caps.image} video=${caps.video}\n${models}`;
      });
      return { content: [{ type: "text" as const, text: lines.join("\n") }] };
    }
  );
}
