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

- **`<leader>i`** or **`/mini`** — open a mini session and copy the last few
  turns of context from the current main session.
- **`<leader>o`** or **`/mini-fresh`** — open a mini session without copying
  context.
- **`/mini-send`** — copy the mini transcript into the main session and keep the
  mini session open. Only human-readable text is sent; tool, file, agent, and
  subtask activity is omitted to keep main-session context lean.
- **`/mini-done`** — copy the transcript into the main session, then close the
  mini session. Same text-only delivery as `/mini-send`.
- **`/mini-close`** — close the mini session without sending anything.
- **`/mini-clean`** or **`<leader>d`** — delete every mini session created for
  this project.

In the overlay, press `enter` to send and `esc` to close.

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
        "keybinds": {
          "mini.open": "<leader>i",
          "mini.fresh": "<leader>o",
          "mini.clean": "<leader>d"
        }
      }
    ]
  ]
}
```

| Option         | Type                                                  | Default        | Description                                                                        |
| -------------- | ----------------------------------------------------- | -------------- | ---------------------------------------------------------------------------------- |
| `contextTurns` | `number`                                              | `8`            | How many recent main-session turns to copy. `0` copies everything.                 |
| `thinking`     | `boolean`                                             | `false`        | Show reasoning/thinking parts.                                                     |
| `size`         | `"medium" \| "large" \| "xlarge"`                     | `"large"`      | Overlay size.                                                                      |
| `keybinds`     | `{ "mini.open"?: string; "mini.fresh"?: string; "mini.clean"?: string }` | see below | Keybinds used to open the overlay with (`<leader>i`) or without (`<leader>o`) context, and to clean all mini sessions (`<leader>d`). |

`<leader>` resolves to the leader key configured in `tui.json` (default
`ctrl+x`).

## Troubleshooting

If the plugin stops working after an opencode update, refresh the cached package:

```sh
rm -rf ~/.cache/opencode/node_modules/@avsholeh/opencode-mini-session
```

Then restart opencode.

## License

[MIT](./LICENSE)
