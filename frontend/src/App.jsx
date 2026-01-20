import { useState, useEffect, useCallback } from 'react';
import './App.css';
import { getEstimate, createOrder, getOrderStatus, getCostSummary, getHealth, ApiError } from './services/api';

// Icons as inline SVGs for simplicity
const Icons = {
  Search: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.35-4.35" />
    </svg>
  ),
  Home: () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9,22 9,12 15,12 15,22" />
    </svg>
  ),
  Lightning: () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polygon points="13,2 3,14 12,14 11,22 21,10 12,10" />
    </svg>
  ),
  Shield: () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <polyline points="9,12 11,14 15,10" />
    </svg>
  ),
  Clock: () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12,6 12,12 16,14" />
    </svg>
  ),
  Check: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
      <polyline points="20,6 9,17 4,12" />
    </svg>
  ),
  AlertTriangle: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  ),
  Upgrade: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 19V5M5 12l7-7 7 7" />
    </svg>
  ),
  Dollar: () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="12" y1="1" x2="12" y2="23" />
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  ),
};

// Navbar Component
function Navbar({ currentView, setView }) {
  return (
    <nav className="navbar">
      <div className="navbar-logo">
        <Icons.Home />
        <span>RoofPro</span>
      </div>
      <div className="navbar-links">
        <a
          href="#"
          className={currentView === 'home' ? 'active' : ''}
          onClick={(e) => { e.preventDefault(); setView('home'); }}
        >
          Estimate
        </a>
        <a
          href="#"
          className={currentView === 'costs' ? 'active' : ''}
          onClick={(e) => { e.preventDefault(); setView('costs'); }}
        >
          Costs
        </a>
      </div>
    </nav>
  );
}

// Step Indicator Component
function StepIndicator({ currentStep, tier2Status }) {
  const getStepClass = (step) => {
    if (step < currentStep) return 'complete';
    if (step === currentStep) return 'active';
    return '';
  };

  const getConnectorClass = () => {
    if (currentStep > 1) return 'complete';
    if (tier2Status === 'PENDING') return 'active';
    return '';
  };

  return (
    <div className="step-indicator">
      <div className={`step ${getStepClass(1)}`}>
        <span className="step-number">
          {currentStep > 1 ? <Icons.Check /> : '1'}
        </span>
        <span>Tier 1 • Instant</span>
      </div>

      <div className={`step-connector ${getConnectorClass()}`} />

      <div className={`step ${getStepClass(2)}`}>
        <span className="step-number">
          {currentStep > 2 ? <Icons.Check /> : '2'}
        </span>
        <span>Tier 2 • Verified</span>
      </div>
    </div>
  );
}

// Status Badge Component
function StatusBadge({ status }) {
  const statusMap = {
    'ESTIMATE': { label: 'Estimate', class: 'estimate' },
    'PENDING': { label: 'Processing', class: 'pending' },
    'VERIFIED': { label: 'Verified', class: 'verified' },
    'MANUAL_REVIEW': { label: 'Manual Review', class: 'manual-review' },
    'FAILED': { label: 'Failed', class: 'failed' },
  };

  const info = statusMap[status] || { label: status, class: 'estimate' };

  return (
    <span className={`status-badge ${info.class}`}>
      {info.class === 'verified' && <Icons.Check />}
      {info.label}
    </span>
  );
}

// Pitch Visualizer Component
function PitchVisualizer({ pitch }) {
  // Parse pitch like "6/12" to get the rise
  const rise = parseInt(pitch?.split('/')[0]) || 6;
  const angle = Math.atan(rise / 12) * (180 / Math.PI);

  return (
    <div className="pitch-visualizer">
      <div className="roof-icon">
        <svg viewBox="0 0 100 60" fill="none">
          <defs>
            <linearGradient id="roofGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#667eea" />
              <stop offset="100%" stopColor="#764ba2" />
            </linearGradient>
          </defs>
          {/* Roof shape */}
          <polygon
            points={`50,${10 - rise} 95,35 95,55 5,55 5,35`}
            fill="url(#roofGrad)"
            stroke="#4c1d95"
            strokeWidth="2"
          />
          {/* Roof peak */}
          <polygon
            points={`50,${10 - rise} 5,35 95,35`}
            fill="#8b5cf6"
            stroke="#4c1d95"
            strokeWidth="2"
          />
          {/* Door */}
          <rect x="40" y="40" width="20" height="15" fill="#1e1b4b" rx="2" />
        </svg>
      </div>
      <div style={{ marginLeft: 'var(--space-4)', textAlign: 'left' }}>
        <div style={{ fontSize: 'var(--font-size-2xl)', fontWeight: '700', color: 'var(--color-gray-900)' }}>
          {pitch || 'Unknown'}
        </div>
        <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-gray-500)' }}>
          Roof Pitch ({Math.round(angle)}°)
        </div>
      </div>
    </div>
  );
}

// Result Card Component
function ResultCard({ data, onUpgrade, isUpgrading, tier2Disabled }) {
  const isVerified = data.status === 'VERIFIED';
  const isPending = data.status === 'PENDING';
  const showUpgrade = data.status === 'ESTIMATE' && !isPending;
  const hasValidData = data.total_area_sqft > 0;

  return (
    <div className={`result-card ${isVerified ? 'tier-2' : 'tier-1'}`}>
      <div className="result-header">
        <div>
          <div className="result-title">
            {isVerified ? '✅ Verified Report' : '⚡ Instant Estimate'}
          </div>
          <div className="result-address">{data.address}</div>
        </div>
        <StatusBadge status={data.status} />
      </div>

      {/* Error/Warning Message */}
      {data.message && (
        <div className="error-message" style={{ marginBottom: 'var(--space-4)' }}>
          <Icons.AlertTriangle />
          <span>{data.message}</span>
        </div>
      )}

      {hasValidData && (
        <>
          <PitchVisualizer pitch={data.predominant_pitch} />

          {/* Primary Metrics */}
          <div className="metrics-grid">
            <div className="metric highlight">
              <div className="metric-value">
                {data.total_area_sqft?.toLocaleString() || '—'}
              </div>
              <div className="metric-label">Square Feet</div>
            </div>
            <div className="metric">
              <div className="metric-value">{data.predominant_pitch || '—'}</div>
              <div className="metric-label">Pitch</div>
            </div>
            {data.squares_needed && (
              <div className="metric">
                <div className="metric-value">{data.squares_needed}</div>
                <div className="metric-label">Squares</div>
              </div>
            )}
            <div className="metric">
              <div className="metric-value">
                {data.source === 'EAGLEVIEW' ? 'EagleView' : 'Google'}
              </div>
              <div className="metric-label">Data Source</div>
            </div>
          </div>

          {/* Extended Data Section */}
          {(data.max_sunshine_hours_per_year || data.roof_facet_count || data.max_panels) && (
            <div style={{
              marginTop: 'var(--space-4)',
              padding: 'var(--space-4)',
              background: 'var(--color-gray-50)',
              borderRadius: 'var(--radius-lg)'
            }}>
              <h5 style={{
                fontSize: 'var(--font-size-sm)',
                color: 'var(--color-gray-500)',
                marginBottom: 'var(--space-3)',
                textTransform: 'uppercase',
                letterSpacing: '0.05em'
              }}>
                📊 Extended Insights
              </h5>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 'var(--space-3)' }}>
                {data.max_sunshine_hours_per_year && (
                  <div style={{ padding: 'var(--space-3)', background: 'white', borderRadius: 'var(--radius-md)', textAlign: 'center' }}>
                    <div style={{ fontSize: 'var(--font-size-xl)', fontWeight: '700', color: '#f59e0b' }}>
                      ☀️ {Math.round(data.max_sunshine_hours_per_year).toLocaleString()}
                    </div>
                    <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-gray-500)' }}>
                      Sun Hours/Year
                    </div>
                  </div>
                )}

                {data.carbon_offset_factor && (
                  <div style={{ padding: 'var(--space-3)', background: 'white', borderRadius: 'var(--radius-md)', textAlign: 'center' }}>
                    <div style={{ fontSize: 'var(--font-size-xl)', fontWeight: '700', color: '#10b981' }}>
                      🌱 {Math.round(data.carbon_offset_factor)}
                    </div>
                    <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-gray-500)' }}>
                      kg CO₂/MWh
                    </div>
                  </div>
                )}

                {data.roof_facet_count && (
                  <div style={{ padding: 'var(--space-3)', background: 'white', borderRadius: 'var(--radius-md)', textAlign: 'center' }}>
                    <div style={{ fontSize: 'var(--font-size-xl)', fontWeight: '700', color: 'var(--color-primary-600)' }}>
                      🏠 {data.roof_facet_count}
                    </div>
                    <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-gray-500)' }}>
                      Roof Facets
                    </div>
                  </div>
                )}

                {data.max_panels && (
                  <div style={{ padding: 'var(--space-3)', background: 'white', borderRadius: 'var(--radius-md)', textAlign: 'center' }}>
                    <div style={{ fontSize: 'var(--font-size-xl)', fontWeight: '700', color: '#3b82f6' }}>
                      ⚡ {data.max_panels}
                    </div>
                    <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-gray-500)' }}>
                      Max Panels
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Roof Segments Detail */}
          {data.roof_segments && data.roof_segments.length > 0 && (
            <div style={{
              marginTop: 'var(--space-4)',
              padding: 'var(--space-4)',
              background: 'var(--color-gray-50)',
              borderRadius: 'var(--radius-lg)'
            }}>
              <h5 style={{
                fontSize: 'var(--font-size-sm)',
                color: 'var(--color-gray-500)',
                marginBottom: 'var(--space-3)',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <span>🔍 Roof Segments ({data.roof_segments.length})</span>
                <span style={{ fontWeight: 'normal', textTransform: 'none' }}>
                  Sorted by area
                </span>
              </h5>

              <div style={{ overflowX: 'auto' }}>
                <table style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  fontSize: 'var(--font-size-sm)',
                  background: 'white',
                  borderRadius: 'var(--radius-md)',
                  overflow: 'hidden'
                }}>
                  <thead>
                    <tr style={{ background: 'var(--color-primary-50)' }}>
                      <th style={{ padding: 'var(--space-2) var(--space-3)', textAlign: 'left', fontWeight: '600' }}>#</th>
                      <th style={{ padding: 'var(--space-2) var(--space-3)', textAlign: 'right', fontWeight: '600' }}>Area (sqft)</th>
                      <th style={{ padding: 'var(--space-2) var(--space-3)', textAlign: 'center', fontWeight: '600' }}>Pitch</th>
                      <th style={{ padding: 'var(--space-2) var(--space-3)', textAlign: 'center', fontWeight: '600' }}>Direction</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.roof_segments.slice(0, 6).map((seg, idx) => (
                      <tr key={idx} style={{ borderTop: '1px solid var(--color-gray-100)' }}>
                        <td style={{ padding: 'var(--space-2) var(--space-3)', color: 'var(--color-gray-400)' }}>{idx + 1}</td>
                        <td style={{ padding: 'var(--space-2) var(--space-3)', textAlign: 'right', fontWeight: '500' }}>{seg.area_sqft.toLocaleString()}</td>
                        <td style={{ padding: 'var(--space-2) var(--space-3)', textAlign: 'center' }}>{seg.pitch}</td>
                        <td style={{ padding: 'var(--space-2) var(--space-3)', textAlign: 'center' }}>
                          <span style={{
                            display: 'inline-block',
                            padding: '2px 8px',
                            background: 'var(--color-primary-100)',
                            borderRadius: 'var(--radius-sm)',
                            fontSize: 'var(--font-size-xs)',
                            fontWeight: '600',
                            color: 'var(--color-primary-700)'
                          }}>
                            {seg.azimuth_direction}
                          </span>
                        </td>
                      </tr>
                    ))}
                    {data.roof_segments.length > 6 && (
                      <tr style={{ borderTop: '1px solid var(--color-gray-100)' }}>
                        <td colSpan={4} style={{ padding: 'var(--space-2) var(--space-3)', textAlign: 'center', color: 'var(--color-gray-400)' }}>
                          + {data.roof_segments.length - 6} more segments
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Imagery Info */}
          {(data.imagery_quality || data.imagery_date) && (
            <div style={{
              marginTop: 'var(--space-3)',
              display: 'flex',
              gap: 'var(--space-4)',
              fontSize: 'var(--font-size-sm)',
              color: 'var(--color-gray-500)'
            }}>
              {data.imagery_quality && (
                <span>📷 Quality: <strong style={{ color: data.imagery_quality === 'High' ? 'var(--color-success)' : 'var(--color-gray-600)' }}>{data.imagery_quality}</strong></span>
              )}
              {data.imagery_date && (
                <span>📅 Imagery: {data.imagery_date}</span>
              )}
            </div>
          )}

          {/* Confidence Bar */}
          {data.confidence_score !== null && (
            <div className="confidence-bar">
              <div className="confidence-label">
                <span>Confidence</span>
                <span>{Math.round(data.confidence_score * 100)}%</span>
              </div>
              <div className="confidence-track">
                <div
                  className="confidence-fill"
                  style={{ width: `${data.confidence_score * 100}%` }}
                />
              </div>
            </div>
          )}
        </>
      )}

      {/* Upgrade Section */}
      {showUpgrade && hasValidData && (
        <div className="upgrade-section">
          <div className="upgrade-content">
            <div className="upgrade-info">
              <h4>🎯 Get Verified Measurements</h4>
              <p>Professional report with ridge/valley lengths, 98% accuracy</p>
            </div>
            <div>
              <button
                className="upgrade-button"
                onClick={onUpgrade}
                disabled={isUpgrading || tier2Disabled}
              >
                {isUpgrading ? (
                  <>
                    <span className="loading-spinner" style={{ width: 16, height: 16 }} />
                    Processing...
                  </>
                ) : (
                  <>
                    <Icons.Upgrade />
                    Upgrade to Tier 2
                  </>
                )}
              </button>
              <div className="cost-warning">
                <Icons.AlertTriangle />
                <span>
                  {tier2Disabled
                    ? 'EagleView is disabled in settings'
                    : 'This costs approximately $30'
                  }
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Pending Status */}
      {isPending && (
        <div className="upgrade-section" style={{ borderColor: 'var(--color-warning)' }}>
          <div className="upgrade-content" style={{ justifyContent: 'center' }}>
            <div style={{ textAlign: 'center' }}>
              <div className="loading-spinner" style={{ margin: '0 auto var(--space-3)' }} />
              <h4>Processing Verified Report</h4>
              <p style={{ color: 'var(--color-gray-500)' }}>
                EagleView is generating your professional report. This may take a few minutes.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Features Section
function FeaturesSection() {
  const features = [
    {
      icon: <Icons.Lightning />,
      title: 'Instant Estimates',
      description: 'Get roof measurements in seconds using satellite imagery and AI.',
    },
    {
      icon: <Icons.Shield />,
      title: 'Verified Reports',
      description: 'Professional-grade measurements used by insurance companies.',
    },
    {
      icon: <Icons.Clock />,
      title: 'Save Time',
      description: 'No need for on-site visits. Get accurate data from your desk.',
    },
  ];

  return (
    <div className="features-grid">
      {features.map((feature, index) => (
        <div key={index} className="feature-card">
          <div className="feature-icon">{feature.icon}</div>
          <h3>{feature.title}</h3>
          <p>{feature.description}</p>
        </div>
      ))}
    </div>
  );
}

// Cost Dashboard Component
function CostDashboard() {
  const [costs, setCosts] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function loadCosts() {
      try {
        const data = await getCostSummary();
        setCosts(data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    loadCosts();
  }, []);

  if (loading) {
    return (
      <div className="cost-dashboard" style={{ textAlign: 'center' }}>
        <div className="loading-spinner" style={{ margin: '0 auto' }} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="cost-dashboard">
        <div className="error-message">
          <Icons.AlertTriangle />
          <span>{error}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="cost-dashboard">
      <div className="cost-header">
        <div>
          <h3 style={{ marginBottom: 'var(--space-1)' }}>API Usage & Costs</h3>
          <p style={{ color: 'var(--color-gray-500)', margin: 0, fontSize: 'var(--font-size-sm)' }}>
            Track your spending
          </p>
        </div>
        <div className="cost-total">${costs?.total_estimated_cost_usd?.toFixed(2) || '0.00'}</div>
      </div>

      <div className="cost-breakdown">
        <div className="cost-item">
          <div className="cost-item-value">{costs?.total_google_calls || 0}</div>
          <div className="cost-item-label">Google API Calls</div>
        </div>
        <div className="cost-item">
          <div className="cost-item-value">${costs?.estimated_google_cost_usd?.toFixed(2) || '0.00'}</div>
          <div className="cost-item-label">Google Cost</div>
        </div>
        <div className="cost-item">
          <div className="cost-item-value">{costs?.total_eagleview_orders || 0}</div>
          <div className="cost-item-label">EagleView Orders</div>
        </div>
        <div className="cost-item">
          <div className="cost-item-value">${costs?.estimated_eagleview_cost_usd?.toFixed(2) || '0.00'}</div>
          <div className="cost-item-label">EagleView Cost</div>
        </div>
      </div>

      <div style={{
        marginTop: 'var(--space-6)',
        padding: 'var(--space-4)',
        background: 'var(--color-gray-50)',
        borderRadius: 'var(--radius-lg)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <span style={{ color: 'var(--color-gray-600)' }}>
          Today's EagleView Orders
        </span>
        <span style={{ fontWeight: '600' }}>
          {costs?.today_eagleview_orders || 0} / {costs?.today_eagleview_limit || 5}
        </span>
      </div>
    </div>
  );
}

// Main App Component
function App() {
  const [view, setView] = useState('home');
  const [address, setAddress] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [step, setStep] = useState(0);
  const [isUpgrading, setIsUpgrading] = useState(false);
  const [health, setHealth] = useState(null);
  const [pollInterval, setPollInterval] = useState(null);

  // Load health on mount
  useEffect(() => {
    getHealth().then(setHealth).catch(console.error);
  }, []);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [pollInterval]);

  // Handle Tier 1 estimate
  const handleEstimate = async (e) => {
    e.preventDefault();
    if (!address.trim()) return;

    setLoading(true);
    setError(null);
    setResult(null);
    setStep(1);

    try {
      const data = await getEstimate(address);
      setResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Handle Tier 2 upgrade
  const handleUpgrade = async () => {
    if (!result) return;

    setIsUpgrading(true);
    setError(null);

    try {
      const orderResponse = await createOrder(result.address);
      setResult({
        ...orderResponse.measurement,
        order_id: orderResponse.order_id,
      });
      setStep(2);

      // Start polling for order completion
      const interval = setInterval(async () => {
        try {
          const status = await getOrderStatus(orderResponse.order_id);
          if (status.status !== 'PENDING') {
            clearInterval(interval);
            setPollInterval(null);
            setResult(status.measurement);
          }
        } catch (err) {
          console.error('Polling error:', err);
        }
      }, 10000);

      setPollInterval(interval);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsUpgrading(false);
    }
  };

  // Reset to start new estimate
  const handleReset = () => {
    setAddress('');
    setResult(null);
    setStep(0);
    setError(null);
    if (pollInterval) {
      clearInterval(pollInterval);
      setPollInterval(null);
    }
  };

  return (
    <div className="hero">
      <Navbar currentView={view} setView={setView} />

      {view === 'home' ? (
        <div className="hero-content">
          {!result ? (
            <>
              <h1>Professional Roof Measurements</h1>
              <p className="subtitle">
                Get instant estimates powered by satellite imagery, or upgrade to
                verified reports used by insurance professionals.
              </p>

              <form onSubmit={handleEstimate} className="address-input-container">
                <input
                  type="text"
                  className="address-input"
                  placeholder="Enter property address..."
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  disabled={loading}
                />
                <button
                  type="submit"
                  className="search-button"
                  disabled={loading || !address.trim()}
                >
                  {loading ? (
                    <span className="loading-spinner" style={{ width: 20, height: 20 }} />
                  ) : (
                    <>
                      <Icons.Search />
                      <span>Get Estimate</span>
                    </>
                  )}
                </button>
              </form>

              {error && (
                <div className="error-message" style={{ marginTop: 'var(--space-6)', maxWidth: 600 }}>
                  <Icons.AlertTriangle />
                  <span>{error}</span>
                </div>
              )}

              <FeaturesSection />
            </>
          ) : (
            <>
              <StepIndicator
                currentStep={result.status === 'VERIFIED' ? 3 : step}
                tier2Status={result.status}
              />

              <ResultCard
                data={result}
                onUpgrade={handleUpgrade}
                isUpgrading={isUpgrading}
                tier2Disabled={!health?.eagleview_enabled}
              />

              {error && (
                <div className="error-message" style={{ marginTop: 'var(--space-4)', maxWidth: 600 }}>
                  <Icons.AlertTriangle />
                  <span>{error}</span>
                </div>
              )}

              <button
                onClick={handleReset}
                style={{
                  marginTop: 'var(--space-6)',
                  padding: 'var(--space-3) var(--space-6)',
                  background: 'rgba(255,255,255,0.1)',
                  color: 'white',
                  borderRadius: 'var(--radius-lg)',
                  border: '1px solid rgba(255,255,255,0.2)',
                  cursor: 'pointer',
                }}
              >
                ← New Estimate
              </button>
            </>
          )}
        </div>
      ) : (
        <div style={{ paddingTop: '80px', minHeight: '100vh' }}>
          <CostDashboard />
        </div>
      )}

      <footer className="footer">
        <p>
          RoofPro MVP • Powered by Google Solar API & EagleView
          {health && (
            <span style={{ marginLeft: 'var(--space-4)' }}>
              • EagleView: {health.eagleview_enabled ? '🟢 Enabled' : '🔴 Disabled'}
            </span>
          )}
        </p>
      </footer>
    </div>
  );
}

export default App;
