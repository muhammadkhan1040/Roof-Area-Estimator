import React, { useState, useEffect, useCallback } from 'react';
import Tier2Setup from './components/Tier2Setup';

// ... (existing imports)



// Home View
import './App.css';
import { getEstimate, createOrder, getOrderStatus, getCostSummary, getHealth, ApiError } from './services/api';
import { Icons } from './components/Icons';
import ResultCard from './components/ResultCard';
import OrdersPage from './pages/Orders';

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
          className={currentView === 'orders' ? 'active' : ''}
          onClick={(e) => { e.preventDefault(); setView('orders'); }}
        >
          Orders
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

  // Handle clicking "Upgrade" on ResultCard
  const handleUpgradeClick = () => {
    setView('tier2_setup'); // Switch to setup page instead of calling API immediately
  };

  // Handle confirming the order on Tier2Setup page
  const handleConfirmOrder = async (reportType) => {
    if (!result) return;
    setIsUpgrading(true);

    try {
      const orderResponse = await createOrder(result.address, reportType);

      // Update result with new order info
      setResult({
        ...orderResponse.measurement,
        order_id: orderResponse.order_id,
      });
      setStep(2);

      // Start polling logic (2s interval for fast feedback)
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
      }, 2000);

      setPollInterval(interval);

      setView('home'); // Go back to home to show the "Pending" card
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

  const renderContent = () => {
    if (view === 'costs') {
      return (
        <div style={{ paddingTop: '80px', minHeight: '100vh' }}>
          <CostDashboard />
        </div>
      );
    }

    if (view === 'orders') {
      return (
        <div style={{ paddingTop: '80px', minHeight: '100vh', paddingBottom: '40px' }}>
          <OrdersPage />
        </div>
      );
    }

    if (view === 'tier2_setup') {
      return (
        <div style={{ paddingTop: '80px', minHeight: '100vh' }}>
          <Tier2Setup
            address={result?.address}
            area={result?.total_area_sqft}
            onBack={() => setView('home')}
            onConfirm={handleConfirmOrder}
            isSubmitting={isUpgrading}
          />
        </div>
      );
    }

    // Home View
    return (
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
              onUpgrade={handleUpgradeClick}
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
    );
  };

  return (
    <div className="hero">
      <Navbar currentView={view} setView={setView} />

      {renderContent()}

      <footer className="footer">
        <p>
          RoofPro MVP • Powered by Google Solar API & EagleView
          {health && (
            <span style={{ marginLeft: 'var(--space-4)', fontSize: '12px' }}>
              • {health.eagleview_mock_mode ? '🧪 MOCK MODE' : '🚀 LIVE MODE'}
              <span style={{ opacity: 0.5, margin: '0 8px' }}>|</span>
              EagleView: {health.eagleview_enabled ? '🟢' : '🔴'}
            </span>
          )}
        </p>
      </footer>
    </div>
  );
}

export default App;
