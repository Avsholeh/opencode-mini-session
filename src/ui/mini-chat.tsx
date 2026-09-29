/** @jsxImportSource @opentui/solid */
import type { TuiPluginApi } from "@opencode-ai/plugin/tui";
import type { Part } from "@opencode-ai/sdk/v2";
import { useTerminalDimensions } from "@opentui/solid";
import { For, Show, type JSX } from "solid-js";
import type { MiniConfig } from "../config";
import { CONTEXT_PREFIX, shortID } from "../markers";

export function MiniChat(props: {
  api: TuiPluginApi;
  cfg: MiniConfig;
  main: string;
  mini: string;
  onHide: () => void;
}): JSX.Element {
  const dim = useTerminalDimensions();
  const theme = () => props.api.theme.current;
  const messages = () => props.api.state.session.messages(props.mini);
  const height = () =>
    Math.max(6, Math.min(26, Math.floor(dim().height * 0.45)));
  const Prompt = props.api.ui.Prompt;

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
          <b>Mini</b>
          <span style={{ fg: theme().textMuted }}>
            {" "}
            · {shortID(props.main)}
          </span>
        </text>
        <text fg={theme().textMuted} onMouseUp={() => props.onHide()}>
          esc hide · /mini-close
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

      <Prompt
        sessionID={props.mini}
        ref={(ref) => {
          if (ref) setTimeout(() => ref.focus(), 1);
        }}
        placeholders={{ normal: ["Ask a side question…"] }}
      />
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
