#!/usr/bin/env python3
"""
Outward Orbit - Simple Browser Agent Daemon
High-performance browser automation with Playwright
"""

import os
import json
import uuid
import asyncio
import logging
from typing import Dict, Any, Optional
from datetime import datetime

# FastAPI and WebSocket imports
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn

# Playwright imports
from playwright.async_api import async_playwright, Browser, BrowserContext, Page

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Configuration
HOST = os.getenv("AGENT_HOST", "127.0.0.1")
PORT = int(os.getenv("AGENT_PORT", 4823))
HEADLESS = os.getenv("HEADLESS", "false").lower() == "true"

app = FastAPI(title="Outward Orbit Agent Daemon", version="1.0.0")

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Request models
class TaskRequest(BaseModel):
    task: str
    options: Optional[Dict[str, Any]] = {}

class SearchRequest(BaseModel):
    query: str
    options: Optional[Dict[str, Any]] = {}

# Global state
browser: Optional[Browser] = None
sessions: Dict[str, Dict] = {}
websocket_connections: Dict[str, WebSocket] = {}

# Chrome flags for stealth and performance
CHROME_FLAGS = [
    "--no-sandbox",
    "--disable-setuid-sandbox", 
    "--disable-dev-shm-usage",
    "--disable-accelerated-2d-canvas",
    "--no-first-run",
    "--no-zygote",
    "--disable-gpu",
    "--disable-background-timer-throttling",
    "--disable-backgrounding-occluded-windows",
    "--disable-renderer-backgrounding",
    "--disable-features=TranslateUI",
    "--disable-ipc-flooding-protection",
    "--disable-images",
    "--disable-plugins",
    "--disable-extensions",
    "--disable-sync",
    "--disable-default-apps",
    "--disable-background-networking",
    "--disable-component-extensions-with-background-pages",
    "--disable-component-update",
    "--disable-client-side-phishing-detection",
    "--disable-hang-monitor",
    "--disable-prompt-on-repost",
    "--disable-web-security",
    "--aggressive-cache-discard",
    "--memory-pressure-off",
    "--max_old_space_size=4096"
]

async def broadcast_to_session(session_id: str, event_type: str, data: Any):
    """Broadcast event to WebSocket connections for a session"""
    if session_id in websocket_connections:
        try:
            await websocket_connections[session_id].send_json({
                "type": event_type,
                "data": data,
                "timestamp": datetime.now().isoformat()
            })
        except Exception as e:
            logger.error(f"Error broadcasting to {session_id}: {e}")
            # Remove disconnected WebSocket
            if session_id in websocket_connections:
                del websocket_connections[session_id]

async def setup_page(context: BrowserContext) -> Page:
    """Setup a new page with stealth settings"""
    page = await context.new_page()
    
    # Block images, fonts, and other resources for speed
    await page.route("**/*.{png,jpg,jpeg,gif,svg,ico,woff,woff2,ttf,css}", lambda route: route.abort())
    
    # Set viewport
    await page.set_viewport_size({"width": 1920, "height": 1080})
    
    # Set user agent to look more human
    await page.set_extra_http_headers({
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    })
    
    return page

async def perform_search(page: Page, query: str, session_id: str) -> Dict[str, Any]:
    """Perform a Google search"""
    try:
        await broadcast_to_session(session_id, "progress", {"step": "Navigating to Google"})
        
        # Navigate to Google
        await page.goto("https://www.google.com", wait_until="domcontentloaded", timeout=15000)
        
        await broadcast_to_session(session_id, "progress", {"step": f"Searching for: {query}"})
        
        # Find search box and search
        search_box = await page.wait_for_selector('input[name="q"]', timeout=10000)
        await search_box.fill(query)
        await search_box.press("Enter")
        
        # Wait for results
        await page.wait_for_selector('#search', timeout=15000)
        
        await broadcast_to_session(session_id, "progress", {"step": "Processing results"})
        
        # Take screenshot
        screenshot_path = f"temp_screenshot_{session_id}.png"
        await page.screenshot(path=screenshot_path, full_page=False)
        
        # Get page title and URL
        title = await page.title()
        url = page.url
        
        result = {
            "success": True,
            "title": title,
            "url": url,
            "screenshot": screenshot_path,
            "query": query
        }
        
        await broadcast_to_session(session_id, "screenshot", {"path": screenshot_path})
        
        return result
        
    except Exception as e:
        logger.error(f"Search error: {e}")
        return {"success": False, "error": str(e)}

async def perform_navigation(page: Page, url: str, session_id: str) -> Dict[str, Any]:
    """Navigate to a specific URL"""
    try:
        await broadcast_to_session(session_id, "progress", {"step": f"Navigating to {url}"})
        
        # Ensure URL has protocol
        if not url.startswith(('http://', 'https://')):
            url = 'https://' + url
        
        # Navigate to URL
        await page.goto(url, wait_until="domcontentloaded", timeout=15000)
        
        await broadcast_to_session(session_id, "progress", {"step": "Page loaded"})
        
        # Take screenshot
        screenshot_path = f"temp_screenshot_{session_id}.png"
        await page.screenshot(path=screenshot_path, full_page=False)
        
        # Get page info
        title = await page.title()
        
        result = {
            "success": True,
            "title": title,
            "url": page.url,
            "screenshot": screenshot_path
        }
        
        await broadcast_to_session(session_id, "screenshot", {"path": screenshot_path})
        
        return result
        
    except Exception as e:
        logger.error(f"Navigation error: {e}")
        return {"success": False, "error": str(e)}

@app.on_event("startup")
async def startup_event():
    """Initialize browser on startup"""
    global browser
    try:
        playwright = await async_playwright().start()
        browser = await playwright.chromium.launch(
            headless=HEADLESS,
            args=CHROME_FLAGS
        )
        logger.info(f"Browser started. Headless: {HEADLESS}")
    except Exception as e:
        logger.error(f"Failed to start browser: {e}")

@app.on_event("shutdown") 
async def shutdown_event():
    """Cleanup on shutdown"""
    global browser
    if browser:
        await browser.close()
        logger.info("Browser closed")

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "ok": True,
        "engine": "playwright",
        "sessions": len(sessions),
        "headless": HEADLESS
    }

@app.post("/agent/run")
async def run_task(request: TaskRequest):
    """Start a new browser automation task"""
    if not browser:
        raise HTTPException(status_code=500, detail="Browser not available")
    
    session_id = str(uuid.uuid4())[:8]
    
    # Store session info
    sessions[session_id] = {
        "id": session_id,
        "task": request.task,
        "status": "running",
        "created": datetime.now().isoformat()
    }
    
    try:
        # Create browser context
        context = await browser.new_context()
        page = await setup_page(context)
        
        # Analyze task type
        task_lower = request.task.lower()
        
        if any(word in task_lower for word in ['search', 'find', 'look for']):
            # Extract search query
            query = request.task
            for prefix in ['search for ', 'find ', 'look for ', 'search ']:
                if prefix in task_lower:
                    query = request.task[task_lower.find(prefix) + len(prefix):]
                    break
            
            result = await perform_search(page, query, session_id)
            
        elif any(word in task_lower for word in ['navigate', 'go to', 'visit', 'open']):
            # Extract URL
            url = request.task
            for prefix in ['navigate to ', 'go to ', 'visit ', 'open ']:
                if prefix in task_lower:
                    url = request.task[task_lower.find(prefix) + len(prefix):]
                    break
            
            result = await perform_navigation(page, url, session_id)
            
        else:
            # Default to search
            result = await perform_search(page, request.task, session_id)
        
        # Update session
        sessions[session_id]["status"] = "completed"
        sessions[session_id]["result"] = result
        
        # Broadcast completion
        await broadcast_to_session(session_id, "done", result)
        
        # Close context after delay
        asyncio.create_task(close_context_delayed(context, 20))
        
        return {
            "session_id": session_id,
            "status": "completed",
            "result": result
        }
        
    except Exception as e:
        error_msg = str(e)
        logger.error(f"Task execution error: {error_msg}")
        
        sessions[session_id]["status"] = "error"
        sessions[session_id]["error"] = error_msg
        
        await broadcast_to_session(session_id, "error", {"message": error_msg})
        
        raise HTTPException(status_code=500, detail=error_msg)

async def close_context_delayed(context: BrowserContext, delay: int):
    """Close browser context after delay"""
    await asyncio.sleep(delay)
    try:
        await context.close()
    except Exception as e:
        logger.error(f"Error closing context: {e}")

@app.post("/agent/search")
async def quick_search(request: SearchRequest):
    """Quick search endpoint"""
    task_request = TaskRequest(task=f"search for {request.query}", options=request.options)
    return await run_task(task_request)

@app.get("/agent/sessions")
async def get_sessions():
    """Get all sessions"""
    return {"sessions": list(sessions.values())}

@app.get("/agent/session/{session_id}")
async def get_session(session_id: str):
    """Get specific session"""
    if session_id not in sessions:
        raise HTTPException(status_code=404, detail="Session not found")
    return sessions[session_id]

@app.websocket("/events")
async def websocket_endpoint(websocket: WebSocket, id: str = None):
    """WebSocket endpoint for real-time events"""
    await websocket.accept()
    
    if id:
        websocket_connections[id] = websocket
        logger.info(f"WebSocket connected for session {id}")
        
        # Send initial connection confirmation
        await websocket.send_json({
            "type": "connected",
            "data": {"session_id": id},
            "timestamp": datetime.now().isoformat()
        })
    
    try:
        while True:
            # Keep connection alive
            await websocket.receive_text()
    except WebSocketDisconnect:
        if id and id in websocket_connections:
            del websocket_connections[id]
        logger.info(f"WebSocket disconnected for session {id}")

if __name__ == "__main__":
    print(f"Starting Outward Orbit Agent Daemon on http://{HOST}:{PORT}")
    print("Endpoints:")
    print(f"  GET  /health              - Health check") 
    print(f"  POST /agent/run           - Start a new task")
    print(f"  POST /agent/search        - Quick search")
    print(f"  GET  /agent/sessions      - List all sessions")
    print(f"  GET  /agent/session/{{id}}  - Get session details")
    print(f"  WS   /events?id={{id}}      - Real-time events")
    print()
    
    uvicorn.run(app, host=HOST, port=PORT)