import { createRoot } from "react-dom/client";

// [M1 spike] Minimal React render — proves the Electrobun view bundler
// compiles React TSX from node_modules. The real 3-panel UI lands in M3 (#3).

function App() {
	return (
		<div className="spike">
			<h1>electrobun-notes-tour</h1>
			<p>
				M1 spike: if you can read this in the app window, the view bundler
				handled React TSX from node_modules.
			</p>
		</div>
	);
}

const rootEl = document.getElementById("root");
if (!rootEl) {
	throw new Error("#root not found in index.html");
}

createRoot(rootEl).render(<App />);
