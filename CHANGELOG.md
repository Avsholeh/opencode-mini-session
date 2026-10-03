# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `model` option and `/mini-model` picker to choose the model used for
  mini-session questions (defaults to inheriting the main session model).
- `tokenLimit` option (default `50000`) that caps copied main-session context by
  estimated tokens, dropping the oldest turns first. This replaces
  `contextTurns`.
- Tool calls in copied context now include up to four summarized input params
  (for example `[tool: read filePath=src/foo.ts]`).

### Changed

- `/mini-send` and `/mini-done` now deliver only turns added since the previous
  send instead of re-sending the whole transcript.
- Mini sessions are always strict read-only: created as the `plan` agent with
  `edit:* → deny` and `bash:* → deny`, prompts force `agent: plan` while
  inheriting only the model from main, and reopening re-enforces the deny
  rules. Missing `plan` agent fails hard with no writable fallback.

## [0.1.1] - 2026-09-29

### Changed

- Default shortcuts are now `<leader>i` to open a mini session with context and
  `<leader>o` to open one without context, replacing `ctrl+shift+m`. Both are
  configurable through `keybinds["mini.open"]` and `keybinds["mini.fresh"]`.
- Added `<leader>d` to clean all mini sessions, configurable through
  `keybinds["mini.clean"]`.

## [0.1.0] - 2026-09-28

### Added

- Floating mini-session side-chat overlay for the opencode TUI.
- Context copy from the main session into the mini session.
- `mini`, `mini-fresh`, `mini-send`, `mini-close`, `mini-done`, and `mini-clean`
  commands with the `ctrl+shift+m` keybind.
- Configurable `contextTurns`, `thinking`, `size`, and `keybinds["mini.open"]`.
