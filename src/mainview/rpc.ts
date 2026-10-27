// [TOUR §3] The schema is the contract: mirrored by hand from src/bun/index.ts.
// Rename a method on the bun side only and this file stops compiling —
// TypeScript on both sides of the bridge is the doorframe.
import Electrobun, { Electroview, type RPCSchema } from "electrobun/view";

export type Note = {
	id: string;
	folder: string;
	title: string;
	content: string;
	updatedAt: string;
};

type NotesRPC = {
	bun: RPCSchema<{
		requests: {
			getNotes: { params: {}; response: Note[] };
			getNote: { params: { id: string }; response: Note | null };
			createNote: { params: { folder: string }; response: Note };
			saveNote: {
				params: { id: string; title: string; content: string };
				response: Note;
			};
			deleteNote: { params: { id: string }; response: { ok: boolean } };
		};
		messages: {};
	}>;
	webview: RPCSchema<{
		requests: {};
		messages: {
			// [TOUR §5] bun → UI push: bun is the source of truth, so it announces
			// mutations instead of the UI polling for them.
			notesChanged: { reason: "save" | "create" | "delete" };
		};
	}>;
};

// The push handler routes to whatever React currently registered (App.tsx).
let notesChangedCb: (() => void) | null = null;

export function onNotesChanged(cb: () => void): void {
	notesChangedCb = cb;
}

// [TOUR §2] The RPC log: every crossing of the bridge appends one line here
// and the overlay (RpcLog.tsx, toggled with Cmd+L) renders it — the tour
// watches the real traffic instead of trusting prose about it.
export const rpcLog: string[] = [];
let onLogLine: (() => void) | null = null;
export function onRpcLog(cb: () => void): void {
	onLogLine = cb;
}
const show = (v: unknown) => JSON.stringify(v);

async function logged<R>(
	name: string,
	params: object,
	run: () => Promise<R>,
	reply: (r: R) => string,
): Promise<R> {
	const t0 = performance.now();
	const result = await run();
	rpcLog.push(
		`→ ${name}(${show(params)}) ${Math.max(1, Math.round(performance.now() - t0))}ms ${reply(result)}`,
	);
	if (rpcLog.length > 200) rpcLog.shift();
	onLogLine?.();
	return result;
}

export const rpc = Electroview.defineRPC<NotesRPC>({
	maxRequestTime: 10000,
	handlers: {
		requests: {},
		messages: {
			// [TOUR §5] the push prints its ⇐ line the moment it lands, before
			// React reacts to it.
			notesChanged: (params) => {
				rpcLog.push(`⇐ notesChanged(${show(params)})`);
				onLogLine?.();
				notesChangedCb?.();
			},
		},
	},
});

export const electrobun = new Electrobun.Electroview({ rpc });

// [TOUR §4] This object is the webview's entire privileged surface. The
// sandbox has no filesystem — try `Bun.write` right here and the WEBVIEW
// rejects it at runtime (`Bun` doesn't exist in a browser sandbox, and
// @types/bun leaks the global, so the type checker won't stop you).
// A typed request to the bun process is the only fix.
// [TOUR §2] All five requests go through `logged` in this one place, so the
// log cannot drift from the real traffic.
export const api = {
	getNotes: () =>
		logged("getNotes", {}, () => electrobun.rpc!.request.getNotes({}), (r) => `← ${r.length} notes`),
	getNote: (id: string) =>
		logged("getNote", { id }, () => electrobun.rpc!.request.getNote({ id}), (r) => `← ${r ? "Note" : "null"}`),
	createNote: (folder: string) =>
		logged("createNote", { folder }, () => electrobun.rpc!.request.createNote({ folder }), () => "← Note"),
	deleteNote: (id: string) =>
		logged("deleteNote", { id }, () => electrobun.rpc!.request.deleteNote({ id }), (r) => `← {ok:${r.ok}}`),
	saveNote: (p: { id: string; title: string; content: string }) =>
		logged("saveNote", p, () => electrobun.rpc!.request.saveNote(p), () => "← Note"),
};

// [TOUR §2] Typing is not a roundtrip per keystroke: edits queue a debounced
// saveNote (~500 ms after the last keystroke).
const SAVE_DEBOUNCE_MS = 500;

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let pendingSave: { id: string; title: string; content: string } | null = null;

export function scheduleSave(id: string, title: string, content: string): void {
	pendingSave = { id, title, content };
	if (saveTimer) clearTimeout(saveTimer);
	saveTimer = setTimeout(() => void flushSave(), SAVE_DEBOUNCE_MS);
}

/** Fire any queued save now (used before switching away from a note). */
export async function flushSave(): Promise<void> {
	if (saveTimer) {
		clearTimeout(saveTimer);
		saveTimer = null;
	}
	const save = pendingSave;
	pendingSave = null;
	if (!save) return;
	try {
		await api.saveNote(save);
	} catch (error) {
		// The note can vanish (deleted elsewhere) inside the debounce window.
		console.error("saveNote failed:", error);
	}
}

/** Drop a queued save (used when the note being edited is deleted). */
export function cancelSave(): void {
	if (saveTimer) {
		clearTimeout(saveTimer);
		saveTimer = null;
	}
	pendingSave = null;
}
