"""
Data models for the Roof Measurement API.

This module contains:
1. Pydantic models for API request/response schemas (the "Canonical Roof Model")
2. SQLAlchemy models for database persistence
3. Enums for status and source tracking

The canonical model unifies data from both Google Solar (Tier 1) and 
EagleView (Tier 2) into a single consistent schema.
"""

from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field
from sqlalchemy import Column, Integer, String, Float, DateTime, Boolean, Text
from sqlalchemy.orm import declarative_base

Base = declarative_base()


# =============================================================================
# Enums
# =============================================================================

class MeasurementStatus(str, Enum):
    """
    Status of the roof measurement.
    
    ESTIMATE: Quick estimate from Google Solar (Tier 1)
    PENDING: EagleView order placed, waiting for completion
    VERIFIED: Professional measurement from EagleView (Tier 2)
    MANUAL_REVIEW: Data unavailable, requires manual intervention
    FAILED: Order failed (EagleView error or API issue)
    """
    ESTIMATE = "ESTIMATE"
    PENDING = "PENDING"  
    VERIFIED = "VERIFIED"
    MANUAL_REVIEW = "MANUAL_REVIEW"
    FAILED = "FAILED"


class DataSource(str, Enum):
    """
    Source of the measurement data.
    
    GOOGLE_SOLAR: Free estimate from Google Solar API
    EAGLEVIEW: Professional report (~$30 per order)
    """
    GOOGLE_SOLAR = "GOOGLE_SOLAR"
    EAGLEVIEW = "EAGLEVIEW"


# =============================================================================
# Pydantic Schemas (API Layer)
# =============================================================================

class RoofSegmentDetail(BaseModel):
    """Details about a single roof segment/facet."""
    area_sqft: float = Field(description="Area of this segment in sqft")
    pitch: str = Field(description="Pitch of this segment, e.g., '6/12'")
    azimuth_degrees: float = Field(description="Compass direction (0=N, 90=E, 180=S, 270=W)")
    azimuth_direction: str = Field(description="Cardinal direction (N, NE, E, etc.)")


class RoofMeasurementResponse(BaseModel):
    """
    The Canonical Roof Model - unified response schema for both tiers.
    
    This is the single source of truth that the frontend consumes.
    Whether data comes from Google Solar (free, instant) or EagleView 
    (paid, verified), it gets normalized to this format.
    """
    # Core measurements
    status: MeasurementStatus = Field(
        description="Current measurement status"
    )
    total_area_sqft: float = Field(
        ge=0,
        description="Total roof area in square feet"
    )
    predominant_pitch: str = Field(
        description="Most common roof pitch, e.g., '6/12'"
    )
    source: DataSource = Field(
        description="Data source (GOOGLE_SOLAR or EAGLEVIEW)"
    )
    confidence_score: Optional[float] = Field(
        default=None,
        ge=0,
        le=1,
        description="Confidence in measurement accuracy (0-1)"
    )
    address: str = Field(
        description="Original address queried"
    )
    order_id: Optional[str] = Field(
        default=None,
        description="EagleView order ID (if Tier 2 was requested)"
    )
    message: Optional[str] = Field(
        default=None,
        description="Additional information or error messages"
    )
    is_cached: bool = Field(
        default=False,
        description="True if data was served from database cache"
    )
    
    # ===== NEW: Google Solar Extended Data =====
    
    # Sunshine & Energy
    max_sunshine_hours_per_year: Optional[float] = Field(
        default=None,
        description="Maximum sunshine hours per year (1 sunshine hour = 1 kWh/kW)"
    )
    carbon_offset_factor: Optional[float] = Field(
        default=None,
        description="CO2 offset in kg per MWh of solar electricity"
    )
    
    # Imagery Quality
    imagery_quality: Optional[str] = Field(
        default=None,
        description="Quality of satellite imagery: HIGH, MEDIUM, LOW"
    )
    imagery_date: Optional[str] = Field(
        default=None,
        description="Date of the satellite imagery used"
    )
    
    # Roof Complexity
    roof_facet_count: Optional[int] = Field(
        default=None,
        description="Number of distinct roof segments/facets"
    )
    roof_segments: Optional[list[RoofSegmentDetail]] = Field(
        default=None,
        description="Details of individual roof segments"
    )
    
    # Solar Panel Potential
    max_panels: Optional[int] = Field(
        default=None,
        description="Maximum number of solar panels that can fit"
    )
    panel_capacity_watts: Optional[int] = Field(
        default=None,
        description="Capacity per panel in watts"
    )
    
    # ===== NEW: EagleView Extended Data (Tier 2) =====
    
    # Line lengths (for materials estimation)
    ridge_length_ft: Optional[float] = Field(
        default=None,
        description="Total ridge length in feet"
    )
    valley_length_ft: Optional[float] = Field(
        default=None,
        description="Total valley length in feet"
    )
    eave_length_ft: Optional[float] = Field(
        default=None,
        description="Total eave/perimeter length in feet"
    )
    
    # Waste factor calculations
    squares_needed: Optional[float] = Field(
        default=None,
        description="Roofing squares needed (1 square = 100 sqft)"
    )
    
    # Structure breakdown
    structures: Optional[list[dict]] = Field(
        default=None,
        description="Breakdown by structure (main house, garage, etc.)"
    )
    
    class Config:
        json_schema_extra = {
            "example": {
                "status": "ESTIMATE",
                "total_area_sqft": 2150.5,
                "predominant_pitch": "6/12",
                "source": "GOOGLE_SOLAR",
                "confidence_score": 0.85,
                "address": "1600 Amphitheatre Parkway, Mountain View, CA",
                "order_id": None,
                "message": None,
                "max_sunshine_hours_per_year": 1450,
                "carbon_offset_factor": 428.5,
                "imagery_quality": "HIGH",
                "roof_facet_count": 12,
                "max_panels": 45
            }
        }


class OrderRequest(BaseModel):
    """Request to place a Tier 2 (EagleView) order."""
    address: str = Field(
        min_length=5,
        description="Full address for roof measurement"
    )
    report_type: str = Field(
        default="PREMIUM", # BASIC or PREMIUM
        pattern="^(BASIC|PREMIUM)$",
        description="Type of report: BASIC (~$15) or PREMIUM (~$30)"
    )


class OrderStatusResponse(BaseModel):
    """Response for order status check."""
    order_id: str
    status: MeasurementStatus
    measurement: Optional[RoofMeasurementResponse] = None
    created_at: datetime
    updated_at: datetime


class EstimateRequest(BaseModel):
    """Request for Tier 1 estimate."""
    address: str = Field(
        min_length=5,
        description="Full address for roof estimate"
    )


# =============================================================================
# SQLAlchemy Models (Database Layer)
# =============================================================================

class RoofOrder(Base):
    """
    Database model for tracking roof measurement orders.
    
    Stores both Tier 1 estimates and Tier 2 verified measurements.
    When a Tier 2 order completes, the measurement data is updated.
    """
    __tablename__ = "roof_orders"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    
    # Address and geocoding
    address = Column(String(500), nullable=False, index=True)
    normalized_address_hash = Column(String(64), nullable=True, index=True)  # For caching
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    
    # Order tracking
    status = Column(String(50), default=MeasurementStatus.ESTIMATE.value)
    source = Column(String(50), default=DataSource.GOOGLE_SOLAR.value)
    eagleview_order_id = Column(String(100), nullable=True, unique=True)
    report_type = Column(String(20), default="PREMIUM") # BASIC or PREMIUM
    last_checked_at = Column(DateTime, nullable=True)   # For global poller
    
    # Measurement data
    total_area_sqft = Column(Float, default=0.0)
    predominant_pitch = Column(String(20), default="Unknown")
    confidence_score = Column(Float, nullable=True)
    
    # Metadata
    message = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # JSON storage for raw API responses (for debugging)
    raw_google_response = Column(Text, nullable=True)
    raw_eagleview_response = Column(Text, nullable=True) # Legacy field
    raw_eagleview_json = Column(Text, nullable=True)     # For full report data


class APIUsageLog(Base):
    """
    Tracks all external API calls for cost monitoring.
    
    This is critical for cost awareness - every Google/EagleView call
    is logged with its estimated cost.
    
    Estimated costs:
    - Google Solar API: ~$0.01 per call
    - Google Geocoding: ~$0.005 per call  
    - EagleView Order: ~$30.00 per order
    """
    __tablename__ = "api_usage_logs"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    provider = Column(String(50), nullable=False, index=True)  # GOOGLE, EAGLEVIEW
    endpoint = Column(String(200), nullable=False)
    method = Column(String(10), default="GET")
    
    # Cost tracking
    estimated_cost_usd = Column(Float, default=0.0)
    
    # Request details
    request_address = Column(String(500), nullable=True)
    response_status = Column(Integer, nullable=True)
    success = Column(Boolean, default=True)
    error_message = Column(Text, nullable=True)
    
    # Timing
    timestamp = Column(DateTime, default=datetime.utcnow, index=True)
    response_time_ms = Column(Integer, nullable=True)


class DailyOrderCount(Base):
    """
    Tracks daily EagleView order counts for safety limits.
    
    This prevents runaway costs by limiting orders per day.
    """
    __tablename__ = "daily_order_counts"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    date = Column(String(10), unique=True, nullable=False)  # YYYY-MM-DD
    eagleview_orders = Column(Integer, default=0)
    total_cost_usd = Column(Float, default=0.0)
