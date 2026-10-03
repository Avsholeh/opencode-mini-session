import { parseModelOverride, type ModelRef } from "./model";

export type MiniSize = "medium" | "large" | "xlarge";

export type MiniConfig = {
  tokenLimit: number;
  model?: ModelRef;
  thinking: boolean;
  size: MiniSize;
  openKey: string;
  freshKey: string;
  cleanKey: string;
};

export const DEFAULTS: MiniConfig = {
  tokenLimit: 50000,
  thinking: false,
  size: "large",
  openKey: "<leader>i",
  freshKey: "<leader>o",
  cleanKey: "<leader>d",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function parseConfig(
  options: Record<string, unknown> | undefined,
): MiniConfig {
  const keybinds = options?.keybinds;
  const open = isRecord(keybinds) ? keybinds["mini.open"] : undefined;
  const fresh = isRecord(keybinds) ? keybinds["mini.fresh"] : undefined;
  const clean = isRecord(keybinds) ? keybinds["mini.clean"] : undefined;
  const size = options?.size;
  const tokenLimit = options?.tokenLimit;
  return {
    tokenLimit:
      typeof tokenLimit === "number" &&
      Number.isFinite(tokenLimit) &&
      tokenLimit > 0
        ? tokenLimit
        : DEFAULTS.tokenLimit,
    model: parseModelOverride(options?.model),
    thinking: options?.thinking === true,
    size: size === "medium" || size === "xlarge" ? size : DEFAULTS.size,
    openKey: typeof open === "string" && open.trim() ? open : DEFAULTS.openKey,
    freshKey:
      typeof fresh === "string" && fresh.trim() ? fresh : DEFAULTS.freshKey,
    cleanKey:
      typeof clean === "string" && clean.trim() ? clean : DEFAULTS.cleanKey,
  };
}
