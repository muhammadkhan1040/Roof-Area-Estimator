# 🏠 Two-Tier Roof Measurement API

A production-ready FastAPI backend that provides instant roof estimates via **Google Solar API** (Tier 1) and verified professional reports via **EagleView API** (Tier 2).

## 🚀 Quick Start

```bash
# 1. Install dependencies
cd b:\freelance\out\roof-estimator
pip install -r requirements.txt

# 2. Configure environment (see below)
# Edit .env with your API keys

# 3. Start the server
uvicorn app.main:app --reload

# 4. Open API docs
# http://localhost:8000/docs
```

## ⚠️ CRITICAL: Cost Safety

**EagleView orders cost ~$30 each!** This system includes multiple safety controls:

| Control | Default | Description |
|---------|---------|-------------|
| `EAGLEVIEW_LIVE_MODE` | `false` | Must be set to `true` to place real orders |
| `EAGLEVIEW_DAILY_ORDER_LIMIT` | `5` | Maximum orders per day |
| API Usage Logging | Enabled | All API calls logged with costs |

### Before Testing Tier 2

1. Confirm you have sandbox/test credentials from EagleView
2. Keep `EAGLEVIEW_LIVE_MODE=false` until ready to pay
3. Monitor costs at `GET /costs/summary`

## 🔧 Environment Configuration

Create a `.env` file (copy from `.env.example`):

```env
# Google APIs (Tier 1)
# Get from: https://console.cloud.google.com/apis/credentials
# Enable: Solar API, Geocoding API
GOOGLE_API_KEY=AIza...your_key_here

# EagleView (Tier 2) - Already configured with provided credentials
EAGLEVIEW_CLIENT_ID=0oa193d08zzN5U9Kn2p8
EAGLEVIEW_CLIENT_SECRET=dp7rTZQnmd4m-Ns_le3MYp3gCJn0zd-VKH1Nwe0loQvi-pl8Kd5f4vzcWdc_ZSOE

# SAFETY - Keep false until ready to pay!
EAGLEVIEW_LIVE_MODE=false
EAGLEVIEW_DAILY_ORDER_LIMIT=5
```

## 📡 API Endpoints

### Tier 1: Instant Estimate (~$0.015, instant)

```bash
GET /estimate?address=1600+Amphitheatre+Parkway,+Mountain+View,+CA
```

Response:
```json
{
  "status": "ESTIMATE",
  "total_area_sqft": 2150.5,
  "predominant_pitch": "6/12",
  "source": "GOOGLE_SOLAR",
  "confidence_score": 0.8,
  "address": "1600 Amphitheatre Parkway, Mountain View, CA"
}
```

### Tier 2: Verified Order (~$30, async)

```bash
POST /order
Content-Type: application/json

{"address": "123 Main St, Denver, CO"}
```

Response:
```json
{
  "order_id": "EV-123456",
  "status": "PENDING",
  "measurement": {...},
  "created_at": "2026-01-19T18:00:00Z"
}
```

### Check Order Status

```bash
GET /order/EV-123456
```

### Cost Monitoring

```bash
GET /costs/summary
```

## 🏗️ Architecture

```
┌─────────────────┐      ┌─────────────────┐
│   Frontend      │      │   Database      │
│   (Consumer)    │      │   (SQLite)      │
└────────┬────────┘      └────────┬────────┘
         │                        │
         ▼                        ▼
┌─────────────────────────────────────────────┐
│              FastAPI Backend                │
├─────────────────────────────────────────────┤
│  GET /estimate     POST /order              │
│       │                 │                   │
│       ▼                 ▼                   │
│  ┌─────────┐      ┌──────────────┐         │
│  │ Tier 1  │      │   Tier 2     │         │
│  │ Google  │      │  EagleView   │         │
│  │ Solar   │      │  (+ polling) │         │
│  └────┬────┘      └──────┬───────┘         │
│       │                  │                  │
│       ▼                  ▼                  │
│  ┌─────────────────────────────┐           │
│  │  Canonical RoofMeasurement  │           │
│  │       Response Schema       │           │
│  └─────────────────────────────┘           │
└─────────────────────────────────────────────┘
```

## 📁 Project Structure

```
roof-estimator/
├── app/
│   ├── __init__.py
│   ├── main.py           # FastAPI app & endpoints
│   ├── config.py         # Environment settings
│   ├── database.py       # SQLAlchemy setup
│   ├── models.py         # Pydantic & DB models
│   └── services/
│       ├── google_solar.py   # Tier 1 integration
│       └── eagleview.py      # Tier 2 integration
├── .env                  # Your secrets (git-ignored)
├── .env.example          # Template
├── requirements.txt
└── README.md
```

## 🔒 Security Notes

- API keys loaded from environment variables (never hardcoded)
- `.env` file is git-ignored
- EagleView credentials use OAuth2 client_credentials flow
- All API calls logged for audit trail

## 📊 Database

SQLite database (`roof_estimator.db`) stores:
- **roof_orders**: Order tracking and measurement data
- **api_usage_logs**: All external API calls with costs
- **daily_order_counts**: Safety limit tracking

## 🧪 Testing

```bash
# Health check
curl http://localhost:8000/health

# Tier 1 estimate (safe, low cost)
curl "http://localhost:8000/estimate?address=1600+Amphitheatre+Parkway,+Mountain+View,+CA"

# Check costs
curl http://localhost:8000/costs/summary
```

## ⚡ Next Steps for Production

1. Replace SQLite with PostgreSQL
2. Add Redis for token caching
3. Use Celery for background tasks
4. Add authentication (API keys, JWT)
5. Configure proper CORS origins
6. Add rate limiting
