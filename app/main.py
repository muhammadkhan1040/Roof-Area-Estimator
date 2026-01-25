"""
Two-Tier Roof Measurement API - Main Application.

This FastAPI application provides:
1. GET /estimate - Tier 1 instant estimates via Google Solar API
2. POST /order - Tier 2 verified orders via EagleView API  
3. GET /order/{id} - Order status and measurement data
4. GET /health - Health check endpoint
5. GET /costs/summary - API usage and cost summary

SAFETY FEATURES:
- EagleView is DISABLED by default (set EAGLEVIEW_LIVE_MODE=true to enable)
- Daily order limit prevents runaway costs
- All API calls are logged with estimated costs

Run with: uvicorn app.main:app --reload
"""

import asyncio
from contextlib import asynccontextmanager
from datetime import datetime
from typing import Optional, List

from fastapi import BackgroundTasks, Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import get_db, init_db, get_db_context # NEW
from app.models import (
    APIUsageLog,
    DailyOrderCount,
    DataSource,
    MeasurementStatus,
    OrderRequest,
    OrderStatusResponse,
    RoofMeasurementResponse,
    RoofOrder,
)
from app.services.google_solar import get_tier1_estimate, geocode_address
from app.services.eagleview import (
    create_tier2_order,
    check_order_status, # NEW
    get_report,         # NEW
    normalize_eagleview_data, # NEW
    run_global_polling_loop, # NEW
    EagleViewDisabledError,
    DailyLimitExceededError,
    COST_EAGLEVIEW_ORDER,
)

settings = get_settings()


# =============================================================================
# Application Lifecycle
# =============================================================================

@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Application lifecycle handler.
    
    Startup: Initialize database tables
    Shutdown: (cleanup if needed)
    """
    # Startup
    await init_db()
    
    # Start Global Poller
    asyncio.create_task(run_global_polling_loop(get_db_context))
    
    print("=" * 60)
    print("🏠 Two-Tier Roof Measurement API Started")
    print("=" * 60)
    print(f"📊 EagleView Live Mode: {'ENABLED ⚠️' if settings.eagleview_live_mode else 'DISABLED (safe)'}")
    print(f"📊 Daily Order Limit: {settings.eagleview_daily_order_limit}")
    print(f"📊 Google API Key: {'configured' if settings.google_api_key != 'not_configured' else 'NOT CONFIGURED'}")
    print("=" * 60)
    
    yield
    
    # Shutdown
    print("Shutting down...")


app = FastAPI(
    title="Two-Tier Roof Measurement API",
    description="""
    Professional roof measurement API with two tiers:
    
    🚀 **Tier 1 (Instant)**: Free estimates via Google Solar API
    
    ✅ **Tier 2 (Verified)**: Professional reports via EagleView API (~$30/order)
    
    ---
    
    ⚠️ **COST WARNING**: EagleView orders cost real money!
    - Set `EAGLEVIEW_LIVE_MODE=true` only when ready to pay
    - Default daily limit: 5 orders
    """,
    version="1.0.0",
    lifespan=lifespan,
)

# CORS middleware for frontend access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure for your domain in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# =============================================================================
# Response Models for Documentation
# =============================================================================

class CostSummary(BaseModel):
    """API usage cost summary."""
    total_google_calls: int
    total_eagleview_orders: int
    estimated_google_cost_usd: float
    estimated_eagleview_cost_usd: float
    total_estimated_cost_usd: float
    today_eagleview_orders: int
    today_eagleview_limit: int


class HealthResponse(BaseModel):
    """Health check response."""
    status: str
    eagleview_enabled: bool
    eagleview_mock_mode: bool
    google_api_configured: bool
    daily_order_count: int
    daily_order_limit: int


# =============================================================================
# Endpoints
# =============================================================================

@app.get("/", include_in_schema=False)
async def root():
    """Root endpoint - redirects to docs."""
    return {
        "message": "Two-Tier Roof Measurement API",
        "docs": "/docs",
        "health": "/health",
    }


@app.get("/health", response_model=HealthResponse)
async def health_check(db: AsyncSession = Depends(get_db)):
    """
    Health check endpoint.
    
    Returns system status and current safety limits.
    """
    # Get today's order count
    today = datetime.utcnow().strftime("%Y-%m-%d")
    result = await db.execute(
        select(DailyOrderCount).where(DailyOrderCount.date == today)
    )
    daily_count = result.scalar_one_or_none()
    current_orders = daily_count.eagleview_orders if daily_count else 0
    
    return HealthResponse(
        status="healthy",
        eagleview_enabled=settings.eagleview_live_mode,
        eagleview_mock_mode=settings.eagleview_mock_mode,
        google_api_configured=settings.google_api_key != "not_configured",
        daily_order_count=current_orders,
        daily_order_limit=settings.eagleview_daily_order_limit,
    )


@app.get("/estimate", response_model=RoofMeasurementResponse)
async def get_estimate(
    address: str = Query(
        ...,
        min_length=5,
        description="Full street address for roof estimate",
        example="1600 Amphitheatre Parkway, Mountain View, CA"
    ),
    db: AsyncSession = Depends(get_db),
):
    """
    Get a Tier 1 (instant) roof estimate.
    
    Uses Google Solar API to provide a quick estimate of:
    - Total roof area (in square feet)
    - Predominant roof pitch
    
    **Cost**: ~$0.015 per request (Geocoding + Solar API)
    
    **Response Time**: Typically 1-3 seconds
    
    Returns a clean response even if data is unavailable (MANUAL_REVIEW status).
    """
    return await get_tier1_estimate(address, db)


@app.post("/order", response_model=OrderStatusResponse)
async def create_order(
    request: OrderRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    """
    Create a Tier 2 (verified) roof measurement order.
    
    ⚠️ **COST WARNING**: This action costs approximately **$30**!
    
    **Safety Controls**:
    - Requires `EAGLEVIEW_LIVE_MODE=true` in environment
    - Subject to daily order limit
    
    **Process**:
    1. Geocodes the address
    2. Gets a Tier 1 estimate first (for immediate data)
    3. Places an order with EagleView
    4. Starts background polling for completion
    
    **Response**: Returns immediately with PENDING status.
    Use `GET /order/{id}` to check for completion.
    """
    try:
        # Step 1: Geocode the address
        lat, lng = await geocode_address(request.address, db)
        
        # Step 2: Get Tier 1 estimate first (for immediate data)
        tier1_data = await get_tier1_estimate(request.address, db)
        
        # Step 3: Create Tier 2 order (includes safety checks)
        order = await create_tier2_order(
            lat=lat,
            lng=lng,
            tier1_data=tier1_data,
            report_type=request.report_type, # Pass report type
            db=db,
        )
        
        await db.commit()
        
        # Step 4: No request-specific polling task (Global Poller handles it)
        # However, for immediate user feedback, we could check once after a short delay, 
        # but standard flow relies on Global Poller or Manual Check.
        pass
        
        # Build response with current (Tier 1) data
        measurement = RoofMeasurementResponse(
            status=MeasurementStatus.PENDING,
            total_area_sqft=order.total_area_sqft,
            predominant_pitch=order.predominant_pitch,
            source=DataSource.GOOGLE_SOLAR,
            confidence_score=order.confidence_score,
            address=order.address,
            order_id=order.eagleview_order_id,
            message="Order placed. Polling for EagleView completion.",
        )
        
        return OrderStatusResponse(
            order_id=order.eagleview_order_id,
            status=MeasurementStatus.PENDING,
            measurement=measurement,
            created_at=order.created_at,
            updated_at=order.updated_at,
        )
        
    except EagleViewDisabledError as e:
        raise HTTPException(
            status_code=403,
            detail=str(e),
        )
    except DailyLimitExceededError as e:
        raise HTTPException(
            status_code=429,
            detail=str(e),
        )
    except ValueError as e:
        raise HTTPException(
            status_code=400,
            detail=str(e),
        )


@app.get("/order/{order_id}", response_model=OrderStatusResponse)
async def get_order_status(
    order_id: str,
    db: AsyncSession = Depends(get_db),
):
    """
    Get the status and data for an existing order.
    
    Returns the current measurement data:
    - While PENDING: Shows Tier 1 (Google Solar) estimate
    - When VERIFIED: Shows Tier 2 (EagleView) professional measurement
    """
    # Find order by EagleView order ID
    result = await db.execute(
        select(RoofOrder).where(RoofOrder.eagleview_order_id == order_id)
    )
    order = result.scalar_one_or_none()
    
    if not order:
        raise HTTPException(
            status_code=404,
            detail=f"Order not found: {order_id}",
        )
    
    # Build measurement response
    measurement = RoofMeasurementResponse(
        status=MeasurementStatus(order.status),
        total_area_sqft=order.total_area_sqft,
        predominant_pitch=order.predominant_pitch,
        source=DataSource(order.source),
        confidence_score=order.confidence_score,
        address=order.address,
        order_id=order.eagleview_order_id,
        message=order.message,
    )
    
    return OrderStatusResponse(
        order_id=order.eagleview_order_id,
        status=MeasurementStatus(order.status),
        measurement=measurement,
        created_at=order.created_at,
        updated_at=order.updated_at,
    )


@app.post("/orders/{order_id}/check-now", response_model=OrderStatusResponse)
async def check_order_now(
    order_id: str,
    db: AsyncSession = Depends(get_db),
):
    """
    Force an immediate status check for an order.
    
    Useful if you don't want to wait for the Global Poller (30m).
    """
    # 1. Find Order
    result = await db.execute(
        select(RoofOrder).where(RoofOrder.eagleview_order_id == order_id)
    )
    order = result.scalar_one_or_none()
    
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
        
    # 2. Check Status
    try:
        status = await check_order_status(order_id, db)
        order.last_checked_at = datetime.utcnow()
        
        if status == "COMPLETED" and order.status != MeasurementStatus.VERIFIED.value:
            # Upgrade to Verified
            report = await get_report(order_id, db)
            normalized = normalize_eagleview_data(report, order.address, order_id)
            
            order.status = MeasurementStatus.VERIFIED.value
            order.source = DataSource.EAGLEVIEW.value
            order.total_area_sqft = normalized.total_area_sqft
            order.predominant_pitch = normalized.predominant_pitch
            order.confidence_score = normalized.confidence_score
            import json
            order.raw_eagleview_json = json.dumps(report)
            order.updated_at = datetime.utcnow()
            
            await db.commit()
            
        elif status == "FAILED":
            order.status = MeasurementStatus.FAILED.value
            order.message = "EagleView reported failure"
            order.updated_at = datetime.utcnow()
            await db.commit()
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Check failed: {str(e)}")
        
    # 3. Return Updated Response
    # Re-fetch or reuse object? Object is attached to session.
    # Re-construct response logic (duplicated from get_order_status)
    measurement = RoofMeasurementResponse(
        status=MeasurementStatus(order.status),
        total_area_sqft=order.total_area_sqft,
        predominant_pitch=order.predominant_pitch,
        source=DataSource(order.source),
        confidence_score=order.confidence_score,
        address=order.address,
        order_id=order.eagleview_order_id,
        message=order.message,
    )
    
    return OrderStatusResponse(
        order_id=order.eagleview_order_id,
        status=MeasurementStatus(order.status),
        measurement=measurement,
        created_at=order.created_at,
        updated_at=order.updated_at,
    )



def to_list_filter(column, values):
    """Helper for IN clause that handles simple lists."""
    return column.in_(values)


@app.get("/history", response_model=List[OrderStatusResponse])
async def get_history(
    type: str = Query(..., description="Filter by type: ESTIMATE or ORDER"),
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
):
    """
    Get history of estimates or orders.
    
    type=ESTIMATE: Returns Tier 1 estimates (status=ESTIMATE, MANUAL_REVIEW)
    type=ORDER: Returns Tier 2 orders (status=PENDING, VERIFIED, FAILED)
    """
    stmt = select(RoofOrder).order_by(RoofOrder.updated_at.desc()).limit(limit)
    
    if type == "ESTIMATE":
        stmt = stmt.where(to_list_filter(
            RoofOrder.status, 
            [MeasurementStatus.ESTIMATE.value, MeasurementStatus.MANUAL_REVIEW.value]
        ))
    elif type == "ORDER":
        stmt = stmt.where(to_list_filter(
            RoofOrder.status, 
            [MeasurementStatus.PENDING.value, MeasurementStatus.VERIFIED.value, MeasurementStatus.FAILED.value]
        ))
    
    result = await db.execute(stmt)
    orders = result.scalars().all()
    
    response = []
    for order in orders:
        measurement = RoofMeasurementResponse(
            status=MeasurementStatus(order.status),
            total_area_sqft=order.total_area_sqft,
            predominant_pitch=order.predominant_pitch,
            source=DataSource(order.source),
            confidence_score=order.confidence_score,
            address=order.address,
            order_id=order.eagleview_order_id,
        )
        
        response.append(OrderStatusResponse(
            order_id=order.eagleview_order_id or str(order.id),
            status=MeasurementStatus(order.status),
            measurement=measurement,
            created_at=order.created_at,
            updated_at=order.updated_at,
        ))
        
    return response


@app.get("/costs/summary", response_model=CostSummary)
async def get_cost_summary(db: AsyncSession = Depends(get_db)):
    """
    Get a summary of API usage and estimated costs.
    
    Useful for monitoring spend and staying within budget.
    """
    # Total Google calls
    google_result = await db.execute(
        select(func.count(APIUsageLog.id)).where(APIUsageLog.provider == "GOOGLE")
    )
    total_google = google_result.scalar() or 0
    
    # Total EagleView orders (only count order placement calls)
    ev_result = await db.execute(
        select(func.count(APIUsageLog.id)).where(
            APIUsageLog.provider == "EAGLEVIEW",
            APIUsageLog.endpoint == "orders",
            APIUsageLog.method == "POST",
            APIUsageLog.success == True,
        )
    )
    total_eagleview = ev_result.scalar() or 0
    
    # Today's orders
    today = datetime.utcnow().strftime("%Y-%m-%d")
    daily_result = await db.execute(
        select(DailyOrderCount).where(DailyOrderCount.date == today)
    )
    daily_count = daily_result.scalar_one_or_none()
    today_orders = daily_count.eagleview_orders if daily_count else 0
    
    # Calculate costs
    google_cost = total_google * 0.01  # ~$0.01 per call average
    eagleview_cost = total_eagleview * COST_EAGLEVIEW_ORDER
    
    return CostSummary(
        total_google_calls=total_google,
        total_eagleview_orders=total_eagleview,
        estimated_google_cost_usd=round(google_cost, 2),
        estimated_eagleview_cost_usd=round(eagleview_cost, 2),
        total_estimated_cost_usd=round(google_cost + eagleview_cost, 2),
        today_eagleview_orders=today_orders,
        today_eagleview_limit=settings.eagleview_daily_order_limit,
    )


@app.get("/orders", response_model=list[OrderStatusResponse])
async def list_orders(
    limit: int = Query(default=20, le=100),
    db: AsyncSession = Depends(get_db),
):
    """
    List recent orders with their current status.
    """
    result = await db.execute(
        select(RoofOrder)
        .order_by(RoofOrder.created_at.desc())
        .limit(limit)
    )
    orders = result.scalars().all()
    
    responses = []
    for order in orders:
        measurement = RoofMeasurementResponse(
            status=MeasurementStatus(order.status),
            total_area_sqft=order.total_area_sqft,
            predominant_pitch=order.predominant_pitch,
            source=DataSource(order.source),
            confidence_score=order.confidence_score,
            address=order.address,
            order_id=order.eagleview_order_id,
            message=order.message,
        )
        
        responses.append(OrderStatusResponse(
            order_id=order.eagleview_order_id or str(order.id),
            status=MeasurementStatus(order.status),
            measurement=measurement,
            created_at=order.created_at,
            updated_at=order.updated_at,
        ))
    
    return responses


# =============================================================================
# Main Entry Point
# =============================================================================

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=settings.debug,
    )
