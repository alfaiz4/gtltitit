(async () => {

const $ = s => document.querySelector(s);
let supabase, configured = false;
try {
  // URL & anon key dari variabel Railway (disajikan server lewat /config.js)
  const cfg = window.__CONFIG__ || {};
  const url = cfg.SUPABASE_URL, key = cfg.SUPABASE_ANON_KEY;
  if (!window.supabase) throw new Error('Pustaka Supabase gagal dimuat (cek internet/adblock, dan pastikan index.html versi terbaru).');
  configured = !!url && !!key && !url.includes('YOUR-') && !key.includes('YOUR-');
  supabase = window.supabase.createClient(url || 'https://placeholder.supabase.co', key || 'placeholder');
} catch (e) {
  $('#app').innerHTML = `<div class="card p-5 max-w-md mx-auto mt-10"><b>Gagal memuat aplikasi</b>
    <p class="mut text-sm mt-2">${String(e.message || e)}</p>
    <p class="text-sm mt-2">Periksa URL (harus diawali https://) dan anon key di Railway Variables, serta koneksi internet.</p></div>`;
  throw e;
}
const rp = n => 'Rp ' + Number(n || 0).toLocaleString('id-ID');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const QRIS_IMG = 'assets/qris.svg'; // ganti dengan gambar QRIS statis toko
const todayStr = () => new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 10);

const S = { open: true, products: [], cart: [], cat: 'Semua', view: 'home', method: null, paid: 0,
  orders: [], date: todayStr(), fStatus: '', fPay: '' };
const tot = () => S.cart.reduce((a, c) => a + c.price * c.qty, 0);
const isAdmin = () => location.hash.startsWith('#/admin');

// ---------- Modal ----------
const M = html => { $('#mbox').innerHTML = html; $('#modal').classList.remove('hidden'); };
const closeM = () => $('#modal').classList.add('hidden');
const ask = (msg, ok = 'Ya') => new Promise(res => {
  M(`<p class="mb-5 font-medium">${msg}</p><div class="flex gap-2"><button class="btn2 flex-1" id="n">Tidak</button><button class="btn flex-1" id="y">${ok}</button></div>`);
  $('#n').onclick = () => { closeM(); res(false); };
  $('#y').onclick = () => { closeM(); res(true); };
});

// ---------- Data ----------
async function loadStore() {
  const { data } = await supabase.from('store_settings').select('is_open').eq('id', 1).single();
  if (data) S.open = data.is_open;
}
async function loadProducts() {
  const { data } = await supabase.from('products').select('*').order('name');
  S.products = (data || []).map(p => ({ ...p, price: Number(p.price) }));
  R();
}
async function loadOrders() {
  const d = new Date(S.date + 'T00:00:00'), e = new Date(d.getTime() + 864e5);
  const { data } = await supabase.from('orders').select('*, order_items(product_name, quantity)')
    .gte('created_at', d.toISOString()).lt('created_at', e.toISOString()).order('created_at', { ascending: false });
  S.orders = data || [];
  R();
}

async function loadStaff() {
  const { data } = await supabase.from('profiles').select('id, name, email, role').order('role').order('name');
  S.staff = data || [];
  R();
}

// ---------- Aksi ----------
const A = window.A = {
  add(id) {
    const p = S.products.find(x => x.id === id); if (!p || p.stock <= 0) return;
    const c = S.cart.find(x => x.id === id);
    if (c) { if (c.qty < p.stock) c.qty++; } else S.cart.push({ id, name: p.name, price: p.price, qty: 1 });
    R();
  },
  qty(id, d) {
    const c = S.cart.find(x => x.id === id), p = S.products.find(x => x.id === id);
    c.qty = Math.min(c.qty + d, p ? p.stock : c.qty + d);
    if (c.qty <= 0) S.cart = S.cart.filter(x => x !== c);
    R();
  },
  cat(c) { S.cat = c; R(); },
  checkout() {
    if (!S.cart.length) return;
    M(`<h3 class="font-bold mb-1">Metode Pembayaran</h3><p class="mut mb-4">Total ${rp(tot())}</p>
      <div class="grid grid-cols-2 gap-2 mb-3"><button class="btn py-6" onclick="A.method('Cash')">💵 Cash</button>
      <button class="btn py-6" onclick="A.method('QRIS')">📱 QRIS</button></div>
      <button class="btn2 w-full" onclick="closeM()">Tutup</button>`);
  },
  method(m) { closeM(); S.method = m; S.paid = 0; S.view = m === 'Cash' ? 'cash' : 'qris'; R(); },
  paid(v) {
    S.paid = Number(v) || 0;
    $('#change').textContent = rp(Math.max(0, S.paid - tot()));
    $('#ok').disabled = S.paid < tot();
  },
  async pay() { if (await ask('Apakah Anda yakin pembayaran telah diterima?', 'Ya, Sudah')) finish('Sukses'); },
  async cancel() { if (await ask('Batalkan pesanan ini?', 'Ya, Batalkan')) finish('Dibatalkan'); },
  print() { window.print(); },
  done() { closeM(); reset(); },
  // Admin
  async toggleStore() {
    S.open = !S.open; R();
    await supabase.from('store_settings').update({ is_open: S.open }).eq('id', 1);
  },
  prodForm(id) {
    const p = S.products.find(x => x.id === id) || { name: '', price: '', category: 'Umum', stock: 0, image_url: '' };
    M(`<h3 class="font-bold mb-3">${id ? 'Edit' : 'Tambah'} Produk</h3><div class="grid gap-2">
      <input id="pn" class="inp" placeholder="Nama" value="${esc(p.name)}">
      <input id="pp" class="inp" type="number" placeholder="Harga" value="${p.price}">
      <input id="pc" class="inp" placeholder="Kategori" value="${esc(p.category)}">
      <input id="ps" class="inp" type="number" placeholder="Stok (0 = habis)" value="${p.stock}">
      <input id="pi" class="inp" placeholder="URL gambar (opsional)" value="${esc(p.image_url)}"></div>
      <div class="flex gap-2 mt-4"><button class="btn2 flex-1" onclick="closeM()">Batal</button>
      <button class="btn flex-1" onclick="A.saveProd('${id || ''}')">Simpan</button></div>`);
  },
  async saveProd(id) {
    const row = { name: $('#pn').value.trim(), price: Number($('#pp').value), category: $('#pc').value.trim() || 'Umum',
      stock: Number($('#ps').value) || 0, image_url: $('#pi').value.trim() || null };
    if (!row.name || !(row.price >= 0)) return alert('Nama dan harga wajib diisi');
    const q = id ? supabase.from('products').update(row).eq('id', id) : supabase.from('products').insert(row);
    const { error } = await q; if (error) return alert(error.message);
    closeM(); loadProducts();
  },
  async delProd(id) {
    if (!(await ask('Hapus produk ini?', 'Hapus'))) return;
    await supabase.from('products').delete().eq('id', id); loadProducts();
  },
  date(v) { S.date = v; loadOrders(); },
  f(k, v) { S[k] = v; R(); }
};
window.closeM = closeM;

function reset() { S.cart = []; S.view = 'home'; S.method = null; S.paid = 0; loadProducts(); }

async function finish(status) {
  const total = tot();
  const no = 'INV-' + new Date().toISOString().replace(/\D/g, '').slice(2, 14);
  const { data: o, error } = await supabase.from('orders')
    .insert({ order_number: no, total_amount: total, payment_method: S.method, payment_status: status }).select().single();
  if (error) return alert('Gagal menyimpan: ' + error.message);
  const { error: e2 } = await supabase.from('order_items')
    .insert(S.cart.map(c => ({ order_id: o.id, product_id: c.id, product_name: c.name, quantity: c.qty, price: c.price })));
  if (e2) return alert('Gagal menyimpan item: ' + e2.message);
  if (status !== 'Sukses') return reset();
  for (const c of S.cart) {
    const p = S.products.find(x => x.id === c.id);
    if (p) await supabase.from('products').update({ stock: Math.max(0, p.stock - c.qty) }).eq('id', c.id);
  }
  const lines = S.cart.map(c => `<div class="flex justify-between"><span>${esc(c.name)} x${c.qty}</span><span>${rp(c.price * c.qty)}</span></div>`).join('');
  M(`<div id="receipt" class="text-sm font-mono"><div class="text-center font-bold">STRUK PEMBAYARAN</div>
    <div class="text-center">${no}<br>${new Date(o.created_at).toLocaleString('id-ID')}<br>Kasir: ${esc(S.name)}</div><hr class="my-2">${lines}<hr class="my-2">
    <div class="flex justify-between font-bold"><span>Total</span><span>${rp(total)}</span></div>
    <div class="flex justify-between"><span>Metode</span><span>${S.method}</span></div>
    ${S.method === 'Cash' ? `<div class="flex justify-between"><span>Tunai</span><span>${rp(S.paid)}</span></div>
    <div class="flex justify-between"><span>Kembali</span><span>${rp(S.paid - total)}</span></div>` : ''}
    <div class="text-center mt-2">Terima kasih!</div></div>
    <div class="flex gap-2 mt-4"><button class="btn2 flex-1" onclick="A.done()">Tutup</button>
    <button class="btn flex-1" onclick="A.print()">🖨 Cetak Struk</button></div>`);
}

// ---------- Tampilan ----------
const itemList = () => S.cart.map(c => `<div class="flex justify-between py-1"><span>${esc(c.name)} × ${c.qty}</span><span>${rp(c.price * c.qty)}</span></div>`).join('');

function kasir() {
  if (!S.open) return `<div class="card p-10 text-center mt-10"><div class="text-5xl mb-3">🔒</div>
    <h2 class="text-2xl font-bold ac">Toko Sedang Tutup - Transaksi Dihentikan</h2><p class="mut mt-2">Hubungi admin untuk membuka toko.</p></div>`;
  if (S.view === 'cash' || S.view === 'qris') {
    const cash = S.view === 'cash';
    return `<div class="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-4xl mx-auto"><div class="card p-5">
      <h2 class="font-bold mb-2">Detail Pesanan</h2>${itemList()}<hr class="my-2" style="border-color:var(--bd)">
      <div class="flex justify-between text-xl font-bold"><span>Total</span><span class="ac">${rp(tot())}</span></div></div>
      <div class="card p-5"><h2 class="font-bold mb-3">Pembayaran ${cash ? 'Cash' : 'QRIS'}</h2>
      ${cash ? `<label class="mut text-sm">Uang diterima</label>
        <input class="inp text-xl my-2" type="number" inputmode="numeric" oninput="A.paid(this.value)" placeholder="0">
        <div class="flex justify-between mb-4"><span>Kembalian</span><b id="change" class="ac">${rp(0)}</b></div>`
      : `<img src="${QRIS_IMG}" class="w-56 mx-auto bg-white rounded-xl p-2 mb-3" alt="QRIS">
        <p class="text-center mb-4">Bayar: <b class="ac text-xl">${rp(tot())}</b></p>`}
      <div class="flex gap-2"><button class="btn2 flex-1" onclick="A.cancel()">${cash ? 'Batalkan' : 'Batalkan Pesanan'}</button>
      <button id="ok" class="btn flex-1" ${cash ? 'disabled' : ''} onclick="A.pay()">${cash ? 'Konfirmasi Selesai' : 'Pembayaran Sukses'}</button></div></div></div>`;
  }
  const cats = ['Semua', ...new Set(S.products.map(p => p.category))];
  const list = S.products.filter(p => S.cat === 'Semua' || p.category === S.cat);
  return `<div class="grid grid-cols-1 lg:grid-cols-3 gap-4"><section class="lg:col-span-2">
    <div class="flex gap-2 overflow-x-auto mb-3">${cats.map(c => `<button onclick="A.cat('${esc(c)}')" class="${c === S.cat ? 'btn' : 'btn2'} whitespace-nowrap">${esc(c)}</button>`).join('')}</div>
    <div class="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">${list.map(p => `
      <button onclick="A.add('${p.id}')" ${p.stock <= 0 ? 'disabled' : ''} class="card p-3 text-left ${p.stock <= 0 ? 'opacity-40' : ''}">
        ${p.image_url ? `<img src="${esc(p.image_url)}" class="h-24 w-full object-cover rounded-lg mb-2">` : `<div class="h-24 rounded-lg mb-2 flex items-center justify-center text-3xl" style="background:var(--bg)">🍽️</div>`}
        <div class="font-semibold">${esc(p.name)}</div><div class="ac">${rp(p.price)}</div>
        <div class="mut text-xs">${p.stock > 0 ? 'Stok ' + p.stock : 'Habis'}</div></button>`).join('') || '<p class="mut">Belum ada produk.</p>'}</div></section>
    <aside class="card p-4 h-fit lg:sticky lg:top-20"><h2 class="font-bold mb-2">Keranjang</h2>
    ${S.cart.map(c => `<div class="flex items-center justify-between py-1 gap-2"><div class="flex-1"><div>${esc(c.name)}</div><div class="mut text-xs">${rp(c.price * c.qty)}</div></div>
      <button class="btn2 !p-1 w-8" onclick="A.qty('${c.id}',-1)">−</button><b>${c.qty}</b><button class="btn2 !p-1 w-8" onclick="A.qty('${c.id}',1)">+</button></div>`).join('') || '<p class="mut">Keranjang kosong</p>'}
    <hr class="my-3" style="border-color:var(--bd)"><div class="flex justify-between text-xl font-bold mb-3"><span>Total</span><span class="ac">${rp(tot())}</span></div>
    <button class="btn w-full" ${S.cart.length ? '' : 'disabled'} onclick="A.checkout()">Checkout</button></aside></div>`;
}

function admin() {
  const rows = S.orders.filter(o => (!S.fStatus || o.payment_status === S.fStatus) && (!S.fPay || o.payment_method === S.fPay));
  const omset = S.orders.filter(o => o.payment_status === 'Sukses').reduce((a, o) => a + Number(o.total_amount), 0);
  const opt = (v, cur) => `<option value="${v}" ${v === cur ? 'selected' : ''}>${v || 'Semua'}</option>`;
  return `<div class="grid grid-cols-1 gap-4 max-w-5xl mx-auto">
  <div class="card p-4 flex items-center justify-between"><div><h2 class="font-bold">Status Toko</h2>
    <p class="mut text-sm">Saat ini: <b class="${S.open ? 'ac' : ''}">${S.open ? 'BUKA' : 'TUTUP'}</b></p></div>
    <button onclick="A.toggleStore()" class="relative w-16 h-8 rounded-full" style="background:${S.open ? 'var(--ac)' : 'var(--bd)'}">
    <span class="absolute top-1 w-6 h-6 rounded-full bg-white transition-all" style="left:${S.open ? '2.2rem' : '.25rem'}"></span></button></div>

  <div class="card p-4"><div class="flex justify-between mb-3"><h2 class="font-bold">Katalog Produk</h2>
    <button class="btn" onclick="A.prodForm()">+ Tambah</button></div><div class="overflow-x-auto"><table class="w-full text-sm min-w-[480px]">
    <tr class="mut text-left"><th>Produk</th><th>Kategori</th><th>Harga</th><th>Stok</th><th></th></tr>
    ${S.products.map(p => `<tr class="border-t" style="border-color:var(--bd)"><td class="py-2 whitespace-nowrap pr-3">${esc(p.name)}</td><td class="pr-3">${esc(p.category)}</td><td class="whitespace-nowrap pr-3">${rp(p.price)}</td><td>${p.stock}</td>
    <td class="text-right whitespace-nowrap"><button class="btn2 !py-1" onclick="A.prodForm('${p.id}')">Edit</button> <button class="btn2 !py-1" onclick="A.delProd('${p.id}')">Hapus</button></td></tr>`).join('')}</table></div></div>

  <div class="card p-4"><h2 class="font-bold mb-3">Karyawan</h2><div class="overflow-x-auto"><table class="w-full text-sm min-w-[420px]">
    <tr class="mut text-left"><th>Nama</th><th>Email</th><th>Peran</th><th></th></tr>
    ${S.staff.map(u => `<tr class="border-t" style="border-color:var(--bd)"><td class="py-2 pr-3 whitespace-nowrap">${esc(u.name)}</td><td class="pr-3">${esc(u.email)}</td><td class="pr-3">${esc(u.role)}</td>
    <td class="text-right"><button class="btn2 !py-1 whitespace-nowrap" onclick="A.editStaff('${u.id}')">Ubah Nama</button></td></tr>`).join('')}</table></div></div>

  <div class="card p-4"><h2 class="font-bold mb-3">Laporan Penjualan</h2>
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-3">
      <input type="date" class="inp" value="${S.date}" onchange="A.date(this.value)">
      <select class="inp" onchange="A.f('fStatus',this.value)">${['', 'Sukses', 'Dibatalkan', 'Pending'].map(v => opt(v, S.fStatus)).join('')}</select>
      <select class="inp" onchange="A.f('fPay',this.value)">${['', 'Cash', 'QRIS'].map(v => opt(v, S.fPay)).join('')}</select></div>
    <p class="mb-3">Omset (Sukses): <b class="ac text-xl">${rp(omset)}</b> <span class="mut text-sm">· ${rows.length} transaksi</span></p>
    <div class="overflow-x-auto"><table class="w-full text-sm min-w-[720px]"><tr class="mut text-left"><th>ID</th><th>Jam</th><th>Item</th><th>Total</th><th>Metode</th><th>Status</th><th>Kasir</th></tr>
    ${rows.map(o => `<tr class="border-t align-top" style="border-color:var(--bd)"><td class="py-2">${esc(o.order_number)}</td>
      <td>${new Date(o.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}</td>
      <td>${o.order_items.map(i => `${esc(i.product_name)} ×${i.quantity}`).join('<br>')}</td><td>${rp(o.total_amount)}</td><td>${o.payment_method}</td>
      <td class="${o.payment_status === 'Sukses' ? 'ac' : ''}">${o.payment_status}</td><td class="whitespace-nowrap">${esc(o.cashier_name || '-')}</td></tr>`).join('') || '<tr><td colspan="7" class="mut py-3">Tidak ada transaksi.</td></tr>'}</table></div></div></div>`;
}

// ---------- Login & Auth ----------
Object.assign(S, { user: null, role: null, err: '', name: '', staff: [] });
let ch;

const loginView = () => `<form onsubmit="A.login(event)" class="card p-6 max-w-sm mx-auto mt-16 grid gap-3">
  <h1 class="text-xl font-bold ac text-center">Masuk Karyawan</h1>
  <p class="mut text-sm text-center">Akses hanya untuk karyawan terdaftar.</p>
  ${configured ? '' : '<p class="text-red-500 text-sm">Variabel SUPABASE_URL & SUPABASE_ANON_KEY belum diisi (Railway → Variables)</p>'}
  <input id="em" type="email" class="inp" placeholder="Email" required autocomplete="username">
  <input id="pw" type="password" class="inp" placeholder="Password" required autocomplete="current-password">
  ${S.err ? `<p class="text-red-500 text-sm">${esc(S.err)}</p>` : ''}
  <button id="lb" class="btn">Masuk</button></form>`;

A.editStaff = id => {
  const u = S.staff.find(x => x.id === id); if (!u) return;
  M(`<h3 class="font-bold mb-1">Profil Karyawan</h3><p class="mut text-sm mb-3">${esc(u.email)}</p>
    <input id="sn" class="inp" placeholder="Nama karyawan" value="${esc(u.name)}">
    <div class="flex gap-2 mt-4"><button class="btn2 flex-1" onclick="closeM()">Batal</button>
    <button class="btn flex-1" onclick="A.saveStaff('${id}')">Simpan</button></div>`);
};
A.saveStaff = async id => {
  const name = $('#sn').value.trim(); if (!name) return alert('Nama wajib diisi');
  const { error } = await supabase.from('profiles').update({ name }).eq('id', id);
  if (error) return alert(error.message);
  closeM(); loadStaff();
};
A.login = async e => {
  e.preventDefault(); $('#lb').disabled = true;
  const { error } = await supabase.auth.signInWithPassword({ email: $('#em').value.trim(), password: $('#pw').value });
  if (error) { S.err = 'Email atau password salah'; return R(); }
  S.err = ''; await start();
};
A.logout = async () => {
  await supabase.auth.signOut();
  if (ch) { supabase.removeChannel(ch); ch = null; }
  Object.assign(S, { user: null, role: null, name: '', staff: [], cart: [], view: 'home', orders: [], products: [] });
  closeM(); $('#logout').classList.add('hidden'); location.hash = ''; R();
};
$('#logout').onclick = A.logout;

async function start() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return R();
  const { data: p } = await supabase.from('profiles').select('role, name').eq('id', session.user.id).single();
  if (!p) {
    await supabase.auth.signOut(); S.err = 'Akun belum terdaftar sebagai karyawan'; return R();
  }
  S.user = session.user; S.role = p.role; S.name = p.name || session.user.email;
  $('#logout').classList.remove('hidden');
  if (S.role !== 'admin' && isAdmin()) location.hash = '#/kasir';
  else if (!location.hash) location.hash = S.role === 'admin' ? '#/admin' : '#/kasir';
  await loadStore(); await loadProducts(); if (isAdmin()) { loadOrders(); loadStaff(); }
  if (ch) supabase.removeChannel(ch);
  ch = supabase.channel('rt')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'store_settings' }, p => { S.open = p.new.is_open; R(); })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, loadProducts)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => { if (isAdmin()) loadOrders(); })
    .subscribe();
}

function R() {
  if (!S.user) { $('#app').innerHTML = loginView(); return; }
  $('#app').innerHTML = isAdmin() && S.role === 'admin' ? admin() : kasir();
}
window.addEventListener('hashchange', () => {
  if (!S.user) return;
  if (S.role !== 'admin' && isAdmin()) { location.hash = '#/kasir'; return; }
  if (isAdmin()) { loadOrders(); loadStaff(); }
  R();
});

R();
try { await start(); } catch (e) { S.err = 'Gagal terhubung: ' + (e.message || e); R(); }
})();
