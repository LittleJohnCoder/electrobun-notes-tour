import { BrowserView, BrowserWindow, Utils, type RPCSchema } from "electrobun/bun";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";

// [TOUR §1] The bun process owns the filesystem: the whole store is one
// human-readable JSON file in the OS app-data folder.
const storePath = join(Utils.paths.userData, "notes.json");

type Note = { id: string; folder: string; title: string; content: string; updatedAt: string };

// [TOUR §3] The schema is the contract: 5 requests the webview may make and
// 1 message the bun side may push. Rename anything here and TypeScript fails
// on both sides of the bridge.
type NotesRPC = {
	bun: RPCSchema<{
		requests: {
			getNotes: { params: {}; response: Note[] };
			getNote: { params: { id: string }; response: Note | null };
			createNote: { params: { folder: string }; response: Note };
			saveNote: { params: { id: string; title: string; content: string }; response: Note };
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

function loadStore(): Note[] {
	try {
		return JSON.parse(readFileSync(storePath, "utf8")) as Note[];
	} catch {
		return []; // first run: the file doesn't exist yet
	}
}

function persist(notes: Note[]): void {
	mkdirSync(dirname(storePath), { recursive: true }); // learner-proof: recreate a wiped app-data folder
	notes.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
	writeFileSync(storePath, `${JSON.stringify(notes, null, 2)}\n`);
}

function generateId(): string {
	return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// [TOUR §2] Every request from the webview lands on exactly one handler here.
// Each handler has one job: createNote mints, saveNote mutates an existing id.
const notesRPC = BrowserView.defineRPC<NotesRPC>({
	maxRequestTime: 10000,
	handlers: {
		requests: {
			getNotes: () => loadStore(),
			getNote: ({ id }) => loadStore().find((n) => n.id === id) ?? null,
			createNote: ({ folder }) => {
				const note: Note = {
					id: generateId(),
					folder,
					title: "Untitled",
					content: "",
					updatedAt: new Date().toISOString(),
				};
				const notes = loadStore();
				notes.push(note);
				persist(notes);
				notesRPC.send.notesChanged({ reason: "create" }); // [TOUR §5]
				return note;
			},
			saveNote: ({ id, title, content }) => {
				const notes = loadStore();
				const note = notes.find((n) => n.id === id);
				if (!note) throw new Error(`saveNote: no note with id ${id}`);
				note.title = title;
				note.content = content;
				note.updatedAt = new Date().toISOString();
				persist(notes);
				notesRPC.send.notesChanged({ reason: "save" }); // [TOUR §5]
				return note;
			},
			deleteNote: ({ id }) => {
				const notes = loadStore();
				const remaining = notes.filter((n) => n.id !== id);
				if (remaining.length === notes.length) return { ok: false };
				persist(remaining);
				notesRPC.send.notesChanged({ reason: "delete" }); // [TOUR §5]
				return { ok: true };
			},
		},
		messages: {},
	},
});

// [TOUR §1] One window, one webview, one rpc — the only door between the processes.
new BrowserWindow({
	title: "Notes",
	url: "views://mainview/index.html",
	rpc: notesRPC,
	frame: { width: 900, height: 650, x: 200, y: 200 },
});

console.log(`[notes-tour] store: ${storePath}`);
