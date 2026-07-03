import path from "node:path";

export interface Config {
  outputDir: string;
  keys: { openai?: string; gemini?: string; fal?: string };
}

function pick(env: NodeJS.ProcessEnv, name: string): string | undefined {
  const v = env[name]?.trim();
  return v ? v : undefined;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const keys: Config["keys"] = {};
  const openai = pick(env, "OPENAI_API_KEY");
  const gemini = pick(env, "GEMINI_API_KEY");
  const fal = pick(env, "FAL_KEY");
  if (openai) keys.openai = openai;
  if (gemini) keys.gemini = gemini;
  if (fal) keys.fal = fal;
  return {
    outputDir: path.resolve(pick(env, "MEDIA_OUTPUT_DIR") ?? "generated-media"),
    keys
  };
}
