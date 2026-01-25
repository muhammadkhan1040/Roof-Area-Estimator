"""
Google Solar API Integration (Tier 1 - Instant Estimates).

This module provides:
1. Geocoding: Address → (lat, lng) conversion
2. Building Insights: Roof area and pitch data from Google Solar API
3. Data normalization to canonical format

Cost: ~$0.01 per Solar API call, ~$0.005 per Geocoding call

Why Google Solar for Tier 1?
- Instant response (no waiting)
- Free/cheap API calls
- Good enough for initial estimates
- Available for most US addresses
"""

import math
from datetime import datetime
from typing import Optional, Tuple

import hashlib
import json
import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models import (
    APIUsageLog,
    DataSource,
    MeasurementStatus,
    RoofMeasurementResponse,
    RoofOrder,
)

settings = get_settings()

# API endpoints
GEOCODING_URL = "https://maps.googleapis.com/maps/api/geocode/json"
SOLAR_INSIGHTS_URL = "https://solar.googleapis.com/v1/buildingInsights:findClosest"

# Cost estimates (USD)
COST_GEOCODING = 0.005
COST_SOLAR_INSIGHTS = 0.01


async def log_api_call(
    db: AsyncSession,
    provider: str,
    endpoint: str,
    method: str,
    cost: float,
    address: Optional[str],
    status: Optional[int],
    success: bool,
    error: Optional[str] = None,
    response_time_ms: Optional[int] = None,
) -> None:
    """
    Log an API call to the database for cost tracking.
    
    This is critical for monitoring spend and debugging.
    """
    log = APIUsageLog(
        provider=provider,
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
    # Don't commit here - let the caller handle transaction


async def geocode_address(
    address: str,
    db: AsyncSession,
) -> Tuple[float, float]:
    """
    Convert an address string to latitude/longitude coordinates.
    
    Uses Google Geocoding API.
    
    Args:
        address: Full street address string
        db: Database session for logging
        
    Returns:
        Tuple of (latitude, longitude)
        
    Raises:
        ValueError: If address cannot be geocoded
        httpx.HTTPError: On network errors
    """
    start_time = datetime.utcnow()
    
    params = {
        "address": address,
        "key": settings.google_api_key,
    }
    
    print(f"[DEBUG] Geocoding address: {address}")
    print(f"[DEBUG] Using API key: {settings.google_api_key[:10]}..." if len(settings.google_api_key) > 10 else f"[DEBUG] API key: {settings.google_api_key}")
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            response = await client.get(GEOCODING_URL, params=params)
            response_time_ms = int((datetime.utcnow() - start_time).total_seconds() * 1000)
            
            data = response.json()
            
            # DEBUG: Print what Google returns
            print(f"[DEBUG] Geocoding HTTP status: {response.status_code}")
            print(f"[DEBUG] Geocoding response status: {data.get('status')}")
            if data.get('error_message'):
                print(f"[DEBUG] Geocoding error: {data.get('error_message')}")
            
            # Log the API call
            await log_api_call(
                db=db,
                provider="GOOGLE",
                endpoint="geocoding",
                method="GET",
                cost=COST_GEOCODING,
                address=address,
                status=response.status_code,
                success=data.get("status") == "OK",
                error=data.get("error_message"),
                response_time_ms=response_time_ms,
            )
            
            if response.status_code != 200:
                raise ValueError(f"Geocoding failed with status {response.status_code}")
            
            if data.get("status") != "OK" or not data.get("results"):
                error_msg = data.get("error_message", f"Status: {data.get('status')}")
                raise ValueError(f"Geocoding failed: {error_msg}")
            
            location = data["results"][0]["geometry"]["location"]
            print(f"[DEBUG] Geocoded to: ({location['lat']}, {location['lng']})")
            return (location["lat"], location["lng"])
            
        except httpx.HTTPError as e:
            await log_api_call(
                db=db,
                provider="GOOGLE",
                endpoint="geocoding",
                method="GET",
                cost=COST_GEOCODING,
                address=address,
                status=None,
                success=False,
                error=str(e),
            )
            raise


async def get_building_insights(
    lat: float,
    lng: float,
    db: AsyncSession,
    address: Optional[str] = None,
) -> dict:
    """
    Query Google Solar API for building roof data.
    
    The buildingInsights endpoint returns:
    - areaMeters2: Total roof area in square meters
    - roofSegmentStats: Array of roof segments with pitch data
    - solarPanelConfigs: (unused) solar panel placement options
    
    Args:
        lat: Latitude
        lng: Longitude  
        db: Database session for logging
        address: Original address (for logging)
        
    Returns:
        Raw API response dict
        
    Raises:
        ValueError: If building not found (404)
        httpx.HTTPError: On network errors
    """
    start_time = datetime.utcnow()
    
    params = {
        "location.latitude": lat,
        "location.longitude": lng,
        "requiredQuality": "LOW",  # Accept lower quality for more coverage
        "key": settings.google_api_key,
    }
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            response = await client.get(SOLAR_INSIGHTS_URL, params=params)
            response_time_ms = int((datetime.utcnow() - start_time).total_seconds() * 1000)
            
            # Log the API call
            await log_api_call(
                db=db,
                provider="GOOGLE",
                endpoint="buildingInsights",
                method="GET",
                cost=COST_SOLAR_INSIGHTS,
                address=address,
                status=response.status_code,
                success=response.status_code == 200,
                response_time_ms=response_time_ms,
            )
            
            if response.status_code == 404:
                # Building not found - this is common for rural areas
                raise ValueError("Building not found in Google Solar database")
            
            if response.status_code == 403:
                raise ValueError("Google Solar API access denied - check API key permissions")
            
            if response.status_code != 200:
                raise ValueError(f"Solar API failed with status {response.status_code}")
            
            return response.json()
            
        except httpx.HTTPError as e:
            await log_api_call(
                db=db,
                provider="GOOGLE",
                endpoint="buildingInsights",
                method="GET",
                cost=COST_SOLAR_INSIGHTS,
                address=address,
                status=None,
                success=False,
                error=str(e),
            )
            raise


def degrees_to_pitch_string(degrees: float) -> str:
    """
    Convert pitch in degrees to standard "X/12" notation.
    
    Example: 26.57° → "6/12" (because tan(26.57°) ≈ 6/12)
    
    Common pitches:
    - 4/12 = 18.43°
    - 6/12 = 26.57°
    - 8/12 = 33.69°
    - 10/12 = 39.81°
    - 12/12 = 45°
    """
    if degrees <= 0:
        return "Flat"
    
    # Convert degrees to rise/run ratio
    # tan(angle) = rise/run, where run = 12
    radians = math.radians(degrees)
    rise = math.tan(radians) * 12
    
    # Round to nearest whole number
    rise_rounded = round(rise)
    
    # Cap at reasonable values
    if rise_rounded > 24:
        rise_rounded = 24
    if rise_rounded < 0:
        rise_rounded = 0
        
    return f"{rise_rounded}/12"


def find_predominant_pitch(roof_segments: list) -> str:
    """
    Find the most common pitch among roof segments.
    
    Strategy: Weight by segment area to find the pitch that covers
    the most roof area.
    
    Args:
        roof_segments: List of roofSegmentStats from Solar API
        
    Returns:
        Pitch string like "6/12"
    """
    if not roof_segments:
        return "Unknown"
    
    # Group by pitch (rounded to nearest X/12)
    pitch_areas: dict[str, float] = {}
    
    for segment in roof_segments:
        pitch_degrees = segment.get("pitchDegrees", 0)
        area = segment.get("stats", {}).get("areaMeters2", 0)
        
        pitch_str = degrees_to_pitch_string(pitch_degrees)
        
        if pitch_str in pitch_areas:
            pitch_areas[pitch_str] += area
        else:
            pitch_areas[pitch_str] = area
    
    if not pitch_areas:
        return "Unknown"
    
    # Return the pitch with the largest total area
    predominant = max(pitch_areas, key=pitch_areas.get)  # type: ignore
    return predominant


def azimuth_to_direction(azimuth: float) -> str:
    """
    Convert azimuth angle to cardinal direction.
    
    0° = North, 90° = East, 180° = South, 270° = West
    """
    directions = ["N", "NE", "E", "SE", "S", "SW", "W", "NW", "N"]
    index = round(azimuth / 45) % 8
    return directions[index]


def normalize_solar_data(
    raw_data: dict,
    address: str,
) -> RoofMeasurementResponse:
    """
    Convert Google Solar API response to canonical RoofMeasurementResponse.
    
    Extracts ALL available data from Google Solar API:
    - Area (converted to sqft)
    - Pitch (predominant from roof segments)
    - Sunshine hours per year
    - Carbon offset factor
    - Imagery quality and date
    - Roof facet count and segment details
    - Solar panel potential
    """
    solar_potential = raw_data.get("solarPotential", {})
    
    # ===== CORE: Area in sqft =====
    area_meters = solar_potential.get("wholeRoofStats", {}).get("areaMeters2", 0)
    if area_meters == 0:
        area_meters = solar_potential.get("maxArrayAreaMeters2", 0)
    area_sqft = area_meters * 10.764
    
    # ===== CORE: Predominant Pitch =====
    roof_segments_raw = solar_potential.get("roofSegmentStats", [])
    predominant_pitch = find_predominant_pitch(roof_segments_raw)
    
    # ===== NEW: Imagery Quality & Date =====
    imagery_quality_raw = raw_data.get("imageryQuality", "IMAGERY_QUALITY_UNSPECIFIED")
    # Clean up the quality string
    imagery_quality = imagery_quality_raw.replace("IMAGERY_QUALITY_", "").replace("_", " ").title()
    if imagery_quality == "Unspecified":
        imagery_quality = "Unknown"
    
    imagery_date = raw_data.get("imageryDate", {})
    if imagery_date:
        year = imagery_date.get("year", "")
        month = imagery_date.get("month", "")
        day = imagery_date.get("day", "")
        if year and month:
            imagery_date_str = f"{year}-{month:02d}" if isinstance(month, int) else f"{year}-{month}"
            if day:
                imagery_date_str += f"-{day:02d}" if isinstance(day, int) else f"-{day}"
        else:
            imagery_date_str = None
    else:
        imagery_date_str = None
    
    # ===== NEW: Sunshine Hours =====
    max_sunshine_hours = solar_potential.get("maxSunshineHoursPerYear")
    
    # ===== NEW: Carbon Offset =====
    carbon_offset = solar_potential.get("carbonOffsetFactorKgPerMwh")
    
    # ===== NEW: Roof Segment Details =====
    roof_facet_count = len(roof_segments_raw)
    
    # Import here to avoid circular import
    from app.models import RoofSegmentDetail
    
    roof_segments = []
    for segment in roof_segments_raw:
        seg_area_m2 = segment.get("stats", {}).get("areaMeters2", 0)
        seg_pitch_deg = segment.get("pitchDegrees", 0)
        seg_azimuth = segment.get("azimuthDegrees", 0)
        
        roof_segments.append(RoofSegmentDetail(
            area_sqft=round(seg_area_m2 * 10.764, 2),
            pitch=degrees_to_pitch_string(seg_pitch_deg),
            azimuth_degrees=round(seg_azimuth, 1),
            azimuth_direction=azimuth_to_direction(seg_azimuth),
        ))
    
    # Sort by area (largest first)
    roof_segments.sort(key=lambda x: x.area_sqft, reverse=True)
    
    # ===== NEW: Solar Panel Potential =====
    max_panels = solar_potential.get("maxArrayPanelsCount")
    panel_capacity = solar_potential.get("panelCapacityWatts")
    if panel_capacity:
        panel_capacity = int(panel_capacity)
    
    # ===== Confidence Score =====
    confidence = 0.85 if imagery_quality == "High" else (0.7 if imagery_quality == "Medium" else 0.5)
    
    # ===== Calculate Roofing Squares =====
    squares_needed = round(area_sqft / 100, 1) if area_sqft > 0 else None
    
    return RoofMeasurementResponse(
        # Core
        status=MeasurementStatus.ESTIMATE,
        total_area_sqft=round(area_sqft, 2),
        predominant_pitch=predominant_pitch,
        source=DataSource.GOOGLE_SOLAR,
        confidence_score=confidence,
        address=address,
        order_id=None,
        message=None,
        # Extended - Sunshine & Energy
        max_sunshine_hours_per_year=round(max_sunshine_hours, 1) if max_sunshine_hours else None,
        carbon_offset_factor=round(carbon_offset, 2) if carbon_offset else None,
        # Extended - Imagery
        imagery_quality=imagery_quality if imagery_quality != "Unknown" else None,
        imagery_date=imagery_date_str,
        # Extended - Roof Complexity
        roof_facet_count=roof_facet_count if roof_facet_count > 0 else None,
        roof_segments=roof_segments if roof_segments else None,
        # Extended - Solar Potential
        max_panels=max_panels,
        panel_capacity_watts=panel_capacity,
        # Materials
        squares_needed=squares_needed,
    )


async def get_tier1_estimate(
    address: str,
    db: AsyncSession,
) -> RoofMeasurementResponse:
    """
    Get a Tier 1 (Google Solar) roof estimate for an address.
    
    This is the main entry point for Tier 1 estimates.
    Handles all error cases gracefully - never returns a 500 error.
    
    Args:
        address: Full street address
        db: Database session
        
    Returns:
        RoofMeasurementResponse with estimate or MANUAL_REVIEW status
    """
    # 0. Normalization & Hashing
    norm_address = address.lower().strip()
    addr_hash = hashlib.sha256(norm_address.encode()).hexdigest()

    try:
        # 1. CACHE CHECK (The "Money Saver")
        # Check DB for existing valid estimate (< 30 days old ideally, but permanent for MVP)
        stmt = select(RoofOrder).where(RoofOrder.normalized_address_hash == addr_hash)
        result = await db.execute(stmt)
        cached_order = result.scalar_one_or_none()

        if cached_order and cached_order.raw_google_response:
            print(f"[CACHE HIT] Returning saved estimate for {address}")
            try:
                # Parse stored JSON and re-normalize (ensures format updates are applied)
                raw_data = json.loads(cached_order.raw_google_response)
                response = normalize_solar_data(raw_data, cached_order.address)
                response.is_cached = True
                return response
            except Exception as e:
                print(f"[CACHE ERROR] Failed to parse cached data: {e}. Fetching fresh.")
                # Fall through to fresh fetch

        # Step 1: Geocode the address
        lat, lng = await geocode_address(address, db)
        
        # Step 2: Get building insights
        raw_data = await get_building_insights(lat, lng, db, address)
        
        # Step 3: Normalize to canonical format
        response = normalize_solar_data(raw_data, address)

        # 4. SAVE TO CACHE
        # Serialize raw data for future re-processing
        raw_json_str = json.dumps(raw_data)
        
        if cached_order:
            # Update existing record
            cached_order.raw_google_response = raw_json_str
            cached_order.total_area_sqft = response.total_area_sqft
            cached_order.updated_at = datetime.utcnow()
        else:
            # Create new cache record
            new_order = RoofOrder(
                address=address,
                normalized_address_hash=addr_hash,
                latitude=lat,
                longitude=lng,
                status=MeasurementStatus.ESTIMATE.value,
                source=DataSource.GOOGLE_SOLAR.value,
                total_area_sqft=response.total_area_sqft,
                predominant_pitch=response.predominant_pitch,
                confidence_score=response.confidence_score,
                raw_google_response=raw_json_str,
                created_at=datetime.utcnow(),
                updated_at=datetime.utcnow()
            )
            db.add(new_order)
        
        # Commit cache (separate from API logs)
        await db.commit()

        return response
        
    except ValueError as e:
        # Address not found or building not in database
        # Return a clean response, NOT a 500 error
        return RoofMeasurementResponse(
            status=MeasurementStatus.MANUAL_REVIEW,
            total_area_sqft=0.0,
            predominant_pitch="Unknown",
            source=DataSource.GOOGLE_SOLAR,
            confidence_score=0.0,
            address=address,
            order_id=None,
            message=f"Estimate unavailable: {str(e)}",
        )
        
    except httpx.HTTPError as e:
        # Network error - still return clean response
        return RoofMeasurementResponse(
            status=MeasurementStatus.MANUAL_REVIEW,
            total_area_sqft=0.0,
            predominant_pitch="Unknown",
            source=DataSource.GOOGLE_SOLAR,
            confidence_score=0.0,
            address=address,
            order_id=None,
            message=f"Service temporarily unavailable: {str(e)}",
        )
