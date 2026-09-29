/** @jsxImportSource @opentui/solid */
import { useTerminalDimensions } from "@opentui/solid";
import { For, Show, type JSX } from "solid-js";
import type { TextareaRenderable, KeyBinding } from "@opentui/core";
import type { TuiPluginApi } from "@opencode-ai/plugin/tui";
import type { Part } from "@opencode-ai/sdk/v2";
import type { MiniConfig } from "../config";
import type { HostPort } from "../host";
import { CONTEXT_PREFIX, shortID } from "../markers";
import { describe } from "../result";

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
}): JSX.Element {
  const dim = useTerminalDimensions();
  const theme = () => props.api.theme.current;
  const messages = () => props.api.state.session.messages(props.mini);
  const height = () =>
    Math.max(6, Math.min(26, Math.floor(dim().height * 0.45)));

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
    void submitPrompt(props.host, props.api, props.main, props.mini, text);
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
        <text fg={theme().text}>
          <b>Mini session</b>
          <span style={{ fg: theme().textMuted }}>
            {" "}
            · main {shortID(props.main)}
          </span>
        </text>
        <text
          fg={theme().textMuted}
          onMouseUp={() => props.api.ui.dialog.clear()}
        >
          esc close
        </text>
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
          when={messages().length > 0}
          fallback={
            <text fg={theme().textMuted}>
              Ask a side question. Your main session keeps running in the
              background.
            </text>
          }
        >
          <For each={messages()}>
            {(message) => (
              <box flexDirection="column" marginBottom={1}>
                <text
                  fg={
                    message.role === "user" ? theme().primary : theme().accent
                  }
                >
                  {message.role === "user" ? "You" : "Mini"}
                </text>
                <For each={props.api.state.part(message.id)}>
                  {(part) => (
                    <PartView
                      api={props.api}
                      part={part}
                      thinking={props.cfg.thinking}
                    />
                  )}
                </For>
              </box>
            )}
          </For>
        </Show>
      </scrollbox>

    <box padding={1} backgroundColor={theme().backgroundElement}>
      <textarea
        ref={focus}
        height={3}
        padding={1}
        keyBindings={MINI_KEYBINDINGS}
        placeholder="Ask a side question…"
        textColor={theme().text}
        focusedTextColor={theme().text}
        placeholderColor={theme().textMuted}
        backgroundColor={theme().backgroundElement}
        focusedBackgroundColor={theme().backgroundElement}
        onSubmit={send}
      />
    </box>

      <text fg={theme().textMuted}>
        enter send · esc close · /mini-send · /mini-done · /mini-close
      </text>
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
        <text fg={theme().textMuted}>· context copied from main session</text>
      );
    return <text fg={theme().text}>{part.text}</text>;
  }
  if (part.type === "reasoning") {
    if (!props.thinking) return null;
    return <text fg={theme().textMuted}>{part.text}</text>;
  }
  if (part.type === "tool")
    return <text fg={theme().textMuted}>[tool: {part.tool}]</text>;
  if (part.type === "file")
    return (
      <text fg={theme().textMuted}>[file: {part.filename ?? part.url}]</text>
    );
  if (part.type === "agent")
    return <text fg={theme().textMuted}>[agent: {part.name}]</text>;
  if (part.type === "subtask")
    return <text fg={theme().textMuted}>[subtask: {part.description}]</text>;
  return null;
}

async function submitPrompt(
  host: HostPort,
  api: TuiPluginApi,
  main: string,
  mini: string,
  text: string,
) {
  try {
    const inherited = host.lastUserModel(main);
    await host.prompt(mini, { parts: [{ type: "text", text }], ...inherited });
  } catch (error) {
    api.ui.toast({
      message: `mini-session: ${describe(error)}`,
      variant: "error",
      duration: 4000,
    });
  }
}
