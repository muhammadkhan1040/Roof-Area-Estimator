import React, { useState } from 'react';
import { Icons } from './Icons';

export default function Tier2Setup({ address, area, onConfirm, onBack, isSubmitting }) {
    const [selectedType, setSelectedType] = useState(null); // 'BASIC' or 'PREMIUM'

    return (
        <div className="tier2-setup-container" style={{ maxWidth: '800px', margin: '0 auto', paddingTop: '40px' }}>

            {/* Header */}
            <div style={{ marginBottom: '30px' }}>
                <button onClick={onBack} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                    <span>←</span> Back to Estimate
                </button>
                <h2 style={{ fontSize: '2rem', color: '#1e293b', marginBottom: '8px' }}>Configure Verified Report</h2>
                <p style={{ color: '#64748b' }}>For property: <strong>{address}</strong></p>
            </div>

            {/* Selection Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '40px' }}>

                {/* Basic Option */}
                <div
                    onClick={() => setSelectedType('BASIC')}
                    style={{
                        border: selectedType === 'BASIC' ? '2px solid #3b82f6' : '1px solid #e2e8f0',
                        borderRadius: '16px',
                        padding: '24px',
                        cursor: 'pointer',
                        background: selectedType === 'BASIC' ? '#eff6ff' : 'white',
                        transition: 'all 0.2s',
                        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)'
                    }}
                >
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px', alignItems: 'center' }}>
                        <span style={{ fontWeight: '700', fontSize: '1.25rem', color: '#1e293b' }}>Basic Report</span>
                        <span style={{ background: '#bfdbfe', color: '#1e40af', padding: '4px 12px', borderRadius: '20px', fontSize: '0.9rem', fontWeight: '600' }}>$15</span>
                    </div>
                    <ul style={{ listStyle: 'none', padding: 0, color: '#475569', lineHeight: '1.8' }}>
                        <li>✅ Total Roof Area</li>
                        <li>✅ Predominant Pitch</li>
                        <li>✅ Primary Structure Only</li>
                    </ul>
                </div>

                {/* Premium Option */}
                <div
                    onClick={() => setSelectedType('PREMIUM')}
                    style={{
                        border: selectedType === 'PREMIUM' ? '2px solid #8b5cf6' : '1px solid #e2e8f0',
                        borderRadius: '16px',
                        padding: '24px',
                        cursor: 'pointer',
                        background: selectedType === 'PREMIUM' ? '#f5f3ff' : 'white',
                        position: 'relative',
                        transition: 'all 0.2s',
                        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)'
                    }}
                >
                    <div style={{ position: 'absolute', top: '-12px', left: '24px', background: '#8b5cf6', color: 'white', padding: '4px 12px', borderRadius: '12px', fontSize: '0.8rem', fontWeight: '700' }}>RECOMMENDED</div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px', alignItems: 'center' }}>
                        <span style={{ fontWeight: '700', fontSize: '1.25rem', color: '#5b21b6' }}>Premium Report</span>
                        <span style={{ background: '#ddd6fe', color: '#5b21b6', padding: '4px 12px', borderRadius: '20px', fontSize: '0.9rem', fontWeight: '600' }}>$30</span>
                    </div>
                    <ul style={{ listStyle: 'none', padding: 0, color: '#475569', lineHeight: '1.8' }}>
                        <li>✅ <strong>Everything in Basic</strong></li>
                        <li>✅ Detailed Line Lengths (Ridges, Eaves)</li>
                        <li>✅ Waste Factor Calculations</li>
                        <li>✅ All Structures (Garage, etc.)</li>
                    </ul>
                </div>
            </div>

            {/* Action Bar */}
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button
                    onClick={() => onConfirm(selectedType)}
                    disabled={!selectedType || isSubmitting}
                    style={{
                        background: !selectedType ? '#cbd5e1' : '#2563eb',
                        color: 'white',
                        border: 'none',
                        padding: '16px 40px',
                        borderRadius: '12px',
                        fontSize: '1.1rem',
                        fontWeight: '600',
                        cursor: !selectedType ? 'not-allowed' : 'pointer',
                        opacity: isSubmitting ? 0.7 : 1,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px'
                    }}
                >
                    {isSubmitting ? (
                        <>
                            <span className="loading-spinner" style={{ width: 20, height: 20, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: 'white' }}></span>
                            Processing Order...
                        </>
                    ) : (
                        `Place ${selectedType ? selectedType.toLowerCase() : ''} order`
                    )}
                </button>
            </div>
        </div>
    );
}
