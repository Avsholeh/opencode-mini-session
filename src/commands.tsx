/** @jsxImportSource @opentui/solid */
import type {
  TuiDialogSelectOption,
  TuiPluginApi,
} from "@opencode-ai/plugin/tui";
import type { Provider } from "@opencode-ai/sdk/v2";
import type { MiniConfig } from "./config";
import type { HostPort } from "./host";
import { formatModelRef, parseModelOverride, type ModelRef } from "./model";
import type { FinishMode, MiniSessions, MiniTarget } from "./sessions";
import { MiniChat } from "./ui/mini-chat";

type Deps = {
  sessions: MiniSessions;
  host: HostPort;
  config: MiniConfig;
  model?: () => ModelRef | undefined;
};

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
        modelOverride={deps.model}
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

function buildModelOptions(
  providers: ReadonlyArray<Provider>,
): TuiDialogSelectOption<string>[] {
  const options: TuiDialogSelectOption<string>[] = [
    {
      title: "default (main session model)",
      value: "default",
      description: "Inherit the model from the main session",
      category: "Default",
    },
  ];
  const sorted = [...providers].sort((left, right) =>
    left.name.localeCompare(right.name),
  );
  for (const provider of sorted) {
    const models = Object.values(provider.models).sort((left, right) =>
      left.name.localeCompare(right.name),
    );
    for (const model of models) {
      options.push({
        title: model.name || model.id,
        value: `${provider.id}/${model.id}`,
        description: `${provider.id}/${model.id}`,
        category: provider.name,
      });
    }
  }
  return options;
}

export function registerCommands(api: TuiPluginApi, deps: Deps) {
  let selectedModel: ModelRef | undefined;
  deps.model = () => selectedModel;

  const openModelPicker = () => {
    api.ui.dialog.setSize("large");
    api.ui.dialog.replace(() =>
      api.ui.DialogSelect<string>({
        title: "mini model",
        placeholder: "Select the model for mini-session questions",
        current: selectedModel ? formatModelRef(selectedModel) : "default",
        options: buildModelOptions(api.state.provider),
        onSelect: (option) => {
          selectedModel =
            option.value === "default"
              ? undefined
              : parseModelOverride(option.value);
          api.ui.toast({
            variant: "success",
            message: `mini model set to ${formatModelRef(selectedModel)}.`,
          });
          api.ui.dialog.clear();
        },
      }),
    );
  };

  api.keymap.registerLayer({
    commands: [
      {
        name: "mini.model",
        title: "Mini: change model",
        desc: "Choose the model used for mini-session questions",
        category: "Plugin",
        namespace: "palette",
        slashName: "mini-model",
        run() {
          openModelPicker();
        },
      },
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
