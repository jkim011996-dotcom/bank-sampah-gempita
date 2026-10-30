(() => {
  const $ = id => document.getElementById(id);
  const money = n => new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(Number(n||0));
  const dateFmt = v => v ? new Date(v).toLocaleString('id-ID') : '—';
  const cfg = window.GEMPITA_CONFIG || {};
  const configured = cfg.SUPABASE_URL && cfg.SUPABASE_PUBLISHABLE_KEY &&
    !cfg.SUPABASE_URL.includes('TEMPEL_') && !cfg.SUPABASE_PUBLISHABLE_KEY.includes('TEMPEL_');
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
    if(name==='timbang'){ loadMembers(); loadWastes(); loadWeighings(); }
    if(name==='tabungan') loadSavings();
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
  }

  async function enterApp(){
    show('loginPanel',false); show('appPanel',true); show('logoutBtn',true);
    try { await loadProfile(); showTab('dashboard'); }
    catch(e){ show('appPanel',false); show('loginPanel',true); msg('loginMessage',fmtError(e),true); }
  }
  async function init(){
    if(!configured){show('setupNotice',true); $('loginPanel').classList.add('hidden'); return;}
    if(!window.supabase){show('setupNotice',true); $('setupNotice').querySelector('p').textContent='Pustaka Supabase belum berhasil dimuat. Periksa koneksi internet.';return;}
    sb=window.supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_PUBLISHABLE_KEY);
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

  async function loadMembers(){
    const {data,error}=await sb.from('anggota').select('id,kode_anggota,nama,alamat,no_hp,saldo').order('nama');
    if(error){msg('memberMessage',error.message,true);return;}
    members=data||[];
    $('membersBody').innerHTML=members.map(m=>`<tr><td>${esc(m.kode_anggota)}</td><td>${esc(m.nama)}</td><td>${esc(m.alamat||'')}</td><td>${money(m.saldo)}</td></tr>`).join('');
    $('weighMember').innerHTML='<option value="">Pilih anggota</option>'+members.map(m=>`<option value="${m.id}">${esc(m.kode_anggota)} — ${esc(m.nama)}</option>`).join('');
    $('statAnggota').textContent=members.length;
  }
    async function loadSavings(){
    const body = $('savingsBody');
    body.innerHTML = '<tr><td colspan="3">Memuat data...</td></tr>';

    const {data, error} = await sb
      .from('anggota')
      .select('id,kode_anggota,nama,saldo')
      .order('nama');

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
  $('memberForm').addEventListener('submit',async e=>{
    e.preventDefault();
    const row={kode_anggota:$('memberCode').value.trim(),nama:$('memberName').value.trim(),alamat:$('memberAddress').value.trim()||null,no_hp:$('memberPhone').value.trim()||null};
    const {error}=await sb.from('anggota').insert(row);
    if(error){msg('memberMessage',error.message,true);return;}
    e.target.reset();msg('memberMessage','Anggota berhasil disimpan.');await loadMembers();await loadDashboard();
  });

  async function loadWastes(){
    const {data,error}=await sb.from('jenis_sampah').select('id,nama,harga_per_kg,aktif').order('nama');
    if(error){msg('wasteMessage',error.message,true);return;}
    wastes=data||[];
    $('pricesBody').innerHTML=wastes.map(w=>`<tr><td>${esc(w.nama)}</td><td><input type="number" min="0" step="0.01" value="${Number(w.harga_per_kg)}" data-price="${w.id}" ${canManagePrices()?'':'disabled'}></td><td>${w.aktif?'Aktif':'Nonaktif'}</td><td>${canManagePrices()?`<button type="button" data-save-price="${w.id}">Simpan</button> <button type="button" class="secondary" data-toggle-waste="${w.id}" data-active="${w.aktif}">${w.aktif?'Nonaktifkan':'Aktifkan'}</button>`:'Lihat'}</td></tr>`).join('');
    $('weighWaste').innerHTML='<option value="">Pilih jenis sampah</option>'+wastes.filter(w=>w.aktif).map(w=>`<option value="${w.id}" data-price="${w.harga_per_kg}">${esc(w.nama)} — ${money(w.harga_per_kg)}/kg</option>`).join('');
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

  function updateEstimate(){
    const opt=$('weighWaste').selectedOptions[0], weight=Number($('weighWeight').value||0), price=Number(opt?.dataset.price||0);
    $('weighEstimate').value=money(weight*price);
  }
  $('weighWaste').addEventListener('change',updateEstimate);$('weighWeight').addEventListener('input',updateEstimate);
  $('weighForm').addEventListener('submit',async e=>{
    e.preventDefault();
    const memberId=Number($('weighMember').value), wasteId=Number($('weighWaste').value), weight=Number($('weighWeight').value);
    const waste=wastes.find(w=>w.id===wasteId);
    if(!memberId||!waste||!waste.aktif||weight<=0){msg('weighMessage','Pilih anggota, jenis sampah aktif, dan berat yang benar.',true);return;}
    if(Number(waste.harga_per_kg)<=0){msg('weighMessage','Harga jenis sampah masih Rp0. Atur harga terlebih dahulu.',true);return;}
    const row={anggota_id:memberId,jenis_sampah_id:wasteId,berat_kg:weight,harga_per_kg:Number(waste.harga_per_kg),petugas_id:sessionUser.id};
    const {error}=await sb.from('penimbangan').insert(row);
    if(error){msg('weighMessage',error.message,true);return;}
    e.target.reset();$('weighEstimate').value='';msg('weighMessage','Penimbangan tersimpan; saldo anggota ditambahkan otomatis oleh database.');await loadMembers();await loadWeighings();await loadDashboard();    
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
  init();
})();
