// ===============================
// CONFIGURATION
// ===============================
const BASE_URL = "https://v1.nocodeapi.com/mattsm680/google_sheets/rvPxDsnOCyIwhgTm";
const SHEET_TAB = "Shipments";
const CACHE_TTL = 30000; // 30 seconds cache

// Status flow definitions
const STATUS_FLOW = [
    { id: "INFO_RECEIVED", label: "Info Received", icon: "fas fa-info-circle", color: "#6c757d" },
    { id: "PICKED_UP", label: "Picked Up", icon: "fas fa-box", color: "#17a2b8" },
    { id: "LOCAL_ARRIVAL_SCAN", label: "Arrival Scan", icon: "fas fa-truck-loading", color: "#007bff" },
    { id: "LOCAL_PROCESSED", label: "Processed", icon: "fas fa-cogs", color: "#6610f2" },
    { id: "LOCAL_DEPART_SCAN", label: "Depart Scan", icon: "fas fa-truck-moving", color: "#fd7e14" },
    { id: "IN_TRANSIT", label: "In Transit", icon: "fas fa-plane", color: "#20c997" },
    { id: "OUT_FOR_DELIVERY", label: "Out for Delivery", icon: "fas fa-shipping-fast", color: "#ffc107" },
    { id: "DELIVERED", label: "Delivered", icon: "fas fa-check-circle", color: "#28a745" }
];

// ===============================
// DATA CACHE SYSTEM
// ===============================
const dataCache = {
    shipments: [],
    timestamp: 0,
    isLoading: false,
    
    isValid() {
        return this.shipments.length > 0 && 
               (Date.now() - this.timestamp) < CACHE_TTL;
    },
    
    set(data) {
        this.shipments = data;
        this.timestamp = Date.now();
        this.updateCacheStatus();
    },
    
    clear() {
        this.shipments = [];
        this.timestamp = 0;
        this.updateCacheStatus();
    },
    
    updateCacheStatus() {
        const statusEl = document.getElementById('cacheStatus');
        if (statusEl) {
            if (this.timestamp === 0) {
                statusEl.textContent = 'No data loaded';
            } else {
                const age = Math.floor((Date.now() - this.timestamp) / 1000);
                if (age < 60) {
                    statusEl.textContent = `Updated ${age} second${age !== 1 ? 's' : ''} ago`;
                } else {
                    const minutes = Math.floor(age / 60);
                    statusEl.textContent = `Updated ${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
                }
            }
        }
    }
};

// ===============================
// API SERVICE
// ===============================
class ApiService {
    constructor() {
        this.baseUrl = BASE_URL;
    }
    
    async fetchAllShipments() {
        try {
            // Show loading state
            this.showLoading(true);
            
            const url = `${this.baseUrl}?tabId=${SHEET_TAB}`;
            console.log('📡 Fetching from:', url);
            
            const response = await fetch(url);
            
            if (!response.ok) {
                throw new Error(`API Error: ${response.status} ${response.statusText}`);
            }
            
            const data = await response.json();
            console.log('✅ API Response:', data);
            
            // Parse the response based on format
            let shipments = [];
            
            if (Array.isArray(data)) {
                // Direct array response
                shipments = data.map(row => this.parseRow(row));
            } else if (data && data.data && Array.isArray(data.data)) {
                // Response with data property
                shipments = data.data.map(row => this.parseRow(row));
            } else if (data && typeof data === 'object') {
                // Try to extract array from object
                for (const key in data) {
                    if (Array.isArray(data[key])) {
                        shipments = data[key].map(row => this.parseRow(row));
                        break;
                    }
                }
            }
            
            // Filter out empty rows and rows without tracking_id
            shipments = shipments.filter(shipment => 
                shipment && shipment.tracking_id && shipment.tracking_id.trim() !== ''
            );
            
            console.log(`📊 Parsed ${shipments.length} shipments`);
            
            // Update cache
            dataCache.set(shipments);
            
            return shipments;
            
        } catch (error) {
            console.error('❌ Error fetching shipments:', error);
            throw error;
        } finally {
            this.showLoading(false);
        }
    }
    
    parseRow(row) {
        // Handle array format (Google Sheets 2D array)
        if (Array.isArray(row)) {
            return {
                tracking_id: row[0] || '',
                from_zip: row[1] || '',
                to_zip: row[2] || '',
                status: row[3] || '',
                days: row[4] || '',
                eta: row[5] || '',
                last_update: row[6] || new Date().toISOString()
            };
        }
        
        // Handle object format
        if (row && typeof row === 'object') {
            return {
                tracking_id: row.tracking_id || row.trackingId || row.id || '',
                from_zip: row.from_zip || row.fromZip || '',
                to_zip: row.to_zip || row.toZip || '',
                status: row.status || '',
                days: row.days || '',
                eta: row.eta || '',
                last_update: row.last_update || row.lastUpdate || new Date().toISOString()
            };
        }
        
        return null;
    }
    
    showLoading(show) {
        const apiStatus = document.getElementById('apiStatus');
        if (apiStatus) {
            apiStatus.innerHTML = show 
                ? '<i class="fas fa-spinner fa-spin me-1"></i>Loading...'
                : '<i class="fas fa-check-circle me-1"></i>Connected';
        }
    }
}

// ===============================
// TRACKING SERVICE
// ===============================
class TrackingService {
    constructor(apiService) {
        this.api = apiService;
    }
    
    async searchTrackingNumber(trackingId) {
        try {
            // Normalize tracking ID
            trackingId = trackingId.trim().toUpperCase();
            
            // Check cache first
            let shipments = dataCache.shipments;
            
            // If cache is empty or invalid, fetch fresh data
            if (!dataCache.isValid()) {
                shipments = await this.api.fetchAllShipments();
            }
            
            // Search for tracking ID
            const results = shipments.filter(shipment => {
                const id = shipment.tracking_id.toString().toUpperCase();
                return id === trackingId;
            });
            
            // Sort by last_update (newest first)
            results.sort((a, b) => {
                const dateA = new Date(a.last_update || 0);
                const dateB = new Date(b.last_update || 0);
                return dateB - dateA;
            });
            
            return results;
            
        } catch (error) {
            console.error('❌ Search error:', error);
            throw error;
        }
    }
    
    async forceRefresh() {
        dataCache.clear();
        return await this.api.fetchAllShipments();
    }
}

// ===============================
// UI RENDERER
// ===============================
class UIRenderer {
    constructor() {
        this.apiService = new ApiService();
        this.trackingService = new TrackingService(this.apiService);
    }
    
    // Main render method
    async renderTrackingResult(trackingId) {
        const resultEl = document.getElementById('trackingResult');
        
        try {
            // Show loading state
            this.showLoadingState(resultEl, trackingId);
            
            // Search for tracking number
            const results = await this.trackingService.searchTrackingNumber(trackingId);
            
            if (results.length === 0) {
                this.showNotFoundState(resultEl, trackingId);
                return;
            }
            
            // Get the most recent result
            const shipment = results[0];
            
            // Render the tracking details
            this.renderShipmentDetails(resultEl, shipment, results.length);
            
        } catch (error) {
            this.showErrorState(resultEl, error.message);
        }
    }
    
    // Show loading state
    showLoadingState(container, trackingId) {
        container.innerHTML = `
            <div class="loading-state">
                <div class="loading-icon">
                    <i class="fas fa-spinner fa-spin"></i>
                </div>
                <h3>Searching for Package</h3>
                <p>Looking up tracking number: <strong>${trackingId}</strong></p>
                <div class="loading-dots">
                    <span></span>
                    <span></span>
                    <span></span>
                </div>
                <p class="mt-3 text-muted"><small>Fetching the latest tracking information...</small></p>
            </div>
        `;
    }
    
    // Show not found state
    showNotFoundState(container, trackingId) {
        container.innerHTML = `
            <div class="not-found-state">
                <div class="error-icon">
                    <i class="fas fa-search"></i>
                </div>
                <h3>Tracking Number Not Found</h3>
                <p>We couldn't find any shipment with tracking number:</p>
                <div class="tracking-id-display mt-3 mb-4">${trackingId}</div>
                <p class="text-muted">Please check the tracking number and try again.</p>
                <div class="mt-4">
                    <button class="btn btn-primary" onclick="window.location.reload()">
                        <i class="fas fa-redo me-2"></i>Try Again
                    </button>
                </div>
            </div>
        `;
    }
    
    // Show error state
    showErrorState(container, errorMessage) {
        container.innerHTML = `
            <div class="error-state">
                <div class="error-icon">
                    <i class="fas fa-exclamation-triangle"></i>
                </div>
                <h3>Connection Error</h3>
                <p>We're having trouble connecting to our tracking system.</p>
                <div class="alert alert-warning mt-3">
                    <i class="fas fa-info-circle me-2"></i>
                    ${errorMessage || 'Please check your internet connection and try again.'}
                </div>
                <div class="mt-4">
                    <button class="btn btn-primary me-2" onclick="window.location.reload()">
                        <i class="fas fa-redo me-2"></i>Retry
                    </button>
                    <button class="btn btn-outline-secondary" onclick="uiRenderer.forceRefreshData()">
                        <i class="fas fa-sync-alt me-2"></i>Force Refresh
                    </button>
                </div>
            </div>
        `;
    }
    
    // Render shipment details
    renderShipmentDetails(container, shipment, totalResults) {
        const statusIndex = this.getStatusIndex(shipment.status);
        const progressPercent = ((statusIndex + 1) / STATUS_FLOW.length) * 100;
        
        container.innerHTML = `
            <div class="tracking-details">
                <!-- Header -->
                <div class="details-header">
                    <div>
                        <h2><i class="fas fa-box-open me-2"></i>Package Details</h2>
                        <div class="tracking-id-display mt-2">
                            <i class="fas fa-barcode me-2"></i>${shipment.tracking_id}
                        </div>
                    </div>
                    <div class="status-badge status-${shipment.status.toLowerCase().replace(/_/g, '-')}">
                        <i class="${this.getStatusIcon(shipment.status)} me-2"></i>
                        ${shipment.status.replace(/_/g, ' ')}
                    </div>
                </div>
                
                <!-- Quick Stats -->
                <div class="details-grid">
                    <div class="detail-item">
                        <div class="detail-label">From ZIP</div>
                        <div class="detail-value">
                            <i class="fas fa-map-marker-alt me-2 text-primary"></i>
                            ${shipment.from_zip || 'N/A'}
                        </div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">To ZIP</div>
                        <div class="detail-value">
                            <i class="fas fa-flag-checkered me-2 text-success"></i>
                            ${shipment.to_zip || 'N/A'}
                        </div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">Estimated Days</div>
                        <div class="detail-value">
                            <i class="fas fa-calendar-alt me-2 text-info"></i>
                            ${shipment.days || 'N/A'}
                        </div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">Last Updated</div>
                        <div class="detail-value">
                            <i class="fas fa-clock me-2 text-warning"></i>
                            ${this.formatDate(shipment.last_update)}
                        </div>
                    </div>
                </div>
                
                <!-- Progress Bar -->
                <div class="status-progress">
                    <h4><i class="fas fa-road me-2"></i>Delivery Progress</h4>
                    <div class="progress-bar-container">
                        <div class="progress-track"></div>
                        <div class="progress-fill" style="width: ${progressPercent}%"></div>
                        <div class="progress-milestones">
                            ${STATUS_FLOW.map((status, index) => `
                                <div class="milestone ${index <= statusIndex ? 'completed' : ''} ${index === statusIndex ? 'active' : ''}">
                                    <div class="milestone-dot" style="border-color: ${status.color}"></div>
                                    <div class="milestone-label">${status.label}</div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                </div>
                
                <!-- ETA Card -->
                ${this.renderETACard(shipment)}
                
                <!-- Map Visualization -->
                <div class="map-container">
                    <h4><i class="fas fa-map-marked-alt me-2"></i>Route Overview</h4>
                    <div class="map-visualization mt-3">
                        <div class="map-route"></div>
                        <div class="map-point start"></div>
                        <div class="map-point current" style="left: ${progressPercent}%"></div>
                        <div class="map-point end"></div>
                    </div>
                    <div class="map-labels">
                        <div class="map-label">
                            <i class="fas fa-map-marker-alt text-primary"></i><br>
                            Origin<br>
                            <small>${shipment.from_zip || 'Unknown'}</small>
                        </div>
                        <div class="map-label">
                            <i class="fas fa-location-arrow text-warning"></i><br>
                            Current<br>
                            <small>${STATUS_FLOW[statusIndex]?.label || 'Unknown'}</small>
                        </div>
                        <div class="map-label">
                            <i class="fas fa-flag-checkered text-success"></i><br>
                            Destination<br>
                            <small>${shipment.to_zip || 'Unknown'}</small>
                        </div>
                    </div>
                </div>
                
                <!-- History Timeline -->
                <div class="history-timeline">
                    <h4><i class="fas fa-history me-2"></i>Status History</h4>
                    ${this.renderStatusHistory(statusIndex)}
                </div>
                
                <!-- Footer Notes -->
                ${totalResults > 1 ? `
                    <div class="alert alert-info mt-4">
                        <i class="fas fa-info-circle me-2"></i>
                        Found ${totalResults} tracking records. Showing the most recent update.
                    </div>
                ` : ''}
                
                <div class="mt-4 text-end">
                    <button class="btn btn-outline-primary" onclick="uiRenderer.forceRefreshData()">
                        <i class="fas fa-sync-alt me-2"></i>Refresh for Latest Updates
                    </button>
                </div>
            </div>
        `;
    }
    
    // Render ETA card
    renderETACard(shipment) {
        if (shipment.status === 'DELIVERED') {
            return `
                <div class="eta-card" style="background: linear-gradient(135deg, #28a745 0%, #20c997 100%);">
                    <div class="eta-header">
                        <i class="fas fa-check-circle"></i>
                        <div>
                            <h3>Package Delivered</h3>
                            <div class="eta-time">${this.formatDate(shipment.eta)}</div>
                            <div class="eta-note">
                                <i class="fas fa-check me-1"></i>
                                Successfully delivered to recipient
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }
        
        if (shipment.status === 'OUT_FOR_DELIVERY') {
            return `
                <div class="eta-card" style="background: linear-gradient(135deg, #ffc107 0%, #fd7e14 100%);">
                    <div class="eta-header">
                        <i class="fas fa-shipping-fast"></i>
                        <div>
                            <h3>Out for Delivery</h3>
                            <div class="eta-time">Today</div>
                            <div class="eta-note">
                                <i class="fas fa-clock me-1"></i>
                                Expected delivery within the next few hours
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }
        
        const etaDate = shipment.eta ? new Date(shipment.eta) : new Date(Date.now() + (parseInt(shipment.days) || 3) * 86400000);
        
        return `
            <div class="eta-card">
                <div class="eta-header">
                    <i class="fas fa-clock"></i>
                    <div>
                        <h3>Estimated Delivery</h3>
                        <div class="eta-time">${this.formatDate(etaDate.toISOString())}</div>
                        <div class="eta-note">
                            <i class="fas fa-info-circle me-1"></i>
                            ${shipment.days || '3'} day${shipment.days == '1' ? '' : 's'} estimated transit time
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
    
    // Render status history
    renderStatusHistory(currentIndex) {
        return STATUS_FLOW.map((status, index) => `
            <div class="timeline-item ${index <= currentIndex ? 'active' : ''}">
                <div class="timeline-dot" style="background: ${status.color}"></div>
                <div class="timeline-content">
                    <div class="timeline-time">
                        ${index <= currentIndex ? '<i class="fas fa-check-circle text-success me-1"></i>Completed' : '<i class="fas fa-clock text-muted me-1"></i>Pending'}
                    </div>
                    <div class="timeline-event">
                        <i class="${status.icon} me-2" style="color: ${status.color}"></i>
                        ${status.label}
                    </div>
                    ${index === currentIndex ? `
                        <div class="mt-2">
                            <span class="badge bg-primary">Current Status</span>
                        </div>
                    ` : ''}
                </div>
            </div>
        `).join('');
    }
    
    // Helper methods
    getStatusIndex(status) {
        const statusId = status.toUpperCase().replace(/ /g, '_');
        return STATUS_FLOW.findIndex(s => s.id === statusId);
    }
    
    getStatusIcon(status) {
        const statusId = status.toUpperCase().replace(/ /g, '_');
        const statusInfo = STATUS_FLOW.find(s => s.id === statusId);
        return statusInfo ? statusInfo.icon : 'fas fa-question-circle';
    }
    
    formatDate(dateString) {
        if (!dateString) return 'Not available';
        
        try {
            const date = new Date(dateString);
            if (isNaN(date.getTime())) return 'Invalid date';
            
            return date.toLocaleString('en-US', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        } catch (error) {
            return dateString;
        }
    }
    
    // Force refresh data
    async forceRefreshData() {
        try {
            await this.trackingService.forceRefresh();
            const trackingId = document.getElementById('t_tracking_id')?.value;
            if (trackingId) {
                await this.renderTrackingResult(trackingId);
            }
        } catch (error) {
            console.error('Force refresh error:', error);
        }
    }
}

// ===============================
// INITIALIZATION
// ===============================

// Create global UI renderer instance
const uiRenderer = new UIRenderer();

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 ShipTrack Pro Initialized');
    
    // Initialize form submission
    const form = document.getElementById('trackingForm');
    if (form) {
        form.addEventListener('submit', async function(e) {
            e.preventDefault();
            const trackingId = document.getElementById('t_tracking_id').value.trim();
            if (trackingId) {
                await uiRenderer.renderTrackingResult(trackingId);
            }
        });
    }
    
    // Initialize refresh button
    const refreshBtn = document.getElementById('refreshBtn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', async function() {
            await uiRenderer.forceRefreshData();
        });
    }
    
    // Check for URL parameter
    const urlParams = new URLSearchParams(window.location.search);
    const trackingId = urlParams.get('tracking');
    if (trackingId) {
        document.getElementById('t_tracking_id').value = trackingId;
        // Auto-search after a short delay
        setTimeout(() => {
            form.dispatchEvent(new Event('submit'));
        }, 1000);
    }
    
    // Pre-fetch data for better performance
    setTimeout(() => {
        if (!dataCache.isValid()) {
            uiRenderer.apiService.fetchAllShipments().catch(console.error);
        }
    }, 2000);
    
    // Update cache status every 5 seconds
    setInterval(() => {
        dataCache.updateCacheStatus();
    }, 5000);
});

// ===============================
// GLOBAL DEBUG FUNCTIONS
// ===============================
window.debugTracking = {
    clearCache: function() {
        dataCache.clear();
        alert('Cache cleared!');
    },
    
    viewCache: function() {
        console.log('Cache:', dataCache);
        alert(`Cache has ${dataCache.shipments.length} shipments\nLast updated: ${new Date(dataCache.timestamp).toLocaleString()}`);
    },
    
    testSearch: function(trackingId = 'TEST123') {
        document.getElementById('t_tracking_id').value = trackingId;
        document.getElementById('trackingForm').dispatchEvent(new Event('submit'));
    },
    
    simulateData: function() {
        const sampleShipment = {
            tracking_id: 'TRK' + Date.now().toString().slice(-8),
            from_zip: '10001',
            to_zip: '90210',
            status: 'IN_TRANSIT',
            days: '3',
            eta: new Date(Date.now() + 3 * 86400000).toISOString(),
            last_update: new Date().toISOString()
        };
        
        dataCache.set([sampleShipment]);
        document.getElementById('t_tracking_id').value = sampleShipment.tracking_id;
        document.getElementById('trackingForm').dispatchEvent(new Event('submit'));
    }
};
