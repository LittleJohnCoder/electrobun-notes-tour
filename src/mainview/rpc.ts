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

export const rpc = Electroview.defineRPC<NotesRPC>({
	maxRequestTime: 10000,
	handlers: {
		requests: {},
		messages: {
			notesChanged: () => notesChangedCb?.(),
		},
	},
});

export const electrobun = new Electrobun.Electroview({ rpc });

// Typed request wrappers — the only door from UI code to the bun process.
export const api = {
	getNotes: () => electrobun.rpc!.request.getNotes({}),
	getNote: (id: string) => electrobun.rpc!.request.getNote({ id }),
	createNote: (folder: string) => electrobun.rpc!.request.createNote({ folder }),
	deleteNote: (id: string) => electrobun.rpc!.request.deleteNote({ id }),
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
		await electrobun.rpc!.request.saveNote(save);
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
