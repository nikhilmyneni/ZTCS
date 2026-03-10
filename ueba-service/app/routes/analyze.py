from fastapi import APIRouter
from app.models.schemas import AnalyzeRequest, AnalyzeResponse, GeoInfo
from app.services.behavior_analyzer import analyze_user_behavior
from app.utils.geoip import lookup_ip

router = APIRouter()


@router.get("/geoip/{ip}")
async def geoip_lookup(ip: str):
    """
    Resolve an IP to geo-location data.
    Used by Node.js backend during registration to populate baseline.
    """
    geo_data = await lookup_ip(ip)
    if geo_data:
        return GeoInfo(**geo_data)
    return GeoInfo(ip=ip, is_private=True)


@router.post("/analyze", response_model=AnalyzeResponse)
async def analyze_behavior(req: AnalyzeRequest):
    """
    Analyze user behavior and compute risk score.
    
    Called by Node.js backend on every login with user's
    baseline profile and current session context.
    
    Returns risk score, risk level, triggered factors,
    and access recommendation (allow / step_up / block).
    """
    result = await analyze_user_behavior(req)
    return result


@router.post("/analyze/batch")
async def analyze_batch(requests: list[AnalyzeRequest]):
    """
    Batch analyze multiple sessions (for testing/simulation).
    Used in Phase 7 for evaluation.
    """
    results = []
    for req in requests:
        result = await analyze_user_behavior(req)
        results.append(result)
    return results
