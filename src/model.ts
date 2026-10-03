import type { MiniConfig } from "./config";

export type ModelRef = { providerID: string; modelID: string };

export function parseModelOverride(value: unknown): ModelRef | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const [providerID, ...rest] = trimmed.split("/");
  const modelID = rest.join("/");
  if (!providerID || !modelID) return undefined;
  return { providerID, modelID };
}

export function resolvePromptModel(
  cfg: MiniConfig,
  override: ModelRef | undefined,
  inherited: ModelRef | undefined,
): ModelRef | undefined {
  return override ?? cfg.model ?? inherited;
}

export function formatModelRef(model: ModelRef | undefined): string {
  return model ? `${model.providerID}/${model.modelID}` : "default";
}
