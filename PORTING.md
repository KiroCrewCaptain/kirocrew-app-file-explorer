# Porting notes: built-in → external app

This repository was ported from Kiro Crew's built-in app at
`src/kiro_crew/apps/builtins/file_explorer/` (KiroCrew `main` at `390c5315be`),
its dashboard page at `website/src/apps/file-explorer/`, its store art at
`website/public/app-assets/file-explorer/`, and its tests: the two under the
app's own `tests/`, `test/test_file_explorer_app.py`, the file-explorer cases of
`test/test_windows_extended_prefix_containment.py`, `test/test_dashboard_file_io.py`,
`test/test_dashboard_snapshot.py` and `test/test_builtin_backend_address_reuse.py`,
and the eight `website/src/test/` files named in [Tests](#tests) plus the
file-explorer cases of three cross-site suites.

Line numbers below refer to that commit unless they name a file in this
repository. "Gap" means something the built-in gets from Kiro Crew that an
external app has no public way to get today. Each gap is a Kiro Crew change, not
a change here.

## What carried over unchanged

- `app.json` `name` (`file-explorer`), `permissions`
  (`api: ["/apps/file-explorer/api"]`), `platform`, `defaultEnabled` (`false`),
  every display field, `useCases` and `configuration`.
  `tests/test_manifest_contract.py` compares them with the built-in's manifest
  (`tests/fixtures/builtin-app.json`), because adoption refuses a manifest that
  would widen a grant or force the app off. The `version` started equal to the
  built-in's (`1.0.0`) and only moves up: adoption matches it against Kiro
  Crew's pin of one commit here, and a later commit's patch bump is what shows
  an adopted user the update. See [Fixes since the port](#fixes-since-the-port).
- The backend's process model: a stdlib `ThreadingHTTPServer` the gateway spawns
  and reverse-proxies at `/apps/file-explorer/api/*`, with `port: "auto"` and
  `healthCheck: "/health"`. Every route, its query parameters, validation and
  response shape, the allow-list of roots, the credential and crew-home fences,
  the ignore lists, both search engines and the git-status parser are the
  built-in's `server.py` line for line: `diff` against it shows only the host
  bridge, one added `/health` field and the two changes in the table below.
- The page's markup, class strings, CSS (`ui/src/styles.ts`), keyboard shortcuts
  and behaviour, including the saved-state key `kc:file-explorer:state:v2`, so an
  existing user's open folders and tabs come back.

## What changed, and why

| Built-in | Here | Why |
|---|---|---|
| `"backend": {"entryPoint": "kiro_crew.apps.builtins.file_explorer.server"}` (`app.json:45`) | `"entryPoint": "backend/server.py"` | A module-style entry resolves only inside the Kiro Crew package (`apps/manifest.py` `is_module_style_entry_point`, `apps/backend.py:450-459` `shipped_builtin_module_path`). A file entry inside the app's own tree is the external form. |
| A spawned backend | Still a spawned backend, **not** `backend.hooks` | Deliberate. The launcher wraps every app backend in the OS sandbox and the cgroup ceiling at spawn (`apps/backend.py:1228`, `:1254`), so a file browser that runs as its own process keeps the credential-home masks under it. In-gateway hooks would run the same reads inside the gateway process with no OS fence at all. It also keeps the proxy path, and therefore `permissions.api`, identical to the built-in's, so adoption is not a grant change. The App Kit level-1 seams (`ctx.require_owner`, `ctx.embed`, `ctx.sdk_level`) are hook-context members and have no consumer in a spawned backend; the app is read-only, so it has no write to gate. |
| `from kiro_crew... import ...` at module top (`server.py:49-61`) | One feature-detected host bridge (`backend/server.py:54-243`) | See [Host bridge](#host-bridge-private-kiro-crew-imports). |
| `platform_compat.IS_POSIX`, `strip_extended_length_prefix`, `tcc_protected_dirs_for_walk` (`server.py:49`) | `_Platform` (`backend/server.py:207-243`) | Three small pure helpers, re-stated with the same behaviour rather than imported. |
| `boot_platform(KiroCrewConfig.load())` in `main()` (`server.py:1387-1393`) | `_boot_host_platform()` | Same call when the host has it; skipped (and reported) when it does not, which can only happen on a host that has no sandbox wrapper this backend could use either. |
| `sel().log_api_access(..., source="builtin-app")` (`server.py:485-491`) | `source="app"` | This copy is an installed app; it says so, using the source the host's own app audit SDK writes (`apps/audit_sdk.py:99`). |
| `/health` | Adds `hostGaps: []` | Names any host capability this process could not import, so an operator can see why something is refused. |
| `iconUrl` / `heroImage*` as absolute `/app-assets/...` SVGs (`app.json:49-53`) | `iconPath` / `heroImage*` / `screenshots` as repo-relative PNGs under `assets/` | A registry app's art is repo-relative, and the catalog's publish step refuses SVG for a non-builtin source. The PNGs were rendered from the built-in SVGs (the icon at 512×512 on an opaque tile with its `--ico-a` / `--ico-b` tokens resolved to fixed amber tones; heroes at 1200×675; detail banners at 1200×288). The original SVGs are kept beside them. The store screenshot is the README's light hero. |
| `ui.pages` `[{"route": "/file-explorer", "icon": "FolderTree"}]`, page compiled into the dashboard (`app.json:35-42`, `website/src/apps/builtinRegistry.ts:55`) | `ui.entry: "dist/index.mjs"` (a committed ESM bundle built from `ui/src/`), `ui.pages` `[{"route": "/apps/file-explorer", "label": "Files"}]`, no `icon` | An installed app ships its page as a bundle AppHost loads. The legacy `/file-explorer` route, nav id and `FolderTree` glyph of an ADOPTED record come from Kiro Crew's adoption pin (`legacyNav`), never from this manifest, so a fresh install cannot claim them. |
| App Store copy keys in the dashboard catalogs (`apps.fileExplorer.manifest.*`) | `l10n` block in `app.json`, one entry per shipped non-English locale | The listing copy travels with the app. It is the `manifest` subtree of `ui/i18n/<locale>.json`, kept equal by a test. |
| No `minKiroCrewVersion` | `"minKiroCrewVersion": "0.12.0"` | The first Kiro Crew whose dashboard reads `l10n` and whose adoption can carry this record. The page itself uses only names every earlier App SDK exports. |

## Host bridge: private Kiro Crew imports

The backend runs under the gateway's own interpreter (it has no
`requirements.txt`, so no app venv is made), so it can import the host's own
security code instead of copying it, which would drift from the policy every
other Kiro Crew surface enforces. None of these is a published App Kit surface
for a spawned backend yet. Each import is therefore feature-detected
(`try`/`except`), and a missing one never widens access.
`tests/test_host_bridge.py` pins the exact list, that each is guarded, and the
behaviour both with no `kiro_crew` at all and with a stand-in one.

| Built-in import | Use | Without it |
|---|---|---|
| `kiro_crew.apps.proxy_auth.verify_proxy_request` | The gateway's signature on every proxied request (CWE-306) | Every route but `/health` answers 401. (This one IS public: App Kit `api-reference.md`, "Proxy Authentication".) |
| `kiro_crew.security.is_sensitive_path` | The shared credential fence, on every resolved path | Every path is treated as sensitive: 403 |
| `kiro_crew.hooks.safe_read_file_bytes` | The link-safe, descriptor-checked read behind image previews and the in-process search | Every read is refused: 403 |
| `kiro_crew.hooks.{safe_read_prefix, FileTooLargeError}` | The same read, stopped after N bytes: the binary sniff and the text preview, so a file past the host's 50 MB whole-file cap still previews; and the error that cap raises, which the in-process search skips | Every text read is refused: 403 (`safe_read_prefix`) |
| `kiro_crew.github_runner.validate_provider_executable` | The provenance check the host's own file search runs on the `rg` it finds on `$PATH`, which can reach a tree the agent writes | No `rg` is run: search uses the in-process engine (`executable_provenance`) |
| `kiro_crew.sandbox.{wrap_argv, cgroup_scope_argv, run_limited, SandboxUnavailableError}` | Sandbox and cgroup wrapping for the `git` and `rg` children | `git` is never run: `/git-status` answers the built-in's typed 503 `sandbox_unavailable`; search uses the in-process engine |
| `kiro_crew.sel.sel` | The security event log | The audit line goes to this process's own log |
| `kiro_crew.platform.boot_platform`, `kiro_crew.config.loader.KiroCrewConfig` | The platform context the sandbox wrapper reads | Skipped and reported (`platform_boot`) |

## Remaining gaps

1. **A public backend seam for spawned app processes.** The private imports
   above (`backend/server.py:103-186`, `:189-204`) are a Kiro Crew change away
   from being a published module, for example `kiro_crew.apps.sdk.backend` with
   `is_sensitive_path`, `safe_read`, `safe_read_prefix`, `vetted_executable`,
   `sandboxed_run` and `audit`. Until then a
   release that moves one of them makes this app refuse that capability (closed,
   reported in `/health`), not break open. Kiro Crew's `dashboard/handlers/files.py:867-882`
   comment and `security/paths_lists.py:1226` name this app as a reader; they need
   wording that does not.
2. **Execution trust.** A built-in's spawned backend is admitted without a grant
   (`apps/backend.py:463-473`, `is_builtin_app`). This copy's backend starts only
   when the operator trusts it (`agent.apps_trusted`, or
   `agent.apps_allow_third_party`), and it is subject to the third-party
   revocation sweep. For an existing user, Kiro Crew's adoption writes that grant
   for this repository in the same transaction that moves the record; a fresh
   install goes through the normal trust dialog.
3. **"Open with default app" and "Reveal in file manager".** The built-in's
   viewer overflow (`FileViewer.tsx:13`, `:99-127`) called Kiro Crew's
   `revealPath` (`website/src/api/client/files.ts:153`), a route outside this
   app's `permissions.api`. Adding it would widen the grant, which adoption
   refuses, so the overflow offers **Download** only. Closing this needs an App
   SDK reveal action the host gates itself.
4. **Relative images inside rendered markdown.** The built-in wrapped the
   renderer in `BasePathCtx` (`FileViewer.tsx:3`, `:36`) so `![](diagram.png)`
   loaded from beside the file. The App SDK exports `MarkdownRenderer` but not
   that context (`website/src/kirocrew-ui/index.ts`), so such an image shows its
   fallback (`ui/src/FileViewer.tsx:30-37`).
5. **Syntax highlighting for extensions only the host knows.** The built-in asked
   `utils/highlightLanguages.highlightLanguageForExtension` (`FileViewer.tsx:12`,
   `:40`) for extensions outside its own table. This copy uses its own
   `LANG_BY_EXT` (`ui/src/constants.ts`) and shows anything else as plain text.
6. **Context menu and dropdown primitives.** The dashboard's `context-menu` and
   `dropdown-menu` components (`FileExplorerPage.tsx:11`, `FileViewer.tsx:6-8`)
   are not in the UI SDK; `ui/src/lib/Menu.tsx` is a small local menu with the
   same items, roles and keyboard handling. Likewise `usePointerDrag`,
   `usePointerMotion`, `useScrollEdges`, `useWheelToHorizontal` and `useIsMobile`
   are copied into `ui/src/lib/`, and `fmtBytes` / `fmtDateTimeNumeric` are
   rebuilt on the SDK's `fmtNumber` and `activeLocale` (`ui/src/lib/format.ts`).
7. **Deep link while the page is open.** The built-in watched `?path=` through
   the dashboard router (`FileExplorerPage.tsx:70-81`). A bundle cannot import
   the router, so `ui/src/lib/useDeepLinkParam.ts` reads `window.location` on
   every render and on `popstate`. A second link to an already-open page is taken
   when the host re-renders that route.
8. **Core still imports this app's frontend.** `website/src/components/FilePathMenu.tsx:60`
   (`parentDir`), `website/src/components/MarkdownPanelHeader.tsx:6`
   (`FILE_EXPLORER_APP`, `FILE_EXPLORER_ROUTE`, `fileExplorerDeepLink`) and
   `website/src/pages/chat/FileBrowserRail.tsx:2` (`useDebouncedValue`) import
   from `website/src/apps/file-explorer/`. Those helpers must move into core (and
   the "Open in Files" link must find the page by its installed route, which is
   `/apps/file-explorer` for a fresh install) before that directory can leave.
   The link builder is not carried here: this repository only reads the link.
9. **Synced saved state.** Kiro Crew syncs `kc:file-explorer:state:v2` across a
   user's browsers because its ui-prefs allowlist names it
   (`website/src/lib/uiPrefs.ts:412`, `:479`), which is core hard-coding this
   app. The bundle keeps writing the same `localStorage` key, so an existing
   user's tabs survive either way; keeping them synced after the built-in leaves
   needs a generic per-app synced-prefs seam (or the SDK's view-state store).
10. **Edition declaration and core fixtures.** `platform/defaults.py:496-498`
    (`DefaultAppsLoader.bundled_app_names` returns `file_explorer`) and the core
    tests that use this app as the canonical shipped built-in
    (`test/test_app_execution.py`, `test/test_trusted_apps_api.py`,
    `test/test_app_backend.py`, `test/test_builtin_backend_address_reuse.py:36`,
    `test/test_builtin_app_platform_declarations.py`,
    `test/test_host_isolation_floor.py:1025`) need re-pointing when the built-in
    is removed. Kiro Crew's `test/test_dashboard_file_io.py:251` compares its
    binary-extension list with this app's module; this side pins the same list
    against a snapshot (`tests/fixtures/core-binary-exts.json`,
    `tests/test_core_parity.py`), and the Kiro Crew half needs its own pin.
11. **Styles.** The page keeps a few Tailwind utility class strings from the
    built-in (`h-full w-full`, `min-w-0`, `p-4`, `shrink-0 text-muted`,
    `whitespace-normal`). They render because the dashboard's stylesheet still
    carries them while the compiled built-in page ships with Kiro Crew.
12. **Store listing localization.** The catalog's publish step does not carry
    `l10n` yet, so a store row that is not installed shows the English fields. An
    installed copy is localized from its own manifest.
13. **Sidebar icon on a fresh install.** The Lucide `FolderTree` glyph and the
    `/file-explorer` route are shown only for an adopted record (from Kiro Crew's
    pin). A fresh install from the App Store lives at `/apps/file-explorer` with
    the `iconPath` image.
14. **Author.** `app.json` keeps `"author": "kirocrew"`, the built-in's value.
    The catalog's publish step refuses a manifest-asserted reserved author, so
    attribution is stated on the catalog row.

## UI

The page is `ui/src/`, ported from `website/src/apps/file-explorer/` with the
same markup, class strings and behaviour. `npm run build` in `ui/` writes the
committed `ui/dist/index.mjs`; CI rebuilds it and fails on a difference. Every
SDK name the bundle imports exists on a host before App Kit level 1, so it needs
no namespace feature checks (`tests/test_manifest_contract.py` reads the built
file).

| Built-in | Here |
|---|---|
| `fetch('/apps/file-explorer/api/...')` + `api/apiError.toApiError` (`api.ts`) | `fileExplorerApi` over `useAppApi()`, the host's client scoped to `permissions.api`, bound once by the root component (`ui/src/api.ts`). A refusal is a `FileExplorerApiError` carrying the backend's sentence, the status and the gateway's `code` |
| `useAppDispatch` + `setPendingInput(message)`, then `navigate('/chat?prefill=1')` (`FileExplorerPage.tsx:415-420`) | `useChatLauncher().openChat({ message, autoSend: false })`: a new chat with the prompt staged in its box |
| `react-router-dom` `useNavigate` / `useSearchParams` | SDK `useNavigate`; `ui/src/lib/useDeepLinkParam.ts` (gap 7) |
| `components/ui` (`Btn`, `EmptyState`, `Skeleton`), `ErrorNotice`, `Clickable`, `MarkdownRenderer`, `hooks/useImeGuard` | The same components from `@kirocrew/app-sdk/ui`, `useImeGuard` from `@kirocrew/app-sdk` |
| `components/ui/context-menu`, `components/ui/dropdown-menu` | `ui/src/lib/Menu.tsx` (gap 6) |
| `components/FilePathMenu` reveal/open actions | Not carried (gap 3) |
| `hooks/*`, `utils/clipboard`, `utils/commandModifier`, `utils/pathBasename`, `utils/fileReadUrl.isAbsolutePath`, `utils/safeStorage`, `i18n/format` | `ui/src/lib/` (gap 6) |
| `i18n/t.i18nT` with keys in the dashboard's catalogs | `i18nT` in `ui/src/i18n.ts` over the app's own catalogs, `ui/i18n/<locale>.json` for all 12 dashboard locales: the `apps.fileExplorer.*` subtree copied from Kiro Crew (English from `en.json` plus `en.manual.json`), plus five borrowed host strings under `common.*` (the disabled-app notice, **Apps**, **Dismiss**, and the plural result count). Exact locale, then base language, then English; plural forms by `Intl.PluralRules` |

## Tests

| Built-in test | Here | Change |
|---|---|---|
| `test/test_file_explorer_app.py` | `tests/test_server.py` | Imports `backend.server`. The autouse fixture also stands in for the host's safe read and cgroup wrapper, which the in-tree run got from the real Kiro Crew. `test_main_boots_platform_before_serving` patches `_boot_host_platform`. Adds the audit-source case. |
| `apps/builtins/file_explorer/tests/test_allowed_roots_platform.py`, `test_windows_subprocess_encoding.py` | same names under `tests/` | Import path only. |
| `test/test_windows_extended_prefix_containment.py` (file-explorer case), `test/test_dashboard_file_io.py:251`, `test/test_dashboard_snapshot.py:1046`, `test/test_builtin_backend_address_reuse.py` (file-explorer row) | `tests/test_core_parity.py` | Pinned against snapshots of the Kiro Crew values. Adds a loopback listener test: unsigned, forged and wrong-target requests are refused, a signed one is served, health stays open. |
| (none) | `tests/test_host_bridge.py`, `tests/test_manifest_contract.py` | The host bridge with no host and with a stand-in host; the manifest, bundle and tree adoption needs. |
| `website/src/test/fileExplorerComponents.test.tsx` | `ui/tests/components.test.tsx` | No Redux or router wrapper. "Chat about this file" asserts the launcher call. |
| `website/src/test/FileExplorerPageCoverage.test.tsx` | `ui/tests/pageCoverage.test.tsx` | The six "reveal in the host file manager" cases are dropped with that action (gap 3); the action-row case stays, with Download in the overflow. |
| `website/src/test/FileExplorerPage.deepLink.test.tsx` | `ui/tests/pageDeepLink.test.tsx` | Sets and reads the real URL instead of a `MemoryRouter`; a re-issued link arrives by `popstate`. |
| `website/src/test/FileExplorerApiCov80.test.ts`, the API cases of `fileExplorer.test.tsx` | `ui/tests/api.test.ts` | Assert the path handed to the scoped client; adds the error-code and pass-through cases. |
| `website/src/test/fileExplorer.test.tsx` (the rest) | `ui/tests/utils.test.tsx` | Import paths only. |
| `website/src/test/fileExplorerDeepLink.test.ts` | `ui/tests/deepLink.test.ts` | The two link-builder cases stay with Kiro Crew (gap 8). |
| `website/src/test/FileExplorerTabStripRenameFocus.test.tsx`, `fileExplorerTreeScroll.test.ts` | `ui/tests/tabStripRenameFocus.test.tsx`, `ui/tests/treeScroll.test.ts` | Import paths only. |
| File-explorer cases of `windowsBasenameSites.test.tsx`, `explorerNotebookNarrow.test.ts`, `ImeEnterGuardSites.test.tsx` | `ui/tests/sites.test.tsx` | The IME case drives a guard that declines the key instead of the host's composition latch. |
| (none) | `ui/tests/i18n.test.ts`, `ui/tests/lib.test.tsx` | Catalog coverage and plurals; the local menu, deep-link reader and path helpers. |

## Fixes since the port

Each fix that landed on the built-in after the port, carried here so a user on
this copy has it too. Kiro Crew `main` commits; the issue in brackets.

| Kiro Crew commit | What a user sees | Here |
|---|---|---|
| `39dfa400c6` (#27441) | A crewmate's own working files under the data folder's `members/` open, as they already did in the chat preview; the secret-holding siblings stay refused | `members` in `_KIROCREW_SAFE_SUBDIRS` |
| `c156fd72f4` (#27791) | On a Windows gateway, **Go to parent folder**, **Reveal parent** and open-by-path go to the real parent folder instead of `/` | `ui/src/utils.ts` `dirname` |
| `2b43356388` (#27823) | On a Windows gateway, a search hit is labelled relative to the searched folder, with no stray `\` and whatever the root's separator or case | `relativeToRoot` in `ui/src/lib/platform.ts` |
| `ee4efcede7` (#29853) | A text file over 50 MB previews its first 4 MB as **truncated** instead of failing; the in-process search skips it instead of failing | `safe_read_prefix` in the bridge |
| `73b24cac7b` (#18969) | **Ctrl+Shift+T** / **Cmd+Shift+T** is left to the dashboard's reopen-closed-chat command instead of also opening a folder tab | the shortcut handler in `ui/src/FileExplorerPage.tsx` |
| `3adab5e0c4` (#30503) | A folder with exactly 500 matches no longer says **(capped)** | `/search` keeps one result past the cap |
| `600ae6b0cf` (#10852) | Search never runs an `rg` that fails the host's provenance check, the query goes to `rg` on stdin instead of its command line, and a query with a line break returns nothing | `validate_provider_executable` in the bridge |
| `93a9c7faf9` (#32895) | A screen reader names a tree row with git changes by its status word ("app.py modified", or "git status UU" for a conflict) instead of the badge letter, in every shipped language | `gitBadge` in `ui/src/TreeNode.tsx` and the six `treeNode.git_*` keys in every `ui/i18n/` catalog (this repository's pull request #1) |
| none yet (#30739) | **Edit** on a long code file keeps the read view's height and scrolls with the panel, instead of stopping at about 25 lines (480px) with an empty panel below; a code block in chat keeps its cap | a `.mc-fe-code-file` container around a code file in `ui/src/FileViewer.tsx`, whose rule in `ui/src/styles.ts` lifts the host editor's `max-h-[480px]` utility class. It targets a host class name: should the host rename it, the cap comes back and nothing else changes |

The tests each fix added are under `tests/` and `ui/tests/`.

## Verified against a real gateway

Before publishing, a renamed copy of this tree (`file-explorer-verify`, with its
`permissions.api` and the bundle's API prefix renamed to match, because a gateway
that ships the built-in cannot install a second app named `file-explorer`) was
installed into an isolated Kiro Crew gateway from `main` at `390c5315be`,
trusted and enabled. The gateway spawned `backend/server.py` inside its sandbox
with `hostGaps: []`; tree, read, git status and search answered through the
signed proxy; `~/.ssh/id_rsa` and `/etc/hostname` were refused with 403; and the
bundle loaded at `/apps/file-explorer-verify`, listed the tree, rendered a
markdown file and opened the context menu and the overflow menu.

## What Kiro Crew keeps doing

The release that adds adoption still ships the built-in. A user's built-in
record moves onto this repository at the commit Kiro Crew pins, on the restart
after the tree is fetched and verified; a record that cannot move (offline, or
refused by the operator's admission policy) keeps running the built-in copy,
unchanged. The KiroCrewApps catalog row switches from `builtin` to `git` at that
same commit in the same release. Removing the built-in from Kiro Crew is a later
release, after gaps 1, 3, 8, 9 and 11 above are closed.

## Release handoff: one commit for both pins

The adoption pin and the catalog row must name the same commit, and that commit
must be the ported tree.

1. Call this repository's `main` head, a full 40-hex SHA, `C`
   (`git rev-parse HEAD`).
2. In the Kiro Crew release PR that adds adoption, run
   `python3 scripts/adoption_pin.py compute <this URL> C` and add the row it
   prints (commit, `treeSha256`, `archiveSha256`, `legacyNav`) to
   `src/kiro_crew/apps/adoption-pins.json`; then
   `python3 scripts/adoption_pin.py verify`. Until that row exists the release
   adopts nothing, and the catalog row must not switch.
3. The KiroCrewApps row for `file-explorer` switches to `"type": "git"`, this
   URL, `"ref": "C"`. Never a branch name or a placeholder.
4. Check that both files name the same `C`, and that GitHub serves it: in a
   fresh clone, `git fetch origin C` succeeds and `git cat-file -t C` prints
   `commit`.
5. The catalog PR stays a draft, labelled hold-for-release, until the Kiro Crew
   release that ships adoption is published.
