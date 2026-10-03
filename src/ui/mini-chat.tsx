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
import {
  SyntaxStyle,
  type TextareaRenderable,
  type KeyBinding,
  type ThemeTokenStyle,
} from "@opentui/core";
import type { TuiPluginApi, TuiThemeCurrent } from "@opencode-ai/plugin/tui";
import type {
  AssistantMessage,
  Message,
  Part,
  ToolPart,
} from "@opencode-ai/sdk/v2";
import type { MiniConfig } from "../config";
import type { HostPort } from "../host";
import { CONTEXT_PREFIX, shortID } from "../markers";
import { resolvePromptModel, type ModelRef } from "../model";
import { MINI_AGENT } from "../mini-policy";
import { describe } from "../result";
import { toolLine } from "../tool";

const MINI_KEYBINDINGS: KeyBinding[] = [
  { name: "return", action: "submit" },
  { name: "kpenter", action: "submit" },
  { name: "return", shift: true, action: "newline" },
  { name: "kpenter", shift: true, action: "newline" },
];

const SYNTAX_CACHE = new WeakMap<TuiThemeCurrent, SyntaxStyle>();

function themeSyntax(theme: TuiThemeCurrent): ThemeTokenStyle[] {
  return [
    {
      scope: ["markup.heading"],
      style: { foreground: theme.markdownHeading, bold: true },
    },
    ...[1, 2, 3, 4, 5, 6].map((depth) => ({
      scope: [`markup.heading.${depth}`],
      style: {
        foreground: theme.markdownHeading,
        bold: true,
        ...(depth === 1 ? { underline: true } : {}),
      },
    })),
    {
      scope: ["markup.bold", "markup.strong"],
      style: { foreground: theme.markdownStrong, bold: true },
    },
    {
      scope: ["markup.italic"],
      style: { foreground: theme.markdownEmph, italic: true },
    },
    { scope: ["markup.list"], style: { foreground: theme.markdownListItem } },
    {
      scope: ["markup.quote"],
      style: { foreground: theme.markdownBlockQuote, italic: true },
    },
    {
      scope: ["markup.raw", "markup.raw.block"],
      style: { foreground: theme.markdownCode },
    },
    {
      scope: ["markup.raw.inline"],
      style: { foreground: theme.markdownCode, background: theme.background },
    },
    {
      scope: ["markup.link"],
      style: { foreground: theme.markdownLink, underline: true },
    },
    {
      scope: ["markup.link.label"],
      style: { foreground: theme.markdownLinkText, underline: true },
    },
    {
      scope: ["markup.link.url"],
      style: { foreground: theme.markdownLink, underline: true },
    },
    { scope: ["label"], style: { foreground: theme.markdownLinkText } },
    { scope: ["spell", "nospell"], style: { foreground: theme.text } },
    { scope: ["default"], style: { foreground: theme.markdownText } },
    { scope: ["conceal"], style: { foreground: theme.textMuted } },
    { scope: ["markup.strikethrough"], style: { foreground: theme.textMuted } },
    {
      scope: ["markup.underline"],
      style: { foreground: theme.text, underline: true },
    },
    { scope: ["markup.list.checked"], style: { foreground: theme.success } },
    {
      scope: ["markup.list.unchecked"],
      style: { foreground: theme.textMuted },
    },
    {
      scope: ["string.special", "string.special.url"],
      style: { foreground: theme.markdownLink, underline: true },
    },
    {
      scope: ["comment"],
      style: { foreground: theme.syntaxComment, italic: true },
    },
    { scope: ["keyword"], style: { foreground: theme.syntaxKeyword } },
    {
      scope: [
        "keyword.return",
        "keyword.conditional",
        "keyword.repeat",
        "keyword.coroutine",
      ],
      style: { foreground: theme.syntaxKeyword, italic: true },
    },
    {
      scope: ["keyword.type", "type", "type.builtin", "type.definition"],
      style: { foreground: theme.syntaxType },
    },
    {
      scope: ["keyword.function", "function", "function.method"],
      style: { foreground: theme.syntaxFunction },
    },
    {
      scope: [
        "variable",
        "variable.parameter",
        "variable.member",
        "property",
        "field",
      ],
      style: { foreground: theme.syntaxVariable },
    },
    {
      scope: ["string", "character"],
      style: { foreground: theme.syntaxString },
    },
    {
      scope: ["number", "float", "constant"],
      style: { foreground: theme.syntaxNumber },
    },
    { scope: ["operator"], style: { foreground: theme.syntaxOperator } },
    {
      scope: ["punctuation", "punctuation.delimiter", "punctuation.bracket"],
      style: { foreground: theme.syntaxPunctuation },
    },
    {
      scope: ["diff.plus"],
      style: { foreground: theme.diffAdded, background: theme.diffAddedBg },
    },
    {
      scope: ["diff.minus"],
      style: { foreground: theme.diffRemoved, background: theme.diffRemovedBg },
    },
    {
      scope: ["diff.delta"],
      style: { foreground: theme.diffContext, background: theme.diffContextBg },
    },
    { scope: ["error"], style: { foreground: theme.error, bold: true } },
    { scope: ["warning"], style: { foreground: theme.warning, bold: true } },
    { scope: ["info"], style: { foreground: theme.info } },
    { scope: ["debug"], style: { foreground: theme.textMuted } },
  ];
}

function buildSyntaxStyle(theme: TuiThemeCurrent): SyntaxStyle {
  const cached = SYNTAX_CACHE.get(theme);
  if (cached) return cached;
  const style = SyntaxStyle.fromTheme(themeSyntax(theme));
  SYNTAX_CACHE.set(theme, style);
  return style;
}

export function MiniChat(props: {
  api: TuiPluginApi;
  host: HostPort;
  cfg: MiniConfig;
  main: string;
  mini: string;
  modelOverride?: () => ModelRef | undefined;
  onSendToMain: () => void;
  onSendAndClose: () => void;
}): JSX.Element {
  const dim = useTerminalDimensions();
  const theme = () => props.api.theme.current;
  const syntaxStyle = createMemo(() => buildSyntaxStyle(theme()));
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
                syntaxStyle={syntaxStyle()}
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
  syntaxStyle: SyntaxStyle;
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
          <PartView
            api={props.api}
            part={part}
            thinking={props.thinking}
            syntaxStyle={props.syntaxStyle}
          />
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
  syntaxStyle: SyntaxStyle;
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
    return (
      <box width="100%">
        <markdown
          content={part.text}
          syntaxStyle={props.syntaxStyle}
          fg={theme().text}
          width="100%"
        />
      </box>
    );
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
    api.ui.toast({
      message: `mini-session: ${describe(error)}`,
      variant: "error",
      duration: 4000,
    });
  }
}
