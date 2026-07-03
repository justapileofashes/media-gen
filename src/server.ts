import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SERVER_NAME, SERVER_VERSION } from "./version.js";
import type { Config } from "./config.js";
import { renderSvg } from "./render/svg.js";
import { renderHtml } from "./render/html.js";
import { renderVideo } from "./render/video.js";
import { registerRenderImage } from "./tools/render-image.js";
import { registerRenderVideo } from "./tools/render-video.js";
import { registerGenerateImage } from "./tools/generate-image.js";
import { registerGenerateVideo } from "./tools/generate-video.js";
import { registerListProviders } from "./tools/list-providers.js";
import { buildRegistry } from "./providers/registry.js";
import { openaiFactory } from "./providers/openai.js";
import { geminiFactory } from "./providers/gemini.js";
import { falFactory } from "./providers/fal.js";
import type { MediaProvider, ProviderName } from "./providers/types.js";

export interface Renderers {
  renderSvg: typeof renderSvg;
  renderHtml: typeof renderHtml;
  renderVideo: typeof renderVideo;
}

export interface ServerOverrides {
  renderers?: Partial<Renderers>;
  providers?: Map<ProviderName, MediaProvider>;
}

export function createServer(cfg: Config, overrides: ServerOverrides = {}): McpServer {
  const renderers: Renderers = { renderSvg, renderHtml, renderVideo, ...overrides.renderers };
  const providers =
    overrides.providers ??
    buildRegistry(cfg, { openai: openaiFactory, gemini: geminiFactory, fal: falFactory });

  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });
  registerRenderImage(server, cfg, renderers);
  registerRenderVideo(server, cfg, renderers);
  registerListProviders(server, providers);
  if (providers.size > 0) {
    registerGenerateImage(server, cfg, providers);
    registerGenerateVideo(server, cfg, providers);
  }
  return server;
}
