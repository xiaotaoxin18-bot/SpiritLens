"""WebSocket endpoint for real-time task progress.

WS /api/v1/ws/task/{task_id}  — subscribe to task progress updates
"""

import asyncio
import logging
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.services.generation import subscribe_progress, unsubscribe_progress

logger = logging.getLogger(__name__)

router = APIRouter()


@router.websocket("/ws/task/{task_id}")
async def task_websocket(websocket: WebSocket, task_id: str):
    """WebSocket endpoint for real-time task progress."""
    await websocket.accept()
    logger.info("WebSocket connected: task=%s", task_id)

    async def send_progress(task_id: str, progress: int, status: str):
        try:
            await websocket.send_json({
                "task_id": task_id,
                "progress": progress,
                "status": status,
            })
        except Exception:
            pass

    subscribe_progress(task_id, send_progress)

    try:
        # Keep connection alive and listen for client messages
        while True:
            try:
                data = await asyncio.wait_for(websocket.receive_text(), timeout=30)
                # Client can send ping to keep alive
                if data == "ping":
                    await websocket.send_json({"type": "pong"})
            except asyncio.TimeoutError:
                # Send heartbeat every 30s
                try:
                    await websocket.send_json({"type": "heartbeat"})
                except Exception:
                    break
    except WebSocketDisconnect:
        logger.info("WebSocket disconnected: task=%s", task_id)
    except Exception as e:
        logger.warning("WebSocket error: task=%s %s", task_id, e)
    finally:
        unsubscribe_progress(task_id, send_progress)
