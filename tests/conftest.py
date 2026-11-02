"""Make the app root importable so ``backend`` resolves as a package.

The gateway runs ``backend/server.py`` as a script, so it never needs to be on
``sys.path`` there. A plain pytest run imports it as ``backend.server`` instead,
so the app root is put on the path for the test session only.

No Kiro Crew is installed for these tests: the backend's host bridge then binds
its fail-closed stand-ins, and each test that exercises a host function patches
in a stand-in of its own (see ``test_server.py``'s autouse fixture).
"""

import sys
from pathlib import Path

APP_ROOT = Path(__file__).resolve().parent.parent
if str(APP_ROOT) not in sys.path:
    sys.path.insert(0, str(APP_ROOT))
