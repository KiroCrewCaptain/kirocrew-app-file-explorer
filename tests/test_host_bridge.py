"""The backend's host bridge: what it imports from Kiro Crew, and what happens
when an import is missing.

``backend/server.py`` runs under the gateway's own interpreter, so it can import
the host's credential fence, link-safe read, sandbox wrapper and event log
instead of re-stating them. Those are not a published App Kit surface yet
(PORTING.md lists each as a gap), so every import is feature-detected, and a
missing one must never WIDEN access. These tests run the backend in a fresh
interpreter twice: once with ``kiro_crew`` blocked, once with a stand-in
``kiro_crew`` package, so neither depends on a Kiro Crew install.
"""

from __future__ import annotations

import ast
import json
import os
import subprocess
import sys
import textwrap
import unittest
from pathlib import Path

APP_ROOT = Path(__file__).resolve().parents[1]
SERVER = APP_ROOT / "backend" / "server.py"

#: Every Kiro Crew module the backend may import, and the names it takes. A new
#: one is a new coupling to an unpublished module: add it here only together
#: with its fail-closed stand-in and a PORTING.md gap.
ALLOWED_HOST_IMPORTS = {
    "kiro_crew.apps.proxy_auth": {"verify_proxy_request"},
    "kiro_crew.security": {"is_sensitive_path"},
    "kiro_crew.hooks": {"safe_read_file_bytes"},
    "kiro_crew.sandbox": {
        "SandboxUnavailableError",
        "cgroup_scope_argv",
        "run_limited",
        "wrap_argv",
    },
    "kiro_crew.sel": {"sel"},
    "kiro_crew.config.loader": {"KiroCrewConfig"},
    "kiro_crew.platform": {"boot_platform"},
}


def _run(code: str, *, env_extra: dict[str, str] | None = None, cwd: Path | None = None) -> dict:
    env = {k: v for k, v in os.environ.items() if k not in ("PYTHONPATH", "KIROCREW_PROXY_SECRET")}
    env.update(env_extra or {})
    proc = subprocess.run(
        [sys.executable, "-c", code],
        capture_output=True,
        text=True,
        encoding="utf-8",
        env=env,
        cwd=str(cwd or APP_ROOT),
        timeout=60,
        check=False,
    )
    if proc.returncode != 0:
        raise AssertionError(f"child failed ({proc.returncode}):\n{proc.stderr}")
    return json.loads(proc.stdout.strip().splitlines()[-1])


class TestTheImportsAreTheBridgeOnly(unittest.TestCase):
    def test_every_host_import_is_listed_and_guarded(self) -> None:
        tree = ast.parse(SERVER.read_text(encoding="utf-8"))
        found: dict[str, set[str]] = {}
        guarded: set[str] = set()
        for node in ast.walk(tree):
            if isinstance(node, ast.Try):
                for inner in ast.walk(ast.Module(body=node.body, type_ignores=[])):
                    if isinstance(inner, ast.ImportFrom) and inner.module:
                        guarded.add(inner.module)
            if isinstance(node, ast.Import):
                for alias in node.names:
                    self.assertNotEqual(alias.name.split(".")[0], "kiro_crew", alias.name)
            elif isinstance(node, ast.ImportFrom) and node.level == 0 and node.module:
                if node.module.split(".")[0] == "kiro_crew":
                    found.setdefault(node.module, set()).update(a.name for a in node.names)
        self.assertEqual(found, ALLOWED_HOST_IMPORTS)
        self.assertLessEqual(
            set(found), guarded, "an unguarded host import fails the backend at load"
        )

    def test_no_dynamic_host_import(self) -> None:
        text = SERVER.read_text(encoding="utf-8")
        self.assertNotIn("import_module(", text)
        self.assertNotIn("__import__(", text)


_BLOCKED = textwrap.dedent(
    """
    import json, sys, tempfile, pathlib
    sys.modules["kiro_crew"] = None  # any `import kiro_crew...` now raises ImportError
    sys.path.insert(0, ".")
    from backend import server
    out = {"gaps": list(server.HOST_GAPS)}
    tmp = pathlib.Path(tempfile.mkdtemp())
    (tmp / "a.txt").write_text("hello")
    server.ALLOWED_ROOTS = [tmp.resolve()]
    out["sensitive"] = server._is_sensitive(tmp / "a.txt")
    out["read"] = server.safe_read_file_bytes(str(tmp / "a.txt"))
    out["verified"] = server.verify_proxy_request("1:abc", method="GET", target="/read", body=b"")
    try:
        server.wrap_argv(["git", "status"])
        out["wrap"] = "ran"
    except server.SandboxUnavailableError as exc:
        out["wrap"] = exc.kind
    try:
        server._safe_path(str(tmp / "a.txt"))
        out["safe_path"] = "allowed"
    except server.PathError as exc:
        out["safe_path"] = exc.status

    responses = []
    handler = server.FileExplorerHandler.__new__(server.FileExplorerHandler)
    handler._json = lambda code, payload: responses.append((code, payload))
    for target in ("/health", "/git-status?path=" + str(tmp), "/read?path=" + str(tmp / "a.txt")):
        handler.path = target
        try:
            handler._dispatch("GET")
        except server.PathError as exc:
            responses.append((exc.status, {"error": str(exc)}))
    out["health_gaps"] = responses[0][1]["hostGaps"]
    out["git_status"] = responses[1][0]
    out["read_route"] = responses[2][0]
    # Past the fence (as if only the sandbox were missing): git is still not run.
    server.is_sensitive_path = lambda p: False
    (tmp / ".git").mkdir()
    handler.path = "/git-status?path=" + str(tmp)
    responses.clear()
    handler._dispatch("GET")
    out["git_status_past_fence"] = responses[0][0]
    out["git_status_code"] = responses[0][1].get("code")
    server._boot_host_platform()
    out["gaps_after_boot"] = server.HOST_GAPS
    print(json.dumps(out))
    """
)


class TestWithoutTheHost(unittest.TestCase):
    """No ``kiro_crew`` importable: every capability is refused, none widened."""

    @classmethod
    def setUpClass(cls) -> None:
        cls.out = _run(_BLOCKED)

    def test_every_missing_seam_is_named(self) -> None:
        self.assertEqual(
            self.out["gaps"], ["proxy_auth", "sensitive_path", "safe_read", "sandbox", "audit_log"]
        )
        self.assertEqual(self.out["health_gaps"], self.out["gaps"])
        self.assertIn("platform_boot", self.out["gaps_after_boot"])

    def test_every_path_is_sensitive_and_every_read_refused(self) -> None:
        self.assertIs(self.out["sensitive"], True)
        self.assertIsNone(self.out["read"])
        self.assertEqual(self.out["safe_path"], 403)
        self.assertEqual(self.out["read_route"], 403)

    def test_no_signature_verifies(self) -> None:
        self.assertIs(self.out["verified"], False)

    def test_git_is_never_spawned_unwrapped(self) -> None:
        self.assertEqual(self.out["wrap"], "host_seam_missing")
        # Refused at the fence first; and without the fence gap, the typed 503.
        self.assertEqual(self.out["git_status"], 403)
        self.assertEqual(self.out["git_status_past_fence"], 503)
        self.assertEqual(self.out["git_status_code"], "sandbox_unavailable")


_FAKE_HOST = {
    "kiro_crew/__init__.py": "",
    "kiro_crew/apps/__init__.py": "",
    "kiro_crew/apps/proxy_auth.py": (
        "def verify_proxy_request(header, **kw):\n    return header == 'ok'\n"
    ),
    "kiro_crew/security.py": "def is_sensitive_path(p):\n    return p.endswith('secret')\n",
    "kiro_crew/hooks.py": "def safe_read_file_bytes(raw):\n    return b'host-read'\n",
    "kiro_crew/sandbox.py": (
        "class SandboxUnavailableError(RuntimeError):\n    pass\n"
        "def wrap_argv(argv, mode='auto', **kw):\n    return ['wrapped', *argv], None\n"
        "def cgroup_scope_argv(argv):\n    return argv\n"
        "def run_limited(argv, **kw):\n    return argv\n"
    ),
    "kiro_crew/sel.py": (
        "class _S:\n    def log_api_access(self, **k):\n        pass\n"
        "def sel():\n    return _S()\n"
    ),
    "kiro_crew/config/__init__.py": "",
    "kiro_crew/config/loader.py": (
        "class KiroCrewConfig:\n    @classmethod\n    def load(cls):\n        return 'cfg'\n"
    ),
    "kiro_crew/platform.py": "BOOTED = []\ndef boot_platform(cfg):\n    BOOTED.append(cfg)\n",
}

_PRESENT = textwrap.dedent(
    """
    import json, sys
    sys.path.insert(0, ".")
    from backend import server
    import kiro_crew.security, kiro_crew.hooks, kiro_crew.sandbox, kiro_crew.sel
    import kiro_crew.apps.proxy_auth
    import kiro_crew.platform
    server._boot_host_platform()
    print(json.dumps({
        "gaps": server.HOST_GAPS,
        "fence": server.is_sensitive_path is kiro_crew.security.is_sensitive_path,
        "read": server.safe_read_file_bytes is kiro_crew.hooks.safe_read_file_bytes,
        "wrap": server.wrap_argv is kiro_crew.sandbox.wrap_argv,
        "error": server.SandboxUnavailableError is kiro_crew.sandbox.SandboxUnavailableError,
        "verify": server.verify_proxy_request is kiro_crew.apps.proxy_auth.verify_proxy_request,
        "sel": server.sel is kiro_crew.sel.sel,
        "booted": kiro_crew.platform.BOOTED,
    }))
    """
)


class TestWithTheHost(unittest.TestCase):
    """A ``kiro_crew`` with every seam: the backend uses the host's own objects."""

    def test_the_bridge_binds_the_hosts_functions_and_boots_the_platform(self) -> None:
        import tempfile

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            for rel, body in _FAKE_HOST.items():
                path = root / rel
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text(body, encoding="utf-8")
            out = _run(
                _PRESENT,
                env_extra={"PYTHONPATH": f"{APP_ROOT}{os.pathsep}{root}"},
                cwd=APP_ROOT,
            )
        self.assertEqual(out.pop("gaps"), [])
        self.assertEqual(out.pop("booted"), ["cfg"])
        self.assertTrue(all(out.values()), out)


if __name__ == "__main__":
    unittest.main()
