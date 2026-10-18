# Scope: `electrobun-notes-tour`

A 3-panel notes app on Electrobun **v1** (React + TypeScript) whose real product is the
**guided tour** that walks a junior engineer through how the webview UI talks to the
bun "server" process via typed RPC.

Status: scoped 2026-10-18. **Decisions confirmed: build the small fork; macOS-first;
public repo under the maintainer's GitHub profile.** Research grounded in
`blackboardsh/electrobun` tag `v1.18.1` (last stable v1 release).

---

## 1. Build-vs-doc decision (evidence)

| Template at v1.18.1 | React | Typed RPC | Verdict as tour vehicle |
|---|---|---|---|
| `templates/react-tailwind-vite` | yes | **none** — bun side is 37 lines that just open a window; view is a counter demoing Vite HMR | teaches HMR, not RPC — ✗ |
| `templates/notes-app` | no (vanilla TS + innerHTML) | yes, complete (`defineRPC`, typed schema, 5 request handlers) | teaches RPC but not React; has teaching noise (native export dialog, per-note JSON files, sync/async fs mix) |

**Neither stock template covers React + RPC**, so "just write a doc over a boilerplate"
doesn't fully serve the goal. Decision: **small fork of `notes-app`** — swap the
view to React, make it 3 panels, simplify storage to one JSON file — and the tour README
is the primary deliverable. The build is genuinely small (template is ~200 LOC total).

## 2. Platform & version

- **`electrobun@1.18.1` pinned exactly.** npm `latest` is 2.0.2 — a different framework
  (Hutch CLI, Cottontail runtime, different config shape). The tour must say "v1" loudly
  and link the v1 docs in-repo (`docs/src/content/docs/electrobun` at tag `v1.18.1`),
  since the public docs site only shows 2.x.
- Config targets mac/linux/win (`bundleCEF: false`). **macOS is the demo target**
  (confirmed); a Linux environment remains useful for a non-visual smoke test (install,
  typecheck, view bundling) but the dev loop/window verification happens on macOS.
- Template dependency quirk: templates use `"electrobun": "file:../../package"`
  (monorepo-relative) → standalone repo must use npm `1.18.1`.

## 3. What the junior learns (the architecture)

Two processes, one bridge:

```
┌───────────────────────────── Electrobun app ─────────────────────────────┐
│                                                                          │
│  MAIN PROCESS (bun) — privileged                WEBVIEW (system WebKit)  │
│  src/bun/index.ts                               src/mainview/*           │
│  • opens the BrowserWindow          ┌─────────► • renders React UI        │
│  • owns the filesystem              │           • no fs, no Node APIs     │
│  • notes.json store                 │           • useState/useEffect      │
│  • handles requests:  ◄─────────────┤                                     │
│    getNotes/getNote/saveNote        │  typed RPC                          │
│    createNote/deleteNote            └──────────► requests: UI → bun        │
│  • pushes messages:                            messages: bun → UI (push) │
│    notesChanged                                                      │
└──────────────────────────────────────────────────────────────────────────┘
```

Tour narrative: *the webview is a browser sandbox; everything privileged lives in the
bun process; RPC is the only door between them, and the TypeScript schema IS the doorframe.*

## 4. Repo layout (~10 files, target <600 LOC total)

```
electrobun-notes-tour/
├── README.md              ← THE TOUR (primary deliverable, see §6)
├── electrobun.config.ts   (from template: build.bun.entrypoint, views.mainview, copy)
├── package.json           (electrobun 1.18.1 exact-pin, react, react-dom, typescript)
├── tsconfig.json
└── src/
    ├── bun/
    │   └── index.ts       (~80 lines: notes.json store + defineRPC + BrowserWindow)
    └── mainview/
        ├── index.html
        ├── index.css      (~60 lines plain CSS — no Tailwind)
        ├── main.tsx
        ├── App.tsx        (3 panels, one screen)
        └── rpc.ts         (Electroview.defineRPC client + useRpc hook + RPC log)
```

Deliberately excluded: Vite/HMR (5 extra config files; `electrobun dev --watch` suffices,
HMR mentioned in appendix), Tailwind, updater/signing, per-note file storage, tags/CRUD
beyond the 5 methods, any state library.

## 5. RPC contract (5 requests, 1 push message)

```ts
type Note = { id: string; folder: string; title: string; content: string; updatedAt: string };

type NotesRPC = {
  bun: RPCSchema<{ requests: {
    getNotes:   { params: {};                                     response: Note[] };
    getNote:    { params: { id: string };                         response: Note | null };
    createNote: { params: { folder: string };                     response: Note };
    saveNote:   { params: { id: string; title: string; content: string }; response: Note };
    deleteNote: { params: { id: string };                         response: { ok: boolean } };
  }; messages: {} }>;
  webview: RPCSchema<{ requests: {}; messages: {
    notesChanged: { reason: "save" | "create" | "delete" };       // bun → UI push
  } }>;
};
```

Design choices that teach:
- Template's `saveNote` with optional `id` doubles as create → split into honest
  `createNote`/`saveNote` so each handler has exactly one job.
- **3rd panel without extra RPC**: sidebar shows folders derived client-side from
  `getNotes()` (folder counts + client-side filtering). Lesson: not every interaction
  needs a roundtrip; selecting a note does (`getNote`), typing does (debounced `saveNote`).
- `notesChanged` push after mutations teaches the second direction (messages vs requests)
  and why the bun process is the source of truth. Exact v1 send-API syntax to be
  confirmed from `docs/.../apis/bun.mdx` at tag v1.18.1 during build (templates leave
  `messages` empty — flagged as the one unverified API detail).
- Store = single `notes.json` in `Utils.paths.userData`, path printed at startup so the
  junior can open it and see the data.

## 6. The tour (README structure — the actual product)

0. **What you're looking at** — 2 processes, the diagram, 30-second version.
1. **Run it** — `bun install && bun run dev`; see the 3 panels; where notes.json lives.
2. **Follow one click end-to-end** — click a note → `App.tsx` handler →
   `rpc.request.getNote` → bun handler reads JSON → response re-renders. Annotated with
   file + line refs and the actual logged traffic.
3. **The schema is the contract** — rename a method in `NotesRPC`, watch TypeScript fail
   on both sides. (The killer demo of typed RPC.)
4. **Why a main process at all** — try `Bun.write` from the webview, watch it fail; RPC
   to the bun side is the fix.
5. **Pull vs push** — requests vs `notesChanged` messages.
6. **Your turn** — 3 small exercises (e.g. add `updatedAt` sort toggle; add a
   `renameFolder` request; show deleted-note undo via push).
7. **Appendix** — `electrobun build` output, how `--watch` works, pointer to v1 docs in
   this repo's history, "Electrobun 2.x exists and looks different — here's the map."

Supporting cast: inline code comments keyed to tour steps (`// [TOUR §2] this is the
line the click becomes an RPC request`) and a ~30-line in-app RPC log overlay
(toggle via keyboard shortcut) rendering `→ getNotes() 4ms · ← 12 notes` — makes the
invisible bridge visible during the walkthrough.

## 7. Milestones

- **M1 — Spike (do first):** standalone scaffold, npm-pin `electrobun@1.18.1`, confirm
  view bundler handles React TSX from node_modules, smoke-test on a Linux environment
  (install + typecheck + bundle; window/dev-loop verification is on macOS). De-risks:
  standalone dep, TSX bundling.
- **M2 — Bun side:** notes.json store + 5 handlers + `notesChanged` push (verify send API
  from v1 docs).
- **M3 — React view:** 3 panels, `rpc.ts`, plain CSS; wire to bun side.
- **M4 — Tour affordances:** [TOUR §n] comments, RPC log overlay.
- **M5 — The tour README:** write it, then simulate the junior: fresh clone → running app
  in <10 min, each section verifiably true.
- Acceptance: fresh-clone run works; every tour step matches observed behavior;
  total LOC < 600 excluding README.

## 8. Decisions log (2026-10-18)

1. Build the small fork (recommended option) — **approved**.
2. Demo platform: **macOS-first** — confirmed. Linux smoke-test only.
3. RPC log overlay — **kept** (~30 lines, off by default, keyboard-shortcut toggle).
4. Repo: **public, under the maintainer's GitHub profile**, name `electrobun-notes-tour`.
