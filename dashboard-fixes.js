// =====================================================================
// FIXED CODE SNIPPETS untuk dashboard-laporan.html
// Ganti bagian yang sesuai dengan kode di bawah
// =====================================================================

// =====================================================================
// FIX #1: DELETE FUNCTION (Ganti line 1620-1623)
// =====================================================================

// ❌ OLD CODE (BUGGY):
/*
document.getElementById('pemasukanHapusBtn').addEventListener('click', async function() {
    const data=getCashData(); if(data.length===0){ showToast('Tidak ada data untuk dihapus.','warning'); return; }
    if(!confirm('Yakin hapus semua data untuk bulan '+cashBulan+'? ('+data.length+' hari)')) return;
    cashDataMap[cashBulan]=[]; await saveCashData(); renderPemasukan(); renderCek(); refreshPiutangUangMasuk(); showToast('Data telah dihapus.','info');
});
*/

// ✅ NEW CODE (FIXED):
document.getElementById('pemasukanHapusBtn').addEventListener('click', async function() {
    const data=getCashData(); 
    if(data.length===0){ 
        showToast('Tidak ada data untuk dihapus.','warning'); 
        return; 
    }
    if(!confirm('Yakin hapus semua data untuk bulan '+cashBulan+'? ('+data.length+' hari)')) return;
    
    // Step 1: Clear dari memory
    cashDataMap[cashBulan]=[]; 
    
    // Step 2: Hapus dari penyimpanan lokal (IndexedDB) — aplikasi ini sekarang
    // 100% offline/lokal, tidak ada lagi Firebase/Firestore untuk dibersihkan.
    try {
        const existing = await db.cashIncome.where('bulan').equals(cashBulan).first();
        if (existing) {
            await db.cashIncome.delete(existing.id);
            console.log('[DELETE OK] bulan='+cashBulan+' dihapus');
        }
    } catch(err) {
        console.error('Delete error:', err);
        showToast('⚠️ Gagal hapus data: '+err.message, 'warning');
        return;
    }
    
    // Step 3: Update UI
    renderPemasukan(); 
    renderCek(); 
    refreshPiutangUangMasuk(); 
    showToast('✅ Data telah dihapus.','success');
});


// =====================================================================
// FIX #2: IMPORT FUNCTION (Ganti line 1598-1619)
// =====================================================================

// ❌ OLD CODE (UNSAFE):
/*
document.getElementById('pemasukanImportFileInput').addEventListener('change', async function(e) {
    const file=e.target.files[0]; if(!file) return;
    const reader=new FileReader();
    reader.onload=async function(e) {
        try {
            const json=JSON.parse(e.target.result);
            if(!Array.isArray(json)||json.length===0){ showToast('File tidak valid.','warning'); return; }
            await loadCashData();
            const current=getCashData();
            if(current.length>0 && !confirm('Ganti '+current.length+' data dengan '+json.length+' dari file?')) return;
            cashDataMap[cashBulan]=json;
            await saveCashData();
            renderPemasukan();
            renderCek();
            refreshPiutangUangMasuk();
            tampilkanNotifDataBaru('both');
            showToast('Import berhasil! '+json.length+' hari.','success');
        } catch(err){ showToast('Gagal import: '+err.message,'warning'); }
    };
    reader.readAsText(file);
    this.value='';
});
*/

// ✅ NEW CODE (SAFE):
document.getElementById('pemasukanImportFileInput').addEventListener('change', async function(e) {
    const file=e.target.files[0]; 
    if(!file) return;
    
    const reader=new FileReader();
    reader.onload=async function(e) {
        try {
            // Step 1: Parse dan validate data
            const json=JSON.parse(e.target.result);
            if(!Array.isArray(json)||json.length===0){ 
                showToast('File tidak valid.','warning'); 
                return; 
            }
            
            // Step 2: Filter hanya data yang valid
            const validData = json.filter(item => {
                // Pastikan struktur data benar
                return item.tanggal && 
                       typeof item.totalCash === 'number' &&
                       typeof item.totalTransfer === 'number';
            });
            
            if(validData.length === 0) {
                showToast('❌ Tidak ada data valid dalam file.','warning');
                console.error('[IMPORT] Semua baris invalid:', json.slice(0,3));
                return;
            }
            
            if(validData.length !== json.length) {
                showToast('⚠️ File: '+json.length+' baris, valid: '+validData.length,'warning');
                if(!confirm('Lanjutkan import '+validData.length+' data yang valid?\n\n('+( json.length - validData.length)+' baris akan diabaikan)')) return;
            }
            
            // Step 3: Compare dengan data saat ini
            await loadCashData();
            const current=getCashData();
            if(current.length>0 && !confirm('Bulan '+cashBulan+' sudah ada '+current.length+' hari.\n\nGanti dengan '+validData.length+' hari dari file?')) 
                return;
            
            // Step 4: Simpan dengan feedback
            console.log('[IMPORT START] bulan='+cashBulan+', rows='+validData.length);
            
            cashDataMap[cashBulan]=validData;
            
            // PENTING: Check hasil saveCashData sebelum show success
            const hasilSave = await saveCashData();
            
            if(!hasilSave) {
                showToast('❌ Upload GAGAL — data tidak tersimpan ke server. Cek koneksi internet dan coba lagi.','danger');
                console.error('[IMPORT FAIL] saveCashData returned false');
                return;
            }
            
            // Step 5: Baru tampilkan success SETELAH verify berhasil
            console.log('[IMPORT OK] '+validData.length+' hari tersimpan');
            renderPemasukan();
            renderCek();
            refreshPiutangUangMasuk();
            tampilkanNotifDataBaru('both');
            showToast('✅ Import berhasil! '+validData.length+' hari tersimpan di server.','success');
            
        } catch(err){ 
            console.error('[IMPORT ERROR]', err);
            showToast('❌ Gagal import: '+err.message,'warning'); 
        }
    };
    reader.readAsText(file);
    this.value='';
});


// =====================================================================
// FIX #3: IMPROVE saveCashData() VERIFICATION (Ganti line 1452-1455)
// =====================================================================

// ❌ OLD CODE (ONLY COUNT CHECK):
/*
const dataServer = (snap.data()||{}).data || [];
if (dataServer.length !== data.length) {
    showToast('⚠️ Data di server baru '+dataServer.length+' dari '+data.length+' hari — sepertinya koneksi terputus saat menyimpan. Pastikan internet stabil lalu Upload ulang.', 'warning');
    return false;
}
*/

// ✅ NEW CODE (COUNT + VALUE CHECK):
const dataServer = (snap.data()||{}).data || [];
if (dataServer.length !== data.length) {
    console.error('[VERIFY FAIL] Count mismatch: server='+dataServer.length+' vs local='+data.length, {dataServer, data});
    showToast('⚠️ Data di server baru '+dataServer.length+' dari '+data.length+' hari — sepertinya koneksi terputus saat menyimpan. Pastikan internet stabil lalu Upload ulang.', 'warning');
    return false;
}

// IMPROVEMENT: Jika ada data, verify sample data (first dan last)
if(data.length > 0) {
    const firstServer = dataServer[0];
    const lastServer = dataServer[dataServer.length-1];
    const firstLocal = data[0];
    const lastLocal = data[data.length-1];
    
    const firstMatch = firstServer && firstServer.tanggal === firstLocal.tanggal;
    const lastMatch = lastServer && lastServer.tanggal === lastLocal.tanggal;
    
    if(!firstMatch || !lastMatch) {
        console.error('[VERIFY FAIL] Data value mismatch:', {
            first: {server: firstServer?.tanggal, local: firstLocal.tanggal, match: firstMatch},
            last: {server: lastServer?.tanggal, local: lastLocal.tanggal, match: lastMatch}
        });
        showToast('⚠️ Data di server berbeda dari yang dikirim (tanggal tidak cocok)! Cek koneksi dan coba lagi.', 'warning');
        return false;
    }
}


// =====================================================================
// FIX #4: ADD LOGGING untuk debugging (Optional tapi highly recommended)
// =====================================================================

// Tambahkan di awal fungsi saveCashData() (setelah line 1430):
async function saveCashData() {
    try {
        const data = cashDataMap[cashBulan] || [];
        console.log('[SAVE] bulan='+cashBulan+', rows='+data.length, {
            first3: data.slice(0,3),
            timestamp: new Date().toISOString()
        });
        
        // ... rest of code ...
    }
}

// Tambahkan di awal fungsi loadCashData() (setelah line 1380):
async function loadCashData() {
    try {
        // ... existing code ...
        console.log('[LOAD] bulan='+cashBulan+', rows='+(cashDataMap[cashBulan]||[]).length, {
            allBulans: Object.keys(cashDataMap),
            timestamp: new Date().toISOString()
        });
    }
}


// =====================================================================
// FIX #5: CLEAN UP DUPLICATES on Startup (Recommended)
// =====================================================================

// Tambahkan di akhir startApp() function (line 2870) sebelum switchTab:
async function startApp() {
    // ... existing code ...
    
    // TAMBAHAN: Bersihkan duplikat dokumen saat startup
    console.log('[STARTUP] Cleaning up duplicate cashIncome documents...');
    try {
        const hasilBeres = await beresinDuplikatCashIncome();
        if(hasilBeres && hasilBeres.length > 0) {
            console.log('[CLEANUP OK] Duplikat dibersihkan:', hasilBeres);
        }
    } catch(err) {
        console.warn('[CLEANUP] Non-critical error:', err);
    }
    
    // ... rest of code ...
    switchTab('tab2');
}


// =====================================================================
// HOW TO APPLY THESE FIXES
// =====================================================================

/*
1. Buka dashboard-laporan.html di text editor
2. Cari line numbers yang disebutkan di atas
3. Ganti code lama dengan code baru
4. Test dengan step-by-step yang ada di analysis document
5. Monitor console.log output untuk verify semuanya berjalan

ATAU:

Buat file patch.js yang berisi semua fix ini,
lalu include di <script> tag di HTML:
<script src="patch.js"></script>

Tapi perhatikan: Kode ini override event listeners,
jadi harus dijalankan SETELAH DOM ready.
*/
