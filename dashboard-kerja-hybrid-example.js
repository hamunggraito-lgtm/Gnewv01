/**
 * ╔═══════════════════════════════════════════════════════════════════╗
 * ║  GAMAS 2026 - Dashboard Kerja - Hybrid Sync Implementation        ║
 * ║  Copy fungsi-fungsi ini ke dalam dashboard-kerja.html             ║
 * ╚═══════════════════════════════════════════════════════════════════╝
 */

// ─── INITIALIZATION ───
let gmSync = null;

async function initDashboardKerja() {
  // Wait for gmSync to be ready (dari supabase-client.js)
  let attempts = 0;
  while (!window.gmSync && attempts < 50) {
    await new Promise(r => setTimeout(r, 100));
    attempts++;
  }
  gmSync = window.gmSync;
  
  if (!gmSync) {
    console.error('❌ Hybrid sync engine tidak loaded');
    return;
  }

  console.log('✅ Dashboard Kerja initialized with hybrid sync');
  
  // Setup listeners
  setupSyncListeners();
  setupAutoSync();
  
  // Load initial data
  await loadAllData();
}

/**
 * ╔═══════════════════════════════════════════════════════════════════╗
 * ║  DATA MANAGEMENT - Sales/Penjualan                                ║
 * ╚═══════════════════════════════════════════════════════════════════╝
 */

async function loadSalesData() {
  try {
    // Read dari server/local hybrid storage
    const data = await gmSync.read('sales_transactions', {
      filters: { table_name: 'dashboard_kerja' }
    });
    
    // Render ke UI
    renderSalesTable(data || []);
    
    // Update UI stats
    updateSalesStats(data);
    
    return data;
  } catch (error) {
    console.error('❌ Gagal load sales data:', error);
    // Fallback ke localStorage
    const fallback = JSON.parse(localStorage.getItem('gm2026_sales_kerja') || '[]');
    renderSalesTable(fallback);
    return fallback;
  }
}

async function saveSalesTransaction(transaction) {
  try {
    if (!transaction.id) {
      transaction.id = `sales_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    // Validate
    if (!transaction.product_name || !transaction.price) {
      throw new Error('Product name dan price wajib diisi');
    }

    // Calculate total
    transaction.total = (transaction.quantity || 1) * transaction.price;
    transaction.table_name = 'dashboard_kerja';
    
    // Save hybrid: local + queue server sync
    const result = await gmSync.create('sales_transactions', transaction);
    
    // Refresh UI
    await loadSalesData();
    
    // Notification
    showNotification(`✅ Penjualan "${transaction.product_name}" tercatat`, 'success');
    
    return result;
  } catch (error) {
    showNotification(`❌ Error: ${error.message}`, 'error');
    console.error('❌ Save sales error:', error);
  }
}

async function updateSalesTransaction(id, updates) {
  try {
    // Update hybrid
    const result = await gmSync.update('sales_transactions', id, updates);
    
    // Refresh
    await loadSalesData();
    
    showNotification('✅ Data penjualan diperbarui', 'success');
    return result;
  } catch (error) {
    showNotification(`❌ Error: ${error.message}`, 'error');
  }
}

async function deleteSalesTransaction(id) {
  if (!confirm('Hapus transaksi ini?')) return;
  
  try {
    await gmSync.delete('sales_transactions', id);
    await loadSalesData();
    showNotification('✅ Transaksi dihapus', 'success');
  } catch (error) {
    showNotification(`❌ Error: ${error.message}`, 'error');
  }
}

function renderSalesTable(data) {
  const table = document.getElementById('salesTable') || document.querySelector('[data-table="sales"]');
  if (!table) return;
  
  table.innerHTML = '';
  
  if (!data || data.length === 0) {
    table.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:20px;">Tidak ada data penjualan</td></tr>';
    return;
  }
  
  data.forEach(row => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${row.date || new Date().toLocaleDateString('id')}</td>
      <td>${row.product_name || '-'}</td>
      <td>${row.quantity || 1}</td>
      <td>Rp${(row.price || 0).toLocaleString('id')}</td>
      <td>Rp${(row.total || 0).toLocaleString('id')}</td>
      <td><span class="status ${row.payment_status || 'pending'}">${row.payment_status || 'Pending'}</span></td>
      <td>
        <button onclick="editSalesModal('${row.id}')" class="btn-sm">Edit</button>
        <button onclick="deleteSalesTransaction('${row.id}')" class="btn-sm btn-danger">Hapus</button>
      </td>
    `;
    table.appendChild(tr);
  });
}

function updateSalesStats(data) {
  if (!data || !Array.isArray(data)) return;
  
  const totalSales = data.reduce((sum, d) => sum + (d.total || 0), 0);
  const totalTransactions = data.length;
  const pendingPayment = data.filter(d => d.payment_status === 'pending').length;
  
  const statsEl = document.getElementById('salesStats');
  if (statsEl) {
    statsEl.innerHTML = `
      <div class="stat-item">
        <div class="stat-label">Total Penjualan</div>
        <div class="stat-value">Rp${totalSales.toLocaleString('id')}</div>
      </div>
      <div class="stat-item">
        <div class="stat-label">Transaksi</div>
        <div class="stat-value">${totalTransactions}</div>
      </div>
      <div class="stat-item">
        <div class="stat-label">Pending</div>
        <div class="stat-value" style="color: #d97706;">${pendingPayment}</div>
      </div>
    `;
  }
}

/**
 * ╔═══════════════════════════════════════════════════════════════════╗
 * ║  DATA MANAGEMENT - Cash Flow                                      ║
 * ╚═══════════════════════════════════════════════════════════════════╝
 */

async function loadCashFlowData() {
  try {
    const data = await gmSync.read('cash_flow', {
      filters: { table_name: 'dashboard_kerja' }
    });
    
    renderCashFlowTable(data || []);
    updateCashFlowStats(data);
    
    return data;
  } catch (error) {
    console.error('❌ Gagal load cash flow:', error);
    const fallback = JSON.parse(localStorage.getItem('gm2026_cash_kerja') || '[]');
    renderCashFlowTable(fallback);
    return fallback;
  }
}

async function saveCashFlowTransaction(transaction) {
  try {
    if (!transaction.id) {
      transaction.id = `cash_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    if (!transaction.amount || !transaction.type) {
      throw new Error('Amount dan type wajib diisi');
    }

    transaction.table_name = 'dashboard_kerja';
    
    const result = await gmSync.create('cash_flow', transaction);
    await loadCashFlowData();
    
    showNotification(`✅ ${transaction.type === 'income' ? 'Pemasukan' : 'Pengeluaran'} tercatat`, 'success');
    return result;
  } catch (error) {
    showNotification(`❌ Error: ${error.message}`, 'error');
  }
}

async function updateCashFlowTransaction(id, updates) {
  try {
    await gmSync.update('cash_flow', id, updates);
    await loadCashFlowData();
    showNotification('✅ Arus kas diperbarui', 'success');
  } catch (error) {
    showNotification(`❌ Error: ${error.message}`, 'error');
  }
}

async function deleteCashFlowTransaction(id) {
  if (!confirm('Hapus transaksi arus kas?')) return;
  
  try {
    await gmSync.delete('cash_flow', id);
    await loadCashFlowData();
    showNotification('✅ Transaksi dihapus', 'success');
  } catch (error) {
    showNotification(`❌ Error: ${error.message}`, 'error');
  }
}

function renderCashFlowTable(data) {
  const table = document.getElementById('cashFlowTable') || document.querySelector('[data-table="cashflow"]');
  if (!table) return;
  
  table.innerHTML = '';
  
  if (!data || data.length === 0) {
    table.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px;">Tidak ada transaksi</td></tr>';
    return;
  }
  
  data.forEach(row => {
    const tr = document.createElement('tr');
    const isIncome = row.type === 'income';
    const amountClass = isIncome ? 'text-green-600' : 'text-red-600';
    const amountSign = isIncome ? '+' : '-';
    
    tr.innerHTML = `
      <td>${row.date || new Date().toLocaleDateString('id')}</td>
      <td>${isIncome ? '📥 Pemasukan' : '📤 Pengeluaran'}</td>
      <td>${row.category || '-'}</td>
      <td class="${amountClass}">${amountSign}Rp${Math.abs(row.amount).toLocaleString('id')}</td>
      <td>${row.description || '-'}</td>
      <td>
        <button onclick="editCashFlowModal('${row.id}')" class="btn-sm">Edit</button>
        <button onclick="deleteCashFlowTransaction('${row.id}')" class="btn-sm btn-danger">Hapus</button>
      </td>
    `;
    table.appendChild(tr);
  });
}

function updateCashFlowStats(data) {
  if (!data || !Array.isArray(data)) return;
  
  const income = data.filter(d => d.type === 'income').reduce((sum, d) => sum + (d.amount || 0), 0);
  const expense = data.filter(d => d.type === 'expense').reduce((sum, d) => sum + (d.amount || 0), 0);
  const net = income - expense;
  
  const statsEl = document.getElementById('cashStats');
  if (statsEl) {
    statsEl.innerHTML = `
      <div class="stat-item">
        <div class="stat-label">Pemasukan</div>
        <div class="stat-value" style="color: #10b981;">Rp${income.toLocaleString('id')}</div>
      </div>
      <div class="stat-item">
        <div class="stat-label">Pengeluaran</div>
        <div class="stat-value" style="color: #ef4444;">Rp${expense.toLocaleString('id')}</div>
      </div>
      <div class="stat-item">
        <div class="stat-label">Net</div>
        <div class="stat-value" style="color: ${net >= 0 ? '#10b981' : '#ef4444'};">
          Rp${net.toLocaleString('id')}
        </div>
      </div>
    `;
  }
}

/**
 * ╔═══════════════════════════════════════════════════════════════════╗
 * ║  SYNC MANAGEMENT                                                  ║
 * ╚═══════════════════════════════════════════════════════════════════╝
 */

function setupSyncListeners() {
  // Listen untuk sync complete event
  document.addEventListener('gm2026-sync-complete', async (event) => {
    console.log(`✨ ${event.detail.count} items synced`);
    // Refresh data ketika sync selesai
    await loadAllData();
    showNotification(`✅ ${event.detail.count} perubahan tersinkronisasi ke Supabase`, 'info', 3000);
  });
}

function setupAutoSync() {
  // Update sync status indicator setiap 2 detik
  setInterval(updateSyncIndicator, 2000);
  
  // Force sync ketika tab menjadi active
  document.addEventListener('visibilitychange', async () => {
    if (!document.hidden && navigator.onLine) {
      console.log('✨ Tab active - force sync');
      await gmSync.forceSyncNow();
    }
  });
}

function updateSyncIndicator() {
  if (!gmSync) return;
  
  const status = gmSync.getSyncStatus();
  const indicator = document.getElementById('syncIndicator') || 
                   document.querySelector('[data-element="sync-status"]');
  
  if (!indicator) return;
  
  let statusText = '';
  let statusClass = '';
  
  if (status.isOnline) {
    statusClass = 'online';
    if (status.isSyncing) {
      statusText = '🔄 Syncing...';
    } else if (status.pendingOps > 0) {
      statusText = `📦 ${status.pendingOps} pending`;
    } else {
      statusText = '✅ Synced';
    }
  } else {
    statusClass = 'offline';
    statusText = '🔴 Offline';
  }
  
  indicator.innerHTML = `
    <div class="sync-badge ${statusClass}">
      ${statusText}
    </div>
  `;
}

async function loadAllData() {
  try {
    await Promise.all([
      loadSalesData(),
      loadCashFlowData()
    ]);
  } catch (error) {
    console.error('❌ Error loading all data:', error);
  }
}

async function manualSyncNow() {
  if (!gmSync) {
    showNotification('❌ Sync engine not ready', 'error');
    return;
  }
  
  const btn = document.getElementById('btnSyncNow');
  if (btn) btn.disabled = true;
  
  try {
    const result = await gmSync.forceSyncNow();
    showNotification(`✅ Sync complete: ${result.successOps.length} synced`, 'success');
    await loadAllData();
  } catch (error) {
    showNotification(`❌ Sync error: ${error.message}`, 'error');
  } finally {
    if (btn) btn.disabled = false;
  }
}

/**
 * ╔═══════════════════════════════════════════════════════════════════╗
 * ║  UI UTILITIES                                                     ║
 * ╚═══════════════════════════════════════════════════════════════════╝
 */

function showNotification(message, type = 'info', duration = 4000) {
  // Create notification element
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
    font-size: 14px;
    z-index: 9999;
    animation: slideIn 0.3s ease;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  `;
  
  document.body.appendChild(notif);
  
  setTimeout(() => {
    notif.style.animation = 'slideOut 0.3s ease';
    setTimeout(() => notif.remove(), 300);
  }, duration);
}

function editSalesModal(id) {
  // Find data
  const salesData = JSON.parse(localStorage.getItem('gm2026_sales_kerja') || '[]');
  const item = salesData.find(d => d.id === id);
  
  if (!item) {
    showNotification('❌ Data tidak ditemukan', 'error');
    return;
  }
  
  // Show modal atau form
  const modal = document.getElementById('salesModal') || createSalesModal();
  modal.dataset.id = id;
  
  // Populate form
  document.getElementById('editProductName').value = item.product_name || '';
  document.getElementById('editQuantity').value = item.quantity || 1;
  document.getElementById('editPrice').value = item.price || 0;
  document.getElementById('editPaymentStatus').value = item.payment_status || 'pending';
  
  modal.style.display = 'flex';
}

function editCashFlowModal(id) {
  const cashData = JSON.parse(localStorage.getItem('gm2026_cash_kerja') || '[]');
  const item = cashData.find(d => d.id === id);
  
  if (!item) {
    showNotification('❌ Data tidak ditemukan', 'error');
    return;
  }
  
  const modal = document.getElementById('cashFlowModal') || createCashFlowModal();
  modal.dataset.id = id;
  
  document.getElementById('editCashAmount').value = Math.abs(item.amount) || 0;
  document.getElementById('editCashType').value = item.type || 'income';
  document.getElementById('editCashCategory').value = item.category || '';
  document.getElementById('editCashDescription').value = item.description || '';
  
  modal.style.display = 'flex';
}

/**
 * ╔═══════════════════════════════════════════════════════════════════╗
 * ║  INITIALIZATION ON PAGE LOAD                                      ║
 * ╚═══════════════════════════════════════════════════════════════════╝
 */

// Call this function saat halaman selesai loading
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initDashboardKerja);
} else {
  initDashboardKerja();
}

// Export functions untuk digunakan di HTML
if (typeof window !== 'undefined') {
  window.dashboardKerja = {
    loadAllData,
    loadSalesData,
    loadCashFlowData,
    saveSalesTransaction,
    updateSalesTransaction,
    deleteSalesTransaction,
    saveCashFlowTransaction,
    updateCashFlowTransaction,
    deleteCashFlowTransaction,
    manualSyncNow,
    showNotification,
    editSalesModal,
    editCashFlowModal
  };
}
