"""Test bootstrap: make this worker + the shared framework importable."""
import os
import sys

HYWORLD = os.path.dirname(os.path.abspath(__file__))
SHARED = os.path.join(os.path.dirname(HYWORLD), "_shared")
for path in (HYWORLD, SHARED):
    if path not in sys.path:
        sys.path.insert(0, path)
