import os
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(
    title="ZTCS UEBA Service",
    description="User and Entity Behavior Analytics engine for Zero Trust Cloud System",
    version="1.0.0",
)

# ─── Service-to-Service Authentication ───
# Validates X-Service-Token header on /api/ueba/* routes.
# Health endpoint is excluded so monitoring tools can reach it.
UEBA_SERVICE_TOKEN = os.getenv("UEBA_SERVICE_TOKEN", "")


class ServiceAuthMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        # Skip auth for health, docs, and openapi endpoints
        if request.url.path in ("/", "/health", "/docs", "/openapi.json", "/redoc"):
            return await call_next(request)

        # If no token is configured, skip auth (backwards compatible for dev)
        if not UEBA_SERVICE_TOKEN:
            return await call_next(request)

        token = request.headers.get("X-Service-Token", "")
        if token != UEBA_SERVICE_TOKEN:
            return JSONResponse(
                status_code=401,
                content={"detail": "Invalid or missing service token"},
            )

        return await call_next(request)


app.add_middleware(ServiceAuthMiddleware)

# CORS — allow Node.js backend to call this service
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5000",
        "https://ztcs-server.onrender.com",
        "https://api.ztcs.app",
    ],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Import routes
from app.routes.analyze import router as analyze_router
from app.routes.health import router as health_router

app.include_router(health_router, tags=["Health"])
app.include_router(analyze_router, prefix="/api/ueba", tags=["UEBA"])
