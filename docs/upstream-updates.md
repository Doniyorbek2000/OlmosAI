# Upstream Model Update Policy

Never silently update an AI model in production (spec §87). Each provider records
its current version, and updates go through a controlled process.

## Process

1. **Discover** a newer upstream commit/tag or checkpoint.
2. **Pin** it in a branch: update the worker's `Dockerfile.gpu` build arg + `MODEL.md`.
3. **Compatibility test**: run the worker's mocked-transport tests + a GPU smoke test.
4. **Benchmark**: run the shared benchmark set (see `benchmarks.md`) and compare
   generation time, quality, VRAM, and failure rate against the current version.
5. **License re-check**: confirm code + weights licenses at the new commit; update
   `model-registry.md` and `THIRD_PARTY_NOTICES.md`.
6. **Roll out** behind the DB `AIProvider` row (enable for a % / staging first).
7. **Rollback**: revert the pin + provider row; images are tagged by commit.

## Recorded per provider

- repository URL, pinned commit SHA, model checkpoint hash/version
- benchmark scores at that version
