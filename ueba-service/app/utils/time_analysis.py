from datetime import datetime, timezone
from zoneinfo import ZoneInfo
from typing import Optional


def is_unusual_login_time(
    login_time_iso: str,
    typical_start: int = 6,
    typical_end: int = 23,
    timezone_str: Optional[str] = None,
) -> dict:
    """
    Check if login time falls outside the user's typical hours.

    Args:
        login_time_iso: ISO format timestamp of current login
        typical_start: Typical start hour (0-23)
        typical_end: Typical end hour (0-23)
        timezone_str: User's timezone (from geo-ip), e.g. "Asia/Kolkata"

    Returns:
        dict with 'is_unusual', 'login_hour', 'typical_range', 'reason'
    """
    try:
        login_time = datetime.fromisoformat(login_time_iso.replace("Z", "+00:00"))
        # Convert to user's local timezone if available, otherwise use UTC
        if timezone_str:
            try:
                user_tz = ZoneInfo(timezone_str)
                login_time = login_time.astimezone(user_tz)
            except (KeyError, ValueError):
                pass  # Invalid timezone, fall back to UTC
        login_hour = login_time.hour
    except (ValueError, AttributeError):
        login_hour = datetime.now().hour

    # Check if login hour is outside typical window
    if typical_start <= typical_end:
        # Normal range: e.g., 6 AM to 11 PM
        is_unusual = login_hour < typical_start or login_hour > typical_end
    else:
        # Wrapped range: e.g., 22 PM to 6 AM (night shift worker)
        is_unusual = typical_end < login_hour < typical_start

    reason = ""
    if is_unusual:
        if login_hour < 6:
            reason = f"Login at {login_hour}:00 — early morning access (typical: {typical_start}:00–{typical_end}:00)"
        elif login_hour >= 23:
            reason = f"Login at {login_hour}:00 — late night access (typical: {typical_start}:00–{typical_end}:00)"
        else:
            reason = f"Login at {login_hour}:00 — outside typical hours (typical: {typical_start}:00–{typical_end}:00)"

    return {
        "is_unusual": is_unusual,
        "login_hour": login_hour,
        "typical_range": f"{typical_start}:00–{typical_end}:00",
        "reason": reason,
    }


def calculate_login_frequency_anomaly(
    login_count: int,
    last_login_iso: Optional[str] = None,
    current_login_iso: Optional[str] = None,
) -> dict:
    """
    Detect rapid successive logins (possible brute force or session hijack).
    """
    if not last_login_iso or not current_login_iso:
        return {"is_anomaly": False, "gap_seconds": None, "reason": ""}

    try:
        last = datetime.fromisoformat(last_login_iso.replace("Z", "+00:00"))
        current = datetime.fromisoformat(current_login_iso.replace("Z", "+00:00"))
        gap = (current - last).total_seconds()
    except (ValueError, AttributeError):
        return {"is_anomaly": False, "gap_seconds": None, "reason": ""}

    # Flag if login gap is suspiciously short (under 30 seconds)
    is_anomaly = gap < 30 and login_count > 3

    return {
        "is_anomaly": is_anomaly,
        "gap_seconds": gap,
        "reason": f"Rapid login detected: {gap:.0f}s since last login" if is_anomaly else "",
    }
