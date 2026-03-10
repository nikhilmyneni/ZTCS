"""
Basic tests for the UEBA risk scoring engine.
"""
import pytest
from app.models.schemas import AnalyzeRequest
from app.services.behavior_analyzer import analyze_user_behavior


@pytest.mark.asyncio
async def test_known_ip_known_device_low_risk():
    """Returning user from known IP and device should score low."""
    req = AnalyzeRequest(
        user_id="user1",
        ip_address="192.168.1.1",
        device_fingerprint="device123",
        user_agent="Mozilla/5.0",
        login_time="2024-01-15T10:00:00Z",
        action="login",
        known_ips=["192.168.1.1"],
        known_devices=["device123"],
        known_device_types=["Windows"],
        current_device_type="Windows",
        typical_login_start=6,
        typical_login_end=23,
        login_count=10,
        last_login_at="2024-01-14T09:00:00Z",
        geo_locations=[],
    )
    result = await analyze_user_behavior(req)
    assert result.risk_score <= 30
    assert result.risk_level == "low"
    assert result.recommendation == "allow"


@pytest.mark.asyncio
async def test_new_ip_new_device_high_risk():
    """New IP + new device should trigger medium or high risk."""
    req = AnalyzeRequest(
        user_id="user2",
        ip_address="10.0.0.99",
        device_fingerprint="unknown_device",
        user_agent="Mozilla/5.0",
        login_time="2024-01-15T10:00:00Z",
        action="login",
        known_ips=["192.168.1.1"],
        known_devices=["device123"],
        known_device_types=["Windows"],
        current_device_type="macOS",
        typical_login_start=6,
        typical_login_end=23,
        login_count=5,
        last_login_at="2024-01-14T09:00:00Z",
        geo_locations=[],
    )
    result = await analyze_user_behavior(req)
    # New IP (25) + New Device (30) + New Device Type (15) = 70 minimum
    assert result.risk_score > 30
    assert result.risk_level in ("medium", "high")


@pytest.mark.asyncio
async def test_unusual_login_time():
    """Login at 3 AM should trigger unusual time factor."""
    req = AnalyzeRequest(
        user_id="user3",
        ip_address="192.168.1.1",
        device_fingerprint="device123",
        user_agent="Mozilla/5.0",
        login_time="2024-01-15T03:00:00Z",
        action="login",
        known_ips=["192.168.1.1"],
        known_devices=["device123"],
        known_device_types=["Windows"],
        current_device_type="Windows",
        typical_login_start=8,
        typical_login_end=18,
        login_count=20,
        last_login_at="2024-01-14T17:00:00Z",
        geo_locations=[],
    )
    result = await analyze_user_behavior(req)
    time_factor = next((f for f in result.factors if f.factor == "unusual_time"), None)
    assert time_factor is not None
    assert time_factor.triggered is True


@pytest.mark.asyncio
async def test_risk_thresholds():
    """Verify risk level boundaries: low<=30, medium<=60, high>60."""
    req = AnalyzeRequest(
        user_id="user4",
        ip_address="192.168.1.1",
        device_fingerprint="device123",
        user_agent="Mozilla/5.0",
        login_time="2024-01-15T10:00:00Z",
        action="login",
        known_ips=["192.168.1.1"],
        known_devices=["device123"],
        known_device_types=["Windows"],
        current_device_type="Windows",
        typical_login_start=6,
        typical_login_end=23,
        login_count=50,
        last_login_at="2024-01-14T09:00:00Z",
        geo_locations=[],
    )
    result = await analyze_user_behavior(req)
    if result.risk_score <= 30:
        assert result.risk_level == "low"
    elif result.risk_score <= 60:
        assert result.risk_level == "medium"
    else:
        assert result.risk_level == "high"
