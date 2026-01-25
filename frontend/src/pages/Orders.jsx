import React, { useState, useEffect } from 'react';
import { getHistory, checkOrderNow } from '../services/api';
import { Icons } from '../components/Icons';
import { StatusBadge } from '../components/StatusBadge';
import ResultCard from '../components/ResultCard';

const TABS = {
    ESTIMATES: 'estimates',
    VERIFIED: 'verified',
    PENDING: 'pending'
};

export default function OrdersDashboard() {
    const [activeTab, setActiveTab] = useState(TABS.PENDING);
    const [estimates, setEstimates] = useState([]);
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedOrder, setSelectedOrder] = useState(null); // For Modal
    const [checkingId, setCheckingId] = useState(null); // Spinner for check status

    useEffect(() => {
        fetchAllData();
        // Poll active orders every 30s
        const interval = setInterval(() => {
            if (activeTab === TABS.PENDING) fetchAllData();
        }, 30000);
        return () => clearInterval(interval);
    }, [activeTab]);

    const fetchAllData = async () => {
        try {
            setLoading(true);
            // Parallel fetch
            const [estData, ordData] = await Promise.all([
                getHistory('ESTIMATE', 50),
                getHistory('ORDER', 50)
            ]);
            setEstimates(estData);
            setOrders(ordData);
        } catch (err) {
            console.error("Failed to load history", err);
        } finally {
            setLoading(false);
        }
    };

    const handleCheckNow = async (orderId) => {
        setCheckingId(orderId);
        try {
            await checkOrderNow(orderId);
            // Refresh data to move from Pending -> Verified if changed
            await fetchAllData();
            // Add a small delay for UI feedback or show toast? 
            // For MVP, the list refresh handles it.
        } catch (err) {
            alert("Check failed: " + err.message);
        } finally {
            setCheckingId(null);
        }
    };

    // Filter Data based on Active Tab
    const getDisplayData = () => {
        if (activeTab === TABS.ESTIMATES) return estimates;
        if (activeTab === TABS.VERIFIED) return orders.filter(o => o.status === 'VERIFIED');
        if (activeTab === TABS.PENDING) return orders.filter(o => o.status === 'PENDING' || o.status === 'FAILED');
        return [];
    };

    const displayData = getDisplayData();

    // Styles
    const cardStyle = {
        background: 'white',
        borderRadius: '16px',
        boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
        overflow: 'hidden',
        minHeight: '400px'
    };

    const tableHeaderStyle = {
        background: '#f8fafc',
        padding: '16px 24px',
        textAlign: 'left',
        fontSize: '0.85rem',
        fontWeight: '600',
        color: '#64748b',
        textTransform: 'uppercase',
        letterSpacing: '0.05em'
    };

    return (
        <div className="orders-dashboard" style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 20px' }}>

            {/* Header */}
            <div style={{ marginBottom: '30px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h2 style={{ fontSize: '2rem', fontWeight: '700', color: 'white', margin: 0 }}>Project History</h2>
                <button onClick={fetchAllData} className="refresh-btn" style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white', padding: '8px 12px', borderRadius: '8px', cursor: 'pointer' }}>
                    Reference #ID
                </button>
            </div>

            {/* Tabs */}
            <div className="dashboard-tabs" style={{ display: 'flex', gap: '12px', marginBottom: '24px' }}>
                <TabButton
                    active={activeTab === TABS.ESTIMATES}
                    onClick={() => setActiveTab(TABS.ESTIMATES)}
                    icon={<Icons.Lightning />}
                    label="Saved Estimates"
                />
                <TabButton
                    active={activeTab === TABS.VERIFIED}
                    onClick={() => setActiveTab(TABS.VERIFIED)}
                    icon={<Icons.Shield />}
                    label="Verified Reports"
                />
                <TabButton
                    active={activeTab === TABS.PENDING}
                    onClick={() => setActiveTab(TABS.PENDING)}
                    icon={<Icons.Clock />}
                    label="Pending Orders"
                />
            </div>

            {/* Main Card */}
            <div style={cardStyle}>
                {loading && displayData.length === 0 ? (
                    <div style={{ padding: '60px', textAlign: 'center', color: '#94a3b8' }}>
                        <div className="loading-spinner" style={{ margin: '0 auto 20px' }} />
                        Loading history...
                    </div>
                ) : displayData.length === 0 ? (
                    <div style={{ padding: '60px', textAlign: 'center', color: '#94a3b8' }}>
                        <div style={{ fontSize: '3rem', marginBottom: '16px', opacity: 0.5 }}>📭</div>
                        <h3>No records found</h3>
                        <p>You haven't generated any estimates in this category yet.</p>
                    </div>
                ) : (
                    <div className="table-container" style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                                    <th style={tableHeaderStyle}>Property Address</th>
                                    <th style={tableHeaderStyle}>Date</th>
                                    <th style={tableHeaderStyle}>Area / Pitch</th>
                                    <th style={tableHeaderStyle}>Status</th>
                                    <th style={tableHeaderStyle}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {displayData.map((item, idx) => (
                                    <tr key={item.order_id || idx}
                                        style={{
                                            borderBottom: '1px solid #f1f5f9',
                                            background: idx % 2 === 0 ? 'white' : '#f8fafc',
                                            transition: 'background 0.2s'
                                        }}
                                        className="table-row"
                                    >
                                        <td style={{ padding: '16px 24px', fontWeight: '500', color: '#1e293b' }}>
                                            {item.measurement?.address || 'Unknown Address'}
                                            <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '4px' }}>
                                                ID: {item.order_id}
                                            </div>
                                        </td>
                                        <td style={{ padding: '16px 24px', color: '#64748b', fontSize: '0.9rem' }}>
                                            {new Date(item.created_at).toLocaleDateString()}
                                            <div style={{ fontSize: '0.75rem' }}>{new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                                        </td>
                                        <td style={{ padding: '16px 24px', color: '#475569' }}>
                                            <div style={{ fontWeight: '600' }}>{item.measurement?.total_area_sqft?.toLocaleString()} sqft</div>
                                            <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>{item.measurement?.predominant_pitch} Pitch</div>
                                        </td>
                                        <td style={{ padding: '16px 24px' }}>
                                            <StatusBadge status={item.status} />
                                        </td>
                                        <td style={{ padding: '16px 24px' }}>
                                            {activeTab === TABS.PENDING ? (
                                                <button
                                                    onClick={() => handleCheckNow(item.order_id)}
                                                    disabled={checkingId === item.order_id}
                                                    style={{
                                                        background: checkingId === item.order_id ? '#cbd5e1' : '#3b82f6',
                                                        color: 'white',
                                                        border: 'none',
                                                        padding: '6px 12px',
                                                        borderRadius: '6px',
                                                        fontSize: '0.85rem',
                                                        fontWeight: '500',
                                                        cursor: checkingId === item.order_id ? 'not-allowed' : 'pointer',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '6px'
                                                    }}
                                                >
                                                    {checkingId === item.order_id ? (
                                                        <>Checking...</>
                                                    ) : (
                                                        <>Check Status ↻</>
                                                    )}
                                                </button>
                                            ) : (
                                                <button
                                                    onClick={() => setSelectedOrder(item)}
                                                    style={{
                                                        background: 'transparent',
                                                        border: '1px solid #e2e8f0',
                                                        color: '#475569',
                                                        padding: '6px 12px',
                                                        borderRadius: '6px',
                                                        fontSize: '0.85rem',
                                                        fontWeight: '500',
                                                        cursor: 'pointer',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '6px',
                                                        transition: 'all 0.2s',
                                                        hover: { background: '#f1f5f9' }
                                                    }}
                                                >
                                                    Details <span>→</span>
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Details Modal */}
            {selectedOrder && (
                <div className="modal-overlay" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, backdropFilter: 'blur(4px)' }}>
                    <div className="modal-content" style={{ background: 'white', borderRadius: '16px', width: '90%', maxWidth: '1000px', maxHeight: '90vh', overflowY: 'auto', position: 'relative', boxShadow: '0 20px 50px rgba(0,0,0,0.2)' }}>
                        <div style={{ padding: '16px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, background: 'white', zIndex: 10 }}>
                            <h3 style={{ margin: 0, fontSize: '1.25rem' }}>Measurement Details</h3>
                            <button
                                onClick={() => setSelectedOrder(null)}
                                style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#94a3b8' }}
                            >
                                ×
                            </button>
                        </div>
                        <div style={{ padding: '24px' }}>
                            {/* Reuse ResultCard for perfect consistency */}
                            <ResultCard
                                data={selectedOrder.measurement}
                                onUpgrade={() => { }} // History items generally can't be upgraded here unless we want to allow upgrading ESTIMATEs
                                isUpgrading={false}
                                tier2Disabled={true} // Disable upgrade in modal for now to keep it simple
                            />

                            {/* Verification specific data */}
                            {selectedOrder.status === 'VERIFIED' && (
                                <div style={{ marginTop: '24px', padding: '16px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px' }}>
                                    <h4 style={{ color: '#166534', margin: '0 0 8px 0' }}>✅ Verified EagleView Report</h4>
                                    <p style={{ margin: 0, fontSize: '0.9rem', color: '#15803d' }}>
                                        This report has been professionally verified. All measurements are guaranteed accurate for insurance purposes.
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
}

function TabButton({ active, onClick, icon, label }) {
    return (
        <button
            onClick={onClick}
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '12px 20px',
                border: 'none',
                borderRadius: '10px',
                background: active ? '#6366f1' : 'rgba(255,255,255,0.1)',
                color: active ? 'white' : 'rgba(255,255,255,0.7)',
                fontWeight: active ? '600' : '500',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                transform: active ? 'translateY(-2px)' : 'none',
                boxShadow: active ? '0 4px 12px rgba(99, 102, 241, 0.4)' : 'none'
            }}
        >
            {icon}
            <span>{label}</span>
        </button>
    );
}
