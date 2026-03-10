import os
import httpx
from typing import Optional

_raw_token = os.getenv("IPINFO_TOKEN", "")
IPINFO_TOKEN = _raw_token if _raw_token and _raw_token != "skip-for-now" else ""
IPINFO_BASE = "https://ipinfo.io"

# Cache to avoid repeated lookups for same IP
_geo_cache: dict = {}


async def lookup_ip(ip_address: str) -> Optional[dict]:
    """
    Lookup geolocation info for an IP address using ipinfo.io.
    Returns dict with city, region, country, loc (lat,lng), org, timezone.
    Returns None if lookup fails or IP is local/private.
    """
    # Skip private/local IPs
    if _is_private_ip(ip_address):
        return {
            "ip": ip_address,
            "city": "Local",
            "region": "Local",
            "country": "Local",
            "loc": "0,0",
            "org": "Local Network",
            "timezone": "UTC",
            "is_private": True,
        }

    # Check cache
    if ip_address in _geo_cache:
        return _geo_cache[ip_address]

    try:
        url = f"{IPINFO_BASE}/{ip_address}"
        params = {}
        if IPINFO_TOKEN:
            params["token"] = IPINFO_TOKEN

        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.get(url, params=params)

            if response.status_code == 200:
                data = response.json()
                result = {
                    "ip": data.get("ip", ip_address),
                    "city": data.get("city", "Unknown"),
                    "region": data.get("region", "Unknown"),
                    "country": data.get("country", "Unknown"),
                    "loc": data.get("loc", "0,0"),
                    "org": data.get("org", "Unknown"),
                    "timezone": data.get("timezone", "UTC"),
                    "is_private": False,
                }
                _geo_cache[ip_address] = result
                return result
            else:
                print(f"Geo-IP lookup failed for {ip_address}: HTTP {response.status_code}")
                return None

    except Exception as e:
        print(f"Geo-IP lookup error for {ip_address}: {e}")
        return None


def _is_private_ip(ip: str) -> bool:
    """Check if IP is private/local."""
    private_prefixes = (
        "127.", "10.", "172.16.", "172.17.", "172.18.", "172.19.",
        "172.20.", "172.21.", "172.22.", "172.23.", "172.24.", "172.25.",
        "172.26.", "172.27.", "172.28.", "172.29.", "172.30.", "172.31.",
        "192.168.", "0.", "::1", "localhost", "unknown",
    )
    return ip.startswith(private_prefixes) or ip == "::1"


def calculate_geo_distance(loc1: str, loc2: str) -> float:
    """
    Calculate approximate distance in km between two lat,lng strings.
    Used to detect impossible travel (e.g., login from India then USA within minutes).
    """
    import math

    try:
        lat1, lng1 = map(float, loc1.split(","))
        lat2, lng2 = map(float, loc2.split(","))
    except (ValueError, AttributeError):
        return 0.0

    # Haversine formula
    R = 6371  # Earth radius in km
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(math.radians(lat1))
        * math.cos(math.radians(lat2))
        * math.sin(dlng / 2) ** 2
    )
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c
