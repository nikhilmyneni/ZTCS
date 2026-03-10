# Zero Trust Cloud System with Integrated UEBA

A cloud storage security system implementing Zero Trust Architecture with User and Entity Behavior Analytics (UEBA) and Dynamic Risk Scoring.

**Malla Reddy University · Department of Cyber Security**

## Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│                  Client (React + Tailwind)           │
│         Login · Register · File Manager · Admin      │
└──────────────────────┬──────────────────────────────┘
                       │ HTTPS
┌──────────────────────▼──────────────────────────────┐
│              Node.js + Express Backend               │
│  Auth Module · Access Gateway · Policy Engine        │
│  File Ops · Admin API · Audit Logging                │
└──────┬───────────────────────────────────┬──────────┘
       │ Internal API                      │ MongoDB / Redis
┌──────▼──────────┐              ┌─────────▼──────────┐
│  Python FastAPI  │              │   MongoDB Atlas     │
│  UEBA Service    │              │   Redis (Upstash)   │
│  Risk Scoring    │              │   AWS S3 / Cloudinary│
└─────────────────┘              └────────────────────┘
```

## Tech Stack

| Layer       | Technology                          |
|-------------|-------------------------------------|
| Frontend    | React 18, Tailwind CSS, Recharts    |
| Backend     | Node.js, Express.js, Socket.io      |
| UEBA Engine | Python 3.11, FastAPI                |
| Database    | MongoDB Atlas, Redis (Upstash)      |
| Storage     | AWS S3 / Cloudinary                 |
| Auth        | JWT, bcrypt, Nodemailer OTP         |
| Deploy      | Vercel (client), Render (servers)   |

## Project Structure

```
ztcs/
├── client/              # React frontend
│   ├── src/
│   │   ├── components/  # UI components by feature
│   │   ├── pages/       # Route pages
│   │   ├── context/     # React context providers
│   │   ├── hooks/       # Custom hooks
│   │   └── utils/       # API client, helpers
│   └── package.json
├── server/              # Node.js backend
│   ├── src/
│   │   ├── controllers/ # Route handlers
│   │   ├── middleware/   # Auth, gateway, logging
│   │   ├── models/      # Mongoose schemas
│   │   ├── routes/      # Express routes
│   │   ├── services/    # Business logic
│   │   ├── config/      # DB, env config
│   │   └── utils/       # Helpers
│   └── package.json
├── ueba-service/        # Python UEBA engine
│   ├── app/
│   │   ├── routes/      # FastAPI endpoints
│   │   ├── services/    # Scoring, profiling
│   │   ├── models/      # Data models
│   │   └── utils/       # Geo-IP, fingerprint
│   └── requirements.txt
└── docs/                # Documentation
```

## Quick Start

### Prerequisites
- Node.js 18+
- Python 3.11+
- MongoDB Atlas account
- Upstash Redis account

### 1. Clone & Install

```bash
# Backend
cd server && npm install

# Frontend
cd ../client && npm install

# UEBA service
cd ../ueba-service && pip install -r requirements.txt
```

### 2. Configure Environment

Copy `.env.example` to `.env` in both `server/` and `ueba-service/` and fill in your credentials.

### 3. Run Development

```bash
# Terminal 1 — Backend
cd server && npm run dev

# Terminal 2 — UEBA Service
cd ueba-service && uvicorn app.main:app --reload --port 8000

# Terminal 3 — Frontend
cd client && npm run dev
```

## Implementation Phases

- [x] Phase 1 — Project Setup & Auth Foundation
- [ ] Phase 2 — UEBA Baseline Profiling
- [ ] Phase 3 — Dynamic Risk Scoring Engine
- [ ] Phase 4 — Access Gateway & Step-Up Auth
- [ ] Phase 5 — File Storage & Core Features
- [ ] Phase 6 — Admin Dashboard & Real-Time Monitoring
- [ ] Phase 7 — Testing & Evaluation
- [ ] Phase 8 — Final Deployment & Presentation

## Risk Scoring Formula

```
R = 25·V1 + 30·V2 + 20·V3 + 40·V4

V1 = New IP Address       (weight: 25)
V2 = New Device           (weight: 30)
V3 = Unusual Login Time   (weight: 20)
V4 = Abnormal Usage       (weight: 40)

Risk Levels:
  Low:    0–30   → Access Granted
  Medium: 31–60  → Step-Up Authentication
  High:   >60    → Session Terminated
```

## License

Academic project — Malla Reddy University
