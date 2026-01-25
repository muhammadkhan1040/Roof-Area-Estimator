/**
 * API Service for Roof Measurement Backend
 * 
 * Handles all communication with the FastAPI backend.
 * Includes error handling, retries, and response normalization.
 */

// Use empty string to use Vite proxy in development
// In production, set this to your API URL
const API_BASE_URL = '';


/**
 * Get history of estimates or orders
 * 
 * @param {string} type - 'ESTIMATE' or 'ORDER'
 * @param {number} limit - Max items
 * @returns {Promise<Array>} List of orders
 */
export async function getHistory(type, limit = 50) {
    return request(`/history?type=${type}&limit=${limit}`);
}

/**
 * Custom error class for API errors
 */
export class ApiError extends Error {
    constructor(message, status, data = null) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
        this.data = data;
    }
}

/**
 * Make an API request with error handling
 */
async function request(endpoint, options = {}) {
    const url = `${API_BASE_URL}${endpoint}`;

    const config = {
        headers: {
            'Content-Type': 'application/json',
            ...options.headers,
        },
        ...options,
    };

    try {
        const response = await fetch(url, config);
        const data = await response.json();

        if (!response.ok) {
            throw new ApiError(
                data.detail || 'An error occurred',
                response.status,
                data
            );
        }

        return data;
    } catch (error) {
        if (error instanceof ApiError) {
            throw error;
        }

        // Network error
        throw new ApiError(
            'Unable to connect to the server. Please check if the backend is running.',
            0
        );
    }
}

/**
 * Get system health and status
 */
export async function getHealth() {
    return request('/health');
}

/**
 * Get Tier 1 instant estimate (Google Solar)
 * Cost: ~$0.015
 * 
 * @param {string} address - Full street address
 * @returns {Promise<Object>} RoofMeasurementResponse
 */
export async function getEstimate(address) {
    const encodedAddress = encodeURIComponent(address);
    return request(`/estimate?address=${encodedAddress}`);
}

/**
 * Create Tier 2 verified order (EagleView)
 * Cost: ~$30 ⚠️
 * 
 * @param {string} address - Full street address
 * @returns {Promise<Object>} OrderStatusResponse
 */
export async function createOrder(address, reportType = "PREMIUM") {
    return request('/order', {
        method: 'POST',
        body: JSON.stringify({
            address,
            report_type: reportType
        }),
    });
}

/**
 * Get order status and measurement data
 * 
 * @param {string} orderId - EagleView order ID
 * @returns {Promise<Object>} OrderStatusResponse
 */
export async function getOrderStatus(orderId) {
    return request(`/order/${orderId}`);
}

/**
 * Get cost summary
 * 
 * @returns {Promise<Object>} CostSummary
 */
export async function getCostSummary() {
    return request('/costs/summary');
}

/**
 * List recent orders
 * 
 * @param {number} limit - Max orders to return
 * @returns {Promise<Array>} List of OrderStatusResponse
 */
export async function listOrders(limit = 20) {
    return request(`/orders?limit=${limit}`);
}

/**
 * Poll for order completion
 * Polls every 10 seconds until order is no longer PENDING
 * 
 * @param {string} orderId - Order ID to poll
 * @param {function} onUpdate - Callback for status updates
 * @param {number} maxAttempts - Max polling attempts (default 30 = 5 minutes)
 * @returns {Promise<Object>} Final order status
 */
export async function pollOrderStatus(orderId, onUpdate, maxAttempts = 30) {
    let attempts = 0;

    while (attempts < maxAttempts) {
        const status = await getOrderStatus(orderId);

        if (onUpdate) {
            onUpdate(status);
        }

        if (status.status !== 'PENDING') {
            return status;
        }

        attempts++;
        await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10 seconds
    }

    throw new ApiError('Order polling timed out', 408);
}

export default {
    getHealth,
    getEstimate,
    createOrder,
    getOrderStatus,
    getCostSummary,
    listOrders,
    pollOrderStatus,
    checkOrderNow,
};

/**
 * Force an immediate status check
 * 
 * @param {string} orderId - Order ID to check
 * @returns {Promise<Object>} Updated OrderStatusResponse
 */
export async function checkOrderNow(orderId) {
    return request(`/orders/${orderId}/check-now`, {
        method: 'POST',
    });
}
