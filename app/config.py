"""
Configuration module for the Roof Measurement API.

Uses pydantic-settings to load environment variables from .env file.
Includes safety controls to prevent accidental API costs.
"""

from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """
    Application settings loaded from environment variables.
    
    SAFETY CONTROLS:
    - eagleview_live_mode: Must be explicitly set to True to make real orders
    - eagleview_daily_order_limit: Maximum orders per day (prevents runaway costs)
    """
    
    # Google APIs (Tier 1)
    google_api_key: str = "not_configured"
    
    # EagleView APIs (Tier 2) - ~$30 per order!
    eagleview_client_id: str
    eagleview_client_secret: str
    eagleview_base_url: str = "https://api.eagleview.com"
    
    # SAFETY CONTROLS - CRITICAL!
    # EagleView is DISABLED by default. You must explicitly enable it.
    eagleview_live_mode: bool = False  # Set to True only when ready to pay
    eagleview_mock_mode: bool = True   # If True, returns fake data (Zero Cost)
    eagleview_daily_order_limit: int = 5  # Max orders per day
    
    # Database
    database_url: str = "sqlite+aiosqlite:///./roof_estimator.db"
    
    # Application
    debug: bool = True
    
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )


@lru_cache
def get_settings() -> Settings:
    """
    Get cached settings instance.
    
    Uses lru_cache to avoid re-reading .env file on every request.
    """
    return Settings()
