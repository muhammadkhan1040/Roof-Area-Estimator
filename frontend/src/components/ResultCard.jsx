import React, { useState } from 'react';
import { Icons } from './Icons';
import { StatusBadge } from './StatusBadge';

// Pitch Visualizer Component (Internal Helper)
function PitchVisualizer({ pitch }) {
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
                    <polygon
                        points={`50,${10 - rise} 95,35 95,55 5,55 5,35`}
                        fill="url(#roofGrad)"
                        stroke="#4c1d95"
                        strokeWidth="2"
                    />
                    <polygon
                        points={`50,${10 - rise} 5,35 95,35`}
                        fill="#8b5cf6"
                        stroke="#4c1d95"
                        strokeWidth="2"
                    />
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

// Upgrade Selection Modal
function UpgradeModal({ onClose, onConfirm, isProcessing }) {
    return (
        <div className="modal-overlay">
            <div className="modal-content" style={{ maxWidth: '500px' }}>
                <div className="modal-header">
                    <h3>Select Report Type</h3>
                    <button className="close-button" onClick={onClose} disabled={isProcessing}>
                        <Icons.Menu />
                    </button>
                </div>

                <div style={{ display: 'grid', gap: '16px', padding: '20px 0' }}>
                    {/* Basic Option */}
                    <div className="upgrade-option" onClick={() => onConfirm('BASIC')}
                        style={{ border: '1px solid #e5e7eb', borderRadius: '8px', padding: '16px', cursor: 'pointer', transition: 'all 0.2s', hover: { borderColor: '#3b82f6' } }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                            <strong style={{ fontSize: '1.1em' }}>Basic Report</strong>
                            <span style={{ background: '#e0f2fe', color: '#0369a1', padding: '2px 8px', borderRadius: '12px', fontSize: '0.8em' }}>~$15</span>
                        </div>
                        <p style={{ margin: 0, fontSize: '0.9em', color: '#6b7280' }}>
                            Essential measurements for simple estimates.
                        </p>
                    </div>

                    {/* Premium Option */}
                    <div className="upgrade-option" onClick={() => onConfirm('PREMIUM')}
                        style={{ border: '2px solid #8b5cf6', background: '#f5f3ff', borderRadius: '8px', padding: '16px', cursor: 'pointer', position: 'relative' }}>
                        <div style={{ position: 'absolute', top: '-10px', right: '10px', background: '#8b5cf6', color: 'white', fontSize: '0.7em', padding: '2px 8px', borderRadius: '10px' }}>
                            RECOMMENDED
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                            <strong style={{ fontSize: '1.1em', color: '#4c1d95' }}>Premium Report</strong>
                            <span style={{ background: '#8b5cf6', color: 'white', padding: '2px 8px', borderRadius: '12px', fontSize: '0.8em' }}>~$30</span>
                        </div>
                        <p style={{ margin: 0, fontSize: '0.9em', color: '#5b21b6' }}>
                            Full structural detail, precise waste calculation, and verified accuracy for insurance.
                        </p>
                    </div>
                </div>

                {isProcessing && (
                    <div style={{ textAlign: 'center', color: '#6b7280', fontSize: '0.9em' }}>
                        Processing order...
                    </div>
                )}
            </div>
        </div>
    );
}


export default function ResultCard({ data, onUpgrade, isUpgrading, tier2Disabled }) {
    const [showModal, setShowModal] = useState(false);
    const isVerified = data.status === 'VERIFIED';
    const isPending = data.status === 'PENDING';
    const showUpgrade = data.status === 'ESTIMATE' && !isPending;
    const hasValidData = data.total_area_sqft > 0;

    const handleUpgradeClick = () => {
        setShowModal(true);
    };

    const handleConfirm = (type) => {
        onUpgrade(type);
        setShowModal(false);
    };

    return (
        <div className={`result-card ${isVerified ? 'tier-2' : ''}`}>
            <div className="result-card-grid">

                {/* === LEFT COLUMN: Visuals & Core Metrics === */}
                <div className="result-left-col">
                    {/* Header (Title + Address) */}
                    <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--space-2)' }}>
                            <StatusBadge status={data.status} />
                            <div style={{ textAlign: 'right' }}>
                                <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-gray-400)' }}>
                                    {data.source === 'EAGLEVIEW' ? 'Source: EagleView' : 'Source: Google Solar'}
                                </div>
                                {data.is_cached && (
                                    <div style={{ fontSize: '10px', color: '#059669', fontWeight: 'bold', marginTop: '2px' }}>
                                        ⚡ FROM CACHE
                                    </div>
                                )}
                            </div>
                        </div>
                        <div className="result-address">{data.address}</div>
                    </div>

                    {hasValidData && (
                        <>
                            {/* Pitch Visual */}
                            <div style={{ padding: 'var(--space-4)', background: 'var(--color-gray-50)', borderRadius: 'var(--radius-lg)' }}>
                                <PitchVisualizer pitch={data.predominant_pitch} />
                            </div>

                            {/* Core Metrics Grid */}
                            <div className="primary-metrics">
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
                            </div>

                            {/* Confidence & Quality */}
                            <div className="confidence-minimal">
                                <div className="confidence-dot" style={{
                                    background: data.confidence_score > 0.7 ? 'var(--color-success)' : 'var(--color-warning)'
                                }} />
                                <div style={{ flex: 1 }}>
                                    <strong>{Math.round((data.confidence_score || 0) * 100)}% Confidence</strong>
                                    {data.imagery_quality && (
                                        <span style={{ marginLeft: 'var(--space-2)', opacity: 0.7 }}>
                                            • {data.imagery_quality} Quality
                                        </span>
                                    )}
                                </div>
                            </div>
                        </>
                    )}

                    {/* Error Message */}
                    {data.message && (
                        <div className="error-message" style={{ marginTop: '1rem' }}>
                            <Icons.AlertTriangle />
                            <span>{data.message}</span>
                        </div>
                    )}
                </div>

                {/* === RIGHT COLUMN: Detailed Data === */}
                <div className="result-right-col">

                    {hasValidData && (
                        <>
                            {/* Extended Insights Row (Restored Full) */}
                            <div>
                                <h5 style={{
                                    fontSize: 'var(--font-size-xs)',
                                    color: 'var(--color-gray-500)',
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.05em',
                                    marginBottom: 'var(--space-3)'
                                }}>
                                    Environmental & Solar Analysis
                                </h5>
                                <div className="extended-insights">
                                    {data.max_sunshine_hours_per_year && (
                                        <div className="insight-card">
                                            <div style={{ fontSize: 'var(--font-size-lg)', fontWeight: '700', color: '#f59e0b' }}>
                                                {Math.round(data.max_sunshine_hours_per_year).toLocaleString()}
                                            </div>
                                            <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-gray-500)' }}>Sun Hours/Year</div>
                                        </div>
                                    )}
                                    {data.carbon_offset_factor && (
                                        <div className="insight-card">
                                            <div style={{ fontSize: 'var(--font-size-lg)', fontWeight: '700', color: '#10b981' }}>
                                                {Math.round(data.carbon_offset_factor)}
                                            </div>
                                            <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-gray-500)' }}>kg CO₂/MWh</div>
                                        </div>
                                    )}
                                    {data.max_panels && (
                                        <div className="insight-card">
                                            <div style={{ fontSize: 'var(--font-size-lg)', fontWeight: '700', color: '#3b82f6' }}>
                                                {data.max_panels}
                                            </div>
                                            <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-gray-500)' }}>Max Panels</div>
                                        </div>
                                    )}
                                    {data.roof_facet_count && (
                                        <div className="insight-card">
                                            <div style={{ fontSize: 'var(--font-size-lg)', fontWeight: '700', color: 'var(--color-gray-700)' }}>
                                                {data.roof_facet_count}
                                            </div>
                                            <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-gray-500)' }}>Facets</div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Roof Segments Table (Restored) */}
                            {data.roof_segments && data.roof_segments.length > 0 && (
                                <div>
                                    <h5 style={{
                                        fontSize: 'var(--font-size-xs)',
                                        color: 'var(--color-gray-500)',
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.05em',
                                        marginBottom: 'var(--space-3)',
                                        display: 'flex',
                                        justifyContent: 'space-between'
                                    }}>
                                        <span>Roof Facet Details</span>
                                        <span>{data.roof_segments.length} Segments</span>
                                    </h5>
                                    <div className="segments-table-container">
                                        <table className="segments-table">
                                            <thead>
                                                <tr>
                                                    <th style={{ width: '30px' }}>#</th>
                                                    <th>Area (sqft)</th>
                                                    <th>Pitch</th>
                                                    <th>Direction</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {data.roof_segments.slice(0, 5).map((seg, idx) => (
                                                    <tr key={idx}>
                                                        <td style={{ color: 'var(--color-gray-400)' }}>{idx + 1}</td>
                                                        <td style={{ fontWeight: '600' }}>{seg.area_sqft.toLocaleString()}</td>
                                                        <td>{seg.pitch}</td>
                                                        <td>
                                                            <span style={{
                                                                fontSize: '11px',
                                                                fontWeight: '700',
                                                                color: 'var(--color-gray-600)',
                                                                background: 'var(--color-gray-100)',
                                                                padding: '2px 6px',
                                                                borderRadius: '4px'
                                                            }}>
                                                                {seg.azimuth_direction}
                                                            </span>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                        {data.roof_segments.length > 5 && (
                                            <div style={{ padding: '8px', textAlign: 'center', fontSize: '11px', color: 'var(--color-gray-500)', borderTop: '1px solid var(--color-gray-100)' }}>
                                                And {data.roof_segments.length - 5} smaller facets...
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </>
                    )}

                    {/* Upgrade / Status Section (Right Column Bottom) */}
                    <div>
                        {showUpgrade && hasValidData && (
                            <div className="upgrade-section" style={{ marginTop: '0', background: 'var(--color-primary-50)', border: '1px solid var(--color-primary-200)' }}>
                                <div className="upgrade-info" style={{ marginBottom: 'var(--space-3)' }}>
                                    <h4 style={{ fontSize: 'var(--font-size-md)', color: 'var(--color-primary-900)' }}>Verified Report Available</h4>
                                    <p style={{ fontSize: 'var(--font-size-xs)' }}>
                                        Get detailed measurements with 99% accuracy for insurance claims.
                                    </p>
                                </div>
                                <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center' }}>
                                    <button
                                        className="upgrade-button"
                                        onClick={handleUpgradeClick}
                                        disabled={isUpgrading || tier2Disabled}
                                        style={{ flex: 1, justifyContent: 'center' }}
                                    >
                                        {isUpgrading ? 'Processing...' : 'Upgrade to Tier 2'}
                                    </button>
                                    {!tier2Disabled && <span style={{ fontSize: '11px', color: 'var(--color-gray-500)' }}>~$30</span>}
                                </div>
                                {tier2Disabled && (
                                    <div style={{ fontSize: '11px', color: 'var(--color-warning)', marginTop: '4px' }}>
                                        EagleView Disabled
                                    </div>
                                )}
                            </div>
                        )}

                        {isPending && (
                            <div className="upgrade-section" style={{ marginTop: '0', background: 'var(--color-warning-light)', borderColor: 'var(--color-warning)' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                                    <div className="loading-spinner" style={{ width: 20, height: 20 }} />
                                    <div>
                                        <div style={{ fontWeight: '600', fontSize: 'var(--font-size-sm)' }}>Processing Verified Report</div>
                                        <div style={{ fontSize: 'var(--font-size-xs)' }}>This may take 2-5 minutes...</div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                </div>
            </div>

            {showModal && (
                <UpgradeModal
                    onClose={() => setShowModal(false)}
                    onConfirm={handleConfirm}
                    isProcessing={isUpgrading}
                />
            )}
        </div>
    );
}
