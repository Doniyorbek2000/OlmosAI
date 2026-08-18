"""Test bootstrap: make the shared framework + this worker importable."""
import os
import sys

ASSET_WORKER = os.path.dirname(os.path.abspath(__file__))
SHARED = os.path.join(os.path.dirname(ASSET_WORKER), "ai-workers", "_shared")

for path in (ASSET_WORKER, SHARED):
    if path not in sys.path:
        sys.path.insert(0, path)
