"""
EagleView API Integration (Tier 2 - Verified Reports).

This module provides:
1. OAuth2 authentication with token caching
2. Order placement for professional roof reports
3. Status polling and report retrieval
4. Data normalization to canonical format

⚠️  COST WARNING: Each EagleView order costs approximately $30!

SAFETY CONTROLS (implemented in this module):
1. EAGLEVIEW_LIVE_MODE must be True in settings (defaults to False)
2. Daily order limit is enforced (defaults to 5)
3. All orders are logged for cost tracking

Why EagleView for Tier 2?
- Professional-grade measurements
- Human-verified accuracy
- Used by insurance companies
- Legal defensibility for claims
"""

import json
from datetime import datetime, timedelta
from typing import Optional, Tuple

import httpx
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models import (
    APIUsageLog,
    DailyOrderCount,
    DataSource,
    MeasurementStatus,
    RoofMeasurementResponse,
    RoofOrder,
)

settings = get_settings()

# API endpoints - EagleView Connect API
# Note: These are example endpoints - verify with actual EagleView documentation
EAGLEVIEW_AUTH_URL = "https://oauth.eagleview.com/oauth2/default/v1/token"
EAGLEVIEW_ORDERS_URL = f"{settings.eagleview_base_url}/v1/orders"

# Cost per order
COST_EAGLEVIEW_ORDER = 30.0

# Token cache (in-memory for simplicity; use Redis in production)
_token_cache: dict = {
    "access_token": None,
    "expires_at": None,
}


class EagleViewDisabledError(Exception):
    """Raised when EagleView is disabled in settings."""
    pass


class DailyLimitExceededError(Exception):
    """Raised when daily order limit is exceeded."""
    pass


async def log_api_call(
    db: AsyncSession,
    endpoint: str,
    method: str,
    cost: float,
    address: Optional[str],
    status: Optional[int],
    success: bool,
    error: Optional[str] = None,
    response_time_ms: Optional[int] = None,
) -> None:
    """Log an EagleView API call for cost tracking."""
    log = APIUsageLog(
        provider="EAGLEVIEW",
        endpoint=endpoint,
        method=method,
        estimated_cost_usd=cost,
        request_address=address,
        response_status=status,
        success=success,
        error_message=error,
        response_time_ms=response_time_ms,
        timestamp=datetime.utcnow(),
    )
    db.add(log)


async def check_safety_controls(db: AsyncSession) -> Tuple[bool, str]:
    """
    Check if it's safe to place an EagleView order.
    
    Checks:
    1. EAGLEVIEW_LIVE_MODE must be enabled
    2. Daily order limit must not be exceeded
    
    Returns:
        Tuple of (is_safe, reason_if_not_safe)
    """
    # Check 1: Live mode must be enabled
    if not settings.eagleview_live_mode:
        return (
            False,
            "EagleView is disabled (EAGLEVIEW_LIVE_MODE=false). "
            "Set EAGLEVIEW_LIVE_MODE=true in .env to enable real orders. "
            "WARNING: Each order costs ~$30!"
        )
    
    # Check 2: Daily limit
    today = datetime.utcnow().strftime("%Y-%m-%d")
    
    result = await db.execute(
        select(DailyOrderCount).where(DailyOrderCount.date == today)
    )
    daily_count = result.scalar_one_or_none()
    
    current_count = daily_count.eagleview_orders if daily_count else 0
    
    if current_count >= settings.eagleview_daily_order_limit:
        return (
            False,
            f"Daily order limit reached ({current_count}/{settings.eagleview_daily_order_limit}). "
            f"Total cost today: ${current_count * COST_EAGLEVIEW_ORDER:.2f}. "
            "Limit resets at midnight UTC."
        )
    
    return (True, "")


async def increment_daily_count(db: AsyncSession) -> None:
    """Increment the daily EagleView order count."""
    today = datetime.utcnow().strftime("%Y-%m-%d")
    
    result = await db.execute(
        select(DailyOrderCount).where(DailyOrderCount.date == today)
    )
    daily_count = result.scalar_one_or_none()
    
    if daily_count:
        daily_count.eagleview_orders += 1
        daily_count.total_cost_usd += COST_EAGLEVIEW_ORDER
    else:
        daily_count = DailyOrderCount(
            date=today,
            eagleview_orders=1,
            total_cost_usd=COST_EAGLEVIEW_ORDER,
        )
        db.add(daily_count)


async def get_bearer_token(db: AsyncSession) -> str:
    """
    Get a valid OAuth2 bearer token for EagleView API.
    
    Uses client_credentials flow with token caching.
    Automatically refreshes when token expires.
    
    Returns:
        Bearer token string
        
    Raises:
        httpx.HTTPError: On authentication failure
    """
    global _token_cache
    
    # Check if cached token is still valid
    if _token_cache["access_token"] and _token_cache["expires_at"]:
        if datetime.utcnow() < _token_cache["expires_at"]:
            return _token_cache["access_token"]
    
    # Token expired or not cached - fetch new one
    start_time = datetime.utcnow()
    
    auth_data = {
        "grant_type": "client_credentials",
        "client_id": settings.eagleview_client_id,
        "client_secret": settings.eagleview_client_secret,
        "scope": "reports:read reports:write",
    }
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            response = await client.post(
                EAGLEVIEW_AUTH_URL,
                data=auth_data,
                headers={"Content-Type": "application/x-www-form-urlencoded"},
            )
            response_time_ms = int((datetime.utcnow() - start_time).total_seconds() * 1000)
            
            # Log auth call (no cost for auth)
            await log_api_call(
                db=db,
                endpoint="oauth/token",
                method="POST",
                cost=0.0,
                address=None,
                status=response.status_code,
                success=response.status_code == 200,
                response_time_ms=response_time_ms,
            )
            
            if response.status_code != 200:
                raise ValueError(f"EagleView auth failed: {response.text}")
            
            data = response.json()
            
            # Cache the token
            _token_cache["access_token"] = data["access_token"]
            expires_in = data.get("expires_in", 3600)  # Default 1 hour
            _token_cache["expires_at"] = datetime.utcnow() + timedelta(seconds=expires_in - 60)
            
            return data["access_token"]
            
        except httpx.HTTPError as e:
            await log_api_call(
                db=db,
                endpoint="oauth/token",
                method="POST",
                cost=0.0,
                address=None,
                status=None,
                success=False,
                error=str(e),
            )
            raise


async def place_order(
    address: str,
    lat: float,
    lng: float,
    db: AsyncSession,
) -> str:
    """
    Place a roof measurement order with EagleView.
    
    ⚠️  COST: This action costs approximately $30!
    
    Safety checks are performed before placing the order:
    1. EAGLEVIEW_LIVE_MODE must be True
    2. Daily order limit must not be exceeded
    
    Args:
        address: Full street address
        lat: Latitude
        lng: Longitude
        db: Database session
        
    Returns:
        EagleView order ID
        
    Raises:
        EagleViewDisabledError: If EAGLEVIEW_LIVE_MODE is False
        DailyLimitExceededError: If daily limit exceeded
        httpx.HTTPError: On API errors
    """
    # SAFETY CHECK - This is where we protect against accidental costs
    is_safe, reason = await check_safety_controls(db)
    if not is_safe:
        if "disabled" in reason.lower():
            raise EagleViewDisabledError(reason)
        else:
            raise DailyLimitExceededError(reason)
    
    # Get auth token
    token = await get_bearer_token(db)
    
    # Prepare order request
    # Note: This is a simplified payload - adjust based on actual EagleView API docs
    order_payload = {
        "address": {
            "streetAddress": address,
            "latitude": lat,
            "longitude": lng,
        },
        "reportType": "PremiumRoofMeasurement",
        "deliveryPreference": "IMMEDIATE",
    }
    
    start_time = datetime.utcnow()
    
    async with httpx.AsyncClient(timeout=60.0) as client:
        try:
            response = await client.post(
                EAGLEVIEW_ORDERS_URL,
                json=order_payload,
                headers={
                    "Authorization": f"Bearer {token}",
                    "Content-Type": "application/json",
                },
            )
            response_time_ms = int((datetime.utcnow() - start_time).total_seconds() * 1000)
            
            # Log the order (this is the $30 call!)
            await log_api_call(
                db=db,
                endpoint="orders",
                method="POST",
                cost=COST_EAGLEVIEW_ORDER,
                address=address,
                status=response.status_code,
                success=response.status_code in (200, 201, 202),
                response_time_ms=response_time_ms,
            )
            
            if response.status_code not in (200, 201, 202):
                raise ValueError(f"EagleView order failed: {response.text}")
            
            data = response.json()
            order_id = data.get("orderId") or data.get("id")
            
            if not order_id:
                raise ValueError("EagleView response missing order ID")
            
            # Increment daily count after successful order
            await increment_daily_count(db)
            
            return str(order_id)
            
        except httpx.HTTPError as e:
            await log_api_call(
                db=db,
                endpoint="orders",
                method="POST",
                cost=0.0,  # Don't count failed requests
                address=address,
                status=None,
                success=False,
                error=str(e),
            )
            raise


async def check_order_status(
    order_id: str,
    db: AsyncSession,
) -> str:
    """
    Check the status of an EagleView order.
    
    Returns:
        Status string: "PENDING", "COMPLETED", or "FAILED"
    """
    token = await get_bearer_token(db)
    
    url = f"{EAGLEVIEW_ORDERS_URL}/{order_id}/status"
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            response = await client.get(
                url,
                headers={"Authorization": f"Bearer {token}"},
            )
            
            # Log status check (minimal cost, effectively free)
            await log_api_call(
                db=db,
                endpoint=f"orders/{order_id}/status",
                method="GET",
                cost=0.0,
                address=None,
                status=response.status_code,
                success=response.status_code == 200,
            )
            
            if response.status_code != 200:
                return "PENDING"  # Assume still processing
            
            data = response.json()
            status = data.get("status", "").upper()
            
            if status in ("COMPLETE", "COMPLETED", "DELIVERED"):
                return "COMPLETED"
            elif status in ("FAILED", "ERROR", "CANCELLED"):
                return "FAILED"
            else:
                return "PENDING"
                
        except httpx.HTTPError:
            return "PENDING"  # Network error - assume still processing


async def get_report(
    order_id: str,
    db: AsyncSession,
) -> dict:
    """
    Fetch the completed report for an EagleView order.
    
    Returns:
        Raw report JSON data
        
    Raises:
        ValueError: If report not available
    """
    token = await get_bearer_token(db)
    
    url = f"{EAGLEVIEW_ORDERS_URL}/{order_id}/report"
    
    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.get(
            url,
            headers={"Authorization": f"Bearer {token}"},
        )
        
        await log_api_call(
            db=db,
            endpoint=f"orders/{order_id}/report",
            method="GET",
            cost=0.0,
            address=None,
            status=response.status_code,
            success=response.status_code == 200,
        )
        
        if response.status_code != 200:
            raise ValueError(f"Report not available: {response.text}")
        
        return response.json()


def normalize_eagleview_data(
    report: dict,
    address: str,
    order_id: str,
) -> RoofMeasurementResponse:
    """
    Convert EagleView report to canonical RoofMeasurementResponse.
    
    Maps EagleView-specific fields to our unified schema.
    """
    # Extract measurements - field names may vary based on report type
    # These are common field names in EagleView reports
    roof_data = report.get("roofMeasurements", report.get("roof", {}))
    
    # Total area (EagleView usually provides in sqft)
    total_area = (
        roof_data.get("totalArea") or
        roof_data.get("totalRoofArea") or
        roof_data.get("area", 0)
    )
    
    # Predominant pitch
    pitch = roof_data.get("predominantPitch") or roof_data.get("pitch", "Unknown")
    
    # If pitch is in degrees, convert to X/12 format
    if isinstance(pitch, (int, float)):
        import math
        rise = math.tan(math.radians(pitch)) * 12
        pitch = f"{round(rise)}/12"
    
    return RoofMeasurementResponse(
        status=MeasurementStatus.VERIFIED,
        total_area_sqft=float(total_area),
        predominant_pitch=str(pitch),
        source=DataSource.EAGLEVIEW,
        confidence_score=0.98,  # Professional measurement
        address=address,
        order_id=order_id,
        message="Professional measurement from EagleView",
    )


async def poll_and_update_order(
    internal_order_id: int,
    eagleview_order_id: str,
) -> None:
    """
    Background task to poll EagleView for order completion.
    
    This runs asynchronously after an order is placed.
    Polls every 5 minutes until order completes or fails.
    
    Note: In production, consider using a proper task queue (Celery, etc.)
    """
    import asyncio
    from app.database import get_db_context
    
    max_attempts = 288  # 24 hours of polling at 5-minute intervals
    
    for attempt in range(max_attempts):
        await asyncio.sleep(300)  # Wait 5 minutes
        
        async with get_db_context() as db:
            try:
                status = await check_order_status(eagleview_order_id, db)
                
                # Get the order from database
                result = await db.execute(
                    select(RoofOrder).where(RoofOrder.id == internal_order_id)
                )
                order = result.scalar_one_or_none()
                
                if not order:
                    return  # Order deleted, stop polling
                
                if status == "COMPLETED":
                    # Fetch the report
                    report = await get_report(eagleview_order_id, db)
                    
                    # Update order with Tier 2 data
                    normalized = normalize_eagleview_data(
                        report,
                        order.address,
                        eagleview_order_id,
                    )
                    
                    order.status = MeasurementStatus.VERIFIED.value
                    order.source = DataSource.EAGLEVIEW.value
                    order.total_area_sqft = normalized.total_area_sqft
                    order.predominant_pitch = normalized.predominant_pitch
                    order.confidence_score = normalized.confidence_score
                    order.raw_eagleview_response = json.dumps(report)
                    order.updated_at = datetime.utcnow()
                    
                    await db.commit()
                    return  # Done!
                    
                elif status == "FAILED":
                    order.status = MeasurementStatus.FAILED.value
                    order.message = "EagleView order failed"
                    order.updated_at = datetime.utcnow()
                    await db.commit()
                    return
                    
                # Still pending, continue polling
                
            except Exception as e:
                # Log error but continue polling
                print(f"Error polling order {eagleview_order_id}: {e}")


async def create_tier2_order(
    address: str,
    lat: float,
    lng: float,
    tier1_data: Optional[RoofMeasurementResponse],
    db: AsyncSession,
) -> RoofOrder:
    """
    Create a Tier 2 (EagleView) order request.
    
    This stores the order in the database and returns immediately.
    The actual EagleView order and polling happens asynchronously.
    
    Args:
        address: Full street address
        lat: Latitude
        lng: Longitude
        tier1_data: Optional Tier 1 estimate to store
        db: Database session
        
    Returns:
        RoofOrder database model
        
    Raises:
        EagleViewDisabledError: If EagleView is disabled
        DailyLimitExceededError: If daily limit exceeded
    """
    # Safety check first
    is_safe, reason = await check_safety_controls(db)
    if not is_safe:
        if "disabled" in reason.lower():
            raise EagleViewDisabledError(reason)
        else:
            raise DailyLimitExceededError(reason)
    
    # Place the order with EagleView
    eagleview_order_id = await place_order(address, lat, lng, db)
    
    # Create database record
    order = RoofOrder(
        address=address,
        latitude=lat,
        longitude=lng,
        status=MeasurementStatus.PENDING.value,
        source=DataSource.GOOGLE_SOLAR.value,  # Will update to EAGLEVIEW when complete
        eagleview_order_id=eagleview_order_id,
        total_area_sqft=tier1_data.total_area_sqft if tier1_data else 0.0,
        predominant_pitch=tier1_data.predominant_pitch if tier1_data else "Unknown",
        confidence_score=tier1_data.confidence_score if tier1_data else None,
        raw_google_response=tier1_data.model_dump_json() if tier1_data else None,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    
    db.add(order)
    await db.flush()  # Get the auto-generated ID
    
    return order
