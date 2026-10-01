/** @jsxImportSource @opentui/solid */
import { useTerminalDimensions } from "@opentui/solid";
import {
  For,
  Show,
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  type JSX,
} from "solid-js";
import type { TextareaRenderable, KeyBinding } from "@opentui/core";
import type { TuiPluginApi } from "@opencode-ai/plugin/tui";
import type {
  AssistantMessage,
  Message,
  Part,
  ToolPart,
} from "@opencode-ai/sdk/v2";
import type { MiniConfig } from "../config";
import type { HostPort } from "../host";
import { CONTEXT_PREFIX, shortID } from "../markers";
import { MINI_AGENT } from "../mini-policy";
import { describe } from "../result";
import { toolLine } from "../tool";

const MINI_KEYBINDINGS: KeyBinding[] = [
  { name: "return", action: "submit" },
  { name: "kpenter", action: "submit" },
  { name: "return", shift: true, action: "newline" },
  { name: "kpenter", shift: true, action: "newline" },
];

export function MiniChat(props: {
  api: TuiPluginApi;
  host: HostPort;
  cfg: MiniConfig;
  main: string;
  mini: string;
  onSendToMain: () => void;
  onSendAndClose: () => void;
}): JSX.Element {
  const dim = useTerminalDimensions();
  const theme = () => props.api.theme.current;
  const messages = () => props.api.state.session.messages(props.mini);
  const status = () => props.api.state.session.status(props.mini);
  const busy = () => status()?.type === "busy";
  const hasMessages = () => messages().length > 0;
  const height = () =>
    Math.max(6, Math.min(26, Math.floor(dim().height * 0.45)));

  const [pulse, setPulse] = createSignal(true);
  createEffect(() => {
    if (!busy()) {
      setPulse(true);
      return;
    }
    const timer = setInterval(() => setPulse((value) => !value), 500);
    onCleanup(() => clearInterval(timer));
  });

  const statusView = () => {
    const current = status();
    if (current?.type === "busy")
      return <text fg={theme().accent}>{pulse() ? "●" : "○"} working</text>;
    if (current?.type === "retry")
      return <text fg={theme().warning}>◉ retrying {current.attempt}</text>;
    return <text fg={theme().textMuted}>○ idle</text>;
  };

  const thinking = () => {
    if (!busy()) return false;
    const list = messages();
    const last = list[list.length - 1];
    if (!last || last.role !== "assistant") return false;
    return props.api.state.part(last.id).length === 0;
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
      props.api,
      props.main,
      props.mini,
      text,
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
        <text fg={theme().textMuted}>
          <span style={{ fg: theme().accent }}>
            <b>MINI</b>
          </span>{" "}
          main {shortID(props.main)}
        </text>
        <box flexDirection="row" gap={1}>
          {statusView()}
          <text
            fg={theme().textMuted}
            onMouseUp={() => props.api.ui.dialog.clear()}
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
            backgroundColor: theme().backgroundElement,
            foregroundColor: theme().border,
          },
        }}
      >
        <Show
          when={hasMessages()}
          fallback={
            <box flexDirection="column" gap={1}>
              <text fg={theme().text}>No messages yet.</text>
              <text fg={theme().textMuted}>
                Ask a side question — the main session keeps running.
              </text>
            </box>
          }
        >
          <For each={messages()}>
            {(message) => (
              <Turn
                api={props.api}
                message={message}
                thinking={props.cfg.thinking}
              />
            )}
          </For>
        </Show>
        <Show when={thinking()}>
          <box
            border={["left"]}
            borderStyle="single"
            borderColor={theme().accent}
            paddingLeft={1}
            marginBottom={1}
          >
            <text fg={theme().textMuted}>thinking…</text>
          </box>
        </Show>
      </scrollbox>

      <box
        border={true}
        borderStyle="single"
        borderColor={theme().border}
        paddingX={1}
        backgroundColor={theme().backgroundPanel}
      >
        <textarea
          ref={focus}
          height={3}
          padding={1}
          keyBindings={MINI_KEYBINDINGS}
          placeholder="Ask a side question…"
          textColor={theme().text}
          focusedTextColor={theme().text}
          placeholderColor={theme().textMuted}
          backgroundColor={theme().backgroundPanel}
          focusedBackgroundColor={theme().backgroundPanel}
          onSubmit={send}
        />
      </box>

      <box flexDirection="row" justifyContent="space-between">
        <text fg={theme().textMuted}>enter send · ctrl+j newline</text>
        <box flexDirection="row" gap={2}>
          <text
            fg={hasMessages() ? theme().primary : theme().textMuted}
            onMouseUp={hasMessages() ? () => props.onSendToMain() : undefined}
          >
            [file to main]
          </text>
          <text
            fg={hasMessages() ? theme().primary : theme().textMuted}
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
  api: TuiPluginApi;
  message: Message;
  thinking: boolean;
}): JSX.Element {
  const theme = () => props.api.theme.current;
  const isUser = () => props.message.role === "user";
  const error = (): AssistantMessage["error"] => {
    const message = props.message;
    return message.role === "assistant" ? message.error : undefined;
  };

  return (
    <box
      flexDirection="column"
      border={["left"]}
      borderStyle={isUser() ? "heavy" : "single"}
      borderColor={isUser() ? theme().primary : theme().accent}
      paddingLeft={1}
      marginBottom={1}
    >
      <text fg={isUser() ? theme().primary : theme().accent}>
        <b>{isUser() ? "YOU" : "MINI"}</b>
      </text>
      <For each={props.api.state.part(props.message.id)}>
        {(part) => (
          <PartView api={props.api} part={part} thinking={props.thinking} />
        )}
      </For>
      <Show when={error()}>
        {(failure) => <text fg={theme().error}>{describe(failure())}</text>}
      </Show>
    </box>
  );
}

function PartView(props: {
  api: TuiPluginApi;
  part: Part;
  thinking: boolean;
}): JSX.Element {
  const theme = () => props.api.theme.current;
  const part = props.part;
  if (part.type === "text") {
    if (part.text.startsWith(CONTEXT_PREFIX))
      return (
        <text fg={theme().textMuted}>
          <span style={{ fg: theme().success }}>┆</span> context · copied from
          main
        </text>
      );
    return <text fg={theme().text}>{part.text}</text>;
  }
  if (part.type === "reasoning") {
    if (!props.thinking) return null;
    return <text fg={theme().textMuted}>{part.text}</text>;
  }
  if (part.type === "tool") return <ToolView api={props.api} part={part} />;
  if (part.type === "file")
    return <text fg={theme().textMuted}>◇ {part.filename ?? part.url}</text>;
  if (part.type === "agent")
    return <text fg={theme().textMuted}>@ {part.name}</text>;
  if (part.type === "subtask")
    return <text fg={theme().textMuted}>⌥ {part.description}</text>;
  return null;
}

function ToolView(props: { api: TuiPluginApi; part: ToolPart }): JSX.Element {
  const theme = () => props.api.theme.current;
  const line = createMemo(() => toolLine(props.part));
  return (
    <text fg={line().error ? theme().error : theme().textMuted}>
      {line().text}
    </text>
  );
}

async function submitPrompt(
  host: HostPort,
  api: TuiPluginApi,
  main: string,
  mini: string,
  text: string,
  onError: () => void,
) {
  try {
    const inherited = host.lastUserModel(main);
    await host.prompt(mini, {
      parts: [{ type: "text", text }],
      model: inherited?.model,
      agent: MINI_AGENT,
    });
  } catch (error) {
    onError();
    api.ui.toast({
      message: `mini-session: ${describe(error)}`,
      variant: "error",
      duration: 4000,
    });
  }
}
