/** @jsxImportSource @opentui/solid */
import type { Renderable, TuiPluginApi } from "@opencode-ai/plugin/tui";
import { createSignal, Show } from "solid-js";
import type { MiniConfig } from "./config";
import type { HostPort } from "./host";
import type { FinishMode, MiniSessions, MiniTarget } from "./sessions";
import { MiniChat } from "./ui/mini-chat";

type Deps = { sessions: MiniSessions; host: HostPort; config: MiniConfig };

const [overlay, setOverlay] = createSignal<MiniTarget>();

let previousFocus: Renderable | null = null;
let popMiniMode: (() => void) | undefined;

function toast(
  api: TuiPluginApi,
  message: string,
  variant: "info" | "success" | "warning" | "error",
) {
  api.ui.toast({ message, variant, duration: 4000 });
}

function showOverlay(api: TuiPluginApi, target: MiniTarget) {
  if (overlay()) {
    setOverlay(target);
    return;
  }
  previousFocus = api.renderer.currentFocusedRenderable;
  popMiniMode = api.mode.push("mini");
  setOverlay(target);
}

function hideOverlay(api: TuiPluginApi) {
  setOverlay(undefined);
  popMiniMode?.();
  popMiniMode = undefined;
  const focus = previousFocus;
  previousFocus = null;
  setTimeout(() => {
    if (focus && !focus.isDestroyed) focus.focus();
  }, 0);
}

function openOverlay(api: TuiPluginApi, target: MiniTarget) {
  showOverlay(api, target);
}

async function openMini(api: TuiPluginApi, deps: Deps, copy: boolean) {
  const result = await deps.sessions.open(copy);
  if (!result.ok) {
    const message =
      result.reason === "no-target"
        ? result.error
        : `mini-session: ${result.error}`;
    toast(api, message, result.reason === "no-target" ? "warning" : "error");
    return;
  }
  openOverlay(api, result.value.target);
  if (result.value.warning) toast(api, result.value.warning, "warning");
}

async function finishMini(api: TuiPluginApi, deps: Deps, mode: FinishMode) {
  const result = await deps.sessions.finish(mode);
  if (!result.ok) {
    const message =
      result.reason === "no-target"
        ? result.error
        : `mini-session: ${result.error}`;
    toast(api, message, result.reason === "no-target" ? "warning" : "error");
    return;
  }

  const { delivered, closed } = result.value;
  if (mode === "send") {
    toast(
      api,
      delivered ? "Transcript sent to main session." : "Mini session is empty.",
      "success",
    );
  } else if (mode === "done") {
    toast(
      api,
      delivered
        ? "Transcript sent to main; mini session closed."
        : "Mini closed.",
      "success",
    );
  } else {
    toast(api, "Mini session closed.", "success");
  }

  if (closed) hideOverlay(api);
}

async function cleanMinis(api: TuiPluginApi, deps: Deps) {
  const result = await deps.sessions.purge();
  if (!result.ok) {
    toast(api, `mini-session: ${result.error}`, "error");
    return;
  }
  const { removed, closed } = result.value;
  toast(
    api,
    removed > 0
      ? `Purged ${removed} mini session${removed === 1 ? "" : "s"}.`
      : "No mini sessions to purge.",
    "success",
  );
  if (closed) hideOverlay(api);
}

export function registerCommands(api: TuiPluginApi, deps: Deps) {
  api.keymap.registerLayer({
    commands: [
      {
        name: "mini.open",
        title: "Mini: open overlay",
        desc: "Open a floating side chat that copies context from the current session",
        category: "Plugin",
        namespace: "palette",
        slashName: "mini",
        run() {
          void openMini(api, deps, true);
        },
      },
      {
        name: "mini.fresh",
        title: "Mini: open without context",
        desc: "Open a floating side chat with no copied context",
        category: "Plugin",
        namespace: "palette",
        slashName: "mini-fresh",
        run() {
          void openMini(api, deps, false);
        },
      },
      {
        name: "mini.send",
        title: "Mini: send transcript to main",
        desc: "Copy the mini conversation into the main session and keep the mini",
        category: "Plugin",
        namespace: "palette",
        slashName: "mini-send",
        run() {
          void finishMini(api, deps, "send");
        },
      },
      {
        name: "mini.close",
        title: "Mini: close",
        desc: "Delete the mini session",
        category: "Plugin",
        namespace: "palette",
        slashName: "mini-close",
        run() {
          void finishMini(api, deps, "close");
        },
      },
      {
        name: "mini.done",
        title: "Mini: send and close",
        desc: "Copy the mini conversation into the main session, then delete it",
        category: "Plugin",
        namespace: "palette",
        slashName: "mini-done",
        run() {
          void finishMini(api, deps, "done");
        },
      },
      {
        name: "mini.clean",
        title: "Mini: clean all",
        desc: "Delete every mini session created for this project",
        category: "Plugin",
        namespace: "palette",
        slashName: "mini-clean",
        run() {
          void cleanMinis(api, deps);
        },
      },
    ],
    bindings: [
      {
        key: deps.config.openKey,
        cmd: "mini.open",
        desc: "Mini: open overlay",
        group: "Mini",
      },
    ],
  });

  const cycleKey = api.tuiConfig.keybinds.get("agent.cycle")?.[0]?.key ?? "tab";
  const reverseKey =
    api.tuiConfig.keybinds.get("agent.cycle.reverse")?.[0]?.key ?? "shift+tab";

  api.keymap.registerLayer({
    mode: "mini",
    commands: [
      {
        name: "mini.hide",
        title: "Mini: hide overlay",
        desc: "Hide the mini overlay without deleting the session",
        category: "Mini",
        hidden: true,
        run() {
          hideOverlay(api);
        },
      },
    ],
    bindings: [
      {
        key: "escape",
        cmd: "mini.hide",
        desc: "Hide mini overlay",
        group: "Mini",
      },
      {
        key: cycleKey,
        cmd: "agent.cycle",
        desc: "Next agent",
        group: "Mini",
      },
      {
        key: reverseKey,
        cmd: "agent.cycle.reverse",
        desc: "Previous agent",
        group: "Mini",
      },
    ],
  });

  const Dialog = api.ui.Dialog;
  api.slots.register({
    slots: {
      app() {
        return (
          <Show when={overlay()}>
            {(target) => (
              <Dialog size={deps.config.size} onClose={() => hideOverlay(api)}>
                <MiniChat
                  api={api}
                  cfg={deps.config}
                  main={target().main}
                  mini={target().mini}
                  onHide={() => hideOverlay(api)}
                />
              </Dialog>
            )}
          </Show>
        );
      },
    },
  });
}
