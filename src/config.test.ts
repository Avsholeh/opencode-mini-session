import { describe, expect, test } from "bun:test";
import { DEFAULTS, parseConfig } from "./config";

describe("parseConfig", () => {
  test("returns defaults for undefined options", () => {
    expect(parseConfig(undefined)).toEqual(DEFAULTS);
  });

  test("reads contextTurns, thinking and size", () => {
    expect(
      parseConfig({ contextTurns: 3, thinking: true, size: "xlarge" }),
    ).toEqual({
      contextTurns: 3,
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

  test("ignores non-number contextTurns", () => {
    expect(parseConfig({ contextTurns: "9" }).contextTurns).toBe(
      DEFAULTS.contextTurns,
    );
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
