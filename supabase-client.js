/**
 * ╔═══════════════════════════════════════════════════════════════════╗
 * ║  GAMAS 2026 - SUPABASE HYBRID SYNC ENGINE                         ║
 * ║  Client-side persistence + server-side backend                    ║
 * ╚═══════════════════════════════════════════════════════════════════╝
 */

// ─── SUPABASE CONFIGURATION ───
const SUPABASE_URL = 'https://ydfqjnvgpbacfbtvjjky.supabase.co';
const SUPABASE_KEY = 'sb_publishable_55hSfDK18amzKhGpSMLqcQ_DwcYas57';

// ─── HYBRID SYNC CONFIG ───
const SYNC_CONFIG = {
  autoSyncInterval: 30000,        // 30 detik - sync otomatis
  maxOfflineQueue: 500,            // max pending operations
  conflictResolution: 'last-write', // strategy: last-write atau server-wins
  enableRealtime: true             // enable real-time listeners
};

// ─── STORAGE KEYS ───
const STORAGE_KEYS = {
  PENDING_OPS: 'gm2026_pendingOps',      // operasi offline
  SYNC_STATE: 'gm2026_syncState',        // last sync timestamp
  USER_ID: 'gm2026_userId',              // current user
  CONFLICT_LOG: 'gm2026_conflicts'       // log konflik
};

/**
 * ╔═══════════════════════════════════════════════════════════════════╗
 * ║  1. SUPABASE CLIENT WRAPPER                                       ║
 * ╚═══════════════════════════════════════════════════════════════════╝
 */
class SupabaseClient {
  constructor() {
    this.url = SUPABASE_URL;
    this.key = SUPABASE_KEY;
    this.headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.key}`,
      'apikey': this.key
    };
  }

  async request(method, table, options = {}) {
    try {
      const url = new URL(`${this.url}/rest/v1/${table}`, this.url);
      
      // Build query params
      if (options.select) url.searchParams.append('select', options.select);
      if (options.eq) Object.entries(options.eq).forEach(([k, v]) => 
        url.searchParams.append(`${k}=eq.${v}`)
      );
      if (options.filters) {
        Object.entries(options.filters).forEach(([k, v]) => 
          url.searchParams.append(`${k}=eq.${v}`)
        );
      }
      if (options.limit) url.searchParams.append('limit', options.limit);
      if (options.offset) url.searchParams.append('offset', options.offset);
      if (options.order) url.searchParams.append('order', options.order);

      const response = await fetch(url.toString(), {
        method,
        headers: this.headers,
        body: method !== 'GET' && method !== 'HEAD' ? JSON.stringify(options.data) : undefined
      });

      if (!response.ok) {
        throw new Error(`Supabase error: ${response.status} - ${await response.text()}`);
      }

      return method === 'DELETE' ? { success: true } : await response.json();
    } catch (error) {
      console.error(`[Supabase] ${method} ${table}:`, error);
      return null;
    }
  }

  async select(table, options = {}) {
    return this.request('GET', table, options);
  }

  async insert(table, data) {
    return this.request('POST', table, { data });
  }

  async update(table, data, filters) {
    return this.request('PATCH', table, { data, filters });
  }

  async delete(table, filters) {
    return this.request('DELETE', table, { filters });
  }

  subscribeRealtime(table, callback) {
    if (!SYNC_CONFIG.enableRealtime) return;
    
    const wsUrl = `${SUPABASE_URL.replace('https', 'wss')}/realtime/v1`;
    // Implement WebSocket logic jika diperlukan
    console.log(`[Supabase] Real-time listener untuk ${table}`);
  }
}

/**
 * ╔═══════════════════════════════════════════════════════════════════╗
 * ║  2. HYBRID SYNC MANAGER                                           ║
 * ╚═══════════════════════════════════════════════════════════════════╝
 */
class HybridSyncManager {
  constructor() {
    this.supabase = new SupabaseClient();
    this.pendingOps = this.loadPendingOps();
    this.isSyncing = false;
    this.userId = this.getCurrentUserId();
    
    this.setupEventListeners();
    this.startAutoSync();
  }

  getCurrentUserId() {
    // Fallback sementara (dipakai sebelum Supabase Auth session tersedia).
    // Setelah login berhasil, index.html akan menimpa gmSync.userId dan
    // localStorage key ini dengan UID asli dari Supabase Auth (auth.uid()),
    // supaya kolom created_by konsisten dengan RLS policy berbasis auth.uid().
    let uid = localStorage.getItem(STORAGE_KEYS.USER_ID);
    if (!uid) {
      uid = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      localStorage.setItem(STORAGE_KEYS.USER_ID, uid);
    }
    return uid;
  }

  setupEventListeners() {
    // Sync ketika online
    window.addEventListener('online', () => {
      console.log('[Sync] 🟢 Online - mulai sinkronisasi');
      this.syncPendingOps();
    });

    // Pause ketika offline
    window.addEventListener('offline', () => {
      console.log('[Sync] 🔴 Offline - queue pending operations');
    });

    // Sync saat halaman di-focus
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && navigator.onLine) {
        console.log('[Sync] ✨ Tab active - sinkronisasi');
        this.syncPendingOps();
      }
    });
  }

  startAutoSync() {
    setInterval(() => {
      if (navigator.onLine && !this.isSyncing) {
        this.syncPendingOps();
      }
    }, SYNC_CONFIG.autoSyncInterval);
  }

  // ─── PENDING OPERATIONS QUEUE ───
  queueOperation(table, operation, data) {
    this.pendingOps.push({
      id: `op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      table,
      operation,  // 'INSERT', 'UPDATE', 'DELETE'
      data,
      status: 'pending',
      attempts: 0
    });

    this.savePendingOps();
    
    // Auto-sync jika online
    if (navigator.onLine && !this.isSyncing) {
      setTimeout(() => this.syncPendingOps(), 1000);
    }

    return this.pendingOps[this.pendingOps.length - 1];
  }

  async syncPendingOps() {
    if (this.isSyncing || this.pendingOps.length === 0 || !navigator.onLine) {
      return;
    }

    this.isSyncing = true;
    console.log(`[Sync] Syncing ${this.pendingOps.length} pending operations...`);

    const successOps = [];
    const failedOps = [];

    for (const op of this.pendingOps) {
      if (op.status === 'synced') continue;

      try {
        op.attempts++;
        let result;

        switch (op.operation) {
          case 'INSERT':
            result = await this.supabase.insert(op.table, {
              ...op.data,
              created_by: this.userId,
              created_at: new Date(op.timestamp).toISOString()
            });
            break;
          case 'UPDATE':
            result = await this.supabase.update(op.table, op.data, {
              filters: { id: op.data.id }
            });
            break;
          case 'DELETE':
            result = await this.supabase.delete(op.table, {
              filters: { id: op.data.id }
            });
            break;
        }

        if (result) {
          op.status = 'synced';
          successOps.push(op.id);
          console.log(`✅ Synced: ${op.table} - ${op.operation}`);
        } else {
          failedOps.push(op);
        }
      } catch (error) {
        failedOps.push(op);
        console.error(`❌ Sync failed: ${op.table}`, error);
      }
    }

    // Remove synced ops
    this.pendingOps = this.pendingOps.filter(op => op.status !== 'synced');
    this.savePendingOps();

    // Update sync timestamp
    localStorage.setItem(STORAGE_KEYS.SYNC_STATE, Date.now().toString());

    this.isSyncing = false;

    if (successOps.length > 0) {
      this.notifySyncComplete(successOps.length);
    }

    return { successOps, failedOps };
  }

  // ─── CRUD OPERATIONS (Hybrid) ───
  async create(table, data) {
    const op = this.queueOperation(table, 'INSERT', data);
    
    // Save locally immediately (IndexedDB atau object)
    await this.saveLocalData(table, op.data);

    return op.data;
  }

  async read(table, filters = {}) {
    try {
      // Try server first jika online
      if (navigator.onLine) {
        const result = await this.supabase.select(table, { filters });
        if (result) {
          await this.saveLocalData(table, result);
          return result;
        }
      }
      
      // Fallback ke local
      return await this.getLocalData(table) || [];
    } catch (error) {
      console.error(`[Read] ${table}:`, error);
      return await this.getLocalData(table) || [];
    }
  }

  async update(table, id, data) {
    const op = this.queueOperation(table, 'UPDATE', { id, ...data });
    await this.saveLocalData(table, op.data);
    return op.data;
  }

  async delete(table, id) {
    const op = this.queueOperation(table, 'DELETE', { id });
    await this.deleteLocalData(table, id);
    return { success: true };
  }

  // ─── LOCAL STORAGE (IndexedDB/localStorage fallback) ───
  async saveLocalData(table, data) {
    try {
      const key = `gm2026_${table}`;
      const existing = JSON.parse(localStorage.getItem(key) || '{}');
      
      if (Array.isArray(data)) {
        const merged = Array.isArray(existing) ? existing : [];
        const dataMap = new Map(merged.map(d => [d.id, d]));
        data.forEach(d => dataMap.set(d.id, d));
        localStorage.setItem(key, JSON.stringify(Array.from(dataMap.values())));
      } else {
        existing[data.id] = data;
        localStorage.setItem(key, JSON.stringify(existing));
      }
    } catch (e) {
      console.warn(`[LocalStorage] Save error:`, e);
    }
  }

  async getLocalData(table) {
    try {
      const key = `gm2026_${table}`;
      return JSON.parse(localStorage.getItem(key) || '[]');
    } catch (e) {
      console.warn(`[LocalStorage] Read error:`, e);
      return [];
    }
  }

  async deleteLocalData(table, id) {
    try {
      const key = `gm2026_${table}`;
      const data = JSON.parse(localStorage.getItem(key) || '[]');
      const filtered = data.filter(d => d.id !== id);
      localStorage.setItem(key, JSON.stringify(filtered));
    } catch (e) {
      console.warn(`[LocalStorage] Delete error:`, e);
    }
  }

  // ─── PENDING OPS MANAGEMENT ───
  loadPendingOps() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEYS.PENDING_OPS) || '[]');
    } catch (e) {
      return [];
    }
  }

  savePendingOps() {
    try {
      localStorage.setItem(STORAGE_KEYS.PENDING_OPS, JSON.stringify(this.pendingOps));
    } catch (e) {
      console.warn('Failed to save pending ops:', e);
    }
  }

  notifySyncComplete(count) {
    // Emit event atau notification
    console.log(`✨ ${count} items synced to Supabase`);
    document.dispatchEvent(new CustomEvent('gm2026-sync-complete', {
      detail: { count }
    }));
  }

  // ─── UTILITIES ───
  getPendingCount() {
    return this.pendingOps.filter(op => op.status !== 'synced').length;
  }

  getSyncStatus() {
    return {
      isOnline: navigator.onLine,
      isSyncing: this.isSyncing,
      pendingOps: this.getPendingCount(),
      lastSync: localStorage.getItem(STORAGE_KEYS.SYNC_STATE)
    };
  }

  async forceSyncNow() {
    return this.syncPendingOps();
  }
}

/**
 * ╔═══════════════════════════════════════════════════════════════════╗
 * ║  3. GLOBAL INSTANCE INITIALIZATION                                ║
 * ╚═══════════════════════════════════════════════════════════════════╝
 */
let gmSync = null;

async function initializeGAMAS() {
  gmSync = new HybridSyncManager();
  
  console.log('%c✨ GAMAS 2026 Hybrid Sync Engine initialized', 'color: #00d9ff; font-weight: bold; font-size: 14px');
  console.log('Status:', gmSync.getSyncStatus());
  
  // Auto-sync on startup
  await gmSync.syncPendingOps();
  
  return gmSync;
}

// Initialize on page load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeGAMAS);
} else {
  initializeGAMAS();
}

// Export untuk digunakan di modul lain
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { HybridSyncManager, SupabaseClient, initializeGAMAS };
}
