import type { TuiPluginApi } from "@opencode-ai/plugin/tui";
import type { Message, TextPartInput } from "@opencode-ai/sdk/v2";
import type { Entry } from "./transcript";
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

export type HostPort = {
  currentSessionID(): string | undefined;
  listSessions(): Promise<Array<SessionInfo>>;
  sessionExists(id: string): boolean;
  createSession(title: string): Promise<string>;
  renameSession(id: string, title: string): Promise<void>;
  deleteSession(id: string): Promise<void>;
  messages(id: string): Promise<Array<Entry>>;
  lastUserModel(id: string): { model?: ModelRef; agent?: string } | undefined;
  prompt(id: string, input: PromptInput): Promise<void>;
};

export function createHost(api: TuiPluginApi): HostPort {
  return {
    currentSessionID() {
      const current = api.route.current;
      if (current.name === "session" && "params" in current) {
        const id = current.params?.sessionID;
        if (typeof id === "string") return id;
      }
      return undefined;
    },

    async listSessions() {
      const sessions = unwrap(await api.client.session.list(), "list sessions");
      return sessions.map((session) => ({
        id: session.id,
        title: session.title,
        parentID: session.parentID,
        created: session.time?.created ?? 0,
      }));
    },

    sessionExists(id) {
      return api.state.session.get(id) !== undefined;
    },

    async createSession(title) {
      const created = unwrap(
        await api.client.session.create({ title }),
        "create mini session",
      );
      return created.id;
    },

    async renameSession(id, title) {
      unwrap(
        await api.client.session.update({ sessionID: id, title }),
        "title mini session",
      );
    },

    async deleteSession(id) {
      unwrap(
        await api.client.session.delete({ sessionID: id }),
        "delete mini session",
      );
    },

    async messages(id) {
      return unwrap(
        await api.client.session.messages({ sessionID: id }),
        "read session messages",
      ) as Array<Entry>;
    },

    lastUserModel(id) {
      const messages = api.state.session.messages(id);
      for (let index = messages.length - 1; index >= 0; index -= 1) {
        const message = messages[index] as Message & {
          model?: ModelRef;
          agent?: string;
        };
        if (message.role === "user" && message.model) {
          return {
            model: {
              providerID: message.model.providerID,
              modelID: message.model.modelID,
            },
            agent: message.agent,
          };
        }
      }
      return undefined;
    },

    async prompt(id, input) {
      const parts: Array<TextPartInput> = input.parts;
      unwrap(
        await api.client.session.prompt({
          sessionID: id,
          noReply: input.noReply,
          model: input.model,
          agent: input.agent,
          parts,
        }),
        "send message to session",
      );
    },
  };
}
