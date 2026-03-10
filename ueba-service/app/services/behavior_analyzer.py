from app.models.schemas import AnalyzeRequest, AnalyzeResponse, RiskFactor, GeoInfo
from app.utils.geoip import lookup_ip, calculate_geo_distance
from app.utils.time_analysis import is_unusual_login_time, calculate_login_frequency_anomaly

# ─── Risk Weights (from the paper) ───
WEIGHT_NEW_IP = 25
WEIGHT_NEW_DEVICE = 30
WEIGHT_NEW_DEVICE_TYPE = 15   # New device type (OS) on same IP
WEIGHT_UNUSUAL_TIME = 20
WEIGHT_ABNORMAL_USAGE = 40

# ─── Risk Thresholds ───
THRESHOLD_LOW = 30
THRESHOLD_MEDIUM = 60


async def analyze_user_behavior(req: AnalyzeRequest) -> AnalyzeResponse:
    """
    Full UEBA behavioral analysis pipeline:
    1. Geo-IP lookup for current IP
    2. Check if IP is new (not in baseline)
    3. Check if device fingerprint is new (not in baseline)
    4. Check if device type (OS) is new (not in baseline)
    5. Check if login time is unusual
    6. Check for geo-anomalies (new country, impossible travel)
    7. Compute cumulative risk score
    8. Force minimum medium risk for new device on same IP or country change
    """
    factors = []

    # ─── 1. Geo-IP Lookup (with simulation override) ───
    if req.simulation and (req.simulation.country or req.simulation.city or req.simulation.loc):
        # Use simulated geo data for testing
        geo_info = GeoInfo(
            ip=req.simulation.ip or req.ip_address,
            city=req.simulation.city or "SimCity",
            region=req.simulation.region or "SimRegion",
            country=req.simulation.country or "US",
            loc=req.simulation.loc or "0,0",
            org="Simulation",
            timezone=req.simulation.timezone or "UTC",
            is_private=False,  # Treat as public so geo checks run
        )
    else:
        geo_data = await lookup_ip(req.ip_address)
        geo_info = None
        if geo_data:
            geo_info = GeoInfo(**geo_data)

    # ─── 2. V1: New IP Address (Weight: 25) ───
    is_new_ip = req.ip_address not in req.known_ips
    factors.append(RiskFactor(
        factor="new_ip",
        triggered=is_new_ip,
        weight=WEIGHT_NEW_IP,
        description=_ip_description(is_new_ip, req.ip_address, geo_info),
    ))

    # ─── 3. V2: New Device Fingerprint (Weight: 30) ───
    is_new_device = req.device_fingerprint not in req.known_devices
    factors.append(RiskFactor(
        factor="new_device",
        triggered=is_new_device,
        weight=WEIGHT_NEW_DEVICE,
        description="Unrecognized device fingerprint" if is_new_device else "Known device",
    ))

    # ─── 4. V2b: New Device Type / OS (Weight: 15) ───
    is_new_device_type = (
        req.current_device_type != "Unknown"
        and len(req.known_device_types) > 0
        and req.current_device_type not in req.known_device_types
    )
    factors.append(RiskFactor(
        factor="new_device_type",
        triggered=is_new_device_type,
        weight=WEIGHT_NEW_DEVICE_TYPE,
        description=f"New device type: {req.current_device_type} (known: {', '.join(req.known_device_types)})"
            if is_new_device_type
            else f"Known device type: {req.current_device_type}",
    ))

    # ─── 5. V3: Unusual Login Time (Weight: 20) ───
    effective_login_time = req.login_time
    if req.simulation and req.simulation.login_time:
        effective_login_time = req.simulation.login_time

    time_result = is_unusual_login_time(
        login_time_iso=effective_login_time,
        typical_start=req.typical_login_start,
        typical_end=req.typical_login_end,
        timezone_str=geo_info.timezone if geo_info else None,
    )
    factors.append(RiskFactor(
        factor="unusual_time",
        triggered=time_result["is_unusual"],
        weight=WEIGHT_UNUSUAL_TIME,
        description=time_result["reason"] if time_result["is_unusual"] else f"Login at {time_result['login_hour']}:00 — within typical hours",
    ))

    # ─── 6. V4: Abnormal Usage Pattern (Weight: 40) ───
    # Check new country by GEO-LOCATION of current IP (not just IP list)
    is_new_country = _check_new_country(geo_info, req.geo_locations)

    # Check impossible travel (large distance in short time)
    is_impossible_travel = _check_impossible_travel(geo_info, req.geo_locations)

    # Check rapid successive logins
    rapid_login = calculate_login_frequency_anomaly(
        login_count=req.login_count,
        last_login_iso=req.last_login_at,
        current_login_iso=req.login_time,
    )

    abnormal_triggered = is_new_country or is_impossible_travel or rapid_login["is_anomaly"]
    abnormal_desc = []
    if is_new_country and geo_info:
        abnormal_desc.append(f"New country detected: {geo_info.city}, {geo_info.country}")
    if is_impossible_travel:
        abnormal_desc.append("Impossible travel — large distance from last login location")
    if rapid_login["is_anomaly"]:
        abnormal_desc.append(rapid_login["reason"])

    factors.append(RiskFactor(
        factor="abnormal_usage",
        triggered=abnormal_triggered,
        weight=WEIGHT_ABNORMAL_USAGE,
        description=" | ".join(abnormal_desc) if abnormal_desc else "Normal usage pattern",
    ))

    # ─── 7. Compute Cumulative Risk Score ───
    risk_score = sum(f.weight for f in factors if f.triggered)

    # ─── 8. Force minimum medium risk for contextual anomalies ───
    # New device (fingerprint or type) on same IP → force into medium range for step-up
    if not is_new_ip and (is_new_device or is_new_device_type) and risk_score <= THRESHOLD_LOW:
        risk_score = THRESHOLD_LOW + 5  # Force to 35 (medium range)

    # New IP (same country, known device) → spike into medium for security question
    if is_new_ip and not is_new_device and not is_new_country and risk_score <= THRESHOLD_LOW:
        risk_score = THRESHOLD_LOW + 5  # Force to 35 (medium range)

    # Unusual login time → force into medium range for step-up
    if time_result["is_unusual"] and risk_score <= THRESHOLD_LOW:
        risk_score = THRESHOLD_LOW + 5  # Force to 35 (medium range)

    # New country → always force medium minimum
    if is_new_country and risk_score < THRESHOLD_LOW + 1:
        risk_score = THRESHOLD_LOW + 10  # Force to 40 (medium range)

    if is_impossible_travel and risk_score < THRESHOLD_MEDIUM + 1:
        risk_score = THRESHOLD_MEDIUM + 10  # Force to 70 (high range)

    risk_level = (
        "low" if risk_score <= THRESHOLD_LOW
        else "medium" if risk_score <= THRESHOLD_MEDIUM
        else "high"
    )

    recommendation = (
        "allow" if risk_level == "low"
        else "step_up" if risk_level == "medium"
        else "block"
    )

    # ─── 9. Determine required challenges (context-aware) ───
    required_challenges, challenge_reason = _determine_required_challenges(
        is_new_ip=is_new_ip,
        is_new_device=is_new_device,
        is_new_device_type=is_new_device_type,
        is_unusual_time=time_result["is_unusual"],
        is_bulk_download=False,  # Bulk download is detected server-side
        risk_level=risk_level,
    )

    return AnalyzeResponse(
        user_id=req.user_id,
        risk_score=risk_score,
        risk_level=risk_level,
        factors=factors,
        recommendation=recommendation,
        geo_info=geo_info,
        time_analysis=time_result,
        is_new_ip=is_new_ip,
        is_new_device=is_new_device,
        is_new_country=is_new_country,
        required_challenges=required_challenges,
        challenge_reason=challenge_reason,
    )


def _determine_required_challenges(
    is_new_ip: bool,
    is_new_device: bool,
    is_new_device_type: bool,
    is_unusual_time: bool,
    is_bulk_download: bool,
    risk_level: str,
) -> tuple[list[str], str]:
    """
    Challenge Decision Matrix (tiered):
    | Scenario                              | Required Challenges                    |
    |---------------------------------------|----------------------------------------|
    | Same IP + new device/device type      | Security question only                 |
    | New IP + new device (or any higher)   | Security question AND OTP/TOTP         |
    | Unusual login time                    | Security question AND OTP/TOTP         |
    | Bulk download (>10 in 5 min)          | Security question AND OTP/TOTP         |
    | New IP only (correct creds)           | Allow but spike risk (no challenge)    |
    """
    if risk_level == "low":
        return [], ""

    challenges = []
    reasons = []

    # ── Tier 1 (lowest medium risk): Same IP + new device ──
    if not is_new_ip and (is_new_device or is_new_device_type):
        if is_unusual_time:
            # New device + unusual time → escalate to both challenges
            challenges = ["secret_question", "otp_or_totp"]
            reasons.append("Login from new device at unusual time")
        else:
            # New device only → security question is enough
            challenges = ["secret_question"]
            reasons.append("Login from new device on known IP")
        return challenges, " | ".join(reasons)

    # ── Tier 1b: New IP only (same country, known device) → security question only ──
    if is_new_ip and not is_new_device and not is_new_device_type and not is_unusual_time:
        challenges = ["secret_question"]
        reasons.append("Login from new IP address (same country)")
        return challenges, " | ".join(reasons)

    # ── Tier 2 (higher medium risk): All other medium/high scenarios require
    #    security question AND (email OTP or TOTP) ──

    # New IP + new device/device type
    if is_new_ip and (is_new_device or is_new_device_type):
        challenges = ["secret_question", "otp_or_totp"]
        reasons.append("Login from new IP and unrecognized device")
        return challenges, " | ".join(reasons)

    # Unusual login time
    if is_unusual_time:
        challenges = ["secret_question", "otp_or_totp"]
        reasons.append("Login at unusual time")
        return challenges, " | ".join(reasons)

    # Bulk download
    if is_bulk_download:
        challenges = ["secret_question", "otp_or_totp"]
        reasons.append("Bulk download detected")
        return challenges, " | ".join(reasons)

    # Catch-all for any other medium risk (e.g. forced by new country / impossible travel)
    if risk_level in ("medium", "high"):
        challenges = ["secret_question", "otp_or_totp"]
        reasons.append("Elevated risk detected")
        return challenges, " | ".join(reasons)

    return challenges, " | ".join(reasons)


def _ip_description(is_new: bool, ip: str, geo_info: GeoInfo = None) -> str:
    """Generate human-readable IP risk description."""
    if not is_new:
        if geo_info and not geo_info.is_private:
            return f"Known IP — {geo_info.city}, {geo_info.country}"
        return "Known IP address"
    if geo_info and not geo_info.is_private:
        return f"New IP: {ip} ({geo_info.city}, {geo_info.country})"
    return f"New IP address: {ip}"


def _check_new_country(geo_info: GeoInfo, known_locations: list) -> bool:
    """
    Check if current login is from a different country than ALL known locations.
    This works by comparing geo-resolved country, NOT by IP matching.
    Even if the IP was seen before, if it resolves to a new country → flag it.
    """
    if not geo_info or geo_info.is_private:
        return False

    current_country = geo_info.country
    if not current_country or current_country == "Unknown":
        return False

    # If no previous locations at all, this is first real geo login
    # Flag it if the user has logged in before (login_count > 1)
    # because it means previous logins were from private IPs
    if not known_locations:
        return False

    # Extract all known countries
    known_countries = set()
    for loc in known_locations:
        if loc and loc.get("country"):
            known_countries.add(loc["country"])

    # If we have known countries and current is not in them → NEW COUNTRY
    if known_countries and current_country not in known_countries:
        return True

    return False


def _check_impossible_travel(geo_info: GeoInfo, known_locations: list) -> bool:
    """
    Check if login location is impossibly far from the most recent known location.
    E.g., India → USA in 5 minutes = impossible.
    Threshold: >2000 km is suspicious for same-day access.
    """
    if not geo_info or geo_info.is_private or not geo_info.loc or geo_info.loc == "0,0":
        return False

    if not known_locations:
        return False

    # Find the most recent location with coordinates
    last_loc = None
    for loc in reversed(known_locations):
        if loc and loc.get("loc") and loc["loc"] != "0,0":
            last_loc = loc["loc"]
            break

    if not last_loc:
        return False

    distance = calculate_geo_distance(last_loc, geo_info.loc)

    # More than 2000 km is suspicious (e.g., different continent)
    return distance > 2000
