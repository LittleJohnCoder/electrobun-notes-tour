import { useEffect, useState } from "react";
import { onRpcLog, rpcLog } from "./rpc";

// [TOUR §2] The proof-by-watching overlay: the last bridge crossings, live.
// Off by default; Cmd+L (Ctrl+L on other platforms) toggles it, and
// pointer-events: none means it never stands between the user and the app.
export default function RpcLog() {
	const [open, setOpen] = useState(false);
	const [, bump] = useState(0); // re-render whenever a log line lands

	useEffect(() => {
		onRpcLog(() => bump((n) => n + 1));
		const onKey = (e: KeyboardEvent) => {
			if ((e.metaKey || e.ctrlKey) && e.key === "l") {
				e.preventDefault();
				setOpen((was) => !was);
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, []);

	if (!open) return null;
	return (
		<aside className="rpc-log">
			{rpcLog.slice(-14).map((line, i) => (
				<div key={i}>{line}</div>
			))}
		</aside>
	);
}
