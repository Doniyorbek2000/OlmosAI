"""Test bootstrap: make sibling worker packages (e.g. `triposr`) importable."""
import os
import sys

WORKERS_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHARED_ROOT = os.path.dirname(os.path.abspath(__file__))

for path in (SHARED_ROOT, WORKERS_ROOT):
    if path not in sys.path:
        sys.path.insert(0, path)
