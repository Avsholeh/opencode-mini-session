/** @jsxImportSource @opentui/solid */
import { useTerminalDimensions } from "@opentui/solid"
import { For, Show, type JSX } from "solid-js"
import type { TextareaRenderable, KeyBinding } from "@opentui/core"
import type { TuiPlugin, TuiPluginApi, TuiPluginModule } from "@opencode-ai/plugin/tui"
import type { Message, Part } from "@opencode-ai/sdk/v2"

type MiniSize = "medium" | "large" | "xlarge"

type MiniConfig = {
  contextTurns: number
  thinking: boolean
  size: MiniSize
  openKey: string
}

type MiniTarget = { main: string; mini: string }

type Entry = { info: Message; parts: Array<Part> }

type MiniState = {
  active?: MiniTarget
  tracked: Map<string, string>
}

const DEFAULTS: MiniConfig = {
  contextTurns: 8,
  thinking: false,
  size: "large",
  openKey: "ctrl+shift+m",
}

const TITLE_MARKER = /\[main:([^\]]+)\]/
const CONTEXT_PREFIX = "<mini-context>"

const MINI_KEYBINDINGS: KeyBinding[] = [
  { name: "return", action: "submit" },
  { name: "kpenter", action: "submit" },
  { name: "return", shift: true, action: "newline" },
  { name: "kpenter", shift: true, action: "newline" },
]

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value)
}

function parseConfig(options: Record<string, unknown> | undefined): MiniConfig {
  const keybinds = options?.keybinds
  const open = isRecord(keybinds) ? keybinds["mini.open"] : undefined
  const size = options?.size
  return {
    contextTurns: typeof options?.contextTurns === "number" ? options.contextTurns : DEFAULTS.contextTurns,
    thinking: options?.thinking === true,
    size: size === "medium" || size === "xlarge" ? size : DEFAULTS.size,
    openKey: typeof open === "string" && open.trim() ? open : DEFAULTS.openKey,
  }
}

function describe(error: unknown): string {
  const raw = error as { message?: unknown; data?: { message?: unknown } }
  return String(raw?.data?.message ?? raw?.message ?? JSON.stringify(error))
}

function unwrap<T>(result: { data?: T; error?: unknown }, what: string): T {
  if (result.error !== undefined) throw new Error(`could not ${what}: ${describe(result.error)}`)
  if (result.data === undefined || result.data === null) throw new Error(`could not ${what}`)
  return result.data
}

function toast(api: TuiPluginApi, message: string, variant: "info" | "success" | "warning" | "error") {
  api.ui.toast({ message, variant, duration: 4000 })
}

function shortID(id: string): string {
  return id.length > 8 ? id.slice(0, 8) : id
}

function mainMarker(title: string | undefined): string | undefined {
  const match = title?.match(TITLE_MARKER)
  return match ? match[1] : undefined
}

function isMiniTitle(title: string | undefined): boolean {
  return Boolean(title && TITLE_MARKER.test(title))
}

function renderPartText(part: Part, thinking: boolean): string {
  switch (part.type) {
    case "text":
      return part.text
    case "reasoning":
      return thinking ? part.text : ""
    case "tool":
      return `[tool: ${part.tool}]`
    case "file":
      return `[file: ${part.filename ?? part.url}]`
    case "agent":
      return `[agent: ${part.name}]`
    case "subtask":
      return `[subtask: ${part.description}]`
    default:
      return ""
  }
}

function renderTranscript(entries: ReadonlyArray<Entry>, thinking: boolean): string {
  const blocks: string[] = []
  for (const entry of entries) {
    const role = entry.info.role === "user" ? "User" : "Assistant"
    const body = (entry.parts ?? [])
      .map((part) => renderPartText(part, thinking))
      .filter((value) => value && value.trim().length > 0)
      .join("\n")
      .trim()
    if (body) blocks.push(`${role}:\n${body}`)
  }
  return blocks.join("\n\n")
}

function routeMain(api: TuiPluginApi): string | undefined {
  const current = api.route.current
  if (current.name === "session" && "params" in current) {
    const id = current.params?.sessionID
    if (typeof id === "string") return id
  }
  return undefined
}

async function newestMain(api: TuiPluginApi): Promise<string | undefined> {
  const sessions = unwrap(await api.client.session.list(), "list sessions")
  const match = sessions.find((session) => !session.parentID && !isMiniTitle(session.title))
  return match?.id
}

async function transcriptOf(api: TuiPluginApi, mini: string, thinking: boolean): Promise<string> {
  const entries = unwrap(await api.client.session.messages({ sessionID: mini }), "read mini messages")
  return renderTranscript(entries, thinking)
}

async function injectContext(api: TuiPluginApi, cfg: MiniConfig, main: string, mini: string) {
  const entries = unwrap(await api.client.session.messages({ sessionID: main }), "read main messages")
  const slice = cfg.contextTurns > 0 ? entries.slice(-cfg.contextTurns) : entries
  const transcript = renderTranscript(slice, cfg.thinking)
  if (!transcript.trim()) return
  const text = `${CONTEXT_PREFIX}\nRecent transcript from the main session, copied so this side conversation has context. Treat it as background information and do not respond to it directly.\n\n${transcript}\n</mini-context>`
  unwrap(
    await api.client.session.prompt({ sessionID: mini, noReply: true, parts: [{ type: "text", text }] }),
    "inject copied context",
  )
}

function modelFromMain(
  api: TuiPluginApi,
  main: string,
): { model?: { providerID: string; modelID: string }; agent?: string } {
  const messages = api.state.session.messages(main)
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message.role === "user") {
      return {
        model: { providerID: message.model.providerID, modelID: message.model.modelID },
        agent: message.agent,
      }
    }
  }
  return {}
}

async function submitMiniPrompt(api: TuiPluginApi, main: string, mini: string, text: string) {
  try {
    unwrap(
      await api.client.session.prompt({
        sessionID: mini,
        ...modelFromMain(api, main),
        parts: [{ type: "text", text }],
      }),
      "send message to mini session",
    )
  } catch (error) {
    toast(api, `mini-session: ${describe(error)}`, "error")
  }
}

function openOverlay(api: TuiPluginApi, cfg: MiniConfig, target: MiniTarget) {
  api.ui.dialog.replace(
    () => <MiniChat api={api} cfg={cfg} main={target.main} mini={target.mini} />,
    () => {},
  )
  api.ui.dialog.setSize(cfg.size)
}

async function openMini(api: TuiPluginApi, cfg: MiniConfig, state: MiniState, copy: boolean) {
  try {
    const main = routeMain(api) ?? (await newestMain(api))
    if (!main) {
      toast(api, "No session to attach a mini session to.", "warning")
      return
    }

    if (state.active && api.state.session.get(state.active.mini)) {
      openOverlay(api, cfg, state.active)
      return
    }

    const created = unwrap(await api.client.session.create({ title: "mini — side chat" }), "create mini session")
    const target: MiniTarget = { main, mini: created.id }
    unwrap(
      await api.client.session.update({
        sessionID: target.mini,
        title: `mini — side chat [main:${target.main}]`,
      }),
      "title mini session",
    )
    state.active = target
    state.tracked.set(target.mini, target.main)

    if (copy) {
      try {
        await injectContext(api, cfg, target.main, target.mini)
      } catch (error) {
        toast(api, `Context copy failed: ${describe(error)}`, "warning")
      }
    }

    openOverlay(api, cfg, target)
  } catch (error) {
    toast(api, `mini-session: ${describe(error)}`, "error")
  }
}

async function findByMarker(api: TuiPluginApi): Promise<MiniTarget | undefined> {
  const main = routeMain(api) ?? (await newestMain(api))
  if (!main) return undefined
  const sessions = unwrap(await api.client.session.list(), "list sessions")
  const matches = sessions
    .filter((session) => mainMarker(session.title) === main)
    .sort((a, b) => (b.time?.created ?? 0) - (a.time?.created ?? 0))
  const mini = matches[0]?.id
  return mini ? { main, mini } : undefined
}

async function resolveTarget(api: TuiPluginApi, state: MiniState): Promise<MiniTarget | undefined> {
  if (state.active && api.state.session.get(state.active.mini)) return state.active
  return findByMarker(api)
}

async function removeMini(api: TuiPluginApi, state: MiniState, mini: string) {
  try {
    await api.client.session.delete({ sessionID: mini })
  } catch {}
  state.tracked.delete(mini)
  if (state.active?.mini === mini) state.active = undefined
  api.ui.dialog.clear()
}

async function sendMini(api: TuiPluginApi, cfg: MiniConfig, state: MiniState, close: boolean) {
  try {
    const target = await resolveTarget(api, state)
    if (!target) {
      toast(api, "No mini session found. Open one with /mini or ctrl+shift+m.", "warning")
      return
    }

    const transcript = await transcriptOf(api, target.mini, cfg.thinking)
    if (transcript.trim()) {
      const text = `Mini-session transcript:\n\n${transcript}\n\n(End of mini-session transcript.)`
      unwrap(
        await api.client.session.prompt({ sessionID: target.main, noReply: true, parts: [{ type: "text", text }] }),
        "send transcript to main session",
      )
    }

    if (close) {
      await removeMini(api, state, target.mini)
      toast(api, transcript.trim() ? "Transcript sent to main; mini session closed." : "Mini closed.", "success")
      return
    }

    toast(api, transcript.trim() ? "Transcript sent to main session." : "Mini session is empty.", "success")
  } catch (error) {
    toast(api, `mini-session: ${describe(error)}`, "error")
  }
}

async function closeMini(api: TuiPluginApi, state: MiniState) {
  try {
    const target = await resolveTarget(api, state)
    if (!target) {
      toast(api, "No mini session found.", "warning")
      return
    }
    await removeMini(api, state, target.mini)
    toast(api, "Mini session closed.", "success")
  } catch (error) {
    toast(api, `mini-session: ${describe(error)}`, "error")
  }
}

async function cleanMinis(api: TuiPluginApi, state: MiniState) {
  try {
    const sessions = unwrap(await api.client.session.list(), "list sessions")
    const ids = new Set<string>(state.tracked.keys())
    for (const session of sessions) if (isMiniTitle(session.title)) ids.add(session.id)

    let removed = 0
    for (const id of ids) {
      try {
        await api.client.session.delete({ sessionID: id })
        removed += 1
      } catch {}
      state.tracked.delete(id)
    }

    if (state.active && ids.has(state.active.mini)) {
      state.active = undefined
      api.ui.dialog.clear()
    }

    toast(api, removed > 0 ? `Purged ${removed} mini session${removed === 1 ? "" : "s"}.` : "No mini sessions to purge.", "success")
  } catch (error) {
    toast(api, `mini-session: ${describe(error)}`, "error")
  }
}

function PartView(props: { api: TuiPluginApi; part: Part; thinking: boolean }): JSX.Element {
  const theme = () => props.api.theme.current
  const part = props.part
  if (part.type === "text") {
    if (part.text.startsWith(CONTEXT_PREFIX)) return <text fg={theme().textMuted}>· context copied from main session</text>
    return <text fg={theme().text}>{part.text}</text>
  }
  if (part.type === "reasoning") {
    if (!props.thinking) return null
    return <text fg={theme().textMuted}>{part.text}</text>
  }
  if (part.type === "tool") return <text fg={theme().textMuted}>[tool: {part.tool}]</text>
  if (part.type === "file") return <text fg={theme().textMuted}>[file: {part.filename ?? part.url}]</text>
  if (part.type === "agent") return <text fg={theme().textMuted}>[agent: {part.name}]</text>
  if (part.type === "subtask") return <text fg={theme().textMuted}>[subtask: {part.description}]</text>
  return null
}

function MiniChat(props: { api: TuiPluginApi; cfg: MiniConfig; main: string; mini: string }): JSX.Element {
  const dim = useTerminalDimensions()
  const theme = () => props.api.theme.current
  const messages = () => props.api.state.session.messages(props.mini)
  const height = () => Math.max(6, Math.min(26, Math.floor(dim().height * 0.45)))

  let input: TextareaRenderable | undefined

  const focus = (ref: TextareaRenderable | undefined) => {
    input = ref
    if (!ref) return
    setTimeout(() => ref.focus(), 1)
  }

  const send = () => {
    const node = input
    if (!node) return
    const text = node.plainText.trim()
    if (!text) return
    node.clear()
    void submitMiniPrompt(props.api, props.main, props.mini, text)
  }

  return (
    <box flexDirection="column" paddingLeft={2} paddingRight={2} paddingBottom={1} gap={1}>
      <box flexDirection="row" justifyContent="space-between">
        <text fg={theme().text}>
          <b>Mini session</b>
          <span style={{ fg: theme().textMuted }}> · main {shortID(props.main)}</span>
        </text>
        <text fg={theme().textMuted} onMouseUp={() => props.api.ui.dialog.clear()}>
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
              Ask a side question. Your main session keeps running in the background.
            </text>
          }
        >
          <For each={messages()}>
            {(message) => (
              <box flexDirection="column" marginBottom={1}>
                <text fg={message.role === "user" ? theme().primary : theme().accent}>
                  {message.role === "user" ? "You" : "Mini"}
                </text>
                <For each={props.api.state.part(message.id)}>
                  {(part) => <PartView api={props.api} part={part} thinking={props.cfg.thinking} />}
                </For>
              </box>
            )}
          </For>
        </Show>
      </scrollbox>

      <textarea
        ref={focus}
        height={3}
        keyBindings={MINI_KEYBINDINGS}
        placeholder="Ask a side question…"
        textColor={theme().text}
        focusedTextColor={theme().text}
        placeholderColor={theme().textMuted}
        backgroundColor={theme().backgroundElement}
        focusedBackgroundColor={theme().backgroundElement}
        onSubmit={send}
      />

      <text fg={theme().textMuted}>enter send · esc close · /mini-send · /mini-done · /mini-close</text>
    </box>
  )
}

const tui: TuiPlugin = async (api, options) => {
  const cfg = parseConfig(options)
  const state: MiniState = { tracked: new Map() }

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
          void openMini(api, cfg, state, true)
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
          void openMini(api, cfg, state, false)
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
          void sendMini(api, cfg, state, false)
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
          void closeMini(api, state)
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
          void sendMini(api, cfg, state, true)
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
          void cleanMinis(api, state)
        },
      },
    ],
    bindings: [{ key: cfg.openKey, cmd: "mini.open", desc: "Mini: open overlay", group: "Mini" }],
  })
}

const plugin: TuiPluginModule & { id: string } = {
  id: "avsholeh.mini-session",
  tui,
}

export default plugin
