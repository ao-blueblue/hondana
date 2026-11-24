/* わたしの本棚 — 端末の中だけで動く蔵書アプリ */
'use strict';
{
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const nfkc = s => String(s || '').normalize('NFKC');
const norm = s => nfkc(s).toLowerCase().replace(/[\s・:：\-－―‐()（）\[\]［］【】「」『』〈〉《》!！?？.,、。~〜'"]/g, '');
const newId = () => 'b' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const today = () => { const d = new Date(); return new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };
const dstr = ms => { if (!ms) return ''; const d = new Date(ms); return isNaN(d) ? '' : new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };
const jdate = s => { if (!s) return ''; const m = String(s).match(/^(\d{4})-?(\d{2})?-?(\d{2})?/); if (!m) return String(s); return m[1] + '年' + (m[2] ? (+m[2]) + '月' : '') + (m[3] ? (+m[3]) + '日' : ''); };
const httpsUrl = u => (u = String(u || '').replace(/^http:\/\//, 'https://'), /^https:\/\//.test(u) ? u : '');

const FORMATS = ['紙', 'Kindle', 'BookWalker', 'その他電子'];
const GENRES = ['漫画', '小説', '技法書', 'その他'];
const READS = ['読んだ', 'まだ']; // 何も付いていない（''）＝未設定
// 前の版の言い方を読み替える（積読は「何も付けていない」扱いに戻す）
const normRead = v => { v = nfkc(v).trim(); if (/^(読んだ|読了|既読|read|done)$/i.test(v)) return '読んだ'; if (/^(まだ|未読|読書中|読みかけ|reading|unread)$/i.test(v)) return 'まだ'; return ''; };
const FMARK = { '紙': '', 'Kindle': 'K', 'BookWalker': 'BW', 'その他電子': '電' };
const CLOTH = ['#3d5f86', '#7a2f2a', '#3f5a3c', '#6b4f7d', '#8a6a2e', '#2d3a55', '#7d3b4f', '#3f6b6c', '#5a4636', '#44506b'];
const hash = s => { let h = 2166136261; for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
const tint = s => CLOTH[hash(s) % CLOTH.length];

/* ---------- ISBN ---------- */
function ok13(s) { if (!/^\d{13}$/.test(s)) return false; let t = 0; for (let i = 0; i < 13; i++) t += (+s[i]) * (i % 2 ? 3 : 1); return t % 10 === 0; }
function ok10(s) { if (!/^\d{9}[\dX]$/.test(s)) return false; let t = 0; for (let i = 0; i < 10; i++) t += (s[i] === 'X' ? 10 : +s[i]) * (10 - i); return t % 11 === 0; }
function to13(s) { const b = '978' + s.slice(0, 9); let t = 0; for (let i = 0; i < 12; i++) t += (+b[i]) * (i % 2 ? 3 : 1); return b + ((10 - t % 10) % 10); }
function normIsbn(v) { const s = nfkc(v).replace(/[^0-9Xx]/g, '').toUpperCase(); if (s.length === 13 && ok13(s) && /^97[89]/.test(s)) return s; if (s.length === 10 && ok10(s)) return to13(s); return ''; }
// 日本の本の下段バーコード（192 + Cコード4桁 + 価格）からCコードを取り出す
function priceCode(v) { const s = nfkc(v).replace(/\D/g, ''); return /^19[12]\d{10}$/.test(s) && ok13(s) ? s.slice(3, 7) : ''; }

/* ---------- ジャンル・シリーズ ---------- */
function genreFromC(c) { // Cコード：2桁目=発行形態、3〜4桁目=内容
  if (!/^\d{4}$/.test(c)) return '';
  const form = c[1], body = c.slice(2);
  if (form === '9' || body === '79') return '漫画';
  if (body === '93' || body === '97') return '小説';
  if (/^7[0-3]$/.test(body)) return '技法書';
  return 'その他';
}
function genreFromText(...xs) {
  const t = xs.join(' ');
  if (/コミック|comic|漫画|まんが|マンガ|graphic novel/i.test(t)) return '漫画';
  if (/技法|描き方|デッサン|イラスト.*(講座|教室|入門|テクニック)|画材|配色|色彩|クロッキー|作画|art\b|drawing|painting/i.test(t)) return '技法書';
  if (/小説|文庫|fiction|novel|ノベル/i.test(t)) return '小説';
  return '';
}
const KANJI_VOL = { '上': 1, '中': 2, '下': 3, '前編': 1, '後編': 2, '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9, '十': 10 };
function parseSeries(title) {
  let t = nfkc(title).trim();
  t = t.replace(/\s+=\s+.*?(?=[\s.　]*(?:第?\(?\d{1,4}\)?巻?|vol\.?\s*\d+|上|中|下)?\s*$)/i, '').replace(/\s*\.\s*(?=\d+\s*$)/, ' ').trim();
  t = t.replace(/\s*[(（][^()（）]*(コミックス|comics|文庫|新書|ノベルス|books|ブックス|レーベル|kc|ジャンプ|サンデー|マガジン|デジタル版|電子版)[^()（）]*[)）]\s*$/i, '').trim();
  const pats = [
    /^(.+?)[\s　]*第?[（(]?\s*(\d{1,4})\s*[)）]?\s*巻?$/,
    /^(.+?)[\s　]*(?:vol\.?|volume|book|#)\s*(\d{1,4})$/i,
    /^(.+?)[\s　]*第?(\d{1,4})巻.*$/,
    /^(.+?)[\s　]*[（(]?(上|中|下|前編|後編)[)）]?$/,
  ];
  for (const p of pats) { const m = t.match(p); if (m && m[1].trim().length >= 1) { const v = KANJI_VOL[m[2]] ?? parseInt(m[2], 10); if (v > 0 && v < 2000) return { series: m[1].replace(/[\s　:：\-－,、.]+$/, '').trim(), vol: v }; } }
  return { series: '', vol: null };
}
const seriesKey = b => norm(b.series || '');

/* ---------- 保存 ---------- */
const KEY = 'hondana.books';
let books = new Map();
function migrateOld(list) {
  return list.map(o => ({ id: o.id || newId(), title: o.title || '', author: o.author || '', publisher: o.publisher || '', isbn: o.isbn || '', asin: o.asin || '',
    series: o.series ?? parseSeries(o.title).series, vol: o.vol ?? parseSeries(o.title).vol, genre: o.genre || genreFromText(o.title) || 'その他',
    format: FORMATS.includes(o.format) ? o.format : '紙', place: o.place || '', status: o.status === 'sold' ? 'sold' : 'own',
    read: normRead(o.read), readAt: normRead(o.read) === '読んだ' ? (o.readAt || '') : '', pubdate: o.pubdate || '', boughtAt: o.boughtAt || dstr(o.addedAt) || today(),
    cover: o.cover || '', memo: o.memo || '', soldAt: o.soldAt || '', soldTo: o.soldTo || '', soldPrice: o.soldPrice ?? null, addedAt: o.addedAt || Date.now() }));
}
function load() {
  let list = [];
  try { list = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { list = null; }
  if (!list) { try { const old = JSON.parse(localStorage.getItem('shelf.books') || '[]'); list = migrateOld(old); } catch (e) { list = []; } }
  books = new Map(list.map(b => { const r = normRead(b.read); return [b.id, { ...b, read: r, readAt: r === '読んだ' ? (b.readAt || '') : '' }]; }));
}
let saveFailed = false;
function save() {
  try { localStorage.setItem(KEY, JSON.stringify([...books.values()])); saveFailed = false; }
  catch (e) { saveFailed = true; toast('保存できませんでした。iPhoneの空き容量を確かめてください。'); }
}
function putMany(list) { const now = Date.now(); list.forEach(b => { b.updatedAt = now; books.set(b.id, b); }); save(); render(); }
const put = b => putMany([b]);
function removeBook(id) { books.delete(id); save(); dropPhoto(id).then(render); render(); }
const lsGet = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch (e) { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };

function findDup(b, exceptId) {
  const t = norm(b.title);
  for (const x of books.values()) {
    if (x.id === exceptId) continue;
    if (b.isbn && x.isbn === b.isbn) return x;
    if (b.asin && x.asin === b.asin) return x;
    if (t && norm(x.title) === t && (!b.format || x.format === b.format)) return x;
  }
  return null;
}

/* ---------- 書誌を調べる（openBD → 国立国会図書館 → Google Books） ---------- */
const lookCache = new Map();
function cleanAuthor(a) {
  if (!a) return '';
  a = nfkc(a);
  const ROLE = /^(原作|作画|著|作|文|絵|訳|編|編著|監修|イラスト|漫画|画|原案|著者|作者|翻訳)$/;
  return String(a).split(/[\/／;；]|\s{2,}/).map(p => p.trim()
      .replace(/^(原作|作画|著|作|文|絵|訳|編|編著|監修|イラスト|漫画|画|原案|翻訳)[\s　]+/, '')
      .replace(/[,，]?\s*\d{4}\s*-\s*(\d{4})?\s*$/, '')
      .replace(/(／|\s)?(著|作|文|絵|訳|編|編著|監修|イラスト|原作|漫画|画|作画|原案|著者)$/, '').trim())
    .filter(p => p && !ROLE.test(p))
    .map(p => /[぀-ヿ一-鿿]/.test(p) ? p.replace(/[,，]\s*/g, '') : p.split(/,\s*/).reverse().join(' '))
    .filter((v, i, arr) => arr.indexOf(v) === i).join('・');
}
function cleanTitle(t, vol) { t = nfkc(t).replace(/\s+/g, ' ').replace(/\s+=\s+.*?(?=[\s.]*(?:\d{1,4}|上|中|下)?\s*$)/, '').replace(/\s*:\s*\[[^\]]*\]/g, '').replace(/\[[^\]]*\]/g, '').replace(/\s+\./g, '.').trim(); if (vol && !t.includes(vol)) t += ' ' + vol; return t; }
function normPubdate(s) { const m = nfkc(s).match(/(\d{4})[-.\/年]?(\d{1,2})?[-.\/月]?(\d{1,2})?/); if (!m) return ''; return m[1] + (m[2] ? '-' + m[2].padStart(2, '0') : '') + (m[3] ? '-' + m[3].padStart(2, '0') : ''); }
async function fetchJson(u, ms = 8000) { const c = new AbortController(), t = setTimeout(() => c.abort(), ms); try { const r = await fetch(u, { signal: c.signal }); if (!r.ok) throw 0; return await r.json(); } finally { clearTimeout(t); } }
async function fetchText(u, ms = 8000) { const c = new AbortController(), t = setTimeout(() => c.abort(), ms); try { const r = await fetch(u, { signal: c.signal }); if (!r.ok) throw 0; return await r.text(); } finally { clearTimeout(t); } }
async function fromOpenBD(isbn) {
  const j = await fetchJson('https://api.openbd.jp/v1/get?isbn=' + isbn); const it = j && j[0]; if (!it || !it.summary || !it.summary.title) return null;
  const s = it.summary; if (s.isbn && nfkc(s.isbn).replace(/\D/g, '') !== isbn) return null;
  let ccode = '';
  try { (it.onix.DescriptiveDetail.Subject || []).forEach(x => { if (x.SubjectSchemeIdentifier === '78' && /^\d{4}$/.test(x.SubjectCode)) ccode = x.SubjectCode; }); } catch (e) {}
  return { title: cleanTitle(s.title, s.volume), author: cleanAuthor(s.author), publisher: s.publisher || '', pubdate: normPubdate(s.pubdate), cover: httpsUrl(s.cover), series: s.series || '', genre: genreFromC(ccode) };
}
async function fromNDL(isbn) {
  const x = await fetchText('https://ndlsearch.ndl.go.jp/api/opensearch?isbn=' + isbn); const d = new DOMParser().parseFromString(x, 'application/xml'); const item = d.querySelector('item'); if (!item) return null;
  const g = sel => { const e = item.getElementsByTagName(sel)[0]; return e ? e.textContent.trim() : ''; };
  const ids = [...item.getElementsByTagName('dc:identifier')].map(e => nfkc(e.textContent).replace(/[^0-9X]/gi, '').toUpperCase());
  if (!ids.some(v => v === isbn || v === isbn10(isbn))) return null;
  const title = g('dc:title') || g('title'); if (!title) return null;
  const vol = g('dcndl:volume'); const subj = [...item.getElementsByTagName('dc:subject')].map(e => e.textContent).join(' ');
  let genre = ''; const ndc = (subj.match(/\b(\d{3}(?:\.\d+)?)\b/) || [])[1] || '';
  if (/^726\.1/.test(ndc)) genre = '漫画'; else if (/^9\d3/.test(ndc)) genre = '小説'; else if (/^7[0-3]\d/.test(ndc) || /^75\d/.test(ndc)) genre = '技法書';
  return { title: cleanTitle(title, vol), author: cleanAuthor(g('dc:creator') || g('author')), publisher: g('dc:publisher'), pubdate: normPubdate(g('dcterms:issued') || g('dc:date')), cover: '', series: g('dcndl:seriesTitle'), genre };
}
async function fromGoogle(isbn) {
  const j = await fetchJson('https://www.googleapis.com/books/v1/volumes?q=isbn:' + isbn);
  const hit = (j && j.items || []).find(it => (it.volumeInfo && it.volumeInfo.industryIdentifiers || []).some(x => { const v = String(x.identifier || '').replace(/[^0-9X]/gi, '').toUpperCase(); return v === isbn || v === isbn10(isbn); }));
  const v = hit && hit.volumeInfo; if (!v || !v.title) return null;
  return { title: v.title + (v.subtitle ? ' ' + v.subtitle : ''), author: (v.authors || []).join('・'), publisher: v.publisher || '', pubdate: normPubdate(v.publishedDate), cover: httpsUrl(v.imageLinks && (v.imageLinks.thumbnail || v.imageLinks.smallThumbnail)).replace('&edge=curl', ''), series: '', genre: genreFromText((v.categories || []).join(' ')) };
}
async function lookup(isbn) {
  if (lookCache.has(isbn)) return lookCache.get(isbn);
  const res = await Promise.allSettled([fromOpenBD(isbn), fromNDL(isbn), fromGoogle(isbn)]);
  const [a, n, g] = res.map(r => r.status === 'fulfilled' ? r.value : null);
  if (!a && !n && !g) return null;
  const pick = k => (a && a[k]) || (n && n[k]) || (g && g[k]) || '';
  const r = { title: pick('title'), author: pick('author'), publisher: pick('publisher'), pubdate: pick('pubdate'), cover: (a && a.cover) || (g && g.cover) || '', series: pick('series'), genre: pick('genre') };
  if (!r.genre) r.genre = genreFromText(r.title, r.publisher);
  lookCache.set(isbn, r); return r;
}
function seriesGenre(series) {
  const k = norm(series); if (!k) return '';
  for (const x of books.values()) if (seriesKey(x) === k && x.genre && x.genre !== 'その他') return x.genre;
  return '';
}
function bookFromLookup(isbn, r, extra = {}) {
  const ps = parseSeries(r?.title || ''), ser = ps.series || (r && r.series) || '';
  const g = (r?.genre && r.genre !== 'その他') ? r.genre : (seriesGenre(ser) || r?.genre || 'その他');
  if (!extra.genre) delete extra.genre;
  return { id: newId(), addedAt: Date.now(), status: 'own', read: '', readAt: '', boughtAt: today(), memo: '', soldAt: '', soldTo: '', soldPrice: null, asin: '',
    isbn, title: r?.title || '', author: r?.author || '', publisher: r?.publisher || '', pubdate: r?.pubdate || '', cover: r?.cover || '',
    series: ser, vol: ps.vol, genre: g, format: '紙', place: '', ...extra };
}

/* ---------- 表紙 ---------- */
// 撮った表紙の写真は IndexedDB に保存（localStorage には入りきらないため）
const idb = (() => {
  let p;
  const open = () => p || (p = new Promise((res, rej) => { const r = indexedDB.open('hondana', 1); r.onupgradeneeded = () => r.result.createObjectStore('covers'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }));
  const run = async (mode, fn) => { const db = await open(); return new Promise((res, rej) => { const t = db.transaction('covers', mode); fn(t.objectStore('covers')); t.oncomplete = () => res(); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error); }); };
  return {
    put: (k, v) => run('readwrite', s => s.put(v, k)),
    del: k => run('readwrite', s => s.delete(k)),
    all: async () => { const out = new Map(); await run('readonly', s => { const c = s.openCursor(); c.onsuccess = () => { const cur = c.result; if (cur) { out.set(cur.key, cur.value); cur.continue(); } }; }); return out; },
  };
})();
const photos = new Map(); // 本のid → 表示用URL
if (lsGet('hondana.covVer', '') !== '3') { lsSet('hondana.nocover', '[]'); lsSet('hondana.covVer', '3'); }
let noCov = new Set((() => { try { return JSON.parse(lsGet('hondana.nocover', '[]')); } catch (e) { return []; } })());
let ncTimer; const saveNoCov = () => { clearTimeout(ncTimer); ncTimer = setTimeout(() => lsSet('hondana.nocover', JSON.stringify([...noCov])), 400); };
// 表紙の候補を順番に試す：撮った写真 → 調べたときの表紙 → Amazon（ISBN-10）→ 国立国会図書館
function isbn10(i13) { if (!/^978\d{10}$/.test(i13 || '')) return ''; const c = i13.slice(3, 12); let t = 0; for (let i = 0; i < 9; i++) t += (+c[i]) * (10 - i); const d = (11 - t % 11) % 11; return c + (d === 10 ? 'X' : d); }
const workUrl = new Map(); // 本のid → 実際に表示できた表紙のURL（この起動中だけ覚える）
function coverCands(b) {
  const out = [], add = u => { u = httpsUrl(u); if (u && !out.includes(u)) out.push(u); };
  if (workUrl.has(b.id)) add(workUrl.get(b.id));
  if (b.cover && !/ndlsearch/.test(b.cover)) add(b.cover);
  const i10 = isbn10(b.isbn); if (i10) add(`https://images-na.ssl-images-amazon.com/images/P/${i10}.09.LZZZZZZZ.jpg`);
  if (b.asin && /^B0/i.test(b.asin)) add(`https://images-na.ssl-images-amazon.com/images/P/${b.asin}.09.LZZZZZZZ.jpg`);
  if (b.isbn) add('https://ndlsearch.ndl.go.jp/thumbnail/' + b.isbn + '.jpg');
  return out;
}
window.__nc = (img, id) => {
  const list = (img.dataset.next || '').split(' ').filter(Boolean);
  if (list.length) { img.dataset.next = list.slice(1).join(' '); img.src = list[0]; return; }
  const box = img.parentNode; if (box) box.classList.add('nocv'); img.remove(); if (id && !noCov.has(id)) { noCov.add(id); saveNoCov(); }
};
window.__ok = (img, id) => { if (img.naturalWidth < 5) { window.__nc(img, id); return; } if (!img.src.startsWith('blob:')) workUrl.set(id, img.src); if (noCov.delete(id)) saveNoCov(); };
const hasCover = b => photos.has(b.id) || (coverCands(b).length > 0 && !noCov.has(b.id));
function coverHtml(b, cls = 'cv') {
  const bg = tint(b.series || b.title || b.isbn), label = b.title || ('ISBN ' + b.isbn), ph = photos.get(b.id);
  const cands = ph ? [ph] : coverCands(b), src = cands[0];
  const img = src ? `<img src="${esc(src)}" alt="" loading="lazy" referrerpolicy="no-referrer" data-id="${esc(b.id)}" data-next="${esc(cands.slice(1).join(' '))}" onerror="__nc(this,this.dataset.id)" onload="__ok(this,this.dataset.id)">` : '';
  return `<div class="${cls}${src ? '' : ' nocv'}" style="background:${bg};color:#eef1f6"><span>${esc(label)}</span>${img}</div>`;
}
function volImg(b) { const c = photos.has(b.id) ? [photos.get(b.id)] : coverCands(b); return c.length ? `<img src="${esc(c[0])}" alt="" loading="lazy" referrerpolicy="no-referrer" data-id="${esc(b.id)}" data-next="${esc(c.slice(1).join(' '))}" onerror="__nc(this,this.dataset.id)" onload="__ok(this,this.dataset.id)">` : ''; }
async function photoBlob(file) {
  const url = URL.createObjectURL(file);
  try {
    const im = new Image(); im.src = url; await im.decode();
    const sc = Math.min(1, 900 / Math.max(im.naturalWidth, im.naturalHeight)), cv = document.createElement('canvas');
    cv.width = Math.round(im.naturalWidth * sc); cv.height = Math.round(im.naturalHeight * sc); cv.getContext('2d').drawImage(im, 0, 0, cv.width, cv.height);
    return await new Promise(r => cv.toBlob(r, 'image/jpeg', .82));
  } finally { URL.revokeObjectURL(url); }
}
async function setPhoto(id, blob) {
  await idb.put(id, blob); const old = photos.get(id); if (old) URL.revokeObjectURL(old);
  photos.set(id, URL.createObjectURL(blob)); if (noCov.delete(id)) saveNoCov();
}
async function dropPhoto(id) { try { await idb.del(id); } catch (e) {} const old = photos.get(id); if (old) URL.revokeObjectURL(old); photos.delete(id); }

/* ---------- 画面 ---------- */
const ui = Object.assign({ genre: 'all', status: 'own', view: 'grid', sort: 'new' }, (() => { try { return JSON.parse(lsGet('hondana.ui', '{}')); } catch (e) { return {}; } })());
if (['積読', '読書中', '読了'].includes(ui.status)) ui.status = 'own';
const saveUi = () => lsSet('hondana.ui', JSON.stringify(ui));
let query = '';
const app = $('app');
const svgSearch = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#8790a8" stroke-width="1.8" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>';
const svgBack = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>';

function passes(b) {
  if (ui.status === 'own' && b.status === 'sold') return false;
  if (ui.status === 'sold' && b.status !== 'sold') return false;
  if (ui.status === 'nocover' && (b.status === 'sold' || hasCover(b))) return false;
  if (['読んだ', 'まだ', 'unset'].includes(ui.status) && (b.status === 'sold' || (b.read || 'unset') !== ui.status)) return false;
  if (ui.genre !== 'all' && (b.genre || 'その他') !== ui.genre) return false;
  if (query) { const qi = normIsbn(query); if (qi) return b.isbn === qi; const q = norm(query); return norm([b.title, b.author, b.series, b.publisher, b.place, b.memo, b.isbn, b.asin].join(' ')).includes(q); }
  return true;
}
function groups() {
  const list = [...books.values()].filter(passes), map = new Map(), out = [];
  for (const b of list) { const k = seriesKey(b); if (k) { if (!map.has(k)) map.set(k, []); map.get(k).push(b); } else out.push({ one: b }); }
  for (const [k, bs] of map) { if (bs.length > 1) out.push({ key: k, books: bs }); else out.push({ one: bs[0] }); }
  const latest = g => g.one ? (g.one.addedAt || 0) : Math.max(...g.books.map(b => b.addedAt || 0));
  const name = g => g.one ? g.one.title : g.books[0].series;
  out.sort(ui.sort === 'title' ? (a, b) => String(name(a)).localeCompare(String(name(b)), 'ja') : (a, b) => latest(b) - latest(a));
  return out;
}
// シリーズごとの「全○巻」は自分で入れる（どのデータベースにも確かな情報がないため）
let serInfo = (() => { try { return JSON.parse(lsGet('hondana.series', '{}')) || {}; } catch (e) { return {}; } })();
const saveSerInfo = () => lsSet('hondana.series', JSON.stringify(serInfo));
const totalOf = key => +(serInfo[key] && serInfo[key].total) || 0;
function missingVols(bs, key) {
  const vs = [...new Set(bs.filter(b => b.status !== 'sold' && b.vol).map(b => +b.vol))].sort((a, b) => a - b), total = totalOf(key ?? seriesKey(bs[0] || {}));
  const top = Math.max(vs[vs.length - 1] || 0, total);
  if (!total && vs.length < 2 && !(vs.length === 1 && vs[0] > 1)) return { max: top, miss: [], total };
  const miss = []; for (let i = 1; i <= top; i++) if (!vs.includes(i)) miss.push(i);
  return { max: top, miss: miss.length > 60 ? [] : miss, total };
}
function resultsHtml() {
  const gs = groups();
  if (!gs.length) {
    return !books.size ? `<div class="empty"><b>本棚はまだ空っぽです</b>右下の「バーコードで追加」で紙の本を、右上のメニューからKindleやBOOK☆WALKERの本を取り込めます。</div>`
      : query ? `<div class="empty"><b>見つかりませんでした</b>${normIsbn(query) ? 'このISBNの本はまだ持っていません。' : '「' + esc(query) + '」に当てはまる本はありません。'}</div>`
      : `<div class="empty"><b>この条件の本はありません</b>上の絞り込みを切り替えてみてください。</div>`;
  }
  if (ui.view === 'shelf') {
    const sp = gs.flatMap(g => g.one ? [g.one] : g.books.slice().sort((a, b) => (a.vol || 0) - (b.vol || 0)));
    return `<div class="shelf"><div class="srow">${sp.map(b => { const h = hash(b.id), ht = 130 + (h >> 5) % 46; return `<div class="slot"><button class="sp" data-book="${esc(b.id)}" style="height:${ht}px;background:${tint(b.series || b.title)}${b.status === 'sold' ? ';opacity:.4' : ''}" title="${esc(b.title)}"><span style="max-height:${ht - 20}px;color:#eef1f6">${esc(b.series && b.vol ? b.series + ' ' + b.vol : (b.title || 'ISBN ' + b.isbn))}</span></button></div>`; }).join('')}</div></div>`;
  }
  return `<div class="grid">${gs.map(g => {
    if (g.one) { const b = g.one; return `<button class="tile${b.status === 'sold' ? ' sold' : ''}" data-book="${esc(b.id)}"><div style="position:relative">${coverHtml(b)}${FMARK[b.format] ? `<span class="fmt">${FMARK[b.format]}</span>` : ''}</div><span class="tt">${esc(b.title || 'ISBN ' + b.isbn)}</span></button>`; }
    const bs = g.books.slice().sort((a, b) => (a.vol || 0) - (b.vol || 0)), top = (bs.find(b => photos.has(b.id)) || bs.find(b => b.cover && !/ndlsearch/.test(b.cover)) || bs.find(b => b.isbn || b.asin) || bs[0]), m = missingVols(bs);
    return `<button class="tile" data-series="${esc(g.key)}"><div class="stack">${coverHtml({ ...top, title: bs[0].series })}<span class="badge">${m.total ? `${bs.filter(b => b.status !== 'sold').length}/${m.total}` : bs.length + '冊'}</span>${m.miss.length ? '<span class="miss" title="抜けている巻があります"></span>' : ''}</div><span class="tt">${esc(bs[0].series)}</span></button>`;
  }).join('')}</div>`;
}
function renderHome() {
  const all = [...books.values()], own = all.filter(b => b.status !== 'sold');
  const nRead = own.filter(b => b.read === '読んだ').length, nYet = own.filter(b => b.read === 'まだ').length;
  const last = lsGet('hondana.lastBackup', '');
  const needBk = own.length >= 10 && (!last || Date.now() - Date.parse(last) > 30 * 864e5);
  const chips = [['all', 'すべて'], ...GENRES.map(g => [g, g])].map(([v, l]) => `<button class="chip" data-genre="${v}" aria-pressed="${ui.genre === v}">${l}</button>`).join('');
  const statusOpts = [['own', '持っている'], ['読んだ', '読んだ'], ['まだ', 'まだ読んでない'], ['unset', '読んだか未設定'], ['sold', '売った'], ['nocover', '表紙なし'], ['all', 'すべて']].map(([v, l]) => `<option value="${v}" ${ui.status === v ? 'selected' : ''}>${l}</option>`).join('');
  app.innerHTML = `<div class="top">
    <div class="hrow"><div><h1>わたしの本棚</h1><p class="stats">持っている ${own.length}冊・読んだ ${nRead}冊${nYet ? `・まだ ${nYet}冊` : ''}</p></div>
      <div style="display:flex;gap:8px;align-items:center">
        <svg width="40" height="40" viewBox="0 0 44 44" aria-hidden="true"><circle cx="22" cy="22" r="17" fill="none" stroke="var(--gold)" stroke-width="1.2"/><path d="M25 9L15 24h7l-3 11 11-16h-7z" fill="none" stroke="var(--blue)" stroke-width="1.5" stroke-linejoin="round"/></svg>
        <button class="icon-btn" id="menuBtn" aria-label="メニュー"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#c9cfdc" stroke-width="1.8" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg></button></div></div>
    <label class="search">${svgSearch}<input id="q" type="search" placeholder="書名・著者・ISBN（書店で「持ってたっけ？」にも）" value="${esc(query)}" aria-label="本を探す"></label>
    <div class="chips">${chips}</div>
    <div style="display:flex;gap:8px;align-items:center">
      <select class="sel" id="statusSel" aria-label="状態">${statusOpts}</select>
      <select class="sel" id="sortSel" aria-label="並び順"><option value="new" ${ui.sort === 'new' ? 'selected' : ''}>追加が新しい順</option><option value="title" ${ui.sort === 'title' ? 'selected' : ''}>書名順</option></select>
      <div style="flex:1"></div>
      <button class="icon-btn vt" id="viewBtn" aria-pressed="${ui.view === 'shelf'}" aria-label="${ui.view === 'shelf' ? '表紙の表示に切り替え' : '背表紙の棚に切り替え'}" style="height:36px;border-color:var(--blue)">${ui.view === 'shelf'
      ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--blue)" stroke-width="1.8" aria-hidden="true"><rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="9"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>'
      : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--blue)" stroke-width="1.8" aria-hidden="true"><path d="M5 4v16M10 6v14M15 4v16M20 7v13M3 20h18"/></svg>'}</button>
    </div></div>
    ${needBk ? `<div class="backup"><span>${last ? '前回のバックアップから時間が経っています。' : 'まだバックアップしていません。'}</span><button class="btn" id="bkNow" style="min-height:36px;flex:none">書き出す</button></div>` : ''}
    <div id="results">${resultsHtml()}</div>`;
  const q = $('q');
  const upd = () => { query = q.value; $('results').innerHTML = resultsHtml(); };
  q.addEventListener('input', e => { if (!e.isComposing) upd(); });
  q.addEventListener('compositionend', upd);
  $('statusSel').onchange = e => { ui.status = e.target.value; saveUi(); render(); };
  $('sortSel').onchange = e => { ui.sort = e.target.value; saveUi(); render(); };
  $('viewBtn').onclick = () => { ui.view = ui.view === 'shelf' ? 'grid' : 'shelf'; saveUi(); render(); };
  $('menuBtn').onclick = openMenu;
  if ($('bkNow')) $('bkNow').onclick = exportCsv;
}
function infoRows(rows) { return `<div class="info">${rows.filter(r => r[1]).map(([k, v]) => `<div class="ir"><span>${k}</span><span>${v}</span></div>`).join('')}</div>`; }
function renderSeries(key) {
  const bs = [...books.values()].filter(b => seriesKey(b) === key).sort((a, b) => (a.vol || 1e9) - (b.vol || 1e9) || (a.addedAt - b.addedAt));
  if (!bs.length) { location.hash = ''; return; }
  const own = bs.filter(b => b.status !== 'sold'), m = missingVols(bs, key), name = bs[0].series;
  const authors = [...new Set(bs.flatMap(b => String(b.author || '').split(/[・、]/)).map(x => x.trim()).filter(Boolean))].slice(0, 3).join('・');
  const fm = [...new Set(own.map(b => b.format))].join('・'), places = [...new Set(own.map(b => b.place).filter(Boolean))].join('、');
  const pubs = [...new Set(bs.map(b => b.publisher).filter(Boolean))].join('、');
  const byVol = new Map(); bs.forEach(b => { if (b.vol && !byVol.has(+b.vol)) byVol.set(+b.vol, b); });
  const tiles = [];
  if (m.max) for (let i = 1; i <= m.max; i++) {
    const b = byVol.get(i);
    tiles.push(b ? `<button class="vol" data-book="${esc(b.id)}" style="background:${tint(name)}${b.status === 'sold' ? ';opacity:.4' : ''}" aria-label="${i}巻">${volImg(b)}<span class="n">${i}${FMARK[b.format] ? ' ' + FMARK[b.format] : ''}</span></button>`
      : `<button class="vol gap" data-addvol="${i}" aria-label="${i}巻を追加"><b>${i}</b>なし</button>`);
  }
  bs.filter(b => !b.vol || ![...byVol.values()].includes(b)).forEach(b => tiles.push(`<button class="vol" data-book="${esc(b.id)}" style="background:${tint(name)}">${volImg(b)}<span class="n">${esc((b.title || '').slice(0, 4))}</span></button>`));
  const top = (bs.find(b => photos.has(b.id)) || bs.find(b => b.cover && !/ndlsearch/.test(b.cover)) || bs.find(b => b.isbn || b.asin) || bs[0]);
  app.innerHTML = `<div class="page">
    <button class="back" data-home>${svgBack}本棚</button>
    <div class="hero"><div class="cvbox"><div class="stack">${coverHtml({ ...top, title: name })}</div></div>
      <div style="display:flex;flex-direction:column;justify-content:center;gap:2px">
        <h2>${esc(name)}</h2>${authors ? `<p class="sub">${esc(authors)}</p>` : ''}
        <p style="margin:8px 0 0;font-size:14px">${m.total ? `全${m.total}巻のうち ` : m.max ? `${m.max}巻まで、` : ''}<b style="color:var(--gold)">${own.length}冊</b> 持っています${m.total && !m.miss.length && own.length >= m.total ? '<br><span style="color:var(--gold)">全巻そろっています</span>' : ''}</p>
        ${m.miss.length ? `<p style="margin:2px 0 0;font-size:13px;color:var(--blue);font-weight:700">${m.miss.length > 4 ? m.miss.slice(0, 4).join('・') + '巻ほか' : m.miss.join('・') + '巻'}がありません</p>` : ''}
      </div></div>
    <h3>巻</h3><div class="vols">${tiles.join('')}</div>
    ${infoRows([['形態', esc(fm)], ['置き場所', esc(places)], ['出版社', esc(pubs)]])}
    <label class="ir" style="align-items:center"><span>全何巻？</span><span style="display:flex;align-items:center;gap:6px">全<input id="serTotal" inputmode="numeric" value="${m.total || ''}" placeholder="${m.max || ''}" style="width:64px;height:40px;border:1px solid var(--ctl);border-radius:8px;background:var(--p1);text-align:center;font-size:16px">巻</span></label>
    <label class="ir" style="align-items:center"><span>ジャンル（全巻）</span><select id="serGenre" class="sel" style="height:40px">${GENRES.map(g => `<option ${g === (bs.find(b => b.genre !== 'その他') || bs[0]).genre ? 'selected' : ''}>${g}</option>`).join('')}</select></label>
    <div class="row" style="margin-top:20px"><button class="btn gold" id="addNext">${m.miss.length ? m.miss[0] : (m.max || own.length) + 1}巻をバーコードで追加</button></div>
    <p class="note" style="margin-top:12px">巻の表紙を押すと、その1冊の詳しい情報が開きます。シリーズ名や巻数は1冊ごとの「編集」で直せます。</p>
  </div>`;
  $('addNext').onclick = () => openScan({ format: own[0]?.format, place: own[0]?.place, genre: (bs.find(b => b.genre !== 'その他') || {}).genre });
  $('serTotal').onchange = e => { const n = parseInt(nfkc(e.target.value), 10); if (n > 0 && n < 2000) serInfo[key] = { ...(serInfo[key] || {}), total: n }; else if (serInfo[key]) delete serInfo[key].total; saveSerInfo(); render(); };
  $('serGenre').onchange = e => { putMany(bs.map(b => ({ ...b, genre: e.target.value }))); toast(`このシリーズを全部「${e.target.value}」にしました`); };
}
function renderBook(id) {
  const b = books.get(id); if (!b) { location.hash = ''; return; }
  const inSeries = b.series && [...books.values()].filter(x => seriesKey(x) === seriesKey(b)).length > 1;
  app.innerHTML = `<div class="page">
    <button class="back" data-${inSeries ? 'series="' + esc(seriesKey(b)) + '"' : 'home'}>${svgBack}${inSeries ? esc(b.series) : '本棚'}</button>
    <div style="display:flex;flex-direction:column;align-items:center;gap:6px;padding:6px 0 16px">
      <div style="width:120px">${coverHtml(b)}</div>
      <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap;justify-content:center">
        <label class="btn" for="coverIn" style="min-height:40px;display:inline-flex;align-items:center;gap:8px;${hasCover(b) ? '' : 'border-color:var(--blue);color:var(--blue)'}"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>${photos.has(b.id) ? '表紙を撮り直す' : '表紙を撮る'}</label>
        ${photos.has(b.id) ? '<button class="btn" id="unPhoto" style="min-height:40px">写真の表紙を外す</button>' : ''}
      </div>
      <input type="file" id="coverIn" accept="image/*" hidden>
      <h2 style="margin:10px 0 0;font:700 22px/1.35 var(--serif);text-align:center">${esc(b.title || 'ISBN ' + b.isbn)}</h2>
      ${b.author ? `<p class="sub">${esc(b.author)}</p>` : ''}
      ${b.status === 'sold' ? '<p style="margin:4px 0 0;font-size:13px;color:var(--blue);font-weight:700">売った本</p>' : ''}
    </div>
    ${b.status === 'sold' ? '' : `<div class="seg" role="group" aria-label="読書の状態">${READS.map(r => `<button data-read="${r}" aria-pressed="${b.read === r}">${r}</button>`).join('')}</div><p class="note" style="margin:6px 0 0;text-align:center">${b.read ? 'もう一度押すと、未設定に戻ります' : 'まだ何も付けていません'}</p>`}
    ${infoRows([['読み終えた日', b.read === '読んだ' && b.readAt ? jdate(b.readAt) : ''], ['シリーズ', b.series ? esc(b.series) + (b.vol ? ` ${b.vol}巻` : '') : ''], ['出版社', esc(b.publisher)], ['出版日', jdate(b.pubdate)], ['形態', esc(b.format)], ['購入日', jdate(b.boughtAt)], ['置き場所', esc(b.place)], ['ジャンル', esc(b.genre)], ['ISBN', esc(b.isbn)],
      ['売った日', b.status === 'sold' ? jdate(b.soldAt) || '—' : ''], ['売った先', b.status === 'sold' ? esc(b.soldTo) : ''], ['金額', b.status === 'sold' && b.soldPrice ? b.soldPrice.toLocaleString() + '円' : ''], ['メモ', esc(b.memo).replace(/\n/g, '<br>')]])}
    <div class="row" style="margin-top:20px"><button class="btn" id="bSold">${b.status === 'sold' ? '持っているに戻す' : '売った'}</button><button class="btn gold" id="bEdit">編集</button></div>
    <div class="row" style="margin-top:10px">${b.isbn ? '<button class="btn" id="bRelook">情報を調べ直す</button>' : ''}<button class="btn danger" id="bDel">削除</button></div>
  </div>`;
  app.querySelectorAll('[data-read]').forEach(x => x.onclick = () => { const r = b.read === x.dataset.read ? '' : x.dataset.read, nb = { ...b, read: r, readAt: r === '読んだ' ? (b.readAt || (b.read === 'まだ' ? today() : '')) : '' }; put(nb); });
  $('bEdit').onclick = () => openEdit(b);
  if ($('bRelook')) $('bRelook').onclick = async () => {
    $('bRelook').disabled = true; $('bRelook').textContent = '調べています…';
    lookCache.delete(b.isbn); const r = await lookup(b.isbn);
    if (!r) { toast('このISBNの本は見つかりませんでした'); render(); return; }
    const nb = bookFromLookup(b.isbn, r);
    put({ ...b, title: nb.title || b.title, author: nb.author || b.author, publisher: nb.publisher || b.publisher, pubdate: nb.pubdate || b.pubdate, series: nb.series || b.series, vol: nb.vol ?? b.vol,
      genre: b.genre && b.genre !== 'その他' ? b.genre : nb.genre, cover: nb.cover || b.cover });
    if (noCov.delete(b.id)) saveNoCov(); toast(`「${nb.title || b.title}」として調べ直しました`);
  };
  $('coverIn').onchange = async () => {
    const f = $('coverIn').files[0]; $('coverIn').value = ''; if (!f) return;
    try { const blob = await photoBlob(f); if (!blob) throw 0; await setPhoto(b.id, blob); put({ ...b, photo: true }); toast('表紙を付けました'); }
    catch (e) { toast('写真を保存できませんでした。もう一度お試しください'); }
  };
  if ($('unPhoto')) $('unPhoto').onclick = async () => { await dropPhoto(b.id); put({ ...b, photo: false }); toast('写真の表紙を外しました'); };
  $('bSold').onclick = () => { if (b.status === 'sold') { put({ ...b, status: 'own', soldAt: '', soldTo: '', soldPrice: null }); toast('持っているに戻しました'); } else { const nb = { ...b, status: 'sold', soldAt: today() }; put(nb); openEdit(nb, '売った先や金額も残せます'); } };
  let armed = false;
  $('bDel').onclick = async () => { if (!armed) { armed = true; $('bDel').textContent = 'もう一度押すと削除します'; return; } const keep = photos.has(b.id) ? await idb.all().then(m => m.get(b.id)).catch(() => null) : null;
    removeBook(b.id); go(''); toast(`「${b.title || 'ISBN ' + b.isbn}」を削除しました`, async () => { if (keep) await setPhoto(b.id, keep); put(b); }); };
}
function render() {
  const h = decodeURIComponent(location.hash.slice(1));
  if (h.startsWith('s-')) renderSeries(h.slice(2)); else if (h.startsWith('b-')) renderBook(h.slice(2)); else renderHome();
  $('fab').hidden = h.startsWith('b-');
  $('places').innerHTML = [...new Set([...books.values()].map(b => b.place).filter(Boolean))].map(p => `<option value="${esc(p)}">`).join('');
}
const go = h => { if (location.hash === h) render(); else location.hash = h; };
window.addEventListener('hashchange', () => { render(); window.scrollTo(0, 0); });
app.addEventListener('click', e => {
  const t = e.target.closest('[data-book],[data-series],[data-home],[data-genre],[data-addvol]'); if (!t) return;
  if (t.dataset.genre) { ui.genre = t.dataset.genre; saveUi(); render(); return; }
  if (t.dataset.addvol) { const key = decodeURIComponent(location.hash.slice(3)); const ex = [...books.values()].find(b => seriesKey(b) === key); openScan({ format: ex?.format, place: ex?.place, genre: ex && ex.genre !== 'その他' ? ex.genre : '' }); return; }
  if ('home' in t.dataset) { go(''); return; }
  if (t.dataset.series) { go('#s-' + encodeURIComponent(t.dataset.series)); return; }
  if (t.dataset.book) go('#b-' + encodeURIComponent(t.dataset.book));
});

/* ---------- シート共通 ---------- */
let lastFocus = null;
function openV(id) { lastFocus = document.activeElement; $(id).classList.add('on'); document.body.style.overflow = 'hidden'; }
function closeV(id) { if (id === 'vScan') stopScan(); $(id).classList.remove('on'); if (!document.querySelector('.veil.on')) document.body.style.overflow = ''; lastFocus?.focus?.(); }
document.querySelectorAll('.veil').forEach(v => v.addEventListener('click', e => { if (e.target === v || e.target.closest('[data-close]')) closeV(v.id); }));
document.addEventListener('keydown', e => { if (e.key === 'Escape') document.querySelectorAll('.veil.on').forEach(v => closeV(v.id)); });
const opts = (list, sel) => list.map(x => `<option ${x === sel ? 'selected' : ''}>${x}</option>`).join('');
$('fFmt').innerHTML = opts(FORMATS); $('fGenre').innerHTML = opts(GENRES); $('scanFmt').innerHTML = opts(FORMATS); $('impFmt').innerHTML = opts(FORMATS.slice(1));
let tt; function toast(t, undo) { $('tMsg').textContent = t; $('tUndo').hidden = !undo; $('tUndo').onclick = () => { undo(); $('toast').classList.remove('on'); }; $('toast').classList.add('on'); clearTimeout(tt); tt = setTimeout(() => $('toast').classList.remove('on'), undo ? 7000 : 3000); }

/* ---------- 編集 ---------- */
let editing = null;
function editMsg(t, warn) { $('editMsg').textContent = t; $('editMsg').className = 'msg' + (warn ? ' warn' : ''); }
function dupNote(b, exceptId) { const d = findDup(b, exceptId); return d ? `もう持っているかもしれません：「${d.title || 'ISBN ' + d.isbn}」（${d.format}${d.status === 'sold' ? '・売った' : ''}${d.place ? '・' + d.place : ''}）` : ''; }
function openEdit(b, note) {
  editing = b && books.has(b.id) ? b : null;
  const v = b || bookFromLookup('', null, { place: lsGet('hondana.lastPlace', '') });
  $('editT').textContent = editing ? '編集' : '本を追加';
  $('fIsbn').value = v.isbn || ''; $('fTitle').value = v.title || ''; $('fAuthor').value = v.author || ''; $('fPub').value = v.publisher || '';
  $('fSeries').value = v.series || ''; $('fVol').value = v.vol || ''; $('fGenre').value = v.genre || 'その他'; $('fFmt').value = v.format || '紙';
  $('fPubdate').value = v.pubdate || ''; $('fBought').value = v.boughtAt || today(); $('fPlace').value = v.place || ''; $('fRead').value = v.read || '';
  $('fReadAt').value = v.readAt || ''; $('fMemo').value = v.memo || ''; $('fSoldAt').value = v.soldAt || ''; $('fSoldTo').value = v.soldTo || ''; $('fSoldPrice').value = v.soldPrice ?? '';
  $('soldBox').hidden = v.status !== 'sold'; $('fReadAtBox').hidden = $('fRead').value !== '読んだ';
  $('editForm').dataset.base = JSON.stringify(v);
  editMsg(note || ''); openV('vEdit'); setTimeout(() => (editing ? $('fTitle') : $('fIsbn')).focus(), 40);
}
$('fRead').addEventListener('change', () => { $('fReadAtBox').hidden = $('fRead').value !== '読んだ'; });
$('fTitle').addEventListener('change', () => { if (!$('fSeries').value) { const p = parseSeries($('fTitle').value); if (p.series) { $('fSeries').value = p.series; $('fVol').value = p.vol; } } if (!editing) { const d = dupNote({ title: $('fTitle').value, format: $('fFmt').value }); if (d) editMsg(d, true); } });
$('fIsbn').addEventListener('change', async () => {
  const raw = $('fIsbn').value; if (!raw.trim()) return; const i = normIsbn(raw);
  if (!i) { editMsg('ISBNの形が正しくないようです（13桁か10桁）。', true); return; }
  $('fIsbn').value = i; const d = dupNote({ isbn: i }, editing?.id); if (d) { editMsg(d, true); return; }
  if ($('fTitle').value.trim()) return;
  editMsg('書名を調べています…'); const r = await lookup(i); if ($('fIsbn').value !== i) return;
  if (!r) { editMsg(navigator.onLine === false ? 'オフラインのため調べられませんでした。手で入れてください。' : 'このISBNの本は見つかりませんでした。手で入れてください。', true); return; }
  const nb = bookFromLookup(i, r);
  [['fTitle', 'title'], ['fAuthor', 'author'], ['fPub', 'publisher'], ['fSeries', 'series'], ['fVol', 'vol'], ['fPubdate', 'pubdate']].forEach(([f, k]) => { if (!$(f).value && nb[k]) $(f).value = nb[k]; });
  if (!JSON.parse($('editForm').dataset.base || '{}').genreFixed) $('fGenre').value = nb.genre; const base = JSON.parse($('editForm').dataset.base || '{}'); base.cover = nb.cover; $('editForm').dataset.base = JSON.stringify(base);
  editMsg('書名を調べて入れました。合っていれば「保存」を押してください。');
});
$('editForm').addEventListener('submit', e => {
  e.preventDefault();
  const base = editing ? { ...editing } : JSON.parse($('editForm').dataset.base || '{}');
  if (!base.id) Object.assign(base, bookFromLookup('', null));
  const isbnRaw = $('fIsbn').value.trim(), isbn = normIsbn(isbnRaw);
  if (isbnRaw && !isbn) { editMsg('ISBNの形が正しくないようです。直すか空にしてください。', true); return; }
  const title = $('fTitle').value.trim(); if (!title && !isbn) { editMsg('書名かISBNを入れてください。', true); $('fTitle').focus(); return; }
  const vol = parseInt(nfkc($('fVol').value), 10), price = nfkc($('fSoldPrice').value).replace(/\D/g, '');
  Object.assign(base, { isbn, title, author: $('fAuthor').value.trim(), publisher: $('fPub').value.trim(), series: $('fSeries').value.trim(), vol: vol > 0 ? vol : null,
    genre: $('fGenre').value, format: $('fFmt').value, pubdate: $('fPubdate').value.trim(), boughtAt: $('fBought').value, place: $('fPlace').value.trim(), read: $('fRead').value,
    readAt: $('fRead').value === '読んだ' ? $('fReadAt').value : '', memo: $('fMemo').value.trim() });
  if (base.status === 'sold') { base.soldAt = $('fSoldAt').value; base.soldTo = $('fSoldTo').value.trim(); base.soldPrice = price ? +price : null; }
  delete base.genreFixed;
  const isNew = !editing; put(base); if (base.place) lsSet('hondana.lastPlace', base.place); closeV('vEdit');
  toast(isNew ? `「${base.title || 'ISBN ' + base.isbn}」を追加しました` : '保存しました');
  if (isNew) go('#b-' + encodeURIComponent(base.id));
});

/* ---------- バーコード ---------- */
let stream = null, scanTimer = null, lastCode = '', lastAt = 0, detector = null, zr = null, scanCount = 0, lastAdded = null;
const scanCv = document.createElement('canvas');
function scanSay(t, warn) { $('scanMsg').textContent = t; $('scanMsg').className = 'msg' + (warn ? ' warn' : ''); }
async function openScan(pre = {}) {
  $('scanList').innerHTML = ''; scanCount = 0; lastAdded = null;
  $('scanFmt').value = pre.format || lsGet('hondana.lastFmt', '紙'); $('scanRead').value = ''; $('scanGenre').value = pre.genre || ''; $('scanPlace').value = pre.place ?? lsGet('hondana.lastPlace', '');
  scanSay('本の裏のバーコード（978で始まる上の段）を、枠の中に横向きに映してください。続けて下の段も読むと、ジャンルが自動で付きます。'); openV('vScan');
  if (!navigator.mediaDevices?.getUserMedia) { scanSay('ここではカメラを使えません。「写真から読む」か「手で入力する」をお使いください。', true); return; }
  try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false }); }
  catch (e) { scanSay('カメラを使えませんでした。iPhoneの「設定」→「Safari」→「カメラ」を「許可」にしてください。', true); return; }
  if (!$('vScan').classList.contains('on')) { stopScan(); return; }
  const v = $('video'); v.srcObject = stream; try { await v.play(); } catch (e) {}
  if (!detector && 'BarcodeDetector' in window) { try { const f = await BarcodeDetector.getSupportedFormats(); if (f.includes('ean_13')) detector = new BarcodeDetector({ formats: ['ean_13'] }); } catch (e) {} }
  if (!detector && window.ZXing && !zr) { zr = new ZXing.MultiFormatReader(); const h = new Map(); h.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, [ZXing.BarcodeFormat.EAN_13]); h.set(ZXing.DecodeHintType.TRY_HARDER, true); zr.setHints(h); }
  tick();
}
function stopScan() { clearTimeout(scanTimer); scanTimer = null; if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; } $('video').srcObject = null; }
async function tick() {
  if (!stream) return; const v = $('video'); let codes = [];
  if (v.readyState >= 2 && v.videoWidth) {
    if (detector) { try { codes = (await detector.detect(v)).map(r => r.rawValue); } catch (e) {} }
    else if (zr) {
      const w = v.videoWidth, h = v.videoHeight, ch = h * .5; scanCv.width = Math.min(w, 1000); scanCv.height = ch * scanCv.width / w;
      scanCv.getContext('2d', { willReadFrequently: true }).drawImage(v, 0, (h - ch) / 2, w, ch, 0, 0, scanCv.width, scanCv.height);
      try { const r = zr.decodeWithState(new ZXing.BinaryBitmap(new ZXing.HybridBinarizer(new ZXing.HTMLCanvasElementLuminanceSource(scanCv)))); codes = [r.getText()]; } catch (e) {}
    }
  }
  for (const c of codes) {
    if (c === lastCode && Date.now() - lastAt < 4000) continue;
    const isbn = normIsbn(c), cc = priceCode(c);
    if (isbn) { lastCode = c; lastAt = Date.now(); await onIsbn(isbn); break; }
    if (cc && lastAdded && Date.now() - lastAdded.at < 15000) { lastCode = c; lastAt = Date.now(); const b = books.get(lastAdded.id), g = genreFromC(cc); if (b && g && b.genre !== g) { put({ ...b, genre: g }); scanSay(`ジャンルを「${g}」にしました。次の本をどうぞ。`); } break; }
  }
  if (stream) scanTimer = setTimeout(tick, 160);
}
async function onIsbn(isbn) {
  try { navigator.vibrate?.(60); } catch (e) {}
  const fmt = $('scanFmt').value, place = $('scanPlace').value.trim(), rd = $('scanRead').value, gn = $('scanGenre').value; lsSet('hondana.lastFmt', fmt); if (place) lsSet('hondana.lastPlace', place);
  const d = findDup({ isbn });
  if (!$('scanCont').checked) {
    closeV('vScan'); openEdit(bookFromLookup(isbn, null, { format: fmt, place, read: rd, genre: gn, genreFixed: !!gn })); $('fIsbn').dispatchEvent(new Event('change')); return;
  }
  if (d) { scanSay(`もう持っています：${d.title || 'ISBN ' + isbn}（${d.format}${d.status === 'sold' ? '・売った' : ''}${d.place ? '・' + d.place : ''}）`, true); return; }
  scanSay(`ISBN ${isbn} を調べています…`);
  const r = await lookup(isbn), b = bookFromLookup(isbn, r, { format: fmt, place, read: rd, genre: gn });
  put(b); scanCount++; lastAdded = { id: b.id, at: Date.now() };
  const li = document.createElement('li'); li.innerHTML = `<div class="mini">${coverHtml(b)}</div><span></span>`; li.querySelector('span').textContent = (b.title || `ISBN ${isbn}（書名はあとで）`) + (b.author ? ' — ' + b.author : '');
  $('scanList').prepend(li);
  scanSay(r ? `${scanCount}冊目を登録しました。次の本をどうぞ。` : `${scanCount}冊目を登録しました（書名が見つからなかったので、あとで編集してください）。`, !r);
}
async function decodeFile(file) {
  const out = []; let bmp; try { bmp = await createImageBitmap(file); } catch (e) { return ''; }
  if ('BarcodeDetector' in window) { try { (await new BarcodeDetector({ formats: ['ean_13'] }).detect(bmp)).forEach(r => out.push(r.rawValue)); } catch (e) {} }
  const pick = () => out.map(normIsbn).find(Boolean) || '';
  if (pick() || !window.ZXing) return pick();
  const h = new Map(); h.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, [ZXing.BarcodeFormat.EAN_13]); h.set(ZXing.DecodeHintType.TRY_HARDER, true);
  const reader = new ZXing.MultiFormatReader(); reader.setHints(h);
  for (const [y0, y1] of [[0, 1], [0, .55], [.45, 1], [.2, .8]]) {
    const sc = Math.min(1, 1600 / bmp.width), cv = document.createElement('canvas'), sh = (y1 - y0) * bmp.height;
    cv.width = bmp.width * sc; cv.height = sh * sc; cv.getContext('2d').drawImage(bmp, 0, y0 * bmp.height, bmp.width, sh, 0, 0, cv.width, cv.height);
    try { out.push(reader.decodeWithState(new ZXing.BinaryBitmap(new ZXing.HybridBinarizer(new ZXing.HTMLCanvasElementLuminanceSource(cv)))).getText()); } catch (e) {}
    if (pick()) break;
  }
  return pick();
}
$('photoIn').addEventListener('change', async () => {
  const f = $('photoIn').files[0]; $('photoIn').value = ''; if (!f) return;
  scanSay('写真からバーコードを探しています…'); const isbn = await decodeFile(f);
  if (!isbn) { scanSay('バーコードが見つかりませんでした。バーコードを大きく、ピントを合わせて撮ってみてください。', true); return; }
  await onIsbn(isbn);
});
$('toManual').onclick = () => { closeV('vScan'); openEdit(null); };
$('fab').onclick = () => openScan();

/* ---------- メニュー・取り込み ---------- */
function openMenu() { const l = lsGet('hondana.lastBackup', ''); $('lastBk').textContent = l ? `前回のバックアップ：${jdate(l)}` : 'まだ一度もバックアップしていません'; openV('vMenu'); }
$('mManual').onclick = () => { closeV('vMenu'); openEdit(null); };
let fileMode = 'kindle';
$('mKindle').onclick = () => { fileMode = 'kindle'; $('fileIn').click(); };
$('mRestore').onclick = () => { fileMode = 'restore'; $('fileIn').click(); };
$('mPaste').onclick = () => { closeV('vMenu'); $('impT').textContent = '貼り付けで取り込む'; $('pasteBox').hidden = false; $('impPrev').hidden = true; $('impMsg').textContent = ''; openV('vImp'); };
$('mExport').onclick = exportCsv;
$('mFull').onclick = exportFull;

function parseCsv(t) {
  t = t.replace(/^﻿/, ''); const rows = []; let row = [], f = '', q = false;
  for (let i = 0; i < t.length; i++) { const c = t[i];
    if (q) { if (c === '"') { if (t[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true; else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && t[i + 1] === '\n') i++; row.push(f); rows.push(row); row = []; f = ''; } else f += c; }
  if (f || row.length) { row.push(f); rows.push(row); }
  return rows.filter(r => r.some(x => x.trim()));
}
const COLS = { '書名': 'title', 'タイトル': 'title', 'title': 'title', '商品名': 'title', 'name': 'title', '著者': 'author', '著者名': 'author', '作者': 'author', 'author': 'author', 'authors': 'author',
  '出版社': 'publisher', 'publisher': 'publisher', 'isbn': 'isbn', 'isbn13': 'isbn', 'asin': 'asin', 'アイテムid': 'asin', 'シリーズ': 'series', '巻': 'vol', 'ジャンル': 'genre', '形態': 'format', '置き場所': 'place', '状態': 'status', '読書': 'read', '読了日': 'readAt', '読み終えた日': 'readAt',
  '出版日': 'pubdate', '発売日': 'pubdate', '購入日': 'boughtAt', 'acquiredtime': 'boughtAt', 'acquireddate': 'boughtAt', 'purchasedate': 'boughtAt', 'date': 'boughtAt', '売った日': 'soldAt', '売った先': 'soldTo', '金額': 'soldPrice', 'メモ': 'memo',
  '表紙url': 'cover', 'productimage': 'cover', 'image': 'cover', 'imageurl': 'cover', 'cover': 'cover', '追加日': 'addedAt' };
const colOf = h => COLS[nfkc(h).trim().toLowerCase()] || COLS[nfkc(h).trim()] || '';
function toDate(v) { if (v == null || v === '') return ''; if (typeof v === 'number' || /^\d{10,13}$/.test(String(v))) { const n = +v; return dstr(n < 1e11 ? n * 1000 : n); } const s = normPubdate(v); return s.length === 10 ? s : (Date.parse(v) ? dstr(Date.parse(v)) : ''); }
function recordToBook(o, fmtDefault) {
  const g = k => { const v = o[k]; return Array.isArray(v) ? v.join('・') : (v == null ? '' : String(v).trim()); };
  const title = g('title'), isbn = normIsbn(g('isbn')), asin = g('asin').toUpperCase();
  if (!title && !isbn) return null;
  const ps = parseSeries(title);
  let fmt = g('format'); fmt = FORMATS.includes(fmt) ? fmt : /kindle/i.test(fmt) ? 'Kindle' : /walker/i.test(fmt) ? 'BookWalker' : fmt ? 'その他電子' : fmtDefault;
  const read = normRead(g('read')), vol = parseInt(g('vol'), 10), price = g('soldPrice').replace(/\D/g, '');
  const cover = /ndlsearch|images-amazon/.test(g('cover')) ? '' : httpsUrl(g('cover'));
  const added = Date.parse(g('addedAt'));
  return { id: newId(), title, author: cleanAuthor(g('author')) || g('author'), publisher: g('publisher'), isbn, asin, series: g('series') || ps.series, vol: vol > 0 ? vol : ps.vol,
    genre: GENRES.includes(g('genre')) ? g('genre') : (genreFromText(title, g('publisher')) || (fmt !== '紙' && ps.vol ? '漫画' : 'その他')), format: fmt, place: g('place'),
    status: /売|sold/.test(g('status')) ? 'sold' : 'own', read, readAt: read === '読んだ' ? toDate(g('readAt')) : '', pubdate: normPubdate(g('pubdate')), boughtAt: toDate(o.boughtAt) || today(),
    cover, memo: g('memo'), soldAt: toDate(g('soldAt')), soldTo: g('soldTo'), soldPrice: price ? +price : null, addedAt: isNaN(added) ? Date.now() : added };
}
let cands = [];
$('fileIn').addEventListener('change', async () => {
  const f = $('fileIn').files[0]; $('fileIn').value = ''; if (!f) return; closeV('vMenu');
  let text; try { text = await f.text(); } catch (e) { toast('ファイルを読めませんでした'); return; }
  let recs = [];
  const fmtDefault = fileMode === 'kindle' ? 'Kindle' : '紙';
  try {
    if (/^\s*[\[{]/.test(text)) {
      let j = JSON.parse(text);
      if (j && j.app === 'hondana' && Array.isArray(j.books)) {
        const seen0 = new Set();
        cands = migrateOld(j.books).filter(b => !seen0.has(b.id) && seen0.add(b.id)).map(b => ({ b, dup: books.get(b.id) || findDup(b), photo: (j.covers || {})[b.id] || null }));
        if (j.series && typeof j.series === 'object') { for (const [k, v] of Object.entries(j.series)) if (!serInfo[k] && v && +v.total > 0) serInfo[k] = { total: +v.total }; saveSerInfo(); }
        $('impT').textContent = 'まるごとバックアップから戻す'; $('pasteBox').hidden = true; $('impMsg').textContent = Object.keys(j.covers || {}).length ? '写真の表紙も一緒に戻します。' : '';
        showCands(); openV('vImp'); return;
      }
      if (!Array.isArray(j)) j = j.books || j.items || j.data || Object.values(j).find(Array.isArray) || [];
      recs = j.map(o => { const m = {}; for (const [k, v] of Object.entries(o || {})) { const c = colOf(k); if (c && !(c in m)) m[c] = v; } return m; });
    } else {
      const rows = parseCsv(text); if (!rows.length) throw 0;
      let keys = rows[0].map(colOf), start = 1;
      if (!keys.includes('title') && !keys.includes('isbn')) { keys = ['title', 'author']; start = 0; }
      recs = rows.slice(start).map(r => { const m = {}; keys.forEach((k, i) => { if (k && !(k in m)) m[k] = r[i] ?? ''; }); return m; });
    }
  } catch (e) { toast('このファイルは読み込めませんでした'); return; }
  const seen = new Set();
  cands = recs.map(r => recordToBook(r, fmtDefault)).filter(Boolean).filter(b => { const k = b.isbn || b.asin || norm(b.title) + '|' + b.format; if (seen.has(k)) return false; seen.add(k); return true; })
    .map(b => ({ b, dup: findDup(b) }));
  $('impT').textContent = fileMode === 'kindle' ? 'Kindleの本を取り込む' : 'CSVから戻す'; $('pasteBox').hidden = true; $('impMsg').textContent = '';
  showCands(); openV('vImp');
});
const UIWORDS = ['すべて', 'すべて選択', '選択', '選択した項目', '選択した項目を削除', '本を読む', '読書を続ける', '続きを読む', '並べ替え', '並び替え', '表示', 'フィルター', '絞り込み', '検索', '購入日', '購入済み', 'ダウンロード', 'ダウンロード済み', '既読', '未読', '読む', '今すぐ読む', 'もっと見る', '次へ', '前へ', 'ページ', '件', '冊', 'アクション', 'その他のアクション', '詳細', '削除', '返却', '貸し出し', 'コレクション', 'コレクションに追加', 'ライブラリ', 'ライブラリから削除', '本棚', 'ホーム', 'ストア', 'ストアへ', 'タイトル', '著者', '著者名', '日付', 'メニュー', 'ログアウト', 'ヘルプ', 'シリーズ', '巻', 'new', 'sale', 'ポイント',
  'コンテンツ', 'コンテンツと端末の管理', '端末', '端末の管理', 'デジタルコンテンツ', '設定', '優先設定', 'プライバシー設定', 'アカウント', 'アカウントサービス', '注文履歴', 'カート', 'プライム', 'サンプル', '書籍', '本', 'マンガ', '雑誌', '電子書籍', 'kindle本', 'kindle unlimited', 'prime reading', 'すべてのコンテンツ', '既読にする', '未読にする', '読み終わった', '読みかけ', '購入', 'お気に入り', 'タグ', '並び順', '新しい順', '古い順', 'タイトル順', '著者順', '最近', '最近追加', '最近読んだ', '表示件数', 'グリッド', 'リスト', '一覧', '書棚', 'マイページ', 'トップ', 'お知らせ', 'キャンペーン', 'ランキング', 'カテゴリ', '条件', 'クリア', 'リセット', '閉じる', '戻る', '確認', 'キャンセル', 'ok', 'はい', 'いいえ'];
const UISET = new Set(UIWORDS.map(norm));
const learned = () => { try { return new Set(JSON.parse(lsGet('hondana.noise', '[]'))); } catch (e) { return new Set(); } };
function learn(lines) { if (!lines.length) return; const s = learned(); lines.forEach(l => s.add(norm(l))); lsSet('hondana.noise', JSON.stringify([...s].slice(-2000))); }
function isUi(line) {
  const k = norm(line); if (!k || UISET.has(k)) return true;
  const lab = line.match(/^([^:：]{1,12})[:：]/); if (lab && UISET.has(norm(lab[1]))) return true;
  if (/件中|件を表示|件目|件表示|冊中/.test(line) && line.length < 30) return true;
  if (/^[\d\s.…]*(次へ|前へ|次のページ|前のページ|最初|最後)[\d\s.…]*$/.test(line)) return true;
  if (/^[\d\s\/年月日時分:：￥¥,.円\-–—()（）%％]+$/.test(line)) return true;
  if (/^(購入日|取得日|配信日|発売日|最終閲覧|ダウンロード日|注文日|日付|価格|ページ|表示中|全)\s*[:：]?/.test(line) && /\d/.test(line)) return true;
  if (/^\d+\s*(件|冊|ページ|巻)/.test(line) && line.length < 14) return true;
  if (/^[\d,]+\s*(円|pt|ポイント)/.test(line) || /^(©|copyright|https?:\/\/)/i.test(line)) return true;
  return false;
}
function parsePaste(t, fmt) {
  const lines = t.split(/\r?\n/).map(s => s.trim()).filter(s => s.length >= 2), mem = learned(), cnt = new Map(), out = []; let hidden = 0;
  lines.forEach(l => cnt.set(norm(l), (cnt.get(norm(l)) || 0) + 1));
  const dateLine = l => /^(購入日|取得日|配信日|発売日|注文日|最終閲覧|ダウンロード日)/.test(l) || /^\d{4}[\/年.-]\d{1,2}/.test(l);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (isUi(line) || mem.has(norm(line))) { hidden++; continue; }
    const prev = out[out.length - 1];
    if (prev && !prev.b.author && dateLine(lines[i + 1] || '') && line.length <= 24 && !/[()（）\[\]【】「」]|\d/.test(line)) { prev.b.author = line; continue; }
    const am = line.match(/^(?:著者|作者|著|author)\s*[:：]\s*(.+)$/i); if (am) { if (prev && !prev.b.author) prev.b.author = am[1].trim(); continue; }
    const tab = line.split(/\t/).map(s => s.trim()).filter(Boolean);
    const b = recordToBook({ title: tab[0], author: tab[1] || '' }, fmt); if (b) out.push({ b, rep: cnt.get(norm(line)) >= 3 });
  }
  return { out, hidden };
}
$('impParse').onclick = () => {
  const t = $('impText').value.trim(); if (!t) { $('impMsg').textContent = '先に本棚ページの文字を貼り付けてください。'; return; }
  const { out, hidden } = parsePaste(t, $('impFmt').value), seen = new Set();
  cands = out.filter(x => { const k = norm(x.b.title); if (!k || seen.has(k)) return false; seen.add(k); return true; }).map(x => ({ ...x, dup: findDup(x.b) }));
  $('impMsg').textContent = hidden ? `画面の文字らしい${hidden}行は最初から外しました。` : '';
  showCands();
};
function showCands() {
  if (!cands.length) { $('impMsg').textContent = '本が見つかりませんでした。中身を確かめてください。'; $('impPrev').hidden = true; return; }
  $('impList').innerHTML = cands.map((c, i) => `<label><input type="checkbox" data-i="${i}" ${c.dup || c.rep ? '' : 'checked'}><span>${esc(c.b.title)}${c.b.author ? `<span class="note">　${esc(c.b.author)}</span>` : ''}${c.dup ? ` <span class="tag">登録済み</span>` : ''}${c.rep && !c.dup ? ' <span class="note">画面の文字かも</span>' : ''}</span></label>`).join('');
  const nd = cands.filter(c => c.dup).length;
  $('impSum').textContent = `${cands.length}件` + (nd ? `（${nd}件は登録済みなので外してあります）` : '');
  $('impPrev').hidden = false;
}
$('impAll').onclick = () => { const bs = [...$('impList').querySelectorAll('input')], on = bs.some(b => !b.checked); bs.forEach(b => b.checked = on); };
$('impAdd').onclick = async () => {
  const boxes = [...$('impList').querySelectorAll('input')], picked = boxes.filter(b => b.checked).map(b => cands[+b.dataset.i]), sel = picked.map(c => c.b);
  // 写真だけ消えている既存の本にも、写真を戻す
  for (const c of cands) if (c.photo && c.dup && c.dup.id === c.b.id && !photos.has(c.b.id)) { try { await setPhoto(c.b.id, await (await fetch(c.photo)).blob()); } catch (e) {} }
  if (!sel.length) { render(); closeV('vImp'); return; }
  for (const c of picked) if (c.photo) { try { await setPhoto(c.b.id, await (await fetch(c.photo)).blob()); } catch (e) {} }
  if (!$('pasteBox').hidden) learn(boxes.filter(b => !b.checked).map(b => cands[+b.dataset.i]).filter(c => !c.dup).map(c => c.b.title));
  const now = Date.now(); sel.forEach((b, k) => { if (!b.addedAt || b.addedAt > now) b.addedAt = now - k; });
  putMany(sel); $('impText').value = ''; closeV('vImp'); toast(`${sel.length}冊を追加しました`); go('');
};

/* ---------- 書き出し ---------- */
async function exportCsv() {
  const head = ['書名', '著者', '出版社', 'ISBN', 'ASIN', 'シリーズ', '巻', 'ジャンル', '形態', '置き場所', '状態', '読書', '読み終えた日', '出版日', '購入日', '売った日', '売った先', '金額', 'メモ', '表紙URL', '追加日'];
  const q = v => { const s = String(v ?? ''); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const rows = [...books.values()].sort((a, b) => (a.addedAt || 0) - (b.addedAt || 0)).map(b => [b.title, b.author, b.publisher, b.isbn, b.asin, b.series, b.vol, b.genre, b.format, b.place, b.status === 'sold' ? '売った' : '持っている', b.read, b.readAt, b.pubdate, b.boughtAt, b.soldAt, b.soldTo, b.soldPrice, b.memo, httpsUrl(b.cover), dstr(b.addedAt)].map(q).join(','));
  await saveFile('本棚_' + today() + '.csv', new Blob(['\ufeff' + [head.join(','), ...rows].join('\r\n')], { type: 'text/csv' }), photos.size ? '書き出しました（写真の表紙は入っていません）' : '');
}
async function saveFile(name, blob, note) {
  const done = () => { lsSet('hondana.lastBackup', today()); closeV('vMenu'); render(); toast(note || '書き出しました。「ファイル」アプリなどに保存しておいてください'); };
  const file = new File([blob], name, { type: blob.type });
  if (navigator.canShare?.({ files: [file] }) && matchMedia('(pointer:coarse)').matches) { try { await navigator.share({ files: [file], title: name }); done(); return; } catch (e) { if (e && e.name === 'AbortError') return; } }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); done();
}
const toDataUrl = blob => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(blob); });
async function exportFull() {
  toast('まとめています…');
  const covers = {}; let m = new Map(); try { m = await idb.all(); } catch (e) {}
  for (const [k, blob] of m) if (books.has(k)) covers[k] = await toDataUrl(blob);
  const data = { app: 'hondana', version: 2, exportedAt: new Date().toISOString(), books: [...books.values()], covers, series: serInfo };
  await saveFile('本棚まるごと_' + today() + '.json', new Blob([JSON.stringify(data)], { type: 'application/json' }), '写真の表紙も含めて書き出しました。「ファイル」アプリなどに保存しておいてください');
}

/* ---------- 起動 ---------- */
load(); render();
idb.all().then(m => { for (const [k, blob] of m) { if (books.has(k)) photos.set(k, URL.createObjectURL(blob)); } if (m.size) render(); }).catch(() => {});
try { navigator.storage?.persist?.(); } catch (e) {}
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
window.addEventListener('storage', e => { if (e.key === KEY) { load(); render(); } });
window.__hondana = { books: () => [...books.values()], parseSeries, genreFromC, priceCode, photos, noCov };
}
