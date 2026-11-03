(() => {
  const $ = id => document.getElementById(id);
  const money = n => new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(Number(n||0));
  const dateFmt = v => v ? new Date(v).toLocaleString('id-ID') : '—';
 const cfg = window.GEMPITA_CONFIG || {};
const configured = cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY &&
  !cfg.SUPABASE_URL.includes('TEMPEL_') && !cfg.SUPABASE_ANON_KEY.includes('TEMPEL_');
  let sb = null, sessionUser = null, profile = null, members = [], wastes = [], weighings = [], cashRows = [];

  function msg(id, text, bad=false){ const el=$(id); if(el){el.textContent=text;el.className='message '+(bad?'error':'success');} }
  function show(id, yes){ $(id).classList.toggle('hidden',!yes); }
  function role(){ return profile?.peran || ''; }
  function canFinance(){ return ['admin','bendahara'].includes(role()); }
  function canManagePrices(){ return ['admin','bendahara'].includes(role()); }
  function fmtError(e){ return e?.message || String(e || 'Terjadi kesalahan.'); }

  function showTab(name){
    document.querySelectorAll('.tabpage').forEach(x=>x.classList.add('hidden'));
    $('tab-'+name)?.classList.remove('hidden');
    document.querySelectorAll('.tabs button').forEach(b=>b.classList.toggle('active',b.dataset.tab===name));
    if(name==='dashboard') loadDashboard();
    if(name==='anggota') loadMembers();
    if(name==='harga') loadWastes();
    if(name==='harga-global') loadGlobalPrices();
    if(name==='timbang'){ loadMembers(); loadWastes(); loadWeighings(); }
    if(name==='tabungan') loadSavings();
    if(name==='sampah-anggota'){
  (async()=>{
    await loadMembers();
    await loadWastes();
    await loadMemberWaste();
  })();
}
if(name==='global-sampah') loadGlobalHistory();
    if(name==='kas') loadCash();
    if(name==='laporan') loadReports();
  }

  async function loadProfile(){
    const {data,error}=await sb.from('profiles').select('id,nama,peran').eq('id',sessionUser.id).maybeSingle();
    if(error) throw error;
    if(!data) throw new Error('Profil pengguna belum dibuat. Minta Admin menyiapkan profil di tabel profiles.');
    profile=data;
    $('welcomeTitle').textContent='Halo, '+(profile.nama||'Pengguna');
    $('userInfo').textContent=sessionUser.email||'';
    $('roleBadge').textContent=({admin:'Admin',bendahara:'Bendahara',petugas:'Petugas'})[profile.peran]||profile.peran;
    document.querySelector('[data-tab="kas"]').classList.toggle('hidden',!canFinance());
    document.querySelector('[data-tab="laporan"]').classList.toggle('hidden',!canFinance());
    if(!canManagePrices()) $('tab-harga').querySelectorAll('form, .muted').forEach(el=>el.classList.add('hidden'));
  if(!canManagePrices()) $('globalPriceForm').classList.add('hidden');
  }

  async function enterApp(){
    show('loginPanel',false); show('appPanel',true); show('logoutBtn',true);
    try { await loadProfile(); showTab('dashboard'); }
    catch(e){ show('appPanel',false); show('loginPanel',true); msg('loginMessage',fmtError(e),true); }
  }
  async function init(){
    if(!configured){show('setupNotice',true); $('loginPanel').classList.add('hidden'); return;}
    if(!window.supabase){show('setupNotice',true); $('setupNotice').querySelector('p').textContent='Pustaka Supabase belum berhasil dimuat. Periksa koneksi internet.';return;}
    sb=window.supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_ANON_KEY);
    const {data:{session}}=await sb.auth.getSession();
    if(session){sessionUser=session.user; await enterApp();}
  }

  $('loginForm').addEventListener('submit',async e=>{
    e.preventDefault(); msg('loginMessage','Memeriksa akun...');
    if(!sb){msg('loginMessage','Konfigurasi Supabase belum diisi.',true);return;}
    const {data,error}=await sb.auth.signInWithPassword({email:$('email').value.trim(),password:$('password').value});
    if(error){msg('loginMessage',error.message,true);return;}
    sessionUser=data.user;
    await enterApp();
  });
  $('logoutBtn').addEventListener('click',async()=>{await sb.auth.signOut();sessionUser=null;profile=null;show('appPanel',false);show('loginPanel',true);show('logoutBtn',false);});
  document.querySelectorAll('.tabs button').forEach(b=>b.addEventListener('click',()=>showTab(b.dataset.tab)));

 function renderWeighMembers(keyword=''){
  const cari = keyword.toLowerCase().trim();

  const hasil = members.filter(m =>
    (m.nama || '').toLowerCase().includes(cari)
  );

  $('weighMember').innerHTML =
    '<option value="">Pilih anggota</option>' +
    hasil.map(m =>
      `<option value="${m.id}">${esc(m.nama)}</option>`
    ).join('');
}

$('searchWeighMember').addEventListener('input', 
function(){
  renderWeighMembers(this.value);
});
async function loadMembers(){
  const {data,error}=await sb.from('anggota').select('id,kode_anggota,nama,alamat,no_hp,saldo').order('kode_anggota');

  if(error){
    msg('memberMessage',error.message,true);
    return;
  }

  members=(data||[]).sort((a,b)=>{
  const noA = Number((a.kode_anggota||'').match(/(\d+)$/)?.[1] || 0);
  const noB = Number((b.kode_anggota||'').match(/(\d+)$/)?.[1] || 0);
  return noA-noB;
});

  $('membersBody').innerHTML=members.map(m=>`<tr>
<td>${esc(m.kode_anggota)}</td>
<td>${esc(m.nama)}</td>
<td>${esc(m.alamat||'')}</td>
<td>${money(m.saldo)}</td>
<td>${role()==='admin' ? `<button onclick="editMember('${m.id}')">Edit</button> <button onclick="hapusAnggota('${m.id}')">Hapus</button>` : '—'}</td>
</tr>`).join('');

  renderWeighMembers();

  $('statAnggota').textContent=members.length;
}
  window.editMember = async function(id){
  if(role() !== 'admin'){
    alert('Hanya Admin yang boleh mengedit anggota.');
    return;
  }

  const m = members.find(x => String(x.id) === String(id));
  if(!m) return;

  const kode = prompt('Kode Anggota:', m.kode_anggota);
  if(kode === null) return;

  const nama = prompt('Nama Anggota:', m.nama);
  if(nama === null) return;

  const alamat = prompt('Alamat:', m.alamat || '');
  if(alamat === null) return;

  const no_hp = prompt('Nomor HP:', m.no_hp || '');
  if(no_hp === null) return;

  if(!kode.trim() || !nama.trim()){
    alert('Kode dan nama anggota wajib diisi.');
    return;
  }

  const {error} = await sb.from('anggota')
    .update({
      kode_anggota: kode.trim(),
      nama: nama.trim(),
      alamat: alamat.trim(),
      no_hp: no_hp.trim()
    })
    .eq('id', id);

  if(error){
    alert('Gagal mengedit anggota: ' + error.message);
    return;
  }

  alert('Data anggota berhasil diperbarui.');
  await loadMembers();
};

window.hapusAnggota = async function(id){
  if(role() !== 'admin'){
    alert('Hanya Admin yang boleh menghapus anggota.');
    return;
  }

  const m = members.find(x => String(x.id) === String(id));
  if(!m) return;

  if(Number(m.saldo) > 0){
    alert('Anggota masih memiliki saldo. Tidak bisa dihapus.');
    return;
  }

  const {count, error:cekError} = await sb
    .from('penimbangan')
    .select('id', {count:'exact', head:true})
    .eq('anggota_id', id);

  if(cekError){
    alert('Gagal memeriksa riwayat: ' + cekError.message);
    return;
  }

  if(count > 0){
    alert('Anggota memiliki riwayat penimbangan. Tidak bisa dihapus.');
    return;
  }

  if(!confirm('Yakin ingin menghapus anggota ' + m.nama + '?')){
    return;
  }

  const {error} = await sb
    .from('anggota')
    .delete()
    .eq('id', id);

  if(error){
    alert('Gagal menghapus anggota: ' + error.message);
    return;
  }

  alert('Anggota berhasil dihapus.');
  await loadMembers();
  await loadDashboard();
};
    async function loadSavings(){
    const body = $('savingsBody');
    body.innerHTML = '<tr><td colspan="3">Memuat data...</td></tr>';

    const {data,error}=await sb.from('anggota').select('id,kode_anggota,nama,alamat,no_hp,saldo').order('kode_anggota');

    if(error){
      body.innerHTML = '';
      msg('savingsMessage', error.message, true);
      return;
    }

    const rows = data || [];

    body.innerHTML = rows.map(m => `
      <tr>
        <td>${esc(m.kode_anggota)}</td>
        <td>${esc(m.nama)}</td>
        <td>${money(m.saldo)}</td>
      </tr>
    `).join('');

    if(rows.length === 0){
      body.innerHTML = '<tr><td colspan="3">Belum ada anggota.</td></tr>';
    }

    msg('savingsMessage', 'Data saldo berhasil dimuat.');
  }
  // REKAP TABUNGAN BULANAN GEMPITA
let rekapTabunganData = [];

async function loadMonthlySavings(){
  const body = $('rekapTabunganBody');
  const ringkasan = $('rekapRingkasan');

  body.innerHTML = '<tr><td colspan="5">Memuat data...</td></tr>';
  ringkasan.innerHTML = '';

  const bulan = Number($('rekapBulan').value);
  const tahun = Number($('rekapTahun').value);

  if(!bulan || !tahun){
    msg('rekapTabunganMessage','Pilih bulan dan tahun.',true);
    return;
  }

  const awal = new Date(tahun, bulan - 1, 1);
  const akhir = new Date(tahun, bulan, 1);

  const {data: timbang, error: errTimbang} = await sb
    .from('penimbangan')
    .select('id,anggota_id,berat_kg,tanggal')
    .gte('tanggal',awal.toISOString())
    .lt('tanggal',akhir.toISOString());

  if(errTimbang){
    body.innerHTML = '';
    msg('rekapTabunganMessage',errTimbang.message,true);
    return;
  }

  const penimbangan = timbang || [];

  if(penimbangan.length === 0){
    body.innerHTML = '<tr><td colspan="5">Belum ada penimbangan.</td></tr>';
    msg('rekapTabunganMessage','Tidak ada transaksi pada periode ini.');
    rekapTabunganData = [];
    return;
  }

  const ids = penimbangan.map(p=>p.id);

  const {data: transaksi, error: errTabungan} = await sb
    .from('tabungan')
    .select('anggota_id,penimbangan_id,jumlah')
    .in('penimbangan_id',ids);

  if(errTabungan){
    body.innerHTML = '';
    msg('rekapTabunganMessage',errTabungan.message,true);
    return;
  }

  const {data: anggota, error: errAnggota} = await sb
    .from('anggota')
    .select('id,nama');

  if(errAnggota){
    body.innerHTML = '';
    msg('rekapTabunganMessage',errAnggota.message,true);
    return;
  }

  const namaAnggota = {};
  (anggota || []).forEach(a=>{
    namaAnggota[a.id] = a.nama;
  });

  const nilaiTransaksi = {};

  (transaksi || []).forEach(t=>{
    nilaiTransaksi[t.penimbangan_id] =
      (nilaiTransaksi[t.penimbangan_id] || 0) +
      Number(t.jumlah || 0);
  });

  const rekap = {};

  penimbangan.forEach(p=>{
    const id = p.anggota_id;

    if(!rekap[id]){
      rekap[id] = {
        nama: namaAnggota[id] || 'Tidak diketahui',
        transaksi: 0,
        berat: 0,
        tabungan: 0
      };
    }

    rekap[id].transaksi++;
    rekap[id].berat += Number(p.berat_kg || 0);
    rekap[id].tabungan += Number(nilaiTransaksi[p.id] || 0);
  });

  rekapTabunganData = Object.values(rekap)
    .sort((a,b)=>a.nama.localeCompare(b.nama,'id'));

  body.innerHTML = rekapTabunganData.map((r,i)=>`
    <tr>
      <td>${i+1}</td>
      <td>${esc(r.nama)}</td>
      <td>${r.transaksi}</td>
      <td>${r.berat.toLocaleString('id-ID')}</td>
      <td>${money(r.tabungan)}</td>
    </tr>
  `).join('');

  const totalTransaksi = penimbangan.length;
  const totalBerat = penimbangan.reduce(
    (s,p)=>s+Number(p.berat_kg || 0),0
  );
  const totalTabungan = rekapTabunganData.reduce(
    (s,r)=>s+r.tabungan,0
  );

  ringkasan.innerHTML = `
    <div class="stats">
      <article class="stat">
        <span>Anggota Menyetor</span>
        <strong>${rekapTabunganData.length}</strong>
      </article>
      <article class="stat">
        <span>Jumlah Transaksi</span>
        <strong>${totalTransaksi}</strong>
      </article>
      <article class="stat">
        <span>Total Berat</span>
        <strong>${totalBerat.toLocaleString('id-ID')} kg</strong>
      </article>
      <article class="stat">
        <span>Total Tabungan</span>
        <strong>${money(totalTabungan)}</strong>
      </article>
    </div>
  `;

  msg('rekapTabunganMessage','Rekap berhasil dimuat.');
}
  async function loadMemberWaste(){
  const body = $('memberWasteBody');
  body.innerHTML = '<tr><td colspan="5">Memuat data...</td></tr>';

  const {data, error} = await sb
    .from('penimbangan')
    .select('anggota_id,jenis_sampah_id,berat_kg,total,tanggal')
    .order('tanggal', {ascending:false});

  if(error){
    body.innerHTML = '';
    msg('memberWasteMessage', error.message, true);
    return;
  }

  const rows = data || [];

  body.innerHTML = rows.map(r => `
    <tr>
      <td>${esc(members.find(m=>m.id===r.anggota_id)?.nama||'—')}</td>
      <td>${esc(wastes.find(w=>w.id===r.jenis_sampah_id)?.nama||'—')}</td>
      <td>${Number(r.berat_kg).toLocaleString('id-ID')} kg</td>
      <td>${money(r.total)}</td>
      <td>${dateFmt(r.tanggal)}</td>
    </tr>
  `).join('');

  if(rows.length === 0){
    body.innerHTML = '<tr><td colspan="5">Belum ada data penimbangan.</td></tr>';
  }

  msg('memberWasteMessage', 'Data sampah berhasil dimuat.');
}
  $('memberForm').addEventListener('submit',async e=>{
    e.preventDefault();
    const row={kode_anggota:$('memberCode').value.trim(),nama:$('memberName').value.trim(),alamat:$('memberAddress').value.trim()||null,no_hp:$('memberPhone').value.trim()||null};
    const {error}=await sb.from('anggota').insert(row);
    if(error){msg('memberMessage',error.message,true);return;}
    e.target.reset();msg('memberMessage','Anggota berhasil disimpan.');await loadMembers();await loadDashboard();
  });
function renderWeighWastes(keyword=''){
  const cari = keyword.toLowerCase().trim();

  const hasil = wastes.filter(w =>
    w.aktif && (w.nama || '').toLowerCase().includes(cari)
  );

  $('weighWaste').innerHTML =
    '<option value="">Pilih jenis sampah</option>' +
    hasil.map(w =>
      `<option value="${w.id}" data-price="${w.harga_per_kg}">${esc(w.nama)} — ${money(w.harga_per_kg)}/kg</option>`
    ).join('');
}

$('searchWeighWaste').addEventListener('input', function(){
  const cari = this.value.toLowerCase().trim();

  const hasil = wastes.filter(w =>
    w.aktif && (w.nama || '').toLowerCase().includes(cari)
  );

  renderWeighWastes(this.value);

  $('weighMessage').textContent =
    `Kata: ${this.value} | Data: ${wastes.length} | Cocok: ${hasil.length} | Dropdown: ${$('weighWaste').options.length - 1}`;
});
  async function loadWastes(){
    const {data,error}=await sb.from('jenis_sampah').select('id,nama,harga_per_kg,aktif').order('nama');
    if(error){msg('wasteMessage',error.message,true);return;}
    wastes=data||[];
    $('pricesBody').innerHTML=wastes.map(w=>`<tr><td>${esc(w.nama)}</td><td><input type="number" min="0" step="0.01" value="${Number(w.harga_per_kg)}" data-price="${w.id}" ${canManagePrices()?'':'disabled'}></td><td>${w.aktif?'Aktif':'Nonaktif'}</td><td>${canManagePrices()?`<button type="button" data-save-price="${w.id}">Simpan</button> <button type="button" class="secondary" data-toggle-waste="${w.id}" data-active="${w.aktif}">${w.aktif?'Nonaktifkan':'Aktifkan'}</button>`:'Lihat'}</td></tr>`).join('');
   renderWeighWastes($('searchWeighWaste').value);
    $('pricesBody').querySelectorAll('[data-save-price]').forEach(btn=>btn.addEventListener('click',async()=>{
      const id=Number(btn.dataset.savePrice), input=$('pricesBody').querySelector(`[data-price="${id}"]`), price=Number(input.value);
      if(!Number.isFinite(price)||price<0){msg('wasteMessage','Harga harus nol atau lebih.',true);return;}
      const {error}=await sb.from('jenis_sampah').update({harga_per_kg:price}).eq('id',id);
      if(error){msg('wasteMessage',error.message,true);return;}
      msg('wasteMessage','Harga berhasil diperbarui.');await loadWastes();
    }));
    $('pricesBody').querySelectorAll('[data-toggle-waste]').forEach(btn=>btn.addEventListener('click',async()=>{
      const id=Number(btn.dataset.toggleWaste), active=btn.dataset.active!=='true';
      const {error}=await sb.from('jenis_sampah').update({aktif:active}).eq('id',id);
      if(error){msg('wasteMessage',error.message,true);return;}
      msg('wasteMessage','Status jenis sampah diperbarui.');await loadWastes();
    }));
  }
  $('wasteForm').addEventListener('submit',async e=>{
    e.preventDefault();
    if(!canManagePrices()){msg('wasteMessage','Akses hanya untuk Admin atau Bendahara.',true);return;}
    const row={nama:$('wasteName').value.trim(),harga_per_kg:Number($('wastePrice').value),aktif:true};
    const {error}=await sb.from('jenis_sampah').insert(row);
    if(error){msg('wasteMessage',error.message,true);return;}
    e.target.reset();$('wastePrice').value='0';msg('wasteMessage','Jenis sampah berhasil ditambahkan.');await loadWastes();
  });
  // =====================================
// HARGA SAMPAH GLOBAL
// =====================================

let globalPrices = [];

async function loadGlobalPrices(){

  const body = $('globalPricesBody');

  body.innerHTML = '<tr><td colspan="4">Memuat data...</td></tr>';

  const {data,error} = await sb
    .from('harga_global_sampah')
    .select('id,nama,harga_per_kg,aktif')
    .order('nama');

  if(error){
    body.innerHTML = '';
    msg('globalPriceMessage',error.message,true);
    return;
  }

  globalPrices = data || [];

  body.innerHTML = globalPrices.map(w=>`
    <tr>
      <td>${esc(w.nama)}</td>

      <td>
        <input
          type="number"
          min="0"
          step="0.01"
          value="${Number(w.harga_per_kg)}"
          data-global-price="${w.id}"
          ${canManagePrices()?'':'disabled'}
        >
      </td>

      <td>${w.aktif?'Aktif':'Nonaktif'}</td>

      <td>
        ${canManagePrices()?`
          <button type="button" data-save-global-price="${w.id}">
            Simpan
          </button>

          <button type="button"
            class="secondary"
            data-toggle-global-price="${w.id}"
            data-active="${w.aktif}">
            ${w.aktif?'Nonaktifkan':'Aktifkan'}
          </button>
        `:'Lihat'}
      </td>
    </tr>
  `).join('');

  if(globalPrices.length===0){
    body.innerHTML='<tr><td colspan="4">Belum ada jenis sampah.</td></tr>';
  }

  body.querySelectorAll('[data-save-global-price]').forEach(btn=>{
    btn.addEventListener('click',async()=>{

      const id=Number(btn.dataset.saveGlobalPrice);

      const input=body.querySelector(
        `[data-global-price="${id}"]`
      );

      const harga=Number(input.value);

      if(!Number.isFinite(harga)||harga<0){
        msg('globalPriceMessage','Harga tidak boleh negatif.',true);
        return;
      }

      const {error}=await sb
        .from('harga_global_sampah')
        .update({harga_per_kg:harga})
        .eq('id',id);

      if(error){
        msg('globalPriceMessage',error.message,true);
        return;
      }

      msg('globalPriceMessage','Harga berhasil diperbarui.');
      await loadGlobalPrices();
    });
  });

  body.querySelectorAll('[data-toggle-global-price]').forEach(btn=>{
    btn.addEventListener('click',async()=>{

      const id=Number(btn.dataset.toggleGlobalPrice);
      const aktif=btn.dataset.active!=='true';

      const {error}=await sb
        .from('harga_global_sampah')
        .update({aktif})
        .eq('id',id);

      if(error){
        msg('globalPriceMessage',error.message,true);
        return;
      }

      msg('globalPriceMessage','Status jenis sampah diperbarui.');
      await loadGlobalPrices();
    });
  });
}

$('globalPriceForm').addEventListener('submit',async e=>{

  e.preventDefault();

  if(!canManagePrices()){
    msg('globalPriceMessage','Hanya Admin dan Bendahara yang boleh mengelola harga.',true);
    return;
  }

  const nama=$('globalPriceName').value.trim();
  const harga=Number($('globalPriceValue').value);

  if(!nama||!Number.isFinite(harga)||harga<0){
    msg('globalPriceMessage','Isi nama dan harga dengan benar.',true);
    return;
  }

  const {error}=await sb
    .from('harga_global_sampah')
    .insert({
      nama,
      harga_per_kg:harga,
      aktif:true
    });

  if(error){
    msg('globalPriceMessage',error.message,true);
    return;
  }

  e.target.reset();

  msg('globalPriceMessage','Jenis sampah global berhasil ditambahkan.');

  await loadGlobalPrices();
});

  function updateEstimate(){
    const opt=$('weighWaste').selectedOptions[0], weight=Number($('weighWeight').value||0), price=Number(opt?.dataset.price||0);
    $('weighEstimate').value=money(weight*price);
  }
  $('weighWaste').addEventListener('change',updateEstimate);$('weighWeight').addEventListener('input',updateEstimate);
  let weighCart = [];

function renderWeighCart(){
const body = $('weighCartBody');
if(!body) return;

body.innerHTML = weighCart.map((item,index)=>`
  <tr>
    <td>${esc(item.nama)}</td>
    <td>${item.berat.toLocaleString('id-ID')} kg</td>
    <td>${money(item.harga)}</td>
    <td>${money(item.berat * item.harga)}</td>
    <td><button type="button" data-remove-weigh="${index}">Hapus</button></td>
  </tr>
`).join('');

$('weighCartTotal').textContent = money(
  weighCart.reduce((sum,item)=>sum+(item.berat*item.harga),0)
);

}

$('weighForm').addEventListener('submit',async e=>{
e.preventDefault();

const memberId = Number($('weighMember').value);

if(!memberId || weighCart.length===0){
  msg('weighMessage','Pilih anggota dan tambahkan minimal satu jenis sampah.',true);
  return;
}

const rows = weighCart.map(item=>({
  anggota_id:memberId,
  jenis_sampah_id:item.id,
  berat_kg:item.berat,
  harga_per_kg:item.harga,
  petugas_id:sessionUser.id
}));

const {error} = await sb.from('penimbangan').insert(rows);

if(error){
  msg('weighMessage',error.message,true);
  return;
}

weighCart = [];
e.target.reset();
renderWeighCart();
renderWeighMembers();
renderWeighWastes();
$('weighEstimate').value='';

msg('weighMessage','Semua penimbangan berhasil disimpan. Saldo anggota diperbarui otomatis.');

await loadMembers();
await loadWeighings();
await loadDashboard();

});

$('addWeighItem').addEventListener('click',()=>{

  if(!Number($('weighMember').value)){
    msg('weighMessage','Pilih anggota terlebih dahulu.',true);
    return;
  }

  const wasteId = Number($('weighWaste').value);
  const weight = Number($('weighWeight').value);
  const waste = wastes.find(w=>w.id===wasteId);

  if(!waste || !waste.aktif || weight<=0){
    msg('weighMessage','Pilih jenis sampah aktif dan masukkan berat yang benar.',true);
    return;
  }

  if(Number(waste.harga_per_kg)<=0){
    msg('weighMessage','Harga jenis sampah masih Rp0. Atur harga terlebih dahulu.',true);
    return;
  }

  weighCart.push({
    id:wasteId,
    nama:waste.nama,
    berat:weight,
    harga:Number(waste.harga_per_kg)
  });

  $('weighWaste').value='';
  $('weighWeight').value='';
  $('weighEstimate').value='';

  renderWeighCart();

  msg('weighMessage','Jenis sampah berhasil ditambahkan ke daftar.');
});

$('weighCartBody').addEventListener('click',e=>{
const button = e.target.closest('[data-remove-weigh]');
if(!button) return;

weighCart.splice(Number(button.dataset.removeWeigh),1);
renderWeighCart();

});
  async function loadWeighings(){
    const {data,error}=await sb.from('penimbangan').select('id,anggota_id,jenis_sampah_id,berat_kg,total,tanggal').order('tanggal',{ascending:false}).limit(50);
    if(error){msg('weighMessage',error.message,true);return;}
    weighings=data||[];
   $('weighingsBody').innerHTML=weighings.map(r=>`<tr>
<td>${dateFmt(r.tanggal)}</td>
<td>${esc(members.find(m=>m.id===r.anggota_id)?.nama||'—')}</td>
<td>${esc(wastes.find(w=>w.id===r.jenis_sampah_id)?.nama||'—')}</td>
<td>${Number(r.berat_kg).toLocaleString('id-ID')} kg</td>
<td>${money(r.total)}</td>
<td>${role()==='admin'?`<button class="btn-danger" onclick="hapusPenimbangan('${r.id}')">Hapus</button>`:'-'}</td>
</tr>`).join('');
    $('statTimbang').textContent=weighings.length;
    
    await loadDashboard();
  }
  window.hapusPenimbangan = async function(id){
    if(role() !== 'admin'){
      alert('Hanya Admin yang boleh menghapus.');
      return;
    }

    if(!confirm('Yakin ingin menghapus penimbangan ini? Saldo anggota juga akan dikurangi.')){
      return;
    }

    const {error} = await sb.rpc('hapus_penimbangan',{p_id:id});

    if(error){
      alert('Gagal menghapus: '+error.message);
      return;
    }

    alert('Penimbangan berhasil dihapus dan saldo sudah dikoreksi.');
    await loadMembers();
    await loadWeighings();
  };

  $('cashForm').addEventListener('submit',async e=>{
    e.preventDefault();
    if(!canFinance()){msg('cashMessage','Akses hanya untuk Admin atau Bendahara.',true);return;}
    const row={jenis:$('cashType').value,kategori:$('cashCategory').value.trim(),jumlah:Number($('cashAmount').value),keterangan:$('cashNote').value.trim()||null,dibuat_oleh:sessionUser.id};
    const {error}=await sb.from('transaksi_kas').insert(row);
    if(error){msg('cashMessage',error.message,true);return;}
    e.target.reset();msg('cashMessage','Transaksi kas berhasil disimpan.');await loadCash();await loadDashboard();
  });
  async function loadCash(){
    if(!canFinance())return;
    const {data,error}=await sb.from('transaksi_kas').select('id,jenis,kategori,jumlah,keterangan,tanggal').order('tanggal',{ascending:false}).limit(100);
    if(error){msg('cashMessage',error.message,true);return;}
    cashRows=data||[];
    $('cashBody').innerHTML=cashRows.map(r=>`<tr><td>${dateFmt(r.tanggal)}</td><td>${esc(r.jenis)}</td><td>${esc(r.kategori)}</td><td>${money(r.jumlah)}</td><td>${esc(r.keterangan||'')}</td></tr>`).join('');
  }
  async function loadDashboard(){
    if(!sb||!profile)return;
    const {data:ms}=await sb.from('anggota').select('id,saldo');
    const {data:ws}=await sb.from('penimbangan').select('id');
    $('statAnggota').textContent=(ms||[]).length;
    $('statTimbang').textContent=(ws||[]).length;
    $('statSaldo').textContent=money((ms||[]).reduce((s,m)=>s+Number(m.saldo||0),0));
    if(canFinance()){
      const {data:cs}=await sb.from('transaksi_kas').select('jenis,jumlah');
      $('statKasMasuk').textContent=money((cs||[]).filter(x=>x.jenis==='masuk').reduce((s,x)=>s+Number(x.jumlah),0));
    }else $('statKasMasuk').textContent='—';
  }
  async function loadReports(){
    if(!canFinance())return;
    const {data:ms}=await sb.from('anggota').select('id,saldo,nama,kode_anggota');
    const {data:ws}=await sb.from('penimbangan').select('berat_kg,total');
    const {data:cs}=await sb.from('transaksi_kas').select('jenis,jumlah');
    const masuk=(cs||[]).filter(x=>x.jenis==='masuk').reduce((s,x)=>s+Number(x.jumlah),0);
    const keluar=(cs||[]).filter(x=>x.jenis==='keluar').reduce((s,x)=>s+Number(x.jumlah),0);
    $('reportSummary').innerHTML=`<p>Jumlah anggota: <strong>${(ms||[]).length}</strong></p><p>Total berat tercatat: <strong>${(ws||[]).reduce((s,x)=>s+Number(x.berat_kg),0).toLocaleString('id-ID')} kg</strong></p><p>Nilai penimbangan: <strong>${money((ws||[]).reduce((s,x)=>s+Number(x.total),0))}</strong></p><p>Kas masuk: <strong>${money(masuk)}</strong></p><p>Kas keluar: <strong>${money(keluar)}</strong></p><p>Saldo kas bersih: <strong>${money(masuk-keluar)}</strong></p>`;
    $('exportBtn').onclick=()=>downloadCsv('anggota-gempita.csv',['Kode','Nama','Alamat','No HP','Saldo'],(ms||[]).map(m=>[m.kode_anggota,m.nama,'','',m.saldo]));
  }
  $('exportBtn').addEventListener('click',()=>{});
  function downloadCsv(name,heads,rows){
    const csv=[heads,...rows].map(r=>r.map(v=>`"${String(v??'').replaceAll('"','""')}"`).join(',')).join('\r\n');
    const blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8;'});
    const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();URL.revokeObjectURL(a.href);
  }
  function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
 // AKTIFKAN REKAP TABUNGAN BULANAN
$('rekapTahun').value = new Date().getFullYear();
$('rekapBulan').value = new Date().getMonth() + 1;

$('btnRekapTabungan').addEventListener('click', loadMonthlySavings);
 // UNDUH REKAP TABUNGAN KE EXCEL
$('btnUnduhRekap').addEventListener('click', function(){

  if(typeof XLSX === 'undefined'){
    alert('Fitur Excel belum berhasil dimuat. Periksa koneksi internet.');
    return;
  }

  if(rekapTabunganData.length === 0){
    alert('Tampilkan rekap terlebih dahulu sebelum mengunduh.');
    return;
  }

  const bulan = Number($('rekapBulan').value);
  const tahun = Number($('rekapTahun').value);

  const namaBulan = new Date(tahun, bulan - 1)
    .toLocaleDateString('id-ID',{month:'long'});

  const isiExcel = [
    ['REKAP TABUNGAN BANK SAMPAH GEMPITA'],
    ['Periode: ' + namaBulan + ' ' + tahun],
    [],
    ['No','Nama Anggota','Jumlah Transaksi','Berat (Kg)','Nilai Tabungan'],
    ...rekapTabunganData.map((r,i)=>[
      i+1,
      r.nama,
      r.transaksi,
      r.berat,
      r.tabungan
    ])
  ];

  const sheet = XLSX.utils.aoa_to_sheet(isiExcel);
  const workbook = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(workbook,sheet,'Rekap Tabungan');

  XLSX.writeFile(
    workbook,
    'Rekap_Tabungan_GEMPITA_' + bulan + '_' + tahun + '.xlsx'
  );
});
 // =====================================
// GLOBAL SAMPAH GEMPITA
// =====================================

let globalItems = [];
let editingGlobalId = null;

const namaBulanGlobal = [
  'Januari','Februari','Maret','April',
  'Mei','Juni','Juli','Agustus',
  'September','Oktober','November','Desember'
];

function renderGlobalItems(){
  const body = $('globalItemsBody');
  if(!body) return;

  body.innerHTML = globalItems.map((item,index)=>`
    <tr>
      <td>${index+1}</td>
      <td>${esc(item.nama)}</td>
      <td>${Number(item.berat).toLocaleString('id-ID')} kg</td>
      <td>
        <button type="button" data-remove-global="${index}">
          Hapus
        </button>
      </td>
    </tr>
  `).join('');

  const total = globalItems.reduce(
    (sum,item)=>sum+Number(item.berat),0
  );

  $('globalTotalBerat').textContent =
    total.toLocaleString('id-ID',{maximumFractionDigits:3})+' kg';
}

$('addGlobalItem').addEventListener('click',()=>{
  const nama = $('globalNamaJenis').value.trim();
  const berat = Number($('globalBerat').value);

  if(!nama || !Number.isFinite(berat) || berat<=0){
    msg('globalMessage','Isi nama jenis sampah dan berat dengan benar.',true);
    return;
  }

  if(globalItems.some(item=>
    item.nama.toLowerCase()===nama.toLowerCase()
  )){
    msg('globalMessage','Jenis sampah tersebut sudah ada dalam daftar.',true);
    return;
  }

  globalItems.push({nama,berat});

  $('globalNamaJenis').value='';
  $('globalBerat').value='';

  renderGlobalItems();
  msg('globalMessage','Jenis sampah berhasil ditambahkan.');
});

$('globalItemsBody').addEventListener('click',e=>{
  const button=e.target.closest('[data-remove-global]');
  if(!button) return;

  globalItems.splice(Number(button.dataset.removeGlobal),1);
  renderGlobalItems();
});

function resetGlobalForm(){
  editingGlobalId=null;
  globalItems=[];

  $('globalForm').reset();

  $('globalBulan').value=String(new Date().getMonth()+1);
  $('globalTahun').value=new Date().getFullYear();
  const today = new Date();
const todayLocal = new Date(
  today.getTime() - today.getTimezoneOffset() * 60000
).toISOString().slice(0,10);

$('globalTanggal').value = todayLocal;

  $('globalForm').querySelector('[type="submit"]').textContent=
    'Simpan Rekap Global';

  renderGlobalItems();
}

async function loadGlobalHistory(){
  const body=$('globalHistoryBody');
  body.innerHTML='<tr><td colspan="5">Memuat data...</td></tr>';

  const {data,error}=await sb
    .from('global_sampah')
    .select(`
      id,bulan,tahun,tanggal,catatan,
      detail_global_sampah(id,nama_jenis,berat_kg)
    `)
    .order('tahun',{ascending:false})
    .order('bulan',{ascending:false});

  if(error){
    body.innerHTML='';
    msg('globalMessage',error.message,true);
    return;
  }

  const rows=data||[];

  if(rows.length===0){
    body.innerHTML='<tr><td colspan="5">Belum ada rekap Global Sampah.</td></tr>';
    return;
  }

  body.innerHTML=rows.map(r=>{
    const detail=r.detail_global_sampah||[];
    const total=detail.reduce(
      (sum,item)=>sum+Number(item.berat_kg||0),0
    );

    const tanggal=r.tanggal
      ? new Date(r.tanggal+'T00:00:00').toLocaleDateString('id-ID')
      : '—';

    return `
      <tr>
        <td>${namaBulanGlobal[r.bulan-1]} ${r.tahun}</td>
        <td>${tanggal}</td>
        <td>${detail.length}</td>
        <td>${total.toLocaleString('id-ID')} kg</td>
        <td>
          <button type="button" onclick="editGlobal('${r.id}')">Edit</button>
          <button type="button" class="btn-danger"
            onclick="hapusGlobal('${r.id}')">Hapus</button>
        </td>
      </tr>
    `;
  }).join('');
}

$('globalForm').addEventListener('submit',async e=>{
  e.preventDefault();

  const bulan=Number($('globalBulan').value);
  const tahun=Number($('globalTahun').value);
  const tanggal=$('globalTanggal').value;

  if(!bulan || !tahun || !tanggal || globalItems.length===0){
    msg('globalMessage','Lengkapi periode, tanggal, dan minimal satu jenis sampah.',true);
    return;
  }

  const header={
    bulan,
    tahun,
    tanggal,
    catatan:$('globalCatatan').value.trim()||null
  };

  const details=globalItems.map(item=>({
    nama_jenis:item.nama,
    berat_kg:item.berat
  }));

  if(editingGlobalId){

    const {data:oldData,error:oldError}=await sb
      .from('detail_global_sampah')
      .select('nama_jenis,berat_kg')
      .eq('global_sampah_id',editingGlobalId);

    if(oldError){
      msg('globalMessage',oldError.message,true);
      return;
    }

    const {data:oldHeader,error:headerError}=await sb
      .from('global_sampah')
      .select('bulan,tahun,tanggal,catatan')
      .eq('id',editingGlobalId)
      .single();

    if(headerError){
      msg('globalMessage',headerError.message,true);
      return;
    }

    const {error:updateError}=await sb
      .from('global_sampah')
      .update(header)
      .eq('id',editingGlobalId);

    if(updateError){
      msg('globalMessage',updateError.message,true);
      return;
    }

    const {error:deleteError}=await sb
      .from('detail_global_sampah')
      .delete()
      .eq('global_sampah_id',editingGlobalId);

    if(deleteError){
      await sb.from('global_sampah')
        .update(oldHeader).eq('id',editingGlobalId);

      msg('globalMessage',deleteError.message,true);
      return;
    }

    const {error:insertError}=await sb
      .from('detail_global_sampah')
      .insert(details.map(item=>({
        ...item,
        global_sampah_id:editingGlobalId
      })));

    if(insertError){
      await sb.from('detail_global_sampah').insert(
        (oldData||[]).map(item=>({
          ...item,
          global_sampah_id:editingGlobalId
        }))
      );

      await sb.from('global_sampah')
        .update(oldHeader).eq('id',editingGlobalId);

      msg('globalMessage','Gagal memperbarui detail. Data lama dipulihkan. '+insertError.message,true);
      return;
    }

    msg('globalMessage','Rekap Global Sampah berhasil diperbarui.');

  }else{

    const {data:headerData,error:headerError}=await sb
      .from('global_sampah')
      .insert({
        ...header,
        created_by:sessionUser.id
      })
      .select('id')
      .single();

    if(headerError){
      msg('globalMessage',headerError.message,true);
      return;
    }

    const {error:detailError}=await sb
      .from('detail_global_sampah')
      .insert(details.map(item=>({
        ...item,
        global_sampah_id:headerData.id
      })));

    if(detailError){
      await sb.from('global_sampah')
        .delete().eq('id',headerData.id);

      msg('globalMessage','Gagal menyimpan detail sampah: '+detailError.message,true);
      return;
    }

    msg('globalMessage','Rekap Global Sampah berhasil disimpan.');
  }

  resetGlobalForm();
  await loadGlobalHistory();
});

window.editGlobal=async function(id){
  const {data,error}=await sb
    .from('global_sampah')
    .select('*,detail_global_sampah(*)')
    .eq('id',id)
    .single();

  if(error){
    alert('Gagal mengambil data: '+error.message);
    return;
  }

  editingGlobalId=id;

  $('globalBulan').value=String(data.bulan);
  $('globalTahun').value=data.tahun;
  $('globalTanggal').value=data.tanggal;
  $('globalCatatan').value=data.catatan||'';

  globalItems=(data.detail_global_sampah||[]).map(item=>({
    nama:item.nama_jenis,
    berat:Number(item.berat_kg)
  }));

  renderGlobalItems();

  $('globalForm').querySelector('[type="submit"]').textContent=
    'Simpan Perubahan';

  $('globalForm').scrollIntoView({behavior:'smooth'});

  msg('globalMessage','Mode edit: silakan ubah data lalu simpan perubahan.');
};

window.hapusGlobal=async function(id){
  if(!confirm('Yakin ingin menghapus rekap Global Sampah ini?')){
    return;
  }

  const {error}=await sb
    .from('global_sampah')
    .delete()
    .eq('id',id);

  if(error){
    alert('Gagal menghapus: '+error.message);
    return;
  }

  if(String(editingGlobalId)===String(id)){
    resetGlobalForm();
  }

  alert('Rekap Global Sampah berhasil dihapus.');
  await loadGlobalHistory();
};

// Nilai awal formulir
resetGlobalForm();
  init();
})();
