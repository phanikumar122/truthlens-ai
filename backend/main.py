import asyncio
import json
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from config import settings
from ai_engine import AIEngine
from ingestion import DataIngestor
from database import db
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

ai_engine = AIEngine()
ingestor = DataIngestor()


class ConnectionManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: dict):
        disconnected = []
        for connection in self.active_connections:
            try:
                await connection.send_text(json.dumps(message))
            except Exception:
                disconnected.append(connection)
        for conn in disconnected:
            self.disconnect(conn)


manager = ConnectionManager()


async def stream_updates():
    """Consolidated 25s batch refresh for news updates."""
    logger.info("TruthLens stream task started with 25s cycle.")
    while True:
        try:
            # 1. Send sync signal
            await manager.broadcast({"type": "ping", "timestamp": "sync"})
            
            # 2. Fetch and process items
            raw_data = await ingestor.fetch_latest()
            new_results_count = 0
            
            for item in raw_data:
                processed = ai_engine.process_text(item["text"], item["source"])
                # Only broadcast and log if it's a NEW result not in DB
                if db.save_result(processed):
                    processed["type"] = "data"
                    await manager.broadcast(processed)
                    new_results_count += 1
            
            if new_results_count > 0:
                logger.info(f"Broadcasted {new_results_count} new intelligence items.")
            
            # 3. Wait EXACTLY 25 seconds for the next batch
            await asyncio.sleep(25)
        except Exception as e:
            logger.error(f"Stream Loop Exception: {e}")
            await asyncio.sleep(10)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Modern lifespan handler — replaces deprecated on_event('startup')."""
    task = asyncio.create_task(stream_updates())
    yield
    task.cancel()


app = FastAPI(title="TruthLens AI API", lifespan=lifespan)

# CORS setup
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
async def root():
    return {"message": "TruthLens AI API is running"}


@app.get("/results")
async def get_all_results():
    return db.get_results()


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)
