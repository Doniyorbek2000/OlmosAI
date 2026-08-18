"""Real stage-progress reporting back to the orchestrator (no faked progress)."""
from __future__ import annotations

import httpx


async def report_progress(
    callback_url: str | None,
    job_id: str,
    progress: int,
    stage: str,
    secret: str,
    message: str | None = None,
) -> None:
    if not callback_url:
        return
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            await client.post(
                callback_url,
                json={
                    "jobId": job_id,
                    "progress": progress,
                    "stage": stage,
                    "message": message,
                },
                headers={"authorization": f"Bearer {secret}"},
            )
    except Exception:
        # Progress reporting is best-effort; never fail a generation over it.
        pass
