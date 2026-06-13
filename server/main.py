"""
Agent Reach Frontend - Backend API Server
FastAPI proxy for agent-reach CLI commands
"""
import asyncio
import importlib.util
import json
import logging
import os
import re
import secrets
import shlex
import shutil
import sys
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

# ---------------------------------------------------------------------------
# Logging (#13)
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
logger = logging.getLogger("agent-reach-server")

# ---------------------------------------------------------------------------
# Configuration from environment (#20, #21)
# ---------------------------------------------------------------------------
SERVER_PORT: int = int(os.environ.get("PORT", "8001"))
CORS_ORIGINS: list[str] = [
    origin.strip()
    for origin in os.environ.get(
        "CORS_ORIGINS", "http://localhost:5173,http://localhost:3000"
    ).split(",")
    if origin.strip()
]

# ---------------------------------------------------------------------------
# Token-based authentication (#1)
# ---------------------------------------------------------------------------
API_TOKEN: str = secrets.token_urlsafe(32)

# ---------------------------------------------------------------------------
# Pre-compiled regex (#24)
# ---------------------------------------------------------------------------
DOCTOR_LINE_RE: re.Pattern[str] = re.compile(
    r"\[(\w+)\]\s*(\S+)\s*[-:]\s*(.*)"
)

# ---------------------------------------------------------------------------
# Doctor result cache (#8) - 60-second TTL
# ---------------------------------------------------------------------------
_doctor_cache: dict = {"result": None, "timestamp": 0.0}
DOCTOR_CACHE_TTL: float = 60.0

# ---------------------------------------------------------------------------
# Active subprocess tracking (#16)
# ---------------------------------------------------------------------------
_active_processes: set[asyncio.subprocess.Process] = set()

# ---------------------------------------------------------------------------
# Rate limiter (#19) - simple in-memory, 10 req/min for expensive endpoints
# ---------------------------------------------------------------------------
_rate_limit_store: dict[str, list[float]] = {}
RATE_LIMIT_MAX: int = 10
RATE_LIMIT_WINDOW: float = 60.0


def _check_rate_limit(key: str) -> None:
    """Raise HTTPException(429) if the rate limit for *key* is exceeded."""
    now = datetime.now(timezone.utc).timestamp()
    timestamps = _rate_limit_store.get(key, [])
    # Prune old entries
    timestamps = [t for t in timestamps if now - t < RATE_LIMIT_WINDOW]
    if len(timestamps) >= RATE_LIMIT_MAX:
        raise HTTPException(
            status_code=429,
            detail=f"Rate limit exceeded for '{key}'. Max {RATE_LIMIT_MAX} requests per {int(RATE_LIMIT_WINDOW)}s. Try again later.",
        )
    timestamps.append(now)
    _rate_limit_store[key] = timestamps


# ---------------------------------------------------------------------------
# Valid config keys whitelist (#4)
# ---------------------------------------------------------------------------
VALID_CONFIG_KEYS: set[str] = {
    "proxy",
    "github-token",
    "groq-key",
    "openai-key",
    "twitter-cookies",
    "youtube-cookies",
    "xhs-cookies",
}

# ---------------------------------------------------------------------------
# Subprocess environment sanitization (#22)
# ---------------------------------------------------------------------------


def _sanitize_env() -> dict[str, str]:
    """Return a minimal, safe environment dict for subprocesses."""
    env: dict[str, str] = {}
    for key in ("PATH", "HOME", "USER", "LANG", "PYTHONIOENCODING"):
        val = os.environ.get(key)
        if val is not None:
            env[key] = val
    # Ensure UTF-8 output
    env.setdefault("PYTHONIOENCODING", "utf-8")
    return env


# ---------------------------------------------------------------------------
# Lifespan (#16, #17) - replaces deprecated on_event
# ---------------------------------------------------------------------------


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan: startup banner + graceful shutdown."""
    # --- startup ---
    ar = await asyncio.to_thread(find_agent_reach)
    logger.info("Agent Reach Manager started")
    logger.info("  agent-reach path: %s", ar if ar else "(not found)")
    logger.info("  API: http://127.0.0.1:%d", SERVER_PORT)
    logger.info("  API Token: %s", API_TOKEN)
    print(f"\n{'='*60}")
    print(f"  Agent Reach Manager API Token:")
    print(f"  {API_TOKEN}")
    print(f"{'='*60}\n")
    yield
    # --- shutdown (#16) ---
    logger.info("Shutting down, terminating %d active process(es)...", len(_active_processes))
    for proc in list(_active_processes):
        await _terminate_process(proc)
    logger.info("Shutdown complete.")


# ---------------------------------------------------------------------------
# App creation
# ---------------------------------------------------------------------------
app = FastAPI(
    title="Agent Reach Manager",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS (#21 - configurable)
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Authentication middleware (#1)
# ---------------------------------------------------------------------------
AUTH_EXEMPT_PATHS: set[str] = {"/api/watch", "/docs", "/openapi.json", "/redoc"}


@app.middleware("http")
async def auth_and_logging_middleware(request: Request, call_next):
    """Check Bearer token and log every request."""
    # Log incoming request (#13)
    logger.info(">>> %s %s", request.method, request.url.path)

    # Exempt paths
    if request.url.path in AUTH_EXEMPT_PATHS or request.url.path.startswith("/static"):
        return await call_next(request)

    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer ") or auth_header[7:] != API_TOKEN:
        logger.warning("Unauthorized request to %s", request.url.path)
        return JSONResponse(status_code=401, content={"detail": "Unauthorized: invalid or missing Bearer token"})

    response = await call_next(request)
    return response


# ---------------------------------------------------------------------------
# Command history (#6 - race condition fix applied at usage sites)
# ---------------------------------------------------------------------------
command_history: list[dict] = []
MAX_HISTORY: int = 50


def _add_history(command: str, status: str = "running", returncode: int | None = None) -> dict:
    """Create a history entry, append it, and return the *specific* dict reference."""
    entry: dict = {
        "command": command,
        "timestamp": datetime.now(timezone.utc).isoformat(),  # (#25)
        "status": status,
        "returncode": returncode,
    }
    command_history.append(entry)
    if len(command_history) > MAX_HISTORY:
        command_history.pop(0)
    return entry


# ---------------------------------------------------------------------------
# Pydantic models (#26 - docstrings)
# ---------------------------------------------------------------------------


class InstallRequest(BaseModel):
    """Request body for installing agent-reach channels."""
    env: str = Field("auto", pattern=r"^(auto|local|server)$")
    channels: list[str] = Field(default_factory=list)
    safe: bool = False
    dry_run: bool = False
    proxy: str = ""


class ConfigureRequest(BaseModel):
    """Request body for configuring an agent-reach setting."""
    key: str
    value: str


class UninstallRequest(BaseModel):
    """Request body for uninstalling agent-reach."""
    dry_run: bool = False
    keep_config: bool = False


class SkillRequest(BaseModel):
    """Request body for managing the agent-reach skill."""
    action: str = Field(..., pattern=r"^(install|uninstall)$")


class TranscribeRequest(BaseModel):
    """Request body for transcribing audio/video from a URL."""
    source: str
    provider: str = Field("auto", pattern=r"^(auto|groq|openai)$")


class CommandRequest(BaseModel):
    """Request body for executing an arbitrary command."""
    command: str


# ---------------------------------------------------------------------------
# Channels info (hardcoded for frontend display)
# ---------------------------------------------------------------------------

CHANNELS_INFO: list[dict] = [
    {"name": "web", "description": "网页阅读", "icon": "\U0001f310", "tier": 0, "backends": ["Jina Reader"], "config_needed": False},
    {"name": "youtube", "description": "YouTube 字幕 + 搜索", "icon": "\U0001f4fa", "tier": 0, "backends": ["yt-dlp"], "config_needed": False},
    {"name": "rss", "description": "RSS/Atom 源", "icon": "\U0001f4e1", "tier": 0, "backends": ["feedparser"], "config_needed": False},
    {"name": "exa_search", "description": "全网语义搜索", "icon": "\U0001f50d", "tier": 0, "backends": ["Exa via mcporter"], "config_needed": False},
    {"name": "github", "description": "GitHub 仓库 + Issue", "icon": "\U0001f4e6", "tier": 0, "backends": ["gh CLI"], "config_needed": True},
    {"name": "twitter", "description": "Twitter/X 推文", "icon": "\U0001f426", "tier": 1, "backends": ["twitter-cli", "OpenCLI", "bird CLI"], "config_needed": True},
    {"name": "bilibili", "description": "B站视频 + 字幕", "icon": "\U0001f4fa", "tier": 1, "backends": ["bili-cli", "OpenCLI", "搜索 API"], "config_needed": True},
    {"name": "reddit", "description": "Reddit 帖子 + 评论", "icon": "\U0001f4d6", "tier": 1, "backends": ["OpenCLI", "rdt-cli"], "config_needed": True},
    {"name": "xiaohongshu", "description": "小红书笔记", "icon": "\U0001f4d5", "tier": 1, "backends": ["OpenCLI", "xiaohongshu-mcp", "xhs-cli"], "config_needed": True},
    {"name": "linkedin", "description": "LinkedIn Profile + 职位", "icon": "\U0001f4bc", "tier": 1, "backends": ["linkedin-mcp", "Jina Reader"], "config_needed": True},
    {"name": "v2ex", "description": "V2EX 帖子 + 回复", "icon": "\U0001f4bb", "tier": 0, "backends": ["内置 API"], "config_needed": False},
    {"name": "xueqiu", "description": "雪球股票 + 热帖", "icon": "\U0001f4c8", "tier": 1, "backends": ["Cookie 认证"], "config_needed": True},
    {"name": "xiaoyuzhou", "description": "小宇宙播客转录", "icon": "\U0001f399\ufe0f", "tier": 2, "backends": ["Whisper via Groq"], "config_needed": True},
]

_VALID_CHANNEL_NAMES: set[str] = {ch["name"] for ch in CHANNELS_INFO}

# ---------------------------------------------------------------------------
# Core utilities
# ---------------------------------------------------------------------------


def _mask_sensitive(data: dict) -> dict:
    """Return a copy of *data* with sensitive values masked (#3).

    Sensitive key patterns: token, key, secret, password, cookie, credential, auth, api_key.
    Values with length <= 4 are replaced with '****'.
    Longer values show the first 2 characters followed by '****'.
    """
    sensitive_patterns: list[str] = [
        "token", "key", "secret", "password", "cookie",
        "credential", "auth", "api_key",
    ]
    masked: dict = {}
    for k, v in data.items():
        if isinstance(v, str) and any(s in k.lower() for s in sensitive_patterns):
            if len(v) <= 4:
                masked[k] = "****"
            else:
                masked[k] = v[:2] + "****"
        else:
            masked[k] = v
    return masked


async def run_command(cmd: list[str], timeout: int = 120) -> dict:
    """Execute a command and return the result."""
    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env=_sanitize_env(),
        )
        _active_processes.add(proc)
        try:
            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=timeout)
            return {
                "success": proc.returncode == 0,
                "output": (stdout or b"").decode("utf-8", errors="replace"),
                "error": (stderr or b"").decode("utf-8", errors="replace"),
                "returncode": proc.returncode,
            }
        finally:
            _active_processes.discard(proc)
    except asyncio.TimeoutError:
        return {"success": False, "output": "", "error": f"命令超时 (>{timeout}s)", "returncode": -1}
    except FileNotFoundError:
        return {"success": False, "output": "", "error": f"命令未找到: {cmd[0]}", "returncode": -1}
    except Exception as e:
        logger.error("run_command failed: %s", e)
        return {"success": False, "output": "", "error": str(e), "returncode": -1}


def find_agent_reach() -> str | None:
    """Locate the agent-reach binary.  Returns None when not found (#9)."""
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
    return None


def _require_agent_reach() -> str:
    """Return agent-reach path or raise HTTPException(404) (#9)."""
    ar = find_agent_reach()
    if ar is None:
        raise HTTPException(
            status_code=404,
            detail="agent-reach is not installed or not found on PATH. Please install it first.",
        )
    return ar


def _read_config_file() -> dict:
    """Read ~/.agent-reach/config.yaml (best-effort, no yaml dependency).

    Masking is applied AFTER parsing regardless of which parser was used (#3).
    """
    config_path = Path.home() / ".agent-reach" / "config.yaml"
    if not config_path.exists():
        return {"_raw": "", "_path": str(config_path), "_exists": False}
    try:
        import yaml
        with open(config_path, "r", encoding="utf-8") as f:
            data: dict = yaml.safe_load(f) or {}
        data = _mask_sensitive(data)
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
                data[k] = v
        # Mask sensitive values AFTER parsing (#3)
        data = _mask_sensitive(data)
        return {"_raw": raw, "_path": str(config_path), "_exists": True, "data": data}
    except Exception as e:
        logger.error("Error reading config: %s", e)
        return {"_raw": "", "_path": str(config_path), "_exists": True, "_error": str(e)}


def _check_tool(name: str) -> bool:
    """Check if a CLI tool is available on PATH."""
    return shutil.which(name) is not None


async def _terminate_process(process: asyncio.subprocess.Process) -> None:
    """Gracefully terminate a subprocess: SIGTERM, wait 5 s, then SIGKILL (#7)."""
    if process.returncode is not None:
        return
    try:
        process.terminate()
        await asyncio.wait_for(process.wait(), timeout=5.0)
    except (asyncio.TimeoutError, ProcessLookupError):
        try:
            process.kill()
            await process.wait()
        except ProcessLookupError:
            pass
    except Exception as exc:
        logger.warning("Error terminating process: %s", exc)
    finally:
        _active_processes.discard(process)


def _validate_url(url: str) -> bool:
    """Return True if *url* looks like a valid HTTP(S) URL (#5)."""
    try:
        parsed = urlparse(url)
        return parsed.scheme in ("http", "https") and bool(parsed.netloc)
    except Exception:
        return False


def _validate_proxy(proxy: str) -> bool:
    """Return True if *proxy* looks like a valid proxy URL (#5)."""
    if not proxy:
        return True
    try:
        parsed = urlparse(proxy)
        return parsed.scheme in ("http", "https", "socks5", "socks5h") and bool(parsed.netloc)
    except Exception:
        return False


async def _run_and_track(
    cmd: list[str],
    entry: dict,
    timeout: int = 120,
) -> dict:
    """Run a command, update the history *entry*, and return the result (#18).

    This avoids the race condition of referencing ``command_history[-1]`` (#6).
    """
    result = await run_command(cmd, timeout=timeout)
    entry["status"] = "ok" if result["success"] else "error"
    entry["returncode"] = result["returncode"]
    logger.info(
        "Command finished (rc=%s): %s",
        result["returncode"],
        " ".join(cmd),
    )
    return result


# ---------------------------------------------------------------------------
# API Endpoints
# ---------------------------------------------------------------------------


# 1. GET /api/status - agent-reach installation status
@app.get("/api/status")
async def get_status() -> dict:
    """Get agent-reach installation status and available tools."""
    ar_path = await asyncio.to_thread(find_agent_reach)  # (#14)
    ar_installed = ar_path is not None

    # Try to get version
    version: str | None = None
    if ar_installed:
        result = await run_command([ar_path, "--version"], timeout=10)
        if result["success"]:
            version = result["output"].strip()

    # Check upstream tools - feedparser uses importlib (#15)
    tools: dict[str, bool] = {
        "yt-dlp": await asyncio.to_thread(_check_tool, "yt-dlp"),
        "twitter": await asyncio.to_thread(_check_tool, "twitter"),
        "gh": await asyncio.to_thread(_check_tool, "gh"),
        "node": await asyncio.to_thread(_check_tool, "node"),
        "npm": await asyncio.to_thread(_check_tool, "npm"),
        "opencli": await asyncio.to_thread(_check_tool, "opencli"),
        "bili": await asyncio.to_thread(_check_tool, "bili"),
        "rdt": await asyncio.to_thread(_check_tool, "rdt"),
        "feedparser": importlib.util.find_spec("feedparser") is not None,  # (#15)
    }

    return {
        "installed": ar_installed,
        "path": ar_path,
        "version": version,
        "tools": tools,
    }


async def _get_doctor_internal() -> dict:
    """Core doctor logic without rate limiting (for internal calls)."""
    # Check cache (#8)
    now = datetime.now(timezone.utc).timestamp()
    if _doctor_cache["result"] is not None and (now - _doctor_cache["timestamp"]) < DOCTOR_CACHE_TTL:
        logger.info("Returning cached doctor result")
        return _doctor_cache["result"]

    ar = _require_agent_reach()  # (#9)

    # Try --json first
    result = await run_command([ar, "doctor", "--json"], timeout=90)
    if result["success"]:
        try:
            data = json.loads(result["output"])
            response = {"success": True, "data": data, "raw": result["output"]}
            _doctor_cache["result"] = response
            _doctor_cache["timestamp"] = now
            return response
        except json.JSONDecodeError:
            pass

    # Fallback: parse text output
    result = await run_command([ar, "doctor"], timeout=90)
    channels: list[dict] = []
    if result["success"] or result["output"]:
        for line in result["output"].splitlines():
            line = line.strip()
            if not line:
                continue
            # Use pre-compiled regex (#24)
            m = DOCTOR_LINE_RE.match(line)
            if m:
                channels.append({
                    "status": m.group(1).lower(),
                    "name": m.group(2),
                    "detail": m.group(3).strip(),
                })
            else:
                channels.append({"status": "info", "name": "", "detail": line})

    response = {
        "success": result["success"],
        "channels": channels,
        "raw": result["output"],
        "error": result["error"],
    }
    _doctor_cache["result"] = response
    _doctor_cache["timestamp"] = now
    return response


# 2. GET /api/doctor - run health check (with caching #8)
@app.get("/api/doctor")
async def get_doctor() -> dict:
    """Run agent-reach doctor and return channel health status."""
    _check_rate_limit("doctor")  # (#19)
    return await _get_doctor_internal()


# 3. GET /api/channels - list all channels
@app.get("/api/channels")
async def list_channels() -> dict:
    """Return hardcoded channel list merged with doctor status."""
    # Get doctor info for merging status (internal call, no rate limit)
    try:
        doctor_result = await _get_doctor_internal()
    except HTTPException:
        doctor_result = {"channels": []}

    doctor_map: dict[str, dict] = {}
    if doctor_result.get("channels"):
        for ch in doctor_result["channels"]:
            if ch.get("name"):
                doctor_map[ch["name"]] = ch

    channels: list[dict] = []
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
async def get_channel(name: str) -> dict:
    """Return detail for a single channel."""
    for ch in CHANNELS_INFO:
        if ch["name"] == name:
            info = dict(ch)
            # Get live status (internal call, no rate limit)
            try:
                doctor_result = await _get_doctor_internal()
            except HTTPException:
                doctor_result = {"channels": []}
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

    raise HTTPException(status_code=404, detail=f"渠道 '{name}' 未找到")


# 5. POST /api/configure - configure a channel (#4 - key validation)
@app.post("/api/configure")
async def configure_channel(req: ConfigureRequest) -> dict:
    """Run agent-reach configure <key> <value>."""
    ar = _require_agent_reach()  # (#9)

    # Validate key (#4)
    if req.key.startswith("-"):
        raise HTTPException(status_code=400, detail=f"Invalid config key: '{req.key}' (must not start with '-')")
    if req.key not in VALID_CONFIG_KEYS:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown config key: '{req.key}'. Valid keys: {', '.join(sorted(VALID_CONFIG_KEYS))}",
        )

    entry = _add_history(f"agent-reach configure {req.key} ****")  # (#6)
    # Use -- separator before positional arguments (#4)
    result = await _run_and_track(
        [ar, "configure", "--", req.key, req.value],
        entry,
        timeout=30,
    )
    return result


# 6. GET /api/config - get current config
@app.get("/api/config")
async def get_config() -> dict:
    """Read and return ~/.agent-reach/config.yaml (sensitive values masked)."""
    return await asyncio.to_thread(_read_config_file)  # (#14)


# 7. POST /api/install - run installer (#5 - input validation)
@app.post("/api/install")
async def install(req: InstallRequest) -> dict:
    """Run agent-reach install with the given options."""
    _check_rate_limit("install")  # (#19)
    ar = _require_agent_reach()  # (#9)

    # Validate channels (#5)
    for ch_name in req.channels:
        if ch_name not in _VALID_CHANNEL_NAMES:
            raise HTTPException(
                status_code=400,
                detail=f"Unknown channel: '{ch_name}'. Valid channels: {', '.join(sorted(_VALID_CHANNEL_NAMES))}",
            )

    # Validate proxy (#5)
    if req.proxy and not _validate_proxy(req.proxy):
        raise HTTPException(status_code=400, detail=f"Invalid proxy URL: '{req.proxy}'")

    cmd: list[str] = [ar, "install", f"--env={req.env}"]
    if req.safe:
        cmd.append("--safe")
    if req.dry_run:
        cmd.append("--dry-run")
    if req.proxy:
        cmd.append(f"--proxy={req.proxy}")
    if req.channels:
        cmd.append("--")
        cmd.extend(req.channels)

    entry = _add_history(" ".join(cmd))  # (#6)
    result = await _run_and_track(cmd, entry, timeout=300)  # (#18)
    return result


# 8. POST /api/uninstall - uninstall
@app.post("/api/uninstall")
async def uninstall(req: UninstallRequest) -> dict:
    """Run agent-reach uninstall."""
    _check_rate_limit("uninstall")  # (#19)
    ar = _require_agent_reach()  # (#9)

    cmd: list[str] = [ar, "uninstall"]
    if req.dry_run:
        cmd.append("--dry-run")
    if req.keep_config:
        cmd.append("--keep-config")

    entry = _add_history(" ".join(cmd))  # (#6)
    result = await _run_and_track(cmd, entry, timeout=60)  # (#18)
    return result


# 9. POST /api/skill - manage skills
@app.post("/api/skill")
async def manage_skill(req: SkillRequest) -> dict:
    """Install or uninstall the agent-reach skill."""
    ar = _require_agent_reach()  # (#9)
    cmd: list[str] = [ar, "skill", f"--{req.action}"]

    entry = _add_history(" ".join(cmd))  # (#6)
    result = await _run_and_track(cmd, entry, timeout=60)  # (#18)
    return result


# 10. POST /api/transcribe - transcribe audio/video (#5 - URL validation)
@app.post("/api/transcribe")
async def transcribe(req: TranscribeRequest) -> dict:
    """Transcribe audio/video from a source URL."""
    ar = _require_agent_reach()  # (#9)

    # Validate source URL (#5)
    if not _validate_url(req.source):
        raise HTTPException(status_code=400, detail=f"Invalid source URL: '{req.source}'. Must be a valid http(s) URL.")

    cmd: list[str] = [ar, "transcribe", "--", req.source, f"--provider={req.provider}"]

    entry = _add_history(" ".join(cmd))  # (#6)
    result = await _run_and_track(cmd, entry, timeout=600)  # (#18)
    return result


# 11. GET /api/check-update - check for updates
@app.get("/api/check-update")
async def check_update() -> dict:
    """Check if there is a newer version of agent-reach."""
    ar = _require_agent_reach()  # (#9)
    result = await run_command([ar, "check-update"], timeout=30)
    return result


# 12. GET /api/watch - quick health check (exempt from auth)
@app.get("/api/watch")
async def watch() -> dict:
    """Lightweight health check endpoint (no auth required)."""
    ar = await asyncio.to_thread(find_agent_reach)  # (#14)
    ar_ok = ar is not None
    return {
        "status": "ok" if ar_ok else "warning",
        "agent_reach_installed": ar_ok,
        "timestamp": datetime.now(timezone.utc).isoformat(),  # (#25)
    }


# 13. GET /api/history - command execution history
@app.get("/api/history")
async def get_history() -> dict:
    """Return the last 50 command history entries."""
    return {"history": list(reversed(command_history)), "total": len(command_history)}


# ---------------------------------------------------------------------------
# WebSocket terminal (#1 auth, #10 JSON parsing, #11 shlex, #12 timeout)
# ---------------------------------------------------------------------------


@app.websocket("/ws/terminal")
async def websocket_terminal(
    websocket: WebSocket,
    token: str = Query(default=""),
) -> None:
    """WebSocket terminal for real-time command execution."""
    # Token auth via query parameter (#1)
    if token != API_TOKEN:
        await websocket.close(code=4401, reason="Unauthorized")
        return

    await websocket.accept()
    process: asyncio.subprocess.Process | None = None
    try:
        while True:
            data = await websocket.receive_text()

            # Safe JSON parsing (#10)
            try:
                msg = json.loads(data)
            except json.JSONDecodeError as exc:
                await websocket.send_json({
                    "type": "error",
                    "text": f"Invalid JSON: {exc}\n",
                })
                continue

            if msg.get("type") == "command":
                cmd = msg.get("command", "").strip()
                if not cmd:
                    continue

                # Handle interrupt
                if cmd == "interrupt" and process:
                    await _terminate_process(process)
                    process = None
                    continue

                # Record history - capture the specific entry (#6)
                entry = _add_history(cmd)

                # Replace agent-reach with actual path
                if cmd.startswith("agent-reach"):
                    ar_path = find_agent_reach()
                    if ar_path:
                        cmd = cmd.replace("agent-reach", ar_path, 1)

                # Use shlex for proper argument splitting (#11)
                try:
                    parts = shlex.split(cmd)
                except ValueError as exc:
                    await websocket.send_json({
                        "type": "error",
                        "text": f"Command parse error: {exc}\n",
                    })
                    entry["status"] = "error"
                    continue

                if not parts:
                    continue

                try:
                    process = await asyncio.create_subprocess_exec(
                        *parts,
                        stdout=asyncio.subprocess.PIPE,
                        stderr=asyncio.subprocess.STDOUT,
                        env=_sanitize_env(),
                    )
                    _active_processes.add(process)

                    # Stream output with a timeout (#12) - 300 seconds
                    try:
                        while True:
                            line = await asyncio.wait_for(
                                process.stdout.readline(),
                                timeout=300.0,
                            )
                            if not line:
                                break
                            text = line.decode("utf-8", errors="replace")
                            await websocket.send_json({"type": "output", "text": text})
                    except asyncio.TimeoutError:
                        await websocket.send_json({
                            "type": "error",
                            "text": "\n[命令执行超时 (>300s)]\n",
                        })
                        await _terminate_process(process)
                        process = None
                        entry["status"] = "error"
                        entry["returncode"] = -1
                        continue

                    await process.wait()
                    _active_processes.discard(process)
                    await websocket.send_json({
                        "type": "done",
                        "returncode": process.returncode,
                    })

                    # Update the specific history entry (#6)
                    entry["status"] = "ok" if process.returncode == 0 else "error"
                    entry["returncode"] = process.returncode
                    logger.info("WS command finished (rc=%s): %s", process.returncode, cmd)

                except FileNotFoundError:
                    await websocket.send_json({
                        "type": "error",
                        "text": f"命令未找到: {parts[0]}\n",
                    })
                    entry["status"] = "error"

                except Exception as e:
                    logger.error("WS command error: %s", e)
                    await websocket.send_json({
                        "type": "error",
                        "text": f"执行错误: {e}\n",
                    })
                    entry["status"] = "error"

                finally:
                    if process and process.returncode is None:
                        _active_processes.discard(process)
                    process = None

            elif msg.get("type") == "interrupt":
                if process:
                    await _terminate_process(process)
                    process = None
                    await websocket.send_json({"type": "output", "text": "\n[已中断]\n"})

    except WebSocketDisconnect:
        logger.info("WebSocket client disconnected")
        if process:
            await _terminate_process(process)
    except Exception as e:
        logger.error("WebSocket error: %s", e)
        try:
            await websocket.send_json({"type": "error", "text": f"WebSocket 错误: {e}\n"})
        except Exception:
            pass
        finally:
            if process:
                await _terminate_process(process)


# ---------------------------------------------------------------------------
# Production static file serving (#28)
# ---------------------------------------------------------------------------
_DIST_DIR = Path(__file__).resolve().parent.parent / "dist"
if _DIST_DIR.is_dir():
    _assets_dir = _DIST_DIR / "assets"
    if _assets_dir.is_dir():
        app.mount("/assets", StaticFiles(directory=str(_assets_dir)), name="static-assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str) -> FileResponse:
        """Serve static files or fall back to index.html for SPA routing."""
        file_path = _DIST_DIR / full_path
        if file_path.is_file():
            return FileResponse(str(file_path))
        return FileResponse(str(_DIST_DIR / "index.html"))


# ---------------------------------------------------------------------------
# Main entry point (#2 - bind to 127.0.0.1, #20 - configurable port)
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=SERVER_PORT)
