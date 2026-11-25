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

// ストア（形態）とジャンル。メニューの「ジャンル・ストアを編集」から増やせる（保存先：hondana.lists）
const DEF_FORMATS = ['紙', 'Kindle', 'BookWalker', 'DMM', 'その他電子'];
const DEF_GENRES = ['漫画', '小説', '技法書', 'その他'];
let FORMATS = [...DEF_FORMATS], GENRES = [...DEF_GENRES];
const READS = ['読んだ', 'まだ']; // 何も付いていない（''）＝未設定
// 前の版の言い方を読み替える（積読は「何も付けていない」扱いに戻す）
const normRead = v => { v = nfkc(v).trim(); if (/^(読んだ|読了|既読|read|done)$/i.test(v)) return '読んだ'; if (/^(まだ|未読|読書中|読みかけ|reading|unread)$/i.test(v)) return 'まだ'; return ''; };
// 表紙の左下に出る小さな印。ここにないストアは名前の頭2文字
const FMARK_BASE = { '紙': '', 'Kindle': 'K', 'BookWalker': 'BW', 'DMM': 'D', 'その他電子': '電' };
const FMARK = new Proxy({}, { get: (_, k) => typeof k !== 'string' || !k ? '' : (k in FMARK_BASE ? FMARK_BASE[k] : String(k).normalize('NFKC').slice(0, 2)) });
const CLOTH = ['#3d5f86', '#7a2f2a', '#3f5a3c', '#6b4f7d', '#8a6a2e', '#2d3a55', '#7d3b4f', '#3f6b6c', '#5a4636', '#44506b'];
const hash = s => { let h = 2166136261; for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
const tint = s => CLOTH[hash(s) % CLOTH.length];

/* ---------- ISBN ---------- */
function ok13(s) { if (!/^\d{13}$/.test(s)) return false; let t = 0; for (let i = 0; i < 13; i++) t += (+s[i]) * (i % 2 ? 3 : 1); return t % 10 === 0; }
function ok10(s) { if (!/^\d{9}[\dX]$/.test(s)) return false; let t = 0; for (let i = 0; i < 10; i++) t += (s[i] === 'X' ? 10 : +s[i]) * (10 - i); return t % 11 === 0; }
function to13(s) { const b = '978' + s.slice(0, 9); let t = 0; for (let i = 0; i < 12; i++) t += (+b[i]) * (i % 2 ? 3 : 1); return b + ((10 - t % 10) % 10); }
function normIsbn(v) { const s = nfkc(v).replace(/[^0-9Xx]/g, '').toUpperCase(); if (s.length === 13 && ok13(s) && /^97[89]/.test(s)) return s; if (s.length === 10 && ok10(s)) return to13(s); return ''; }
// 日本の本の下段バーコード（192 + Cコード4桁 + 価格）からCコードを取り出す
function priceFromCode(v) { const s = nfkc(v).replace(/\D/g, ''); return /^19[12]\d{10}$/.test(s) ? (parseInt(s.slice(7, 12), 10) || null) : null; }
const taxIn = p => Math.floor(p * 1.1);
const yen = n => (+n || 0).toLocaleString('ja-JP') + '円';
function sumPaid(list) { let sum = 0, n = 0; for (const b of list) if (b.paid != null && b.paid !== '') { sum += +b.paid; n++; } return { sum, n }; }
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
  const t = nfkc(xs.join(' '));
  if (/[(（][^()（）]*(コミック|comic)[^()（）]*[)）]|コミックス|コミックエッセイ/i.test(t)) return '漫画';
  if (/技法|描き方|描く|描ける|デッサン|ドローイング|解剖学|イラスト|配色|色彩|色の|フォント|レイアウト|デザイン|背景|構図|ポーズ|クロッキー|作画|画材|塗り|clip studio|photoshop|illustrator|装丁|あしらい|余白/i.test(t)) return '技法書';
  if (/漫画|まんが|マンガ|comic|graphic novel/i.test(t)) return '漫画';
  if (/小説|ノベル|novel|fiction|文庫/i.test(t)) return '小説';
  return '';
}
const NOT_MANGA = /辞典|事典|入門|教科書|講座|図鑑|ガイド|レッスン|ハンドブック|English Edition/i;
const KANJI_VOL = { '上': 1, '中': 2, '下': 3, '前編': 1, '後編': 2, '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9, '十': 10 };
function parseSeries(title) {
  let t = nfkc(title).trim();
  // 飾り・おまけ表記・レーベル名を外す（巻数だけのかっこは残す）
  t = t.replace(/【[^】]*】|［[^］]*］|\[[^\]]*\]|〔[^〕]*〕/g, ' ');
  t = t.replace(/[(（][^()（）]*(?:特典|限定|描き下ろし|おまけ|特装|カラー版|分冊版|単話|English Edition)[^()（）]*[)）]/gi, ' ');
  for (let i = 0; i < 4; i++) { const m = t.match(/\s*[(（]([^()（）]*)[)）]\s*$/); if (!m || /^\s*(\d{1,4}|上|中|下|前編|後編)\s*$/.test(m[1])) break; t = t.slice(0, m.index); }
  t = t.replace(/(\d+)\s*[〜~～]\s*\d+/g, '$1');
  for (let i = 0; i < 3; i++) t = t.replace(/[\s　]*(特装版|限定版|通常版|豪華版|完結|完|最終巻)[\s　]*$/, '');
  t = t.replace(/\s+/g, ' ').trim();
  const clean = x => x.replace(/[\s　:：\-－,、.・]+$/, '').replace(/^[\s　:：]+/, '').trim();
  const vnum = x => KANJI_VOL[x] ?? parseInt(x, 10);
  const ok = (ser, v) => { ser = clean(ser); v = vnum(v); return ser && v > 0 && v < 2000 ? { series: ser, vol: v } : null; };
  let m, r;
  // 第一話 ○○
  if ((m = t.match(/^第\s*([0-9一二三四五六七八九十]+)\s*話\s+(.+)$/)) && (r = ok(m[2], m[1]))) return r;
  // 1: サブタイトル シリーズ名（巻数が先頭にある形）
  if ((m = t.match(/^(\d{1,3})\s*[:：]\s*.+\s(\S+)$/)) && (r = ok(m[2], m[1]))) return r;
  // ○○ 12 / ○○(12) / ○○ 12巻 / ○○ 第3話
  if ((m = t.match(/^(.+?)[\s　]*第?[（(]?\s*(\d{1,4})\s*[)）]?\s*(?:巻|話)?$/)) && (r = ok(m[1], m[2]))) return r;
  // ○○ Vol.1―副題―
  if ((m = t.match(/^(.+?)\s*(?:vol\.?|volume|book|#)\s*(\d{1,4})\b.*$/i)) && (r = ok(m[1], m[2]))) return r;
  // ○○ 3巻 副題
  if ((m = t.match(/^(.+?)[\s　]*第?(\d{1,4})巻.*$/)) && (r = ok(m[1], m[2]))) return r;
  // ○○ 3 シリーズ名 / ○○(上) 副題（巻数のあとにシリーズ名や副題が続く形）
  if ((m = t.match(/^(.+?\D)[\s　]*[（(]?(\d{1,3}|上|中|下)[)）]?\s*(?:巻|話)?\s+(\S.*)$/)) && !/^\d/.test(m[3]) && (r = ok(m[1], m[2]))) return r;
  // ○○ 上 / ○○(下)
  if ((m = t.match(/^(.+?)[\s　]*[（(]?(上|中|下|前編|後編)[)）]?$/)) && (r = ok(m[1], m[2]))) return r;
  return { series: '', vol: null };
}
const seriesKey = b => norm(b.series || '');

/* ---------- 保存 ---------- */
const KEY = 'hondana.books';
let books = new Map();
function migrateOld(list) {
  return list.map(o => ({ id: o.id || newId(), title: o.title || '', author: o.author || '', publisher: o.publisher || '', isbn: o.isbn || '', asin: o.asin || '',
    series: o.series ?? parseSeries(o.title).series, vol: o.vol ?? parseSeries(o.title).vol, genre: o.genre || genreFromText(o.title) || 'その他',
    format: o.format || '紙', place: o.place || '', status: o.status === 'sold' ? 'sold' : 'own',
    read: normRead(o.read), readAt: normRead(o.read) === '読んだ' ? (o.readAt || '') : '', pubdate: o.pubdate || '', boughtAt: o.boughtAt || dstr(o.addedAt) || today(),
    cover: o.cover || '', memo: o.memo || '', listPrice: o.listPrice ?? null, paid: o.paid ?? null, paidAuto: o.paidAuto ?? false, folder: o.folder || '', pisbn: o.pisbn || '', trial: !!o.trial, genreSet: !!o.genreSet, soldAt: o.soldAt || '', soldTo: o.soldTo || '', soldPrice: o.soldPrice ?? null, soldLot: o.soldLot || '', addedAt: o.addedAt || Date.now() }));
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
function loadLists() {
  try { const l = JSON.parse(lsGet('hondana.lists', 'null')); if (l) {
    if (Array.isArray(l.formats) && l.formats.length) FORMATS = ['紙', ...l.formats.filter(x => x && x !== '紙')];
    if (Array.isArray(l.genres) && l.genres.length) GENRES = [...l.genres.filter(x => x && x !== 'その他'), 'その他'];
  } } catch (e) {}
}
const saveLists = () => lsSet('hondana.lists', JSON.stringify({ formats: FORMATS, genres: GENRES }));
loadLists();

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
  return String(a).split(/[\/／;；、]|,\s+|\s{2,}/).map(p => p.trim()
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
  let listPrice = null;
  try { const p = (it.onix.ProductSupply.SupplyDetail.Price || [])[0]; if (p && +p.PriceAmount > 0) listPrice = Math.round(+p.PriceAmount); } catch (e) {}
  return { title: cleanTitle(s.title, s.volume), author: cleanAuthor(s.author), publisher: s.publisher || '', pubdate: normPubdate(s.pubdate), cover: httpsUrl(s.cover), series: s.series || '', genre: genreFromC(ccode), listPrice };
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
  const pr = nfkc(g('dcndl:price')).match(/(\d[\d,]*)\s*円/);
  return { title: cleanTitle(title, vol), author: cleanAuthor(g('dc:creator') || g('author')), publisher: g('dc:publisher'), pubdate: normPubdate(g('dcterms:issued') || g('dc:date')), cover: '', series: g('dcndl:seriesTitle'), genre, listPrice: pr ? +pr[1].replace(/,/g, '') : null };
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
  r.listPrice = (a && a.listPrice) || (n && n.listPrice) || null;
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
    listPrice: r?.listPrice ?? null, paid: r?.listPrice != null ? taxIn(r.listPrice) : null, paidAuto: true,
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
  const i10 = isbn10(b.isbn || b.pisbn); if (i10) add(`https://images-na.ssl-images-amazon.com/images/P/${i10}.09.LZZZZZZZ.jpg`);
  if (b.asin && /^B0/i.test(b.asin)) add(`https://images-na.ssl-images-amazon.com/images/P/${b.asin}.09.LZZZZZZZ.jpg`);
  if (b.isbn || b.pisbn) add('https://ndlsearch.ndl.go.jp/thumbnail/' + (b.isbn || b.pisbn) + '.jpg');
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
const ui = Object.assign({ genre: 'all', status: 'own', view: 'grid', sort: 'new', format: 'all' }, (() => { try { return JSON.parse(lsGet('hondana.ui', '{}')); } catch (e) { return {}; } })());
if (['積読', '読書中', '読了'].includes(ui.status)) ui.status = 'own';
const saveUi = () => lsSet('hondana.ui', JSON.stringify(ui));
let query = '';
const app = $('app');
const svgSearch = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#8790a8" stroke-width="1.8" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>';
const svgBack = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>';

function passes(b) {
  if (ui.status === 'trial') { if (!b.trial) return false; }
  else if (b.trial && ui.status !== 'all' && !query) return false;
  if (ui.status === 'own' && b.status === 'sold') return false;
  if (ui.status === 'sold' && b.status !== 'sold') return false;
  if (ui.status === 'nocover' && (b.status === 'sold' || hasCover(b))) return false;
  if (['読んだ', 'まだ', 'unset'].includes(ui.status) && (b.status === 'sold' || (b.read || 'unset') !== ui.status)) return false;
  if (ui.genre !== 'all' && (b.genre || 'その他') !== ui.genre) return false;
  if (ui.format && ui.format !== 'all' && b.format !== ui.format) return false;
  if (query) { const qi = normIsbn(query); if (qi) return b.isbn === qi; const q = norm(query); return norm([b.title, b.author, b.series, b.publisher, b.place, b.memo, b.isbn, b.asin].join(' ')).includes(q); }
  return true;
}
const folderKey = b => norm(b.folder || '');
function groups(inFolder) {
  let list = [...books.values()].filter(passes);
  const map = new Map(), fmap = new Map(), out = [];
  if (inFolder != null) list = list.filter(b => folderKey(b) === inFolder);
  for (const b of list) {
    const fk = folderKey(b);
    if (inFolder == null && fk && !query) { if (!fmap.has(fk)) fmap.set(fk, []); fmap.get(fk).push(b); continue; }
    const k = seriesKey(b); if (k) { if (!map.has(k)) map.set(k, []); map.get(k).push(b); } else out.push({ one: b });
  }
  for (const [k, bs] of map) { if (bs.length > 1) out.push({ key: k, books: bs }); else out.push({ one: bs[0] }); }
  for (const [k, bs] of fmap) out.push({ folder: k, books: bs });
  const latest = g => g.one ? (g.one.addedAt || 0) : Math.max(...g.books.map(b => b.addedAt || 0));
  const name = g => g.one ? g.one.title : g.folder ? g.books[0].folder : g.books[0].series;
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
  if (!total && bs.length && bs.every(b => /[上中下](?:巻|[)）\s]|$)/.test(nfkc(b.title)))) return { max: 0, miss: [], total };
  if (!total && vs.length < 2 && !(vs.length === 1 && vs[0] > 1)) return { max: top, miss: [], total };
  const miss = []; for (let i = 1; i <= top; i++) if (!vs.includes(i)) miss.push(i);
  return { max: top, miss: miss.length > 60 ? [] : miss, total };
}
function tileHtml(g) {
  const pk = ids => sel && ids.length && ids.every(id => sel.has(id)) ? ' picked' : '';
  if (g.one) { const b = g.one; return `<button class="tile${b.status === 'sold' ? ' sold' : ''}${pk([b.id])}" data-book="${esc(b.id)}"><div style="position:relative">${coverHtml(b)}${FMARK[b.format] ? `<span class="fmt">${esc(FMARK[b.format])}</span>` : ''}</div><span class="tt">${esc(b.title || 'ISBN ' + b.isbn)}</span></button>`; }
  if (g.folder != null) {
    const bs = g.books, heads = [], seen = new Set();
    bs.slice().sort((a, b) => (a.vol || 0) - (b.vol || 0)).forEach(b => { const k = seriesKey(b) || b.id; if (!seen.has(k)) { seen.add(k); heads.push(b); } });
    return `<button class="tile${pk(bs.map(b => b.id))}" data-folder="${esc(g.folder)}"><div class="cv folder">${heads.slice(0, 4).map(b => `<div class="fm">${coverHtml(b, 'cv mini4')}</div>`).join('')}<span class="badge">${bs.length}冊</span></div><span class="tt">${esc(bs[0].folder)}</span></button>`;
  }
  const bs = g.books.slice().sort((a, b) => (a.vol || 0) - (b.vol || 0)), top = (bs.find(b => photos.has(b.id)) || bs.find(b => b.cover && !/ndlsearch/.test(b.cover)) || bs.find(b => b.isbn || b.asin || b.pisbn) || bs[0]), m = missingVols(bs);
  return `<button class="tile${pk(bs.map(b => b.id))}" data-series="${esc(g.key)}"><div class="stack">${coverHtml({ ...top, title: bs[0].series })}<span class="badge">${m.total ? `${bs.filter(b => b.status !== 'sold').length}/${m.total}` : bs.length + '冊'}</span>${m.miss.length ? '<span class="miss" title="抜けている巻があります"></span>' : ''}</div><span class="tt">${esc(bs[0].series)}</span></button>`;
}
function resultsHtml(inFolder) {
  const gs = groups(inFolder);
  if (!gs.length) {
    return !books.size ? `<div class="empty"><b>本棚はまだ空っぽです</b>右下の「バーコードで追加」で紙の本を、右上のメニューからKindleやBOOK☆WALKERの本を取り込めます。</div>`
      : query ? `<div class="empty"><b>見つかりませんでした</b>${normIsbn(query) ? 'このISBNの本はまだ持っていません。' : '「' + esc(query) + '」に当てはまる本はありません。'}</div>`
      : `<div class="empty"><b>この条件の本はありません</b>上の絞り込みを切り替えてみてください。</div>`;
  }
  if (ui.view === 'shelf') {
    const sp = gs.flatMap(g => g.one ? [g.one] : g.books.slice().sort((a, b) => (a.vol || 0) - (b.vol || 0)));
    return `<div class="shelf"><div class="srow">${sp.map(b => { const h = hash(b.id), ht = 130 + (h >> 5) % 46; return `<div class="slot"><button class="sp" data-book="${esc(b.id)}" style="height:${ht}px;background:${tint(b.series || b.title)}${b.status === 'sold' ? ';opacity:.4' : ''}" title="${esc(b.title)}"><span style="max-height:${ht - 20}px;color:#eef1f6">${esc(b.series && b.vol ? b.series + ' ' + b.vol : (b.title || 'ISBN ' + b.isbn))}</span></button></div>`; }).join('')}</div></div>`;
  }
  return `<div class="grid">${gs.map(tileHtml).join('')}</div>`;
}
function renderHome() {
  const all = [...books.values()], own = all.filter(b => b.status !== 'sold' && !b.trial), nTrial = all.filter(b => b.trial && b.status !== 'sold').length;
  const nRead = own.filter(b => b.read === '読んだ').length, nYet = own.filter(b => b.read === 'まだ').length;
  const last = lsGet('hondana.lastBackup', '');
  const needBk = own.length >= 10 && (!last || Date.now() - Date.parse(last) > 30 * 864e5);
  const chips = [['all', 'すべて'], ...GENRES.map(g => [g, g])].map(([v, l]) => `<button class="chip" data-genre="${v}" aria-pressed="${ui.genre === v}">${l}</button>`).join('');
  const statusOpts = [['own', '持っている'], ['読んだ', '読んだ'], ['まだ', 'まだ読んでない'], ['unset', '読んだか未設定'], ['sold', '売った'], ['nocover', '表紙なし'], ['trial', 'お試し'], ['all', 'すべて']].map(([v, l]) => `<option value="${v}" ${ui.status === v ? 'selected' : ''}>${l}</option>`).join('');
  app.innerHTML = `<div class="top">
    <div class="hrow"><div><h1>わたしの本棚</h1><p class="stats">持っている ${own.length}冊・読んだ ${nRead}冊${nYet ? `・まだ ${nYet}冊` : ''}${nTrial ? `・お試し ${nTrial}冊` : ''}</p></div>
      <div style="display:flex;gap:8px;align-items:center">
        <svg width="40" height="40" viewBox="0 0 44 44" aria-hidden="true"><circle cx="22" cy="22" r="17" fill="none" stroke="var(--gold)" stroke-width="1.2"/><path d="M25 9L15 24h7l-3 11 11-16h-7z" fill="none" stroke="var(--blue)" stroke-width="1.5" stroke-linejoin="round"/></svg>
        <button class="icon-btn" id="menuBtn" aria-label="メニュー"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#c9cfdc" stroke-width="1.8" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg></button></div></div>
    <label class="search">${svgSearch}<input id="q" type="search" placeholder="書名・著者・ISBN（書店で「持ってたっけ？」にも）" value="${esc(query)}" aria-label="本を探す"></label>
    <div class="chips">${chips}</div>
    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
      <select class="sel" id="statusSel" aria-label="状態">${statusOpts}</select>
      <select class="sel" id="fmtSel" aria-label="ストア"><option value="all">すべてのストア</option>${FORMATS.map(f => `<option ${ui.format === f ? 'selected' : ''}>${esc(f)}</option>`).join('')}</select>
      <select class="sel" id="sortSel" aria-label="並び順"><option value="new" ${ui.sort === 'new' ? 'selected' : ''}>追加が新しい順</option><option value="title" ${ui.sort === 'title' ? 'selected' : ''}>書名順</option></select>
      <div style="flex:1"></div>
      <button class="icon-btn" id="selBtn" style="height:36px;width:auto;padding:0 12px;font-size:14px;color:#c9cfdc">選ぶ</button>
      <button class="icon-btn vt" id="viewBtn" aria-pressed="${ui.view === 'shelf'}" aria-label="${ui.view === 'shelf' ? '表紙の表示に切り替え' : '背表紙の棚に切り替え'}" style="height:36px;border-color:var(--blue)">${ui.view === 'shelf'
      ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--blue)" stroke-width="1.8" aria-hidden="true"><rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="9"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>'
      : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--blue)" stroke-width="1.8" aria-hidden="true"><path d="M5 4v16M10 6v14M15 4v16M20 7v13M3 20h18"/></svg>'}</button>
    </div></div>
    ${needBk ? `<div class="backup"><span>${last ? '前回のバックアップから時間が経っています。' : 'まだバックアップしていません。'}</span><button class="btn" id="bkNow" style="min-height:36px;flex:none">書き出す</button></div>` : ''}
    ${ui.status === 'trial' && nTrial ? `<div class="backup"><span>お試しの本 ${nTrial}冊。いらなくなったら、まとめて消せます。</span><button class="btn danger" id="trialDelBtn" style="min-height:36px;flex:none">まとめて削除</button></div>` : ''}
    <div id="results">${resultsHtml()}</div>`;
  const q = $('q');
  const upd = () => { query = q.value; $('results').innerHTML = resultsHtml(); };
  q.addEventListener('input', e => { if (!e.isComposing) upd(); });
  q.addEventListener('compositionend', upd);
  $('statusSel').onchange = e => { ui.status = e.target.value; saveUi(); render(); };
  $('sortSel').onchange = e => { ui.sort = e.target.value; saveUi(); render(); };
  $('fmtSel').onchange = e => { ui.format = e.target.value; saveUi(); render(); };
  $('selBtn').onclick = () => startSelect();
  $('viewBtn').onclick = () => { ui.view = ui.view === 'shelf' ? 'grid' : 'shelf'; saveUi(); render(); };
  $('menuBtn').onclick = openMenu;
  if ($('bkNow')) $('bkNow').onclick = exportCsv;
  if ($('trialDelBtn')) $('trialDelBtn').onclick = openTrialDelete;
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
  const top = (bs.find(b => photos.has(b.id)) || bs.find(b => b.cover && !/ndlsearch/.test(b.cover)) || bs.find(b => b.isbn || b.asin || b.pisbn) || bs[0]);
  const fold = bs.find(b => b.folder)?.folder || '', money = sumPaid(own);
  app.innerHTML = `<div class="page">
    ${fold ? `<button class="back" data-folder="${esc(norm(fold))}" data-go>${svgBack}${esc(fold)}</button>` : `<button class="back" data-home>${svgBack}本棚</button>`}
    <div class="hero"><div class="cvbox"><div class="stack">${coverHtml({ ...top, title: name })}</div></div>
      <div style="display:flex;flex-direction:column;justify-content:center;gap:2px">
        <h2>${esc(name)}</h2>${authors ? `<p class="sub">${esc(authors)}</p>` : ''}
        <p style="margin:8px 0 0;font-size:14px">${m.total ? `全${m.total}巻のうち ` : m.max ? `${m.max}巻まで、` : ''}<b style="color:var(--gold)">${own.length}冊</b> 持っています${m.total && !m.miss.length && own.length >= m.total ? '<br><span style="color:var(--gold)">全巻そろっています</span>' : ''}</p>
        ${m.miss.length ? `<p style="margin:2px 0 0;font-size:13px;color:var(--blue);font-weight:700">${m.miss.length > 4 ? m.miss.slice(0, 4).join('・') + '巻ほか' : m.miss.join('・') + '巻'}がありません</p>` : ''}
      </div></div>
    <h3>巻</h3><div class="vols">${tiles.join('')}</div>
    ${infoRows([['形態', esc(fm)], ['置き場所', esc(places)], ['出版社', esc(pubs)], ['使ったお金', money.n ? `${yen(money.sum)}${money.n < own.length ? `<span class="note">（値段がわかる${money.n}冊分）</span>` : ''}` : ''], ['まとまり', fold ? esc(fold) : '']])}
    <label class="ir" style="align-items:center"><span>全何巻？</span><span style="display:flex;align-items:center;gap:6px">全<input id="serTotal" inputmode="numeric" value="${m.total || ''}" placeholder="${m.max || ''}" style="width:64px;height:40px;border:1px solid var(--ctl);border-radius:8px;background:var(--p1);text-align:center;font-size:16px">巻</span></label>
    <label class="ir" style="align-items:center"><span>ジャンル（全巻）</span><select id="serGenre" class="sel" style="height:40px">${GENRES.map(g => `<option ${g === (bs.find(b => b.genre !== 'その他') || bs[0]).genre ? 'selected' : ''}>${g}</option>`).join('')}</select></label>
    <div class="row" style="margin-top:20px"><button class="btn gold" id="addNext">${m.miss.length ? m.miss[0] : (m.max || own.length) + 1}巻をバーコードで追加</button></div>
    <p class="note" style="margin-top:12px">巻の表紙を押すと、その1冊の詳しい情報が開きます。シリーズ名や巻数は1冊ごとの「編集」で直せます。</p>
  </div>`;
  $('addNext').onclick = () => openScan({ format: own[0]?.format, place: own[0]?.place, genre: (bs.find(b => b.genre !== 'その他') || {}).genre });
  $('serTotal').onchange = e => { const n = parseInt(nfkc(e.target.value), 10); if (n > 0 && n < 2000) serInfo[key] = { ...(serInfo[key] || {}), total: n }; else if (serInfo[key]) delete serInfo[key].total; saveSerInfo(); render(); };
  $('serGenre').onchange = e => { putMany(bs.map(b => ({ ...b, genre: e.target.value, genreSet: true }))); toast(`このシリーズを全部「${e.target.value}」にしました`); };
}
function renderBook(id) {
  const b = books.get(id); if (!b) { location.hash = ''; return; }
  const inSeries = b.series && [...books.values()].filter(x => seriesKey(x) === seriesKey(b)).length > 1;
  app.innerHTML = `<div class="page">
    ${inSeries ? `<button class="back" data-series="${esc(seriesKey(b))}">${svgBack}${esc(b.series)}</button>` : b.folder ? `<button class="back" data-folder="${esc(folderKey(b))}" data-go>${svgBack}${esc(b.folder)}</button>` : `<button class="back" data-home>${svgBack}本棚</button>`}
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
      ${b.trial ? '<p style="margin:4px 0 0;font-size:13px;color:var(--blue);font-weight:700">お試し（普段の本棚には出ません）</p>' : ''}
    </div>
    ${b.status === 'sold' ? '' : `<div class="seg" role="group" aria-label="読書の状態">${READS.map(r => `<button data-read="${r}" aria-pressed="${b.read === r}">${r}</button>`).join('')}</div><p class="note" style="margin:6px 0 0;text-align:center">${b.read ? 'もう一度押すと、未設定に戻ります' : 'まだ何も付けていません'}</p>`}
    ${infoRows([['読み終えた日', b.read === '読んだ' && b.readAt ? jdate(b.readAt) : ''], ['シリーズ', b.series ? esc(b.series) + (b.vol ? ` ${b.vol}巻` : '') : ''], ['出版社', esc(b.publisher)], ['出版日', jdate(b.pubdate)], ['形態', esc(b.format)], ['購入日', jdate(b.boughtAt)], ['定価', b.listPrice != null ? `${yen(b.listPrice)}<span class="note">（税込${yen(taxIn(b.listPrice))}）</span>` : ''], ['買った値段', b.paid != null ? yen(b.paid) : ''], ['まとまり', b.folder ? esc(b.folder) : ''], ['置き場所', esc(b.place)], ['ジャンル', esc(b.genre)], ['ISBN', esc(b.isbn)],
      ['売った日', b.status === 'sold' ? jdate(b.soldAt) || '—' : ''], ['売った先', b.status === 'sold' ? esc(b.soldTo) : ''], ['金額', b.status === 'sold' && b.soldPrice ? (b.soldLot ? `${esc(b.soldLot)}<span class="note">（1冊あたり約${yen(b.soldPrice)}）</span>` : yen(b.soldPrice)) : ''], ['メモ', esc(b.memo).replace(/\n/g, '<br>')]])}
    <div class="row" style="margin-top:20px"><button class="btn" id="bSold">${b.status === 'sold' ? '持っているに戻す' : '売った'}</button><button class="btn gold" id="bEdit">編集</button></div>
    <div class="row" style="margin-top:10px"><button class="btn" id="bTrial">${b.trial ? 'お試しを外す' : 'お試しにする'}</button>${b.isbn ? '<button class="btn" id="bRelook">情報を調べ直す</button>' : ''}</div>
    ${b.folder ? '<div class="row" style="margin-top:10px"><button class="btn" id="bUnfold">まとまりから外す</button></div>' : ''}
    <div class="row" style="margin-top:10px"><button class="btn danger" id="bDel">削除</button></div>
  </div>`;
  app.querySelectorAll('[data-read]').forEach(x => x.onclick = () => { const r = b.read === x.dataset.read ? '' : x.dataset.read, nb = { ...b, read: r, readAt: r === '読んだ' ? (b.readAt || (b.read === 'まだ' ? today() : '')) : '' }; put(nb); });
  $('bEdit').onclick = () => openEdit(b);
  if ($('bUnfold')) $('bUnfold').onclick = () => { put({ ...b, folder: '' }); toast(`「${b.folder}」から外しました`, () => put({ ...books.get(b.id), folder: b.folder })); };
  $('bTrial').onclick = () => { put({ ...b, trial: !b.trial }); toast(b.trial ? 'お試しを外しました。本棚に戻ります' : 'お試しにしました。普段の本棚には出ません'); };
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
  $('bSold').onclick = () => { if (b.status === 'sold') { put({ ...b, status: 'own', soldAt: '', soldTo: '', soldPrice: null, soldLot: '' }); toast('持っているに戻しました'); } else { const nb = { ...b, status: 'sold', soldAt: today() }; put(nb); openEdit(nb, '売った先や金額も残せます'); } };
  let armed = false;
  $('bDel').onclick = async () => { if (!armed) { armed = true; $('bDel').textContent = 'もう一度押すと削除します'; return; } const keep = photos.has(b.id) ? await idb.all().then(m => m.get(b.id)).catch(() => null) : null;
    removeBook(b.id); go(''); toast(`「${b.title || 'ISBN ' + b.isbn}」を削除しました`, async () => { if (keep) await setPhoto(b.id, keep); put(b); }); };
}
function render() {
  const h = decodeURIComponent(location.hash.slice(1));
  if (!h.startsWith('f-') && h) endSelect(true);
  if (h.startsWith('s-')) renderSeries(h.slice(2)); else if (h.startsWith('b-')) renderBook(h.slice(2)); else if (h.startsWith('f-')) renderFolder(h.slice(2)); else renderHome();
  $('fab').hidden = h.startsWith('b-') || !!sel;
  $('selBar').hidden = !sel; if (sel) updateSelBar(); updFsel();
  $('soldTos').innerHTML = [...new Set([...books.values()].map(b => b.soldTo).filter(Boolean))].map(p => `<option value="${esc(p)}">`).join('');
  $('places').innerHTML = [...new Set([...books.values()].map(b => b.place).filter(Boolean))].map(p => `<option value="${esc(p)}">`).join('');
}
const go = h => { if (location.hash === h) render(); else location.hash = h; };
window.addEventListener('hashchange', () => { render(); window.scrollTo(0, 0); });
// 下までスクロールしても「選ぶ」をすぐ押せるように、上の「選ぶ」が見えなくなったら左下に出す
function updFsel() {
  const b = $('selBtn') || $('fSel'), off = !b || sel || document.querySelector('.veil.on') ? true : b.getBoundingClientRect().bottom > 0;
  $('fselBtn').hidden = off;
}
window.addEventListener('scroll', updFsel, { passive: true });
$('fselBtn').onclick = () => startSelect();
// まとめたあと、まとまりが画面の外へ移ったら「見る」で連れていく
function lookFolder(name) {
  const t = [...document.querySelectorAll('.tile[data-folder]')].find(x => x.dataset.folder === name); if (!t) return null;
  const r = t.getBoundingClientRect(); if (r.bottom > 0 && r.top < innerHeight) { t.classList.add('flash'); setTimeout(() => t.classList.remove('flash'), 3400); return null; }
  return () => { t.scrollIntoView({ behavior: 'smooth', block: 'center' }); t.classList.add('flash'); setTimeout(() => t.classList.remove('flash'), 3400); };
}
app.addEventListener('click', e => {
  if (suppressClick) { suppressClick = false; e.preventDefault(); e.stopPropagation(); return; }
  const t = e.target.closest('[data-book],[data-series],[data-folder],[data-home],[data-genre],[data-addvol]'); if (!t) return;
  if (sel && t.matches('.tile,.sp')) { toggleTile(t); return; }
  if (t.dataset.folder != null && t.matches('.tile,[data-go]')) { go('#f-' + encodeURIComponent(t.dataset.folder)); return; }
  if (t.dataset.genre) { ui.genre = t.dataset.genre; saveUi(); render(); return; }
  if (t.dataset.addvol) { const key = decodeURIComponent(location.hash.slice(3)); const ex = [...books.values()].find(b => seriesKey(b) === key); openScan({ format: ex?.format, place: ex?.place, genre: ex && ex.genre !== 'その他' ? ex.genre : '' }); return; }
  if ('home' in t.dataset) { go(''); return; }
  if (t.dataset.series) { go('#s-' + encodeURIComponent(t.dataset.series)); return; }
  if (t.dataset.book) go('#b-' + encodeURIComponent(t.dataset.book));
});

/* ---------- シート共通 ---------- */
let lastFocus = null;
function openV(id) { lastFocus = document.activeElement; $(id).classList.add('on'); document.body.style.overflow = 'hidden'; }
function closeV(id) { if (id === 'vScan') { stopScan(); if (sellMode && sellSession.length) { const ids = sellSession.map(s => s.id).filter(x => books.has(x)), at = $('sellAt').value, to = $('sellTo').value.trim(); sellSession = []; setTimeout(() => openSold(ids, { at, to, fromScan: true }), 30); } } $(id).classList.remove('on'); if (!document.querySelector('.veil.on')) document.body.style.overflow = ''; lastFocus?.focus?.(); }
document.querySelectorAll('.veil').forEach(v => v.addEventListener('click', e => { if (e.target === v || e.target.closest('[data-close]')) closeV(v.id); }));
document.addEventListener('keydown', e => { if (e.key === 'Escape') document.querySelectorAll('.veil.on').forEach(v => closeV(v.id)); });
const opts = (list, s0) => list.map(x => `<option ${x === s0 ? 'selected' : ''}>${esc(x)}</option>`).join('');
function refreshOptions() {
  const keep = id => $(id).value;
  const a = keep('fFmt'), b = keep('fGenre'), c = keep('scanFmt'), d = keep('impFmt'), e2 = keep('scanGenre');
  $('fFmt').innerHTML = opts(FORMATS); $('fGenre').innerHTML = opts(GENRES); $('scanFmt').innerHTML = opts(FORMATS); $('impFmt').innerHTML = opts(FORMATS.slice(1));
  $('scanGenre').innerHTML = '<option value="">自動で判定</option>' + opts(GENRES);
  if (a) $('fFmt').value = a; if (b) $('fGenre').value = b; if (c) $('scanFmt').value = c; if (d) $('impFmt').value = d; $('scanGenre').value = e2 || '';
}
refreshOptions();
let tt; function toast(t, undo, look) { $('tMsg').textContent = t; $('tUndo').hidden = !undo; $('tGo').hidden = !look; $('tGo').onclick = () => { look(); $('toast').classList.remove('on'); }; $('tUndo').onclick = () => { undo(); $('toast').classList.remove('on'); }; $('toast').classList.add('on'); clearTimeout(tt); tt = setTimeout(() => $('toast').classList.remove('on'), undo ? 7000 : 3000); }

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
  $('fList').value = v.listPrice ?? ''; $('fPaid').value = v.paid ?? ''; $('fPaid').dataset.auto = v.paidAuto ? '1' : '';
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
  if (!$('fList').value && nb.listPrice != null) { $('fList').value = nb.listPrice; if (!$('fPaid').value) { $('fPaid').value = taxIn(nb.listPrice); $('fPaid').dataset.auto = '1'; } }
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
  const lp = nfkc($('fList').value).replace(/\D/g, ''), pd = nfkc($('fPaid').value).replace(/\D/g, '');
  base.listPrice = lp ? +lp : null; base.paid = pd !== '' ? +pd : (base.listPrice != null ? taxIn(base.listPrice) : null); base.paidAuto = pd === '' || !!$('fPaid').dataset.auto;
  if ($('fGenre').value !== (editing ? editing.genre : base.genre)) base.genreSet = true;
  Object.assign(base, { isbn, title, author: $('fAuthor').value.trim(), publisher: $('fPub').value.trim(), series: $('fSeries').value.trim(), vol: vol > 0 ? vol : null,
    genre: $('fGenre').value, format: $('fFmt').value, pubdate: $('fPubdate').value.trim(), boughtAt: $('fBought').value, place: $('fPlace').value.trim(), read: $('fRead').value,
    readAt: $('fRead').value === '読んだ' ? $('fReadAt').value : '', memo: $('fMemo').value.trim() });
  if (base.status === 'sold') { base.soldAt = $('fSoldAt').value; base.soldTo = $('fSoldTo').value.trim(); const np = price ? +price : null; if (np !== base.soldPrice) base.soldLot = ''; base.soldPrice = np; }
  delete base.genreFixed;
  const isNew = !editing; put(base); if (base.place) lsSet('hondana.lastPlace', base.place); closeV('vEdit');
  toast(isNew ? `「${base.title || 'ISBN ' + base.isbn}」を追加しました` : '保存しました');
  if (isNew) go('#b-' + encodeURIComponent(base.id));
});

/* ---------- バーコード ---------- */
let stream = null, scanTimer = null, lastCode = '', lastAt = 0, detector = null, zr = null, scanCount = 0, lastAdded = null;
let sellMode = false, sellSession = []; // 売る本を読むときの、この回に売った本（取り消し用に前の状態も持つ）
function setScanMode(sell) {
  sellMode = sell; $('scanMode').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String((b.dataset.m === 'sell') === sell)));
  $('sellBox').hidden = !sell; $('scanContBox').hidden = sell; $('scanPlaceBox').hidden = sell;
  $('scanT').textContent = sell ? '売る本を読む' : 'バーコードを読む';
  if (sell) { if (!$('sellAt').value) $('sellAt').value = today(); if (!$('sellTo').value) $('sellTo').value = lsGet('hondana.lastSoldTo', ''); updSellSum(); }
  scanSay(sell ? '売る本のバーコード（978で始まる上の段）を、1冊ずつ映してください。' : '本の裏のバーコード（978で始まる上の段）を、枠の中に横向きに映してください。続けて下の段も読むと、ジャンルが自動で付きます。');
}
$('scanMode').addEventListener('click', e => { const t = e.target.closest('[data-m]'); if (t) setScanMode(t.dataset.m === 'sell'); });
function updSellSum() {
  const bs = sellSession.map(s => books.get(s.id)).filter(Boolean), lp = bs.filter(b => b.listPrice != null);
  $('sellSum').textContent = bs.length ? `今回 ${bs.length}冊${lp.length ? `・定価の合計 ${yen(lp.reduce((a, b) => a + b.listPrice, 0))}${lp.length < bs.length ? `（${bs.length - lp.length}冊は定価不明）` : ''}` : ''}` : '';
}
async function onSellIsbn(isbn) {
  const at = $('sellAt').value || today(), to = $('sellTo').value.trim(), fmt = $('scanFmt').value, rd = $('scanRead').value, gn = $('scanGenre').value;
  if (to) lsSet('hondana.lastSoldTo', to);
  const same = [...books.values()].filter(x => x.isbn === isbn), o = same.find(x => x.status !== 'sold' && x.format === '紙') || same.find(x => x.status !== 'sold');
  let b, before = null, said;
  if (o) { before = { ...o }; b = { ...o, status: 'sold', soldAt: at, soldTo: to, trial: false }; if (rd && !o.read) b.read = rd; put(b); said = `「${b.title || 'ISBN ' + isbn}」を売った本にしました`; }
  else if (same.length) { scanSay(`「${same[0].title || 'ISBN ' + isbn}」は、もう売った本に入っています`, true); return; }
  else {
    scanSay(`ISBN ${isbn} を調べています…`);
    const r = await lookup(isbn); b = bookFromLookup(isbn, r, { format: fmt, read: rd, genre: gn });
    Object.assign(b, { status: 'sold', soldAt: at, soldTo: to, boughtAt: '', paid: null, paidAuto: false, place: '' }); put(b);
    said = r ? `「${b.title}」を売った本として登録しました` : `ISBN ${isbn} を売った本として登録しました（書名はあとで）`;
  }
  sellSession.push({ id: b.id, before }); lastAdded = { id: b.id, at: Date.now() };
  const li = document.createElement('li'); li.innerHTML = `<div class="mini">${coverHtml(b)}</div><span style="flex:1"></span><button class="btn" style="min-height:32px;flex:none;padding:0 10px;font-size:13px">取り消す</button>`;
  li.querySelector('span').textContent = (b.title || `ISBN ${isbn}`) + (b.listPrice != null ? `（定価${yen(b.listPrice)}）` : '');
  li.querySelector('button').onclick = () => { const i = sellSession.findIndex(s => s.id === b.id); if (i < 0) return; const s2 = sellSession.splice(i, 1)[0];
    if (s2.before) put(s2.before); else removeBook(b.id); li.remove(); updSellSum(); scanSay('取り消しました'); };
  $('scanList').prepend(li); updSellSum(); scanSay(said + '。次の本をどうぞ。', !o && !b.title);
}
const scanCv = document.createElement('canvas');
function scanSay(t, warn) { $('scanMsg').textContent = t; $('scanMsg').className = 'msg' + (warn ? ' warn' : ''); }
async function openScan(pre = {}) {
  $('scanList').innerHTML = ''; scanCount = 0; lastAdded = null; sellSession = []; $('sellAt').value = ''; $('sellTo').value = '';
  $('scanFmt').value = pre.format || lsGet('hondana.lastFmt', '紙'); $('scanRead').value = ''; $('scanGenre').value = pre.genre || ''; $('scanPlace').value = pre.place ?? lsGet('hondana.lastPlace', '');
  setScanMode(!!pre.sell); openV('vScan');
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
    if (cc && lastAdded && Date.now() - lastAdded.at < 15000) { lastCode = c; lastAt = Date.now(); const b = books.get(lastAdded.id), g = genreFromC(cc), lp = priceFromCode(c); if (b) { const nb = { ...b }, said = [];
      if (g && b.genre !== g && !b.genreSet && !$('scanGenre').value) { nb.genre = g; said.push(`ジャンル「${g}」`); }
      if (lp && b.listPrice == null) { nb.listPrice = lp; if (!sellMode && (b.paid == null || b.paidAuto)) { nb.paid = taxIn(lp); nb.paidAuto = true; } said.push(`定価${yen(lp)}`); }
      if (said.length) { put(nb); scanSay(`${said.join('と')}を入れました。次の本をどうぞ。`); if (sellMode) { updSellSum(); const li = $('scanList').firstElementChild?.querySelector('span'); if (li && lp) li.textContent = (nb.title || `ISBN ${nb.isbn}`) + `（定価${yen(lp)}）`; } } } break; }
  }
  if (stream) scanTimer = setTimeout(tick, 160);
}
async function onIsbn(isbn) {
  try { navigator.vibrate?.(60); } catch (e) {}
  if (sellMode) { await onSellIsbn(isbn); return; }
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
$('mSell').onclick = () => { closeV('vMenu'); openScan({ sell: true, format: '紙' }); };

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
  '出版社': 'publisher', 'publisher': 'publisher', 'isbn': 'isbn', 'isbn13': 'isbn', 'asin': 'asin', 'アイテムid': 'asin', 'シリーズ': 'series', '巻': 'vol', 'ジャンル': 'genre', '形態': 'format', '置き場所': 'place', '状態': 'status', 'status': 'kstatus', 'readstatus': 'kstatus', 'readingstatus': 'kstatus', '読書': 'read', '読了日': 'readAt', '読み終えた日': 'readAt',
  '出版日': 'pubdate', '発売日': 'pubdate', '購入日': 'boughtAt', 'acquiredtime': 'boughtAt', 'acquireddate': 'boughtAt', 'purchasedate': 'boughtAt', 'date': 'boughtAt', '売った日': 'soldAt', '売った先': 'soldTo', '金額': 'soldPrice', 'メモ': 'memo', 'お試し': 'trial', '定価': 'listPrice', '買った値段': 'paid', 'price': 'paid', 'まとまり': 'folder', '紙の版isbn': 'pisbn', 'まとめ売り': 'soldLot',
  '表紙url': 'cover', 'productimage': 'cover', 'image': 'cover', 'imageurl': 'cover', 'cover': 'cover', '追加日': 'addedAt' };
const colOf = h => COLS[nfkc(h).trim().toLowerCase()] || COLS[nfkc(h).trim()] || '';
function toDate(v) { if (v == null || v === '') return ''; if (typeof v === 'number' || /^\d{10,13}$/.test(String(v))) { const n = +v; return dstr(n < 1e11 ? n * 1000 : n); } const s = normPubdate(v); return s.length === 10 ? s : (Date.parse(v) ? dstr(Date.parse(v)) : ''); }
function recordToBook(o, fmtDefault) {
  const g = k => { const v = o[k]; return Array.isArray(v) ? v.join('・') : (v == null ? '' : String(v).trim()); };
  const title = g('title'), isbn = normIsbn(g('isbn')), asin = g('asin').toUpperCase();
  if (!title && !isbn) return null;
  const ps = parseSeries(title);
  let fmt = g('format'); fmt = FORMATS.includes(fmt) ? fmt : /kindle/i.test(fmt) ? 'Kindle' : /walker/i.test(fmt) ? 'BookWalker' : /dmm/i.test(fmt) ? 'DMM' : fmt ? 'その他電子' : fmtDefault;
  const read = normRead(g('read')) || (/^read$|^finished$|^既読$/i.test(g('kstatus')) ? '読んだ' : ''), vol = parseInt(g('vol'), 10), price = g('soldPrice').replace(/\D/g, '');
  const cover = /ndlsearch|images-amazon/.test(g('cover')) ? '' : httpsUrl(g('cover'));
  const added = Date.parse(g('addedAt'));
  return { id: newId(), title, author: cleanAuthor(g('author')) || g('author'), publisher: g('publisher'), isbn, asin, series: g('series') || ps.series, vol: vol > 0 ? vol : ps.vol,
    genre: g('genre') && g('genre') !== 'その他' ? g('genre') : (genreFromText(title, g('publisher')) || (fmt !== '紙' && ps.vol && !NOT_MANGA.test(title) ? '漫画' : 'その他')), format: fmt, place: g('place'),
    trial: /はい|true|1|yes/i.test(g('trial')), folder: g('folder'), pisbn: normIsbn(g('pisbn')), soldLot: g('soldLot'),
    listPrice: g('listPrice').replace(/\D/g, '') ? +g('listPrice').replace(/\D/g, '') : null, paid: g('paid').replace(/\D/g, '') !== '' ? +g('paid').replace(/\D/g, '') : null, status: /売|sold/.test(g('status')) ? 'sold' : 'own', read, readAt: read === '読んだ' ? toDate(g('readAt')) : '', pubdate: normPubdate(g('pubdate')), boughtAt: toDate(o.boughtAt) || today(),
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
        if (j.lists) { (j.lists.formats || []).forEach(f => { if (f && !FORMATS.includes(f)) FORMATS.splice(FORMATS.length - 1, 0, f); }); (j.lists.genres || []).forEach(g => { if (g && !GENRES.includes(g)) GENRES.splice(GENRES.length - 1, 0, g); }); saveLists(); refreshOptions(); }
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
  const upd = [];
  const squash = x => String(x || '').replace(/[・、,\s]/g, '');
  for (const c of cands) {
    if (!c.dup || !books.has(c.dup.id)) continue;
    const cur = books.get(c.dup.id), nb = { ...cur }; let ch = false;
    if (c.b.read === '読んだ' && !cur.read) { nb.read = '読んだ'; ch = true; }
    // 前の版でくっついてしまった共著者の名前を直す
    if (c.b.author && cur.author !== c.b.author && squash(cur.author) === squash(c.b.author)) { nb.author = c.b.author; ch = true; }
    if (ch) upd.push(nb);
  }
  if (upd.length) putMany(upd);
  if (!sel.length) { render(); closeV('vImp'); if (upd.length) toast(`登録済みの${upd.length}冊を更新しました（読んだ・著者名）`); return; }
  for (const c of picked) if (c.photo) { try { await setPhoto(c.b.id, await (await fetch(c.photo)).blob()); } catch (e) {} }
  if (!$('pasteBox').hidden) learn(boxes.filter(b => !b.checked).map(b => cands[+b.dataset.i]).filter(c => !c.dup).map(c => c.b.title));
  const now = Date.now(); sel.forEach((b, k) => { if (!b.addedAt || b.addedAt > now) b.addedAt = now - k; });
  putMany(sel); $('impText').value = ''; closeV('vImp'); toast(`${sel.length}冊を追加しました`); go('');
};

/* ---------- 書き出し ---------- */
async function exportCsv() {
  const head = ['書名', '著者', '出版社', 'ISBN', 'ASIN', 'シリーズ', '巻', 'ジャンル', '形態', '置き場所', '状態', '読書', '読み終えた日', '出版日', '購入日', '売った日', '売った先', '金額', 'メモ', '表紙URL', '追加日', 'お試し', '定価', '買った値段', 'まとまり', '紙の版ISBN', 'まとめ売り'];
  const q = v => { const s = String(v ?? ''); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const rows = [...books.values()].sort((a, b) => (a.addedAt || 0) - (b.addedAt || 0)).map(b => [b.title, b.author, b.publisher, b.isbn, b.asin, b.series, b.vol, b.genre, b.format, b.place, b.status === 'sold' ? '売った' : '持っている', b.read, b.readAt, b.pubdate, b.boughtAt, b.soldAt, b.soldTo, b.soldPrice, b.memo, httpsUrl(b.cover), dstr(b.addedAt), b.trial ? 'はい' : '', b.listPrice ?? '', b.paid ?? '', b.folder || '', b.pisbn || '', b.soldLot || ''].map(q).join(','));
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
  const data = { app: 'hondana', version: 2, exportedAt: new Date().toISOString(), books: [...books.values()], covers, series: serInfo, lists: { formats: FORMATS, genres: GENRES } };
  await saveFile('本棚まるごと_' + today() + '.json', new Blob([JSON.stringify(data)], { type: 'application/json' }), '写真の表紙も含めて書き出しました。「ファイル」アプリなどに保存しておいてください');
}

/* ---------- まとめて選ぶ（お試しにする／まとめて削除） ---------- */
let bulk = null;
function openBulk(o) {
  bulk = o;
  $('bulkT').textContent = o.title; $('bulkNote').textContent = o.note; $('bulkGo').textContent = o.action; $('bulkGo').className = 'btn ' + (o.danger ? 'danger' : 'gold');
  $('bulkList').innerHTML = o.items.length ? o.items.map((it, i) => `<label><input type="checkbox" data-i="${i}" ${it.checked ? 'checked' : ''}><span>${esc(it.b.title || 'ISBN ' + it.b.isbn)}${it.tag ? ` <span class="tag">${esc(it.tag)}</span>` : ''}</span></label>`).join('') : '<p class="note" style="padding:12px">当てはまる本はありませんでした。</p>';
  bulkCount(); $('bulkGo').dataset.armed = ''; closeV('vMenu'); openV('vBulk');
}
function bulkCount() { const n = $('bulkList').querySelectorAll('input:checked').length; $('bulkSum').textContent = `${bulk.items.length}冊中 ${n}冊を選んでいます`; $('bulkGo').disabled = !n; $('bulkGo').dataset.armed = ''; $('bulkGo').textContent = bulk.action; }
$('bulkList').addEventListener('change', bulkCount);
$('bulkAll').onclick = () => { const bs = [...$('bulkList').querySelectorAll('input')], on = bs.some(b => !b.checked); bs.forEach(b => b.checked = on); bulkCount(); };
$('bulkGo').onclick = async () => {
  const sel = [...$('bulkList').querySelectorAll('input:checked')].map(x => bulk.items[+x.dataset.i].b); if (!sel.length) return;
  if (bulk.danger && !$('bulkGo').dataset.armed) { $('bulkGo').dataset.armed = '1'; $('bulkGo').textContent = `もう一度押すと ${sel.length}冊を削除します`; return; }
  await bulk.run(sel); closeV('vBulk');
};
function trialCandidates() {
  const out = [], seen = new Set(), live = [...books.values()].filter(b => b.status !== 'sold' && !b.trial);
  const add = (b, tag, checked) => { if (!seen.has(b.id)) { seen.add(b.id); out.push({ b, tag, checked }); } };
  live.filter(b => /無料|お試し|ダイジェスト|試し読み|サンプル/.test(nfkc(b.title))).forEach(b => add(b, '無料・お試し', true));
  const bySer = new Map(); live.forEach(b => { const k = seriesKey(b); if (k) { if (!bySer.has(k)) bySer.set(k, []); bySer.get(k).push(b); } });
  for (const bs of bySer.values()) if (bs.length === 1 && bs[0].vol === 1 && bs[0].format !== '紙') add(bs[0], '1巻だけ', false);
  live.filter(b => b.format !== '紙' && !b.series && /第?[1１一]話/.test(nfkc(b.title))).forEach(b => add(b, '第1話だけ', false));
  return out;
}
$('mTrial').onclick = () => openBulk({
  title: 'お試しの本を選ぶ', action: 'お試しにする',
  note: '無料版や、1巻だけ持っている電子書籍を並べました。お試しにした本は普段の本棚には出ませんが、検索すれば見つかります。あとで「お試し」の絞り込みから、まとめて消せます。',
  items: trialCandidates(),
  run: sel => { putMany(sel.map(b => ({ ...b, trial: true }))); toast(`${sel.length}冊をお試しにしました`, () => putMany(sel.map(b => ({ ...books.get(b.id), trial: false })))); },
});
function openTrialDelete() {
  const items = [...books.values()].filter(b => b.trial).map(b => ({ b, checked: true }));
  openBulk({
    title: 'お試しの本をまとめて削除', action: 'まとめて削除', danger: true,
    note: '残したい本はチェックを外してください。消したあと、しばらくは「元に戻す」で戻せます。',
    items,
    run: async sel => {
      let keep = new Map(); try { const m = await idb.all(); sel.forEach(b => { if (m.has(b.id)) keep.set(b.id, m.get(b.id)); }); } catch (e) {}
      sel.forEach(b => books.delete(b.id)); save(); for (const b of sel) await dropPhoto(b.id); render();
      toast(`${sel.length}冊を削除しました`, async () => { for (const [k, v] of keep) await setPhoto(k, v); putMany(sel); });
    },
  });
}
$('mTrialDel').onclick = openTrialDelete;

/* ---------- 選択モード ---------- */
let sel = null, suppressClick = false;
function startSelect() { sel = new Set(); render(); toast('表紙を押して選んでください'); }
function endSelect(silent) { if (!sel) return; sel = null; $('selBar').hidden = true; if (!silent) render(); }
function idsOfTile(t, all) {
  const vis = b => all || passes(b);
  if (t.dataset.book) return [t.dataset.book];
  if (t.dataset.series) return [...books.values()].filter(b => seriesKey(b) === t.dataset.series && vis(b)).map(b => b.id);
  if (t.dataset.folder != null) return [...books.values()].filter(b => folderKey(b) === t.dataset.folder && vis(b)).map(b => b.id);
  return [];
}
function toggleTile(t) {
  const ids = idsOfTile(t); if (!ids.length) return;
  const on = !ids.every(id => sel.has(id)); ids.forEach(id => on ? sel.add(id) : sel.delete(id));
  t.classList.toggle('picked', on); updateSelBar();
}
function selBooks() { return [...sel].map(id => books.get(id)).filter(Boolean); }
function updateSelBar() {
  if (!sel) return; $('selBar').hidden = false; $('fab').hidden = true;
  $('selCount').textContent = sel.size ? `${sel.size}冊を選んでいます` : '表紙を押して選んでください';
  $('selBar').querySelectorAll('[data-act]').forEach(b => { if (b.dataset.act !== 'all' && b.dataset.act !== 'cancel') b.disabled = !sel.size; });
  const del = $('selBar').querySelector('[data-act="delete"]'); if (del && !del.dataset.armed) del.textContent = '削除';
}
function applySel(change, msg, look) {
  const before = selBooks().map(b => ({ ...b })), after = before.map(b => ({ ...b, ...change(b) }));
  putMany(after); endSelect();
  toast(msg.replace('{n}', after.length), () => putMany(before), look && look());
}
$('selBar').addEventListener('click', async e => {
  const t = e.target.closest('[data-act]'); if (!t || !sel) return;
  const act = t.dataset.act, list = selBooks();
  if (act === 'cancel') { endSelect(); return; }
  if (act === 'all') {
    const tiles = [...app.querySelectorAll('.tile,.sp')], all = tiles.flatMap(x => idsOfTile(x)), on = !all.every(id => sel.has(id));
    all.forEach(id => on ? sel.add(id) : sel.delete(id)); tiles.forEach(x => x.classList.toggle('picked', on)); updateSelBar(); return;
  }
  if (!list.length) return;
  if (act === 'trial') { const on = !list.every(b => b.trial); applySel(() => ({ trial: on }), on ? '{n}冊をお試しにしました' : '{n}冊のお試しを外しました'); }
  else if (act === 'read') openPick({ title: '読んだ？', options: [['読んだ', '読んだ'], ['まだ', 'まだ'], ['', '未設定に戻す']], onPick: v => applySel(b => ({ read: v, readAt: v === '読んだ' ? b.readAt || '' : '' }), v ? `{n}冊を「${v}」にしました` : '{n}冊を未設定に戻しました') });
  else if (act === 'genre') openPick({ title: 'ジャンル', options: GENRES.map(g => [g, g]), onPick: v => applySel(() => ({ genre: v, genreSet: true }), `{n}冊を「${v}」にしました`) });
  else if (act === 'format') openPick({ title: 'ストア', options: FORMATS.map(f => [f, f]), onPick: v => applySel(() => ({ format: v }), `{n}冊を「${v}」にしました`) });
  else if (act === 'paid') openPick({ title: '買った値段（1冊あたり）', input: { placeholder: '0（無料なら0）', numeric: true }, onPick: v => { const n = parseInt(nfkc(v).replace(/\D/g, ''), 10); if (isNaN(n)) return; applySel(() => ({ paid: n, paidAuto: false }), `{n}冊を${yen(n)}にしました`); } });
  else if (act === 'fold') {
    const names = [...new Set([...books.values()].map(b => b.folder).filter(Boolean))];
    openPick({ title: 'まとまりの名前', options: names.map(n => [n, n]), input: { placeholder: '新しいまとまりの名前', value: suggestName(list) }, onPick: v => { v = String(v).trim(); if (v) applySel(() => ({ folder: v }), `{n}冊を「${v}」にまとめました`, () => lookFolder(v)); } });
  }
  else if (act === 'sold') openSold(list.map(b => b.id), {});
  else if (act === 'unfold') applySel(() => ({ folder: '' }), '{n}冊をまとまりから外しました');
  else if (act === 'delete') {
    if (!t.dataset.armed) { t.dataset.armed = '1'; t.textContent = `もう一度押すと${list.length}冊を削除`; return; }
    t.dataset.armed = ''; const keep = new Map(); try { const m = await idb.all(); list.forEach(b => { if (m.has(b.id)) keep.set(b.id, m.get(b.id)); }); } catch (er) {}
    list.forEach(b => books.delete(b.id)); save(); for (const b of list) await dropPhoto(b.id); endSelect();
    toast(`${list.length}冊を削除しました`, async () => { for (const [k, v] of keep) await setPhoto(k, v); putMany(list); });
  }
});

/* ---------- 売った本の記録（まとめて売ったとき） ---------- */
let soldIds = [], soldFromScan = false;
function openSold(ids, o) {
  soldIds = ids; soldFromScan = !!o.fromScan; if (!ids.length) return;
  const bs = ids.map(id => books.get(id)), lp = bs.filter(b => b.listPrice != null).reduce((a, b) => a + b.listPrice, 0);
  $('soldT').textContent = o.fromScan ? `${ids.length}冊を売りました` : `${ids.length}冊を売った本にする`;
  $('soldInfo').textContent = (lp ? `定価の合計は ${yen(lp)} です。` : '') + (o.fromScan ? 'もう「売った」になっています。売れた金額がわかれば入れてください。' : '');
  $('sdAt').value = o.at || bs.find(b => b.soldAt)?.soldAt || today(); $('sdTo').value = o.to ?? (bs.find(b => b.soldTo)?.soldTo || lsGet('hondana.lastSoldTo', '')); $('sdTotal').value = '';
  openV('vSold');
}
$('sdOk').onclick = () => {
  const at = $('sdAt').value || today(), to = $('sdTo').value.trim(), tot = nfkc($('sdTotal').value).replace(/\D/g, ''), n = soldIds.length;
  const before = soldIds.map(id => ({ ...books.get(id) })); if (to) lsSet('hondana.lastSoldTo', to);
  const total = tot ? +tot : null, per = total != null ? Math.floor(total / n) : null, rem = total != null ? total - per * n : 0;
  putMany(before.map((b, i) => ({ ...b, status: 'sold', soldAt: at, soldTo: to, trial: false,
    ...(total != null ? { soldPrice: per + (i < rem ? 1 : 0), soldLot: n > 1 ? `${n}冊まとめて${yen(total)}` : '' } : {}) })));
  closeV('vSold'); if (sel) endSelect();
  toast(`${n}冊を売った本にしました${total != null ? `（${yen(total)}）` : ''}`, soldFromScan && total == null ? null : () => putMany(before));
};

/* ---------- 選ぶだけの小さなシート ---------- */
let pickCb = null;
function openPick(o) {
  pickCb = o.onPick; $('pickT').textContent = o.title;
  $('pickOpts').innerHTML = (o.options || []).map(([v, l]) => `<button class="opt" data-v="${esc(v)}" style="min-height:52px"><b>${esc(l)}</b></button>`).join('');
  $('pickInBox').hidden = !o.input;
  if (o.input) { $('pickIn').value = o.input.value || ''; $('pickIn').placeholder = o.input.placeholder || ''; $('pickIn').inputMode = o.input.numeric ? 'numeric' : 'text'; }
  openV('vPick'); if (o.input && !(o.options || []).length) setTimeout(() => $('pickIn').focus(), 40);
}
$('pickOpts').addEventListener('click', e => { const t = e.target.closest('[data-v]'); if (!t) return; closeV('vPick'); pickCb?.(t.dataset.v); });
$('pickOk').onclick = () => { const v = $('pickIn').value; if (!v.trim()) { $('pickIn').focus(); return; } closeV('vPick'); pickCb?.(v); };
$('pickIn').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); $('pickOk').click(); } });

/* ---------- まとまり（フォルダ） ---------- */
function lcsName(a, b) { // ふたつの名前に共通するいちばん長い部分（「賭博黙示録 カイジ」と「賭博破戒録 カイジ」→「カイジ」）
  a = nfkc(a); b = nfkc(b); let best = '';
  for (let i = 0; i < a.length; i++) for (let j = i + best.length + 1; j <= a.length; j++) { const s2 = a.slice(i, j); if (b.includes(s2)) best = s2; else break; }
  // 単語の途中で切れていたら、切れ端を落とす（「録 カイジ」→「カイジ」）
  const i = a.indexOf(best), j = i + best.length, sep = /[\s・:：\-－]/;
  if (i > 0 && !sep.test(a[i - 1]) && /\s/.test(best)) best = best.slice(best.search(/\s/) + 1);
  if (j < a.length && !sep.test(a[j]) && /\s/.test(best)) best = best.slice(0, best.lastIndexOf(' '));
  return best.replace(/^[\s・:：\-－]+|[\s・:：\-－(（]+$/g, '').trim();
}
function suggestName(list) {
  const names = [...new Set(list.map(b => b.folder || b.series || b.title).filter(Boolean))];
  if (names.length === 1) return names[0];
  let c = names[0] || ''; for (const n of names.slice(1)) c = lcsName(c, n);
  return c.length >= 2 ? c : (names[0] || '');
}
function renderFolder(key) {
  const all = [...books.values()].filter(b => folderKey(b) === key);
  if (!all.length) { location.hash = ''; return; }
  const name = all[0].folder, own = all.filter(b => b.status !== 'sold' && !b.trial), money = sumPaid(own);
  const nSer = new Set(all.map(b => seriesKey(b) || b.id)).size;
  app.innerHTML = `<div class="page" style="padding-left:0;padding-right:0">
    <div style="padding:0 20px"><button class="back" data-home>${svgBack}本棚</button>
    <h2 style="margin:4px 0 0;font:700 24px/1.3 var(--serif);color:var(--gold)">${esc(name)}</h2>
    <p class="sub">${nSer}作品・${own.length}冊${money.n ? `・${yen(money.sum)}` : ''}</p>
    <div class="row" style="margin-top:12px;flex-wrap:nowrap"><button class="btn" id="fRename" style="min-height:40px;padding:0 8px;font-size:14px;white-space:nowrap">名前を変える</button><button class="btn" id="fSel" style="min-height:40px;padding:0 8px;font-size:14px">選ぶ</button><button class="btn danger" id="fUndo" style="min-height:40px;padding:0 8px;font-size:14px;white-space:nowrap">まとまりを解く</button></div></div>
    ${resultsHtml(key)}
  </div>`;
  $('fRename').onclick = () => openPick({ title: 'まとまりの名前', input: { value: name }, onPick: v => { v = String(v).trim(); if (!v) return; putMany(all.map(b => ({ ...b, folder: v }))); go('#f-' + encodeURIComponent(norm(v))); toast('名前を変えました'); } });
  $('fSel').onclick = () => startSelect();
  let armed = false;
  $('fUndo').onclick = () => { if (!armed) { armed = true; $('fUndo').textContent = 'もう一度押す'; return; } const before = all.map(b => ({ ...b })); putMany(all.map(b => ({ ...b, folder: '' }))); go(''); toast(`「${name}」を解きました（本はそのままです）`, () => putMany(before)); };
}

/* 長押しして別の表紙に重ねると、ひとつのまとまりになる */
let drag = null, lp = null;
app.addEventListener('contextmenu', e => { if (e.target.closest('.grid .tile')) e.preventDefault(); });
app.addEventListener('pointerdown', e => {
  if (sel || drag || (e.pointerType === 'mouse' && e.button !== 0)) return;
  const tile = e.target.closest('.grid .tile'); if (!tile) return;
  const sx = e.clientX, sy = e.clientY;
  clearTimeout(lp?.timer);
  lp = { tile, sx, sy, id: e.pointerId, timer: setTimeout(() => beginDrag(tile, lp.x ?? sx, lp.y ?? sy), 480) };
});
function beginDrag(tile, x, y) {
  const r = tile.getBoundingClientRect(), g = tile.querySelector('.cv,.stack').cloneNode(true);
  const ghost = document.createElement('div'); ghost.className = 'ghost'; ghost.style.width = r.width + 'px'; ghost.appendChild(g); document.body.append(ghost);
  drag = { tile, ghost, w: r.width, over: null }; tile.classList.add('dragging'); moveGhost(x, y);
  try { navigator.vibrate?.(30); } catch (e) {}
}
function moveGhost(x, y) {
  drag.ghost.style.transform = `translate(${x - drag.w / 2}px,${y - drag.w * .75}px) scale(1.05)`;
  const el = document.elementFromPoint(x, y)?.closest('.grid .tile');
  const over = el && el !== drag.tile ? el : null;
  if (over !== drag.over) { drag.over?.classList.remove('dropto'); over?.classList.add('dropto'); drag.over = over; }
}
document.addEventListener('pointermove', e => {
  if (drag) { moveGhost(e.clientX, e.clientY); return; }
  if (lp) { lp.x = e.clientX; lp.y = e.clientY; if (Math.hypot(e.clientX - lp.sx, e.clientY - lp.sy) > 10) { clearTimeout(lp.timer); lp = null; } }
});
document.addEventListener('touchmove', e => { if (drag) e.preventDefault(); }, { passive: false });
function endDrag(ok) {
  clearTimeout(lp?.timer); lp = null; if (!drag) return;
  const { tile, over, ghost } = drag; ghost.remove(); tile.classList.remove('dragging'); over?.classList.remove('dropto'); drag = null; suppressClick = true; setTimeout(() => { suppressClick = false; }, 400);
  if (ok && over) mergeTiles(tile, over);
}
document.addEventListener('pointerup', () => endDrag(true));
document.addEventListener('pointercancel', () => endDrag(false));
function mergeTiles(src, dst) {
  const a = idsOfTile(src, true).map(id => books.get(id)), b = idsOfTile(dst, true).map(id => books.get(id));
  const before = [...a, ...b].map(x => ({ ...x }));
  const apply = name => { putMany([...a, ...b].map(x => ({ ...x, folder: name }))); toast(`「${name}」にまとめました`, () => putMany(before), lookFolder(name)); };
  if (dst.dataset.folder != null) { apply(b[0].folder); return; }
  if (src.dataset.folder != null) { apply(a[0].folder); return; }
  openPick({ title: 'まとまりの名前', input: { value: suggestName([...b, ...a]), placeholder: 'まとまりの名前' }, options: [], onPick: v => { v = String(v).trim(); if (v) apply(v); } });
}

/* 書名の後ろに付いたシリーズ名（「ラヴクラフト傑作集」「類語辞典シリーズ」など）から、まとまりの候補を探す */
function folderCandidates() {
  const live = [...books.values()].filter(b => !b.folder), bySuf = new Map();
  for (const b of live) {
    let t = nfkc(b.title).replace(/【[^】]*】|［[^］]*］|\[[^\]]*\]/g, ' ');
    for (let i = 0; i < 3; i++) { const m = t.match(/\s*[(（]([^()（）]*)[)）]\s*$/); if (!m) break; t = t.slice(0, m.index); }
    const w = t.trim().split(/\s+/); if (w.length < 2) continue;
    for (let k = 1; k <= Math.min(3, w.length - 1); k++) {
      const suf = w.slice(-k).join(' '); if (suf.length < 4 || /^[\d\s.]/.test(suf)) continue;
      if (!bySuf.has(suf)) bySuf.set(suf, new Map()); bySuf.get(suf).set(b.id, b);
    }
  }
  let out = [];
  for (const [suf, m] of bySuf) {
    const bs = [...m.values()], bases = new Set(bs.map(b => seriesKey(b) || norm(b.title.replace(suf, ''))));
    if (bs.length >= 2 && bases.size >= 2 && bs.every(b => !norm(b.series).includes(norm(suf)))) out.push({ name: suf.replace(/^NHK/, 'NHK '), books: bs, sig: bs.map(b => b.id).sort().join() });
  }
  out.sort((x, y) => y.name.length - x.name.length);
  const seen = new Set(); out = out.filter(c => !seen.has(c.sig) && seen.add(c.sig));
  return out.sort((x, y) => y.books.length - x.books.length);
}
$('mFolders').onclick = () => {
  const cands = folderCandidates();
  openBulk({
    title: 'まとまりの候補', action: 'まとめる',
    note: '書名の後ろに同じシリーズ名が付いている本を集めました。チェックした候補が、それぞれひとつのまとまりになります。名前はあとで変えられます。',
    items: cands.map(c => ({ b: { id: c.sig, title: `${c.name}（${c.books.length}冊）`, isbn: '' }, tag: c.books.slice(0, 2).map(b => (b.series || b.title).slice(0, 10)).join('、') + (c.books.length > 2 ? '…' : ''), checked: false, c })),
    run: sel2 => { const picked = cands.filter(c => sel2.some(x => x.id === c.sig)), done = new Set(), up = [];
      for (const c of picked) for (const b of c.books) if (!done.has(b.id)) { done.add(b.id); up.push({ ...b, folder: c.name }); }
      putMany(up); toast(`${picked.length}個のまとまりを作りました`); },
  });
};

/* ---------- ジャンル・ストアを編集 ---------- */
function renderLists() {
  const cnt = (k, v) => [...books.values()].filter(b => (b[k] || '') === v).length;
  const row = (k, v, fixed) => { const n = cnt(k, v); return `<div class="ir" style="align-items:center"><span style="color:var(--ink)">${esc(v)} <span class="note">${n}冊</span></span>${fixed ? '<span class="note">固定</span>' : n ? '<span class="note">使用中</span>' : `<button class="btn danger" data-del="${k}" data-v="${esc(v)}" style="min-height:36px">削除</button>`}</div>`; };
  $('listGenres').innerHTML = GENRES.map(g => row('genre', g, g === 'その他')).join('');
  $('listFormats').innerHTML = FORMATS.map(f => row('format', f, f === '紙')).join('');
}
$('mLists').onclick = () => { renderLists(); closeV('vMenu'); openV('vLists'); };
$('vLists').addEventListener('click', e => {
  const t = e.target.closest('[data-del]'); if (!t) return;
  const arr = t.dataset.del === 'genre' ? GENRES : FORMATS, i = arr.indexOf(t.dataset.v); if (i >= 0) arr.splice(i, 1);
  saveLists(); refreshOptions(); renderLists(); render();
});
function addList(kind) {
  const inp = kind === 'genre' ? $('newGenre') : $('newFormat'), v = inp.value.trim(); if (!v) { inp.focus(); return; }
  const arr = kind === 'genre' ? GENRES : FORMATS;
  if (arr.includes(v)) { toast('もうあります'); return; }
  arr.splice(arr.length - 1, 0, v); inp.value = ''; saveLists(); refreshOptions(); renderLists(); render(); toast(`「${v}」を足しました`);
}
$('addGenre').onclick = () => addList('genre'); $('addFormat').onclick = () => addList('format');
$('newGenre').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addList('genre'); } });
$('newFormat').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addList('format'); } });

/* ---------- お金のまとめ ---------- */
$('mMoney').onclick = () => {
  const all = [...books.values()], own = all.filter(b => b.status !== 'sold' && !b.trial), sold = all.filter(b => b.status === 'sold');
  const spent = sumPaid([...own, ...sold]), back = sold.reduce((a, b) => a + (+b.soldPrice || 0), 0), nb = sold.filter(b => b.soldPrice).length;
  const by = (key, list) => { const m = new Map(); list.forEach(b => { const k = b[key] || '—'; const v = m.get(k) || { n: 0, known: 0, sum: 0 }; v.n++; if (b.paid != null) { v.known++; v.sum += +b.paid; } m.set(k, v); }); return [...m.entries()].sort((a, b) => b[1].sum - a[1].sum); };
  const table = (title, rows) => `<h3>${title}</h3><div class="info">${rows.map(([k, v]) => `<div class="ir"><span>${esc(k)}</span><span>${v.known ? yen(v.sum) : '—'} <span class="note">${v.known < v.n ? `（${v.n}冊中${v.known}冊）` : `（${v.n}冊）`}</span></span></div>`).join('')}</div>`;
  const ser = new Map(); own.forEach(b => { if (!b.series) return; const k = seriesKey(b); const v = ser.get(k) || { name: b.series, n: 0, known: 0, sum: 0 }; v.n++; if (b.paid != null) { v.known++; v.sum += +b.paid; } ser.set(k, v); });
  const top = [...ser.values()].filter(v => v.known).sort((a, b) => b.sum - a.sum).slice(0, 5).map(v => [v.name, v]);
  $('moneyBody').innerHTML = `
    <div class="info">
      <div class="ir"><span>本に使ったお金</span><span><b style="color:var(--gold);font-size:18px">${yen(spent.sum)}</b> <span class="note">（値段がわかる${spent.n}冊分）</span></span></div>
      <div class="ir"><span>売って戻ってきたお金</span><span>${yen(back)} <span class="note">（${nb}冊）</span></span></div>
      <div class="ir"><span>差し引き</span><span>${yen(spent.sum - back)}</span></div>
      <div class="ir"><span>値段がわからない本</span><span>${own.length - sumPaid(own).n}冊</span></div>
    </div>
    ${table('ストア別', by('format', own))}
    ${table('ジャンル別', by('genre', own))}
    ${top.length ? table('お金をかけたシリーズ', top) : ''}
    <p class="note" style="margin-top:12px">紙の本は、バーコードの下の段を読むと定価が入ります。電子書籍は値段がわからないので、選択モードの「値段」でまとめて入れられます（無料なら0円）。</p>`;
  closeV('vMenu'); openV('vMoney');
};

/* ---------- 電子書籍の情報を紙の版から補う ---------- */
let enrichRun = null;
function cleanForSearch(b) {
  const p = parseSeries(b.title);
  let t = p.series ? `${p.series} ${p.vol}` : nfkc(b.title).replace(/【[^】]*】|［[^］]*］|\[[^\]]*\]/g, ' ').replace(/\s*[(（][^()（）]*[)）]\s*$/, '');
  return { q: t.replace(/\s+/g, ' ').trim(), series: p.series, vol: p.vol, author: String(b.author || '').split(/[・、,]/)[0].replace(/\s+/g, ' ').trim() };
}
async function paperCandidates(q) {
  const out = [];
  try {
    const x = await fetchText(`https://ndlsearch.ndl.go.jp/api/opensearch?title=${encodeURIComponent(q.series || q.q)}${q.author ? '&creator=' + encodeURIComponent(q.author.replace(/\s/g, '')) : ''}&cnt=15&mediatype=books`, 9000);
    const d = new DOMParser().parseFromString(x, 'application/xml');
    for (const it of d.querySelectorAll('item')) {
      const g = n => it.getElementsByTagName(n)[0]?.textContent.trim() || '';
      const isbn = [...it.getElementsByTagName('dc:identifier')].map(e => normIsbn(e.textContent)).find(Boolean);
      if (isbn) out.push({ isbn, title: g('dc:title'), vol: g('dcndl:volume'), author: g('dc:creator'), publisher: g('dc:publisher'), pubdate: normPubdate(g('dcterms:issued')) });
    }
  } catch (e) {}
  if (!out.length) {
    try {
      const j = await fetchJson(`https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent('intitle:' + q.q + (q.author ? ' inauthor:' + q.author : ''))}&maxResults=10&printType=books`, 9000);
      for (const it of (j && j.items) || []) {
        const v = it.volumeInfo || {}, isbn = (v.industryIdentifiers || []).map(x => normIsbn(x.identifier)).find(Boolean);
        if (isbn) out.push({ isbn, title: v.title + (v.subtitle ? ' ' + v.subtitle : ''), vol: '', author: (v.authors || []).join('・'), publisher: v.publisher || '', pubdate: normPubdate(v.publishedDate) });
      }
    } catch (e) {}
  }
  return out;
}
function judge(b, q, c) {
  const want = norm(q.series ? q.series + q.vol : q.q), got = norm(cleanTitle(c.title, c.vol));
  const vol = q.vol ? String(q.vol) : '', gp = parseSeries(cleanTitle(c.title, c.vol));
  const sameVol = !vol || (gp.vol ? String(gp.vol) === vol : got.endsWith(vol));
  const au = q.author && c.author ? norm(c.author).includes(norm(q.author).slice(0, 3)) : true;
  if (got === want && au) return 'sure';
  if (q.series && gp.series && norm(gp.series) === norm(q.series) && sameVol && au) return 'sure';
  if ((got.startsWith(want) || want.startsWith(got)) && sameVol && au && got.length > 1) return 'maybe';
  return '';
}
async function applyPaper(b, c) {
  const r = await lookup(c.isbn).catch(() => null), cur = books.get(b.id) || b;
  const nb = { ...cur, pisbn: c.isbn, enrichTried: true };
  if (!nb.publisher) nb.publisher = (r && r.publisher) || c.publisher || '';
  if (!nb.pubdate) nb.pubdate = (r && r.pubdate) || c.pubdate || '';
  if (!nb.cover && r && r.cover) nb.cover = r.cover;
  const g = (r && r.genre && r.genre !== 'その他') ? r.genre : '';
  if (g && !nb.genreSet) nb.genre = g;
  return nb;
}
$('mEnrich').onclick = () => { closeV('vMenu'); $('enMsg').textContent = ''; $('enList').innerHTML = ''; $('enPrev').hidden = true; updateEnrichInfo(); openV('vEnrich'); };
function enrichTargets(again) { return [...books.values()].filter(b => b.format !== '紙' && !b.isbn && !b.pisbn && b.title && !b.trial && (again || !b.enrichTried)); }
function updateEnrichInfo() { const n = enrichTargets(false).length, m = enrichTargets(true).length; $('enInfo').textContent = `まだ調べていない電子書籍：${n}冊（調べたが見つからなかった本も含めると${m}冊）`; $('enGo').disabled = !n; }
$('enGo').onclick = () => runEnrich(false);
$('enAgain').onclick = () => runEnrich(true);
$('enStop').onclick = () => { if (enrichRun) enrichRun.stop = true; };
async function runEnrich(again) {
  if (enrichRun) return;
  const list = enrichTargets(again); if (!list.length) return;
  enrichRun = { stop: false }; const maybes = [], buf = []; let sure = 0, none = 0, i = 0;
  $('enGo').disabled = true; $('enAgain').disabled = true; $('enStop').hidden = false; $('enPrev').hidden = true;
  const flush = () => { if (buf.length) { putMany(buf.splice(0)); } };
  for (const b of list) {
    if (enrichRun.stop) break; i++;
    $('enMsg').textContent = `${i}／${list.length}冊目：${b.title.slice(0, 24)}…（見つかった ${sure}冊・確認が必要 ${maybes.length}冊）`;
    const q = cleanForSearch(b); let cands = await paperCandidates(q);
    // 書名の後ろにシリーズ名が付いていて見つからないときは、最初のまとまりだけでもう一度
    if (!cands.length && !q.series) { const first = q.q.split(' ')[0]; if (first.length >= 3 && first !== q.q) { q.q = first; cands = await paperCandidates(q); } }
    let best = null, how = '';
    for (const c of cands) { const j2 = judge(b, q, c); if (j2 === 'sure') { best = c; how = 'sure'; break; } if (j2 === 'maybe' && !best) { best = c; how = 'maybe'; } }
    if (how === 'sure') { buf.push(await applyPaper(b, best)); sure++; }
    else if (how === 'maybe') { maybes.push({ b, c: best }); buf.push({ ...(books.get(b.id) || b), enrichTried: true }); }
    else { none++; buf.push({ ...(books.get(b.id) || b), enrichTried: true }); }
    if (buf.length >= 15) flush();
    await sleep(250);
  }
  flush();
  const stopped = enrichRun.stop; enrichRun = null; $('enStop').hidden = true; $('enAgain').disabled = false; updateEnrichInfo();
  $('enMsg').textContent = `${stopped ? '途中で止めました。' : '終わりました。'}${sure}冊に紙の版の情報を入れました。見つからなかった本：${none}冊。${maybes.length ? `下の${maybes.length}冊は、似た本が見つかったので確かめてください。` : ''}`;
  if (maybes.length) {
    $('enList').innerHTML = maybes.map((m, k) => `<label><input type="checkbox" data-k="${k}"><span>${esc(m.b.title)}<br><span class="note">→ ${esc(cleanTitle(m.c.title, m.c.vol))}・${esc(m.c.publisher || '')} ${esc(jdate(m.c.pubdate))}</span></span></label>`).join('');
    $('enPrev').hidden = false; $('enApply').onclick = async () => {
      const pick = [...$('enList').querySelectorAll('input:checked')].map(x => maybes[+x.dataset.k]); const up = [];
      for (const m of pick) up.push(await applyPaper(m.b, m.c));
      if (up.length) putMany(up); $('enPrev').hidden = true; toast(`${up.length}冊に紙の版の情報を入れました`);
    };
  }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

$('fPaid').addEventListener('input', () => { $('fPaid').dataset.auto = ''; });

/* ---------- シリーズをまとめ直す ---------- */
function regroup(onlyAuto) {
  const out = [];
  for (const b of books.values()) {
    const p = parseSeries(b.title); if (!p.series) continue;
    if (onlyAuto && !b.asin) continue;
    if (norm(p.series) !== norm(b.series) || (p.vol && p.vol !== b.vol)) out.push({ ...b, series: p.series, vol: p.vol ?? b.vol });
  }
  // 同じシリーズに漫画の巻があれば、ジャンルもそろえる
  if (out.length) putMany(out);
  const fix = [];
  for (const b of books.values()) {
    if (b.genre !== 'その他') continue;
    const g = seriesGenre(b.series) || (b.asin ? (genreFromText(b.title) || (b.vol && !NOT_MANGA.test(b.title) ? '漫画' : '')) : '');
    if (g && g !== 'その他') fix.push({ ...b, genre: g });
  }
  if (fix.length) putMany(fix);
  return out.length;
}
$('mRegroup').onclick = () => { const n = regroup(false); closeV('vMenu'); toast(n ? `${n}冊のシリーズをまとめ直しました` : 'まとめ直す本はありませんでした'); };

/* ---------- 起動 ---------- */
load();
if (lsGet('hondana.regroupVer', '') !== '2') { lsSet('hondana.regroupVer', '2'); setTimeout(() => { const n = regroup(true); if (n) toast(`Kindleの本 ${n}冊をシリーズにまとめ直しました`); }, 0); }
render();
idb.all().then(m => { for (const [k, blob] of m) { if (books.has(k)) photos.set(k, URL.createObjectURL(blob)); } if (m.size) render(); }).catch(() => {});
try { navigator.storage?.persist?.(); } catch (e) {}
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
window.addEventListener('storage', e => { if (e.key === KEY) { load(); render(); } });
window.__hondana = { books: () => [...books.values()], parseSeries, genreFromC, priceCode, photos, noCov };
}
