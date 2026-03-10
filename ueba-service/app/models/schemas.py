from pydantic import BaseModel
from typing import Optional, List


class SimulationOverrides(BaseModel):
    """Override geo/time data for local testing (dev mode only)."""
    ip: Optional[str] = None
    city: Optional[str] = None
    region: Optional[str] = None
    country: Optional[str] = None
    loc: Optional[str] = None           # "lat,lng" e.g. "40.7128,-74.0060"
    timezone: Optional[str] = None      # e.g. "America/New_York"
    login_time: Optional[str] = None    # ISO format override


class AnalyzeRequest(BaseModel):
    user_id: str
    ip_address: str
    device_fingerprint: str
    user_agent: str
    login_time: str

    action: str = "login"

    known_ips: List[str] = []
    known_devices: List[str] = []
    known_device_types: List[str] = []
    current_device_type: str = "Unknown"
    typical_login_start: int = 6
    typical_login_end: int = 23
    login_count: int = 0
    last_login_at: Optional[str] = None
    geo_locations: List[dict] = []

    # Simulation overrides for local/dev testing
    simulation: Optional[SimulationOverrides] = None


class RiskFactor(BaseModel):
    factor: str
    triggered: bool
    weight: int
    description: str


class GeoInfo(BaseModel):
    ip: str = ""
    city: str = "Unknown"
    region: str = "Unknown"
    country: str = "Unknown"
    loc: str = "0,0"
    org: str = "Unknown"
    timezone: str = "UTC"
    is_private: bool = False


class AnalyzeResponse(BaseModel):
    user_id: str
    risk_score: int
    risk_level: str
    factors: List[RiskFactor]
    recommendation: str
    geo_info: Optional[GeoInfo] = None
    time_analysis: Optional[dict] = None
    is_new_ip: bool = False
    is_new_device: bool = False
    is_new_country: bool = False
    required_challenges: List[str] = []
    challenge_reason: str = ""