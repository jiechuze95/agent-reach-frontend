"""
Agent Reach Frontend - Backend API Server
FastAPI proxy for agent-reach CLI commands
"""
import asyncio
import json
import os
import re
import shutil
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

app = FastAPI(title="Agent Reach Manager", version="1.0.0")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Command history
# ---------------------------------------------------------------------------
command_history: list[dict] = []
MAX_HISTORY = 50


def _add_history(command: str, status: str = "running", returncode=None):
    entry = {
        "command": command,
        "timestamp": datetime.now().isoformat(),
        "status": status,
        "returncode": returncode,
    }
    command_history.append(entry)
    if len(command_history) > MAX_HISTORY:
        command_history.pop(0)
    return entry


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class InstallRequest(BaseModel):
    env: str = Field("auto", pattern=r"^(auto|local|server)$")
    channels: list[str] = Field(default_factory=list)
    safe: bool = False
    dry_run: bool = False
    proxy: str = ""


class ConfigureRequest(BaseModel):
    key: str
    value: str


class UninstallRequest(BaseModel):
    dry_run: bool = False
    keep_config: bool = False


class SkillRequest(BaseModel):
    action: str = Field(..., pattern=r"^(install|uninstall)$")


class TranscribeRequest(BaseModel):
    source: str
    provider: str = Field("auto", pattern=r"^(auto|groq|openai)$")


class CommandRequest(BaseModel):
    command: str


# ---------------------------------------------------------------------------
# Channels info (hardcoded for frontend display)
# ---------------------------------------------------------------------------

CHANNELS_INFO = [
    {"name": "web", "description": "网页阅读", "icon": "🌐", "tier": 0, "backends": ["Jina Reader"], "config_needed": False},
    {"name": "youtube", "description": "YouTube 字幕 + 搜索", "icon": "📺", "tier": 0, "backends": ["yt-dlp"], "config_needed": False},
    {"name": "rss", "description": "RSS/Atom 源", "icon": "📡", "tier": 0, "backends": ["feedparser"], "config_needed": False},
    {"name": "exa_search", "description": "全网语义搜索", "icon": "🔍", "tier": 0, "backends": ["Exa via mcporter"], "config_needed": False},
    {"name": "github", "description": "GitHub 仓库 + Issue", "icon": "📦", "tier": 0, "backends": ["gh CLI"], "config_needed": True},
    {"name": "twitter", "description": "Twitter/X 推文", "icon": "🐦", "tier": 1, "backends": ["twitter-cli", "OpenCLI", "bird CLI"], "config_needed": True},
    {"name": "bilibili", "description": "B站视频 + 字幕", "icon": "📺", "tier": 1, "backends": ["bili-cli", "OpenCLI", "搜索 API"], "config_needed": True},
    {"name": "reddit", "description": "Reddit 帖子 + 评论", "icon": "📖", "tier": 1, "backends": ["OpenCLI", "rdt-cli"], "config_needed": True},
    {"name": "xiaohongshu", "description": "小红书笔记", "icon": "📕", "tier": 1, "backends": ["OpenCLI", "xiaohongshu-mcp", "xhs-cli"], "config_needed": True},
    {"name": "linkedin", "description": "LinkedIn Profile + 职位", "icon": "💼", "tier": 1, "backends": ["linkedin-mcp", "Jina Reader"], "config_needed": True},
    {"name": "v2ex", "description": "V2EX 帖子 + 回复", "icon": "💻", "tier": 0, "backends": ["内置 API"], "config_needed": False},
    {"name": "xueqiu", "description": "雪球股票 + 热帖", "icon": "📈", "tier": 1, "backends": ["Cookie 认证"], "config_needed": True},
    {"name": "xiaoyuzhou", "description": "小宇宙播客转录", "icon": "🎙️", "tier": 2, "backends": ["Whisper via Groq"], "config_needed": True},
]

# ---------------------------------------------------------------------------
# Core utilities
# ---------------------------------------------------------------------------

async def run_command(cmd: list, timeout: int = 120) -> dict:
    """Execute a command and return the result."""
    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env={**os.environ, "PYTHONIOENCODING": "utf-8"},
        )
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=timeout)
        return {
            "success": proc.returncode == 0,
            "output": (stdout or b"").decode("utf-8", errors="replace"),
            "error": (stderr or b"").decode("utf-8", errors="replace"),
            "returncode": proc.returncode,
        }
    except asyncio.TimeoutError:
        return {"success": False, "output": "", "error": f"\u547d\u4ee4\u8d85\u65f6 (>{timeout}s)", "returncode": -1}
    except FileNotFoundError:
        return {"success": False, "output": "", "error": f"\u547d\u4ee4\u672a\u627e\u5230: {cmd[0]}", "returncode": -1}
    except Exception as e:
        return {"success": False, "output": "", "error": str(e), "returncode": -1}


def find_agent_reach() -> str:
    """Locate the agent-reach binary."""
    path = shutil.which("agent-reach")
    if path:
        return path
    for candidate in [
        os.path.expanduser("~/.local/bin/agent-reach"),
        os.path.expanduser("~/.agent-reach/bin/agent-reach"),
        os.path.join(sys.prefix, "Scripts", "agent-reach.exe"),
        os.path.join(sys.prefix, "bin", "agent-reach"),
    ]:
        if os.path.isfile(candidate):
            return candidate
    return "agent-reach"


def _read_config_file() -> dict:
    """Read ~/.agent-reach/config.yaml (best-effort, no yaml dependency)."""
    config_path = Path.home() / ".agent-reach" / "config.yaml"
    if not config_path.exists():
        return {"_raw": "", "_path": str(config_path), "_exists": False}
    try:
        import yaml
        with open(config_path, "r", encoding="utf-8") as f:
            data = yaml.safe_load(f) or {}
        return {"_raw": "", "_path": str(config_path), "_exists": True, "data": data}
    except ImportError:
        with open(config_path, "r", encoding="utf-8") as f:
            raw = f.read()
        # Simple key: value parsing as fallback
        data = {}
        for line in raw.splitlines():
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            if ":" in line:
                k, _, v = line.partition(":")
                k, v = k.strip(), v.strip()
                # Mask sensitive values
                sensitive_keys = ["token", "key", "secret", "password", "cookie"]
                if any(s in k.lower() for s in sensitive_keys) and v and len(v) > 4:
                    v = v[:4] + "****"
                data[k] = v
        return {"_raw": raw, "_path": str(config_path), "_exists": True, "data": data}
    except Exception as e:
        return {"_raw": "", "_path": str(config_path), "_exists": True, "_error": str(e)}


def _check_tool(name: str) -> bool:
    """Check if a CLI tool is available on PATH."""
    return shutil.which(name) is not None


# ---------------------------------------------------------------------------
# API Endpoints
# ---------------------------------------------------------------------------

# 1. GET /api/status - agent-reach installation status
@app.get("/api/status")
async def get_status():
    """Get agent-reach installation status and available tools."""
    ar_path = find_agent_reach()
    ar_installed = os.path.isfile(ar_path) if ar_path != "agent-reach" else shutil.which("agent-reach") is not None

    # Try to get version
    version = None
    if ar_installed:
        result = await run_command([ar_path, "--version"], timeout=10)
        if result["success"]:
            version = result["output"].strip()

    # Check upstream tools
    tools = {
        "yt-dlp": _check_tool("yt-dlp"),
        "twitter": _check_tool("twitter"),
        "gh": _check_tool("gh"),
        "node": _check_tool("node"),
        "npm": _check_tool("npm"),
        "opencli": _check_tool("opencli"),
        "bili": _check_tool("bili"),
        "rdt": _check_tool("rdt"),
        "feedparser": _check_tool("feedparser"),
    }

    return {
        "installed": ar_installed,
        "path": ar_path,
        "version": version,
        "tools": tools,
    }


# 2. GET /api/doctor - run health check
@app.get("/api/doctor")
async def get_doctor():
    """Run agent-reach doctor and return channel health status."""
    ar = find_agent_reach()
    # Try --json first
    result = await run_command([ar, "doctor", "--json"], timeout=90)
    if result["success"]:
        try:
            data = json.loads(result["output"])
            return {"success": True, "data": data, "raw": result["output"]}
        except json.JSONDecodeError:
            pass

    # Fallback: parse text output
    result = await run_command([ar, "doctor"], timeout=90)
    channels = []
    if result["success"] or result["output"]:
        for line in result["output"].splitlines():
            line = line.strip()
            if not line:
                continue
            # Try to parse lines like: [OK] youtube - yt-dlp found
            m = re.match(r'\[(\w+)\]\s*(\S+)\s*[-:]\s*(.*)', line)
            if m:
                channels.append({
                    "status": m.group(1).lower(),
                    "name": m.group(2),
                    "detail": m.group(3).strip(),
                })
            else:
                channels.append({"status": "info", "name": "", "detail": line})

    return {
        "success": result["success"],
        "channels": channels,
        "raw": result["output"],
        "error": result["error"],
    }


# 3. GET /api/channels - list all channels
@app.get("/api/channels")
async def list_channels():
    """Return hardcoded channel list merged with doctor status."""
    # Get doctor info for merging status
    doctor_result = await get_doctor()
    doctor_map = {}
    if doctor_result.get("channels"):
        for ch in doctor_result["channels"]:
            if ch.get("name"):
                doctor_map[ch["name"]] = ch

    channels = []
    for ch in CHANNELS_INFO:
        info = dict(ch)
        # Merge doctor status if available
        doc = doctor_map.get(ch["name"], {})
        info["status"] = doc.get("status", "unknown")
        info["detail"] = doc.get("detail", "")
        channels.append(info)

    return {"channels": channels, "total": len(channels)}


# 4. GET /api/channels/{name} - single channel detail
@app.get("/api/channels/{name}")
async def get_channel(name: str):
    """Return detail for a single channel."""
    for ch in CHANNELS_INFO:
        if ch["name"] == name:
            info = dict(ch)
            # Get live status
            doctor_result = await get_doctor()
            if doctor_result.get("channels"):
                for dch in doctor_result["channels"]:
                    if dch.get("name") == name:
                        info["status"] = dch.get("status", "unknown")
                        info["detail"] = dch.get("detail", "")
                        break
            if "status" not in info:
                info["status"] = "unknown"
                info["detail"] = ""
            return info

    raise HTTPException(status_code=404, detail=f"\u6e20\u9053 '{name}' \u672a\u627e\u5230")


# 5. POST /api/configure - configure a channel
@app.post("/api/configure")
async def configure_channel(req: ConfigureRequest):
    """Run agent-reach configure <key> <value>."""
    ar = find_agent_reach()
    _add_history(f"agent-reach configure {req.key} ****")
    result = await run_command([ar, "configure", req.key, req.value], timeout=30)
    if command_history:
        command_history[-1]["status"] = "ok" if result["success"] else "error"
        command_history[-1]["returncode"] = result["returncode"]
    return result


# 6. GET /api/config - get current config
@app.get("/api/config")
async def get_config():
    """Read and return ~/.agent-reach/config.yaml (sensitive values masked)."""
    return _read_config_file()


# 7. POST /api/install - run installer (returns result; WebSocket for streaming)
@app.post("/api/install")
async def install(req: InstallRequest):
    """Run agent-reach install with the given options."""
    ar = find_agent_reach()
    cmd = [ar, "install", f"--env={req.env}"]
    if req.safe:
        cmd.append("--safe")
    if req.dry_run:
        cmd.append("--dry-run")
    if req.proxy:
        cmd.append(f"--proxy={req.proxy}")
    if req.channels:
        cmd.append(f"--channels={','.join(req.channels)}")

    _add_history(" ".join(cmd))
    result = await run_command(cmd, timeout=300)
    if command_history:
        command_history[-1]["status"] = "ok" if result["success"] else "error"
        command_history[-1]["returncode"] = result["returncode"]
    return result


# 8. POST /api/uninstall - uninstall
@app.post("/api/uninstall")
async def uninstall(req: UninstallRequest):
    """Run agent-reach uninstall."""
    ar = find_agent_reach()
    cmd = [ar, "uninstall"]
    if req.dry_run:
        cmd.append("--dry-run")
    if req.keep_config:
        cmd.append("--keep-config")

    _add_history(" ".join(cmd))
    result = await run_command(cmd, timeout=60)
    if command_history:
        command_history[-1]["status"] = "ok" if result["success"] else "error"
        command_history[-1]["returncode"] = result["returncode"]
    return result


# 9. POST /api/skill - manage skills
@app.post("/api/skill")
async def manage_skill(req: SkillRequest):
    """Install or uninstall the agent-reach skill."""
    ar = find_agent_reach()
    cmd = [ar, "skill", f"--{req.action}"]

    _add_history(" ".join(cmd))
    result = await run_command(cmd, timeout=60)
    if command_history:
        command_history[-1]["status"] = "ok" if result["success"] else "error"
        command_history[-1]["returncode"] = result["returncode"]
    return result


# 10. POST /api/transcribe - transcribe audio/video
@app.post("/api/transcribe")
async def transcribe(req: TranscribeRequest):
    """Transcribe audio/video from a source URL."""
    ar = find_agent_reach()
    cmd = [ar, "transcribe", req.source, f"--provider={req.provider}"]

    _add_history(" ".join(cmd))
    result = await run_command(cmd, timeout=600)
    if command_history:
        command_history[-1]["status"] = "ok" if result["success"] else "error"
        command_history[-1]["returncode"] = result["returncode"]
    return result


# 11. GET /api/check-update - check for updates
@app.get("/api/check-update")
async def check_update():
    """Check if there is a newer version of agent-reach."""
    ar = find_agent_reach()
    result = await run_command([ar, "check-update"], timeout=30)
    return result


# 12. GET /api/watch - quick health check
@app.get("/api/watch")
async def watch():
    """Lightweight health check endpoint."""
    ar = find_agent_reach()
    ar_ok = shutil.which("agent-reach") is not None or (
        ar != "agent-reach" and os.path.isfile(ar)
    )
    return {
        "status": "ok" if ar_ok else "warning",
        "agent_reach_installed": ar_ok,
        "timestamp": datetime.now().isoformat(),
    }


# 13. GET /api/history - command execution history
@app.get("/api/history")
async def get_history():
    """Return the last 50 command history entries."""
    return {"history": list(reversed(command_history)), "total": len(command_history)}


# ---------------------------------------------------------------------------
# WebSocket terminal
# ---------------------------------------------------------------------------

@app.websocket("/ws/terminal")
async def websocket_terminal(websocket: WebSocket):
    """WebSocket terminal for real-time command execution."""
    await websocket.accept()
    process = None
    try:
        while True:
            data = await websocket.receive_text()
            msg = json.loads(data)

            if msg.get("type") == "command":
                cmd = msg.get("command", "").strip()
                if not cmd:
                    continue

                # Handle interrupt
                if cmd == "interrupt" and process:
                    process.terminate()
                    continue

                # Record history
                _add_history(cmd)

                # Replace agent-reach with actual path
                if cmd.startswith("agent-reach"):
                    ar_path = find_agent_reach()
                    cmd = cmd.replace("agent-reach", ar_path, 1)

                # Execute command
                parts = cmd.split()
                try:
                    process = await asyncio.create_subprocess_exec(
                        *parts,
                        stdout=asyncio.subprocess.PIPE,
                        stderr=asyncio.subprocess.STDOUT,
                        env={**os.environ, "PYTHONIOENCODING": "utf-8"},
                    )

                    while True:
                        line = await process.stdout.readline()
                        if not line:
                            break
                        text = line.decode("utf-8", errors="replace")
                        await websocket.send_json({"type": "output", "text": text})

                    await process.wait()
                    await websocket.send_json({
                        "type": "done",
                        "returncode": process.returncode,
                    })

                    # Update history
                    if command_history:
                        command_history[-1]["status"] = "ok" if process.returncode == 0 else "error"
                        command_history[-1]["returncode"] = process.returncode

                except FileNotFoundError:
                    await websocket.send_json({
                        "type": "error",
                        "text": f"\u547d\u4ee4\u672a\u627e\u5230: {parts[0]}\n",
                    })
                    if command_history:
                        command_history[-1]["status"] = "error"

                except Exception as e:
                    await websocket.send_json({
                        "type": "error",
                        "text": f"\u6267\u884c\u9519\u8bef: {e}\n",
                    })
                    if command_history:
                        command_history[-1]["status"] = "error"

            elif msg.get("type") == "interrupt":
                if process:
                    process.terminate()
                    await websocket.send_json({"type": "output", "text": "\n[\u5df2\u4e2d\u65ad]\n"})

    except WebSocketDisconnect:
        if process:
            process.terminate()
    except Exception as e:
        try:
            await websocket.send_json({"type": "error", "text": f"WebSocket \u9519\u8bef: {e}\n"})
        except Exception:
            pass
        finally:
            if process:
                process.terminate()


# ---------------------------------------------------------------------------
# Startup
# ---------------------------------------------------------------------------

@app.on_event("startup")
async def startup():
    ar = find_agent_reach()
    print(f"Agent Reach Manager \u542f\u52a8")
    print(f"  agent-reach \u8def\u5f84: {ar}")
    print(f"  API: http://localhost:8001")


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
