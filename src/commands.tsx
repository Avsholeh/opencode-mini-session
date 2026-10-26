/** @jsxImportSource @opentui/solid */
import type { Context, DialogSelectOption } from "@opencode/plugin/tui/context";
import type { ModelInfo } from "@opencode/client";
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
  context: Context,
  message: string,
  variant: "info" | "success" | "warning" | "error",
) {
  context.ui.toast.show({ message, variant, duration: 4000 });
}

function openOverlay(context: Context, deps: Deps, target: MiniTarget) {
  context.ui.dialog.show(
    () => (
      <MiniChat
        context={context}
        host={deps.host}
        cfg={deps.config}
        main={target.main}
        mini={target.mini}
        modelOverride={deps.model}
        onSendToMain={() => void finishMini(context, deps, "send")}
        onSendAndClose={() => void finishMini(context, deps, "done")}
      />
    ),
    () => {},
  );
  context.ui.dialog.set({ size: deps.config.size, centered: true });
}

async function openMini(context: Context, deps: Deps, copy: boolean) {
  const result = await deps.sessions.open(copy);
  if (!result.ok) {
    const message =
      result.reason === "no-target"
        ? result.error
        : `mini-session: ${result.error}`;
    toast(
      context,
      message,
      result.reason === "no-target" ? "warning" : "error",
    );
    return;
  }
  openOverlay(context, deps, result.value.target);
  if (result.value.warning) toast(context, result.value.warning, "warning");
}

async function finishMini(context: Context, deps: Deps, mode: FinishMode) {
  const result = await deps.sessions.finish(mode);
  if (!result.ok) {
    const message =
      result.reason === "no-target"
        ? result.error
        : `mini-session: ${result.error}`;
    toast(
      context,
      message,
      result.reason === "no-target" ? "warning" : "error",
    );
    return;
  }

  const { delivered, closed } = result.value;
  if (mode === "send") {
    toast(
      context,
      delivered ? "Transcript sent to main session." : "Mini session is empty.",
      "success",
    );
  } else if (mode === "done") {
    toast(
      context,
      delivered
        ? "Transcript sent to main; mini session closed."
        : "Mini closed.",
      "success",
    );
  } else {
    toast(context, "Mini session closed.", "success");
  }

  if (closed) context.ui.dialog.clear();
}

async function cleanMinis(context: Context, deps: Deps) {
  const result = await deps.sessions.purge();
  if (!result.ok) {
    toast(context, `mini-session: ${result.error}`, "error");
    return;
  }
  const { removed, closed } = result.value;
  toast(
    context,
    removed > 0
      ? `Purged ${removed} mini session${removed === 1 ? "" : "s"}.`
      : "No mini sessions to purge.",
    "success",
  );
  if (closed) context.ui.dialog.clear();
}

function buildModelOptions(
  models: ReadonlyArray<ModelInfo>,
): DialogSelectOption<string>[] {
  const options: DialogSelectOption<string>[] = [
    {
      title: "default (main session model)",
      value: "default",
      description: "Inherit the model from the main session",
      category: "Default",
    },
  ];
  const sorted = [...models]
    .filter((model) => model.enabled !== false)
    .sort((left, right) =>
      (left.providerID + left.name).localeCompare(
        right.providerID + right.name,
      ),
    );
  for (const model of sorted) {
    options.push({
      title: model.name || model.id,
      value: `${model.providerID}/${model.modelID}`,
      description: `${model.providerID}/${model.modelID}`,
      category: model.providerID,
    });
  }
  return options;
}

export function registerCommands(context: Context, deps: Deps) {
  let selectedModel: ModelRef | undefined;
  deps.model = () => selectedModel;

  const openModelPicker = async () => {
    context.ui.dialog.set({ size: "large" });
    const location = context.location ?? context.data.location.default();
    const models = context.data.location.model.list(location) ?? [];
    const selected = await context.ui.dialog.select<string>({
      title: "mini model",
      placeholder: "Select the model for mini-session questions",
      current: selectedModel ? formatModelRef(selectedModel) : "default",
      options: buildModelOptions(models),
    });
    if (selected !== undefined) {
      selectedModel =
        selected === "default" ? undefined : parseModelOverride(selected);
      context.ui.toast.show({
        variant: "success",
        message: `mini model set to ${formatModelRef(selectedModel)}.`,
      });
    }
  };

  context.keymap.layer(() => ({
    mode: "global",
    commands: [
      {
        id: "mini.model",
        title: "Mini: change model",
        description: "Choose the model used for mini-session questions",
        group: "Mini",
        palette: true,
        slash: { name: "mini-model" },
        run() {
          void openModelPicker();
        },
      },
      {
        id: "mini.open",
        title: "Mini: open overlay",
        description:
          "Open a floating side chat that copies context from the current session",
        group: "Mini",
        bind: deps.config.openKey,
        palette: true,
        slash: { name: "mini" },
        run() {
          void openMini(context, deps, true);
        },
      },
      {
        id: "mini.fresh",
        title: "Mini: open without context",
        description: "Open a floating side chat with no copied context",
        group: "Mini",
        bind: deps.config.freshKey,
        palette: true,
        slash: { name: "mini-fresh" },
        run() {
          void openMini(context, deps, false);
        },
      },
      {
        id: "mini.send",
        title: "Mini: send transcript to main",
        description:
          "Copy the mini conversation into the main session and keep the mini",
        group: "Mini",
        palette: true,
        slash: { name: "mini-send" },
        run() {
          void finishMini(context, deps, "send");
        },
      },
      {
        id: "mini.close",
        title: "Mini: close",
        description: "Delete the mini session",
        group: "Mini",
        palette: true,
        slash: { name: "mini-close" },
        run() {
          void finishMini(context, deps, "close");
        },
      },
      {
        id: "mini.done",
        title: "Mini: send and close",
        description:
          "Copy the mini conversation into the main session, then delete it",
        group: "Mini",
        palette: true,
        slash: { name: "mini-done" },
        run() {
          void finishMini(context, deps, "done");
        },
      },
      {
        id: "mini.clean",
        title: "Mini: clean all",
        description: "Delete every mini session created for this project",
        group: "Mini",
        bind: deps.config.cleanKey,
        palette: true,
        slash: { name: "mini-clean" },
        run() {
          void cleanMinis(context, deps);
        },
      },
    ],
    bindings: ["mini.open", "mini.fresh", "mini.clean"],
  }));
}
