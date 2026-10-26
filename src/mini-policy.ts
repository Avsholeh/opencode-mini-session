export const MINI_AGENT = "plan" as const;

export type MiniPermissionRule = {
  action: string;
  resource: string;
  effect: "allow" | "deny" | "ask";
};

export const MINI_PERMISSION: ReadonlyArray<MiniPermissionRule> = [
  { action: "edit", resource: "*", effect: "deny" },
  { action: "shell", resource: "*", effect: "deny" },
];
