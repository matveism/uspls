// Admin Panel Manager
class AdminManager {
    constructor() {
        this.baseUrl = "https://v1.nocodeapi.com/mattsm680/google_sheets/rvPxDsnOCyIwhgTm";
        this.sheetTab = "Shipments";
        this.shipments = [];
        this.currentEditingIndex = null;
    }
    
    async initialize() {
        await this.loadShipments();
        this.setupEventListeners();
    }
    
    async loadShipments() {
        try {
            const url = `${this.baseUrl}?tabId=${this.sheetTab}`;
            const response = await fetch(url);
            const data = await response.json();
            
            // Parse the response
            let rows = [];
            if (Array.isArray(data)) {
                rows = data;
            } else if (data && data.data) {
                rows = data.data;
            }
            
            // Parse rows into shipment objects
            this.shipments = rows
                .filter(row => row && row.length > 0 && row[0])
                .map((row, index) => ({
                    rowIndex: index + 1, // Google Sheets rows start from 1
                    tracking_id: row[0] || '',
                    from_zip: row[1] || '',
                    to_zip: row[2] || '',
                    status: row[3] || '',
                    days: row[4] || '',
                    eta: row[5] || '',
                    last_update: row[6] || new Date().toISOString()
                }));
            
            this.renderTable();
            
        } catch (error) {
            console.error('Error loading shipments:', error);
            this.showError('Failed to load shipments. Please try again.');
        }
    }
    
    renderTable() {
        const tbody = document.querySelector('#shipmentsTable tbody');
        if (!tbody) return;
        
        if (this.shipments.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" class="text-center py-5">
                        <i class="fas fa-inbox fa-3x text-muted mb-3"></i>
                        <p>No shipments found.</p>
                        <button class="btn btn-primary" data-bs-toggle="modal" data-bs-target="#addShipmentModal">
                            <i class="fas fa-plus me-2"></i>Add First Shipment
                        </button>
                    </td>
                </tr>
            `;
            return;
        }
        
        tbody.innerHTML = this.shipments.map(shipment => `
            <tr>
                <td>
                    <strong>${shipment.tracking_id}</strong>
                    <br>
                    <small class="text-muted">ID: ${shipment.tracking_id}</small>
                </td>
                <td>
                    <span class="badge bg-light text-dark">
                        <i class="fas fa-map-marker-alt me-1"></i>
                        ${shipment.from_zip}
                    </span>
                </td>
                <td>
                    <span class="badge bg-light text-dark">
                        <i class="fas fa-flag-checkered me-1"></i>
                        ${shipment.to_zip}
                    </span>
                </td>
                <td>
                    <span class="badge ${this.getStatusBadgeClass(shipment.status)}">
                        ${shipment.status.replace(/_/g, ' ')}
                    </span>
                </td>
                <td>
                    ${shipment.eta ? new Date(shipment.eta).toLocaleDateString() : 'Not set'}
                    ${shipment.days ? `<br><small>${shipment.days} day(s)</small>` : ''}
                </td>
                <td>
                    <small>${new Date(shipment.last_update).toLocaleString()}</small>
                </td>
                <td>
                    <button class="btn btn-sm btn-outline-primary me-2" 
                            onclick="adminManager.editShipment(${shipment.rowIndex})">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-danger" 
                            onclick="adminManager.deleteShipment(${shipment.rowIndex}, '${shipment.tracking_id}')">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            </tr>
        `).join('');
    }
    
    getStatusBadgeClass(status) {
        const classes = {
            'INFO_RECEIVED': 'bg-secondary',
            'PICKED_UP': 'bg-info',
            'LOCAL_ARRIVAL_SCAN': 'bg-primary',
            'LOCAL_PROCESSED': 'bg-primary',
            'LOCAL_DEPART_SCAN': 'bg-primary',
            'IN_TRANSIT': 'bg-warning',
            'OUT_FOR_DELIVERY': 'bg-warning text-dark',
            'DELIVERED': 'bg-success'
        };
        return classes[status] || 'bg-secondary';
    }
    
    async addShipment() {
        const trackingId = document.getElementById('newTrackingId').value.trim();
        const fromZip = document.getElementById('newFromZip').value.trim();
        const toZip = document.getElementById('newToZip').value.trim();
        const status = document.getElementById('newStatus').value;
        const days = document.getElementById('newDays').value;
        let eta = document.getElementById('newEta').value;
        
        // Validate
        if (!trackingId || !fromZip || !toZip || !status) {
            this.showError('Please fill in all required fields.');
            return;
        }
        
        // Generate ETA if not provided
        if (!eta) {
            const etaDate = new Date();
            etaDate.setDate(etaDate.getDate() + parseInt(days || 3));
            eta = etaDate.toISOString().slice(0, 16);
        }
        
        try {
            // Prepare the data as 2D array
            const rowData = [
                trackingId,
                fromZip,
                toZip,
                status,
                days || '3',
                eta,
                new Date().toISOString()
            ];
            
            const requestBody = [rowData];
            
            const url = `${this.baseUrl}?tabId=${this.sheetTab}`;
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestBody)
            });
            
            if (!response.ok) {
                throw new Error('Failed to add shipment');
            }
            
            // Close modal and refresh
            document.getElementById('addShipmentForm').reset();
            const modal = bootstrap.Modal.getInstance(document.getElementById('addShipmentModal'));
            modal.hide();
            
            await this.loadShipments();
            this.showSuccess('Shipment added successfully!');
            
        } catch (error) {
            console.error('Error adding shipment:', error);
            this.showError('Failed to add shipment. Please try again.');
        }
    }
    
    editShipment(rowIndex) {
        const shipment = this.shipments.find(s => s.rowIndex === rowIndex);
        if (!shipment) return;
        
        this.currentEditingIndex = rowIndex;
        
        // Fill the edit form
        document.getElementById('editRowIndex').value = rowIndex;
        document.getElementById('editTrackingId').value = shipment.tracking_id;
        document.getElementById('editFromZip').value = shipment.from_zip;
        document.getElementById('editToZip').value = shipment.to_zip;
        document.getElementById('editStatus').value = shipment.status;
        document.getElementById('editDays').value = shipment.days;
        
        if (shipment.eta) {
            const etaDate = new Date(shipment.eta);
            document.getElementById('editEta').value = etaDate.toISOString().slice(0, 16);
        }
        
        // Show the modal
        const modal = new bootstrap.Modal(document.getElementById('editShipmentModal'));
        modal.show();
    }
    
    async updateShipment() {
        const rowIndex = document.getElementById('editRowIndex').value;
        const fromZip = document.getElementById('editFromZip').value.trim();
        const toZip = document.getElementById('editToZip').value.trim();
        const status = document.getElementById('editStatus').value;
        const days = document.getElementById('editDays').value;
        const eta = document.getElementById('editEta').value;
        
        if (!fromZip || !toZip || !status) {
            this.showError('Please fill in all required fields.');
            return;
        }
        
        try {
            const shipment = this.shipments.find(s => s.rowIndex === parseInt(rowIndex));
            if (!shipment) throw new Error('Shipment not found');
            
            // Prepare update data
            const updateData = [
                shipment.tracking_id,
                fromZip,
                toZip,
                status,
                days || shipment.days,
                eta || shipment.eta,
                new Date().toISOString()
            ];
            
            const requestBody = [updateData];
            
            const url = `${this.baseUrl}?tabId=${this.sheetTab}&rowIndex=${rowIndex}`;
            const response = await fetch(url, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestBody)
            });
            
            if (!response.ok) {
                // Try POST if PATCH fails
                const url2 = `${this.baseUrl}?tabId=${this.sheetTab}`;
                const response2 = await fetch(url2, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(requestBody)
                });
                
                if (!response2.ok) {
                    throw new Error('Failed to update shipment');
                }
            }
            
            // Close modal and refresh
            const modal = bootstrap.Modal.getInstance(document.getElementById('editShipmentModal'));
            modal.hide();
            
            await this.loadShipments();
            this.showSuccess('Shipment updated successfully!');
            
        } catch (error) {
            console.error('Error updating shipment:', error);
            this.showError('Failed to update shipment. Please try again.');
        }
    }
    
    async deleteShipment(rowIndex, trackingId) {
        if (!confirm(`Are you sure you want to delete shipment ${trackingId}?`)) {
            return;
        }
        
        try {
            const url = `${this.baseUrl}?tabId=${this.sheetTab}&rowIndex=${rowIndex}`;
            const response = await fetch(url, {
                method: 'DELETE'
            });
            
            if (!response.ok) {
                throw new Error('Failed to delete shipment');
            }
            
            await this.loadShipments();
            this.showSuccess('Shipment deleted successfully!');
            
        } catch (error) {
            console.error('Error deleting shipment:', error);
            this.showError('Failed to delete shipment. Please try again.');
        }
    }
    
    showError(message) {
        this.showAlert(message, 'danger');
    }
    
    showSuccess(message) {
        this.showAlert(message, 'success');
    }
    
    showAlert(message, type) {
        // Create alert element
        const alertDiv = document.createElement('div');
        alertDiv.className = `alert alert-${type} alert-dismissible fade show`;
        alertDiv.innerHTML = `
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        `;
        
        // Add to page
        const container = document.querySelector('.admin-content');
        container.insertBefore(alertDiv, container.firstChild);
        
        // Auto remove after 5 seconds
        setTimeout(() => {
            if (alertDiv.parentNode) {
                alertDiv.remove();
            }
        }, 5000);
    }
    
    setupEventListeners() {
        // Auto-refresh every 30 seconds
        setInterval(() => {
            this.loadShipments();
            document.getElementById('lastSync').textContent = new Date().toLocaleTimeString();
        }, 30000);
        
        // Update sync time
        document.getElementById('lastSync').textContent = new Date().toLocaleTimeString();
    }
}

// Initialize admin manager
const adminManager = new AdminManager();
document.addEventListener('DOMContentLoaded', () => adminManager.initialize());
