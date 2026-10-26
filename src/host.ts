import type { Context } from "@opencode/plugin/tui/context";
import type { MiniPermissionRule } from "./mini-policy";
import type { Entry, Part } from "./transcript";
import { unwrap } from "./result";

export type SessionInfo = {
  id: string;
  title: string;
  parentID?: string;
  created: number;
};

export type ModelRef = { providerID: string; modelID: string };

export type PromptInput = {
  parts: Array<{ type: "text"; text: string }>;
  noReply?: boolean;
  model?: ModelRef;
  agent?: string;
};

export type CreateSessionOptions = {
  agent: string;
  permission: ReadonlyArray<MiniPermissionRule>;
};

export type HostPort = {
  currentSessionID(): string | undefined;
  listSessions(): Promise<Array<SessionInfo>>;
  sessionExists(id: string): boolean;
  createSession(title: string, options: CreateSessionOptions): Promise<string>;
  renameSession(id: string, title: string): Promise<void>;
  updateSessionPermission(
    id: string,
    permission: ReadonlyArray<MiniPermissionRule>,
  ): Promise<void>;
  deleteSession(id: string): Promise<void>;
  messages(id: string): Promise<Array<Entry>>;
  lastUserModel(id: string): { model?: ModelRef; agent?: string } | undefined;
  prompt(id: string, input: PromptInput): Promise<void>;
};

export function createHost(context: Context): HostPort {
  return {
    currentSessionID() {
      const current = context.ui.router.current();
      if (current.type === "session" && typeof current.sessionID === "string") {
        return current.sessionID;
      }
      return undefined;
    },

    async listSessions() {
      const res = unwrap(await context.client.session.list(), "list sessions");
      const sessions = Array.isArray(res) ? res : ((res as any).data ?? []);
      return (sessions as Array<any>).map((session) => ({
        id: session.id,
        title: session.title ?? "",
        parentID: session.parentID ?? undefined,
        created: session.time?.created ?? 0,
      }));
    },

    sessionExists(id) {
      return context.data.session.get(id) !== undefined;
    },

    async createSession(title, options) {
      const created = unwrap(
        await context.client.session.create({
          title,
          agent: options.agent,
          permissions: [...options.permission],
        }),
        "create mini session",
      );
      return created.id;
    },

    async renameSession(id, title) {
      unwrap(
        await context.client.session.update({ sessionID: id, title }),
        "title mini session",
      );
    },

    async updateSessionPermission(id, permission) {
      unwrap(
        await context.client.session.update({
          sessionID: id,
          permissions: [...permission],
        }),
        "lock mini session permissions",
      );
    },

    async deleteSession(id) {
      unwrap(
        await context.client.session.remove({ sessionID: id }),
        "delete mini session",
      );
    },

    async messages(id) {
      const res = unwrap(
        await context.client.message.list({ sessionID: id }),
        "read session messages",
      );
      const items = Array.isArray(res) ? res : ((res as any).data ?? []);
      return items.map((msg: any): Entry => {
        if (msg.type === "user" || msg.type === "synthetic") {
          return {
            info: { role: "user", type: msg.type },
            parts: [{ type: "text", text: msg.text ?? "" }],
          };
        }
        if (msg.type === "assistant") {
          const parts: Array<Part> = (msg.content ?? []).map((c: any) => {
            if (c.type === "tool") {
              return {
                type: "tool",
                tool: c.name ?? c.tool,
                name: c.name ?? c.tool,
                state: c.state,
              };
            }
            return c;
          });
          return {
            info: { role: "assistant", type: msg.type },
            parts,
          };
        }
        return {
          info: { type: msg.type },
          parts: [],
        };
      });
    },

    lastUserModel(id) {
      const messages = context.data.session.message.list(id);
      for (let index = messages.length - 1; index >= 0; index -= 1) {
        const message = messages[index] as any;
        if (message.type === "model-switched" && message.model) {
          return {
            model: {
              providerID: message.model.providerID,
              modelID: message.model.modelID ?? message.model.id,
            },
          };
        }
        if (message.type === "assistant" && message.model) {
          return {
            model: {
              providerID: message.model.providerID,
              modelID: message.model.modelID ?? message.model.id,
            },
            agent: message.agent,
          };
        }
      }
      return undefined;
    },

    async prompt(id, input) {
      if (input.model) {
        try {
          await context.client.session.switchModel({
            sessionID: id,
            model: {
              id: input.model.modelID,
              providerID: input.model.providerID,
            },
          });
        } catch {}
      }
      if (input.agent) {
        try {
          await context.client.session.switchAgent({
            sessionID: id,
            agent: input.agent,
          });
        } catch {}
      }
      const text = input.parts.map((p) => p.text).join("\n");
      if (input.noReply) {
        unwrap(
          await context.client.session.synthetic({
            sessionID: id,
            text,
            resume: false,
          }),
          "send synthetic message to session",
        );
      } else {
        unwrap(
          await context.client.session.prompt({
            sessionID: id,
            text,
          }),
          "send message to session",
        );
      }
    },
  };
}
