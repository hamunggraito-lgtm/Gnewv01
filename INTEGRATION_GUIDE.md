# 🚀 GAMAS 2026 - Hybrid Architecture Integration Guide

## Overview
Arsitektur hybrid mengintegrasikan Supabase backend dengan client-side rendering yang sudah ada. Data disimpan di Supabase (server), dirender di browser (client), dan di-sync otomatis saat online.

---

## 📋 Langkah-langkah Integrasi

### 1. **Tambahkan Script di Header Setiap File**

Di setiap file HTML (`dashboard-kerja.html`, `dashboard-data.html`, `dashboard-laporan.html`), tambahkan di dalam `<head>` atau sebelum `</body>`:

```html
<!-- HYBRID SYNC ENGINE -->
<script src="supabase-client.js"></script>
```

### 2. **Modifikasi Struktur Data Lokal**

**SEBELUM** (localStorage mentah):
```javascript
localStorage.setItem('salesData', JSON.stringify(data));
```

**SESUDAH** (dengan hybrid sync):
```javascript
// Simpan lokal + queue untuk sync ke server
await gmSync.create('sales', data);
// atau update
await gmSync.update('sales', id, updatedData);
```

---

## 📊 Contoh: Dashboard Kerja Integration

### Pattern untuk simpan data:

**OLD WAY:**
```javascript
// Hanya simpan ke localStorage
const salesData = { id: 1, name: 'Product', price: 50000 };
localStorage.setItem('bankDataPenjualan', JSON.stringify([salesData]));
```

**NEW WAY (Hybrid):**
```javascript
// Hybrid: simpan lokal + queue untuk sync
const result = await gmSync.create('sales_transactions', {
  id: '1',
  name: 'Product',
  price: 50000,
  table_name: 'dashboard_kerja'
});

// Otomatis tersimpan di:
// ✓ localStorage (instant)
// ✓ Supabase (saat online, background sync)
```

### Pattern untuk baca data:

**OLD WAY:**
```javascript
const data = JSON.parse(localStorage.getItem('bankDataPenjualan') || '[]');
```

**NEW WAY (Hybrid):**
```javascript
// Baca dari server jika online, fallback ke local
const data = await gmSync.read('sales_transactions');
```

### Pattern untuk update data:

**OLD WAY:**
```javascript
const items = JSON.parse(localStorage.getItem('bankDataPenjualan') || '[]');
const updated = items.map(item => 
  item.id === id ? { ...item, ...changes } : item
);
localStorage.setItem('bankDataPenjualan', JSON.stringify(updated));
```

**NEW WAY (Hybrid):**
```javascript
// Single call, handles local + server
await gmSync.update('sales_transactions', id, changes);
```

### Pattern untuk hapus data:

**OLD WAY:**
```javascript
const items = JSON.parse(localStorage.getItem('bankDataPenjualan') || '[]');
const filtered = items.filter(item => item.id !== id);
localStorage.setItem('bankDataPenjualan', JSON.stringify(filtered));
```

**NEW WAY (Hybrid):**
```javascript
await gmSync.delete('sales_transactions', id);
```

---

## 🔄 Sync Status & Monitoring

### Tampilkan Status Sync di UI:

```javascript
// Di setiap dashboard, tambahkan sync indicator
function updateDashboardSyncStatus() {
  const status = gmSync.getSyncStatus();
  
  const indicator = document.getElementById('syncIndicator');
  indicator.innerHTML = `
    <div class="sync-badge ${status.isOnline ? 'online' : 'offline'}">
      ${status.isOnline ? '🟢 Online' : '🔴 Offline'}
      ${status.pendingOps > 0 ? `(${status.pendingOps} pending)` : ''}
    </div>
  `;
}

// Update setiap 2 detik
setInterval(updateDashboardSyncStatus, 2000);
```

### Listen untuk Sync Events:

```javascript
// Trigger action setelah data berhasil di-sync
document.addEventListener('gm2026-sync-complete', (event) => {
  console.log(`✅ ${event.detail.count} items synced to Supabase`);
  // Refresh UI, show toast notification, etc
  refreshDashboard();
});
```

---

## 🗄️ Supabase Tables Setup

Anda perlu buat 4 tables di Supabase (sesuaikan dengan schema SQL yang ada):

### Suggested Table Structure:

```sql
-- TABLE 1: Sales Transactions (untuk Dashboard Kerja & Data)
CREATE TABLE sales_transactions (
  id TEXT PRIMARY KEY,
  created_by TEXT,
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  table_name TEXT,
  
  -- Sales specific
  product_name TEXT,
  quantity INTEGER,
  price DECIMAL(12,2),
  total DECIMAL(12,2),
  payment_status TEXT,
  date DATE,
  notes TEXT,
  
  -- Sync metadata
  synced BOOLEAN DEFAULT false
);

-- TABLE 2: Cash Flow (untuk Dashboard Kerja)
CREATE TABLE cash_flow (
  id TEXT PRIMARY KEY,
  created_by TEXT,
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  
  amount DECIMAL(12,2),
  type TEXT, -- 'income' or 'expense'
  category TEXT,
  description TEXT,
  date DATE,
  
  synced BOOLEAN DEFAULT false
);

-- TABLE 3: Reports Data (untuk Dashboard Laporan)
CREATE TABLE reports (
  id TEXT PRIMARY KEY,
  created_by TEXT,
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  
  report_type TEXT,
  period TEXT,
  data JSONB,
  summary TEXT,
  
  synced BOOLEAN DEFAULT false
);

-- TABLE 4: System Logs (untuk tracking)
CREATE TABLE sync_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  operation TEXT,
  table_name TEXT,
  timestamp TIMESTAMP,
  status TEXT, -- 'success' or 'failed'
  details JSONB
);
```

---

## 📝 Migration Path

### Step 1: Setup Supabase Tables
```bash
# Jalankan SQL di Supabase dashboard (SQL Editor)
# Copy-paste table structures di atas
```

### Step 2: Update Dashboard Files
Untuk setiap dashboard, ikuti pattern di bawah:

#### **dashboard-kerja.html**
```javascript
// Di bagian load data:
async function loadSalesData() {
  // Replace: localStorage.getItem('bankDataPenjualan')
  // With:
  const data = await gmSync.read('sales_transactions', {
    filters: { table_name: 'dashboard_kerja' }
  });
  renderSalesTable(data);
}

// Di bagian save data:
async function saveSalesData(data) {
  // Replace: localStorage.setItem()
  // With:
  await gmSync.create('sales_transactions', {
    ...data,
    table_name: 'dashboard_kerja'
  });
  await loadSalesData(); // Refresh
}
```

#### **dashboard-data.html**
```javascript
// Similar pattern:
async function loadDataInventory() {
  const data = await gmSync.read('sales_transactions', {
    filters: { table_name: 'dashboard_data' }
  });
  renderDataTable(data);
}

async function saveDataInventory(items) {
  for (const item of items) {
    await gmSync.create('sales_transactions', {
      ...item,
      table_name: 'dashboard_data'
    });
  }
}
```

#### **dashboard-laporan.html**
```javascript
async function generateReport(period) {
  // Save report ke Supabase
  const report = await gmSync.create('reports', {
    report_type: 'sales_summary',
    period: period,
    data: calculateReportData(),
    summary: generateSummary()
  });
  
  return report;
}

async function loadReports() {
  const reports = await gmSync.read('reports', {
    filters: { report_type: 'sales_summary' }
  });
  renderReports(reports);
}
```

---

## 🔒 Security Notes

1. **API Key**: Saat ini menggunakan `publishable key` (read/write). Untuk production:
   - Buat Row-Level Security (RLS) policies di Supabase
   - Validasi user ID sebelum operation
   - Restrict akses per user/table

2. **Data Validation**: Selalu validasi di client sebelum sync
   ```javascript
   async function saveSalesWithValidation(data) {
     if (!data.product_name || !data.price) {
       console.error('Validation failed');
       return;
     }
     await gmSync.create('sales_transactions', data);
   }
   ```

3. **Conflict Resolution**: Default strategy adalah `last-write-wins`. Untuk critical data, override:
   ```javascript
   // Di supabase-client.js, ubah CONFLICT_RESOLUTION
   conflictResolution: 'server-wins' // server data digunakan
   ```

---

## 🧪 Testing Sync

### Test Offline Mode:
1. Buka DevTools (F12)
2. Tab "Network" → set offline
3. Buat/edit data di dashboard
4. Lihat di Console: pending operations akan di-queue
5. Set online kembali
6. Check Supabase → data akan tersync

### Test Real-time Sync:
1. Buka dashboard di 2 tab berbeda
2. Edit data di tab 1
3. Di tab 2, tunggu ~30 detik atau refresh
4. Data akan tampil dari server (real-time merge)

### Check Pending Ops:
```javascript
// Di browser console:
console.log(gmSync.pendingOps);
console.log(gmSync.getPendingCount());
console.log(gmSync.getSyncStatus());
```

---

## 📊 Monitoring & Debugging

### Enable Debug Logging:
```javascript
// Di supabase-client.js, uncomment logs:
console.log(`[Sync]`, ...);
console.log(`[Supabase]`, ...);
```

### Check Sync State:
```javascript
// Console:
gmSync.getSyncStatus()
// Output:
// {
//   isOnline: true,
//   isSyncing: false,
//   pendingOps: 0,
//   lastSync: "1234567890"
// }
```

### View Pending Operations:
```javascript
// Console:
gmSync.pendingOps
// Shows all pending operations yang belum di-sync
```

---

## 🎯 Next Steps

1. ✅ Setup Supabase tables (SQL di atas)
2. ✅ Add `supabase-client.js` ke setiap file
3. ✅ Update load/save functions dengan hybrid pattern
4. ✅ Test offline → online sync
5. ✅ Enable Row-Level Security (production)
6. ✅ Monitor sync logs via Supabase dashboard

---

## 📞 Quick Reference

```javascript
// Create/Insert
await gmSync.create('table_name', { data });

// Read/Select
const data = await gmSync.read('table_name', { filters });

// Update
await gmSync.update('table_name', id, { updates });

// Delete
await gmSync.delete('table_name', id);

// Check status
gmSync.getSyncStatus();

// Force sync now
await gmSync.forceSyncNow();

// Listen for sync events
document.addEventListener('gm2026-sync-complete', callback);
```

---

## 🚀 Performance Tips

1. **Batch Operations**: Sync multiple items sekaligus
   ```javascript
   for (const item of items) {
     await gmSync.create('sales', item);
   }
   // Better: queue sekaligus, sync batch
   ```

2. **Debounce Updates**: Jangan sync setiap keystroke
   ```javascript
   let debounceTimer;
   inputField.addEventListener('input', () => {
     clearTimeout(debounceTimer);
     debounceTimer = setTimeout(() => {
       gmSync.update('sales', id, { text: inputField.value });
     }, 500);
   });
   ```

3. **Selective Read**: Jangan load semua data
   ```javascript
   // Bad:
   const all = await gmSync.read('sales_transactions');
   
   // Good:
   const recent = await gmSync.read('sales_transactions', {
     filters: { date: 'today' },
     limit: 100
   });
   ```

---

**Status**: ✅ Ready to integrate
**Last Updated**: July 2026
**Version**: 1.0.0
