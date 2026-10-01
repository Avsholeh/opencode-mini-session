import { beforeEach, describe, expect, test } from "bun:test";
import type { Message, Part } from "@opencode-ai/sdk/v2";
import { DEFAULTS, type MiniConfig } from "./config";
import type {
  CreateSessionOptions,
  HostPort,
  PromptInput,
  SessionInfo,
} from "./host";
import { CONTEXT_PREFIX, miniTitle } from "./markers";
import { MINI_AGENT, MINI_PERMISSION } from "./mini-policy";
import { createMiniSessions, type MiniSessions } from "./sessions";
import type { Entry } from "./transcript";

type StoredSession = SessionInfo & { parentID?: string };

class FakeHost implements HostPort {
  sessions: StoredSession[] = [];
  messagesBy = new Map<string, Array<Entry>>();
  prompts: Array<{ id: string; input: PromptInput }> = [];
  created: Array<{ title: string; options: CreateSessionOptions }> = [];
  permissionUpdates: Array<{ id: string; permission: unknown }> = [];
  deleted: string[] = [];
  current: string | undefined;
  failMessagesFor = new Set<string>();
  failDeleteFor = new Set<string>();
  failCreate = false;
  failPermissionUpdateFor = new Set<string>();
  private seq = 0;

  currentSessionID() {
    return this.current;
  }

  async listSessions() {
    return this.sessions.map((session) => ({ ...session }));
  }

  sessionExists(id: string) {
    return this.sessions.some((session) => session.id === id);
  }

  async createSession(title: string, options: CreateSessionOptions) {
    if (this.failCreate) throw new Error("create failed");
    this.created.push({ title, options });
    const id = `mini-${++this.seq}`;
    this.sessions.unshift({ id, title, created: this.seq });
    return id;
  }

  async renameSession(id: string, title: string) {
    const session = this.sessions.find((item) => item.id === id);
    if (session) session.title = title;
  }

  async updateSessionPermission(id: string, permission: unknown) {
    if (this.failPermissionUpdateFor.has(id))
      throw new Error("permission update failed");
    this.permissionUpdates.push({ id, permission });
  }

  async deleteSession(id: string) {
    if (this.failDeleteFor.has(id)) throw new Error("delete failed");
    this.deleted.push(id);
    this.sessions = this.sessions.filter((session) => session.id !== id);
  }

  async messages(id: string) {
    if (this.failMessagesFor.has(id)) throw new Error("read failed");
    return this.messagesBy.get(id) ?? [];
  }

  lastUserModel() {
    return undefined;
  }

  async prompt(id: string, input: PromptInput) {
    this.prompts.push({ id, input });
  }
}

const part = (text: string): Part =>
  ({ type: "text", text }) as unknown as Part;

const entry = (role: "user" | "assistant", text: string): Entry => ({
  info: { role } as unknown as Message,
  parts: [part(text)],
});

let host: FakeHost;
let sessions: MiniSessions;

const mkSessions = (overrides: Partial<MiniConfig> = {}): MiniSessions =>
  createMiniSessions({ host, config: { ...DEFAULTS, ...overrides } });

beforeEach(() => {
  host = new FakeHost();
  host.current = "main1";
  sessions = mkSessions();
});

describe("open", () => {
  test("fails with no-target when nothing to attach to", async () => {
    host.current = undefined;
    const result = await sessions.open(false);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("no-target");
  });

  test("creates a fresh mini titled with the main marker", async () => {
    const result = await sessions.open(false);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.target.main).toBe("main1");
    const mini = host.sessions.find(
      (session) => session.id === result.value.target.mini,
    );
    expect(mini?.title).toBe(miniTitle("main1"));
    expect(host.prompts).toHaveLength(0);
  });

  test("copies only the last contextTurns turns", async () => {
    host.messagesBy.set("main1", [
      entry("user", "one"),
      entry("assistant", "two"),
      entry("user", "three"),
    ]);
    sessions = mkSessions({ contextTurns: 2 });
    const result = await sessions.open(true);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(host.prompts).toHaveLength(1);
    const text = host.prompts[0].input.parts[0].text;
    expect(host.prompts[0].id).toBe(result.value.target.mini);
    expect(host.prompts[0].input.noReply).toBe(true);
    expect(text.startsWith(CONTEXT_PREFIX)).toBe(true);
    expect(text).toContain("Assistant:\ntwo");
    expect(text).toContain("User:\nthree");
    expect(text).not.toContain("User:\none");
  });

  test("contextTurns 0 copies everything", async () => {
    host.messagesBy.set("main1", [
      entry("user", "one"),
      entry("assistant", "two"),
    ]);
    sessions = mkSessions({ contextTurns: 0 });
    await sessions.open(true);
    const text = host.prompts[0].input.parts[0].text;
    expect(text).toContain("User:\none");
    expect(text).toContain("Assistant:\ntwo");
  });

  test("a context copy failure still opens, as a warning", async () => {
    host.messagesBy.set("main1", [entry("user", "one")]);
    host.failMessagesFor.add("main1");
    const result = await sessions.open(true);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.warning).toContain("Context copy failed");
    expect(result.value.target.mini).toBeDefined();
  });

  test("re-opens the tracked mini without creating another", async () => {
    const first = await sessions.open(false);
    const count = host.sessions.length;
    const second = await sessions.open(false);
    expect(host.sessions.length).toBe(count);
    if (first.ok && second.ok)
      expect(second.value.target).toEqual(first.value.target);
  });

  test("falls back to the newest non-child, non-mini session", async () => {
    host.current = undefined;
    host.sessions = [
      { id: "child", title: "Child", parentID: "x", created: 9 },
      { id: "m", title: miniTitle("x"), created: 8 },
      { id: "main", title: "Main", created: 7 },
    ];
    const result = await sessions.open(false);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.target.main).toBe("main");
  });

  test("reports a failure when the mini cannot be created", async () => {
    host.failCreate = true;
    const result = await sessions.open(false);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("failed");
  });

  test("creates the mini with the plan agent and strict deny rules", async () => {
    const result = await sessions.open(false);
    expect(result.ok).toBe(true);
    expect(host.created).toHaveLength(1);
    expect(host.created[0].options.agent).toBe(MINI_AGENT);
    expect(host.created[0].options.agent).toBe("plan");
    expect(host.created[0].options.permission).toEqual([...MINI_PERMISSION]);
  });

  test("re-open enforces strict permissions on the reused mini", async () => {
    const first = await sessions.open(false);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    host.created = [];
    const second = await sessions.open(false);
    expect(second.ok).toBe(true);
    expect(host.created).toHaveLength(0);
    expect(host.permissionUpdates).toHaveLength(1);
    expect(host.permissionUpdates[0].id).toBe(first.value.target.mini);
    expect(host.permissionUpdates[0].permission).toEqual([
      ...MINI_PERMISSION,
    ]);
  });

  test("re-open fails hard when strict permissions cannot be enforced", async () => {
    const first = await sessions.open(false);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    host.failPermissionUpdateFor.add(first.value.target.mini);
    const second = await sessions.open(false);
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.error).toContain("permission");
  });
});

describe("finish", () => {
  test("send delivers the transcript to main and keeps the mini", async () => {
    const opened = await sessions.open(false);
    if (!opened.ok) throw new Error("open failed");
    const mini = opened.value.target.mini;
    host.messagesBy.set(mini, [entry("user", "hi"), entry("assistant", "yo")]);
    host.prompts = [];

    const result = await sessions.finish("send");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual({ delivered: true, closed: false });
    const last = host.prompts.at(-1)!;
    expect(last.id).toBe("main1");
    expect(last.input.noReply).toBe(true);
    expect(last.input.parts[0].text).toContain("Mini-session transcript:");
    expect(host.sessionExists(mini)).toBe(true);
    expect(host.deleted).not.toContain(mini);
  });

  test("send strips tool, file, agent and subtask parts", async () => {
    const opened = await sessions.open(false);
    if (!opened.ok) throw new Error("open failed");
    const mini = opened.value.target.mini;
    const mixed = (role: "user" | "assistant", parts: Array<unknown>): Entry =>
      ({
        info: { role } as unknown as Message,
        parts: parts as unknown as Entry["parts"],
      }) as Entry;
    host.messagesBy.set(mini, [
      mixed("user", [{ type: "text", text: "hi" }]),
      mixed("assistant", [
        { type: "text", text: "done" },
        { type: "tool", tool: "bash" },
        { type: "file", filename: "a.ts" },
        { type: "agent", name: "build" },
        { type: "subtask", description: "do it" },
      ]),
    ]);
    host.prompts = [];

    const result = await sessions.finish("send");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.delivered).toBe(true);
    const text = host.prompts.at(-1)!.input.parts[0].text;
    expect(text).toContain("User:\nhi");
    expect(text).toContain("Assistant:\ndone");
    expect(text).not.toContain("[tool:");
    expect(text).not.toContain("[file:");
    expect(text).not.toContain("[agent:");
    expect(text).not.toContain("[subtask:");
  });

  test("send treats a tool-only mini as empty", async () => {
    const opened = await sessions.open(false);
    if (!opened.ok) throw new Error("open failed");
    const mini = opened.value.target.mini;
    host.messagesBy.set(mini, [
      {
        info: { role: "assistant" } as unknown as Message,
        parts: [{ type: "tool", tool: "bash" } as unknown as Part],
      },
    ]);
    host.prompts = [];

    const result = await sessions.finish("send");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual({ delivered: false, closed: false });
    expect(host.prompts).toHaveLength(0);
  });

  test("send drops the injected mini-context block", async () => {
    const opened = await sessions.open(false);
    if (!opened.ok) throw new Error("open failed");
    const mini = opened.value.target.mini;
    const mixed = (role: "user" | "assistant", parts: Array<unknown>): Entry =>
      ({
        info: { role } as unknown as Message,
        parts: parts as unknown as Entry["parts"],
      }) as Entry;
    host.messagesBy.set(mini, [
      mixed("user", [
        {
          type: "text",
          text: "<mini-context>\nUser:\nhi\n\nAssistant:\n[tool: edit]",
        },
      ]),
      mixed("user", [{ type: "text", text: "real question" }]),
      mixed("assistant", [{ type: "text", text: "real answer" }]),
    ]);
    host.prompts = [];

    const result = await sessions.finish("send");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.delivered).toBe(true);
    const text = host.prompts.at(-1)!.input.parts[0].text;
    expect(text).toContain("real question");
    expect(text).toContain("real answer");
    expect(text).not.toContain("<mini-context>");
    expect(text).not.toContain("[tool:");
  });

  test("done delivers and deletes the mini", async () => {
    const opened = await sessions.open(false);
    if (!opened.ok) throw new Error("open failed");
    const mini = opened.value.target.mini;
    host.messagesBy.set(mini, [entry("user", "hi")]);

    const result = await sessions.finish("done");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual({ delivered: true, closed: true });
    expect(host.sessionExists(mini)).toBe(false);
  });

  test("close deletes without delivering", async () => {
    const opened = await sessions.open(false);
    if (!opened.ok) throw new Error("open failed");
    host.prompts = [];

    const result = await sessions.finish("close");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual({ delivered: false, closed: true });
    expect(host.prompts).toHaveLength(0);
  });

  test("an empty mini is not delivered", async () => {
    await sessions.open(false);
    const result = await sessions.finish("send");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual({ delivered: false, closed: false });
    expect(host.prompts).toHaveLength(0);
  });

  test("finds a marker-titled mini when none is active", async () => {
    host.sessions = [
      { id: "miniA", title: miniTitle("main1"), created: 1 },
      { id: "miniB", title: miniTitle("main1"), created: 2 },
      { id: "other", title: miniTitle("main2"), created: 3 },
    ];
    host.messagesBy.set("miniB", [entry("user", "newest")]);
    host.prompts = [];

    const result = await sessions.finish("send");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(host.prompts.at(-1)?.id).toBe("main1");
    expect(host.prompts.at(-1)?.input.parts[0].text).toContain("newest");
  });

  test("fails with no-target when no mini exists", async () => {
    const result = await sessions.finish("send");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("no-target");
  });
});

describe("purge", () => {
  test("deletes tracked and marker-titled sessions, leaving others", async () => {
    host.sessions = [
      { id: "normal", title: "Normal session", created: 1 },
      { id: "orphan", title: miniTitle("z"), created: 2 },
    ];
    const opened = await sessions.open(false);
    if (!opened.ok) throw new Error("open failed");

    const result = await sessions.purge();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual({ removed: 2, closed: true });
    expect(host.sessionExists("orphan")).toBe(false);
    expect(host.sessionExists(opened.value.target.mini)).toBe(false);
    expect(host.sessionExists("normal")).toBe(true);
  });

  test("counts only successful deletions", async () => {
    const opened = await sessions.open(false);
    if (!opened.ok) throw new Error("open failed");
    host.failDeleteFor.add(opened.value.target.mini);

    const result = await sessions.purge();
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.removed).toBe(0);
  });

  test("reports zero when there is nothing to purge", async () => {
    host.sessions = [{ id: "normal", title: "Normal session", created: 1 }];
    const result = await sessions.purge();
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual({ removed: 0, closed: false });
  });
});
