import { useCallback, useEffect, useState } from "react";
import {
	api,
	cancelSave,
	flushSave,
	onNotesChanged,
	scheduleSave,
	type Note,
} from "./rpc";

const DEFAULT_FOLDER = "Inbox";
const EMPTY_DRAFT = { title: "", content: "" };

// [TOUR §2] One click in any panel below becomes at most one typed request —
// except the sidebar, which makes none: it derives everything client-side.
export default function App() {
	const [notes, setNotes] = useState<Note[]>([]);
	const [folder, setFolder] = useState<string | null>(null); // null = all notes
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [draft, setDraft] = useState(EMPTY_DRAFT);

	// [TOUR §5] bun pushes notesChanged after every mutation; we answer with one
	// getNotes() pull — the bun process stays the single source of truth.
	const refresh = useCallback(async () => {
		setNotes(await api.getNotes());
	}, []);

	useEffect(() => {
		refresh();
		onNotesChanged(refresh);
	}, [refresh]);

	// The sidebar lesson: folders + counts derived client-side from getNotes()
	// data — deliberately no getFolders RPC (not every interaction is a roundtrip).
	const folderCounts = new Map<string, number>();
	for (const n of notes) {
		folderCounts.set(n.folder, (folderCounts.get(n.folder) ?? 0) + 1);
	}
	const newestFirst = [...notes].sort((a, b) =>
		b.updatedAt.localeCompare(a.updatedAt),
	);
	const visible = newestFirst.filter(
		(n) => folder === null || n.folder === folder,
	);

	async function selectNote(id: string) {
		await flushSave(); // an edit inside the debounce window must not be lost
		setSelectedId(id);
		// [TOUR §2] the click becomes exactly one typed request: getNote.
		const note = await api.getNote(id);
		setDraft(note ? { title: note.title, content: note.content } : EMPTY_DRAFT);
	}

	async function createNote() {
		await flushSave();
		const note = await api.createNote(folder ?? DEFAULT_FOLDER);
		// The list refresh arrives via the notesChanged push; just open the new note.
		await selectNote(note.id);
	}

	async function deleteNote(id: string) {
		cancelSave(); // the target is about to disappear; a queued save would only fail
		await api.deleteNote(id);
		if (selectedId === id) {
			setSelectedId(null);
			setDraft(EMPTY_DRAFT);
		}
	}

	function edit(patch: Partial<typeof EMPTY_DRAFT>) {
		if (!selectedId) return;
		const next = { ...draft, ...patch };
		setDraft(next);
		scheduleSave(selectedId, next.title, next.content);
	}

	return (
		<div className="app">
			<nav className="sidebar">
				<h2>Folders</h2>
				<button
					className={folder === null ? "active" : ""}
					onClick={() => setFolder(null)}
				>
					All notes ({notes.length})
				</button>
				{[...folderCounts.entries()].map(([name, count]) => (
					<button
						key={name}
						className={folder === name ? "active" : ""}
						onClick={() => setFolder(name)}
					>
						{name} ({count})
					</button>
				))}
			</nav>

			<section className="note-list">
				<header>
					<h2>{folder ?? "All notes"}</h2>
					<button className="new-note" onClick={createNote}>
						+ New
					</button>
				</header>
				<ul>
					{visible.map((n) => (
						<li key={n.id}>
							<button
								className={selectedId === n.id ? "active" : ""}
								onClick={() => selectNote(n.id)}
							>
								<span className="note-title">{n.title || "Untitled"}</span>
								<span className="note-folder">{n.folder}</span>
							</button>
						</li>
					))}
				</ul>
			</section>

			<section className="editor">
				{selectedId ? (
					<>
						<input
							value={draft.title}
							onChange={(e) => edit({ title: e.target.value })}
							placeholder="Title"
						/>
						<textarea
							value={draft.content}
							onChange={(e) => edit({ content: e.target.value })}
							placeholder="Write something…"
						/>
						<footer>
							<button className="danger" onClick={() => deleteNote(selectedId)}>
								Delete
							</button>
						</footer>
					</>
				) : (
					<p className="empty">Select a note on the left, or create one.</p>
				)}
			</section>
		</div>
	);
}
