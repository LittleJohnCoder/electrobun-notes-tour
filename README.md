# electrobun-notes-tour

A 3-panel notes app built with [Electrobun](https://github.com/blackboardsh/electrobun)
**v1**, React, and TypeScript — written to be *read*, not just run. The real product is
the guided tour (this README, once complete) that walks through how the webview UI talks
to the bun main process via typed RPC.

> 🚧 **Status:** scoping done, implementation starting. The plan and every decision
> behind it live in [docs/SCOPE.md](docs/SCOPE.md); the work is tracked in the
> milestone issues ([M1]–[M5]).

## What it will teach

- An Electrobun app is **two processes**: a privileged bun main process (filesystem,
  windows) and a sandboxed webview (your React UI) — and nothing else.
- **Typed RPC is the only door between them**: the TypeScript schema is the contract
  both sides compile against.
- Requests (UI → bun), push messages (bun → UI), and when each is the right tool.
- Why the split exists at all: try `Bun.write` from the webview and watch it fail.

## Stack

- `electrobun@1.18.1` — pinned exactly; v1 API (see [docs/SCOPE.md](docs/SCOPE.md) §2
  for why the pin matters)
- React 18 + TypeScript, plain CSS
- macOS first (Linux/Windows untested)

## The tour (when complete)

0. What you're looking at — two processes, one bridge
1. Run it — `bun install && bun run dev`
2. Follow one click end-to-end through the RPC boundary
3. The schema is the contract — rename a method, watch TypeScript fail on both sides
4. Why a main process at all
5. Pull vs push — requests vs `notesChanged` messages
6. Your turn — three small exercises
7. Appendix — building, watching, and the Electrobun 1.x ↔ 2.x map

Built as a teaching fork of Electrobun's `templates/notes-app` (vanilla TS → React,
2 panels → 3, per-note files → single JSON store). MIT licensed.
