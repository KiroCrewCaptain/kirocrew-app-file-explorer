"""Facts this backend shares with Kiro Crew, pinned on this side.

While the app was built in, Kiro Crew's own tests compared these against the
app's module directly. That comparison cannot run across two repositories, so
each fact is pinned here against a snapshot of the Kiro Crew value at the commit
this was ported from (``tests/fixtures/``), and PORTING.md names the Kiro Crew
half that keeps its own side.
"""

from __future__ import annotations

import errno
import hmac
import json
import os
import threading
import unittest
import urllib.error
import urllib.request
from hashlib import sha256
from http.server import BaseHTTPRequestHandler, HTTPServer, ThreadingHTTPServer
from pathlib import Path
from unittest.mock import patch

from backend import server

APP_ROOT = Path(__file__).resolve().parents[1]
FIXTURES = APP_ROOT / "tests" / "fixtures"


class TestBinaryMeansTheSameEverywhere(unittest.TestCase):
    """Kiro Crew's own file reader and this app must answer "is this binary" alike.

    Ported from ``test_dashboard_file_io.py``'s
    ``test_binary_extension_list_matches_the_files_app``.
    """

    def test_the_extension_list_matches_the_core_reader(self) -> None:
        core = json.loads((FIXTURES / "core-binary-exts.json").read_text(encoding="utf-8"))
        self.assertEqual(set(server.BINARY_EXTS), set(core["extensions"]))


class TestTheSnapshotDirectoryIsNotServed(unittest.TestCase):
    """Ported from ``test_dashboard_snapshot.py``: the crew-home directory that
    holds a crewmate's dashboard pictures is readable by that crewmate, and this
    app, the one route that lists the data home, refuses it."""

    SHOT_ROOT = "dashboard-snapshots"  # Kiro Crew dashboard/handlers/agent_panel_snapshot.py

    def test_it_is_not_a_safe_subdir_and_is_refused(self) -> None:
        self.assertNotIn(self.SHOT_ROOT, server._KIROCREW_SAFE_SUBDIRS)
        picture = Path.home() / ".kiro" / "crew" / self.SHOT_ROOT / "mate" / "page-1-abcd.png"
        with patch.object(server, "is_sensitive_path", lambda p: False):
            self.assertTrue(server._is_sensitive(picture))


class TestExtendedPrefixContainment(unittest.TestCase):
    """Ported from ``test_windows_extended_prefix_containment.py``: a containment
    check folds Windows' ``\\\\?\\`` prefix off both operands, lexically."""

    PREFIX = "\\\\?\\"

    def test_the_fold_is_lexical_and_only_strips_the_prefix(self) -> None:
        fold = server.platform_compat.strip_extended_length_prefix
        self.assertEqual(fold(self.PREFIX + "/a/b"), "/a/b")
        self.assertEqual(fold("/a/b"), "/a/b")
        self.assertEqual(fold("\\\\?\\UNC\\host\\share\\x"), "\\\\host\\share\\x")

    def test_is_within_accepts_the_prefixed_spelling_and_still_refuses_outside(self) -> None:
        import tempfile

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp).resolve()
            inside = root / "a" / "b.txt"
            outside = root.parent / "elsewhere.txt"
            self.assertTrue(server._is_within(Path(self.PREFIX + str(inside)), root))
            self.assertTrue(server._is_within(inside, Path(self.PREFIX + str(root))))
            self.assertFalse(server._is_within(Path(self.PREFIX + str(outside)), root))


class TestAddressReuseFollowsThePlatform(unittest.TestCase):
    """Ported from ``test_builtin_backend_address_reuse.py``.

    ``http.server`` turns ``allow_reuse_address`` on everywhere. On Windows that
    lets a second backend bind a port that still has a LIVE listener, and the
    gateway detects a port collision only by the child dying on its bind.
    """

    def test_the_stdlib_default_is_what_we_are_overriding(self) -> None:
        self.assertTrue(bool(HTTPServer.allow_reuse_address))
        self.assertTrue(bool(ThreadingHTTPServer.allow_reuse_address))

    def test_listener_binds_address_reuse_to_the_platform(self) -> None:
        self.assertTrue(issubclass(server._Server, ThreadingHTTPServer))
        self.assertIs(server._Server.allow_reuse_address, os.name == "posix")

    def test_the_entry_point_binds_loopback_through_that_subclass(self) -> None:
        src = (APP_ROOT / "backend" / "server.py").read_text(encoding="utf-8")
        self.assertIn('_Server(("127.0.0.1", PORT), FileExplorerHandler)', src)
        self.assertNotIn('ThreadingHTTPServer(("127.0.0.1", PORT)', src)
        self.assertNotIn('"0.0.0.0"', src)

    @unittest.skipUnless(os.name == "nt", "POSIX already refuses a second bind on a live port")
    def test_a_second_windows_backend_cannot_take_the_live_port(self) -> None:
        first = server._Server(("127.0.0.1", 0), BaseHTTPRequestHandler)
        try:
            with self.assertRaises(OSError) as caught:
                port = first.server_address[1]
                server._Server(("127.0.0.1", port), BaseHTTPRequestHandler)
            self.assertIn(caught.exception.errno, (errno.EADDRINUSE, 10048))
        finally:
            first.server_close()


def _sign(secret: str, ts: int, method: str, target: str, body: bytes = b"") -> str:
    """The documented App Kit v1 proxy signature."""
    msg = f"{ts}:{method}:{target}:{sha256(body).hexdigest()}"
    return f"{ts}:{hmac.new(secret.encode(), msg.encode(), sha256).hexdigest()}"


def _verify_v1(header: str, *, method: str, target: str, body: bytes) -> bool:
    """A stand-in for the host's ``verify_proxy_request``: same signed string."""
    secret = os.environ.get("KIROCREW_PROXY_SECRET", "")
    try:
        ts = int(header.split(":", 1)[0])
    except ValueError:
        return False
    return bool(secret) and hmac.compare_digest(header, _sign(secret, ts, method, target, body))


class _NoAudit:
    def log_api_access(self, **_fields: object) -> None:
        pass


class TestTheListenerRefusesUnsignedCallers(unittest.TestCase):
    """The backend listens on loopback, where any local process can connect, so
    every route but the health probe needs the gateway's proxy signature."""

    def setUp(self) -> None:
        import tempfile

        holder = tempfile.TemporaryDirectory()
        self.addCleanup(holder.cleanup)
        self.tmp = Path(holder.name).resolve()
        (self.tmp / "a.txt").write_text("hello", encoding="utf-8")
        patches = [
            patch.object(server, "ALLOWED_ROOTS", [self.tmp]),
            patch.object(server, "is_sensitive_path", lambda p: False),
            patch.object(server, "safe_read_file_bytes", lambda raw: Path(raw).read_bytes()),
            patch.object(server, "safe_read_prefix", lambda raw, n: Path(raw).read_bytes()[:n]),
            patch.object(server, "verify_proxy_request", _verify_v1),
            patch.object(server, "sel", lambda: _NoAudit()),
            patch.dict(os.environ, {"KIROCREW_PROXY_SECRET": "s3cr3t-for-tests"}),
        ]
        for p in patches:
            p.start()
            self.addCleanup(p.stop)
        self.httpd = server._Server(("127.0.0.1", 0), server.FileExplorerHandler)
        self.port = self.httpd.server_address[1]
        thread = threading.Thread(target=self.httpd.serve_forever, daemon=True)
        thread.start()

        def _stop() -> None:
            self.httpd.shutdown()
            self.httpd.server_close()
            thread.join(timeout=10)

        self.addCleanup(_stop)

    def _get(self, target: str, header: str | None = None) -> tuple[int, dict]:
        req = urllib.request.Request(f"http://127.0.0.1:{self.port}{target}")
        if header is not None:
            req.add_header("X-KiroCrew-Proxy", header)
        try:
            with urllib.request.urlopen(req, timeout=10) as resp:
                return resp.status, json.loads(resp.read())
        except urllib.error.HTTPError as exc:
            with exc:
                return exc.code, json.loads(exc.read() or b"{}")

    def test_health_is_open_and_binds_loopback(self) -> None:
        status, body = self._get("/health")
        self.assertEqual(status, 200)
        self.assertEqual(body["status"], "ok")
        self.assertEqual(self.httpd.server_address[0], "127.0.0.1")

    def test_an_unsigned_read_is_refused(self) -> None:
        status, body = self._get(f"/api/read?path={self.tmp / 'a.txt'}")
        self.assertEqual(status, 401)
        self.assertNotIn("content", body)

    def test_a_forged_signature_is_refused(self) -> None:
        import time

        target = f"/api/read?path={self.tmp / 'a.txt'}"
        status, _ = self._get(target, _sign("wrong-secret", int(time.time()), "GET", target))
        self.assertEqual(status, 401)

    def test_a_signed_read_is_served(self) -> None:
        import time

        target = f"/api/read?path={self.tmp / 'a.txt'}"
        status, body = self._get(target, _sign("s3cr3t-for-tests", int(time.time()), "GET", target))
        self.assertEqual(status, 200)
        self.assertEqual(body["content"], "hello")

    def test_a_signature_for_another_target_is_refused(self) -> None:
        import time

        signed_for = f"/api/tree?path={self.tmp}"
        target = f"/api/read?path={self.tmp / 'a.txt'}"
        header = _sign("s3cr3t-for-tests", int(time.time()), "GET", signed_for)
        status, _ = self._get(target, header)
        self.assertEqual(status, 401)


if __name__ == "__main__":
    unittest.main()
