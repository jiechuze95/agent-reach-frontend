# Agent Reach Frontend

A modern web-based management dashboard for [Agent Reach](https://github.com/Panniantong/Agent-Reach) CLI, built with React + FastAPI. Provides an intuitive interface for monitoring channel health, managing configurations, running installations, and executing commands in real time.

![Python](https://img.shields.io/badge/Python-3.10+-blue?logo=python&logoColor=white)
![React](https://img.shields.io/badge/React-18-61dafb?logo=react&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-5-646cff?logo=vite&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-0.100+-009688?logo=fastapi&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-green)

## Features

- **Dashboard** — Real-time overview of Agent Reach installation status, channel health statistics, and quick access to doctor diagnostics
- **Channel Management** — Browse all 13 supported channels with status filtering, search, expandable detail panels, and inline configuration
- **Installation Wizard** — Guided 4-step installer (environment → channels → advanced options → execute) with live WebSocket terminal output
- **Settings** — Config file viewer/editor with sensitive value masking, Skill install/uninstall, version update checking, and safe uninstall with confirmation
- **Terminal** — Full WebSocket-based terminal for real-time command execution, command history navigation, quick command shortcuts, and interrupt support

## Architecture

```
agent-reach-frontend/
├── .github/                  # CI/CD workflows
├── server/
│   └── main.py               # FastAPI backend (REST + WebSocket endpoints)
├── src/
│   ├── api/client.js          # API client with typed methods
│   ├── components/            # Reusable UI components
│   ├── hooks/useWebSocket.js  # WebSocket hook for terminal streaming
│   ├── pages/
│   │   ├── Dashboard.jsx      # Status overview & health check
│   │   ├── Channels.jsx       # Channel list, filtering & configuration
│   │   ├── Install.jsx        # 4-step installation wizard
│   │   ├── Settings.jsx       # Config, skills, updates & uninstall
│   │   └── Terminal.jsx       # Real-time command terminal
│   ├── App.jsx                # Layout, sidebar & routing
│   ├── store.js               # Zustand global state
│   ├── index.css              # TailwindCSS dark theme styles
│   └── main.jsx               # Entry point
├── .env.example               # Environment variable template
├── .eslintrc.cjs              # ESLint configuration
├── .prettierrc                # Prettier configuration
├── Dockerfile                 # Multi-stage Docker build
├── docker-compose.yml         # Docker Compose configuration
├── index.html
├── requirements.txt           # Python dependencies
├── vite.config.js
├── tailwind.config.js
├── package.json
└── README.md
```

**Backend** (Python FastAPI, port 8001) acts as a proxy to the `agent-reach` CLI, exposing REST API endpoints for status, doctor, channels, configuration, installation, uninstall, skills, transcription, update checking, command history, and authentication, plus a WebSocket endpoint for streaming terminal output.

**Frontend** (React 18 + Vite 5) uses TailwindCSS for a dark-themed UI, Zustand for state management, lucide-react for icons, and react-router-dom for navigation. The Vite dev server proxies all `/api` and `/ws` requests to the backend.

## Prerequisites

- Python 3.10+
- Node.js 18+
- [Agent Reach](https://github.com/Panniantong/Agent-Reach) CLI (optional — the app works without it and provides guided installation)

## Quick Start

### 1. Clone and install

```bash
git clone https://github.com/jiechuze95/agent-reach-frontend.git
cd agent-reach-frontend
npm install
```

### 2. Start the backend

```bash
pip install fastapi uvicorn pydantic
python server/main.py
```

The API server starts at `http://localhost:8001`.

### 3. Start the frontend

```bash
npm run dev
```

The dev server starts at `http://localhost:5173` with API requests automatically proxied to the backend.

## Docker Deployment

```bash
docker compose up -d
```
The app will be available at http://localhost:8001.

### Environment Variables
| Variable | Default | Description |
|----------|---------|-------------|
| PORT | 8001 | Backend server port |
| HOST | 127.0.0.1 | Bind address (use 0.0.0.0 for Docker) |
| CORS_ORIGINS | http://localhost:5173,http://localhost:3000 | Allowed CORS origins |
| DEV_MODE | true | Enable /api/token endpoint for dev convenience |

## Authentication

The backend uses token-based authentication. On first startup, a random token is generated and saved to `server/.api-token`. The frontend automatically retrieves the token via the `/api/token` endpoint (development mode) and attaches it to all API requests.

In production, set `DEV_MODE=false` and configure authentication through your reverse proxy.

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/token` | Get auth token (dev mode only) |
| GET | `/api/status` | Agent Reach installation status & tool availability |
| GET | `/api/doctor` | Run health check across all channels |
| GET | `/api/channels` | List all channels with merged health status |
| GET | `/api/channels/{name}` | Single channel detail |
| POST | `/api/configure` | Set a configuration key-value pair |
| GET | `/api/config` | Read current config (sensitive values masked) |
| POST | `/api/install` | Run installer with options |
| POST | `/api/uninstall` | Uninstall Agent Reach |
| POST | `/api/skill` | Install or uninstall the agent skill |
| POST | `/api/transcribe` | Transcribe audio/video from a URL |
| GET | `/api/check-update` | Check for newer versions |
| GET | `/api/watch` | Lightweight health check |
| GET | `/api/history` | Recent command execution history |
| WS | `/ws/terminal` | Real-time terminal streaming |

## Supported Channels

| Channel | Description | Tier |
|---------|-------------|------|
| Web | Web page reading | Free |
| YouTube | YouTube subtitles & search | Free |
| RSS | RSS/Atom feeds | Free |
| Exa Search | Semantic web search | Free |
| GitHub | Repos & Issues | Free |
| V2EX | Posts & replies | Free |
| Twitter/X | Tweets & timelines | Requires config |
| Bilibili | Video & subtitles | Requires config |
| Reddit | Posts & comments | Requires config |
| Xiaohongshu | Notes & feeds | Requires config |
| LinkedIn | Profiles & jobs | Requires config |
| Xueqiu | Stocks & hot posts | Requires config |
| Xiaoyuzhou | Podcast transcription | Premium |

## Build for Production

```bash
npm run build
```

Output is generated in the `dist/` directory. Serve it with any static file server or integrate with the FastAPI backend.

## Tech Stack

- **Frontend**: React 18, Vite 5, TailwindCSS 3, Zustand, lucide-react, react-router-dom 6
- **Backend**: Python FastAPI, Uvicorn, Pydantic, WebSocket
- **Proxy**: Vite dev server proxies `/api` → `localhost:8001`, `/ws` → WebSocket on `8001`

## License

MIT
