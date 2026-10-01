export const MINI_AGENT = "plan" as const;

export type MiniPermissionRule = {
  permission: string;
  pattern: string;
  action: "allow" | "deny" | "ask";
};

export const MINI_PERMISSION: ReadonlyArray<MiniPermissionRule> = [
  { permission: "edit", pattern: "*", action: "deny" },
  { permission: "bash", pattern: "*", action: "deny" },
];
