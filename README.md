# @avsholeh/opencode-mini-session

A floating **mini session** overlay for the [opencode](https://opencode.ai) TUI.
Ask a side question in a temporary chat while your main session keeps running in
the background, then send the transcript back when you're done.

## Install

```sh
opencode plugin @avsholeh/opencode-mini-session
```

Add `-g` / `--global` to install for all projects. You can also install it from
the TUI command palette: open **Plugins** and press `shift+i`.

Or add it to `tui.json` manually:

```json
{
  "$schema": "https://opencode.ai/tui.json",
  "plugin": ["@avsholeh/opencode-mini-session"]
}
```

- Global config: `~/.config/opencode/tui.json`
- Project config: `.opencode/tui.json`

TUI plugins are configured in `tui.json`, **not** `opencode.json`. Restart
opencode after changing the config.

Pin a version with `@avsholeh/opencode-mini-session@0.1.0` if you need
reproducibility.

## Usage

- **`ctrl+shift+m`** or **`/mini`** — open a mini session and copy the last few
  turns of context from the current main session.
- **`/mini-fresh`** — open a mini session without copying context.
- **`/mini-send`** — copy the mini transcript into the main session and keep the
  mini session open.
- **`/mini-done`** — copy the transcript into the main session, then close the
  mini session.
- **`/mini-close`** — close the mini session without sending anything.
- **`/mini-clean`** — delete every mini session created for this project.

The overlay uses the standard opencode prompt, so it supports **`/` slash
commands**, **`@` file mentions**, shell mode, history, and paste. The agent and
model are shared with the main session.

- `enter` — send the prompt to the mini session.
- `tab` / `shift+tab` — cycle the plan/build agent (affects the main session
  too).
- `esc` — hide the overlay. The mini session is kept; run `/mini` to reopen it.
- `/mini-close` — delete the mini session and close the overlay. Nothing is sent
  to the main session.

## Options

Options are passed as the second element of the `plugin` tuple:

```json
{
  "$schema": "https://opencode.ai/tui.json",
  "plugin": [
    [
      "@avsholeh/opencode-mini-session",
      {
        "contextTurns": 8,
        "thinking": false,
        "size": "large",
        "keybinds": { "mini.open": "ctrl+shift+m" }
      }
    ]
  ]
}
```

| Option         | Type                              | Default        | Description                                                        |
| -------------- | --------------------------------- | -------------- | ------------------------------------------------------------------ |
| `contextTurns` | `number`                          | `8`            | How many recent main-session turns to copy. `0` copies everything. |
| `thinking`     | `boolean`                         | `false`        | Show reasoning/thinking parts.                                     |
| `size`         | `"medium" \| "large" \| "xlarge"` | `"large"`      | Overlay size.                                                      |
| `keybinds`     | `{ "mini.open": string }`         | `ctrl+shift+m` | Keybind used to open the overlay.                                  |

## Troubleshooting

If the plugin stops working after an opencode update, refresh the cached package:

```sh
rm -rf ~/.cache/opencode/node_modules/@avsholeh/opencode-mini-session
```

Then restart opencode.

## License

[MIT](./LICENSE)
