import React from 'react';
import { Icons } from './Icons';

export function StatusBadge({ status }) {
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
