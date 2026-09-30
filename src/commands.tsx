/** @jsxImportSource @opentui/solid */
import type { TuiPluginApi } from "@opencode-ai/plugin/tui";
import type { MiniConfig } from "./config";
import type { HostPort } from "./host";
import type { FinishMode, MiniSessions, MiniTarget } from "./sessions";
import { MiniChat } from "./ui/mini-chat";

type Deps = { sessions: MiniSessions; host: HostPort; config: MiniConfig };

function toast(
  api: TuiPluginApi,
  message: string,
  variant: "info" | "success" | "warning" | "error",
) {
  api.ui.toast({ message, variant, duration: 4000 });
}

function openOverlay(api: TuiPluginApi, deps: Deps, target: MiniTarget) {
  api.ui.dialog.replace(
    () => (
      <MiniChat
        api={api}
        host={deps.host}
        cfg={deps.config}
        main={target.main}
        mini={target.mini}
        onSendToMain={() => void finishMini(api, deps, "send")}
        onSendAndClose={() => void finishMini(api, deps, "done")}
      />
    ),
    () => {},
  );
  api.ui.dialog.setSize(deps.config.size);
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
  openOverlay(api, deps, result.value.target);
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

  if (closed) api.ui.dialog.clear();
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
  if (closed) api.ui.dialog.clear();
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
      {
        key: deps.config.freshKey,
        cmd: "mini.fresh",
        desc: "Mini: open without context",
        group: "Mini",
      },
      {
        key: deps.config.cleanKey,
        cmd: "mini.clean",
        desc: "Mini: clean all",
        group: "Mini",
      },
    ],
  });
}
