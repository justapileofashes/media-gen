import type { Config } from "../config.js";
import type { MediaProvider, ProviderName } from "./types.js";

export type ProviderFactories = Partial<Record<ProviderName, (key: string) => MediaProvider>>;

// Priority order for defaultProvider: first configured wins.
const ORDER: ProviderName[] = ["openai", "gemini", "fal"];

export function buildRegistry(cfg: Config, factories: ProviderFactories): Map<ProviderName, MediaProvider> {
  const reg = new Map<ProviderName, MediaProvider>();
  for (const name of ORDER) {
    const key = cfg.keys[name];
    const factory = factories[name];
    if (key && factory) reg.set(name, factory(key));
  }
  return reg;
}

export function defaultProvider(reg: Map<ProviderName, MediaProvider>): ProviderName | undefined {
  return ORDER.find((n) => reg.has(n));
}
