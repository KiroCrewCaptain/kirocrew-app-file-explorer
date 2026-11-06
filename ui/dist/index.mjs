import { activeLocale, fmtNumber, useAppApi, useChatLauncher, useImeGuard, useLanguageGeneration, useNavigate } from "@kirocrew/app-sdk";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowUpFromLine, ChevronDown, ChevronRight, ChevronUp, Copy, CornerDownRight, Download, Eye, File, FileQuestion, FileText, Folder, FolderGit2, FolderOpen, FolderTree, GitBranch, Image, MessageSquare, MoreHorizontal, Plus, RefreshCw, Search, ShieldAlert, X } from "lucide-react";
import { Btn, Clickable, EmptyState, ErrorNotice, MarkdownRenderer, Skeleton } from "@kirocrew/app-sdk/ui";
import { createPortal } from "react-dom";
import { Fragment as Fragment$1, jsx, jsxs } from "react/jsx-runtime";
// src/constants.ts
var API_BASE = "/apps/file-explorer/api";
var STORAGE_KEY = "kc:file-explorer:state:v2";
var IMAGE_EXTS = /* @__PURE__ */ new Set([
	".png",
	".jpg",
	".jpeg",
	".gif",
	".webp",
	".bmp",
	".ico",
	".svg"
]);
var LANG_BY_EXT = {
	".ts": "typescript",
	".tsx": "typescript",
	".js": "javascript",
	".jsx": "javascript",
	".mjs": "javascript",
	".cjs": "javascript",
	".py": "python",
	".rb": "ruby",
	".go": "go",
	".rs": "rust",
	".java": "java",
	".kt": "kotlin",
	".scala": "scala",
	".cs": "csharp",
	".c": "c",
	".h": "c",
	".cpp": "cpp",
	".cc": "cpp",
	".hpp": "cpp",
	".php": "php",
	".swift": "swift",
	".lua": "lua",
	".r": "r",
	".sh": "bash",
	".bash": "bash",
	".zsh": "bash",
	".fish": "shell",
	".json": "json",
	".yml": "yaml",
	".yaml": "yaml",
	".toml": "toml",
	".xml": "xml",
	".html": "xml",
	".htm": "xml",
	".svg": "xml",
	".css": "css",
	".scss": "scss",
	".less": "less",
	".sql": "sql",
	".graphql": "graphql",
	".gql": "graphql",
	".dockerfile": "dockerfile",
	".makefile": "makefile",
	".gradle": "groovy",
	".groovy": "groovy",
	".smithy": "smithy",
	".proto": "protobuf"
};
// src/api.ts
var bound = null;
/** Called by the root component with `useAppApi()`. */
function bindAppApi(api) {
	bound = api;
}
var FileExplorerApiError = class extends Error {
	status;
	code;
	constructor(status, message, code) {
		super(message);
		this.name = "FileExplorerApiError";
		this.status = status;
		this.code = code;
	}
};
function isScopedFailure(e) {
	return typeof e === "object" && e !== null && typeof e.status === "number";
}
/** The backend's sentence and code from a refusal body, or the status alone. */
function toFileExplorerError(status, body) {
	const text = typeof body === "string" ? body.trim() : "";
	if (text) try {
		const parsed = JSON.parse(text);
		return new FileExplorerApiError(status, typeof parsed.error === "string" && parsed.error ? parsed.error : `HTTP ${status}`, typeof parsed.code === "string" ? parsed.code : void 0);
	} catch {
		return new FileExplorerApiError(status, text.slice(0, 300));
	}
	return new FileExplorerApiError(status, `HTTP ${status}`);
}
/** The machine-readable code of a refusal, if the gateway sent one. */
function apiErrorCode(e) {
	return e instanceof FileExplorerApiError ? e.code : void 0;
}
async function get(path) {
	if (!bound) throw new Error("file-explorer: the host API client is not bound");
	try {
		return await bound.get(path);
	} catch (e) {
		if (isScopedFailure(e)) {
			let body = "";
			try {
				body = typeof e.body === "string" ? e.body : "";
			} catch {
				body = "";
			}
			throw toFileExplorerError(e.status, body);
		}
		throw e;
	}
}
var fileExplorerApi = {
	health: () => get(`${API_BASE}/health`),
	tree: (path, depth = 1) => get(`${API_BASE}/tree?path=${encodeURIComponent(path)}&depth=${depth}`),
	read: (path, maxBytes) => {
		const q = new URLSearchParams({ path });
		if (maxBytes) q.set("max_bytes", String(maxBytes));
		return get(`${API_BASE}/read?${q.toString()}`);
	},
	search: (path, q, include = "", exclude = "") => {
		const params = new URLSearchParams({
			path,
			q
		});
		if (include) params.set("include", include);
		if (exclude) params.set("exclude", exclude);
		return get(`${API_BASE}/search?${params.toString()}`);
	},
	gitStatus: (path) => get(`${API_BASE}/git-status?path=${encodeURIComponent(path)}`),
	resolve: (path) => get(`${API_BASE}/resolve?path=${encodeURIComponent(path)}`),
	complete: (path, kind = "dir", limit = 30) => {
		return get(`${API_BASE}/complete?${new URLSearchParams({
			path,
			kind,
			limit: String(limit)
		}).toString()}`);
	}
};
// src/lib/usePointerDrag.ts
/**
* Attach the returned handlers to a drag handle:
*   const drag = usePointerDrag({ onMove: ({ dx }) => setWidth(w0 - dx), threshold: 10 })
*   <div {...drag} />
*/
function usePointerDrag(opts) {
	const st = useRef({
		startX: 0,
		startY: 0,
		lastX: 0,
		lastY: 0,
		active: false,
		committed: false
	});
	const optsRef = useRef(opts);
	optsRef.current = opts;
	const fallback = useRef(null);
	const disarmFallback = useCallback(() => {
		fallback.current?.dispose();
		fallback.current = null;
	}, []);
	const endRef = useRef(() => {});
	const onPointerDown = useCallback((e) => {
		if (e.pointerType === "mouse" && e.button !== 0) return;
		const el = e.currentTarget;
		disarmFallback();
		let captured = true;
		try {
			el.setPointerCapture(e.pointerId);
		} catch {
			captured = false;
		}
		const s = st.current;
		s.startX = e.clientX;
		s.startY = e.clientY;
		s.lastX = e.clientX;
		s.lastY = e.clientY;
		s.active = true;
		s.committed = (optsRef.current.threshold ?? 10) <= 0;
		if (!captured) {
			const pointerId = e.pointerId;
			const onWindowEnd = (ev) => {
				if (ev.pointerId !== pointerId) return;
				endRef.current(ev);
			};
			window.addEventListener("pointerup", onWindowEnd);
			window.addEventListener("pointercancel", onWindowEnd);
			fallback.current = {
				pointerId,
				dispose: () => {
					window.removeEventListener("pointerup", onWindowEnd);
					window.removeEventListener("pointercancel", onWindowEnd);
				}
			};
		}
		optsRef.current.onStart?.(e);
		if (s.committed) optsRef.current.onMove({
			dx: 0,
			dy: 0,
			x: e.clientX,
			y: e.clientY,
			first: true
		});
		e.preventDefault();
	}, [disarmFallback]);
	const onPointerMove = useCallback((e) => {
		const s = st.current;
		if (!s.active) return;
		s.lastX = e.clientX;
		s.lastY = e.clientY;
		const dx = e.clientX - s.startX;
		const dy = e.clientY - s.startY;
		const threshold = optsRef.current.threshold ?? 10;
		if (!s.committed) {
			if (Math.hypot(dx, dy) < threshold) return;
			s.committed = true;
		}
		optsRef.current.onMove({
			dx,
			dy,
			x: e.clientX,
			y: e.clientY,
			first: false
		});
	}, []);
	const end = useCallback((e) => {
		const s = st.current;
		if (!s.active) return;
		s.active = false;
		disarmFallback();
		const target = "currentTarget" in e ? e.currentTarget : null;
		try {
			target?.releasePointerCapture(e.pointerId);
		} catch {}
		if (e.type === "pointerup") {
			s.lastX = e.clientX;
			s.lastY = e.clientY;
		}
		optsRef.current.onEnd?.({
			dx: s.lastX - s.startX,
			dy: s.lastY - s.startY,
			x: s.lastX,
			y: s.lastY,
			first: false,
			committed: s.committed
		});
		s.committed = false;
	}, [disarmFallback]);
	endRef.current = end;
	useEffect(() => disarmFallback, [disarmFallback]);
	return {
		onPointerDown,
		onPointerMove,
		onPointerUp: end,
		onPointerCancel: end,
		onLostPointerCapture: end
	};
}
// src/lib/useIsMobile.ts
/** The dashboard's own phone breakpoint: narrower than 768 px is the stacked layout. */
var MOBILE_QUERY = "(max-width: 767px)";
var cachedFn;
var cachedMql = null;
function currentMql() {
	const fn = typeof window !== "undefined" ? window.matchMedia : void 0;
	if (typeof fn !== "function") return null;
	if (fn !== cachedFn) {
		cachedFn = fn;
		cachedMql = fn.call(window, MOBILE_QUERY);
	}
	return cachedMql;
}
var WINDOW_EVENTS = [
	"orientationchange",
	"resize",
	"pageshow"
];
function subscribe(cb) {
	const mql = currentMql();
	mql?.addEventListener("change", cb);
	for (const type of WINDOW_EVENTS) window.addEventListener(type, cb);
	document.addEventListener("visibilitychange", cb);
	return () => {
		mql?.removeEventListener("change", cb);
		for (const type of WINDOW_EVENTS) window.removeEventListener(type, cb);
		document.removeEventListener("visibilitychange", cb);
	};
}
/** True on a narrow (phone-width) viewport. */
function useIsMobile() {
	return useSyncExternalStore(subscribe, () => currentMql()?.matches ?? false, () => false);
}
// src/lib/Menu.tsx
/**
* A small popup menu: the tree's right-click menu and the viewer's overflow
* menu. The built-in page used the dashboard's own context-menu and dropdown
* primitives, which are not part of the App SDK, so this is the page's own.
*
* Rendered into `document.body` at a fixed point, so no scrolling or clipped
* ancestor can hide it. It closes on Escape, on a press outside it, on a scroll,
* on a resize, and after an item runs. A control that opens it carries
* `data-fe-menu-trigger`, so pressing it again closes rather than reopens. Arrow keys move between items and the
* first item takes focus when it opens, so the keyboard can drive it.
*/
function Menu({ at, onClose, label, children, testId }) {
	const ref = useRef(null);
	useEffect(() => {
		if (!at) return;
		const items = () => Array.from(ref.current?.querySelectorAll("[role=\"menuitem\"]") ?? []);
		items()[0]?.focus({ preventScroll: true });
		const onDown = (e) => {
			const target = e.target;
			if (ref.current?.contains(target)) return;
			if (target?.closest?.("[data-fe-menu-trigger]")) return;
			onClose();
		};
		const onKey = (e) => {
			if (e.key === "Escape") {
				e.preventDefault();
				onClose();
				return;
			}
			if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
			e.preventDefault();
			const list = items();
			if (list.length === 0) return;
			const i = list.indexOf(document.activeElement);
			list[e.key === "ArrowDown" ? (i + 1) % list.length : (i - 1 + list.length) % list.length].focus();
		};
		const close = () => onClose();
		document.addEventListener("mousedown", onDown, true);
		document.addEventListener("keydown", onKey, true);
		window.addEventListener("resize", close);
		window.addEventListener("scroll", close, true);
		return () => {
			document.removeEventListener("mousedown", onDown, true);
			document.removeEventListener("keydown", onKey, true);
			window.removeEventListener("resize", close);
			window.removeEventListener("scroll", close, true);
		};
	}, [at, onClose]);
	if (!at) return null;
	const style = at.alignEnd ? {
		position: "fixed",
		top: at.y,
		right: Math.max(0, window.innerWidth - at.x)
	} : {
		position: "fixed",
		top: at.y,
		left: at.x
	};
	return createPortal(/* @__PURE__ */ jsx("div", {
		ref,
		className: "mc-fe-menu",
		role: "menu",
		"aria-label": label,
		style,
		"data-testid": testId,
		children
	}), document.body);
}
function MenuItem({ onSelect, onClose, children }) {
	return /* @__PURE__ */ jsx("button", {
		type: "button",
		role: "menuitem",
		className: "mc-fe-menu-item",
		onClick: () => {
			onClose();
			onSelect();
		},
		children
	});
}
// src/lib/platform.ts
/**
* Small pure helpers the built-in page imported from the dashboard's own
* modules. A bundle cannot import those (they are not part of the App SDK), so
* the few this page needs are restated here with the same behaviour.
*/
/** A path whose backslashes are separators: a drive path (`C:\x`) or a UNC share. */
var WINDOWS_SHAPED_PATH_RE = /^(?:[A-Za-z]:|\\\\[^\\/]+)[\\/]/;
function backslashIsSeparator(p) {
	return WINDOWS_SHAPED_PATH_RE.test(p);
}
/** The last path segment. Backslash splits only a Windows-shaped path. */
function pathBasename(p) {
	const cut = backslashIsSeparator(p) ? Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\")) : p.lastIndexOf("/");
	return p.slice(cut + 1);
}
/** `p` without trailing separators (backslashes only on a Windows-shaped path). */
function stripTrailingSeparators(p) {
	return p.replace(backslashIsSeparator(p) ? /[\\/]+$/ : /\/+$/, "");
}
/** `p` as a label relative to `root`, for DISPLAY only: `C:\proj\src\a.py`
*  under `C:\proj` → `src\a.py`. A Windows-shaped `p` matches `root` with
*  either separator and without case, since the backend prints native paths
*  while a root may carry another spelling; a POSIX path matches byte for
*  byte. `p` comes back whole when it is not under `root`, and `''` when it
*  IS `root`. */
function relativeToRoot(p, root) {
	if (!root) return p;
	const r = stripTrailingSeparators(root);
	const win = backslashIsSeparator(p);
	const fold = (x) => win ? x.replace(/\\/g, "/").toLowerCase() : x;
	if (p.length < r.length || fold(p.slice(0, r.length)) !== fold(r)) return p;
	const rest = p.slice(r.length);
	const sep = win ? /^[\\/]+/ : /^\/+/;
	if (rest !== "" && r !== "" && !sep.test(rest)) return p;
	return rest.replace(sep, "");
}
/**
* The platform command modifier is held: Cmd on macOS, Ctrl elsewhere. Exactly
* one of the two, because Cmd+Ctrl is a chord macOS reserves for itself.
*/
var hasCommandModifier = (e) => e.metaKey !== e.ctrlKey;
/**
* Absolute in the sense the backend trusts: a POSIX root, `~` or `~/...` (the
* gateway user's own home), a drive path, or a UNC share. `~name` is not.
*/
function isAbsolutePath(filePath) {
	return /^(?:\/|~(?:$|\/)|[A-Za-z]:[\\/]|\\\\)/.test(filePath);
}
/** Copy text to the clipboard; `true` on success. Never throws. */
async function copyToClipboard(text) {
	try {
		if (navigator.clipboard?.writeText) {
			await navigator.clipboard.writeText(text);
			return true;
		}
	} catch {}
	try {
		const area = document.createElement("textarea");
		area.value = text;
		area.setAttribute("readonly", "");
		area.style.position = "fixed";
		area.style.opacity = "0";
		document.body.appendChild(area);
		area.select();
		const ok = document.execCommand("copy");
		document.body.removeChild(area);
		return ok;
	} catch {
		return false;
	}
}
/** `localStorage.setItem` that swallows a quota or privacy-mode refusal. */
function safeSetItem(key, value) {
	try {
		localStorage.setItem(key, value);
	} catch {}
}
// src/lib/useDeepLinkParam.ts
/**
* Read a query parameter off the page URL once, hand it to `onValue`, and remove
* it with a history REPLACE.
*
* The built-in page used the dashboard router's `useSearchParams`, which a bundle
* cannot import. This reads `window.location` instead and keeps the router's own
* history state when it rewrites the URL, so Back and the router are unaffected.
*
* It looks on mount, after every render, and on `popstate`, so a link that
* arrives while the page is already open (the host re-renders its route) is
* still taken. A value is delivered once: the param is gone from the URL as soon
* as it is read.
*/
function take(param) {
	const url = new URL(window.location.href);
	const raw = url.searchParams.get(param);
	if (raw === null) return null;
	url.searchParams.delete(param);
	window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
	return raw;
}
function useDeepLinkParam(param, onValue) {
	useEffect(() => {
		const raw = take(param);
		if (raw !== null) onValue(raw);
	});
	useEffect(() => {
		const onPop = () => {
			const raw = take(param);
			if (raw !== null) onValue(raw);
		};
		window.addEventListener("popstate", onPop);
		return () => window.removeEventListener("popstate", onPop);
	}, [param, onValue]);
}
// src/lib/format.ts
/**
* Byte sizes and timestamps in the host's active locale, through the App SDK's
* `fmtNumber` and `activeLocale`. Same output as the dashboard's own `fmtBytes`
* and `fmtDateTimeNumeric`, which a bundle cannot import.
*/
function roundToDigits(value, digits) {
	const step = 10 ** digits;
	return Math.sign(value) * Math.round(Math.abs(value) * step) / step;
}
function fmtUnit(value, unit, maximumFractionDigits) {
	return fmtNumber(value, {
		style: "unit",
		unit,
		unitDisplay: "narrow",
		maximumFractionDigits
	}).replace(/ /g, "\xA0");
}
/** SI bytes (divisor 1000), CLDR-narrow units: `500B`, `2kB`, `5.2MB`. */
function fmtBytes(bytes) {
	if (!Number.isFinite(bytes)) return "—";
	if (Math.abs(roundToDigits(bytes, 0)) < 1e3) return fmtUnit(roundToDigits(bytes, 0), "byte", 0);
	const units = [
		"kilobyte",
		"megabyte",
		"gigabyte"
	];
	for (let i = 0; i < units.length; i++) {
		const v = roundToDigits(bytes / 1e3 ** (i + 1), 1);
		if (Math.abs(v) < 1e3) return fmtUnit(v, units[i], 1);
	}
	return fmtUnit(bytes / 1e3 ** 4, "terabyte", 1);
}
function locale() {
	try {
		const l = activeLocale();
		return typeof l === "string" && l ? l : "en";
	} catch {
		return "en";
	}
}
/** What `d.toLocaleString()` renders, in the host's locale: all-numeric date and time. */
function fmtDateTimeNumeric(value) {
	if (Number.isNaN(value.getTime())) return "—";
	return new Intl.DateTimeFormat(locale(), {
		year: "numeric",
		month: "numeric",
		day: "numeric",
		hour: "numeric",
		minute: "2-digit",
		second: "2-digit"
	}).format(value);
}
// src/deepLink.ts
/**
* The Files page's deep link: `<page route>?path=<absolute path>`.
*
* Another dashboard surface (the chat side panel's file viewer) hands a file to
* this page through that URL. `FileExplorerPage` reads the param once, resolves
* it through the app's own backend, and opens it in the tab whose root already
* contains it, or in a new tab rooted at its folder. The page never trusts the
* raw value: the backend's `resolve` says whether the path exists, what it is,
* and whether this app may show it at all.
*
* Only the reading half lives here. The link BUILDER belongs to whoever links
* in (Kiro Crew's own file viewer); see PORTING.md.
*
* Pure on purpose: the containment rule and the reveal chain are pinned by
* `ui/tests/deepLink.test.ts` rather than by driving the page.
*/
/** Query param naming the path to open. */
var FILE_EXPLORER_PATH_PARAM = "path";
/**
* A path in the form the page compares by. Windows drive (`C:\x`) and UNC
* (`\\host\share`) paths compare with either separator and case-insensitively;
* everything else compares byte for byte, since a POSIX path IS case-sensitive.
*/
var normPath = (x) => /^([a-z]:|[\\/]{2})/i.test(x) ? x.replace(/\\/g, "/").toLowerCase() : x;
/** `p` is the root `r` itself or a path below it. */
var underRoot = (p, r) => {
	const [a, b] = [normPath(p), normPath(r).replace(/\/+$/, "")];
	return a === b || a.startsWith(b + "/") || b === "";
};
/**
* The directory containing `p`, or `null` at a filesystem root. Separator-aware
* because the backend prints paths with the host's own separator (`str(Path)`),
* so on a Windows gateway every one is a backslash. `utils.dirname` delegates
* here for Windows-shaped paths and keeps a `/`-only cut for POSIX ones.
*/
function parentDir(p) {
	const trimmed = p.replace(/[\\/]+$/, "");
	const cut = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"));
	if (cut < 0) return null;
	if (cut === 0 || /^[a-z]:$/i.test(trimmed.slice(0, cut))) return trimmed.slice(0, cut + 1);
	const parent = trimmed.slice(0, cut);
	return parent === trimmed ? null : parent;
}
/**
* The directories the tree must have expanded for `dir` to be on screen under
* `root`: `root` itself, then every directory from just below it down to and
* including `dir`, outermost first. `[]` when `dir` is not under `root`.
*
* Built by cutting `dir` down rather than by joining segments back up, so each
* entry is byte-identical to the `path` the backend prints on the matching tree
* node — `FolderTab.expanded` is keyed by that string, and a re-joined path
* would miss on a Windows separator or a case difference.
*/
function revealChain(root, dir) {
	if (!underRoot(dir, root)) return [];
	const rootKey = normPath(root).replace(/\/+$/, "");
	const chain = [];
	let cur = dir;
	while (cur !== null && normPath(cur).replace(/\/+$/, "") !== rootKey) {
		chain.push(cur);
		cur = parentDir(cur);
	}
	chain.push(root);
	return chain.reverse();
}
// src/utils.ts
var extOf = (p) => {
	const slash = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
	const base = p.slice(slash + 1);
	const i = base.lastIndexOf(".");
	if (i <= 0) return "";
	return base.slice(i).toLowerCase();
};
var basename = (p) => pathBasename(stripTrailingSeparators(p));
/** A UNC share root (`\\host\share`), the top of its own tree. */
var UNC_SHARE_ROOT_RE = /^\\\\[^\\/]+[\\/][^\\/]+[\\/]*$/;
/** The folder that contains `p`, used to re-root a folder tab.
*
*  A Windows gateway prints paths with backslashes (`str(Path)` in
*  `backend/server.py`), so a Windows-shaped path (drive-rooted or backslash
*  UNC, the `backslashIsSeparator` test) takes `parentDir`'s separator-aware
*  cut. At a drive root (`C:\`) or a UNC share root (`\\host\share`) there is
*  no parent, so the path itself comes back and re-rooting to it is a no-op.
*  Every other path keeps the POSIX rule: only `/` separates, because on POSIX
*  a backslash is a legal file-name character (`/tmp/we\ird` is one name). */
var dirname = (p) => {
	if (backslashIsSeparator(p)) {
		if (UNC_SHARE_ROOT_RE.test(p)) return p;
		return parentDir(p) ?? p;
	}
	const s = p.replace(/\/+$/, "");
	const i = s.lastIndexOf("/");
	if (i <= 0) return "/";
	return s.slice(0, i);
};
/** Label for one `parentChain` crumb. The chain is built by splitting on `/`
*  only, so its label splits on `/` only too: a Windows root stays one crumb
*  showing the whole path, as it always has. Breadcrumb navigation for
*  Windows roots is a separate change. */
var crumbLabel = (p) => p.replace(/\/+$/, "").split("/").at(-1) ?? "";
var parentChain = (p) => {
	const out = [];
	let cur = p.replace(/\/+$/, "");
	while (cur && cur !== "/") {
		out.unshift(cur);
		const i = cur.lastIndexOf("/");
		cur = i <= 0 ? "/" : cur.slice(0, i);
	}
	out.unshift("/");
	return out;
};
var formatBytes = (n) => {
	if (n == null) return "";
	return fmtBytes(n);
};
var formatTime = (sec) => {
	if (!sec) return "";
	return fmtDateTimeNumeric(/* @__PURE__ */ new Date(sec * 1e3));
};
/**
* The platform command modifier is held — Cmd on macOS, Ctrl elsewhere.
* See `hasCommandModifier` for why Cmd+Ctrl together does not count.
*/
var isShortcut = (e) => hasCommandModifier(e);
var SENSITIVE_PATTERNS = [
	/\/\.ssh\//,
	/\/\.aws\//,
	/\/\.gnupg\//,
	/\/\.env$/,
	/\/\.env\./,
	/\/\.npmrc$/,
	/\/\.netrc$/,
	/\/credentials$/,
	/\/\.git-credentials$/,
	/\/\.docker\/config\.json$/,
	/\/\.kube\/config$/
];
/**
* Whether viewing this file warrants the screen-sharing warning.
*
* Matched against a slash-normalized copy, not the raw string. Paths reach the
* UI exactly as the backend printed them — `str(p)` on a `pathlib.Path` in
* `backend/server.py` — so on Windows every separator is a backslash and
* the `/`-anchored patterns above match nothing at all. `extOf` already splits
* on both separators for the same reason; this is the rest of that contract.
*
* Normalizing rather than widening each pattern to `[/\\]` keeps one readable
* pattern list and cannot drop a leading-separator anchor by hand. A POSIX file
* whose NAME legitimately contains a backslash (`a\.ssh\k`) can now match, which
* is the fail-safe direction here: the only consequence is an advisory banner
* shown when it need not be, and this caller does nothing else with the verdict.
*/
function isSensitivePath(path) {
	const normalized = path.replace(/\\/g, "/");
	return SENSITIVE_PATTERNS.some((p) => p.test(normalized));
}
var loadState = () => {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return null;
		const parsed = JSON.parse(raw);
		if (!parsed || !Array.isArray(parsed.folderTabs)) return null;
		return parsed;
	} catch {
		return null;
	}
};
var saveState = (state) => {
	try {
		safeSetItem(STORAGE_KEY, JSON.stringify(state));
	} catch {}
};
// src/styles.ts
var FE_CSS = `
.mc-fe-root { display:flex; flex-direction:column; height:100%; min-height:0; background:var(--bg); color:var(--text); font-size:13px; font-family:var(--font-body, -apple-system, BlinkMacSystemFont, sans-serif); letter-spacing:-.02em; }
.mc-fe-tabstrip-outer { position:relative; border-bottom:1px solid var(--border); background:var(--bg); }
.mc-fe-tabstrip-fade { position:absolute; top:0; bottom:0; width:28px; pointer-events:none; z-index:2; }
.mc-fe-fade-left { left:0; background:linear-gradient(to right, var(--bg), transparent); }
.mc-fe-fade-right { right:0; background:linear-gradient(to left, var(--bg), transparent); }
.mc-fe-tabs { display:flex; align-items:stretch; gap:2px; padding:6px 8px 0; overflow-x:auto; }
.mc-fe-tab { display:inline-flex; align-items:center; gap:4px; padding:6px 8px 6px 10px; border:1px solid var(--border); border-bottom:none; border-radius:6px 6px 0 0; background:var(--card); color:var(--muted); cursor:pointer; user-select:none; transition:background .12s, color .12s; flex-shrink:0; }
.mc-fe-tab.is-active { background:var(--bg); color:var(--text); border-color:var(--border); }
.mc-fe-tab.is-current-folder { border-bottom-color:var(--bg); }
.mc-fe-tab-label { font-size:12px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; min-width:0; max-width:200px; }
.mc-fe-tab-close { display:inline-flex; align-items:center; justify-content:center; width:16px; height:16px; border-radius:3px; opacity:.5; flex-shrink:0; }
.mc-fe-tab-close:hover { opacity:1; background:color-mix(in srgb, var(--text) 12%, transparent); }
.mc-fe-tab-new { display:inline-flex; align-items:center; justify-content:center; padding:6px 10px; background:transparent; border:none; color:var(--muted); cursor:pointer; border-radius:4px; flex-shrink:0; }
.mc-fe-tab-new:hover { color:var(--text); background:color-mix(in srgb, var(--text) 8%, transparent); }
.mc-fe-tab-rename { background:var(--bg); border:1px solid var(--border); color:var(--text); padding:0 4px; font-size:12px; width:160px; outline:none; border-radius:3px; }
.mc-fe-tab-sep { width:1px; background:var(--border); margin:4px 6px; align-self:stretch; opacity:.6; flex-shrink:0; }
.mc-fe-banner { padding:6px 12px; background:color-mix(in srgb, var(--warn) 18%, transparent); color:var(--warn); font-size:12px; display:flex; align-items:center; gap:6px; border-bottom:1px solid var(--border); }
.mc-fe-banner-text { flex:1; min-width:0; overflow-wrap:anywhere; }
.mc-fe-banner-text code { font-family:var(--mono, ui-monospace, monospace); font-size:11px; }
.mc-fe-banner-dismiss { color:var(--warn); flex-shrink:0; }
.mc-fe-banner-dismiss:hover:not(:disabled) { color:var(--warn); }
.mc-fe-pathbar { padding:6px 12px; border-bottom:1px solid var(--border); background:var(--bg); }
.mc-fe-pathbar-row { display:flex; align-items:center; gap:8px; min-height:32px; }
.mc-fe-pathbar-edit { position:relative; flex:1; min-width:0; }
.mc-fe-pathbar-input { width:100%; background:var(--card); border:1px solid var(--border); color:var(--text); padding:5px 8px; font-size:13px; font-family:var(--mono, ui-monospace, monospace); border-radius:6px; outline:none; box-sizing:border-box; }
.mc-fe-pathbar-input:focus { border-color:var(--accent); }
.mc-fe-branch { display:inline-flex; align-items:center; gap:4px; padding:3px 7px; font-size:11px; background:color-mix(in srgb, var(--accent) 14%, transparent); color:var(--accent); border-radius:10px; font-family:var(--mono, ui-monospace, monospace); flex-shrink:0; }
.mc-fe-branch-count { color:var(--warn); }
.mc-fe-breadcrumbs { display:flex; flex:1; align-items:center; gap:1px; font-size:13px; color:var(--muted); cursor:text; overflow-x:auto; scrollbar-width:none; padding:5px 8px; border-radius:6px; border:1px solid var(--border); min-width:0; background:var(--card); }
.mc-fe-breadcrumbs::-webkit-scrollbar { display:none; }
.mc-fe-breadcrumbs:hover { border-color:var(--muted); }
.mc-fe-bc { padding:1px 2px; border-radius:3px; cursor:pointer; white-space:nowrap; font-family:var(--mono, ui-monospace, monospace); }
.mc-fe-bc:hover { color:var(--text); background:color-mix(in srgb, var(--text) 10%, transparent); }
.mc-fe-bc-sep { color:var(--muted); opacity:.4; font-family:var(--mono, ui-monospace, monospace); }
.mc-fe-split { flex:1; display:flex; min-height:0; overflow:hidden; }
/* Narrow: the tree becomes a drawer under a top bar, so the row turns into a
   column and the divider turns with it. The left pane's border-right would draw
   a stray vertical rule once stacked. */
.mc-fe-split.is-stacked { flex-direction:column; }
/* Stacked, the tree must FILL the column and scroll inside it. Left non-shrinking
   it takes its CONTENT height instead -- measured 1553px inside a 718px split --
   so its own overflow-y never engages and the split's hidden overflow clips the
   rest with no way to reach it. A zero min-height is required for the same
   reason: a flex item will not otherwise shrink below its content. */
.mc-fe-split.is-stacked > .mc-fe-left { flex:1 1 0%; min-height:0; }
.mc-fe-split.is-stacked > .mc-fe-left { border-right:none; border-bottom:1px solid var(--border); }
/* Hidden rather than unmounted: the pane keeps its scroll position across a
   rotation that crosses the breakpoint. */
.mc-fe-left.is-hidden, .mc-fe-right.is-hidden { display:none; }
.mc-fe-treebar { flex-shrink:0; justify-content:flex-start; gap:6px; width:100%; border-radius:0; border-left:none; border-right:none; border-top:none; }
.mc-fe-left { flex-shrink:0; min-height:0; overflow-y:auto; overflow-x:hidden; border-right:1px solid var(--border); background:var(--bg); }
.mc-fe-resizer { width:4px; flex-shrink:0; background:transparent; cursor:col-resize; transition:background .15s; }
.mc-fe-resizer:hover { background:var(--accent); opacity:.5; }
.mc-fe-right { flex:1; min-width:0; min-height:0; display:flex; flex-direction:column; overflow:hidden; }
.mc-fe-tree { padding:6px 0; font-size:12px; }
.mc-fe-tree-row { display:flex; align-items:center; padding:2px 8px 2px 6px; cursor:pointer; user-select:none; line-height:18px; height:22px; white-space:nowrap; overflow:hidden; }
.mc-fe-tree-row:hover { background:color-mix(in srgb, var(--text) 7%, transparent); }
.mc-fe-tree-row.is-selected { background:color-mix(in srgb, var(--accent) 22%, transparent); color:var(--text); }
.mc-fe-tree-name { font-size:12px; overflow:hidden; text-overflow:ellipsis; }
.mc-fe-viewer-bar { display:flex; align-items:center; justify-content:space-between; padding:6px 10px; gap:10px; border-bottom:1px solid var(--border); background:var(--bg); flex-shrink:0; }
.mc-fe-viewer-title { display:flex; align-items:center; gap:4px; min-width:0; overflow:hidden; }
.mc-fe-viewer-filename { font-size:14px; font-weight:600; color:var(--text); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.mc-fe-viewer-actions { display:flex; gap:6px; align-items:center; flex-shrink:0; }
.mc-fe-viewer-meta { font-size:11px; color:var(--muted); white-space:nowrap; }
.mc-fe-iconbtn { background:transparent; border:1px solid transparent; color:var(--muted); cursor:pointer; padding:3px 6px; border-radius:4px; display:inline-flex; align-items:center; gap:4px; font-size:11px; }
.mc-fe-iconbtn:hover:not(:disabled) { color:var(--text); border-color:var(--border); background:var(--card); }
.mc-fe-iconbtn:disabled { opacity:.4; cursor:not-allowed; }
.mc-fe-viewer-body { flex:1; overflow:auto; min-height:0; padding:14px 18px; }
.mc-fe-viewer-body > * { font-size:unset; line-height:unset; }
.mc-fe-empty { display:flex; flex-direction:column; align-items:center; justify-content:center; height:100%; color:var(--muted); font-size:13px; }
.mc-fe-img-wrap { display:flex; align-items:center; justify-content:center; height:100%; padding:20px; }
.mc-fe-search { display:flex; flex-direction:column; height:100%; min-height:0; }
.mc-fe-search-bar { padding:8px 10px; border-bottom:1px solid var(--border); display:flex; gap:6px; align-items:center; background:var(--bg); }
.mc-fe-search-input { flex:1; min-width:0; background:var(--card); border:1px solid var(--border); color:var(--text); padding:6px 10px; font-size:13px; border-radius:5px; outline:none; }
.mc-fe-search-input:focus { border-color:var(--accent); }
.mc-fe-search-glob { width:140px; background:var(--card); border:1px solid var(--border); color:var(--text); padding:6px 8px; font-size:12px; border-radius:5px; outline:none; font-family:var(--mono, ui-monospace, monospace); }
.mc-fe-search-status { padding:5px 12px; font-size:11px; color:var(--muted); border-bottom:1px solid var(--border); }
.mc-fe-search-results { flex:1; overflow:auto; }
.mc-fe-search-row { padding:6px 12px; border-bottom:1px solid var(--border); cursor:pointer; }
.mc-fe-search-row:hover { background:color-mix(in srgb, var(--text) 6%, transparent); }
.mc-fe-search-file { font-size:12px; font-family:var(--mono, ui-monospace, monospace); color:var(--muted); display:flex; align-items:center; }
.mc-fe-search-preview { font-family:var(--mono, ui-monospace, monospace); font-size:11.5px; color:var(--text); white-space:pre; overflow:hidden; text-overflow:ellipsis; margin-top:2px; }
.mc-fe-ac { position:absolute; left:0; right:0; top:100%; margin-top:3px; background:var(--card); border:1px solid var(--border); border-radius:6px; box-shadow:0 6px 20px color-mix(in srgb, #000 35%, transparent); max-height:280px; overflow-y:auto; z-index:50; }
.mc-fe-ac-row { display:flex; align-items:center; gap:6px; padding:5px 10px; font-size:12px; cursor:pointer; user-select:none; white-space:nowrap; overflow:hidden; }
.mc-fe-ac-row:hover, .mc-fe-ac-row.is-active { background:color-mix(in srgb, var(--accent) 18%, transparent); }
.mc-fe-ac-name { color:var(--text); font-weight:500; }
.mc-fe-ac-path { color:var(--muted); font-size:11px; font-family:var(--mono, ui-monospace, monospace); margin-left:auto; padding-left:14px; overflow:hidden; text-overflow:ellipsis; max-width:60%; }
.mc-fe-ctx { position:fixed; min-width:200px; background:var(--card); border:1px solid var(--border); border-radius:6px; box-shadow:0 8px 24px color-mix(in srgb, #000 40%, transparent); z-index:100; padding:4px; }
.mc-fe-ctx-row { display:flex; align-items:center; gap:8px; padding:6px 10px; font-size:12px; color:var(--text); cursor:pointer; border-radius:4px; user-select:none; }
.mc-fe-ctx-row:hover { background:color-mix(in srgb, var(--accent) 22%, transparent); }
.mc-fe-menu { z-index:1000; min-width:200px; padding:4px; background:var(--card); color:var(--text); border:1px solid var(--border); border-radius:8px; box-shadow:0 8px 24px color-mix(in srgb, #000 22%, transparent); display:flex; flex-direction:column; font-size:12px; }
.mc-fe-menu-item { display:flex; align-items:center; gap:8px; padding:6px 8px; border:none; border-radius:5px; background:transparent; color:inherit; font:inherit; text-align:left; cursor:pointer; }
.mc-fe-menu-item:hover, .mc-fe-menu-item:focus-visible { background:color-mix(in srgb, var(--text) 9%, transparent); outline:none; }
`;
// src/lib/useScrollEdges.ts
/**
* Which edges of a horizontal scroller hide content, measured rather than
* inferred from a breakpoint — a strip inside a resizable pane overflows at
* widths the viewport knows nothing about.
*
* This exists because a scroller with a hidden scrollbar reads as COMPLETE: the
* row simply ends, and nothing says four of seventeen tabs are on screen. The
* caller paints an edge cue from these flags so the clipping is visible, which
* is the signal a horizontal overflow needs (a hidden scrollbar leaves none,
* and a tooltip or a scroll-position dot is not a substitute on touch).
*
* Physical `left`/`right`, not logical start/end: every shipped locale is LTR,
* so a logical mapping would be untested indirection.
*
* Returns a CALLBACK ref, and that is load-bearing: the scroller can mount
* later than the component holding this hook — a strip that exists only below a
* breakpoint appears on a mid-session resize, long after mount. A mount-only
* effect would see a null node, attach nothing, and never run again, leaving the
* cues frozen while the reader scrolls. Binding from the ref callback attaches
* whenever the node arrives and detaches when it leaves.
*
* `remeasure` is for content changes no observer reports — the scroller keeps
* its own box while its children change, e.g. a tab appearing behind a flag.
*
* `attachContent` (the fourth slot) is for the AUTO-SIZED case `remeasure`
* cannot close: an auto-layout table's scrollWidth moves whenever its rows
* re-render wider or narrower — a filter emptying rows, a locale switch
* re-labelling every header, a webfont finishing load — none of which resize
* the scroller's own box or announce themselves to the caller. The content
* node's border-box IS the overflow driver, so observing it subsumes all of
* them in one mechanism. Optional: scrollers whose overflow only moves with
* their own box (fixed-layout tables, inline chip strips that call
* `remeasure` on data changes) never attach one.
*/
function useScrollEdges() {
	const elRef = useRef(null);
	const detachRef = useRef(null);
	const detachContentRef = useRef(null);
	const [edges, setEdges] = useState({
		left: false,
		right: false
	});
	const remeasure = useCallback(() => {
		const el = elRef.current;
		if (!el) return;
		const hidden = el.scrollWidth - el.clientWidth;
		const scrolled = el.scrollLeft;
		const next = {
			left: scrolled > 1,
			right: hidden - scrolled > 1
		};
		setEdges((prev) => prev.left === next.left && prev.right === next.right ? prev : next);
	}, []);
	return [
		useCallback((node) => {
			detachRef.current?.();
			detachRef.current = null;
			elRef.current = node;
			if (!node) {
				setEdges({
					left: false,
					right: false
				});
				return;
			}
			remeasure();
			node.addEventListener("scroll", remeasure, { passive: true });
			const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(remeasure);
			ro?.observe(node);
			detachRef.current = () => {
				node.removeEventListener("scroll", remeasure);
				ro?.disconnect();
			};
		}, [remeasure]),
		edges,
		remeasure,
		useCallback((node) => {
			detachContentRef.current?.();
			detachContentRef.current = null;
			if (!node) return;
			remeasure();
			const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(remeasure);
			ro?.observe(node);
			detachContentRef.current = () => ro?.disconnect();
		}, [remeasure])
	];
}
/**
* Translates an unmodified vertical wheel into horizontal scroll on a strip
* with a hidden scrollbar. Mixed, modified, already-cancelled or unusable
* events are left alone so an ancestor can scroll.
*
* The native listener must be non-passive: React 18 registers `onWheel` as
* passive at the root, where `preventDefault()` has no effect. The stable
* callback ref detaches from the previous node before attaching to the next.
*/
function useWheelToHorizontal() {
	const detachRef = useRef(null);
	return useCallback((node) => {
		detachRef.current?.();
		detachRef.current = null;
		if (!node) return;
		const onWheel = (e) => {
			if (e.defaultPrevented) return;
			if (e.ctrlKey || e.shiftKey || e.altKey || e.metaKey) return;
			if (e.deltaY === 0 || e.deltaX !== 0) return;
			const max = node.scrollWidth - node.clientWidth;
			if (max <= 0) return;
			const scale = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? node.clientWidth : 1;
			const current = node.scrollLeft;
			const target = Math.min(Math.max(current + e.deltaY * scale, 0), max);
			if (target === current) return;
			node.scrollLeft = target;
			e.preventDefault();
		};
		node.addEventListener("wheel", onWheel, { passive: false });
		detachRef.current = () => node.removeEventListener("wheel", onWheel);
	}, []);
}
// src/i18n.ts
/**
* The app's own strings. A bundle cannot read the dashboard's catalogs (those
* belong to the host and change with it), so every locale the dashboard ships is
* bundled here and looked up against the host's active language.
*
* Lookup order: the exact locale (`pt`, `zh-CN`), then its base language, then
* English, then the key itself, so a missing translation shows English rather
* than nothing. `{{name}}` placeholders are filled from `vars`; one with no value
* is left as written. With a numeric `count`, the CLDR plural form of that
* locale is tried first (`result_count_one`, `_few`, `_many`, `_other`), the
* same key shape the dashboard's catalogs use.
*
* `t` reads the language at call time. The root component subscribes to the
* host's language changes (`useLanguageGeneration`), and its re-render reaches
* every child, so a language switch repaints the page without a reload.
*/
var CATALOGS = {
	bn: {
		fileExplorerPage: {
			"backend_not_reachable": "ব্যাকএন্ডে পৌঁছানো যাচ্ছে না:",
			"cannot_open_folder": "এই ফোল্ডারটি খোলা যায়নি",
			"folder_unavailable": "এই ফোল্ডারটি উপলব্ধ নেই।",
			"go_to_parent_folder": "প্যারেন্ট ফোল্ডারে যান",
			"chat_about_this": "এটি নিয়ে চ্যাট করুন",
			"copy_path": "পাথ কপি করুন",
			"open": "খুলুন",
			"open_as_workspace_root": "ওয়ার্কস্পেস রুট হিসেবে খুলুন",
			"resize_panel": "প্যানেলের আকার বদলান",
			"reveal_parent": "প্যারেন্ট ফোল্ডার দেখান",
			"link_open_failed": "{{path}} খোলা যায়নি।",
			"link_target_missing": "এই পাথে কোনো ফাইল বা ফোল্ডার নেই।",
			"link_target_relative": "{{path}} খোলা যায় না: লিংকের জন্য সম্পূর্ণ পাথ লাগে।",
			"link_target_unsupported": "এই পাথটি কোনো ফাইল বা ফোল্ডার নয়।"
		},
		fileViewer: {
			"binary_file": "বাইনারি ফাইল",
			"copy_path": "পাথ কপি করুন",
			"copy_path_2": "পাথ কপি করো: {{path}}",
			"download": "ডাউনলোড",
			"more_options": "আরও অপশন",
			"reload": "রিলোড",
			"select_a_file_to_view": "দেখার জন্য একটি ফাইল নির্বাচন করুন",
			"sensitive_file_avoid_sharing_your_screen_while_v": "সংবেদনশীল ফাইল — ক্রেডেনশিয়াল দেখার সময় স্ক্রিন শেয়ার করা এড়িয়ে চলুন",
			"tip_ctrl_cmd_f_to_search": "টিপ: সার্চ করতে Ctrl/Cmd+F চাপুন",
			"truncated": "· সংক্ষিপ্ত করা হয়েছে"
		},
		manifest: {
			"description": "ড্যাশবোর্ড ছেড়ে না গিয়েই Kiro Crew যে মেশিনে চলছে সেখানকার ফাইল ঘেঁটে দেখো ও পড়ো। কয়েকটি ফাইল একসঙ্গে ট্যাবে খোলা রাখো, প্রতিটি ফাইলের পাশে তার git অবস্থা দেখতে দেখতে ডিরেক্টরি ট্রি ঘুরে দেখো, পুরো একটি ফোল্ডারে কোনো লেখা খোঁজো, আর markdown কাঁচা সোর্স নয় — সাজানো অবস্থায় পড়ো। এটি ইচ্ছে করেই শুধু-পঠন: ফাইল খোলে ও খোঁজে, কিন্তু কখনও সম্পাদনা, সরানো বা মোছে না; আর কেবল তোমার হোম ডিরেক্টরি, সিস্টেমের টেম্প ডিরেক্টরি, এবং Linux ও macOS-এ /home, /opt ও /workplace পর্যন্ত পৌঁছাতে পারে।",
			"display_name": "ফাইল",
			"use_case_1": "পেজকে লেখার অনুমতি না দিয়েই gateway host-এর file পড়ুন, খুঁজুন, preview বা download করুন এবং সেগুলো নিয়ে আলোচনা করুন।",
			"configuration_1": "অ্যাপটি চালু করে path bar থেকে একটি অনুমোদিত directory খুলুন; কোনো account লাগে না, আর git বা ripgrep শুধু ঐচ্ছিক status ও উন্নত search যোগ করে।",
			"highlight_1": "শুধু-পঠন: ফাইল খোলে ও খোঁজে, কখনও লেখে, সরায় বা মোছে না",
			"highlight_2": "সিনট্যাক্স হাইলাইটিং সহ একসঙ্গে অনেক ফাইল ট্যাবে খোলা থাকে",
			"highlight_3": "Markdown ফাইল কাঁচা সোর্সের বদলে সাজানো লেখা হিসেবে দেখা যায়",
			"highlight_4": "ডিরেক্টরি ট্রিতে প্রতিটি ফাইলের git অবস্থা পাশেই দেখা যায়",
			"highlight_5": "পুরো একটি ডিরেক্টরিতে খোঁজো — লাইন ধরে মিল আর আশপাশের প্রিভিউ সহ",
			"highlight_6": "পৌঁছানোর পথ শুধু তোমার হোম ডিরেক্টরি, সিস্টেমের টেম্প ডিরেক্টরি, এবং Linux ও macOS-এ /home, /opt ও /workplace পর্যন্ত — বাইরে যাওয়া symlink গ্রহণ করা হয় না",
			"page_label": "ফাইল"
		},
		pathBar: {
			"click_to_edit_path": "পাথ সম্পাদনা করতে ক্লিক করুন",
			"folder_path": "ফোল্ডার পাথ",
			"path_to_folder": "/path/to/folder",
			"refresh_folder": "ফোল্ডার রিফ্রেশ করো"
		},
		searchPanel: {
			"capped": "(সীমিত)",
			"close_esc": "বন্ধ করুন (Esc)",
			"close_search": "সার্চ বন্ধ করুন",
			"comma_separated_glob_patterns": "কমা দিয়ে আলাদা করা glob প্যাটার্ন",
			"glob_e_g_md": "glob (যেমন *.md)",
			"glob_filter_comma_separated_patterns": "glob ফিল্টার (কমা দিয়ে আলাদা করা প্যাটার্ন)",
			"no_matches": "কোনো মিল নেই",
			"search_failed": "খোঁজা যায়নি",
			"search_in": "{{name}}-এ খোঁজো",
			"search_in_2": "{{name}}-এ খোঁজো...",
			"searching": "খোঁজা হচ্ছে..."
		},
		tabStrip: {
			"close_file_tab": "ফাইল ট্যাব বন্ধ করুন",
			"close_workspace_tab": "ওয়ার্কস্পেস ট্যাব বন্ধ করুন",
			"new_workspace_tab": "নতুন ওয়ার্কস্পেস ট্যাব",
			"new_workspace_tab_ctrl_cmd_t": "নতুন ওয়ার্কস্পেস ট্যাব (Ctrl/Cmd+T)",
			"rename_workspace_tab": "ওয়ার্কস্পেস ট্যাবের নাম বদলান"
		},
		treeNode: { "loading": "লোড হচ্ছে..." },
		common: {
			"app_disabled_title": "এই অ্যাপটি বন্ধ করা আছে",
			"app_disabled_hint": "এটি ব্যবহার করতে অ্যাপস থেকে এই অ্যাপটি চালু করুন।",
			"apps": "অ্যাপস",
			"result_count_one": "{{count}}টি ফলাফল",
			"result_count_other": "{{count}}টি ফলাফল",
			"dismiss": "খারিজ করুন"
		}
	},
	de: {
		fileExplorerPage: {
			"backend_not_reachable": "Backend nicht erreichbar:",
			"cannot_open_folder": "Ordner kann nicht geöffnet werden",
			"folder_unavailable": "Dieser Ordner ist nicht verfügbar.",
			"go_to_parent_folder": "Zum übergeordneten Ordner",
			"chat_about_this": "Darüber chatten",
			"copy_path": "Pfad kopieren",
			"open": "Öffnen",
			"open_as_workspace_root": "Als Workspace-Wurzel öffnen",
			"resize_panel": "Größe des Panels ändern",
			"reveal_parent": "Übergeordnetes Element anzeigen",
			"link_open_failed": "{{path}} konnte nicht geöffnet werden.",
			"link_target_missing": "Unter diesem Pfad gibt es keine Datei und keinen Ordner.",
			"link_target_relative": "{{path}} lässt sich nicht öffnen: Links brauchen einen vollständigen Pfad.",
			"link_target_unsupported": "Dieser Pfad ist weder eine Datei noch ein Ordner."
		},
		fileViewer: {
			"binary_file": "Binärdatei",
			"copy_path": "Pfad kopieren",
			"copy_path_2": "Pfad kopieren: {{path}}",
			"download": "Herunterladen",
			"more_options": "Weitere Optionen",
			"reload": "Neu laden",
			"select_a_file_to_view": "Wählen Sie eine Datei zur Anzeige",
			"sensitive_file_avoid_sharing_your_screen_while_v": "Sensible Datei — vermeiden Sie das Teilen Ihres Bildschirms, während Sie Anmeldedaten ansehen",
			"tip_ctrl_cmd_f_to_search": "Tipp: Strg/Cmd+F zum Suchen",
			"truncated": "· gekürzt"
		},
		manifest: {
			"description": "Durchsuche und lies Dateien auf dem Rechner, der Kiro Crew ausführt, ohne das Dashboard zu verlassen. Halte mehrere Dateien in Tabs offen, gehe den Verzeichnisbaum durch, in dem neben jeder Datei ihr Git-Status steht, suche in einem ganzen Ordner nach einer Zeichenfolge und lies Markdown gerendert statt im Rohtext. Der Zugriff ist bewusst nur lesend: Dateien werden geöffnet und durchsucht, aber nie bearbeitet, verschoben oder gelöscht, und erreichbar sind nur dein Home-Verzeichnis, das temporäre Systemverzeichnis und unter Linux und macOS die Bäume /home, /opt und /workplace.",
			"display_name": "Dateien",
			"highlight_1": "Schreibgeschützt: öffnet und durchsucht Dateien und schreibt, verschiebt oder löscht sie nie",
			"highlight_2": "Mehrere Dateien gleichzeitig in Tabs offen, mit Syntaxhervorhebung",
			"highlight_3": "Markdown-Dateien werden als formatierter Text statt als Rohquelle dargestellt",
			"highlight_4": "Der Verzeichnisbaum zeigt den Git-Status jeder Datei direkt an",
			"highlight_5": "Suche über ein Verzeichnis hinweg mit Treffern auf Zeilenebene und umgebender Vorschau",
			"highlight_6": "Erreichbare Pfade sind auf dein Home-Verzeichnis, das temporäre Systemverzeichnis und unter Linux und macOS /home, /opt und /workplace begrenzt — Symlinks nach außen werden abgelehnt",
			"page_label": "Dateien",
			"use_case_1": "Lies, durchsuche, zeige, lade oder besprich Dateien auf dem Gateway-Host, ohne der Seite Schreibzugriff zu gewähren.",
			"configuration_1": "Aktiviere die App und öffne über die Pfadleiste ein erlaubtes Verzeichnis; ein Konto ist nicht erforderlich, und Git oder ripgrep ergänzen nur optionale Status- und Suchfunktionen."
		},
		pathBar: {
			"click_to_edit_path": "Klicken, um den Pfad zu bearbeiten",
			"folder_path": "Ordnerpfad",
			"path_to_folder": "/pfad/zum/ordner",
			"refresh_folder": "Ordner aktualisieren"
		},
		searchPanel: {
			"capped": "(begrenzt)",
			"close_esc": "Schließen (Esc)",
			"close_search": "Suche schließen",
			"comma_separated_glob_patterns": "Kommagetrennte Glob-Muster",
			"glob_e_g_md": "Glob (z. B. *.md)",
			"glob_filter_comma_separated_patterns": "Glob-Filter (kommagetrennte Muster)",
			"no_matches": "Keine Treffer",
			"search_failed": "Suche fehlgeschlagen",
			"search_in": "In {{name}} suchen",
			"search_in_2": "In {{name}} suchen...",
			"searching": "Suche läuft..."
		},
		tabStrip: {
			"close_file_tab": "Datei-Tab schließen",
			"close_workspace_tab": "Workspace-Tab schließen",
			"new_workspace_tab": "Neuer Workspace-Tab",
			"new_workspace_tab_ctrl_cmd_t": "Neuer Workspace-Tab (Strg/Cmd+T)",
			"rename_workspace_tab": "Workspace-Tab umbenennen"
		},
		treeNode: { "loading": "wird geladen…" },
		common: {
			"app_disabled_title": "Diese App ist deaktiviert",
			"app_disabled_hint": "Aktivieren Sie diese App unter „Apps“, um sie zu verwenden.",
			"apps": "Apps",
			"result_count_one": "{{count}} Ergebnis",
			"result_count_other": "{{count}} Ergebnisse",
			"dismiss": "Schließen"
		}
	},
	en: {
		fileExplorerPage: {
			"backend_not_reachable": "Backend not reachable:",
			"cannot_open_folder": "Cannot open this folder",
			"folder_unavailable": "This folder is unavailable.",
			"go_to_parent_folder": "Go to parent folder",
			"chat_about_this": "Chat about this",
			"copy_path": "Copy path",
			"open": "Open",
			"open_as_workspace_root": "Open as workspace root",
			"resize_panel": "Resize panel",
			"reveal_parent": "Reveal parent",
			"link_open_failed": "Couldn’t open {{path}}.",
			"link_target_missing": "There is no file or folder at that path.",
			"link_target_relative": "Can’t open {{path}}: links need a full path.",
			"link_target_unsupported": "That path is not a file or a folder."
		},
		fileViewer: {
			"binary_file": "Binary file",
			"copy_path": "Copy path",
			"download": "Download",
			"reload": "Reload",
			"select_a_file_to_view": "Select a file to view",
			"sensitive_file_avoid_sharing_your_screen_while_v": "Sensitive file — avoid sharing your screen while viewing credentials",
			"tip_ctrl_cmd_f_to_search": "Tip: Ctrl/Cmd+F to search",
			"truncated": "· truncated",
			"copy_path_2": "Copy path: {{path}}",
			"more_options": "More options"
		},
		manifest: {
			"description": "Browse and read files on the machine running Kiro Crew without leaving the dashboard. Keep several files open in tabs, walk the directory tree with each file's git status shown beside it, search a whole folder for a string, and read markdown rendered rather than raw. It is read-only by design: it opens and searches files but never edits, moves, or deletes them, and it can only reach your home directory, the system temp directory, and on Linux and macOS the /home, /opt, and /workplace trees.",
			"display_name": "Files",
			"highlight_1": "Read-only: opens and searches files, and never writes, moves, or deletes them",
			"highlight_2": "Multiple files open at once in tabs, with syntax highlighting",
			"highlight_3": "Markdown files render as formatted text instead of raw source",
			"highlight_4": "Directory tree shows each file's git status inline",
			"highlight_5": "Search across a directory with line-level matches and surrounding preview",
			"highlight_6": "Reachable paths are your home directory, the system temp directory, and on Linux and macOS /home /opt, and /workplace — symlinks out are refused",
			"page_label": "Files",
			"use_case_1": "Read, search, preview, download, or discuss files on the gateway host without granting the page write access.",
			"configuration_1": "Enable the app and open an allowed directory from the path bar; no account is required, and git or ripgrep only add optional status and search enhancements."
		},
		pathBar: {
			"click_to_edit_path": "Click to edit path",
			"folder_path": "Folder path",
			"path_to_folder": "/path/to/folder",
			"refresh_folder": "Refresh folder"
		},
		searchPanel: {
			"close_esc": "Close (Esc)",
			"close_search": "Close search",
			"comma_separated_glob_patterns": "Comma-separated glob patterns",
			"glob_e_g_md": "glob (e.g. *.md)",
			"glob_filter_comma_separated_patterns": "Glob filter (comma-separated patterns)",
			"no_matches": "No matches",
			"capped": "(capped)",
			"search_failed": "search failed",
			"search_in": "Search in {{name}}",
			"search_in_2": "Search in {{name}}...",
			"searching": "searching..."
		},
		tabStrip: {
			"close_file_tab": "Close file tab",
			"close_workspace_tab": "Close workspace tab",
			"new_workspace_tab": "New workspace tab",
			"new_workspace_tab_ctrl_cmd_t": "New workspace tab (Ctrl/Cmd+T)",
			"rename_workspace_tab": "Rename workspace tab"
		},
		treeNode: { "loading": "loading..." },
		common: {
			"app_disabled_title": "This app is disabled",
			"app_disabled_hint": "Enable this app from Apps to use it.",
			"apps": "Apps",
			"result_count_one": "{{count}} result",
			"result_count_other": "{{count}} results",
			"dismiss": "Dismiss"
		}
	},
	es: {
		fileExplorerPage: {
			"backend_not_reachable": "Backend no accesible:",
			"cannot_open_folder": "No se puede abrir esta carpeta",
			"folder_unavailable": "Esta carpeta no está disponible.",
			"go_to_parent_folder": "Ir a la carpeta principal",
			"chat_about_this": "Chatear sobre esto",
			"copy_path": "Copiar ruta",
			"open": "Abrir",
			"open_as_workspace_root": "Abrir como raíz del espacio de trabajo",
			"resize_panel": "Redimensionar panel",
			"reveal_parent": "Mostrar la carpeta superior",
			"link_open_failed": "No se pudo abrir {{path}}.",
			"link_target_missing": "No hay ningún archivo ni carpeta en esa ruta.",
			"link_target_relative": "No se puede abrir {{path}}: los enlaces necesitan una ruta completa.",
			"link_target_unsupported": "Esa ruta no es un archivo ni una carpeta."
		},
		fileViewer: {
			"binary_file": "Archivo binario",
			"copy_path": "Copiar ruta",
			"copy_path_2": "Copiar ruta: {{path}}",
			"download": "Descargar",
			"more_options": "Más opciones",
			"reload": "Recargar",
			"select_a_file_to_view": "Selecciona un archivo para verlo",
			"sensitive_file_avoid_sharing_your_screen_while_v": "Archivo sensible — evita compartir tu pantalla mientras ves credenciales",
			"tip_ctrl_cmd_f_to_search": "Consejo: Ctrl/Cmd+F para buscar",
			"truncated": "· truncado"
		},
		manifest: {
			"description": "Explora y lee archivos en la máquina que ejecuta Kiro Crew sin salir del panel. Mantén varios archivos abiertos en pestañas, recorre el árbol de directorios con el estado de git de cada archivo al lado, busca una cadena en toda una carpeta y lee el markdown renderizado en lugar del código fuente. Es de solo lectura por diseño: abre y busca archivos, pero nunca los edita, los mueve ni los elimina, y solo puede llegar a tu directorio home, al directorio temporal del sistema y, en Linux y macOS, a los árboles /home, /opt y /workplace.",
			"display_name": "Archivos",
			"highlight_1": "Solo lectura: abre y busca archivos, y nunca los escribe, los mueve ni los elimina",
			"highlight_2": "Varios archivos abiertos a la vez en pestañas, con resaltado de sintaxis",
			"highlight_3": "Los archivos Markdown se muestran como texto con formato en lugar del código fuente",
			"highlight_4": "El árbol de directorios muestra el estado de git de cada archivo en línea",
			"highlight_5": "Busca en un directorio con coincidencias por línea y una vista previa del contexto",
			"highlight_6": "Las rutas accesibles se limitan a tu directorio home, al directorio temporal del sistema y, en Linux y macOS, a /home, /opt y /workplace — los enlaces simbólicos hacia fuera se rechazan",
			"page_label": "Archivos",
			"use_case_1": "Lee, busca, previsualiza, descarga o comenta archivos del host del gateway sin conceder a la página acceso de escritura.",
			"configuration_1": "Activa la app y abre un directorio permitido desde la barra de ruta; no se requiere ninguna cuenta, y Git o ripgrep solo añaden funciones opcionales de estado y búsqueda."
		},
		pathBar: {
			"click_to_edit_path": "Clic para editar la ruta",
			"folder_path": "Ruta de la carpeta",
			"path_to_folder": "/path/to/folder",
			"refresh_folder": "Actualizar carpeta"
		},
		searchPanel: {
			"capped": "(limitado)",
			"close_esc": "Cerrar (Esc)",
			"close_search": "Cerrar la búsqueda",
			"comma_separated_glob_patterns": "Patrones glob separados por comas",
			"glob_e_g_md": "glob (p. ej. *.md)",
			"glob_filter_comma_separated_patterns": "Filtro glob (patrones separados por comas)",
			"no_matches": "Sin coincidencias",
			"search_failed": "falló la búsqueda",
			"search_in": "Buscar en {{name}}",
			"search_in_2": "Buscar en {{name}}…",
			"searching": "buscando…"
		},
		tabStrip: {
			"close_file_tab": "Cerrar la pestaña de archivo",
			"close_workspace_tab": "Cerrar la pestaña del espacio de trabajo",
			"new_workspace_tab": "Nueva pestaña de espacio de trabajo",
			"new_workspace_tab_ctrl_cmd_t": "Nueva pestaña de espacio de trabajo (Ctrl/Cmd+T)",
			"rename_workspace_tab": "Renombrar la pestaña del espacio de trabajo"
		},
		treeNode: { "loading": "cargando..." },
		common: {
			"app_disabled_title": "Esta app está desactivada",
			"app_disabled_hint": "Activa esta app desde Apps para usarla.",
			"apps": "Apps",
			"result_count_many": "{{count}} resultados",
			"result_count_one": "{{count}} resultado",
			"result_count_other": "{{count}} resultados",
			"dismiss": "Descartar"
		}
	},
	fr: {
		fileExplorerPage: {
			"backend_not_reachable": "Backend inaccessible :",
			"cannot_open_folder": "Impossible d’ouvrir ce dossier",
			"folder_unavailable": "Ce dossier n’est pas disponible.",
			"go_to_parent_folder": "Aller au dossier parent",
			"chat_about_this": "Discuter de ceci",
			"copy_path": "Copier le chemin",
			"open": "Ouvrir",
			"open_as_workspace_root": "Ouvrir comme racine de l'espace de travail",
			"resize_panel": "Redimensionner le panneau",
			"reveal_parent": "Afficher le parent",
			"link_open_failed": "Impossible d’ouvrir {{path}}.",
			"link_target_missing": "Il n’y a aucun fichier ni dossier à ce chemin.",
			"link_target_relative": "Impossible d’ouvrir {{path}} : les liens nécessitent un chemin complet.",
			"link_target_unsupported": "Ce chemin n’est ni un fichier ni un dossier."
		},
		fileViewer: {
			"binary_file": "Fichier binaire",
			"copy_path": "Copier le chemin",
			"copy_path_2": "Copier le chemin : {{path}}",
			"download": "Télécharger",
			"more_options": "Plus d'options",
			"reload": "Recharger",
			"select_a_file_to_view": "Sélectionnez un fichier à afficher",
			"sensitive_file_avoid_sharing_your_screen_while_v": "Fichier sensible — évitez de partager votre écran lors de la consultation d'identifiants",
			"tip_ctrl_cmd_f_to_search": "Astuce : Ctrl/Cmd+F pour rechercher",
			"truncated": "· tronqué"
		},
		manifest: {
			"description": "Parcours et lis les fichiers de la machine qui exécute Kiro Crew sans quitter le tableau de bord. Garde plusieurs fichiers ouverts dans des onglets, explore l’arborescence avec le statut git de chaque fichier affiché à côté, cherche une chaîne dans tout un dossier et lis le markdown rendu plutôt que brut. Il est en lecture seule par conception : il ouvre les fichiers et y effectue des recherches, mais ne les modifie, déplace ni supprime jamais, et il ne peut atteindre que ton répertoire personnel, le répertoire temporaire du système et, sous Linux et macOS, les arborescences /home, /opt et /workplace.",
			"display_name": "Fichiers",
			"highlight_1": "Lecture seule : ouvre les fichiers et y effectue des recherches, sans jamais les écrire, les déplacer ni les supprimer",
			"highlight_2": "Plusieurs fichiers ouverts en même temps dans des onglets, avec coloration syntaxique",
			"highlight_3": "Les fichiers Markdown s’affichent en texte mis en forme au lieu du source brut",
			"highlight_4": "L’arborescence affiche le statut git de chaque fichier en ligne",
			"highlight_5": "Recherche dans un dossier entier, avec correspondances à la ligne et aperçu du contexte",
			"highlight_6": "Les chemins accessibles sont limités à ton répertoire personnel, au répertoire temporaire du système et, sous Linux et macOS, à /home, /opt et /workplace — les liens symboliques qui en sortent sont refusés",
			"page_label": "Fichiers",
			"use_case_1": "Lis, recherche, prévisualise, télécharge ou discute des fichiers de l'hôte de la passerelle sans accorder d'accès en écriture à la page.",
			"configuration_1": "Active l'app et ouvre un dossier autorisé depuis la barre de chemin ; aucun compte n'est requis, et Git ou ripgrep ajoutent seulement des fonctions facultatives d'état et de recherche."
		},
		pathBar: {
			"click_to_edit_path": "Cliquer pour modifier le chemin",
			"folder_path": "Chemin du dossier",
			"path_to_folder": "/path/to/folder",
			"refresh_folder": "Actualiser le dossier"
		},
		searchPanel: {
			"capped": "(tronqué)",
			"close_esc": "Fermer (Échap)",
			"close_search": "Fermer la recherche",
			"comma_separated_glob_patterns": "Motifs glob séparés par des virgules",
			"glob_e_g_md": "glob (ex. *.md)",
			"glob_filter_comma_separated_patterns": "Filtre glob (motifs séparés par des virgules)",
			"no_matches": "Aucun résultat",
			"search_failed": "échec de la recherche",
			"search_in": "Rechercher dans {{name}}",
			"search_in_2": "Rechercher dans {{name}}...",
			"searching": "recherche..."
		},
		tabStrip: {
			"close_file_tab": "Fermer l'onglet de fichier",
			"close_workspace_tab": "Fermer l'onglet d'espace de travail",
			"new_workspace_tab": "Nouvel onglet d'espace de travail",
			"new_workspace_tab_ctrl_cmd_t": "Nouvel onglet d'espace de travail (Ctrl/Cmd+T)",
			"rename_workspace_tab": "Renommer l'onglet d'espace de travail"
		},
		treeNode: { "loading": "chargement..." },
		common: {
			"app_disabled_title": "Cette application est désactivée",
			"app_disabled_hint": "Activez cette application depuis Applications pour l’utiliser.",
			"apps": "Applications",
			"result_count_many": "{{count}} résultats",
			"result_count_one": "{{count}} résultat",
			"result_count_other": "{{count}} résultats",
			"dismiss": "Ignorer"
		}
	},
	hi: {
		fileExplorerPage: {
			"backend_not_reachable": "बैकएंड तक पहुँच नहीं:",
			"cannot_open_folder": "यह फ़ोल्डर नहीं खुल सका",
			"folder_unavailable": "यह फ़ोल्डर उपलब्ध नहीं है।",
			"go_to_parent_folder": "मूल फ़ोल्डर पर जाएँ",
			"chat_about_this": "इस पर चैट करें",
			"copy_path": "पथ कॉपी करें",
			"open": "खोलें",
			"open_as_workspace_root": "वर्कस्पेस रूट के रूप में खोलें",
			"resize_panel": "पैनल का आकार बदलें",
			"reveal_parent": "पैरेंट दिखाएँ",
			"link_open_failed": "{{path}} नहीं खोला जा सका।",
			"link_target_missing": "इस पथ पर कोई फ़ाइल या फ़ोल्डर नहीं है।",
			"link_target_relative": "{{path}} नहीं खोला जा सकता: लिंक के लिए पूर्ण पथ ज़रूरी है।",
			"link_target_unsupported": "यह पथ कोई फ़ाइल या फ़ोल्डर नहीं है।"
		},
		fileViewer: {
			"binary_file": "बाइनरी फ़ाइल",
			"copy_path": "पथ कॉपी करें",
			"copy_path_2": "पाथ कॉपी करो: {{path}}",
			"download": "डाउनलोड करें",
			"more_options": "अधिक विकल्प",
			"reload": "रीलोड करें",
			"select_a_file_to_view": "देखने के लिए कोई फ़ाइल चुनें",
			"sensitive_file_avoid_sharing_your_screen_while_v": "संवेदनशील फ़ाइल — क्रेडेंशियल देखते समय अपनी स्क्रीन साझा करने से बचें",
			"tip_ctrl_cmd_f_to_search": "सुझाव: खोजने के लिए Ctrl/Cmd+F",
			"truncated": "· छोटा किया गया"
		},
		manifest: {
			"description": "डैशबोर्ड छोड़े बिना Kiro Crew चला रही मशीन की फ़ाइलें ब्राउज़ करो और पढ़ो। कई फ़ाइलें टैब में खुली रखो, डायरेक्टरी ट्री में हर फ़ाइल की git स्थिति साथ में देखते हुए घूमो, पूरे फ़ोल्डर में कोई स्ट्रिंग खोजो, और markdown को कच्चे रूप की जगह रेंडर होकर पढ़ो। यह डिज़ाइन से ही रीड-ओनली है: यह फ़ाइलें खोलता और खोजता है पर उन्हें कभी नहीं बदलता, हटाता या मिटाता, और यह सिर्फ़ तुम्हारी होम डायरेक्टरी, सिस्टम की टेम्प डायरेक्टरी, और Linux व macOS पर /home, /opt और /workplace तक पहुँच सकता है।",
			"display_name": "फ़ाइलें",
			"use_case_1": "पेज को लिखने की अनुमति दिए बिना गेटवे होस्ट की फ़ाइलें पढ़ें, खोजें, उनका पूर्वावलोकन या डाउनलोड करें और उन पर चर्चा करें।",
			"configuration_1": "ऐप सक्षम करके path bar से कोई अनुमत डायरेक्टरी खोलें; अकाउंट की आवश्यकता नहीं है, और git या ripgrep केवल वैकल्पिक स्थिति और बेहतर खोज जोड़ते हैं।",
			"highlight_1": "रीड-ओनली: फ़ाइलें खोलता और खोजता है, और उन्हें कभी नहीं लिखता, हटाता या मिटाता",
			"highlight_2": "सिंटैक्स हाइलाइटिंग के साथ एक ही वक़्त कई फ़ाइलें टैब में खुलती हैं",
			"highlight_3": "Markdown फ़ाइलें कच्चे सोर्स की जगह फ़ॉर्मैट किए टेक्स्ट के रूप में रेंडर होती हैं",
			"highlight_4": "डायरेक्टरी ट्री हर फ़ाइल की git स्थिति साथ ही दिखाता है",
			"highlight_5": "पूरी डायरेक्टरी में खोजो, लाइन-स्तर के मैच और आस-पास का प्रीव्यू मिलता है",
			"highlight_6": "पहुँच वाले पाथ तुम्हारी होम डायरेक्टरी, सिस्टम की टेम्प डायरेक्टरी, और Linux व macOS पर /home, /opt और /workplace तक सीमित हैं — बाहर जाते सिमलिंक मना कर दिए जाते हैं",
			"page_label": "फ़ाइलें"
		},
		pathBar: {
			"click_to_edit_path": "पथ संपादित करने के लिए क्लिक करें",
			"folder_path": "फ़ोल्डर पथ",
			"path_to_folder": "/path/to/folder",
			"refresh_folder": "फ़ोल्डर रीफ़्रेश करो"
		},
		searchPanel: {
			"capped": "(सीमित)",
			"close_esc": "बंद करें (Esc)",
			"close_search": "खोज बंद करें",
			"comma_separated_glob_patterns": "कॉमा से अलग किए गए glob पैटर्न",
			"glob_e_g_md": "glob (उदा. *.md)",
			"glob_filter_comma_separated_patterns": "Glob फ़िल्टर (कॉमा से अलग किए गए पैटर्न)",
			"no_matches": "कोई मिलान नहीं",
			"search_failed": "खोज विफल",
			"search_in": "{{name}} में खोजो",
			"search_in_2": "{{name}} में खोजो...",
			"searching": "खोज हो रही है..."
		},
		tabStrip: {
			"close_file_tab": "फ़ाइल टैब बंद करें",
			"close_workspace_tab": "वर्कस्पेस टैब बंद करें",
			"new_workspace_tab": "नया वर्कस्पेस टैब",
			"new_workspace_tab_ctrl_cmd_t": "नया वर्कस्पेस टैब (Ctrl/Cmd+T)",
			"rename_workspace_tab": "वर्कस्पेस टैब का नाम बदलें"
		},
		treeNode: { "loading": "लोड हो रहा है..." },
		common: {
			"app_disabled_title": "यह ऐप अक्षम है",
			"app_disabled_hint": "इसका उपयोग करने के लिए इस ऐप को ऐप्स से सक्षम करें।",
			"apps": "ऐप",
			"result_count_one": "{{count}} परिणाम",
			"result_count_other": "{{count}} परिणाम",
			"dismiss": "खारिज करें"
		}
	},
	it: {
		fileExplorerPage: {
			"backend_not_reachable": "Backend non raggiungibile:",
			"cannot_open_folder": "Impossibile aprire questa cartella",
			"folder_unavailable": "Questa cartella non è disponibile.",
			"go_to_parent_folder": "Vai alla cartella principale",
			"chat_about_this": "Chatta su questo",
			"copy_path": "Copia percorso",
			"open": "Apri",
			"open_as_workspace_root": "Apri come radice del workspace",
			"resize_panel": "Ridimensiona il pannello",
			"reveal_parent": "Mostra l'elemento padre",
			"link_open_failed": "Impossibile aprire {{path}}.",
			"link_target_missing": "Non c’è nessun file o cartella in quel percorso.",
			"link_target_relative": "Impossibile aprire {{path}}: i link richiedono un percorso completo.",
			"link_target_unsupported": "Quel percorso non è né un file né una cartella."
		},
		fileViewer: {
			"binary_file": "File binario",
			"copy_path": "Copia percorso",
			"copy_path_2": "Copia percorso: {{path}}",
			"download": "Scarica",
			"more_options": "Altre opzioni",
			"reload": "Ricarica",
			"select_a_file_to_view": "Seleziona un file da visualizzare",
			"sensitive_file_avoid_sharing_your_screen_while_v": "File sensibile — evita di condividere lo schermo mentre visualizzi delle credenziali",
			"tip_ctrl_cmd_f_to_search": "Suggerimento: Ctrl/Cmd+F per cercare",
			"truncated": "· troncato"
		},
		manifest: {
			"description": "Sfoglia e leggi i file sulla macchina che esegue Kiro Crew senza uscire dalla dashboard. Tieni aperti più file in schede, percorri l’albero delle cartelle con accanto lo stato git di ciascun file, cerca una stringa in un’intera cartella e leggi il markdown formattato anziché grezzo. È di sola lettura per scelta: apre e cerca nei file ma non li modifica, non li sposta e non li elimina mai, e può raggiungere solo la tua home, la directory temporanea di sistema e, su Linux e macOS, gli alberi /home, /opt e /workplace.",
			"display_name": "File",
			"highlight_1": "Sola lettura: apre e cerca nei file, e non li scrive, sposta o elimina mai",
			"highlight_2": "Più file aperti contemporaneamente in schede, con evidenziazione della sintassi",
			"highlight_3": "I file Markdown vengono resi come testo formattato invece che come sorgente grezzo",
			"highlight_4": "L’albero delle cartelle mostra in linea lo stato git di ogni file",
			"highlight_5": "Cerca in tutta una cartella con corrispondenze riga per riga e anteprima del contesto",
			"highlight_6": "I percorsi raggiungibili si limitano alla tua home, alla directory temporanea di sistema e, su Linux e macOS, a /home, /opt e /workplace — i symlink che escono da lì vengono rifiutati",
			"page_label": "File",
			"use_case_1": "Leggi, cerca, visualizza in anteprima, scarica o discuti i file sull'host del gateway senza concedere alla pagina accesso in scrittura.",
			"configuration_1": "Attiva l'app e apri una directory consentita dalla barra del percorso; non serve un account e Git o ripgrep aggiungono solo funzioni opzionali per stato e ricerca."
		},
		pathBar: {
			"click_to_edit_path": "Clicca per modificare il percorso",
			"folder_path": "Percorso della cartella",
			"path_to_folder": "/percorso/della/cartella",
			"refresh_folder": "Aggiorna cartella"
		},
		searchPanel: {
			"capped": "(limitato)",
			"close_esc": "Chiudi (Esc)",
			"close_search": "Chiudi la ricerca",
			"comma_separated_glob_patterns": "Pattern glob separati da virgole",
			"glob_e_g_md": "glob (ad es. *.md)",
			"glob_filter_comma_separated_patterns": "Filtro glob (pattern separati da virgole)",
			"no_matches": "Nessuna corrispondenza",
			"search_failed": "ricerca non riuscita",
			"search_in": "Cerca in {{name}}",
			"search_in_2": "Cerca in {{name}}…",
			"searching": "ricerca in corso..."
		},
		tabStrip: {
			"close_file_tab": "Chiudi la scheda del file",
			"close_workspace_tab": "Chiudi la scheda del workspace",
			"new_workspace_tab": "Nuova scheda del workspace",
			"new_workspace_tab_ctrl_cmd_t": "Nuova scheda del workspace (Ctrl/Cmd+T)",
			"rename_workspace_tab": "Rinomina la scheda del workspace"
		},
		treeNode: { "loading": "caricamento..." },
		common: {
			"app_disabled_title": "Questa app è disattivata",
			"app_disabled_hint": "Attiva questa app da App per poterla usare.",
			"apps": "App",
			"result_count_many": "{{count}} risultati",
			"result_count_one": "{{count}} risultato",
			"result_count_other": "{{count}} risultati",
			"dismiss": "Ignora"
		}
	},
	ja: {
		fileExplorerPage: {
			"backend_not_reachable": "バックエンドに到達できません：",
			"cannot_open_folder": "このフォルダーを開けません",
			"folder_unavailable": "このフォルダーは利用できません。",
			"go_to_parent_folder": "親フォルダーへ移動",
			"chat_about_this": "これについてチャット",
			"copy_path": "パスをコピー",
			"open": "開く",
			"open_as_workspace_root": "ワークスペースルートとして開く",
			"resize_panel": "パネルサイズ変更",
			"reveal_parent": "親を表示",
			"link_open_failed": "「{{path}}」を開けませんでした。",
			"link_target_missing": "そのパスにはファイルもフォルダーもありません。",
			"link_target_relative": "「{{path}}」は開けません。リンクには完全なパスが必要です。",
			"link_target_unsupported": "そのパスはファイルでもフォルダーでもありません。"
		},
		fileViewer: {
			"binary_file": "バイナリファイル",
			"copy_path": "パスをコピー",
			"copy_path_2": "パスをコピー：{{path}}",
			"download": "ダウンロード",
			"more_options": "その他のオプション",
			"reload": "再読み込み",
			"select_a_file_to_view": "表示するファイルを選択",
			"sensitive_file_avoid_sharing_your_screen_while_v": "機密ファイル — 認証情報を表示しながら画面を共有しないでください",
			"tip_ctrl_cmd_f_to_search": "ヒント: Ctrl/Cmd+Fで検索",
			"truncated": "· 省略"
		},
		manifest: {
			"use_case_1": "ページに書き込みアクセスを与えず、ゲートウェイホスト上のファイルを読み取り、検索、プレビュー、ダウンロード、またはチャットで相談できます。",
			"configuration_1": "アプリを有効にし、パスバーから許可されたディレクトリを開きます。アカウントは不要で、git または ripgrep は任意のステータス表示と検索機能を追加するだけです。",
			"description": "Kiro Crewが実行されているマシン上のファイルを閲覧して読み込み、ダッシュボードを離れる必要がありません。複数のファイルをタブで開いたままにして、各ファイルのGitステータスを表示させながらディレクトリツリーを操作して、フォルダー全体の文字列を検索して、マークダウンをレンダリングされたものとして読み込みます。設計上は読み取り専用です。ファイルを開いて検索しますが、決して編集、移動、削除することはなく、ホームディレクトリ、システムの一時ディレクトリ、および Linux と macOS では /home、/opt、/workplace のツリーのみにアクセスできます。",
			"display_name": "ファイル",
			"highlight_1": "読み取り専用：ファイルを開いて検索しますが、決して書き込み、移動、削除しません",
			"highlight_2": "複数のファイルが同時にタブで開かれ、構文ハイライトが表示",
			"highlight_3": "Markdown ファイルを、未加工のソースではなく整形済みテキストとして表示",
			"highlight_4": "ディレクトリツリーは各ファイルのGitステータスをインラインで表示",
			"highlight_5": "マッチレベルと周辺プレビューを含むディレクトリ全体で検索",
			"highlight_6": "到達可能なパスはホームディレクトリ、システムの一時ディレクトリ、および Linux と macOS では /home、/opt、/workplace に制限 — 外部へのシンボリックリンクは拒否",
			"page_label": "ファイル"
		},
		pathBar: {
			"click_to_edit_path": "クリックしてパスを編集",
			"folder_path": "フォルダーパス",
			"path_to_folder": "/パス/フォルダー",
			"refresh_folder": "フォルダーを更新"
		},
		searchPanel: {
			"capped": "（上限あり）",
			"close_esc": "閉じる (Esc)",
			"close_search": "検索を閉じる",
			"comma_separated_glob_patterns": "カンマ区切りのグロブパターン",
			"glob_e_g_md": "グロブ（例 *.md）",
			"glob_filter_comma_separated_patterns": "グロブフィルタ（カンマ区切りパターン）",
			"no_matches": "マッチしません",
			"search_failed": "検索に失敗しました",
			"search_in": "{{name}} 内を検索",
			"search_in_2": "{{name}} 内を検索…",
			"searching": "検索中…"
		},
		tabStrip: {
			"close_file_tab": "ファイルタブを閉じる",
			"close_workspace_tab": "ワークスペースタブを閉じる",
			"new_workspace_tab": "新しいワークスペースタブ",
			"new_workspace_tab_ctrl_cmd_t": "新しいワークスペースタブ (Ctrl/Cmd+T)",
			"rename_workspace_tab": "ワークスペースタブの名前を変更"
		},
		treeNode: { "loading": "読み込み中…" },
		common: {
			"app_disabled_title": "このアプリは無効です",
			"app_disabled_hint": "使用するにはアプリからこのアプリを有効にしてください。",
			"apps": "アプリ",
			"result_count_other": "{{count}} 件の結果",
			"dismiss": "閉じる"
		}
	},
	ko: {
		fileExplorerPage: {
			"backend_not_reachable": "백엔드에 연결할 수 없습니다:",
			"cannot_open_folder": "이 폴더를 열 수 없습니다",
			"folder_unavailable": "이 폴더를 사용할 수 없습니다.",
			"go_to_parent_folder": "상위 폴더로 이동",
			"chat_about_this": "이 항목에 대해 대화하기",
			"copy_path": "경로 복사",
			"open": "열기",
			"open_as_workspace_root": "워크스페이스 루트로 열기",
			"resize_panel": "패널 크기 조절",
			"reveal_parent": "상위 폴더 표시",
			"link_open_failed": "‘{{path}}’을(를) 열 수 없습니다.",
			"link_target_missing": "해당 경로에는 파일이나 폴더가 없습니다.",
			"link_target_relative": "‘{{path}}’을(를) 열 수 없습니다. 링크에는 전체 경로가 필요합니다.",
			"link_target_unsupported": "해당 경로는 파일도 폴더도 아닙니다."
		},
		fileViewer: {
			"binary_file": "바이너리 파일",
			"copy_path": "경로 복사",
			"copy_path_2": "경로 복사: {{path}}",
			"download": "다운로드",
			"more_options": "옵션 더 보기",
			"reload": "다시 불러오기",
			"select_a_file_to_view": "볼 파일을 선택하세요",
			"sensitive_file_avoid_sharing_your_screen_while_v": "민감한 파일 — 자격 증명을 보는 동안에는 화면 공유를 피하세요",
			"tip_ctrl_cmd_f_to_search": "팁: Ctrl/Cmd+F로 검색",
			"truncated": "· 잘림"
		},
		manifest: {
			"use_case_1": "페이지에 쓰기 권한을 주지 않고 게이트웨이 호스트의 파일을 읽고, 검색하고, 미리 보고, 다운로드하거나 대화로 논의합니다.",
			"configuration_1": "앱을 활성화하고 경로 표시줄에서 허용된 디렉터리를 여세요. 계정은 필요하지 않으며 git 또는 ripgrep은 선택적인 상태 표시와 검색 기능만 추가합니다.",
			"description": "대시보드를 벗어나지 않고 Kiro Crew가 실행 중인 머신의 파일을 살펴보고 읽습니다. 여러 파일을 탭으로 열어 두고, 각 파일의 git 상태가 옆에 표시되는 디렉터리 트리를 따라 이동하고, 폴더 전체에서 문자열을 검색하고, Markdown을 원본이 아닌 렌더링된 형태로 읽을 수 있습니다. 설계상 읽기 전용입니다. 파일을 열고 검색하지만 편집·이동·삭제는 절대 하지 않으며, 접근 범위는 홈 디렉터리, 시스템 임시 디렉터리, 그리고 Linux와 macOS에서는 /home, /opt, /workplace 트리로 한정됩니다.",
			"display_name": "파일",
			"highlight_1": "읽기 전용: 파일을 열고 검색하며, 쓰기·이동·삭제는 하지 않습니다",
			"highlight_2": "여러 파일을 탭으로 동시에 열고 구문 강조를 표시",
			"highlight_3": "Markdown 파일을 원본 소스가 아닌 서식이 적용된 텍스트로 표시",
			"highlight_4": "디렉터리 트리에 각 파일의 git 상태를 함께 표시",
			"highlight_5": "줄 단위 일치와 주변 미리 보기를 포함해 디렉터리 전체를 검색",
			"highlight_6": "접근 가능한 경로는 홈 디렉터리, 시스템 임시 디렉터리, 그리고 Linux와 macOS에서는 /home과 /opt, /workplace로 제한 — 바깥으로 향하는 심볼릭 링크는 거부",
			"page_label": "파일"
		},
		pathBar: {
			"click_to_edit_path": "클릭해서 경로 편집",
			"folder_path": "폴더 경로",
			"path_to_folder": "/path/to/folder",
			"refresh_folder": "폴더 새로 고침"
		},
		searchPanel: {
			"capped": "(상한 도달)",
			"close_esc": "닫기 (Esc)",
			"close_search": "검색 닫기",
			"comma_separated_glob_patterns": "쉼표로 구분한 글로브 패턴",
			"glob_e_g_md": "글로브 (예: *.md)",
			"glob_filter_comma_separated_patterns": "글로브 필터 (쉼표로 구분한 패턴)",
			"no_matches": "일치 항목 없음",
			"search_failed": "검색 실패",
			"search_in": "{{name}}에서 검색",
			"search_in_2": "{{name}}에서 검색…",
			"searching": "검색 중…"
		},
		tabStrip: {
			"close_file_tab": "파일 탭 닫기",
			"close_workspace_tab": "워크스페이스 탭 닫기",
			"new_workspace_tab": "새 워크스페이스 탭",
			"new_workspace_tab_ctrl_cmd_t": "새 워크스페이스 탭 (Ctrl/Cmd+T)",
			"rename_workspace_tab": "워크스페이스 탭 이름 변경"
		},
		treeNode: { "loading": "불러오는 중…" },
		common: {
			"app_disabled_title": "이 앱은 비활성화되어 있습니다",
			"app_disabled_hint": "사용하려면 앱에서 이 앱을 활성화하세요.",
			"apps": "앱",
			"result_count_other": "결과 {{count}}개",
			"dismiss": "닫기"
		}
	},
	pt: {
		fileExplorerPage: {
			"backend_not_reachable": "Backend inacessível:",
			"cannot_open_folder": "Não é possível abrir esta pasta",
			"folder_unavailable": "Esta pasta não está disponível.",
			"go_to_parent_folder": "Ir para a pasta principal",
			"chat_about_this": "Conversar sobre isso",
			"copy_path": "Copiar caminho",
			"open": "Abrir",
			"open_as_workspace_root": "Abrir como raiz do workspace",
			"resize_panel": "Redimensionar painel",
			"reveal_parent": "Mostrar pasta pai",
			"link_open_failed": "Não foi possível abrir {{path}}.",
			"link_target_missing": "Não há nenhum arquivo ou pasta nesse caminho.",
			"link_target_relative": "Não é possível abrir {{path}}: os links precisam de um caminho completo.",
			"link_target_unsupported": "Esse caminho não é um arquivo nem uma pasta."
		},
		fileViewer: {
			"binary_file": "Arquivo binário",
			"copy_path": "Copiar caminho",
			"copy_path_2": "Copiar caminho: {{path}}",
			"download": "Baixar",
			"more_options": "Mais opções",
			"reload": "Recarregar",
			"select_a_file_to_view": "Selecione um arquivo para visualizar",
			"sensitive_file_avoid_sharing_your_screen_while_v": "Arquivo sensível — evite compartilhar sua tela ao visualizar credenciais",
			"tip_ctrl_cmd_f_to_search": "Dica: Ctrl/Cmd+F para pesquisar",
			"truncated": "· truncado"
		},
		manifest: {
			"description": "Navegue e leia arquivos na máquina que executa o Kiro Crew sem sair do painel. Mantenha vários arquivos abertos em abas, percorra a árvore de diretórios com o status git de cada arquivo ao lado, pesquise um texto em uma pasta inteira e leia markdown renderizado em vez de bruto. É somente leitura por princípio: abre e pesquisa arquivos, mas nunca os edita, move ou exclui, e só alcança o seu diretório pessoal, o diretório temporário do sistema e, no Linux e no macOS, as árvores /home, /opt e /workplace.",
			"display_name": "Arquivos",
			"highlight_1": "Somente leitura: abre e pesquisa arquivos e nunca os grava, move ou exclui",
			"highlight_2": "Vários arquivos abertos ao mesmo tempo em abas, com realce de sintaxe",
			"highlight_3": "Arquivos Markdown são exibidos como texto formatado, em vez do código bruto",
			"highlight_4": "A árvore de diretórios mostra o status git de cada arquivo na própria linha",
			"highlight_5": "Pesquise em um diretório inteiro, com correspondências por linha e uma prévia do entorno",
			"highlight_6": "Os caminhos acessíveis se limitam ao seu diretório pessoal, ao diretório temporário do sistema e, no Linux e no macOS, a /home, /opt e /workplace — links simbólicos para fora são recusados",
			"page_label": "Arquivos",
			"use_case_1": "Leia, pesquise, visualize, baixe ou discuta arquivos no host do gateway sem conceder acesso de gravação à página.",
			"configuration_1": "Ative o app e abra um diretório permitido pela barra de caminho; nenhuma conta é necessária, e Git ou ripgrep apenas acrescentam recursos opcionais de status e pesquisa."
		},
		pathBar: {
			"click_to_edit_path": "Clique para editar o caminho",
			"folder_path": "Caminho da pasta",
			"path_to_folder": "/path/to/folder",
			"refresh_folder": "Atualizar pasta"
		},
		searchPanel: {
			"capped": "(limitado)",
			"close_esc": "Fechar (Esc)",
			"close_search": "Fechar pesquisa",
			"comma_separated_glob_patterns": "Padrões glob separados por vírgula",
			"glob_e_g_md": "glob (ex.: *.md)",
			"glob_filter_comma_separated_patterns": "Filtro glob (padrões separados por vírgula)",
			"no_matches": "Nenhum resultado",
			"search_failed": "falha na pesquisa",
			"search_in": "Pesquisar em {{name}}",
			"search_in_2": "Pesquisar em {{name}}…",
			"searching": "pesquisando..."
		},
		tabStrip: {
			"close_file_tab": "Fechar aba do arquivo",
			"close_workspace_tab": "Fechar aba do workspace",
			"new_workspace_tab": "Nova aba de workspace",
			"new_workspace_tab_ctrl_cmd_t": "Nova aba de workspace (Ctrl/Cmd+T)",
			"rename_workspace_tab": "Renomear aba do workspace"
		},
		treeNode: { "loading": "carregando..." },
		common: {
			"app_disabled_title": "Este app está desativado",
			"app_disabled_hint": "Ative este app em Apps para usá-lo.",
			"apps": "Apps",
			"result_count_many": "{{count}} resultados",
			"result_count_one": "{{count}} resultado",
			"result_count_other": "{{count}} resultados",
			"dismiss": "Dispensar"
		}
	},
	ru: {
		fileExplorerPage: {
			"backend_not_reachable": "Бэкенд недоступен:",
			"cannot_open_folder": "Не удалось открыть эту папку",
			"folder_unavailable": "Эта папка недоступна.",
			"go_to_parent_folder": "Перейти к родительской папке",
			"chat_about_this": "Обсудить в чате",
			"copy_path": "Копировать путь",
			"open": "Открыть",
			"open_as_workspace_root": "Открыть как корень рабочей области",
			"resize_panel": "Изменить размер панели",
			"reveal_parent": "Показать родительскую папку",
			"link_open_failed": "Не удалось открыть {{path}}.",
			"link_target_missing": "По этому пути нет файла или папки.",
			"link_target_relative": "Не удалось открыть {{path}}: для ссылок нужен полный путь.",
			"link_target_unsupported": "Этот путь не является файлом или папкой."
		},
		fileViewer: {
			"binary_file": "Двоичный файл",
			"copy_path": "Копировать путь",
			"copy_path_2": "Копировать путь: {{path}}",
			"download": "Скачать",
			"more_options": "Дополнительные параметры",
			"reload": "Перезагрузить",
			"select_a_file_to_view": "Выберите файл для просмотра",
			"sensitive_file_avoid_sharing_your_screen_while_v": "Конфиденциальный файл — не демонстрируйте экран при просмотре учётных данных",
			"tip_ctrl_cmd_f_to_search": "Совет: Ctrl/Cmd+F для поиска",
			"truncated": "· усечено"
		},
		manifest: {
			"description": "Просматривай и читай файлы на машине с Kiro Crew, не покидая панель. Держи несколько файлов открытыми во вкладках, ходи по дереву каталогов, где рядом с каждым файлом виден его статус в git, ищи строку по всей папке и читай markdown в отрисованном виде, а не в исходнике. Приложение принципиально только для чтения: оно открывает и ищет файлы, но никогда их не правит, не перемещает и не удаляет, а доступны ему только домашний каталог, системный временный каталог и, на Linux и macOS, деревья /home, /opt и /workplace.",
			"display_name": "Файлы",
			"use_case_1": "Читайте, ищите, просматривайте, скачивайте или обсуждайте файлы на хосте шлюза, не предоставляя странице доступ на запись.",
			"configuration_1": "Включите приложение и откройте разрешённый каталог через строку пути; учётная запись не нужна, а git и ripgrep лишь добавляют необязательные сведения о состоянии и расширенный поиск.",
			"highlight_1": "Только чтение: открывает и ищет файлы, но никогда не записывает, не перемещает и не удаляет их",
			"highlight_2": "Несколько файлов открыты одновременно во вкладках, с подсветкой синтаксиса",
			"highlight_3": "Файлы Markdown показываются как форматированный текст, а не как исходник",
			"highlight_4": "В дереве каталогов рядом с каждым файлом виден его статус в git",
			"highlight_5": "Поиск по каталогу с совпадениями по строкам и предпросмотром вокруг них",
			"highlight_6": "Доступные пути ограничены домашним каталогом, системным временным каталогом и, на Linux и macOS, /home, /opt и /workplace — символические ссылки за их пределы отклоняются",
			"page_label": "Файлы"
		},
		pathBar: {
			"click_to_edit_path": "Нажмите, чтобы изменить путь",
			"folder_path": "Путь к папке",
			"path_to_folder": "/path/to/folder",
			"refresh_folder": "Обновить папку"
		},
		searchPanel: {
			"capped": "(усечено)",
			"close_esc": "Закрыть (Esc)",
			"close_search": "Закрыть поиск",
			"comma_separated_glob_patterns": "Glob-шаблоны через запятую",
			"glob_e_g_md": "glob (напр. *.md)",
			"glob_filter_comma_separated_patterns": "Glob-фильтр (шаблоны через запятую)",
			"no_matches": "Совпадений нет",
			"search_failed": "ошибка поиска",
			"search_in": "Искать в {{name}}",
			"search_in_2": "Искать в {{name}}...",
			"searching": "поиск..."
		},
		tabStrip: {
			"close_file_tab": "Закрыть вкладку файла",
			"close_workspace_tab": "Закрыть вкладку рабочей области",
			"new_workspace_tab": "Новая вкладка рабочей области",
			"new_workspace_tab_ctrl_cmd_t": "Новая вкладка рабочей области (Ctrl/Cmd+T)",
			"rename_workspace_tab": "Переименовать вкладку рабочей области"
		},
		treeNode: { "loading": "загрузка..." },
		common: {
			"app_disabled_title": "Это приложение отключено",
			"app_disabled_hint": "Включите это приложение в разделе «Приложения», чтобы использовать его.",
			"apps": "Приложения",
			"result_count_few": "{{count}} результата",
			"result_count_many": "{{count}} результатов",
			"result_count_one": "{{count}} результат",
			"result_count_other": "{{count}} результата",
			"dismiss": "Скрыть"
		}
	},
	"zh-CN": {
		fileExplorerPage: {
			"backend_not_reachable": "无法连接后端：",
			"cannot_open_folder": "无法打开此文件夹",
			"folder_unavailable": "此文件夹不可用。",
			"go_to_parent_folder": "转到上级文件夹",
			"chat_about_this": "就此发起聊天",
			"copy_path": "复制路径",
			"open": "打开",
			"open_as_workspace_root": "作为工作区根目录打开",
			"resize_panel": "调整面板大小",
			"reveal_parent": "显示上级目录",
			"link_open_failed": "无法打开 {{path}}。",
			"link_target_missing": "该路径下没有文件或文件夹。",
			"link_target_relative": "无法打开 {{path}}：链接需要使用完整路径。",
			"link_target_unsupported": "该路径不是文件或文件夹。"
		},
		fileViewer: {
			"binary_file": "二进制文件",
			"copy_path": "复制路径",
			"copy_path_2": "复制路径：{{path}}",
			"download": "下载",
			"more_options": "更多选项",
			"reload": "重新加载",
			"select_a_file_to_view": "选择要查看的文件",
			"sensitive_file_avoid_sharing_your_screen_while_v": "敏感文件 — 查看凭证时请避免共享屏幕",
			"tip_ctrl_cmd_f_to_search": "提示：Ctrl/Cmd+F 搜索",
			"truncated": "· 已截断"
		},
		manifest: {
			"use_case_1": "在不授予页面写入权限的前提下，读取、搜索、预览、下载或讨论网关主机上的文件。",
			"configuration_1": "启用应用并从路径栏打开允许访问的目录；无需账号，git 和 ripgrep 仅用于增强可选的状态显示与搜索。",
			"description": "不用离开仪表板，就能浏览和阅读运行 Kiro Crew 那台机器上的文件。多个文件在标签页里同时打开，沿目录树浏览时每个文件旁边都显示 git 状态，可以在整个文件夹里搜字符串，markdown 也是渲染后阅读而不是看源码。它按设计就是只读的：只打开和搜索文件，从不编辑、移动或删除，可访问范围仅限主目录、系统临时目录，以及 Linux 和 macOS 上的 /home、/opt 和 /workplace 目录树。",
			"display_name": "文件",
			"highlight_1": "只读：只打开和搜索文件，从不写入、移动或删除",
			"highlight_2": "多个文件在标签页里同时打开，带语法高亮",
			"highlight_3": "Markdown 文件渲染为排版后的文本，而不是原始源码",
			"highlight_4": "目录树在每个文件旁直接显示 git 状态",
			"highlight_5": "跨目录搜索，给出行级匹配和上下文预览",
			"highlight_6": "可访问路径仅限主目录、系统临时目录，以及 Linux 和 macOS 上的 /home、/opt 和 /workplace — 指向外部的符号链接会被拒绝",
			"page_label": "文件"
		},
		pathBar: {
			"click_to_edit_path": "点击编辑路径",
			"folder_path": "文件夹路径",
			"path_to_folder": "/path/to/folder",
			"refresh_folder": "刷新文件夹"
		},
		searchPanel: {
			"capped": "（已截断）",
			"close_esc": "关闭 (Esc)",
			"close_search": "关闭搜索",
			"comma_separated_glob_patterns": "以逗号分隔的 glob 模式",
			"glob_e_g_md": "glob（例如 *.md）",
			"glob_filter_comma_separated_patterns": "Glob 过滤（以逗号分隔的模式）",
			"no_matches": "无匹配项",
			"search_failed": "搜索失败",
			"search_in": "在 {{name}} 中搜索",
			"search_in_2": "在 {{name}} 中搜索…",
			"searching": "正在搜索…"
		},
		tabStrip: {
			"close_file_tab": "关闭文件标签页",
			"close_workspace_tab": "关闭工作区标签页",
			"new_workspace_tab": "新建工作区标签页",
			"new_workspace_tab_ctrl_cmd_t": "新建工作区标签页 (Ctrl/Cmd+T)",
			"rename_workspace_tab": "重命名工作区标签页"
		},
		treeNode: { "loading": "加载中…" },
		common: {
			"app_disabled_title": "此应用已停用",
			"app_disabled_hint": "在“应用”中启用后即可使用。",
			"apps": "应用",
			"result_count_other": "{{count}} 个结果",
			"dismiss": "忽略"
		}
	}
};
var own = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
function lookup(catalog, key) {
	let node = catalog;
	for (const part of key.split(".")) {
		if (node === void 0 || typeof node === "string" || !own(node, part)) return void 0;
		node = node[part];
	}
	return typeof node === "string" ? node : void 0;
}
/** The catalogs to try for `locale`, most specific first, always ending in English. */
function localeChain(locale) {
	const chain = [];
	const add = (candidate) => {
		if (own(CATALOGS, candidate) && !chain.includes(candidate)) chain.push(candidate);
	};
	add(locale);
	add(locale.split("-")[0]);
	add("en");
	return chain;
}
function currentLocale() {
	try {
		const locale = activeLocale();
		return typeof locale === "string" && locale ? locale : "en";
	} catch {
		return "en";
	}
}
var PLACEHOLDER = /\{\{\s*(\w+)\s*\}\}/g;
function pluralSuffix(locale, count) {
	try {
		return new Intl.PluralRules(locale).select(count);
	} catch {
		return "other";
	}
}
function fill(text, vars) {
	return text.replace(PLACEHOLDER, (whole, name) => vars && own(vars, name) ? String(vars[name]) : whole);
}
function t(key, vars) {
	const count = vars && typeof vars.count === "number" ? vars.count : void 0;
	for (const locale of localeChain(currentLocale())) {
		const catalog = CATALOGS[locale];
		if (count !== void 0) {
			const forms = [`${key}_${pluralSuffix(locale, count)}`, `${key}_other`];
			for (const form of forms) {
				const text = lookup(catalog, form);
				if (text !== void 0) return fill(text, vars);
			}
		}
		const text = lookup(catalog, key);
		if (text !== void 0) return fill(text, vars);
	}
	return key;
}
/** The name the page's components call `t` by, kept from the built-in. */
var i18nT = t;
// src/TabStrip.tsx
function TabStrip({ folderTabs, fileTabs, activeFolderId, activeFileId, onActivateFolder, onActivateFile, onCloseFolder, onCloseFile, onNewFolder, onRenameFolder }) {
	const ime = useImeGuard();
	const [renameId, setRenameId] = useState(null);
	const [renameDraft, setRenameDraft] = useState("");
	const renameTriggerRef = useRef(null);
	const closeRename = (restore) => {
		setRenameId(null);
		if (!restore) return;
		requestAnimationFrame(() => {
			const at = document.activeElement;
			if (at === null || at === document.body) renameTriggerRef.current?.focus({ preventScroll: true });
		});
	};
	const [attachEdges, fades, remeasure] = useScrollEdges();
	const attachWheel = useWheelToHorizontal();
	const attachScroller = useCallback((node) => {
		attachEdges(node);
		attachWheel(node);
	}, [attachEdges, attachWheel]);
	useEffect(() => {
		remeasure();
	}, [
		folderTabs,
		fileTabs,
		remeasure
	]);
	return /* @__PURE__ */ jsxs("div", {
		className: "mc-fe-tabstrip-outer",
		children: [
			fades.left && /* @__PURE__ */ jsx("div", { className: "mc-fe-tabstrip-fade mc-fe-fade-left" }),
			fades.right && /* @__PURE__ */ jsx("div", { className: "mc-fe-tabstrip-fade mc-fe-fade-right" }),
			/* @__PURE__ */ jsxs("div", {
				className: "mc-fe-tabs",
				ref: attachScroller,
				children: [
					folderTabs.map((t) => /* @__PURE__ */ jsxs("div", {
						className: "mc-fe-tab mc-fe-tab-folder" + (t.id === activeFolderId && !activeFileId ? " is-active" : "") + (t.id === activeFolderId ? " is-current-folder" : ""),
						onClick: () => onActivateFolder(t.id),
						onDoubleClick: (e) => {
							renameTriggerRef.current = e.currentTarget;
							setRenameId(t.id);
							setRenameDraft(t.label || basename(t.rootPath));
						},
						title: t.rootPath,
						role: "tab",
						tabIndex: 0,
						onKeyDown: (e) => {
							if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) onActivateFolder(t.id);
						},
						children: [
							/* @__PURE__ */ jsx(Folder, {
								size: 11,
								style: {
									opacity: .7,
									marginRight: 5,
									flexShrink: 0
								}
							}),
							renameId === t.id ? /* @__PURE__ */ jsx("input", {
								className: "mc-fe-tab-rename",
								"aria-label": i18nT("tabStrip.rename_workspace_tab"),
								autoFocus: true,
								value: renameDraft,
								onChange: (e) => setRenameDraft(e.target.value),
								onClick: (e) => e.stopPropagation(),
								...ime.bindEnter({
									onEnter: () => {
										onRenameFolder(t.id, renameDraft.trim());
										closeRename(true);
									},
									onEscape: () => closeRename(true),
									onBlur: () => {
										onRenameFolder(t.id, renameDraft.trim());
										closeRename(false);
									}
								})
							}) : /* @__PURE__ */ jsx("span", {
								className: "mc-fe-tab-label",
								children: t.label || basename(t.rootPath) || "/"
							}),
							/* @__PURE__ */ jsx(Clickable, {
								className: "mc-fe-tab-close",
								onClick: (e) => {
									e?.stopPropagation();
									onCloseFolder(t.id);
								},
								title: i18nT("tabStrip.close_workspace_tab"),
								"aria-label": i18nT("tabStrip.close_workspace_tab"),
								children: /* @__PURE__ */ jsx(X, { size: 11 })
							})
						]
					}, t.id)),
					fileTabs.length > 0 && /* @__PURE__ */ jsx("div", { className: "mc-fe-tab-sep" }),
					fileTabs.map((ft) => /* @__PURE__ */ jsxs("div", {
						className: "mc-fe-tab mc-fe-tab-file" + (ft.id === activeFileId ? " is-active" : ""),
						onClick: () => onActivateFile(ft.id),
						title: ft.path,
						role: "tab",
						tabIndex: 0,
						onKeyDown: (e) => {
							if (e.key === "Enter" || e.key === " ") onActivateFile(ft.id);
						},
						children: [
							IMAGE_EXTS.has(extOf(ft.path)) ? /* @__PURE__ */ jsx(Image, {
								size: 11,
								style: {
									opacity: .7,
									marginRight: 5,
									flexShrink: 0
								}
							}) : /* @__PURE__ */ jsx(File, {
								size: 11,
								style: {
									opacity: .7,
									marginRight: 5,
									flexShrink: 0
								}
							}),
							/* @__PURE__ */ jsx("span", {
								className: "mc-fe-tab-label",
								children: basename(ft.path)
							}),
							/* @__PURE__ */ jsx(Clickable, {
								className: "mc-fe-tab-close",
								onClick: (e) => {
									e?.stopPropagation();
									onCloseFile(ft.id);
								},
								"aria-label": i18nT("tabStrip.close_file_tab"),
								children: /* @__PURE__ */ jsx(X, { size: 11 })
							})
						]
					}, ft.id)),
					/* @__PURE__ */ jsx("button", {
						className: "mc-fe-tab-new",
						onClick: onNewFolder,
						title: i18nT("tabStrip.new_workspace_tab_ctrl_cmd_t"),
						"aria-label": i18nT("tabStrip.new_workspace_tab"),
						children: /* @__PURE__ */ jsx(Plus, { size: 13 })
					})
				]
			})
		]
	});
}
// src/hooks.ts
function useDebouncedValue(value, ms) {
	const [debounced, setDebounced] = useState(value);
	useEffect(() => {
		const t = setTimeout(() => setDebounced(value), ms);
		return () => clearTimeout(t);
	}, [value, ms]);
	return debounced;
}
// src/lib/usePointerMotion.ts
/**
* Tell real pointer motion apart from the hover events a browser fires under a
* pointer that has not moved, so a list selects a row on hover only when the
* reader actually pointed at it.
*
* The browser fires mouseover, mouseenter and even mousemove when rows
* re-render or scroll under a resting pointer. A filtered list re-ranks its
* rows on every keystroke and resets the selection to the best match. A row
* that selected itself on `onMouseEnter` let the resting pointer overwrite
* that reset, so Enter chose whatever row landed under the cursor.
*
* While `active`, the hook records the pointer from a document capture-phase
* `mousemove` listener, so every move counts, over a row, a header, or outside
* the list. Capture runs before any row handler, which then asks
* `moved(e)` whether the event's position differs from the move before it.
* Wire rows as `onMouseMove={e => { if (moved(e)) select(i) }}`, never as
* `onMouseEnter`.
*
* The first event after the list becomes active only records: with nothing
* to compare against it cannot be told apart from a re-render under a
* resting pointer, and one swallowed event of motion is the cost. The trail
* is cleared on every activation and deactivation, so a reopened list never
* compares against a position from before it opened.
*/
function usePointerMotion(active) {
	const trailRef = useRef({
		prev: null,
		last: null
	});
	useEffect(() => {
		if (!active) return;
		const trail = trailRef.current;
		trail.prev = null;
		trail.last = null;
		const onMove = (e) => {
			trail.prev = trail.last;
			trail.last = {
				x: e.clientX,
				y: e.clientY
			};
		};
		document.addEventListener("mousemove", onMove, true);
		return () => {
			document.removeEventListener("mousemove", onMove, true);
			trail.prev = null;
			trail.last = null;
		};
	}, [active]);
	return useCallback((e) => {
		const prev = trailRef.current.prev;
		return !!prev && (prev.x !== e.clientX || prev.y !== e.clientY);
	}, []);
}
// src/PathBar.tsx
function PathBar({ rootPath, gitInfo, onChangeRoot, onNavigate, onRefresh }) {
	const ime = useImeGuard();
	const [editing, setEditing] = useState(false);
	const [draft, setDraft] = useState(rootPath);
	const [open, setOpen] = useState(false);
	const [activeIdx, setActiveIdx] = useState(-1);
	const pointerMoved = usePointerMotion(open);
	const inputRef = useRef(null);
	const containerRef = useRef(null);
	useEffect(() => {
		setDraft(rootPath);
		setEditing(false);
		setOpen(false);
		setActiveIdx(-1);
	}, [rootPath]);
	useEffect(() => {
		if (editing) inputRef.current?.focus();
	}, [editing]);
	const debouncedDraft = useDebouncedValue(draft, 150);
	const { data: suggestions = [] } = useQuery({
		queryKey: [
			"file-explorer",
			"complete",
			debouncedDraft
		],
		queryFn: () => fileExplorerApi.complete(debouncedDraft, "dir", 30).then((r) => r.entries || []),
		enabled: open && debouncedDraft.length > 0,
		staleTime: 1e4
	});
	useEffect(() => {
		setActiveIdx(-1);
	}, [suggestions]);
	useEffect(() => {
		if (!editing) return;
		const onDocClick = (e) => {
			if (containerRef.current && !containerRef.current.contains(e.target)) {
				setEditing(false);
				setOpen(false);
			}
		};
		document.addEventListener("mousedown", onDocClick);
		return () => document.removeEventListener("mousedown", onDocClick);
	}, [editing]);
	const accept = (entry) => {
		setDraft(entry.path);
		setOpen(false);
		setEditing(false);
		onChangeRoot(entry.path.replace(/\/$/, ""));
	};
	const commit = () => {
		setOpen(false);
		setEditing(false);
		if (draft.trim() && draft.trim() !== rootPath) onNavigate(draft.trim());
	};
	const onKeyDown = (e) => {
		if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
			setOpen(true);
			return;
		}
		if (open && e.key === "ArrowDown") {
			e.preventDefault();
			setActiveIdx((i) => suggestions.length === 0 ? -1 : (i + 1) % suggestions.length);
		} else if (open && e.key === "ArrowUp") {
			e.preventDefault();
			setActiveIdx((i) => suggestions.length === 0 ? -1 : (i - 1 + suggestions.length) % suggestions.length);
		} else if (open && e.key === "Enter") {
			if (!ime.claimEnter(e)) return;
			if (activeIdx >= 0 && suggestions[activeIdx]) accept(suggestions[activeIdx]);
			else commit();
		} else if (!open && e.key === "Enter") {
			if (ime.claimEnter(e)) commit();
		} else if (e.key === "Escape") {
			setDraft(rootPath);
			setEditing(false);
			setOpen(false);
		} else if (e.key === "Tab" && open && suggestions.length > 0) {
			if (!ime.claimKey(e)) return;
			e.preventDefault();
			setDraft(suggestions[activeIdx >= 0 ? activeIdx : 0].path);
		}
	};
	const segs = parentChain(rootPath);
	return /* @__PURE__ */ jsx("div", {
		className: "mc-fe-pathbar",
		ref: containerRef,
		children: /* @__PURE__ */ jsxs("div", {
			className: "mc-fe-pathbar-row",
			children: [
				/* @__PURE__ */ jsx(FolderTree, {
					size: 13,
					style: {
						color: "var(--accent)",
						flexShrink: 0
					}
				}),
				editing ? /* @__PURE__ */ jsxs("div", {
					className: "mc-fe-pathbar-edit",
					children: [/* @__PURE__ */ jsx("input", {
						ref: inputRef,
						className: "mc-fe-pathbar-input",
						type: "text",
						"aria-label": i18nT("pathBar.folder_path"),
						value: draft,
						onChange: (e) => {
							setDraft(e.target.value);
							setOpen(true);
						},
						...ime.bindComposition({ onFocus: () => setOpen(true) }),
						onKeyDown,
						placeholder: i18nT("pathBar.path_to_folder"),
						spellCheck: false,
						autoComplete: "off"
					}), open && suggestions.length > 0 && /* @__PURE__ */ jsx("div", {
						className: "mc-fe-ac",
						children: suggestions.map((s, i) => /* @__PURE__ */ jsxs("div", {
							className: "mc-fe-ac-row" + (i === activeIdx ? " is-active" : ""),
							onMouseDown: (e) => {
								e.preventDefault();
								accept(s);
							},
							onMouseMove: (e) => {
								if (pointerMoved(e)) setActiveIdx(i);
							},
							role: "option",
							tabIndex: -1,
							"aria-selected": i === activeIdx,
							children: [
								s.type === "dir" ? /* @__PURE__ */ jsx(Folder, {
									size: 12,
									style: {
										marginRight: 6,
										color: "var(--accent)",
										opacity: .85
									}
								}) : /* @__PURE__ */ jsx(File, {
									size: 12,
									style: {
										marginRight: 6,
										color: "var(--accent)",
										opacity: .85
									}
								}),
								/* @__PURE__ */ jsx("span", {
									className: "mc-fe-ac-name",
									children: s.name
								}),
								/* @__PURE__ */ jsx("span", {
									className: "mc-fe-ac-path",
									children: s.path
								})
							]
						}, s.path))
					})]
				}) : /* @__PURE__ */ jsx(Clickable, {
					className: "mc-fe-breadcrumbs",
					onClick: () => {
						setDraft(rootPath);
						setEditing(true);
					},
					title: i18nT("pathBar.click_to_edit_path"),
					children: segs.map((s, i) => /* @__PURE__ */ jsxs("span", { children: [i > 0 && /* @__PURE__ */ jsx("span", {
						className: "mc-fe-bc-sep",
						children: "/"
					}), /* @__PURE__ */ jsx("span", {
						className: "mc-fe-bc",
						onClick: (e) => {
							e.stopPropagation();
							onChangeRoot(s);
						},
						role: "button",
						tabIndex: 0,
						onKeyDown: (e) => {
							if (e.key === "Enter" || e.key === " ") {
								e.stopPropagation();
								onChangeRoot(s);
							}
						},
						children: i === 0 ? "/" : crumbLabel(s) || s
					})] }, `seg${i}`))
				}),
				gitInfo && gitInfo.branch && /* @__PURE__ */ jsxs("span", {
					className: "mc-fe-branch",
					children: [
						/* @__PURE__ */ jsx(GitBranch, { size: 11 }),
						" ",
						gitInfo.branch,
						Object.keys(gitInfo.statuses || {}).length > 0 && /* @__PURE__ */ jsxs("span", {
							className: "mc-fe-branch-count",
							children: [" ", Object.keys(gitInfo.statuses).length]
						})
					]
				}),
				/* @__PURE__ */ jsx("button", {
					type: "button",
					className: "mc-fe-iconbtn",
					onClick: onRefresh,
					title: i18nT("pathBar.refresh_folder"),
					"aria-label": i18nT("pathBar.refresh_folder"),
					children: /* @__PURE__ */ jsx(RefreshCw, {
						size: 12,
						"aria-hidden": "true"
					})
				})
			]
		})
	});
}
// src/TreeNode.tsx
function gitBadge(code) {
	if (!code) return null;
	const c = code.trim();
	let color = "var(--warn)";
	let label = c;
	if (c === "??") {
		label = "U";
		color = "var(--accent)";
	} else if (c.startsWith("M") || c.endsWith("M")) {
		label = "M";
		color = "var(--warn)";
	} else if (c.startsWith("A") || c.endsWith("A")) {
		label = "A";
		color = "var(--ok)";
	} else if (c.startsWith("D") || c.endsWith("D")) {
		label = "D";
		color = "var(--danger)";
	} else if (c.startsWith("R")) {
		label = "R";
		color = "var(--accent)";
	} else if (c === "!!") return null;
	return /* @__PURE__ */ jsx("span", {
		title: `git: ${c}`,
		style: {
			fontSize: 9,
			fontWeight: 600,
			color,
			marginLeft: 4,
			border: `1px solid ${color}`,
			borderRadius: 3,
			padding: "0 3px",
			lineHeight: "12px"
		},
		children: label
	});
}
function TreeNode({ node, depth, expanded, toggleExpand, selectedPath, onSelect, gitMap, onContextMenu }) {
	const isDir = node.type === "dir" || node.type === "symlink";
	const isOpen = expanded[node.path];
	const isSelected = selectedPath === node.path;
	let gitCode = null;
	if (gitMap && gitMap.size > 0) {
		let bestRoot = "";
		for (const root of gitMap.keys()) if (node.path === root || node.path.startsWith(root + "/")) {
			if (root.length > bestRoot.length) bestRoot = root;
		}
		if (bestRoot) {
			const statuses = gitMap.get(bestRoot)?.statuses || {};
			if (node.path === bestRoot) {
				if (Object.keys(statuses).length > 0) gitCode = "M";
			} else {
				const rel = node.path.slice(bestRoot.length + 1);
				if (statuses[rel]) gitCode = statuses[rel];
				else if (isDir) {
					for (const k of Object.keys(statuses)) if (k.startsWith(rel + "/")) {
						gitCode = "M";
						break;
					}
				}
			}
		}
	}
	const IconComponent = isDir ? node.isGitRoot ? FolderGit2 : isOpen ? FolderOpen : Folder : IMAGE_EXTS.has(extOf(node.name)) ? Image : extOf(node.name) === ".md" ? FileText : File;
	const needsFetch = isDir && isOpen && (!node.children || node.children.length === 0);
	const { data: lazyChildren, error: lazyError } = useQuery({
		queryKey: [
			"file-explorer",
			"tree-node",
			node.path
		],
		queryFn: () => fileExplorerApi.tree(node.path, 1),
		enabled: needsFetch,
		staleTime: 1e4
	});
	const children = Array.isArray(node.children) && node.children.length > 0 ? node.children : lazyChildren?.entries ?? null;
	return /* @__PURE__ */ jsxs(Fragment, { children: [
		/* @__PURE__ */ jsxs("div", {
			className: "mc-fe-tree-row" + (isSelected ? " is-selected" : ""),
			style: { paddingLeft: 6 + depth * 14 },
			onClick: () => isDir ? toggleExpand(node) : onSelect(node),
			onContextMenu: (e) => {
				if (onContextMenu) onContextMenu(e, node);
			},
			role: "button",
			"aria-expanded": isDir ? !!isOpen : void 0,
			tabIndex: 0,
			onKeyDown: (e) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					if (isDir) toggleExpand(node);
					else onSelect(node);
				}
			},
			children: [
				isDir ? isOpen ? /* @__PURE__ */ jsx(ChevronDown, {
					size: 12,
					style: {
						marginRight: 2,
						opacity: .55
					}
				}) : /* @__PURE__ */ jsx(ChevronRight, {
					size: 12,
					style: {
						marginRight: 2,
						opacity: .55
					}
				}) : /* @__PURE__ */ jsx("span", { style: {
					width: 14,
					display: "inline-block"
				} }),
				/* @__PURE__ */ jsx(IconComponent, {
					size: 13,
					style: {
						marginRight: 4,
						opacity: .85,
						color: isDir ? "var(--accent)" : "var(--muted)"
					}
				}),
				/* @__PURE__ */ jsx("span", {
					className: "mc-fe-tree-name min-w-0",
					children: node.name
				}),
				gitBadge(gitCode)
			]
		}),
		isDir && isOpen && Array.isArray(children) && children.map((c) => /* @__PURE__ */ jsx(TreeNode, {
			node: c,
			depth: depth + 1,
			expanded,
			toggleExpand,
			selectedPath,
			onSelect,
			gitMap,
			onContextMenu
		}, c.path)),
		isDir && isOpen && !children && /* @__PURE__ */ jsx("div", {
			style: {
				paddingLeft: 6 + (depth + 1) * 14 + 18,
				fontSize: 11,
				color: "var(--muted)"
			},
			children: lazyError ? /* @__PURE__ */ jsx(ErrorNotice, {
				variant: "inline",
				message: lazyError.message,
				askAgent: true
			}) : i18nT("treeNode.loading")
		}),
		isDir && isOpen && children && lazyError && /* @__PURE__ */ jsx("div", {
			style: {
				paddingLeft: 6 + (depth + 1) * 14 + 18,
				fontSize: 11
			},
			children: /* @__PURE__ */ jsx(ErrorNotice, {
				variant: "inline",
				message: lazyError.message,
				askAgent: true
			})
		})
	] });
}
// src/FileViewer.tsx
function renderViewerBody({ ext, fileMeta, content, openFile }) {
	if (fileMeta.binary && fileMeta.encoding !== "base64") return /* @__PURE__ */ jsx(EmptyState, {
		icon: /* @__PURE__ */ jsx(FileQuestion, { size: 22 }),
		title: i18nT("fileViewer.binary_file"),
		subtitle: `${formatBytes(fileMeta.size)} · ${fileMeta.mime || "unknown"}`
	});
	if (IMAGE_EXTS.has(ext) && fileMeta.encoding === "base64") {
		const src = `data:${fileMeta.mime || "image/png"};base64,${content}`;
		return /* @__PURE__ */ jsx("div", {
			className: "mc-fe-img-wrap",
			children: /* @__PURE__ */ jsx("img", {
				src,
				alt: openFile,
				style: {
					maxWidth: "100%",
					maxHeight: "100%"
				}
			})
		});
	}
	if (ext === ".md" || ext === ".markdown") return /* @__PURE__ */ jsx(MarkdownRenderer, { content: content || "" });
	const lang = LANG_BY_EXT[ext] || "plaintext";
	const maxRun = (content || "").match(/`{3,}/g)?.reduce((max, s) => Math.max(max, s.length), 0) ?? 0;
	const fence = "`".repeat(Math.max(3, maxRun + 1));
	const wrapped = fence + lang + "\n" + (content || "") + "\n" + fence;
	return /* @__PURE__ */ jsx(MarkdownRenderer, { content: wrapped });
}
function FileViewer({ filePath, fileMeta, content, loading, error, onReload, onDownload }) {
	const isMobile = useIsMobile();
	const [menuAt, setMenuAt] = useState(null);
	const closeMenu = useCallback(() => setMenuAt(null), []);
	if (!filePath) return /* @__PURE__ */ jsx(EmptyState, {
		icon: /* @__PURE__ */ jsx(FileText, { size: 28 }),
		title: i18nT("fileViewer.select_a_file_to_view"),
		subtitle: isMobile ? void 0 : i18nT("fileViewer.tip_ctrl_cmd_f_to_search")
	});
	if (loading) return /* @__PURE__ */ jsx(Skeleton, { className: "h-full w-full" });
	if (error) return /* @__PURE__ */ jsx("div", {
		className: "p-4",
		children: /* @__PURE__ */ jsx(ErrorNotice, {
			message: error,
			askAgent: true
		})
	});
	if (!fileMeta) return null;
	const ext = extOf(filePath);
	const fileName = basename(filePath);
	const copyPath = () => {
		copyToClipboard(filePath);
	};
	return /* @__PURE__ */ jsxs(Fragment$1, { children: [
		/* @__PURE__ */ jsxs("div", {
			className: "mc-fe-viewer-bar",
			children: [/* @__PURE__ */ jsxs("div", {
				className: "mc-fe-viewer-title",
				children: [
					/* @__PURE__ */ jsx(FileText, {
						size: 14,
						style: {
							marginRight: 6,
							opacity: .6
						}
					}),
					/* @__PURE__ */ jsx("span", {
						className: "mc-fe-viewer-filename",
						children: fileName
					}),
					/* @__PURE__ */ jsx("button", {
						className: "mc-fe-iconbtn",
						title: i18nT("fileViewer.copy_path_2", { path: filePath }),
						onClick: copyPath,
						"aria-label": i18nT("fileViewer.copy_path"),
						children: /* @__PURE__ */ jsx(Copy, { size: 11 })
					})
				]
			}), /* @__PURE__ */ jsxs("div", {
				className: "mc-fe-viewer-actions",
				children: [
					/* @__PURE__ */ jsx("span", {
						className: "mc-fe-viewer-meta",
						children: formatBytes(fileMeta.size)
					}),
					fileMeta.mtime && /* @__PURE__ */ jsxs("span", {
						className: "mc-fe-viewer-meta",
						children: [" · ", formatTime(fileMeta.mtime)]
					}),
					fileMeta.truncated && /* @__PURE__ */ jsxs("span", {
						style: {
							color: "var(--warn)",
							fontSize: 11
						},
						children: [" ", i18nT("fileViewer.truncated")]
					}),
					/* @__PURE__ */ jsx("button", {
						className: "mc-fe-iconbtn",
						title: i18nT("fileViewer.reload"),
						onClick: onReload,
						"aria-label": i18nT("fileViewer.reload"),
						children: /* @__PURE__ */ jsx(RefreshCw, { size: 12 })
					}),
					/* @__PURE__ */ jsx("button", {
						className: "mc-fe-iconbtn",
						title: i18nT("fileViewer.more_options"),
						"aria-label": i18nT("fileViewer.more_options"),
						"aria-haspopup": "menu",
						"data-fe-menu-trigger": "",
						"aria-expanded": menuAt !== null,
						onClick: (e) => {
							const r = e.currentTarget.getBoundingClientRect();
							setMenuAt(menuAt ? null : {
								x: r.right,
								y: r.bottom + 4,
								alignEnd: true
							});
						},
						children: /* @__PURE__ */ jsx(MoreHorizontal, { size: 12 })
					}),
					/* @__PURE__ */ jsx(Menu, {
						at: menuAt,
						onClose: closeMenu,
						label: i18nT("fileViewer.more_options"),
						testId: "file-viewer-menu",
						children: /* @__PURE__ */ jsxs(MenuItem, {
							onClose: closeMenu,
							onSelect: onDownload,
							children: [/* @__PURE__ */ jsx(Download, {
								size: 13,
								className: "shrink-0 text-muted"
							}), /* @__PURE__ */ jsx("span", { children: i18nT("fileViewer.download") })]
						})
					})
				]
			})]
		}),
		isSensitivePath(filePath) && /* @__PURE__ */ jsxs("div", {
			style: {
				padding: "6px 12px",
				background: "color-mix(in srgb, var(--warn) 12%, transparent)",
				borderBottom: "1px solid var(--border)",
				display: "flex",
				alignItems: "center",
				gap: 6,
				fontSize: 12,
				color: "var(--warn)"
			},
			children: [
				/* @__PURE__ */ jsx(ShieldAlert, { size: 13 }),
				" ",
				i18nT("fileViewer.sensitive_file_avoid_sharing_your_screen_while_v")
			]
		}),
		/* @__PURE__ */ jsx("div", {
			className: "mc-fe-viewer-body",
			children: renderViewerBody({
				ext,
				fileMeta,
				content,
				openFile: filePath
			})
		})
	] });
}
// src/SearchPanel.tsx
function SearchPanel({ rootPath, onClose, onJump }) {
	const [q, setQ] = useState("");
	const [include, setInclude] = useState("");
	const inputRef = useRef(null);
	useEffect(() => {
		inputRef.current?.focus();
	}, []);
	const debouncedQ = useDebouncedValue(q, 250);
	const debouncedInclude = useDebouncedValue(include, 250);
	const { data, isLoading: searching, error } = useQuery({
		queryKey: [
			"file-explorer",
			"search",
			rootPath,
			debouncedQ,
			debouncedInclude
		],
		queryFn: () => fileExplorerApi.search(rootPath, debouncedQ, debouncedInclude),
		enabled: !!debouncedQ.trim()
	});
	const results = data?.results || [];
	const engine = data?.engine || "";
	const truncated = !!data?.truncated;
	return /* @__PURE__ */ jsxs("div", {
		className: "mc-fe-search",
		children: [
			/* @__PURE__ */ jsxs("div", {
				className: "mc-fe-search-bar",
				children: [
					/* @__PURE__ */ jsx(Search, {
						size: 14,
						style: { color: "var(--muted)" }
					}),
					/* @__PURE__ */ jsx("input", {
						ref: inputRef,
						"aria-label": i18nT("searchPanel.search_in", { name: basename(rootPath) || rootPath }),
						className: "mc-fe-search-input",
						type: "text",
						placeholder: i18nT("searchPanel.search_in_2", { name: basename(rootPath) || rootPath }),
						value: q,
						onChange: (e) => setQ(e.target.value),
						onKeyDown: (e) => {
							if (e.key === "Escape") onClose();
						}
					}),
					/* @__PURE__ */ jsx("input", {
						"aria-label": i18nT("searchPanel.glob_filter_comma_separated_patterns"),
						className: "mc-fe-search-glob",
						type: "text",
						placeholder: i18nT("searchPanel.glob_e_g_md"),
						value: include,
						onChange: (e) => setInclude(e.target.value),
						title: i18nT("searchPanel.comma_separated_glob_patterns")
					}),
					/* @__PURE__ */ jsx("button", {
						className: "mc-fe-iconbtn",
						onClick: onClose,
						title: i18nT("searchPanel.close_esc"),
						"aria-label": i18nT("searchPanel.close_search"),
						children: /* @__PURE__ */ jsx(X, { size: 14 })
					})
				]
			}),
			/* @__PURE__ */ jsx("div", {
				className: "mc-fe-search-status",
				children: searching ? i18nT("searchPanel.searching") : error ? /* @__PURE__ */ jsx("span", {
					style: { color: "var(--danger)" },
					children: error.message || i18nT("searchPanel.search_failed")
				}) : `${i18nT("common.result_count", { count: results.length })}${truncated ? ` ${i18nT("searchPanel.capped")}` : ""}${engine ? ` · ${engine}` : ""}`
			}),
			/* @__PURE__ */ jsx("div", {
				className: "mc-fe-search-results",
				children: results.length === 0 && !searching && q && !error ? /* @__PURE__ */ jsx(EmptyState, {
					icon: /* @__PURE__ */ jsx(Search, { size: 22 }),
					title: i18nT("searchPanel.no_matches")
				}) : results.map((r, i) => /* @__PURE__ */ jsxs(Clickable, {
					className: "mc-fe-search-row",
					onClick: () => onJump(r),
					children: [/* @__PURE__ */ jsxs("div", {
						className: "mc-fe-search-file",
						children: [
							/* @__PURE__ */ jsx(FileText, {
								size: 11,
								style: {
									marginRight: 4,
									opacity: .6
								}
							}),
							relativeToRoot(r.file, rootPath),
							/* @__PURE__ */ jsxs("span", {
								style: {
									color: "var(--muted)",
									marginLeft: 6
								},
								children: [":", r.line]
							})
						]
					}), /* @__PURE__ */ jsx("div", {
						className: "mc-fe-search-preview",
						children: r.preview
					})]
				}, `${r.file}:${r.line}:${i}`))
			})
		]
	});
}
// src/FileExplorerPage.tsx
var newFolderTab = (rootPath = "/", label = "") => ({
	id: `ft-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
	rootPath,
	label,
	expanded: { [rootPath]: true },
	showSearch: false
});
var newFileTab = (path, folderId) => ({
	id: `of-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
	path,
	folderId
});
function FileExplorerPage() {
	const navigate = useNavigate();
	const { openChat } = useChatLauncher();
	const queryClient = useQueryClient();
	const [folderTabs, setFolderTabs] = useState([]);
	const [fileTabs, setFileTabs] = useState([]);
	const [activeFolderId, setActiveFolderId] = useState(null);
	const [activeFileId, setActiveFileId] = useState(null);
	const [leftWidth, setLeftWidth] = useState(280);
	const isMobile = useIsMobile();
	const [treeOpen, setTreeOpen] = useState(false);
	const treeBar = isMobile && !treeOpen;
	const treeFull = isMobile && treeOpen;
	const [contextNode, setContextNode] = useState(null);
	const [contextAt, setContextAt] = useState(null);
	const closeContext = useCallback(() => {
		setContextAt(null);
		setContextNode(null);
	}, []);
	const [initialized, setInitialized] = useState(false);
	const defaultRootRef = useRef("/");
	const [pendingLink, setPendingLink] = useState(null);
	useDeepLinkParam(FILE_EXPLORER_PATH_PARAM, setPendingLink);
	/** Why the last link could not be opened, shown where the tree errors show. */
	const [linkError, setLinkError] = useState(null);
	/** A link this page declined to follow (relative path) — nothing failed, so
	*  this is kept apart from `linkError` and never dressed as an error. */
	const [linkRefused, setLinkRefused] = useState(null);
	const activeFolder = useMemo(() => folderTabs.find((t) => t.id === activeFolderId) || folderTabs[0] || null, [folderTabs, activeFolderId]);
	const activeFile = useMemo(() => fileTabs.find((t) => t.id === activeFileId) || null, [fileTabs, activeFileId]);
	const { data: healthData, error: healthError } = useQuery({
		queryKey: ["file-explorer", "health"],
		queryFn: () => fileExplorerApi.health()
	});
	useEffect(() => {
		if (!healthData || initialized) return;
		const roots = healthData.allowedRoots || [];
		const defaultRoot = ((healthData.home && roots.includes(healthData.home) ? healthData.home : void 0) ?? roots.find((r) => r.includes("/home/") || r.startsWith("/Users/"))) || roots[0] || "/";
		defaultRootRef.current = defaultRoot;
		const saved = loadState();
		if (saved && saved.folderTabs?.length) {
			const ft = saved.folderTabs.map((t) => {
				return !!t.rootPath && (!roots.length || roots.some((r) => underRoot(t.rootPath, r))) ? {
					...newFolderTab(t.rootPath, t.label),
					id: t.id,
					expanded: t.expanded || { [t.rootPath]: true }
				} : {
					...newFolderTab(defaultRoot, t.label),
					id: t.id
				};
			});
			setFolderTabs(ft);
			setActiveFolderId(saved.activeFolderId || ft[0].id);
			if (saved.fileTabs?.length) {
				setFileTabs(saved.fileTabs.map((f) => ({
					...newFileTab(f.path, f.folderId),
					id: f.id
				})));
				setActiveFileId(saved.activeFileId || null);
			}
			if (saved.leftWidth) setLeftWidth(saved.leftWidth);
		} else {
			const t = newFolderTab(defaultRoot);
			setFolderTabs([t]);
			setActiveFolderId(t.id);
		}
		setInitialized(true);
	}, [healthData, initialized]);
	useEffect(() => {
		if (!initialized) return;
		const timer = setTimeout(() => {
			saveState({
				folderTabs: folderTabs.map((t) => ({
					id: t.id,
					rootPath: t.rootPath,
					label: t.label,
					expanded: t.expanded
				})),
				fileTabs: fileTabs.map((f) => ({
					id: f.id,
					path: f.path,
					folderId: f.folderId
				})),
				activeFolderId,
				activeFileId,
				leftWidth
			});
		}, 300);
		return () => clearTimeout(timer);
	}, [
		folderTabs,
		fileTabs,
		activeFolderId,
		activeFileId,
		leftWidth,
		initialized
	]);
	const updateFolderTab = useCallback((id, patch) => {
		setFolderTabs((tabs) => tabs.map((t) => t.id === id ? typeof patch === "function" ? patch(t) : {
			...t,
			...patch
		} : t));
	}, []);
	const { data: treeData, error: treeError } = useQuery({
		queryKey: [
			"file-explorer",
			"tree",
			activeFolder?.rootPath
		],
		queryFn: () => fileExplorerApi.tree(activeFolder.rootPath, 2),
		enabled: !!activeFolder?.rootPath && initialized
	});
	const { data: rootGitData } = useQuery({
		queryKey: [
			"file-explorer",
			"git-status",
			activeFolder?.rootPath
		],
		queryFn: () => fileExplorerApi.gitStatus(activeFolder.rootPath),
		enabled: !!activeFolder?.rootPath && initialized,
		staleTime: 3e4
	});
	const discoveredRoots = useMemo(() => {
		const found = /* @__PURE__ */ new Set();
		function walk(node) {
			if (!node) return;
			if (node.isGitRoot && node.path) found.add(node.path);
			if (Array.isArray(node.children)) node.children.forEach(walk);
		}
		if (treeData?.entries) treeData.entries.forEach(walk);
		return [...found];
	}, [treeData]);
	const gitQueryData = useQueries({ queries: discoveredRoots.map((p) => ({
		queryKey: [
			"file-explorer",
			"git-status",
			p
		],
		queryFn: () => fileExplorerApi.gitStatus(p),
		staleTime: 3e4,
		enabled: !!activeFolder
	})) }).map((q) => q.data);
	const tabGitMap = useMemo(() => {
		const map = /* @__PURE__ */ new Map();
		if (rootGitData?.repoRoot) map.set(rootGitData.repoRoot, rootGitData);
		for (const d of gitQueryData) if (d?.repoRoot) map.set(d.repoRoot, d);
		return map;
	}, [rootGitData, ...gitQueryData]);
	const toggleExpand = useCallback(async (node) => {
		if (!activeFolder) return;
		const wasOpen = !!activeFolder.expanded[node.path];
		updateFolderTab(activeFolder.id, (cur) => ({
			...cur,
			expanded: {
				...cur.expanded,
				[node.path]: !wasOpen
			}
		}));
	}, [activeFolder, updateFolderTab]);
	const { data: fileData, error: fileError, isLoading: fileLoading } = useQuery({
		queryKey: [
			"file-explorer",
			"read",
			activeFile?.path
		],
		queryFn: () => fileExplorerApi.read(activeFile.path),
		enabled: !!activeFile?.path
	});
	const fileTabsRef = useRef(fileTabs);
	fileTabsRef.current = fileTabs;
	/** Open `path` as a file tab under the folder tab `folderId`, and make both
	*  active. Reuses an existing tab for the same path in that folder. */
	const openFileInFolder = useCallback((folderId, path) => {
		if (isMobile) setTreeOpen(false);
		setActiveFolderId(folderId);
		const existing = fileTabsRef.current.find((ft) => ft.path === path && ft.folderId === folderId);
		if (existing) {
			setActiveFileId(existing.id);
			return;
		}
		const ft = newFileTab(path, folderId);
		setFileTabs((tabs) => [...tabs, ft]);
		setActiveFileId(ft.id);
	}, [isMobile]);
	const openFile = useCallback(async (path, _opts = {}) => {
		if (!activeFolder) return;
		openFileInFolder(activeFolder.id, path);
	}, [activeFolder, openFileInFolder]);
	const reloadFile = useCallback(() => {
		if (!activeFile) return;
		queryClient.invalidateQueries({ queryKey: [
			"file-explorer",
			"read",
			activeFile.path
		] });
	}, [activeFile, queryClient]);
	const refreshTree = useCallback(() => {
		if (!activeFolder) return;
		queryClient.invalidateQueries({ queryKey: [
			"file-explorer",
			"tree",
			activeFolder.rootPath
		] });
		queryClient.invalidateQueries({ queryKey: ["file-explorer", "tree-node"] });
		queryClient.invalidateQueries({ queryKey: ["file-explorer", "git-status"] });
	}, [activeFolder, queryClient]);
	const downloadFile = useCallback(() => {
		if (!activeFile || !fileData) return;
		const content = fileData.content || "";
		const blob = fileData.encoding === "base64" ? (() => {
			const b = atob(content);
			const u = new Uint8Array(b.length);
			for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i);
			return new Blob([u], { type: fileData.mime || "application/octet-stream" });
		})() : new Blob([content], { type: "text/plain;charset=utf-8" });
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = basename(activeFile.path);
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(url);
	}, [activeFile, fileData]);
	const newFolderTabAction = useCallback(() => {
		const t = newFolderTab(activeFolder?.rootPath || defaultRootRef.current);
		setFolderTabs((tabs) => [...tabs, t]);
		setActiveFolderId(t.id);
		setActiveFileId(null);
	}, [activeFolder]);
	const closeFolderTab = useCallback((id) => {
		setFileTabs((tabs) => tabs.filter((ft) => ft.folderId !== id));
		setActiveFileId((cur) => {
			if (!cur) return null;
			return fileTabsRef.current.find((t) => t.id === cur)?.folderId === id ? null : cur;
		});
		setFolderTabs((tabs) => {
			const remaining = tabs.filter((t) => t.id !== id);
			if (remaining.length === 0) {
				const fresh = newFolderTab(defaultRootRef.current);
				setActiveFolderId(fresh.id);
				return [fresh];
			}
			setActiveFolderId((cur) => cur === id ? remaining[0].id : cur);
			return remaining;
		});
	}, []);
	const closeFileTab = useCallback((id) => {
		setFileTabs((prev) => {
			const next = prev.filter((t) => t.id !== id);
			setActiveFileId((curActive) => {
				if (curActive !== id) return curActive;
				const remaining = next.filter((t) => t.folderId === activeFolderId);
				return remaining.length > 0 ? remaining[remaining.length - 1].id : null;
			});
			return next;
		});
	}, [activeFolderId]);
	const activateFolder = useCallback((id) => {
		setActiveFolderId(id);
		setActiveFileId(null);
	}, []);
	const activateFile = useCallback((id) => {
		const ft = fileTabsRef.current.find((t) => t.id === id);
		if (ft) {
			setActiveFolderId(ft.folderId);
			setActiveFileId(id);
		}
	}, []);
	const renameFolderTab = useCallback((id, label) => {
		updateFolderTab(id, { label });
	}, [updateFolderTab]);
	const changeRoot = useCallback((newPath) => {
		if (!newPath || !activeFolder || newPath === activeFolder.rootPath) return;
		setFileTabs((tabs) => tabs.filter((ft) => ft.folderId !== activeFolder.id));
		setActiveFileId(null);
		updateFolderTab(activeFolder.id, {
			rootPath: newPath,
			expanded: { [newPath]: true }
		});
	}, [activeFolder, updateFolderTab]);
	const resolveMutation = useMutation({
		mutationFn: (path) => fileExplorerApi.resolve(path),
		onSuccess: (r, path) => {
			if (r && r.exists && r.type === "dir") changeRoot(path);
			else if (r && r.exists && r.type === "file") {
				const parent = dirname(path);
				if (activeFolder && parent !== activeFolder.rootPath) updateFolderTab(activeFolder.id, {
					rootPath: parent,
					expanded: { [parent]: true }
				});
				openFile(path);
			} else changeRoot(path);
		},
		onError: (_, path) => changeRoot(path)
	});
	const openMaybe = useCallback((path) => {
		resolveMutation.mutate(path);
	}, [resolveMutation]);
	const revealMutate = useMutation({
		mutationFn: (path) => fileExplorerApi.resolve(path),
		onSuccess: (r, asked) => {
			if (!r?.exists) {
				setLinkError({
					path: asked,
					message: i18nT("fileExplorerPage.link_target_missing")
				});
				return;
			}
			const isDir = r.type === "dir";
			if (!isDir && r.type !== "file") {
				setLinkError({
					path: asked,
					message: i18nT("fileExplorerPage.link_target_unsupported")
				});
				return;
			}
			const path = r.path || asked;
			const dir = isDir ? path : parentDir(path) ?? path;
			const containing = [activeFolder, ...folderTabs].find((t) => !!t && underRoot(path, t.rootPath));
			const tab = containing ?? newFolderTab(dir);
			if (containing) {
				const chain = revealChain(tab.rootPath, dir);
				updateFolderTab(tab.id, (cur) => ({
					...cur,
					expanded: {
						...cur.expanded,
						...Object.fromEntries(chain.map((d) => [d, true]))
					}
				}));
			} else setFolderTabs((tabs) => [...tabs, tab]);
			if (isDir) {
				setActiveFolderId(tab.id);
				setActiveFileId(null);
			} else openFileInFolder(tab.id, path);
		},
		onError: (err, asked) => {
			setLinkError({
				path: asked,
				message: err.message
			});
		}
	}).mutate;
	useEffect(() => {
		if (!initialized || pendingLink === null) return;
		setPendingLink(null);
		setLinkError(null);
		setLinkRefused(null);
		if (!isAbsolutePath(pendingLink)) {
			setLinkRefused(pendingLink);
			return;
		}
		revealMutate(pendingLink);
	}, [
		initialized,
		pendingLink,
		revealMutate
	]);
	const toggleSearch = useCallback(() => {
		if (!activeFolder) return;
		updateFolderTab(activeFolder.id, (cur) => ({
			...cur,
			showSearch: !cur.showSearch
		}));
	}, [activeFolder, updateFolderTab]);
	const chatAboutPath = useCallback((path, kind = "file") => {
		const message = `I'd like to discuss the ${kind === "dir" ? "folder" : "file"} \`${path}\`. Please read it and help me understand or modify it.`;
		openChat({
			message,
			autoSend: false
		});
	}, [openChat]);
	const onTreeContextMenu = useCallback((_e, node) => {
		setContextNode(node);
	}, []);
	const onPaneContextMenu = useCallback((e) => {
		e.preventDefault();
		setContextAt({
			x: e.clientX,
			y: e.clientY
		});
	}, []);
	useEffect(() => {
		const onKey = (e) => {
			if (isShortcut(e) && e.key.toLowerCase() === "f") {
				e.preventDefault();
				toggleSearch();
			} else if (isShortcut(e) && !e.shiftKey && e.key.toLowerCase() === "t") {
				e.preventDefault();
				newFolderTabAction();
			} else if (isShortcut(e) && e.key.toLowerCase() === "w") {
				e.preventDefault();
				if (activeFile) closeFileTab(activeFile.id);
				else if (activeFolder) closeFolderTab(activeFolder.id);
			} else if (e.key === "Escape" && activeFolder?.showSearch) {
				e.preventDefault();
				toggleSearch();
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [
		toggleSearch,
		newFolderTabAction,
		closeFolderTab,
		closeFileTab,
		activeFile,
		activeFolder
	]);
	const startWRef = useRef(0);
	const leftDraggingRef = useRef(false);
	const leftResize = usePointerDrag({
		threshold: 0,
		onStart: () => {
			startWRef.current = leftWidth;
			leftDraggingRef.current = true;
			document.body.style.cursor = "col-resize";
		},
		onMove: ({ dx }) => {
			setLeftWidth(Math.max(180, Math.min(640, startWRef.current + dx)));
		},
		onEnd: () => {
			leftDraggingRef.current = false;
			document.body.style.cursor = "";
		}
	});
	useEffect(() => () => {
		if (leftDraggingRef.current) document.body.style.cursor = "";
	}, []);
	const rootGitInfo = useMemo(() => {
		if (!activeFolder) return null;
		if (tabGitMap.has(activeFolder.rootPath)) return tabGitMap.get(activeFolder.rootPath);
		let best = null;
		for (const [root, info] of tabGitMap.entries()) if (activeFolder.rootPath === root || activeFolder.rootPath.startsWith(root + "/")) {
			if (!best || root.length > best.repoRoot.length) best = info;
		}
		return best;
	}, [tabGitMap, activeFolder?.rootPath]);
	const appDisabled = healthError?.status === 403 && apiErrorCode(healthError) === "app_not_enabled";
	const healthBanner = healthError && (appDisabled ? /* @__PURE__ */ jsx(ErrorNotice, {
		variant: "block",
		title: i18nT("common.app_disabled_title"),
		message: i18nT("common.app_disabled_hint"),
		askAgent: true,
		footer: /* @__PURE__ */ jsx(Btn, {
			onClick: () => navigate("/apps"),
			children: i18nT("common.apps")
		})
	}) : /* @__PURE__ */ jsx(ErrorNotice, {
		variant: "block",
		title: i18nT("fileExplorerPage.backend_not_reachable"),
		message: healthError.message,
		askAgent: true
	}));
	if (!initialized) return /* @__PURE__ */ jsxs("div", {
		className: "mc-fe-root",
		children: [/* @__PURE__ */ jsx("style", { children: FE_CSS }), healthBanner || /* @__PURE__ */ jsx("div", {
			className: "mc-fe-empty",
			style: { height: "100%" },
			children: /* @__PURE__ */ jsx(Skeleton, { className: "h-full w-full" })
		})]
	});
	if (!activeFolder) return null;
	const currentFileTabs = fileTabs.filter((ft) => ft.folderId === activeFolder.id);
	const showSearch = activeFolder.showSearch;
	const viewingFile = activeFile && activeFile.folderId === activeFolder.id ? activeFile : null;
	const treeRoot = treeData ? {
		name: basename(activeFolder.rootPath) || activeFolder.rootPath,
		path: activeFolder.rootPath,
		type: "dir",
		children: treeData.entries
	} : null;
	return /* @__PURE__ */ jsxs("div", {
		className: "mc-fe-root",
		children: [
			/* @__PURE__ */ jsx("style", { children: FE_CSS }),
			/* @__PURE__ */ jsx(TabStrip, {
				folderTabs,
				fileTabs: currentFileTabs,
				activeFolderId,
				activeFileId: viewingFile?.id || null,
				onActivateFolder: activateFolder,
				onActivateFile: activateFile,
				onCloseFolder: closeFolderTab,
				onCloseFile: closeFileTab,
				onNewFolder: newFolderTabAction,
				onRenameFolder: renameFolderTab
			}),
			healthBanner,
			treeError && /* @__PURE__ */ jsx(ErrorNotice, {
				variant: "block",
				title: i18nT("fileExplorerPage.cannot_open_folder"),
				message: treeError.message,
				askAgent: true
			}),
			linkError && /* @__PURE__ */ jsx(ErrorNotice, {
				variant: "block",
				title: i18nT("fileExplorerPage.link_open_failed", { path: linkError.path }),
				message: linkError.message,
				messagePlacement: "below",
				onDismiss: () => setLinkError(null),
				askAgent: true,
				testId: "file-explorer-link-error"
			}),
			linkRefused !== null && /* @__PURE__ */ jsxs("div", {
				className: "mc-fe-banner",
				role: "status",
				"data-testid": "file-explorer-link-refused",
				children: [
					/* @__PURE__ */ jsx(AlertTriangle, {
						size: 12,
						"aria-hidden": "true"
					}),
					/* @__PURE__ */ jsx("span", {
						className: "mc-fe-banner-text",
						children: i18nT("fileExplorerPage.link_target_relative", { path: linkRefused })
					}),
					/* @__PURE__ */ jsx("button", {
						type: "button",
						className: "mc-fe-iconbtn mc-fe-banner-dismiss",
						"aria-label": i18nT("common.dismiss"),
						onClick: () => setLinkRefused(null),
						children: /* @__PURE__ */ jsx(X, { size: 12 })
					})
				]
			}),
			/* @__PURE__ */ jsx(PathBar, {
				rootPath: activeFolder.rootPath,
				gitInfo: rootGitInfo,
				onChangeRoot: changeRoot,
				onNavigate: openMaybe,
				onRefresh: refreshTree
			}),
			/* @__PURE__ */ jsxs("div", {
				className: `mc-fe-split${isMobile ? " is-stacked" : ""}`,
				children: [
					isMobile && /* @__PURE__ */ jsxs(Btn, {
						onClick: () => setTreeOpen(!treeOpen),
						className: "mc-fe-treebar",
						"aria-expanded": treeOpen,
						children: [treeOpen ? /* @__PURE__ */ jsx(ChevronUp, { size: 13 }) : /* @__PURE__ */ jsx(ChevronDown, { size: 13 }), activeFolder.label || basename(activeFolder.rootPath) || activeFolder.rootPath]
					}),
					/* @__PURE__ */ jsxs("div", {
						className: `mc-fe-left${treeBar ? " is-hidden" : ""}`,
						style: { width: treeFull ? "100%" : leftWidth },
						children: [treeRoot ? /* @__PURE__ */ jsx("div", {
							className: "mc-fe-tree",
							onContextMenu: onPaneContextMenu,
							children: /* @__PURE__ */ jsx(TreeNode, {
								node: treeRoot,
								depth: 0,
								expanded: activeFolder.expanded,
								toggleExpand,
								selectedPath: viewingFile?.path || "",
								onSelect: (n) => openFile(n.path),
								gitMap: tabGitMap,
								onContextMenu: onTreeContextMenu
							})
						}) : treeError ? /* @__PURE__ */ jsxs("div", {
							className: "mc-fe-empty",
							style: {
								flexDirection: "column",
								gap: 8
							},
							children: [i18nT("fileExplorerPage.folder_unavailable"), /* @__PURE__ */ jsxs(Btn, {
								onClick: () => changeRoot(dirname(activeFolder.rootPath)),
								children: [
									/* @__PURE__ */ jsx(CornerDownRight, { size: 13 }),
									" ",
									i18nT("fileExplorerPage.go_to_parent_folder")
								]
							})]
						}) : /* @__PURE__ */ jsx("div", {
							className: "mc-fe-empty",
							children: /* @__PURE__ */ jsx(Skeleton, { className: "h-full w-full" })
						}), contextNode && /* @__PURE__ */ jsxs(Menu, {
							at: contextAt,
							onClose: closeContext,
							label: contextNode.name,
							testId: "file-explorer-context-menu",
							children: [
								/* @__PURE__ */ jsxs(MenuItem, {
									onClose: closeContext,
									onSelect: () => chatAboutPath(contextNode.path, contextNode.type),
									children: [
										/* @__PURE__ */ jsx(MessageSquare, { size: 12 }),
										" ",
										i18nT("fileExplorerPage.chat_about_this"),
										" ",
										contextNode.type === "dir" ? "folder" : "file"
									]
								}),
								contextNode.type !== "dir" && /* @__PURE__ */ jsxs(MenuItem, {
									onClose: closeContext,
									onSelect: () => openFile(contextNode.path),
									children: [
										/* @__PURE__ */ jsx(Eye, { size: 12 }),
										" ",
										i18nT("fileExplorerPage.open")
									]
								}),
								contextNode.type === "dir" && /* @__PURE__ */ jsxs(MenuItem, {
									onClose: closeContext,
									onSelect: () => changeRoot(contextNode.path),
									children: [
										/* @__PURE__ */ jsx(CornerDownRight, { size: 12 }),
										" ",
										i18nT("fileExplorerPage.open_as_workspace_root")
									]
								}),
								/* @__PURE__ */ jsxs(MenuItem, {
									onClose: closeContext,
									onSelect: () => {
										copyToClipboard(contextNode.path);
									},
									children: [
										/* @__PURE__ */ jsx(Copy, { size: 12 }),
										" ",
										i18nT("fileExplorerPage.copy_path")
									]
								}),
								/* @__PURE__ */ jsxs(MenuItem, {
									onClose: closeContext,
									onSelect: () => changeRoot(dirname(contextNode.path)),
									children: [
										/* @__PURE__ */ jsx(ArrowUpFromLine, { size: 12 }),
										" ",
										i18nT("fileExplorerPage.reveal_parent")
									]
								})
							]
						})]
					}),
					!isMobile && /* @__PURE__ */ jsx("div", {
						className: "mc-fe-resizer",
						"aria-label": i18nT("fileExplorerPage.resize_panel"),
						"aria-orientation": "vertical",
						role: "separator",
						tabIndex: -1,
						style: { touchAction: "none" },
						...leftResize
					}),
					/* @__PURE__ */ jsx("div", {
						className: `mc-fe-right${treeFull ? " is-hidden" : ""}`,
						children: showSearch ? /* @__PURE__ */ jsx(SearchPanel, {
							rootPath: activeFolder.rootPath,
							onClose: toggleSearch,
							onJump: (r) => {
								openFile(r.file, { reveal: true });
								updateFolderTab(activeFolder.id, { showSearch: false });
							}
						}) : /* @__PURE__ */ jsx(FileViewer, {
							filePath: viewingFile?.path || null,
							fileMeta: fileData || null,
							content: fileData?.content ?? "",
							loading: fileLoading,
							error: fileError ? fileError.message : null,
							onReload: reloadFile,
							onDownload: downloadFile
						})
					})
				]
			})
		]
	});
}
// src/index.tsx
/**
* The bundle's entry: AppHost lazy-imports this module and renders its default
* export as the app's page.
*
* It binds the host's permission-scoped API client before any child renders,
* and subscribes to the host's language generation, which is what repaints the
* page on a language switch: `t` reads the active locale at call time, and this
* component's re-render reaches every child.
*/
function FileExplorerApp() {
	bindAppApi(useAppApi());
	useLanguageGeneration();
	return /* @__PURE__ */ jsx(FileExplorerPage, {});
}
export { FileExplorerApp as default };
