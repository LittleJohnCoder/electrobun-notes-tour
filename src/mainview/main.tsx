import { createRoot } from "react-dom/client";
import App from "./App";
import RpcLog from "./RpcLog";

// [TOUR §0] What you're looking at: this file boots the WEBVIEW — the React
// UI sandbox, no filesystem, no Node APIs. The privileged MAIN process lives
// in src/bun/index.ts; typed RPC (./rpc) is the only door between them.

const rootEl = document.getElementById("root");
if (!rootEl) {
	throw new Error("#root not found in index.html");
}

createRoot(rootEl).render(
	<>
		<App />
		<RpcLog />
	</>,
);
