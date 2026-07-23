/**
 * ╔═══════════════════════════════════════════════════════════════════╗
 * ║  GAMAS 2026 - Dashboard Laporan - Hybrid Sync Implementation      ║
 * ║  Analytics, reporting, dan insights dengan real-time sync         ║
 * ╚═══════════════════════════════════════════════════════════════════╝
 */

let gmSync = null;
let reportCache = {};

async function initDashboardLaporan() {
  let attempts = 0;
  while (!window.gmSync && attempts < 50) {
    await new Promise(r => setTimeout(r, 100));
    attempts++;
  }
  gmSync = window.gmSync;
  
  console.log('✅ Dashboard Laporan initialized with hybrid sync');
  setupReportListeners();
  
  // Load initial reports
  await loadAllReports();
  await generateDashboardInsights();
}

/**
 * ╔═══════════════════════════════════════════════════════════════════╗
 * ║  REPORT GENERATION & LOADING                                      ║
 * ╚═══════════════════════════════════════════════════════════════════╝
 */

async function loadAllReports() {
  try {
    const reports = await gmSync.read('reports');
    
    if (reports && Array.isArray(reports)) {
      reportCache = {};
      reports.forEach(report => {
        reportCache[report.id] = report;
      });
    }
    
    renderReportsList();
    return reports;
  } catch (error) {
    console.error('❌ Gagal load reports:', error);
    return [];
  }
}

async function generateSalesReport(period = 'monthly') {
  try {
    // Load sales data
    const salesData = await gmSync.read('sales_transactions', {
      filters: { table_name: 'dashboard_kerja' }
    });

    if (!salesData || salesData.length === 0) {
      showNotification('❌ Tidak ada data penjualan', 'error');
      return;
    }

    // Calculate report
    const report = {
      id: `report_sales_${Date.now()}`,
      report_type: 'sales_summary',
      period: period,
      generated_at: new Date().toISOString(),
      created_by: gmSync.userId,
      
      summary: {
        total_sales: 0,
        total_transactions: 0,
        total_items: 0,
        average_transaction: 0,
        top_products: []
      },
      
      data: null
    };

    // Aggregate data
    let totalSales = 0;
    let totalItems = 0;
    const productMap = new Map();

    salesData.forEach(sale => {
      totalSales += (sale.total || 0);
      totalItems += (sale.quantity || 1);
      
      const productName = sale.product_name || 'Unknown';
      if (!productMap.has(productName)) {
        productMap.set(productName, { name: productName, count: 0, total: 0 });
      }
      
      const prod = productMap.get(productName);
      prod.count += (sale.quantity || 1);
      prod.total += (sale.total || 0);
    });

    // Get top 5 products
    const topProducts = Array.from(productMap.values())
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);

    report.summary.total_sales = totalSales;
    report.summary.total_transactions = salesData.length;
    report.summary.total_items = totalItems;
    report.summary.average_transaction = salesData.length > 0 ? totalSales / salesData.length : 0;
    report.summary.top_products = topProducts;
    report.data = salesData;

    // Save report dengan hybrid sync
    const result = await gmSync.create('reports', report);
    
    reportCache[report.id] = report;
    renderReportsList();
    
    showNotification(`✅ Laporan penjualan (${period}) dibuat`, 'success');
    return report;
  } catch (error) {
    showNotification(`❌ Error: ${error.message}`, 'error');
  }
}

async function generateCashFlowReport(period = 'monthly') {
  try {
    const cashData = await gmSync.read('cash_flow', {
      filters: { table_name: 'dashboard_kerja' }
    });

    if (!cashData || cashData.length === 0) {
      showNotification('❌ Tidak ada data arus kas', 'error');
      return;
    }

    const report = {
      id: `report_cash_${Date.now()}`,
      report_type: 'cash_flow_summary',
      period: period,
      generated_at: new Date().toISOString(),
      created_by: gmSync.userId,
      
      summary: {
        total_income: 0,
        total_expense: 0,
        net_cash_flow: 0,
        income_categories: {},
        expense_categories: {}
      },
      
      data: null
    };

    let totalIncome = 0;
    let totalExpense = 0;
    const incomeMap = new Map();
    const expenseMap = new Map();

    cashData.forEach(cash => {
      if (cash.type === 'income') {
        totalIncome += (cash.amount || 0);
        const cat = cash.category || 'Other Income';
        incomeMap.set(cat, (incomeMap.get(cat) || 0) + cash.amount);
      } else {
        totalExpense += (cash.amount || 0);
        const cat = cash.category || 'Other Expense';
        expenseMap.set(cat, (expenseMap.get(cat) || 0) + cash.amount);
      }
    });

    report.summary.total_income = totalIncome;
    report.summary.total_expense = totalExpense;
    report.summary.net_cash_flow = totalIncome - totalExpense;
    report.summary.income_categories = Object.fromEntries(incomeMap);
    report.summary.expense_categories = Object.fromEntries(expenseMap);
    report.data = cashData;

    const result = await gmSync.create('reports', report);
    
    reportCache[report.id] = report;
    renderReportsList();
    
    showNotification(`✅ Laporan arus kas (${period}) dibuat`, 'success');
    return report;
  } catch (error) {
    showNotification(`❌ Error: ${error.message}`, 'error');
  }
}

async function generateInventoryReport() {
  try {
    const invData = await gmSync.read('sales_transactions', {
      filters: { table_name: 'dashboard_data' }
    });

    if (!invData || invData.length === 0) {
      showNotification('❌ Tidak ada data inventory', 'error');
      return;
    }

    const report = {
      id: `report_inventory_${Date.now()}`,
      report_type: 'inventory_status',
      period: new Date().toISOString().split('T')[0],
      generated_at: new Date().toISOString(),
      created_by: gmSync.userId,
      
      summary: {
        total_items: 0,
        total_value: 0,
        low_stock_items: 0,
        out_of_stock: 0,
        average_stock_value: 0,
        value_per_category: {}
      },
      
      data: null
    };

    let totalValue = 0;
    let lowStock = 0;
    let outOfStock = 0;
    const categoryMap = new Map();

    invData.forEach(inv => {
      if (inv.quantity <= 0) {
        outOfStock++;
      } else if (inv.quantity < 10) {
        lowStock++;
      }
      
      totalValue += (inv.stock_value || 0);
      
      const cat = inv.category || 'Uncategorized';
      categoryMap.set(cat, (categoryMap.get(cat) || 0) + inv.stock_value);
    });

    report.summary.total_items = invData.length;
    report.summary.total_value = totalValue;
    report.summary.low_stock_items = lowStock;
    report.summary.out_of_stock = outOfStock;
    report.summary.average_stock_value = invData.length > 0 ? totalValue / invData.length : 0;
    report.summary.value_per_category = Object.fromEntries(categoryMap);
    report.data = invData;

    await gmSync.create('reports', report);
    
    reportCache[report.id] = report;
    renderReportsList();
    
    showNotification('✅ Laporan inventory dibuat', 'success');
    return report;
  } catch (error) {
    showNotification(`❌ Error: ${error.message}`, 'error');
  }
}

/**
 * ╔═══════════════════════════════════════════════════════════════════╗
 * ║  DASHBOARD INSIGHTS & ANALYTICS                                   ║
 * ╚═══════════════════════════════════════════════════════════════════╝
 */

async function generateDashboardInsights() {
  try {
    const [sales, cash, inventory] = await Promise.all([
      gmSync.read('sales_transactions', { filters: { table_name: 'dashboard_kerja' } }),
      gmSync.read('cash_flow', { filters: { table_name: 'dashboard_kerja' } }),
      gmSync.read('sales_transactions', { filters: { table_name: 'dashboard_data' } })
    ]);

    const insights = {
      kpi: {
        total_revenue: 0,
        total_transactions: 0,
        net_cash_flow: 0,
        inventory_value: 0
      },
      trends: {},
      alerts: []
    };

    // Calculate KPIs
    if (sales && sales.length > 0) {
      insights.kpi.total_revenue = sales.reduce((sum, s) => sum + (s.total || 0), 0);
      insights.kpi.total_transactions = sales.length;
    }

    if (cash && cash.length > 0) {
      const income = cash.filter(c => c.type === 'income').reduce((sum, c) => sum + c.amount, 0);
      const expense = cash.filter(c => c.type === 'expense').reduce((sum, c) => sum + c.amount, 0);
      insights.kpi.net_cash_flow = income - expense;
    }

    if (inventory && inventory.length > 0) {
      insights.kpi.inventory_value = inventory.reduce((sum, i) => sum + (i.stock_value || 0), 0);
    }

    // Generate alerts
    if (inventory && inventory.length > 0) {
      const lowStockItems = inventory.filter(i => i.quantity < 10);
      if (lowStockItems.length > 0) {
        insights.alerts.push({
          type: 'warning',
          message: `⚠️ ${lowStockItems.length} item stok rendah`
        });
      }

      const outOfStock = inventory.filter(i => i.quantity <= 0);
      if (outOfStock.length > 0) {
        insights.alerts.push({
          type: 'critical',
          message: `🚨 ${outOfStock.length} item habis`
        });
      }
    }

    // Render insights
    renderDashboardInsights(insights);
    return insights;
  } catch (error) {
    console.error('❌ Error generating insights:', error);
  }
}

function renderDashboardInsights(insights) {
  const container = document.getElementById('dashboardInsights');
  if (!container) return;

  container.innerHTML = `
    <div class="insights-kpi">
      <div class="kpi-card">
        <div class="kpi-label">Total Revenue</div>
        <div class="kpi-value">Rp${insights.kpi.total_revenue.toLocaleString('id')}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Transactions</div>
        <div class="kpi-value">${insights.kpi.total_transactions}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Net Cash Flow</div>
        <div class="kpi-value" style="color: ${insights.kpi.net_cash_flow >= 0 ? '#10b981' : '#ef4444'};">
          Rp${insights.kpi.net_cash_flow.toLocaleString('id')}
        </div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Inventory Value</div>
        <div class="kpi-value">Rp${insights.kpi.inventory_value.toLocaleString('id')}</div>
      </div>
    </div>
    
    ${insights.alerts.length > 0 ? `
      <div class="insights-alerts">
        ${insights.alerts.map(alert => `
          <div class="alert alert-${alert.type}">
            ${alert.message}
          </div>
        `).join('')}
      </div>
    ` : ''}
  `;
}

/**
 * ╔═══════════════════════════════════════════════════════════════════╗
 * ║  REPORT DISPLAY & EXPORT                                          ║
 * ╚═══════════════════════════════════════════════════════════════════╝
 */

function renderReportsList() {
  const container = document.getElementById('reportsList') || 
                   document.querySelector('[data-element="reports-list"]');
  if (!container) return;

  const reports = Object.values(reportCache);
  
  if (reports.length === 0) {
    container.innerHTML = '<p>Belum ada laporan. Buat laporan terlebih dahulu.</p>';
    return;
  }

  container.innerHTML = reports.map(report => `
    <div class="report-card">
      <div class="report-header">
        <h3>${getReportTitle(report.report_type)}</h3>
        <span class="report-date">${new Date(report.generated_at).toLocaleDateString('id')}</span>
      </div>
      
      <div class="report-summary">
        ${renderReportSummary(report)}
      </div>
      
      <div class="report-actions">
        <button onclick="dashboardLaporan.viewReport('${report.id}')" class="btn-sm">Lihat Detail</button>
        <button onclick="dashboardLaporan.exportReport('${report.id}')" class="btn-sm">Export</button>
        <button onclick="dashboardLaporan.deleteReport('${report.id}')" class="btn-sm btn-danger">Hapus</button>
      </div>
    </div>
  `).join('');
}

function renderReportSummary(report) {
  if (!report.summary) return '';

  let html = '';
  
  if (report.report_type === 'sales_summary') {
    html = `
      <div class="summary-item">
        <span>Total Penjualan:</span>
        <strong>Rp${report.summary.total_sales.toLocaleString('id')}</strong>
      </div>
      <div class="summary-item">
        <span>Transaksi:</span>
        <strong>${report.summary.total_transactions}</strong>
      </div>
      <div class="summary-item">
        <span>Rata-rata:</span>
        <strong>Rp${Math.round(report.summary.average_transaction).toLocaleString('id')}</strong>
      </div>
    `;
  } else if (report.report_type === 'cash_flow_summary') {
    html = `
      <div class="summary-item">
        <span>Pemasukan:</span>
        <strong style="color: #10b981;">Rp${report.summary.total_income.toLocaleString('id')}</strong>
      </div>
      <div class="summary-item">
        <span>Pengeluaran:</span>
        <strong style="color: #ef4444;">Rp${report.summary.total_expense.toLocaleString('id')}</strong>
      </div>
      <div class="summary-item">
        <span>Net:</span>
        <strong style="color: ${report.summary.net_cash_flow >= 0 ? '#10b981' : '#ef4444'};">
          Rp${report.summary.net_cash_flow.toLocaleString('id')}
        </strong>
      </div>
    `;
  } else if (report.report_type === 'inventory_status') {
    html = `
      <div class="summary-item">
        <span>Total Items:</span>
        <strong>${report.summary.total_items}</strong>
      </div>
      <div class="summary-item">
        <span>Total Value:</span>
        <strong>Rp${report.summary.total_value.toLocaleString('id')}</strong>
      </div>
      <div class="summary-item">
        <span>Low Stock:</span>
        <strong style="color: #d97706;">${report.summary.low_stock_items}</strong>
      </div>
    `;
  }
  
  return html;
}

function getReportTitle(type) {
  const titles = {
    'sales_summary': '📊 Laporan Penjualan',
    'cash_flow_summary': '💰 Laporan Arus Kas',
    'inventory_status': '📦 Status Inventory'
  };
  return titles[type] || 'Laporan';
}

async function viewReport(reportId) {
  const report = reportCache[reportId];
  if (!report) {
    showNotification('❌ Laporan tidak ditemukan', 'error');
    return;
  }

  // Open modal atau page baru dengan detail laporan
  const modal = document.getElementById('reportDetailModal') || createReportModal();
  modal.innerHTML = `
    <div class="modal-content" style="max-width: 900px;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
        <h2>${getReportTitle(report.report_type)}</h2>
        <button onclick="this.parentElement.parentElement.parentElement.style.display='none'" class="btn-close">✕</button>
      </div>
      
      <div style="margin-bottom: 20px;">
        <p><strong>Generated:</strong> ${new Date(report.generated_at).toLocaleString('id')}</p>
        <p><strong>Period:</strong> ${report.period}</p>
      </div>
      
      <div id="reportDetailContent">
        ${JSON.stringify(report.summary, null, 2)}
      </div>
      
      <div style="margin-top: 20px;">
        <button onclick="dashboardLaporan.exportReport('${report.id}')" class="btn">📥 Export</button>
        <button onclick="this.parentElement.parentElement.parentElement.style.display='none'" class="btn">✕ Tutup</button>
      </div>
    </div>
  `;
  
  modal.style.display = 'flex';
}

async function exportReport(reportId) {
  const report = reportCache[reportId];
  if (!report) return;

  try {
    const dataStr = JSON.stringify(report, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${report.report_type}_${report.period}.json`;
    a.click();
    
    showNotification('✅ Laporan exported', 'success');
  } catch (error) {
    showNotification(`❌ Export error: ${error.message}`, 'error');
  }
}

async function deleteReport(reportId) {
  if (!confirm('Hapus laporan ini?')) return;

  try {
    await gmSync.delete('reports', reportId);
    delete reportCache[reportId];
    renderReportsList();
    showNotification('✅ Laporan dihapus', 'success');
  } catch (error) {
    showNotification(`❌ Error: ${error.message}`, 'error');
  }
}

/**
 * ╔═══════════════════════════════════════════════════════════════════╗
 * ║  EVENT LISTENERS & UTILITIES                                      ║
 * ╚═══════════════════════════════════════════════════════════════════╝
 */

function setupReportListeners() {
  document.addEventListener('gm2026-sync-complete', async (event) => {
    await loadAllReports();
    await generateDashboardInsights();
  });
}

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

function createReportModal() {
  const modal = document.createElement('div');
  modal.id = 'reportDetailModal';
  modal.style.cssText = `
    display: none;
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.5);
    align-items: center;
    justify-content: center;
    z-index: 1000;
  `;
  document.body.appendChild(modal);
  return modal;
}

/**
 * ╔═══════════════════════════════════════════════════════════════════╗
 * ║  EXPORT API                                                       ║
 * ╚═══════════════════════════════════════════════════════════════════╝
 */

if (typeof window !== 'undefined') {
  window.dashboardLaporan = {
    loadAllReports,
    generateSalesReport,
    generateCashFlowReport,
    generateInventoryReport,
    generateDashboardInsights,
    viewReport,
    exportReport,
    deleteReport,
    showNotification
  };
}

// Initialize on load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initDashboardLaporan);
} else {
  initDashboardLaporan();
}
