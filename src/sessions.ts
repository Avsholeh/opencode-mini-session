import type { MiniConfig } from "./config";
import type { HostPort } from "./host";
import { CONTEXT_PREFIX, isMiniTitle, mainMarker, miniTitle } from "./markers";
import { MINI_AGENT, MINI_PERMISSION } from "./mini-policy";
import { describe, fail, ok, type Result } from "./result";
import {
  renderDeliveryTranscript,
  renderWithinTokenLimit,
  type Entry,
} from "./transcript";

export type MiniTarget = { main: string; mini: string };

export type OpenOutcome = { target: MiniTarget; warning?: string };

export type FinishMode = "send" | "done" | "close";

export type FinishOutcome = { delivered: boolean; closed: boolean };

export type PurgeOutcome = { removed: number; closed: boolean };

export type MiniSessions = {
  open(copy: boolean): Promise<Result<OpenOutcome>>;
  finish(mode: FinishMode): Promise<Result<FinishOutcome>>;
  purge(): Promise<Result<PurgeOutcome>>;
};

export function createMiniSessions(deps: {
  host: HostPort;
  config: MiniConfig;
}): MiniSessions {
  const { host, config } = deps;
  const state: {
    active?: MiniTarget;
    tracked: Map<string, string>;
    delivered: Map<string, number>;
  } = {
    tracked: new Map(),
    delivered: new Map(),
  };

  async function newestMain(): Promise<string | undefined> {
    const sessions = await host.listSessions();
    return sessions.find(
      (session) => !session.parentID && !isMiniTitle(session.title),
    )?.id;
  }

  async function resolveMain(): Promise<string | undefined> {
    return host.currentSessionID() ?? (await newestMain());
  }

  async function injectContext(main: string, mini: string): Promise<void> {
    const entries = await host.messages(main);
    const { text: transcript } = renderWithinTokenLimit(
      entries,
      config.thinking,
      config.tokenLimit,
    );
    if (!transcript.trim()) return;
    const text = `${CONTEXT_PREFIX}\nRecent transcript from the main session, copied so this side conversation has context. Treat it as background information and do not respond to it directly.\n\n${transcript}\n</mini-context>`;
    await host.prompt(mini, { noReply: true, parts: [{ type: "text", text }] });
  }

  async function transcriptOf(mini: string): Promise<string> {
    const entries: Array<Entry> = await host.messages(mini);
    const start = state.delivered.get(mini) ?? 0;
    const pending = entries.slice(start);
    const text = renderDeliveryTranscript(pending, config.thinking);
    if (text.trim()) state.delivered.set(mini, entries.length);
    return text;
  }

  async function findByMarker(): Promise<MiniTarget | undefined> {
    const main = await resolveMain();
    if (!main) return undefined;
    const sessions = await host.listSessions();
    const matches = sessions
      .filter((session) => mainMarker(session.title) === main)
      .sort((a, b) => b.created - a.created);
    const mini = matches[0]?.id;
    return mini ? { main, mini } : undefined;
  }

  async function resolveTarget(): Promise<MiniTarget | undefined> {
    if (state.active && host.sessionExists(state.active.mini))
      return state.active;
    return findByMarker();
  }

  async function removeMini(mini: string): Promise<void> {
    try {
      await host.deleteSession(mini);
    } catch {}
    state.tracked.delete(mini);
    state.delivered.delete(mini);
    if (state.active?.mini === mini) state.active = undefined;
  }

  return {
    async open(copy) {
      try {
        const main = await resolveMain();
        if (!main)
          return fail("No session to attach a mini session to.", "no-target");

        if (state.active && host.sessionExists(state.active.mini)) {
          await host.updateSessionPermission(
            state.active.mini,
            MINI_PERMISSION,
          );
          return ok({ target: state.active });
        }

        const mini = await host.createSession("mini — side chat", {
          agent: MINI_AGENT,
          permission: MINI_PERMISSION,
        });
        const target: MiniTarget = { main, mini };
        await host.renameSession(target.mini, miniTitle(main));
        state.active = target;
        state.tracked.set(target.mini, main);

        if (!copy) return ok({ target });

        try {
          await injectContext(target.main, target.mini);
          return ok({ target });
        } catch (error) {
          return ok({
            target,
            warning: `Context copy failed: ${describe(error)}`,
          });
        }
      } catch (error) {
        return fail(describe(error));
      }
    },

    async finish(mode) {
      try {
        const target = await resolveTarget();
        if (!target) {
          return fail(
            "No mini session found. Open one with /mini or <leader>i.",
            "no-target",
          );
        }

        let delivered = false;
        if (mode !== "close") {
          const transcript = await transcriptOf(target.mini);
          if (transcript.trim()) {
            const text = `Mini-session transcript:\n\n${transcript}\n\n(End of mini-session transcript.)`;
            await host.prompt(target.main, {
              noReply: true,
              parts: [{ type: "text", text }],
            });
            delivered = true;
          }
        }

        let closed = false;
        if (mode !== "send") {
          await removeMini(target.mini);
          closed = true;
        }

        return ok({ delivered, closed });
      } catch (error) {
        return fail(describe(error));
      }
    },

    async purge() {
      try {
        const sessions = await host.listSessions();
        const ids = new Set<string>(state.tracked.keys());
        for (const session of sessions)
          if (isMiniTitle(session.title)) ids.add(session.id);

        let removed = 0;
        for (const id of ids) {
          try {
            await host.deleteSession(id);
            removed += 1;
          } catch {}
          state.tracked.delete(id);
          state.delivered.delete(id);
        }

        const closed = Boolean(state.active && ids.has(state.active.mini));
        if (closed) state.active = undefined;

        return ok({ removed, closed });
      } catch (error) {
        return fail(describe(error));
      }
    },
  };
}
