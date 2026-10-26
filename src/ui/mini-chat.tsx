/** @jsxImportSource @opentui/solid */
import { useTerminalDimensions } from "@opentui/solid";
import {
  For,
  Show,
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  onMount,
  type JSX,
} from "solid-js";
import {
  type TextareaRenderable,
  type KeyBinding,
  type SyntaxStyle,
} from "@opentui/core";
import { generateSyntax } from "@opencode/theme/tui";
import type { Context } from "@opencode/plugin/tui/context";
import type { SessionMessageInfo } from "@opencode/client";
import type { MiniConfig } from "../config";
import type { HostPort } from "../host";
import { CONTEXT_PREFIX, shortID } from "../markers";
import { resolvePromptModel, type ModelRef } from "../model";
import { MINI_AGENT } from "../mini-policy";
import { describe } from "../result";
import { toolLine, type ToolPart } from "../tool";
import type { Part } from "../transcript";

const MINI_KEYBINDINGS: KeyBinding[] = [
  { name: "return", action: "submit" },
  { name: "kpenter", action: "submit" },
  { name: "return", shift: true, action: "newline" },
  { name: "kpenter", shift: true, action: "newline" },
];

export function MiniChat(props: {
  context: Context;
  host: HostPort;
  cfg: MiniConfig;
  main: string;
  mini: string;
  modelOverride?: () => ModelRef | undefined;
  onSendToMain: () => void;
  onSendAndClose: () => void;
}): JSX.Element {
  const dim = useTerminalDimensions();
  const theme = () => props.context.theme;
  const syntaxStyle = createMemo(() =>
    generateSyntax(theme(), props.context.renderer.nativeScene),
  );
  const messages = () =>
    props.context.data.session.message.list(props.mini) ?? [];
  const status = () => props.context.data.session.status(props.mini);
  const busy = () => status() === "running";
  const hasMessages = () => messages().length > 0;
  const height = () => Math.max(6, dim().height - 12);

  const [pulse, setPulse] = createSignal(true);
  onMount(() => {
    props.context.ui.dialog.set({ size: props.cfg.size, centered: true });
  });
  createEffect(() => {
    if (!busy()) {
      setPulse(true);
      return;
    }
    const timer = setInterval(() => setPulse((value) => !value), 500);
    onCleanup(() => clearInterval(timer));
  });

  const statusView = () => {
    if (busy())
      return (
        <text fg={theme().text.feedback.info.base}>
          {pulse() ? "●" : "○"} working
        </text>
      );
    return <text fg={theme().text.muted}>○ idle</text>;
  };

  const thinking = () => {
    if (!busy()) return false;
    const list = messages();
    const last = list[list.length - 1];
    if (!last || last.type !== "assistant") return false;
    return ((last as any).content ?? []).length === 0;
  };

  let input: TextareaRenderable | undefined;

  const focus = (ref: TextareaRenderable | undefined) => {
    input = ref;
    if (!ref) return;
    setTimeout(() => ref.focus(), 1);
  };

  const send = () => {
    const node = input;
    if (!node) return;
    const text = node.plainText.trim();
    if (!text) return;
    node.clear();
    void submitPrompt(
      props.host,
      props.context,
      props.cfg,
      props.main,
      props.mini,
      text,
      props.modelOverride,
      () => {
        if (!node.plainText.trim()) node.setText(text);
      },
    );
  };

  return (
    <box
      flexDirection="column"
      paddingLeft={2}
      paddingRight={2}
      paddingBottom={1}
      gap={1}
    >
      <box flexDirection="row" justifyContent="space-between">
        <text fg={theme().text.muted}>
          <span style={{ fg: theme().text.feedback.info.base }}>
            <b>MINI</b>
          </span>{" "}
          main {shortID(props.main)}
        </text>
        <box flexDirection="row" gap={1}>
          {statusView()}
          <text
            fg={theme().text.muted}
            onMouseUp={() => props.context.ui.dialog.clear()}
          >
            esc hide
          </text>
        </box>
      </box>

      <scrollbox
        height={height()}
        stickyScroll={true}
        stickyStart="bottom"
        verticalScrollbarOptions={{
          visible: true,
          trackOptions: {
            backgroundColor: theme().background.base,
            foregroundColor: theme().border.base,
          },
        }}
      >
        <Show
          when={hasMessages()}
          fallback={
            <box flexDirection="column" gap={1}>
              <text fg={theme().text.base}>No messages yet.</text>
              <text fg={theme().text.muted}>
                Ask a side question — the main session keeps running.
              </text>
            </box>
          }
        >
          <For each={messages()}>
            {(message) => (
              <Turn
                context={props.context}
                message={message}
                thinking={props.cfg.thinking}
                syntaxStyle={syntaxStyle()}
              />
            )}
          </For>
        </Show>
        <Show when={thinking()}>
          <box
            border={["left"]}
            borderStyle="single"
            borderColor={theme().text.feedback.info.base}
            paddingLeft={1}
            marginBottom={1}
          >
            <text fg={theme().text.muted}>thinking…</text>
          </box>
        </Show>
      </scrollbox>

      <box
        border={true}
        borderStyle="single"
        borderColor={theme().border.base}
        paddingX={1}
        backgroundColor={theme().background.raised.base}
      >
        <textarea
          ref={focus}
          height={3}
          padding={1}
          keyBindings={MINI_KEYBINDINGS}
          placeholder="Ask a side question…"
          textColor={theme().text.base}
          focusedTextColor={theme().text.base}
          placeholderColor={theme().text.muted}
          backgroundColor={theme().background.raised.base}
          focusedBackgroundColor={theme().background.raised.base}
          onSubmit={send}
        />
      </box>

      <box flexDirection="row" justifyContent="space-between">
        <text fg={theme().text.muted}>enter send · ctrl+j newline</text>
        <box flexDirection="row" gap={2}>
          <text
            fg={
              hasMessages()
                ? theme().text.action.primary.base
                : theme().text.muted
            }
            onMouseUp={hasMessages() ? () => props.onSendToMain() : undefined}
          >
            [file to main]
          </text>
          <text
            fg={
              hasMessages()
                ? theme().text.action.primary.base
                : theme().text.muted
            }
            onMouseUp={hasMessages() ? () => props.onSendAndClose() : undefined}
          >
            [send & close]
          </text>
        </box>
      </box>
    </box>
  );
}

function Turn(props: {
  context: Context;
  message: SessionMessageInfo;
  thinking: boolean;
  syntaxStyle: SyntaxStyle;
}): JSX.Element {
  const theme = () => props.context.theme;
  const isUser = () =>
    props.message.type === "user" || props.message.type === "synthetic";
  const error = () => {
    const message = props.message;
    return message.type === "assistant" && message.error
      ? message.error.message
      : undefined;
  };

  return (
    <box
      flexDirection="column"
      border={["left"]}
      borderStyle={isUser() ? "heavy" : "single"}
      borderColor={
        isUser()
          ? theme().text.action.primary.base
          : theme().text.feedback.info.base
      }
      paddingLeft={1}
      marginBottom={1}
    >
      <text
        fg={
          isUser()
            ? theme().text.action.primary.base
            : theme().text.feedback.info.base
        }
      >
        <b>{isUser() ? "YOU" : "MINI"}</b>
      </text>
      <Show
        when={
          props.message.type === "user" || props.message.type === "synthetic"
        }
      >
        <PartView
          context={props.context}
          part={{ type: "text", text: (props.message as any).text ?? "" }}
          thinking={props.thinking}
          syntaxStyle={props.syntaxStyle}
        />
      </Show>
      <Show when={props.message.type === "assistant"}>
        <For each={(props.message as any).content ?? []}>
          {(part: any) => (
            <PartView
              context={props.context}
              part={part}
              thinking={props.thinking}
              syntaxStyle={props.syntaxStyle}
            />
          )}
        </For>
      </Show>
      <Show when={error()}>
        {(failure) => (
          <text fg={theme().text.feedback.error.base}>{failure()}</text>
        )}
      </Show>
    </box>
  );
}

function PartView(props: {
  context: Context;
  part: Part;
  thinking: boolean;
  syntaxStyle: SyntaxStyle;
}): JSX.Element {
  const theme = () => props.context.theme;
  const part = props.part;
  if (part.type === "text") {
    if (part.text.startsWith(CONTEXT_PREFIX))
      return (
        <text fg={theme().text.muted}>
          <span style={{ fg: theme().text.feedback.success.base }}>┆</span>{" "}
          context · copied from main
        </text>
      );
    return (
      <box width="100%">
        <markdown
          content={part.text}
          syntaxStyle={props.syntaxStyle}
          fg={theme().text.base}
          width="100%"
        />
      </box>
    );
  }
  if (part.type === "reasoning") {
    if (!props.thinking) return null;
    return <text fg={theme().text.muted}>{part.text}</text>;
  }
  if (part.type === "tool")
    return <ToolView context={props.context} part={part} />;
  if (part.type === "file")
    return <text fg={theme().text.muted}>◇ {part.filename ?? part.url}</text>;
  if (part.type === "agent")
    return <text fg={theme().text.muted}>@ {part.name}</text>;
  if (part.type === "subtask")
    return <text fg={theme().text.muted}>⌥ {part.description}</text>;
  return null;
}

function ToolView(props: { context: Context; part: any }): JSX.Element {
  const theme = () => props.context.theme;
  const line = createMemo(() =>
    toolLine(
      props.part.state
        ? (props.part as ToolPart)
        : {
            tool: props.part.name ?? props.part.tool,
            state: props.part.state ?? {},
          },
    ),
  );
  return (
    <text
      fg={line().error ? theme().text.feedback.error.base : theme().text.muted}
    >
      {line().text}
    </text>
  );
}

async function submitPrompt(
  host: HostPort,
  context: Context,
  cfg: MiniConfig,
  main: string,
  mini: string,
  text: string,
  modelOverride: (() => ModelRef | undefined) | undefined,
  onError: () => void,
) {
  try {
    const inherited = host.lastUserModel(main);
    const model = resolvePromptModel(cfg, modelOverride?.(), inherited?.model);
    await host.prompt(mini, {
      parts: [{ type: "text", text }],
      model,
      agent: MINI_AGENT,
    });
  } catch (error) {
    onError();
    context.ui.toast.show({
      message: `mini-session: ${describe(error)}`,
      variant: "error",
      duration: 4000,
    });
  }
}
