# electrobun-notes-tour

A 3-panel notes app built with [Electrobun](https://github.com/blackboardsh/electrobun)
**v1** (`1.18.1`, pinned), React 18, and TypeScript — written to be *read*, not just run.
This README is the product: a guided tour through how a sandboxed webview talks to a
privileged bun process over typed RPC.

Everything below was verified against the running app. Every claim has a file+line ref
or an observable you can check yourself.

---

## §0 What you're looking at

An Electrobun app is **two processes** and nothing else:

```
┌──────────────────────────── Electrobun app ────────────────────────────┐
│                                                                        │
│  MAIN PROCESS (bun) — privileged            WEBVIEW (system WebKit)    │
│  src/bun/index.ts                           src/mainview/*             │
│  • opens the window             ┌─────────► • renders the React UI      │
│  • owns the filesystem          │           • no fs, no Node APIs       │
│  • one notes.json store         │           • plain useState/useEffect  │
│  • handles 5 requests ◄─────────┤                                       │
│    getNotes getNote saveNote    │   typed RPC — the only door           │
│    createNote deleteNote        └──────────► requests: UI → bun (pull)   │
│  • pushes 1 message                         messages: bun → UI (push)   │
│    notesChanged                                                        │
└────────────────────────────────────────────────────────────────────────┘
```

The 30-second version:

- The **webview is a browser sandbox**. It can render a UI, but it cannot touch the
  filesystem, run Bun, or open windows.
- The **bun main process owns everything privileged**: the window, the filesystem,
  the data.
- **Typed RPC is the only door between them**, and the TypeScript schema is the
  doorframe: both sides compile against it, so a typo'd method name is a compile
  error, not a runtime surprise (§3 proves it).

Where everything lives:

```
src/bun/index.ts        the entire main process: store + 5 handlers + window (~110 lines)
src/mainview/main.tsx   boots the webview React root            (main.tsx:5, [TOUR §0])
src/mainview/App.tsx    the 3 panels in one screen
src/mainview/rpc.ts     the typed RPC client + debounced save + the log
src/mainview/RpcLog.tsx the overlay that shows the traffic live (§2)
```

---

## §1 Run it

```bash
bun install
bun run dev
```

You should see a 900×650 window titled **Notes** with three panels: a **Folders**
sidebar (starting with just "All notes (0)"), a **note list** with a **+ New** button,
and an **editor** saying "Select a note on the left, or create one."

Click **+ New**: an "Untitled" note appears in the list and opens in the editor.
Type a title, type some content, click **Delete** when you're done poking — every
one of those clicks crosses the bridge, and §2 watches them do it.

**Where your notes live:** the whole store is one human-readable JSON file, and the
main process prints its path at startup — look for this line in your terminal:

```
[notes-tour] store: /Users/you/Library/Application Support/notes-tour.electrobun.dev/dev/notes.json
```

The exact path per OS (`Utils.paths.userData` + `notes.json`,
`src/bun/index.ts:7`):

- **macOS:** `~/Library/Application Support/notes-tour.electrobun.dev/dev/notes.json`
- **Linux:** `~/.local/share/notes-tour.electrobun.dev/dev/notes.json`
- **Windows:** `%LOCALAPPDATA%\notes-tour.electrobun.dev\dev\notes.json`

Open it while the app runs: it's pretty-printed JSON, and it updates within ~500 ms
of you stopping typing (§5 explains the delay).

> Tested on macOS (primary) and Linux. Linux needs `libwebkit2gtk-4.1-0` for the
> system webview. Windows untested.

---

## §2 Follow one click end-to-end

Press **Cmd+L** (Ctrl+L on Linux/Windows) to open the **RPC log overlay** — a small
dark panel, bottom-right, showing every crossing of the bridge live. Then click a
note in the list. Watch this appear:

```
→ getNote({"id":"mvr3danf0xhgw"}) 3ms ← Note
```

One line, five parts: the request name, its params, the real round-trip time, and a
summary of the reply. Here is the exact path that line took, click to re-render:

1. **The click.** Each note in the list is a button whose `onClick` calls
   `selectNote(n.id)` — `src/mainview/App.tsx:110`.
2. **The handler.** `selectNote` (`App.tsx:46`) flushes any pending save, then makes
   **exactly one** typed request: `api.getNote(id)` — `App.tsx:50`.
3. **The client.** `api.getNote` (`rpc.ts:99`) wraps the real call in `logged()`
   (`rpc.ts:55`) so the overlay's line (`rpc.ts:63`) is the *actual* traffic, never
   a hand-written pretend log, then calls
   `electrobun.rpc!.request.getNote({ id })` (`rpc.ts:100`).
4. **The bridge.** Electrobun ships the request over the typed channel declared in
   `NotesRPC` (`rpc.ts:14`, mirrored from the bun side — see §3).
5. **The handler on the privileged side.** `getNote` lands on
   `src/bun/index.ts:60` — one line: `loadStore().find((n) => n.id === id) ?? null`.
   It reads the JSON file you found in §1, right now, from disk.
6. **The reply re-renders.** Back in the webview, the awaited `Note` fills the
   editor via `setDraft(...)` — `App.tsx:51` — and React renders title + content.

Try the other panels while the overlay is open and notice what *doesn't* happen:
clicking a folder in the sidebar produces **zero** RPC lines. Folders and counts are
derived client-side from data the app already has (`App.tsx:35-44`) — not every
interaction deserves a roundtrip. A note click does exactly one; typing queues at
most one (`saveNote`, debounced ~500 ms, `rpc.ts:109`).

---

## §3 The schema is the contract

The `NotesRPC` type exists twice, once per side: `src/bun/index.ts:14` and
`src/mainview/rpc.ts:14` — deliberately hand-mirrored so you can see both halves of
the contract in the files you're reading. Each side's compiler enforces its own
copy against its own code: the bun side checks its handler map (`index.ts:55`),
the view side checks its calls (`rpc.ts:96`).

The killer demo (do it, it takes 30 seconds):

1. In **both** schema copies, rename the `getNote` line to `fetchNote`
   (`index.ts:18` and `rpc.ts:18`).
2. Run `bun run typecheck`.

TypeScript fails **on both sides of the bridge at once**:

```
src/bun/index.ts(60,4): error TS2353: ... 'getNote' does not exist in type
  'RPCRequestHandler<{ getNotes: ...; fetchNote: ...; }>'
src/mainview/rpc.ts(100,59): error TS2551: Property 'getNote' does not exist ...
  Did you mean 'getNotes'?
```

The handler on one side and the caller on the other both refuse to compile until
the rename is honest everywhere. That is the whole sales pitch for typed RPC: the
contract is checked at build time, on both ends, by the compiler you already run.

(Revert the rename. And §7b maps how a bigger app makes this drill impossible:
declaring the schema *once* and importing it into both halves.)

---

## §4 Why a main process at all

Second demo, also 30 seconds. Add this as the first line of `src/mainview/rpc.ts`
and run the app:

```ts
Bun.write("/tmp/cheat.txt", "hello from the webview");
```

Nothing crashes loudly. The window comes up **blank** — the module throws
`ReferenceError: Bun is not defined` the moment it loads, React never mounts, and
you get an empty webview. Note what did *not* save you: `bun run typecheck` passes
cleanly with that line in place, because `@types/bun` sits in `devDependencies` and
leaks the `Bun` global into every file. **The sandbox boundary is enforced at
runtime, by the process split — not by types.**

Remove the line. The fix for "I need the filesystem" is the door from §2: make a
typed request, let the privileged side do the work. That asymmetry — webview
requests, bun does — is the architecture of every Electrobun app, and of Electron
too (`ipcMain`/`ipcRenderer` is the same idea with worse types).

---

## §5 Pull vs push

The bridge carries two kinds of traffic, and the overlay labels them:

- **Requests (pull, UI → bun):** `→` lines. The webview asks, bun answers, the
  webview awaits. Five exist; see the schema.
- **Messages (push, bun → UI):** `⇐` lines. Bun speaks unprompted; nobody awaits.

Why push? Delete a note and watch the overlay:

```
⇐ notesChanged({"reason":"delete"})
→ getNotes({}) 2ms ← 0 notes
```

The `⇐` line is the bun handler announcing the mutation (`index.ts:91`) — the bun
process is the source of truth, so it doesn't wait to be asked. The `→` line right
under it is the webview *answering the push with one pull*: `onNotesChanged(refresh)`
(`App.tsx:30`) re-fetches the whole list rather than the UI trying to predict what
the mutation did. The UI never invents state; it re-reads it.

The save flow puts both together: you type, nothing hits the wire for ~500 ms
(`scheduleSave`, `rpc.ts:116`), then one `saveNote` request fires, bun persists and
pushes `notesChanged({reason:"save"})` (`index.ts:83`), and the list re-sorts
(newest first) from the fresh pull.

---

## §6 Your turn

Three exercises, in rising order of difficulty. Each touches both sides of the
bridge — that's the point.

1. **Sort toggle.** The list is hardcoded newest-first (`App.tsx:39`). Add a button
   in the note-list header that toggles oldest-first. (Pure client-side — no RPC.
   If you added a request for this, re-read §2's sidebar lesson.)
2. **`renameFolder` request.** Add a sixth request to the schema (both copies,
   §3!), a handler in `index.ts` that rewrites every matching note's `folder`, a
   `+ rename` button in the sidebar, and the push after it. Watch the overlay show
   your new `→` and `⇐` lines.
3. **Delete undo.** Keep the last deleted note in memory on the bun side, add a
   `reason: "undo"` push, and an "Undo" affordance in the webview that appears only
   after a delete. Decide for yourself: should undo be a request or part of the
   push flow?

---

## §7 Appendix

**Building.** `bun run build:canary` produces a real installer bundle
(`build/canary-<platform>/…tar.gz`, ~31 MB on Linux). `bun run start` runs the dev
loop; `bun run dev` adds `--watch`, which rebuilds and relaunches the app when you
save a source file — the window reopens with your change.

**The v1 docs.** Electrobun's public docs site shows only 2.x. The v1 API this repo
uses is documented in the source repo at the pinned tag:
[`blackboardsh/electrobun@v1.18.1` → `docs/src/content/docs/electrobun`](https://github.com/blackboardsh/electrobun/tree/v1.18.1/docs/src/content/docs/electrobun).
When Stack Overflow and the docs site disagree with this codebase, the tag wins.

**"Electrobun 2.x exists and looks different — here's the map."** `npm latest` is
**2.0.2**, a different framework: Hutch CLI, Cottontail runtime, different config
shape. If `bun add electrobun` gives you 2.x, nothing in this repo applies. How to
tell which one you're holding: this repo imports `electrobun/bun` and
`electrobun/view`, pins `"electrobun": "1.18.1"` exactly, and configures through
`electrobun.config.ts` with a `build.bun`/`build.views` shape — that's v1 DNA.

---

## §7b From this repo to ElectroBunNotes: the map

This tour simplifies on purpose — a ~500-line repo where every line is load-bearing.
But simplified is not **wrong**. If you're heading to
[TestDevOrg2026/ElectroBunNotes](https://github.com/TestDevOrg2026/ElectroBunNotes)
(the real notes app this repo prepares you for), here are the five deliberate gaps
and where the real repo does it differently:

1. **Store model.** Here: one `notes.json`, read/written whole. There: **per-note
   `.md` files** in a user-visible notebook directory — the file tree *is* the
   database (mtime is the sort key, previews come from file heads, content loads
   only on open; see `src/bun/notes/`). Both are legitimate; file-per-note scales
   to thousands of notes and keeps the user's data in their own formats. Don't
   leave here thinking "one JSON file is the right way" — it's the *readable* way.
2. **Schema, declared once.** Here the schema is hand-mirrored (§3) so the
   contract is visible in both files you're reading. There it is declared **once**
   in `src/shared/types.ts` and imported by both halves — a type-only import, so
   it erases at compile time and pulls no bun code into the view bundle. Mirror
   when teaching; share when shipping.
3. **The stack.** Here: plain CSS, no state library, no tests — so you can hold
   the whole thing in your head. There: Tailwind 3.4, Zustand stores, a Vite-built
   renderer with HMR, CodeMirror hybrid Markdown editing, KaTeX, and a `bun test`
   suite (60+ test files). Same two-process architecture underneath; the extras
   are product weight, not new architecture.
4. **Push semantics.** Here `notesChanged` is a bare event. There the push layer
   has a startup handshake plus a `viewContext` push that **replays to late
   subscribers** (a component mounting after the push must not silently miss it),
   and the handshake send is idempotent because React StrictMode mounts twice —
   see `src/mainview/utils/rpcChannels.ts`. The concepts from §5, hardened.
5. **The working agreement.** There, SPEC.md is the behavioral contract, PROCESS.md
   is how the team works, module docstrings cite SPEC sections, and CI gates each
   phase. Read SPEC.md before proposing anything; the code answers to it.

Everything §0–§5 taught is still true over there — the names are bigger, the door
is the same door.

---

*Scoping and decisions: [docs/SCOPE.md](docs/SCOPE.md) · Work tracked in the
milestone issues [M1]–[M5]. Built as a teaching fork of Electrobun's
`templates/notes-app` (vanilla TS → React, 2 panels → 3, per-note files → single
JSON store — see §7b for why "single JSON store" is a teaching simplification).
MIT licensed.*
