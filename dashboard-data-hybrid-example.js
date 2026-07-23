/**
 * ╔═══════════════════════════════════════════════════════════════════╗
 * ║  GAMAS 2026 - Dashboard Data - Hybrid Sync Implementation         ║
 * ║  Data management, cleanup, dan inventory dengan Supabase backend  ║
 * ╚═══════════════════════════════════════════════════════════════════╝
 */

let gmSync = null;

async function initDashboardData() {
  let attempts = 0;
  while (!window.gmSync && attempts < 50) {
    await new Promise(r => setTimeout(r, 100));
    attempts++;
  }
  gmSync = window.gmSync;
  
  console.log('✅ Dashboard Data initialized with hybrid sync');
  setupDataListeners();
  await loadInventoryData();
}

/**
 * ╔═══════════════════════════════════════════════════════════════════╗
 * ║  INVENTORY/DATA MANAGEMENT                                        ║
 * ╚═══════════════════════════════════════════════════════════════════╝
 */

async function loadInventoryData() {
  try {
    // Load data dari Supabase/local hybrid
    const data = await gmSync.read('sales_transactions', {
      filters: { table_name: 'dashboard_data' }
    });
    
    renderInventoryTable(data || []);
    updateInventoryStats(data);
    
    return data;
  } catch (error) {
    console.error('❌ Gagal load inventory:', error);
    const fallback = JSON.parse(localStorage.getItem('gm2026_inventory') || '[]');
    renderInventoryTable(fallback);
    return fallback;
  }
}

async function addInventoryItem(item) {
  try {
    if (!item.id) {
      item.id = `inv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    if (!item.product_name || !item.quantity || !item.price) {
      throw new Error('Product name, quantity, dan price wajib diisi');
    }

    item.table_name = 'dashboard_data';
    item.last_updated = new Date().toISOString();
    item.stock_value = item.quantity * item.price;

    const result = await gmSync.create('sales_transactions', item);
    await loadInventoryData();
    
    showNotification(`✅ Item "${item.product_name}" ditambahkan`, 'success');
    return result;
  } catch (error) {
    showNotification(`❌ Error: ${error.message}`, 'error');
  }
}

async function updateInventoryItem(id, updates) {
  try {
    updates.last_updated = new Date().toISOString();
    if (updates.quantity && updates.price) {
      updates.stock_value = updates.quantity * updates.price;
    }

    await gmSync.update('sales_transactions', id, updates);
    await loadInventoryData();
    
    showNotification('✅ Inventory diperbarui', 'success');
  } catch (error) {
    showNotification(`❌ Error: ${error.message}`, 'error');
  }
}

async function deleteInventoryItem(id) {
  if (!confirm('Hapus item dari inventory?')) return;
  
  try {
    await gmSync.delete('sales_transactions', id);
    await loadInventoryData();
    showNotification('✅ Item dihapus', 'success');
  } catch (error) {
    showNotification(`❌ Error: ${error.message}`, 'error');
  }
}

function renderInventoryTable(data) {
  const table = document.getElementById('inventoryTable') || 
               document.querySelector('[data-table="inventory"]');
  if (!table) return;
  
  table.innerHTML = '';
  
  if (!data || data.length === 0) {
    table.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:20px;">Inventory kosong</td></tr>';
    return;
  }
  
  data.forEach(row => {
    const tr = document.createElement('tr');
    const stockStatus = row.quantity < 10 ? 'low' : row.quantity < 50 ? 'medium' : 'healthy';
    
    tr.innerHTML = `
      <td>${row.product_name || '-'}</td>
      <td>${row.category || '-'}</td>
      <td><span class="stock-badge ${stockStatus}">${row.quantity || 0}</span></td>
      <td>Rp${(row.price || 0).toLocaleString('id')}</td>
      <td>Rp${(row.stock_value || 0).toLocaleString('id')}</td>
      <td>${new Date(row.last_updated || Date.now()).toLocaleDateString('id')}</td>
      <td>
        <button onclick="dashboardData.editInventoryModal('${row.id}')" class="btn-sm">Edit</button>
        <button onclick="dashboardData.deleteInventoryItem('${row.id}')" class="btn-sm btn-danger">Hapus</button>
      </td>
    `;
    table.appendChild(tr);
  });
}

function updateInventoryStats(data) {
  if (!data || !Array.isArray(data)) return;
  
  const totalItems = data.length;
  const totalValue = data.reduce((sum, d) => sum + (d.stock_value || 0), 0);
  const lowStock = data.filter(d => d.quantity < 10).length;
  const avgValue = totalItems > 0 ? totalValue / totalItems : 0;
  
  const statsEl = document.getElementById('inventoryStats');
  if (statsEl) {
    statsEl.innerHTML = `
      <div class="stat-item">
        <div class="stat-label">Total Items</div>
        <div class="stat-value">${totalItems}</div>
      </div>
      <div class="stat-item">
        <div class="stat-label">Total Value</div>
        <div class="stat-value">Rp${totalValue.toLocaleString('id')}</div>
      </div>
      <div class="stat-item">
        <div class="stat-label">Low Stock</div>
        <div class="stat-value" style="color: #d97706;">${lowStock}</div>
      </div>
      <div class="stat-item">
        <div class="stat-label">Avg Value</div>
        <div class="stat-value">Rp${Math.round(avgValue).toLocaleString('id')}</div>
      </div>
    `;
  }
}

/**
 * ╔═══════════════════════════════════════════════════════════════════╗
 * ║  DATA CLEANUP & ORGANIZATION                                      ║
 * ╚═══════════════════════════════════════════════════════════════════╝
 */

async function cleanupDuplicateData() {
  try {
    const data = await gmSync.read('sales_transactions', {
      filters: { table_name: 'dashboard_data' }
    });
    
    if (!data) {
      showNotification('❌ No data found', 'error');
      return;
    }

    // Identifikasi duplikat (same product name & date)
    const seen = new Map();
    const duplicates = [];
    
    data.forEach(item => {
      const key = `${item.product_name}|${item.date}`;
      if (seen.has(key)) {
        duplicates.push(item.id);
      } else {
        seen.set(key, item.id);
      }
    });

    if (duplicates.length === 0) {
      showNotification('✅ No duplicates found', 'info');
      return;
    }

    // Delete duplicates
    for (const dupId of duplicates) {
      await gmSync.delete('sales_transactions', dupId);
    }

    await loadInventoryData();
    showNotification(`✅ ${duplicates.length} duplikat dihapus`, 'success');
  } catch (error) {
    showNotification(`❌ Error: ${error.message}`, 'error');
  }
}

async function organizeDataByCategory() {
  try {
    const data = await gmSync.read('sales_transactions', {
      filters: { table_name: 'dashboard_data' }
    });
    
    if (!data) return;

    // Group by category
    const grouped = {};
    data.forEach(item => {
      const cat = item.category || 'Uncategorized';
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(item);
    });

    // Display organized view
    renderOrganizedData(grouped);
    showNotification('✅ Data diorganisir per kategori', 'success');
  } catch (error) {
    showNotification(`❌ Error: ${error.message}`, 'error');
  }
}

function renderOrganizedData(grouped) {
  const container = document.getElementById('organizedDataView');
  if (!container) return;
  
  container.innerHTML = '';
  
  Object.entries(grouped).forEach(([category, items]) => {
    const section = document.createElement('div');
    section.className = 'data-category-section';
    section.style.cssText = `
      margin: 20px 0;
      padding: 16px;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
    `;
    
    const header = document.createElement('h3');
    header.textContent = `${category} (${items.length})`;
    section.appendChild(header);
    
    const table = document.createElement('table');
    table.style.width = '100%';
    
    items.forEach(item => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${item.product_name}</td>
        <td>${item.quantity}</td>
        <td>Rp${(item.stock_value || 0).toLocaleString('id')}</td>
      `;
      table.appendChild(tr);
    });
    
    section.appendChild(table);
    container.appendChild(section);
  });
}

async function exportDataToExcel() {
  try {
    const data = await gmSync.read('sales_transactions', {
      filters: { table_name: 'dashboard_data' }
    });
    
    if (!data || data.length === 0) {
      showNotification('❌ No data to export', 'error');
      return;
    }

    // Prepare export data
    const exportData = data.map(d => ({
      'Produk': d.product_name,
      'Kategori': d.category,
      'Stok': d.quantity,
      'Harga': d.price,
      'Nilai Stok': d.stock_value,
      'Terakhir Update': new Date(d.last_updated).toLocaleDateString('id')
    }));

    // Export menggunakan XLSX (jika available)
    if (typeof XLSX !== 'undefined') {
      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Inventory');
      XLSX.writeFile(wb, `inventory_${new Date().toISOString().split('T')[0]}.xlsx`);
      showNotification('✅ Data exported ke Excel', 'success');
    } else {
      // Fallback: CSV download
      const csv = convertToCSV(exportData);
      downloadCSV(csv, 'inventory.csv');
      showNotification('✅ Data exported ke CSV', 'success');
    }
  } catch (error) {
    showNotification(`❌ Export error: ${error.message}`, 'error');
  }
}

function convertToCSV(data) {
  const keys = Object.keys(data[0]);
  const header = keys.join(',');
  const rows = data.map(obj => 
    keys.map(key => `"${obj[key]}"`).join(',')
  );
  return [header, ...rows].join('\n');
}

function downloadCSV(csv, filename) {
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
}

/**
 * ╔═══════════════════════════════════════════════════════════════════╗
 * ║  PRICE MANAGEMENT                                                 ║
 * ╚═══════════════════════════════════════════════════════════════════╝
 */

async function updateBulkPrices(items) {
  try {
    for (const item of items) {
      await gmSync.update('sales_transactions', item.id, {
        price: item.newPrice,
        last_updated: new Date().toISOString()
      });
    }
    
    await loadInventoryData();
    showNotification(`✅ ${items.length} harga diupdate`, 'success');
  } catch (error) {
    showNotification(`❌ Error: ${error.message}`, 'error');
  }
}

async function applyPriceDiscount(percentage) {
  try {
    const data = await gmSync.read('sales_transactions', {
      filters: { table_name: 'dashboard_data' }
    });
    
    if (!data) return;

    for (const item of data) {
      const newPrice = Math.round(item.price * (1 - percentage / 100));
      await gmSync.update('sales_transactions', item.id, {
        price: newPrice,
        last_updated: new Date().toISOString()
      });
    }
    
    await loadInventoryData();
    showNotification(`✅ Diskon ${percentage}% diterapkan`, 'success');
  } catch (error) {
    showNotification(`❌ Error: ${error.message}`, 'error');
  }
}

/**
 * ╔═══════════════════════════════════════════════════════════════════╗
 * ║  EVENT LISTENERS & SYNC MANAGEMENT                                ║
 * ╚═══════════════════════════════════════════════════════════════════╝
 */

function setupDataListeners() {
  // Listen untuk sync complete
  document.addEventListener('gm2026-sync-complete', async (event) => {
    console.log(`✨ ${event.detail.count} items synced`);
    await loadInventoryData();
    showNotification(`✅ ${event.detail.count} perubahan tersinkronisasi`, 'info', 3000);
  });

  // Auto-sync setap 30 detik
  setInterval(async () => {
    if (navigator.onLine && gmSync) {
      await gmSync.forceSyncNow();
    }
  }, 30000);
}

/**
 * ╔═══════════════════════════════════════════════════════════════════╗
 * ║  UI UTILITIES                                                     ║
 * ╚═══════════════════════════════════════════════════════════════════╝
 */

function showNotification(message, type = 'info', duration = 4000) {
  const notif = document.createElement('div');
  notif.className = `notification notification-${type}`;
  notif.textContent = message;
  notif.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    padding: 12px 20px;
    border-radius: 8px;
    background: ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#3b82f6'};
    color: white;
    z-index: 9999;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  `;
  
  document.body.appendChild(notif);
  setTimeout(() => notif.remove(), duration);
}

function editInventoryModal(id) {
  const data = JSON.parse(localStorage.getItem('gm2026_inventory') || '[]');
  const item = data.find(d => d.id === id);
  
  if (!item) return;
  
  // Populate edit form
  document.getElementById('editProductName').value = item.product_name || '';
  document.getElementById('editQuantity').value = item.quantity || 0;
  document.getElementById('editPrice').value = item.price || 0;
  document.getElementById('editCategory').value = item.category || '';
}

/**
 * ╔═══════════════════════════════════════════════════════════════════╗
 * ║  EXPORT API                                                       ║
 * ╚═══════════════════════════════════════════════════════════════════╝
 */

if (typeof window !== 'undefined') {
  window.dashboardData = {
    loadInventoryData,
    addInventoryItem,
    updateInventoryItem,
    deleteInventoryItem,
    cleanupDuplicateData,
    organizeDataByCategory,
    exportDataToExcel,
    updateBulkPrices,
    applyPriceDiscount,
    showNotification,
    editInventoryModal
  };
}

// Initialize on load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initDashboardData);
} else {
  initDashboardData();
}
