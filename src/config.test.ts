import { describe, expect, test } from "bun:test";
import { DEFAULTS, parseConfig } from "./config";

describe("parseConfig", () => {
  test("returns defaults for undefined options", () => {
    expect(parseConfig(undefined)).toEqual(DEFAULTS);
  });

  test("reads tokenLimit, thinking and size", () => {
    expect(
      parseConfig({ tokenLimit: 12000, thinking: true, size: "xlarge" }),
    ).toEqual({
      tokenLimit: 12000,
      thinking: true,
      size: "xlarge",
      openKey: DEFAULTS.openKey,
      freshKey: DEFAULTS.freshKey,
      cleanKey: DEFAULTS.cleanKey,
    });
  });

  test("accepts medium size", () => {
    expect(parseConfig({ size: "medium" }).size).toBe("medium");
  });

  test("falls back on invalid size", () => {
    expect(parseConfig({ size: "huge" }).size).toBe(DEFAULTS.size);
  });

  test("ignores non-positive or non-number tokenLimit", () => {
    expect(parseConfig({ tokenLimit: "9" }).tokenLimit).toBe(
      DEFAULTS.tokenLimit,
    );
    expect(parseConfig({ tokenLimit: 0 }).tokenLimit).toBe(DEFAULTS.tokenLimit);
    expect(parseConfig({ tokenLimit: -5 }).tokenLimit).toBe(
      DEFAULTS.tokenLimit,
    );
  });

  test("parses a provider/model override", () => {
    expect(parseConfig({ model: "anthropic/claude-sonnet-4.6" }).model).toEqual(
      {
        providerID: "anthropic",
        modelID: "claude-sonnet-4.6",
      },
    );
  });

  test("falls back when model is missing or malformed", () => {
    expect(parseConfig(undefined).model).toBeUndefined();
    expect(parseConfig({ model: "no-slash" }).model).toBeUndefined();
    expect(parseConfig({ model: "   " }).model).toBeUndefined();
    expect(parseConfig({ model: 42 }).model).toBeUndefined();
  });

  test("only true enables thinking", () => {
    expect(parseConfig({ thinking: "yes" }).thinking).toBe(false);
  });

  test("reads keybind from nested keybinds", () => {
    expect(parseConfig({ keybinds: { "mini.open": "ctrl+m" } }).openKey).toBe(
      "ctrl+m",
    );
  });

  test("reads fresh keybind from nested keybinds", () => {
    expect(parseConfig({ keybinds: { "mini.fresh": "ctrl+n" } }).freshKey).toBe(
      "ctrl+n",
    );
  });

  test("reads clean keybind from nested keybinds", () => {
    expect(parseConfig({ keybinds: { "mini.clean": "ctrl+l" } }).cleanKey).toBe(
      "ctrl+l",
    );
  });

  test("falls back on empty or non-record keybinds", () => {
    expect(parseConfig({ keybinds: { "mini.open": "  " } }).openKey).toBe(
      DEFAULTS.openKey,
    );
    expect(parseConfig({ keybinds: { "mini.fresh": "  " } }).freshKey).toBe(
      DEFAULTS.freshKey,
    );
    expect(parseConfig({ keybinds: { "mini.clean": "  " } }).cleanKey).toBe(
      DEFAULTS.cleanKey,
    );
    expect(parseConfig({ keybinds: "ctrl+m" }).openKey).toBe(DEFAULTS.openKey);
    expect(parseConfig({ keybinds: "ctrl+m" }).freshKey).toBe(
      DEFAULTS.freshKey,
    );
    expect(parseConfig({ keybinds: "ctrl+m" }).cleanKey).toBe(
      DEFAULTS.cleanKey,
    );
  });
});
