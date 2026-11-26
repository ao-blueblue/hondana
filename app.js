/* わたしの本棚 — 端末の中だけで動く蔵書アプリ */
'use strict';
{
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const nfkc = s => String(s || '').normalize('NFKC');
// 「漢字(かんじ)」のような読み仮名は外して扱う（漢字のすぐ後ろの、かなだけのかっこ）
const RUBY = /([\u3400-\u9FFF々〆ヵヶ])[（(]([ぁ-ゖァ-ヺー・ 　]{1,12})[)）]/g;
const unruby = s => String(s || '').replace(RUBY, '$1');
const norm = s => unruby(nfkc(s)).toLowerCase().replace(/[\s・:：\-－―‐()（）\[\]［］【】「」『』〈〉《》!！?？.,、。~〜'"]/g, '');
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
// ISBNのない本（同人誌やゲーム会社の本など）に付いている、45・49で始まる商品用のバーコード
function janOf(v) { const s = nfkc(v).replace(/\D/g, ''); return /^4[59]\d{11}$/.test(s) && ok13(s) ? s : ''; }
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
// 【作品名】のように、かっこの中が書名そのものの本もある。かっこを外したら書名が残らないとき（や「新装版」だけになるとき）は、かっこの中身を書名として読み直す
const EDITION_ONLY = /^(新装版|完全版|愛蔵版|文庫版|新版|改訂版|復刻版|特装版|限定版)$/;
function parseSeries(title) {
  const r = parseSeries1(title, false);
  if ((!r.series || EDITION_ONLY.test(r.series)) && /[【［\[〔]/.test(title)) { const r2 = parseSeries1(title, true); if (r2.series && !EDITION_ONLY.test(r2.series)) return r2; }
  return r;
}
function parseSeries1(title, keepBr) {
  let t = unruby(nfkc(title)).trim();
  // 飾り・おまけ表記・レーベル名を外す（巻数だけのかっこは残す）
  // かっこの中の数字（［R-16］の16など）は巻数とまちがえないよう、全角にしておく
  t = keepBr ? t.replace(/[【［\[〔]([^】］\]〕]*)[】］\]〕]/g, (_, x) => ' ' + x.replace(/\d/g, d => String.fromCharCode(d.charCodeAt(0) + 0xFEE0)) + ' ').replace(/期間限定|無料お試し版|試し読み増量版?|無料/g, ' ') : t.replace(/【[^】]*】|［[^］]*］|\[[^\]]*\]|〔[^〕]*〕/g, ' ');
  t = t.replace(/[(（][^()（）]*(?:特典|限定|描き下ろし|おまけ|特装|カラー版|分冊版|単話|English Edition)[^()（）]*[)）]/gi, ' ');
  for (let i = 0; i < 4; i++) { const m = t.match(/\s*[(（]([^()（）]*)[)）]\s*$/); if (!m || /^\s*(\d{1,4}|上|中|下|前編|後編)\s*$/.test(m[1])) break; t = t.slice(0, m.index); }
  t = t.replace(/(\d+)\s*[〜~～]\s*\d+/g, '$1');
  for (let i = 0; i < 3; i++) t = t.replace(/[\s　]*(特装版|限定版|通常版|豪華版|完結|完|最終巻)[\s　]*$/, '');
  t = t.replace(/\s+/g, ' ').trim();
  // 出版社の登録ミスで「作品名 1 1」のように巻数が2回並ぶ本がある。空白をはさんで同じ数字が並ぶときだけ1つにする（本当の11巻は「11」とくっついている）
  t = t.replace(/(\d{1,4}) \1$/, '$1');
  const clean = x => x.replace(/[\s　:：\-－,、.・]+$/, '').replace(/^[\s　:：]+/, '').trim();
  const vnum = x => KANJI_VOL[x] ?? parseInt(x, 10);
  const ok = (ser, v) => { ser = clean(ser); v = vnum(v); return ser && !/^\d{1,2}$/.test(ser) && v > 0 && v < 2000 ? { series: ser, vol: v } : null; }; // 数字だけのシリーズ名（「【作品名】 13」→「1」）は作らない
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
  // ○○(1)副題（かっこの直後に副題が続く形）
  if ((m = t.match(/^(.+?\D)[\s　]*[（(](\d{1,3}|上|中|下)[)）]\s*(\D.*)$/)) && (r = ok(m[1], m[2]))) return r;
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
    cover: o.cover || '', memo: o.memo || '', listPrice: o.listPrice ?? null, paid: o.paid ?? null, paidAuto: o.paidAuto ?? false, folder: o.folder || '', pisbn: o.pisbn || '', trial: !!o.trial, genreSet: !!o.genreSet, soldAt: o.soldAt || '', soldTo: o.soldTo || '', soldPrice: o.soldPrice ?? null, soldLot: o.soldLot || '', prevId: o.prevId || '', addedAt: o.addedAt || Date.now() }));
}
// 保存するときは空の項目を省いて小さくする（本が何千冊になっても入るように）。読み込むときに空の項目を戻す
const BLANK = { title: '', author: '', publisher: '', isbn: '', asin: '', series: '', vol: null, genre: 'その他', format: '紙', place: '', status: 'own', read: '', readAt: '', pubdate: '', boughtAt: '',
  cover: '', memo: '', soldAt: '', soldTo: '', soldPrice: null, soldLot: '', folder: '', pisbn: '', prevId: '', listPrice: null, paid: null, paidAuto: false, trial: false, genreSet: false };
const compact = b => { const o = {}; for (const [k, v] of Object.entries(b)) if (v !== '' && v != null && v !== false) o[k] = v; return o; };
function setBooks(list) { sibIx = null; twinIx = null; books = new Map(list.map(b => { b = { ...BLANK, ...b }; const r = normRead(b.read); return [b.id, { ...b, read: r, readAt: r === '読んだ' ? (b.readAt || '') : '' }]; })); }
function load() {
  let list = [];
  try { list = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { list = null; }
  if (!list) { try { const old = JSON.parse(localStorage.getItem('shelf.books') || '[]'); list = migrateOld(old); } catch (e) { list = []; } }
  setBooks(list);
}
// 本のデータは普段 localStorage に置く。入りきらなくなったら IndexedDB（写真の表紙と同じ場所）へ引っ越す
const inIdb = () => lsGet('hondana.store', '') === 'idb';
async function loadFromIdb() { try { const s = await idb.get('__books'); if (s) { setBooks(JSON.parse(s)); return true; } } catch (e) {} return false; }
let saveFailed = false;
function save() {
  const json = JSON.stringify([...books.values()].map(compact));
  if (inIdb()) { idb.put('__books', json).then(() => { saveFailed = false; }).catch(() => { saveFailed = true; toast('保存できませんでした。iPhoneの空き容量を確かめてください。'); }); return; }
  try { localStorage.setItem(KEY, json); saveFailed = false; }
  catch (e) {
    idb.put('__books', json).then(() => { try { localStorage.removeItem(KEY); } catch (er) {} lsSet('hondana.store', 'idb'); saveFailed = false; })
      .catch(() => { saveFailed = true; toast('保存できませんでした。iPhoneの空き容量を確かめてください。'); });
  }
}
// 削除した本を覚えておき、次にKindleやBOOK☆WALKERのCSVを取り込んだときに出さない（元に戻したら忘れる）
const delKeys = b => [b.isbn && 'i' + b.isbn, b.asin && 'a' + b.asin, b.title && 't' + norm(b.title) + '|' + b.format].filter(Boolean);
let delSet = null;
const getDel = () => delSet || (delSet = (() => { try { return new Set(JSON.parse(lsGet('hondana.deleted', '[]'))); } catch (e) { return new Set(); } })());
function rememberDeleted(list) { const d = getDel(); list.forEach(b => delKeys(b).forEach(k => d.add(k))); lsSet('hondana.deleted', JSON.stringify([...d])); }
function forgetDeleted(list) { const d = getDel(); if (!d.size) return; let ch = false; list.forEach(b => delKeys(b).forEach(k => { if (d.delete(k)) ch = true; })); if (ch) lsSet('hondana.deleted', JSON.stringify([...d])); }
const wasDeleted = b => { const d = getDel(); return d.size > 0 && delKeys(b).some(k => d.has(k)); };
function putMany(list) {
  sibIx = null; twinIx = null; forgetDeleted(list.filter(b => !books.has(b.id))); const now = Date.now(), fresh = list.filter(b => !books.has(b.id) && !b.trial && b.status !== 'sold' && b.series);
  // 紙の版が見つかった本は、「表紙なし」の印を外して表紙を探し直す
  let nc = false; list.forEach(b => { const old = books.get(b.id); if (old && b.pisbn && b.pisbn !== old.pisbn) { workUrl.delete(b.id); if (noCov.delete(b.id)) nc = true; } }); if (nc) saveNoCov();
  if (trash && trash.length) { const ids = new Set(list.map(b => b.id)), n0 = trash.length; trash = trash.filter(t => !ids.has(t.b.id)); if (trash.length !== n0) saveTrash(); }
  list.forEach(b => { b.updatedAt = now; books.set(b.id, b); });
  if (fresh.length) untrialSeries(fresh, now);
  save(); render();
}
// 続きを買ったら、同じシリーズ・同じストアのお試しを普通の本に戻す（Kindleの無料キャンペーンは本物の1巻をもらっていることが多いため）。
// ただし書名に「期間限定無料」「お試し版」とある無料版は、別の商品なのでお試しのまま
function untrialSeries(fresh, now) {
  const keys = new Map(); fresh.forEach(b => keys.set(seriesKey(b) + '|' + b.format, true));
  for (const t of books.values()) {
    if (!t.trial || t.status === 'sold' || !t.series || !keys.has(seriesKey(t) + '|' + t.format) || FREE_TITLE.test(nfkc(t.title))) continue;
    books.set(t.id, { ...t, trial: false, updatedAt: now });
  }
}
const put = b => putMany([b]);
// ごみ箱：消した本は30日とっておいて、戻せるようにする（IndexedDB の '__trash'。写真の表紙も30日は消さない）
let trash = null;
async function getTrash() { if (trash) return trash; try { trash = JSON.parse((await idb.get('__trash')) || '[]'); } catch (e) { trash = []; } if (!Array.isArray(trash)) trash = []; return trash; }
const saveTrash = () => idb.put('__trash', JSON.stringify(trash || [])).catch(() => {});
async function toTrash(list) { await getTrash(); const at = Date.now(), ids = new Set(list.map(b => b.id)); trash = trash.filter(t => !ids.has(t.b.id)); list.forEach(b => trash.push({ b: compact(b), at })); await saveTrash(); }
async function purgeTrash() {
  await getTrash(); const lim = Date.now() - 30 * 864e5, old = trash.filter(t => t.at < lim); if (!old.length) return;
  trash = trash.filter(t => t.at >= lim); await saveTrash();
  for (const t of old) if (!books.has(t.b.id)) { try { await idb.del(t.b.id); } catch (e) {} }
}
const unloadPhoto = id => { const old = photos.get(id); if (old) URL.revokeObjectURL(old); photos.delete(id); };
// 消した本をまとめてごみ箱へ（写真の表紙はごみ箱にあるあいだ残す）
async function trashBooks(list) { rememberDeleted(list); sibIx = null; twinIx = null; list.forEach(b => books.delete(b.id)); save(); list.forEach(b => unloadPhoto(b.id)); render(); await toTrash(list); }
function removeBook(id, noMemo) {
  const gone = books.get(id); if (!gone) return;
  if (!noMemo) { trashBooks([gone]); return; }
  sibIx = null; twinIx = null; books.delete(id); save(); dropPhoto(id).then(render); render();
}
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
    if (b.jan && x.jan === b.jan) return x;
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
function cleanTitle(t, vol) { t = nfkc(t).replace(/\s+/g, ' ').replace(/\s+=\s+.*?(?=[\s.]*(?:\d{1,4}|上|中|下)?\s*$)/, '').replace(/\s*:\s*\[[^\]]*\]/g, '').replace(/\[[^\]]*\]/g, '').replace(/\s+\./g, '.').trim().replace(/(\d{1,4}) \1$/, '$1'); if (vol && !t.includes(vol)) t += ' ' + vol; return t; }
function normPubdate(s) { const m = nfkc(s).match(/(\d{4})[-.\/年]?(\d{1,2})?[-.\/月]?(\d{1,2})?/); if (!m) return ''; return m[1] + (m[2] ? '-' + m[2].padStart(2, '0') : '') + (m[3] ? '-' + m[3].padStart(2, '0') : ''); }
async function fetchJson(u, ms = 8000) { const c = new AbortController(), t = setTimeout(() => c.abort(), ms); try { const r = await fetch(u, { signal: c.signal }); if (!r.ok) throw 0; return await r.json(); } finally { clearTimeout(t); } }
async function fetchText(u, ms = 8000) { const c = new AbortController(), t = setTimeout(() => c.abort(), ms); try { const r = await fetch(u, { signal: c.signal }); if (!r.ok) throw 0; return await r.text(); } finally { clearTimeout(t); } }
// 国会図書館は混んでいると「429（同時アクセスが多すぎる）」を返したり、答えが遅くなったりする。
// patient=true のとき（まとめて調べ直すとき）は長めに待ち、断られたら少し休んでやり直す
let ndlPatient = false;
async function ndlText(u, ms) {
  const tries = ndlPatient ? 3 : 1;
  for (let i = 0; i < tries; i++) {
    const c = new AbortController(), t = setTimeout(() => c.abort(), ndlPatient ? 25000 : (ms || 10000));
    try { const r = await fetch(u, { signal: c.signal }); if (r.ok) return await r.text(); if (r.status !== 429 && r.status < 500) throw 0; }
    catch (e) { if (i === tries - 1) throw e; } finally { clearTimeout(t); }
    if (i < tries - 1) await new Promise(r => setTimeout(r, 2500 * (i + 1)));
  }
  throw 0;
}
async function fromOpenBD(isbn) {
  const j = await fetchJson('https://api.openbd.jp/v1/get?isbn=' + isbn); const it = j && j[0]; if (!it || !it.summary || !it.summary.title) return null;
  const s = it.summary; if (s.isbn && nfkc(s.isbn).replace(/\D/g, '') !== isbn) return null;
  let ccode = '';
  try { (it.onix.DescriptiveDetail.Subject || []).forEach(x => { if (x.SubjectSchemeIdentifier === '78' && /^\d{4}$/.test(x.SubjectCode)) ccode = x.SubjectCode; }); } catch (e) {}
  let listPrice = null;
  try { const p = (it.onix.ProductSupply.SupplyDetail.Price || [])[0]; if (p && +p.PriceAmount > 0) listPrice = Math.round(+p.PriceAmount); } catch (e) {}
  return { dupVol: /(\d{1,4})\s+\1$/.test(nfkc(s.title).trim()), title: cleanTitle(s.title, s.volume), author: cleanAuthor(s.author), publisher: s.publisher || '', pubdate: normPubdate(s.pubdate), cover: httpsUrl(s.cover), series: s.series || '', genre: genreFromC(ccode), listPrice };
}
async function fromNDL(isbn) {
  const x = await ndlText('https://ndlsearch.ndl.go.jp/api/opensearch?isbn=' + isbn); const d = new DOMParser().parseFromString(x, 'application/xml'); const item = d.querySelector('item'); if (!item) return null;
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
  if (!a && !n && !g) return null; // 見つからなかった（または混んでいた）ときは覚えない。あとで調べ直せるように
  const pick = k => (a && a[k]) || (n && n[k]) || (g && g[k]) || '';
  const r = { title: pick('title'), author: pick('author'), publisher: pick('publisher'), pubdate: pick('pubdate'), cover: (a && a.cover) || (g && g.cover) || '', series: pick('series'), genre: pick('genre') };
  // 出版社の情報で巻数が2回並んでいた本は、巻数を別の欄に持っている国会図書館の書名を使う（作品名が数字で終わる本を読み違えないように）
  if (a && a.dupVol && n && n.title) r.title = n.title;
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
    get: async k => { let v; await run('readonly', s => { const r = s.get(k); r.onsuccess = () => { v = r.result; }; }); return v; },
    all: async () => { const out = new Map(); await run('readonly', s => { const c = s.openCursor(); c.onsuccess = () => { const cur = c.result; if (cur) { out.set(cur.key, cur.value); cur.continue(); } }; }); return out; },
  };
})();
const photos = new Map(); // 本のid → 表示用URL
if (lsGet('hondana.covVer', '') !== '3') { lsSet('hondana.nocover', '[]'); lsSet('hondana.covVer', '3'); }
let noCov = new Set((() => { try { return JSON.parse(lsGet('hondana.nocover', '[]')); } catch (e) { return []; } })());
// 「表紙なし」と覚えた日も持っておき、1か月たったら忘れて、もう一度表紙を探す（あとから表紙が登録されることがあるため）
const noCovAt = (() => { try { return JSON.parse(lsGet('hondana.nocoverAt', '{}')) || {}; } catch (e) { return {}; } })();
{ const now = Date.now(); for (const id of [...noCov]) { if (!noCovAt[id]) noCovAt[id] = now; else if (now - noCovAt[id] > 30 * 864e5) { noCov.delete(id); delete noCovAt[id]; } } for (const id of Object.keys(noCovAt)) if (!noCov.has(id)) delete noCovAt[id]; }
let ncTimer; const saveNoCov = () => { clearTimeout(ncTimer); ncTimer = setTimeout(() => { const now = Date.now(); for (const id of noCov) if (!noCovAt[id]) noCovAt[id] = now; for (const id of Object.keys(noCovAt)) if (!noCov.has(id)) delete noCovAt[id]; lsSet('hondana.nocover', JSON.stringify([...noCov])); lsSet('hondana.nocoverAt', JSON.stringify(noCovAt)); }, 400); };
// 表紙の候補を順番に試す：撮った写真 → 調べたときの表紙 → Amazon（ISBN-10）→ 国立国会図書館
function isbn10(i13) { if (!/^978\d{10}$/.test(i13 || '')) return ''; const c = i13.slice(3, 12); let t = 0; for (let i = 0; i < 9; i++) t += (+c[i]) * (10 - i); const d = (11 - t % 11) % 11; return c + (d === 10 ? 'X' : d); }
const workUrl = new Map(); // 本のid → 実際に表示できた表紙のURL（この起動中だけ覚える）
// 紙と電子の両方で持っている本：電子の本が覚えている紙のISBN、または同じシリーズの同じ巻・同じ書名で見つける
let twinIx = null;
const isE = b => b.format !== '紙';
function twinsOf(b) {
  if (!twinIx) { twinIx = new Map(); const add = (k, x) => { if (!k) return; if (!twinIx.has(k)) twinIx.set(k, []); twinIx.get(k).push(x); };
    for (const x of books.values()) { add(sibKey(x), x); if (x.format === '紙' && x.isbn) add('p' + x.isbn, x); if (isE(x) && x.pisbn) add('p' + x.pisbn, x); } }
  const keys = [sibKey(b), b.format === '紙' ? b.isbn && 'p' + b.isbn : b.pisbn && 'p' + b.pisbn].filter(k => k && k.length > 2);
  const out = new Map(); for (const k of keys) for (const x of twinIx.get(k) || []) if (x.id !== b.id && isE(x) !== isE(b)) out.set(x.id, x);
  return [...out.values()];
}
const hasEtwin = b => b.format === '紙' && twinsOf(b).some(x => x.status !== 'sold');
// 表紙の手がかりがない本（BOOK☆WALKERの本など）は、同じ作品・同じ巻の別の本（Kindle版や紙の本）の表紙を借りる
let sibIx = null;
const sibKey = b => b.series && b.vol ? 's' + seriesKey(b) + '|' + b.vol : 't' + norm(nfkc(b.title || '').replace(/【[^】]*】|［[^］]*］|[(（][^()（）]*[)）]/g, ''));
const ownCover = b => photos.has(b.id) || (b.cover && !/ndlsearch/.test(b.cover)) || b.isbn || b.pisbn || (b.asin && /^B0/i.test(b.asin));
function sibling(b) {
  if (!sibIx) { sibIx = new Map(); for (const x of books.values()) if (ownCover(x)) { const k = sibKey(x); if (k.length > 2 && !sibIx.has(k)) sibIx.set(k, x); } }
  const x = sibIx.get(sibKey(b)); return x && x.id !== b.id ? x : null;
}
function coverCands(b, noSib) {
  const out = [], add = u => { u = httpsUrl(u); if (u && !out.includes(u)) out.push(u); };
  if (workUrl.has(b.id)) add(workUrl.get(b.id));
  if (b.cover && !/ndlsearch/.test(b.cover)) add(b.cover);
  const i10 = isbn10(b.isbn || b.pisbn); if (i10) add(`https://images-na.ssl-images-amazon.com/images/P/${i10}.09.LZZZZZZZ.jpg`);
  if (b.asin && /^B0/i.test(b.asin)) add(`https://images-na.ssl-images-amazon.com/images/P/${b.asin}.09.LZZZZZZZ.jpg`);
  if (b.isbn || b.pisbn) add('https://ndlsearch.ndl.go.jp/thumbnail/' + (b.isbn || b.pisbn) + '.jpg');
  if (!out.length && !noSib) { const x = sibling(b); if (x) { if (photos.has(x.id)) out.push(photos.get(x.id)); coverCands(x, true).forEach(add); } }
  return out;
}
window.__nc = (img, id) => {
  const list = (img.dataset.next || '').split(' ').filter(Boolean);
  if (list.length) { img.dataset.next = list.slice(1).join(' '); img.src = list[0]; return; }
  const box = img.parentNode; if (box) box.classList.add('nocv'); img.remove(); if (id && !noCov.has(id)) { noCov.add(id); saveNoCov(); }
};
// 横長の表紙（画集など）は切らずに全体を見せる。本の画面では横長のまま大きく、一覧では枠の中に縮めて、余白はぼかした表紙で埋める
function markWide(img) {
  const box = img.parentNode; if (!box || img.classList.contains('blur')) return;
  const wide = img.naturalWidth > img.naturalHeight * 1.08; box.classList.toggle('wide', wide);
  box.querySelectorAll('img.blur').forEach(x => x.remove());
  if (!wide) { if (box.closest('#bigCv')) box.style.aspectRatio = ''; return; }
  if (box.closest('#bigCv')) { box.style.aspectRatio = `${img.naturalWidth} / ${img.naturalHeight}`; box.closest('#bigCv').classList.add('wide'); return; }
  const bl = document.createElement('img'); bl.className = 'blur'; bl.alt = ''; bl.referrerPolicy = 'no-referrer'; bl.src = img.src; box.insertBefore(bl, img);
}
window.__ok = (img, id) => { if (img.naturalWidth < 5) { window.__nc(img, id); return; } markWide(img); if (!img.src.startsWith('blob:')) workUrl.set(id, img.src); if (noCov.delete(id)) saveNoCov(); };
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
  photos.set(id, URL.createObjectURL(blob)); sibIx = null; if (noCov.delete(id)) saveNoCov();
}
async function dropPhoto(id) { try { await idb.del(id); } catch (e) {} const old = photos.get(id); if (old) URL.revokeObjectURL(old); photos.delete(id); }

/* ---------- 画面 ---------- */
const ui = Object.assign({ genre: 'all', status: 'own', view: 'grid', sort: 'new', format: 'all' }, (() => { try { return JSON.parse(lsGet('hondana.ui', '{}')); } catch (e) { return {}; } })());
if (['積読', '読書中', '読了'].includes(ui.status)) ui.status = 'own';
const saveUi = () => lsSet('hondana.ui', JSON.stringify(ui));
let query = '';
const app = $('app');
const svgSearch = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#8790a8" stroke-width="1.8" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>';
// 画面の上の道すじ（本棚 › まとまり › シリーズ）。どれを押してもそこへ一気に戻れる
function crumbs(parts) { return `<nav class="crumbs" aria-label="戻る">${parts.map(([a, l], i) => `${i ? '<span class="sep" aria-hidden="true">›</span>' : ''}<button class="back" ${a}>${i ? '' : svgBack}${esc(l)}</button>`).join('')}</nav>`; }
// 作者名を1人ずつに分ける。「・」は日本の名前どうしのときだけ区切りにする（「ロバート・マッキー」のような外国の名前は分けない）
function authorsOf(a) {
  const out = [];
  for (let p of nfkc(a || '').split(/[,，、\/／;；]|\s{2,}/)) {
    p = p.trim().replace(/\s*(ほか|他)$/, '').replace(/^(原作|作画|著|作|文|絵|訳|編|編著|監修|イラスト|漫画|画|原案|キャラクター原案|翻訳)[:：\s]+/, '').replace(/\s*(原作|作画|漫画|著|作|画|イラスト|監修|編|訳|原案)$/, '').trim();
    if (!p) continue;
    const parts = p.split('・').map(x => x.trim()).filter(Boolean);
    if (parts.length > 1 && parts.every(x => /[\u4e00-\u9fff\u3041-\u3096]/.test(x))) out.push(...parts); else out.push(p);
  }
  return [...new Set(out.filter(x => x.length >= 2))];
}
const svgBack = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>';

function passes(b) {
  if (ui.genre !== 'all' && !GENRES.includes(ui.genre)) ui.genre = 'all';
  if (ui.status === 'trial') { if (!b.trial) return false; }
  else if (b.trial && ui.status !== 'all' && !query) return false;
  if (ui.status === 'own' && b.status === 'sold') return false;
  if (ui.status === 'sold' && b.status !== 'sold') return false;
  if (ui.status === 'both' && (b.status === 'sold' || !hasEtwin(b))) return false;
  if (ui.status === 'nocover' && (b.status === 'sold' || hasCover(b))) return false;
  if (['読んだ', 'まだ', 'unset'].includes(ui.status) && (b.status === 'sold' || (b.read || 'unset') !== ui.status)) return false;
  if (ui.genre !== 'all' && (b.genre || 'その他') !== ui.genre) return false;
  if (ui.format && ui.format !== 'all' && b.format !== ui.format) return false;
  if (query) { const qi = normIsbn(query); if (qi) return b.isbn === qi; const q = norm(query); return norm([b.title, b.author, b.series, b.publisher, b.place, b.memo, b.isbn, b.asin, b.jan].join(' ')).includes(q); }
  return true;
}
const folderKey = b => norm(b.folder || '');
function groups(inFolder, pick) {
  let list = [...books.values()].filter(pick ? (b => pick(b) && (ui.status === 'all' || (!b.trial && b.status !== 'sold'))) : passes);
  const map = new Map(), fmap = new Map(), out = [];
  if (inFolder != null) list = list.filter(b => folderKey(b) === inFolder);
  for (const b of list) {
    const fk = folderKey(b);
    if (inFolder == null && fk && !query && !pick) { if (!fmap.has(fk)) fmap.set(fk, []); fmap.get(fk).push(b); continue; }
    const k = seriesKey(b); if (k) { if (!map.has(k)) map.set(k, []); map.get(k).push(b); } else out.push({ one: b });
  }
  for (const [k, bs] of map) { if (bs.length > 1) out.push({ key: k, books: bs }); else out.push({ one: bs[0] }); }
  for (const [k, bs] of fmap) out.push({ folder: k, books: bs });
  const latest = g => g.one ? (g.one.addedAt || 0) : Math.max(...g.books.map(b => b.addedAt || 0));
  const name = g => g.one ? g.one.title : g.folder ? g.books[0].folder : g.books[0].series;
  const maxOf = (g, k) => g.one ? String(g.one[k] || '') : g.books.reduce((m, b) => (String(b[k] || '') > m ? String(b[k] || '') : m), '');
  out.sort(ui.sort === 'title' ? (a, b) => String(name(a)).localeCompare(String(name(b)), 'ja')
    : ui.sort === 'bought' ? (a, b) => maxOf(b, 'boughtAt').localeCompare(maxOf(a, 'boughtAt')) || latest(b) - latest(a)
    : ui.sort === 'pub' ? (a, b) => (maxOf(b, 'pubdate') || '0').localeCompare(maxOf(a, 'pubdate') || '0') || latest(b) - latest(a)
    : (a, b) => latest(b) - latest(a));
  return out;
}
// シリーズごとの「全○巻」は自分で入れる（どのデータベースにも確かな情報がないため）
let serInfo = (() => { try { return JSON.parse(lsGet('hondana.series', '{}')) || {}; } catch (e) { return {}; } })();
const saveSerInfo = () => lsSet('hondana.series', JSON.stringify(serInfo));
const totalOf = key => +(serInfo[key] && serInfo[key].total) || 0;
// 全何巻と比べるときは、冊数ではなく「何巻ぶん持っているか」で数える（紙と電子の両方で持っている巻は1巻と数える）
function volsOwned(list) { const own = list.filter(b => b.status !== 'sold'), vs = new Set(own.filter(b => b.vol).map(b => +b.vol)); return vs.size + own.filter(b => !b.vol).length; }
function missingVols(bs, key) {
  const vs = [...new Set(bs.filter(b => b.status !== 'sold' && b.vol).map(b => +b.vol))].sort((a, b) => a - b), total = totalOf(key ?? seriesKey(bs[0] || {}));
  const top = Math.max(vs[vs.length - 1] || 0, total);
  if (!total && bs.length && bs.every(b => /[上中下](?:巻|[)）\s]|$)/.test(nfkc(b.title)))) return { max: 0, miss: [], total };
  if (!vs.length) return { max: 0, miss: [], total }; // 巻数のない本ばかり（技法書のシリーズなど）は空きの場所を作らない
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
  return `<button class="tile${pk(bs.map(b => b.id))}" data-series="${esc(g.key)}"><div class="stack">${coverHtml({ ...top, title: bs[0].series })}<span class="badge">${(() => { const nt = bs.filter(b => !b.trial), c = nt.length ? nt : bs; return m.total ? `${volsOwned(c)}/${m.total}` : c.length + '冊'; })()}</span>${m.miss.length ? '<span class="miss" title="抜けている巻があります"></span>' : ''}</div><span class="tt">${esc(bs[0].series)}</span></button>`;
}
function resultsHtml(inFolder, pick) {
  const gs = groups(inFolder, pick);
  if (!gs.length) {
    return !books.size ? `<div class="empty"><b>本棚はまだ空っぽです</b>右下の「バーコード」で紙の本を、右上のメニューからKindleやBOOK☆WALKERの本を取り込めます。</div>`
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
  const all = [...books.values()], noTitle = all.filter(b => b.isbn && !b.title).length, own = all.filter(b => b.status !== 'sold' && !b.trial), nTrial = all.filter(b => b.trial && b.status !== 'sold').length;
  const nRead = own.filter(b => b.read === '読んだ').length, nYet = own.filter(b => b.read === 'まだ').length;
  const last = lsGet('hondana.lastBackup', '');
  const needBk = own.length >= 10 && (!last || Date.now() - Date.parse(last) > 30 * 864e5);
  const genreOpts = [['all', 'すべてのジャンル'], ...GENRES.map(g => [g, g])].map(([v, l]) => `<option value="${esc(v)}" ${ui.genre === v ? 'selected' : ''}>${esc(l)}</option>`).join('');
  const statusOpts = [['own', '持っている'], ['読んだ', '読んだ'], ['まだ', 'まだ読んでない'], ['unset', '読んだか未設定'], ['sold', '売った'], ['nocover', '表紙なし'], ['trial', 'お試し'], ['both', '紙と電子の両方'], ['all', 'すべて']].map(([v, l]) => `<option value="${v}" ${ui.status === v ? 'selected' : ''}>${l}</option>`).join('');
  app.innerHTML = `<div class="top">
    <div class="hrow"><div><h1>わたしの本棚</h1><p class="stats">持っている ${own.length}冊・読んだ ${nRead}冊${nYet ? `・まだ ${nYet}冊` : ''}${nTrial ? `・お試し ${nTrial}冊` : ''}</p></div>
      <div style="display:flex;gap:8px;align-items:center">
        <svg width="40" height="40" viewBox="0 0 44 44" aria-hidden="true"><circle cx="22" cy="22" r="17" fill="none" stroke="var(--gold)" stroke-width="1.2"/><path d="M25 9L15 24h7l-3 11 11-16h-7z" fill="none" stroke="var(--blue)" stroke-width="1.5" stroke-linejoin="round"/></svg>
        <button class="icon-btn" id="menuBtn" aria-label="メニュー"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#c9cfdc" stroke-width="1.8" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg></button></div></div>
    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
      <select class="sel" id="genreSel" aria-label="ジャンル">${genreOpts}</select>
      <select class="sel" id="statusSel" aria-label="状態">${statusOpts}</select>
      <select class="sel" id="fmtSel" aria-label="ストア"><option value="all">すべてのストア</option>${FORMATS.map(f => `<option ${ui.format === f ? 'selected' : ''}>${esc(f)}</option>`).join('')}</select>
      <select class="sel" id="sortSel" aria-label="並び順"><option value="new" ${ui.sort === 'new' ? 'selected' : ''}>追加が新しい順</option><option value="bought" ${ui.sort === 'bought' ? 'selected' : ''}>買った日が新しい順</option><option value="pub" ${ui.sort === 'pub' ? 'selected' : ''}>発売日が新しい順</option><option value="title" ${ui.sort === 'title' ? 'selected' : ''}>書名順</option></select>
      <div style="flex:1"></div>
      <button class="icon-btn vt" id="viewBtn" aria-pressed="${ui.view === 'shelf'}" aria-label="${ui.view === 'shelf' ? '表紙の表示に切り替え' : '背表紙の棚に切り替え'}" style="height:36px;border-color:var(--blue)">${ui.view === 'shelf'
      ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--blue)" stroke-width="1.8" aria-hidden="true"><rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="9"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>'
      : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--blue)" stroke-width="1.8" aria-hidden="true"><path d="M5 4v16M10 6v14M15 4v16M20 7v13M3 20h18"/></svg>'}</button>
    </div></div>
    ${needBk ? `<div class="backup"><span>${last ? '前回のバックアップから時間が経っています。' : 'まだバックアップしていません。'}</span><button class="btn" id="bkNow" style="min-height:36px;flex:none">書き出す</button></div>` : ''}
    ${noTitle ? `<div class="backup"><span>書名がまだ入っていない本が ${noTitle}冊あります。</span><button class="btn" id="rlNow" style="min-height:36px;flex:none">調べ直す</button></div>` : ''}
    ${ui.status === 'trial' && nTrial ? `<div class="backup"><span>お試しの本 ${nTrial}冊。いらなくなったら、まとめて消せます。</span><button class="btn danger" id="trialDelBtn" style="min-height:36px;flex:none">まとめて削除</button></div>` : ''}
    <div id="results">${resultsHtml()}</div>`;
  if (query && $('qbar').hidden) { $('qbar').hidden = false; $('q2').value = query; } // 検索中に描き直しても、検索欄は出したまま
  $('statusSel').onchange = e => { ui.status = e.target.value; saveUi(); render(); };
  $('sortSel').onchange = e => { ui.sort = e.target.value; saveUi(); render(); };
  $('fmtSel').onchange = e => { ui.format = e.target.value; saveUi(); render(); };
  $('genreSel').onchange = e => { ui.genre = e.target.value; saveUi(); render(); };
  $('viewBtn').onclick = () => { ui.view = ui.view === 'shelf' ? 'grid' : 'shelf'; saveUi(); render(); };
  $('menuBtn').onclick = openMenu;
  if ($('bkNow')) $('bkNow').onclick = exportCsv;
  if ($('trialDelBtn')) $('trialDelBtn').onclick = openTrialDelete;
  if ($('rlNow')) $('rlNow').onclick = () => $('mRelook').click();
}
function infoRows(rows) { return `<div class="info">${rows.filter(r => r[1]).map(([k, v]) => `<div class="ir"><span>${k}</span><span>${v}</span></div>`).join('')}</div>`; }
function renderSeries(key) {
  const bs = [...books.values()].filter(b => seriesKey(b) === key).sort((a, b) => (a.vol || 1e9) - (b.vol || 1e9) || (a.addedAt - b.addedAt));
  if (!bs.length) { location.hash = ''; return; }
  // お試し（無料版）は、ちゃんと持っている巻と分けて数える。同じ巻に買った版があれば、そちらを表に出す
  const trials = bs.filter(b => b.trial), real = bs.filter(b => !b.trial);
  const own0 = bs.filter(b => b.status !== 'sold'), ownR = own0.filter(b => !b.trial), own = ownR.length ? ownR : own0, m = missingVols(bs, key), name = bs[0].series;
  const authors = [...new Set(bs.flatMap(b => String(b.author || '').split(/[・、]/)).map(x => x.trim()).filter(Boolean))].slice(0, 3).join('・');
  const fm = [...new Set(own.map(b => b.format))].join('・'), places = [...new Set(own.map(b => b.place).filter(Boolean))].join('、');
  const pubs = [...new Set(bs.map(b => b.publisher).filter(Boolean))].join('、');
  // 紙とKindleなど、ストアが2つ以上あるときは段を分けて並べる
  const fmts = [...new Set(real.map(b => b.format))].sort((a, b) => (a === '紙' ? -1 : b === '紙' ? 1 : real.filter(x => x.format === b).length - real.filter(x => x.format === a).length));
  const multi = fmts.length > 1, byPub = (a, b) => String(a.pubdate || '9999').localeCompare(String(b.pubdate || '9999')) || String(a.title).localeCompare(String(b.title), 'ja');
  const vt = (b, label) => `<button class="vol${sel && sel.has(b.id) ? ' picked' : ''}" data-book="${esc(b.id)}" style="background:${tint(name)}${b.status === 'sold' || b.trial ? ';opacity:.4' : ''}">${volImg(b)}<span class="n">${label}</span></button>`;
  const shortT = b => esc(nfkc(b.title || '').replace(name, '').replace(/^[\s:：\-－・]+/, '').slice(0, 6) || (b.title || '').slice(0, 4));
  const unNum = real.filter(b => !b.vol).sort(byPub), numbered = real.filter(b => b.vol);
  const byVol = new Map(); (multi ? [] : [...real, ...trials]).forEach(b => { if (b.vol && !byVol.has(+b.vol)) byVol.set(+b.vol, b); });
  const tiles = [];
  if (m.max && !multi) for (let i = 1; i <= m.max; i++) {
    const b = byVol.get(i);
    tiles.push(b ? `<button class="vol${sel && sel.has(b.id) ? ' picked' : ''}" data-book="${esc(b.id)}" style="background:${tint(name)}${b.status === 'sold' || b.trial ? ';opacity:.4' : ''}" aria-label="${i}巻${b.trial ? '（お試し）' : ''}">${volImg(b)}<span class="n">${i}${b.trial ? ' 試' : FMARK[b.format] ? ' ' + FMARK[b.format] : ''}</span></button>`
      : `<button class="vol gap" data-addvol="${i}" aria-label="${i}巻を追加"><b>${i}</b>なし</button>`);
  }
  const shown = new Set(byVol.values()), extraTrials = trials.filter(b => !shown.has(b));
  if (!multi) [...real.filter(b => b.vol && !shown.has(b)), ...unNum].forEach(b => tiles.push(vt(b, b.vol ? String(b.vol) + (FMARK[b.format] ? ' ' + FMARK[b.format] : '') : shortT(b))));
  const volsHtml = multi ? fmts.map(f => { const fb = real.filter(b => b.format === f).sort((a, b) => (a.vol || 1e9) - (b.vol || 1e9) || byPub(a, b)), pl = [...new Set(fb.map(b => b.place).filter(Boolean))].join('、');
      return `<h3>${esc(f)}${pl ? `（${esc(pl)}）` : ''}<span class="note" style="margin-left:8px">${fb.length}冊</span></h3><div class="vols">${fb.map(b => vt(b, b.vol ? String(b.vol) : shortT(b))).join('')}</div>`; }).join('')
    : `<h3>巻</h3><div class="vols">${tiles.join('')}</div>`;
  const numBtn = unNum.length >= 2 && !numbered.length ? `<div class="row" style="margin-top:10px"><button class="btn" id="numVols" style="min-height:40px">巻数を発売日順につける</button></div><p class="note" style="margin:6px 0 0">巻数のない本が${unNum.length}冊あります。押すと、発売日の古い順に1、2、3…と巻数をつけます（あとで1冊ずつ「編集」で直せます）。</p>` : '';
  const top = (bs.find(b => photos.has(b.id)) || bs.find(b => b.cover && !/ndlsearch/.test(b.cover)) || bs.find(b => b.isbn || b.asin || b.pisbn) || bs[0]);
  const fold = bs.find(b => b.folder)?.folder || '', money = sumPaid(own);
  app.innerHTML = `<div class="page">
    ${crumbs([['data-home', '本棚'], ...(fold ? [[`data-folder="${esc(norm(fold))}" data-go`, fold]] : [])])}
    <div class="hero"><div class="cvbox"><div class="stack">${coverHtml({ ...top, title: name })}</div></div>
      <div style="display:flex;flex-direction:column;justify-content:center;gap:2px">
        <h2>${esc(name)}</h2>${authors ? `<p class="sub">${esc(authors)}</p>` : ''}
        <p style="margin:8px 0 0;font-size:14px">${m.total ? `全${m.total}巻のうち <b style="color:var(--gold)">${volsOwned(own)}巻ぶん</b> 持っています${own.length > volsOwned(own) ? `<span class="note">（${own.length}冊）</span>` : ''}` : `${m.max ? `${m.max}巻まで、` : ''}<b style="color:var(--gold)">${own.length}冊</b> 持っています`}${ownR.length && trials.length ? `<span class="note">（ほかにお試し${trials.length}冊）</span>` : ''}${m.total && !m.miss.length && own.length >= m.total ? '<br><span style="color:var(--gold)">全巻そろっています</span>' : ''}</p>
        ${m.miss.length ? `<p style="margin:2px 0 0;font-size:13px;color:var(--blue);font-weight:700">${m.miss.length > 4 ? m.miss.slice(0, 4).join('・') + '巻ほか' : m.miss.join('・') + '巻'}がありません</p>` : ''}
      </div></div>
    ${volsHtml}${numBtn}
    ${extraTrials.length ? `<h3>お試し・無料版（${extraTrials.length}冊）</h3><p class="note" style="margin:-4px 0 8px">買った巻と同じ巻の無料版です。普段の本棚には出ません。</p><div class="vols">${extraTrials.map(b => `<button class="vol${sel && sel.has(b.id) ? ' picked' : ''}" data-book="${esc(b.id)}" style="background:${tint(name)};opacity:.45">${volImg(b)}<span class="n">${b.vol || esc((b.title || '').slice(0, 4))} 試</span></button>`).join('')}</div>` : ''}
    ${infoRows([['形態', esc(fm)], ['置き場所', esc(places)], ['出版社', esc(pubs)], ['使ったお金', money.n ? `${yen(money.sum)}${money.n < own.length ? `<span class="note">（値段がわかる${money.n}冊分）</span>` : ''}` : ''], ['まとまり', fold ? esc(fold) : '']])}
    <label class="ir" style="align-items:center"><span>全何巻？</span><span style="display:flex;align-items:center;gap:6px">全<input id="serTotal" inputmode="numeric" value="${m.total || ''}" placeholder="${m.max || ''}" style="width:64px;height:40px;border:1px solid var(--ctl);border-radius:8px;background:var(--p1);text-align:center;font-size:16px">巻</span></label>
    <label class="ir" style="align-items:center"><span>ジャンル（全巻）</span><select id="serGenre" class="sel" style="height:40px">${GENRES.map(g => `<option ${g === (bs.find(b => b.genre !== 'その他') || bs[0]).genre ? 'selected' : ''}>${g}</option>`).join('')}</select></label>
    <div class="row" style="margin-top:20px"><button class="btn gold" id="addNext">${m.miss.length ? m.miss[0] : (m.max || own.length) + 1}巻をバーコードで追加</button></div>
    <p class="note" style="margin-top:12px">巻の表紙を押すと、その1冊の詳しい情報が開きます。シリーズ名や巻数は1冊ごとの「編集」で直せます。</p>
  </div>`;
  if ($('numVols')) $('numVols').onclick = e => { if (!e.target.dataset.armed) { e.target.dataset.armed = '1'; e.target.textContent = 'もう一度押すと、巻数をつけます'; return; }
    const before = unNum.map(b => ({ ...b })); putMany(unNum.map((b, i) => ({ ...b, vol: i + 1 }))); toast(`${unNum.length}冊に巻数をつけました`, () => putMany(before)); };
  $('addNext').onclick = () => openScan({ mode: 'add', format: own[0]?.format, place: own[0]?.place, genre: (bs.find(b => b.genre !== 'その他') || {}).genre });
  $('serTotal').onchange = e => { const n = parseInt(nfkc(e.target.value), 10); if (n > 0 && n < 2000) serInfo[key] = { ...(serInfo[key] || {}), total: n }; else if (serInfo[key]) delete serInfo[key].total; saveSerInfo(); e.target.onchange = null; setTimeout(render, 0); }; // 入力欄を消す前に、二重に呼ばれないようにする
  $('serGenre').onchange = e => { putMany(bs.map(b => ({ ...b, genre: e.target.value, genreSet: true }))); toast(`このシリーズを全部「${e.target.value}」にしました`); };
}
function renderBook(id) {
  const b = books.get(id); if (!b) { location.hash = ''; return; }
  const inSeries = b.series && [...books.values()].filter(x => seriesKey(x) === seriesKey(b)).length > 1;
  app.innerHTML = `<div class="page">
    ${crumbs([['data-home', '本棚'], ...(b.folder ? [[`data-folder="${esc(folderKey(b))}" data-go`, b.folder]] : []), ...(inSeries ? [[`data-series="${esc(seriesKey(b))}"`, b.series]] : [])])}
    <div style="display:flex;flex-direction:column;align-items:center;gap:6px;padding:6px 0 16px">
      <div id="bigCv">${coverHtml(b)}</div>
      <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap;justify-content:center">
        <label class="btn" for="coverIn" style="min-height:40px;display:inline-flex;align-items:center;gap:8px;${hasCover(b) ? '' : 'border-color:var(--blue);color:var(--blue)'}"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>${photos.has(b.id) ? '表紙を撮り直す' : '表紙を撮る'}</label>
        ${photos.has(b.id) ? '<button class="btn" id="unPhoto" style="min-height:40px">写真の表紙を外す</button>' : ''}
      </div>
      <input type="file" id="coverIn" accept="image/*" hidden>
      <h2 style="margin:10px 0 0;font:700 22px/1.35 var(--serif);text-align:center">${esc(b.title || 'ISBN ' + b.isbn)}</h2>
      ${b.author ? `<p class="sub authors">${(() => { const as = authorsOf(b.author); return as.length ? as.map(a => `<a data-author="${esc(a)}" role="link">${esc(a)}</a>`).join('・') : esc(b.author); })()}</p>` : ''}
      ${b.status === 'sold' ? '<p style="margin:4px 0 0;font-size:13px;color:var(--blue);font-weight:700">売った本</p>' : ''}
      ${b.trial ? '<p style="margin:4px 0 0;font-size:13px;color:var(--blue);font-weight:700">お試し（普段の本棚には出ません）</p>' : ''}
    </div>
    ${b.status === 'sold' ? '' : `<div class="seg" role="group" aria-label="読書の状態">${READS.map(r => `<button data-read="${r}" aria-pressed="${b.read === r}">${r}</button>`).join('')}</div><p class="note" style="margin:6px 0 0;text-align:center">${b.read ? 'もう一度押すと、未設定に戻ります' : 'まだ何も付けていません'}</p>`}
    ${(() => { const tw = twinsOf(b), prev = b.prevId && books.get(b.prevId), next = [...books.values()].find(x => x.prevId === b.id);
      const lines = tw.map(x => x.status === 'sold' ? `${x.format === '紙' ? '紙の版' : x.format + '版'}は${jdate(x.soldAt) || ''}に売りました` : x.format === '紙' ? `紙でも持っています${x.place ? `（${esc(x.place)}）` : ''}` : `電子でも持っています（${esc(x.format)}）`);
      if (prev) lines.push(`前にも持っていました（${[jdate(prev.soldAt), prev.soldTo ? esc(prev.soldTo) + 'へ' : ''].filter(Boolean).join(' ')}売った）`);
      if (next) lines.push(`${jdate(next.boughtAt) || ''}に買い戻しました`);
      return lines.length ? `<div class="info" style="margin-bottom:8px">${lines.map((l, i) => `<div class="ir"><span>${i ? '' : 'ほかの1冊'}</span><span>${l}</span></div>`).join('')}</div>` : ''; })()}
    ${infoRows([['読み終えた日', b.read === '読んだ' && b.readAt ? jdate(b.readAt) : ''], ['シリーズ', b.series ? esc(b.series) + (b.vol ? ` ${b.vol}巻` : '') : ''], ['出版社', esc(b.publisher)], ['出版日', jdate(b.pubdate)], ['形態', esc(b.format)], ['購入日', jdate(b.boughtAt)], ['定価', b.listPrice != null ? `${yen(b.listPrice)}<span class="note">（税込${yen(taxIn(b.listPrice))}）</span>` : ''], ['買った値段', b.paid != null ? yen(b.paid) : ''], ['まとまり', b.folder ? esc(b.folder) : ''], ['置き場所', esc(b.place)], ['ジャンル', esc(b.genre)], ['ISBN', esc(b.isbn)], ['バーコード', esc(b.jan || '')],
      ['売った日', b.status === 'sold' ? jdate(b.soldAt) || '—' : ''], ['売った先', b.status === 'sold' ? esc(b.soldTo) : ''], ['金額', b.status === 'sold' && b.soldPrice ? (b.soldLot ? `${esc(b.soldLot)}<span class="note">（1冊あたり約${yen(b.soldPrice)}）</span>` : yen(b.soldPrice)) : ''], ['メモ', esc(b.memo).replace(/\n/g, '<br>')]])}
    <div class="row" style="margin-top:20px"><button class="btn" id="bSold">${b.status === 'sold' ? '持っているに戻す' : '売った'}</button><button class="btn gold" id="bEdit">編集</button></div>
    <div class="row" style="margin-top:10px"><button class="btn" id="bTrial">${b.trial ? 'お試しを外す' : 'お試しにする'}</button>${b.isbn ? '<button class="btn" id="bRelook">情報を調べ直す</button>' : b.format === '紙' && b.title ? '<button class="btn" id="bFindIsbn">ISBNを探す</button>' : ''}</div>
    ${b.folder ? '<div class="row" style="margin-top:10px"><button class="btn" id="bUnfold">まとまりから外す</button></div>' : ''}
    <div class="row" style="margin-top:10px"><button class="btn danger" id="bDel">削除</button></div>
  </div>`;
  app.querySelectorAll('[data-read]').forEach(x => x.onclick = () => { const r = b.read === x.dataset.read ? '' : x.dataset.read, nb = { ...b, read: r, readAt: r === '読んだ' ? (b.readAt || (b.read === 'まだ' ? today() : '')) : '' }; put(nb); });
  $('bEdit').onclick = () => openEdit(b);
  if ($('bUnfold')) $('bUnfold').onclick = () => { put({ ...b, folder: '' }); toast(`「${b.folder}」から外しました`, () => put({ ...books.get(b.id), folder: b.folder })); };
  $('bTrial').onclick = () => { put({ ...b, trial: !b.trial }); toast(b.trial ? 'お試しを外しました。本棚に戻ります' : 'お試しにしました。普段の本棚には出ません'); };
  if ($('bFindIsbn')) $('bFindIsbn').onclick = async () => {
    const bt = $('bFindIsbn'); bt.disabled = true; bt.textContent = '探しています…'; ndlPatient = true;
    const cs = await findIsbn(b).catch(() => []).finally(() => { ndlPatient = false; }); bt.disabled = false; bt.textContent = 'ISBNを探す';
    if (!cs.length) { toast('候補が見つかりませんでした。書名・作者・出版社を確かめるか、時間をおいてもう一度どうぞ'); return; }
    openPick({ title: 'どの本ですか？', note: '入れてある書名・作者・出版社・出版日に近い順です。選ぶとISBNを入れて、表紙なども調べます。', options: cs.map(c => [c.isbn, `${cleanTitle(c.title, c.vol)}｜${c.publisher || '出版社不明'}・${jdate(c.pubdate) || '日付不明'}`]),
      onPick: async isbn => { const cur = books.get(b.id) || b; if (findDup({ isbn }, cur.id)) { toast('このISBNの本は、もう棚にあります'); return; }
        put({ ...cur, isbn }); toast('ISBNを入れました。情報を調べています…'); lookCache.delete(isbn); const r = await lookup(isbn).catch(() => null); if (!r) return;
        const nb = bookFromLookup(isbn, r), now = books.get(b.id); if (!now) return;
        put({ ...now, publisher: now.publisher || nb.publisher, pubdate: now.pubdate || nb.pubdate, author: now.author || nb.author, cover: nb.cover || now.cover, listPrice: now.listPrice ?? nb.listPrice, paid: now.paid ?? (nb.listPrice != null ? taxIn(nb.listPrice) : null) });
        if (noCov.delete(b.id)) saveNoCov(); toast('ISBNと情報を入れました'); } });
  };
  if ($('bRelook')) $('bRelook').onclick = async () => {
    $('bRelook').disabled = true; $('bRelook').textContent = '調べています…';
    lookCache.delete(b.isbn); ndlPatient = true; const r = await lookup(b.isbn).finally(() => { ndlPatient = false; });
    if (!r) { toast('見つかりませんでした。調べ先が混んでいることもあるので、時間をおいてもう一度どうぞ'); render(); return; }
    const nb = bookFromLookup(b.isbn, r);
    put({ ...b, title: nb.title || b.title, author: nb.author || b.author, publisher: nb.publisher || b.publisher, pubdate: nb.pubdate || b.pubdate, series: nb.series || b.series, vol: nb.vol ?? b.vol,
      genre: b.genreSet || (b.genre && b.genre !== 'その他') ? b.genre : nb.genre, cover: nb.cover || b.cover, listPrice: b.listPrice ?? nb.listPrice, relookAt: Date.now() });
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
    const key = seriesKey(b), back = inSeries ? '#s-' + encodeURIComponent(key) : b.folder ? '#f-' + encodeURIComponent(folderKey(b)) : '';
    removeBook(b.id); go(back); toast(`「${(b.title || 'ISBN ' + b.isbn).slice(0, 24)}${(b.title || '').length > 24 ? '…' : ''}」をごみ箱に入れました（30日は戻せます）`, async () => { if (keep) await setPhoto(b.id, keep); put(b); }); };
}
function render() {
  const h = decodeURIComponent(location.hash.slice(1));
  if (!h.startsWith('f-') && !h.startsWith('s-') && h) endSelect(true);
  if (h.startsWith('s-')) renderSeries(h.slice(2)); else if (h.startsWith('a-')) renderAuthor(h.slice(2)); else if (h.startsWith('b-')) renderBook(h.slice(2)); else if (h.startsWith('f-')) renderFolder(h.slice(2)); else renderHome();
  $('fab').hidden = h.startsWith('b-') || !!sel;
  $('selBar').hidden = !sel; if (sel) updateSelBar(); updFsel();
  $('soldTos').innerHTML = [...new Set([...books.values()].map(b => b.soldTo).filter(Boolean))].map(p => `<option value="${esc(p)}">`).join('');
  $('places').innerHTML = [...new Set([...books.values()].map(b => b.place).filter(Boolean))].map(p => `<option value="${esc(p)}">`).join('');
}
const go = h => { if (location.hash === h) render(); else location.hash = h; };
// 画面ごとに、どこまで見ていたかを覚えておく。本棚・まとまり・シリーズに戻ったら、その位置に戻す
const scrollPos = new Map(); let curHash = location.hash;
window.addEventListener('scroll', () => { scrollPos.set(curHash, scrollY); }, { passive: true });
window.addEventListener('hashchange', () => {
  render(); curHash = location.hash; const h = decodeURIComponent(location.hash.slice(1));
  const y = (!h || h.startsWith('f-') || h.startsWith('s-') || h.startsWith('a-')) ? (scrollPos.get(curHash) || 0) : 0;
  window.scrollTo(0, y); requestAnimationFrame(() => window.scrollTo(0, y));
});
// 下までスクロールしても「選ぶ」をすぐ押せるように、上の「選ぶ」が見えなくなったら左下に出す
// 「選ぶ」は左下にいつも置く（本棚・まとまり・シリーズの画面で）
function updFsel() {
  const h = decodeURIComponent(location.hash.slice(1)), page = !h || h.startsWith('f-') || h.startsWith('s-');
  $('fselBtn').hidden = !page || !!sel || !!document.querySelector('.veil.on');
  $('fsrchBtn').hidden = $('fselBtn').hidden || !!h || !$('qbar').hidden; // 検索は本棚の画面だけ
}
$('fselBtn').onclick = () => startSelect();
// 虫眼鏡：その場で検索欄を降ろす。×で閉じると、検索する前に見ていた位置に戻る
let qSaved = 0;
$('fsrchBtn').onclick = () => { qSaved = scrollY; $('qbar').hidden = false; $('q2').value = query; $('q2').focus(); updFsel(); };
function q2upd() { query = $('q2').value; if ($('results')) $('results').innerHTML = resultsHtml(); window.scrollTo(0, query ? ($('results')?.offsetTop || 0) - 70 : qSaved); }
$('q2').addEventListener('input', e => { if (!e.isComposing) q2upd(); });
$('q2').addEventListener('compositionend', q2upd);
$('q2x').onclick = () => { $('qbar').hidden = true; $('q2').value = ''; query = ''; if ($('results')) $('results').innerHTML = resultsHtml(); window.scrollTo(0, qSaved); requestAnimationFrame(() => window.scrollTo(0, qSaved)); updFsel(); };
window.addEventListener('hashchange', () => { if (!$('qbar').hidden && location.hash) { $('qbar').hidden = true; } });
// まとめたあと、まとまりが画面の外へ移ったら「見る」で連れていく
function lookFolder(name) {
  const t = [...document.querySelectorAll('.tile[data-folder]')].find(x => x.dataset.folder === name); if (!t) return null;
  const r = t.getBoundingClientRect(); if (r.bottom > 0 && r.top < innerHeight) { t.classList.add('flash'); setTimeout(() => t.classList.remove('flash'), 3400); return null; }
  return () => { t.scrollIntoView({ behavior: 'smooth', block: 'center' }); t.classList.add('flash'); setTimeout(() => t.classList.remove('flash'), 3400); };
}
app.addEventListener('click', e => {
  if (suppressClick) { suppressClick = false; e.preventDefault(); e.stopPropagation(); return; }
  const t = e.target.closest('[data-book],[data-series],[data-folder],[data-home],[data-genre],[data-addvol],[data-author]'); if (!t) return;
  if (t.dataset.author) { go('#a-' + encodeURIComponent(t.dataset.author)); return; }
  if (sel && t.matches('.tile,.sp,.vol[data-book]')) { toggleTile(t); return; }
  if (t.dataset.folder != null && t.matches('.tile,[data-go]')) { go('#f-' + encodeURIComponent(t.dataset.folder)); return; }
  if (t.dataset.genre) { ui.genre = t.dataset.genre; saveUi(); render(); return; }
  if (t.dataset.addvol) { const key = decodeURIComponent(location.hash.slice(3)); const ex = [...books.values()].find(b => seriesKey(b) === key); openScan({ mode: 'add', format: ex?.format, place: ex?.place, genre: ex && ex.genre !== 'その他' ? ex.genre : '' }); return; }
  if ('home' in t.dataset) { go(''); return; }
  if (t.dataset.series) { go('#s-' + encodeURIComponent(t.dataset.series)); return; }
  if (t.dataset.book) go('#b-' + encodeURIComponent(t.dataset.book));
});

/* ---------- シート共通 ---------- */
let lastFocus = null;
function openV(id) { lastFocus = document.activeElement; $(id).classList.add('on'); document.body.style.overflow = 'hidden'; }
function closeV(id) { if (id === 'vScan') { stopScan(); if (sellMode && sellSession.length) finishSell(true); } $(id).classList.remove('on'); if (!document.querySelector('.veil.on')) document.body.style.overflow = ''; lastFocus?.focus?.(); }
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
  $('fSeries').value = v.series || ''; $('fVol').value = v.vol || ''; $('fSeries').dataset.auto = seriesIsAuto(v) ? v.series : ''; $('fJan').value = v.jan || ''; $('fGenre').value = v.genre || 'その他'; $('fFmt').value = v.format || '紙';
  $('fPubdate').value = v.pubdate || ''; $('fBought').value = v.boughtAt || today(); $('fPlace').value = v.place || ''; $('fRead').value = v.read || '';
  $('fList').value = v.listPrice ?? ''; $('fPaid').value = v.paid ?? ''; $('fPaid').dataset.auto = v.paidAuto ? '1' : '';
  $('fReadAt').value = v.readAt || ''; $('fMemo').value = v.memo || ''; $('fSoldAt').value = v.soldAt || ''; $('fSoldTo').value = v.soldTo || ''; $('fSoldPrice').value = v.soldPrice ?? '';
  $('soldBox').hidden = v.status !== 'sold'; $('fReadAtBox').hidden = $('fRead').value !== '読んだ';
  $('editForm').dataset.base = JSON.stringify(v);
  editMsg(note || ''); openV('vEdit'); setTimeout(() => (editing ? $('fTitle') : $('fIsbn')).focus(), 40);
}
// 出版日は数字だけで打てるように：「201907」→「2019-07」、「20190715」→「2019-07-15」
function pubdateIn(v) { const d = nfkc(v).trim(); if (/^\d{6}$/.test(d)) return d.slice(0, 4) + '-' + d.slice(4); if (/^\d{8}$/.test(d)) return d.slice(0, 4) + '-' + d.slice(4, 6) + '-' + d.slice(6); if (/^\d{4}$/.test(d)) return d; return d ? (normPubdate(d) || d) : ''; }
$('fPubdate').addEventListener('change', () => { $('fPubdate').value = pubdateIn($('fPubdate').value); });
$('fRead').addEventListener('change', () => { $('fReadAtBox').hidden = $('fRead').value !== '読んだ'; });
// シリーズ名が書名から自動で付けたものなら、書名を直したときにシリーズ名と巻数も読み直す（手で付けたシリーズ名はそのまま）
const seriesIsAuto = b => !!b.series && (norm(b.series) === norm(parseSeries(b.title || '').series) || norm(b.title || '').startsWith(norm(b.series)));
$('fTitle').addEventListener('change', () => { const cur = $('fSeries').value.trim(); if (!cur || cur === $('fSeries').dataset.auto) { const p = parseSeries($('fTitle').value); if (p.series) { $('fSeries').value = p.series; $('fVol').value = p.vol; $('fSeries').dataset.auto = p.series; } else if (cur) { $('fSeries').value = ''; $('fSeries').dataset.auto = ''; } } if (!editing) { const d = dupNote({ title: $('fTitle').value, format: $('fFmt').value }); if (d) editMsg(d, true); } });
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
  if ($('fJan').value.trim() && !janOf($('fJan').value)) { editMsg('バーコードの番号は、45か49で始まる13桁です。直すか空にしてください。', true); return; }
  const title = $('fTitle').value.trim(); if (!title && !isbn) { editMsg('書名かISBNを入れてください。', true); $('fTitle').focus(); return; }
  const vol = parseInt(nfkc($('fVol').value), 10), price = nfkc($('fSoldPrice').value).replace(/\D/g, '');
  const lp = nfkc($('fList').value).replace(/\D/g, ''), pd = nfkc($('fPaid').value).replace(/\D/g, '');
  base.listPrice = lp ? +lp : null; base.paid = pd !== '' ? +pd : (base.listPrice != null ? taxIn(base.listPrice) : null); base.paidAuto = pd === '' || !!$('fPaid').dataset.auto;
  if ($('fGenre').value !== (editing ? editing.genre : base.genre)) base.genreSet = true;
  Object.assign(base, { isbn, title, author: $('fAuthor').value.trim(), publisher: $('fPub').value.trim(), series: $('fSeries').value.trim(), vol: vol > 0 ? vol : null,
    genre: $('fGenre').value, format: $('fFmt').value, pubdate: pubdateIn($('fPubdate').value), jan: janOf($('fJan').value), boughtAt: $('fBought').value, place: $('fPlace').value.trim(), read: $('fRead').value,
    readAt: $('fRead').value === '読んだ' ? $('fReadAt').value : '', memo: $('fMemo').value.trim() });
  if (base.status === 'sold') { base.soldAt = $('fSoldAt').value; base.soldTo = $('fSoldTo').value.trim(); const np = price ? +price : null; if (np !== base.soldPrice) base.soldLot = ''; base.soldPrice = np; }
  delete base.genreFixed;
  const isNew = !editing; put(base); if (base.place) lsSet('hondana.lastPlace', base.place); closeV('vEdit');
  toast(isNew ? `「${base.title || 'ISBN ' + base.isbn}」を追加しました` : '保存しました');
  if (isNew) go('#b-' + encodeURIComponent(base.id));
});

/* ---------- バーコード ---------- */
let stream = null, scanTimer = null, lastCode = '', lastAt = 0, detector = null, zr = null, scanCount = 0, lastAdded = null;
// バーコードの画面は［確かめる］［登録する］［売る］の3つを切り替えて使う。前回使ったものを覚えておく
let scanMode = 'add', sellMode = false, sellSession = []; // 売るときの、この回に売った本（取り消し用に前の状態も持つ）
const SCAN_TITLE = { check: '持っているか確かめる', add: 'バーコードで登録', sell: '売る本を読む' };
function setScanMode(m) {
  scanMode = m; sellMode = m === 'sell'; lsSet('hondana.scanMode', m); $('vScan').dataset.mode = m;
  $('scanMode').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.m === m)));
  $('sellBox').hidden = m !== 'sell'; $('scanContBox').hidden = m !== 'add'; $('scanPlaceBox').hidden = m !== 'add'; $('scanMore').hidden = m === 'check'; updScanMore();
  $('scanT').textContent = SCAN_TITLE[m]; $('scanList').innerHTML = ''; lastAdded = null;
  if (m === 'sell') { if (!$('sellAt').value) $('sellAt').value = today(); if (!$('sellTo').value) $('sellTo').value = lsGet('hondana.lastSoldTo', ''); updSellSum(); }
  scanSay(m === 'sell' ? '売る本のバーコード（978で始まる上の段）を、1冊ずつ映してください。'
    : m === 'check' ? 'バーコード（978で始まる上の段）を映すと、持っているかどうかを教えます。ここでは登録しません。'
    : '本の裏のバーコード（978で始まる上の段）を、枠の中に横向きに映してください。続けて下の段も読むと、ジャンルと定価が入ります。');
}
// たたんだ「詳しく設定する」の横に、今の設定を短く出す
function updScanMore() {
  const p = [$('scanFmt').value, scanMode === 'add' && $('scanPlace').value.trim(), $('scanGenre').value || 'ジャンル自動', $('scanRead').value].filter(Boolean);
  $('scanMoreSum').textContent = p.join('・');
}
['scanFmt', 'scanPlace', 'scanGenre', 'scanRead'].forEach(id => $(id).addEventListener('change', updScanMore));
$('scanMode').addEventListener('click', e => { const t = e.target.closest('[data-m]'); if (!t || t.dataset.m === scanMode) return; if (sellMode && sellSession.length) finishSell(); setScanMode(t.dataset.m); });
// 確かめるだけ：持っているかを教える。持っていなければ「登録する」も出す
// 売った本を買い戻したら、新しい1冊として登録して、前の1冊とつなげる
function rebuy(old, extra) {
  const nb = { ...BLANK, id: newId(), addedAt: Date.now(), boughtAt: today(), prevId: old.id };
  for (const k of ['title', 'author', 'publisher', 'isbn', 'pisbn', 'asin', 'series', 'vol', 'genre', 'genreSet', 'pubdate', 'cover', 'listPrice', 'format', 'folder']) nb[k] = old[k];
  Object.assign(nb, extra || {}); put(nb); return nb;
}
async function onCheckIsbn(isbn) {
  const same = [...books.values()].filter(x => x.isbn === isbn || x.pisbn === isbn), own = same.filter(x => x.status !== 'sold');
  const li = document.createElement('li'); li.className = 'chk-res';
  if (same.length) {
    const b = own[0] || same[0], how = own.length ? `持っています（${[b.format, b.place, b.read || '', b.trial ? 'お試し' : ''].filter(Boolean).join('・')}）` : `売った本です（${jdate(b.soldAt) || '日付なし'}）`;
    li.innerHTML = `<div class="mini">${coverHtml(b)}</div><span style="flex:1"><span class="yes"></span><br><span class="t"></span></span>`;
    li.querySelector('.yes').textContent = how; li.querySelector('.t').textContent = b.title || 'ISBN ' + isbn;
    if (!own.length) { const bt = document.createElement('button'); bt.className = 'btn'; bt.style.cssText = 'min-height:34px;flex:none;padding:0 10px;font-size:13px'; bt.textContent = '買い戻した';
      bt.onclick = () => { rebuy(b); bt.disabled = true; bt.textContent = '登録しました'; scanSay(`「${b.title || 'ISBN ' + isbn}」を買い戻した1冊として登録しました`); }; li.append(bt); }
    scanSay(own.length ? '持っています！' : 'この本は前に売りました', !own.length);
  } else {
    scanSay(`ISBN ${isbn} を調べています…`); const r = await lookup(isbn), nb = bookFromLookup(isbn, r, { format: '紙' });
    li.innerHTML = `<div class="mini">${coverHtml(nb)}</div><span style="flex:1"><span class="no">持っていません</span><br><span class="t"></span></span><button class="btn" style="min-height:34px;flex:none;padding:0 10px;font-size:13px">登録する</button>`;
    li.querySelector('.t').textContent = (nb.title || 'ISBN ' + isbn) + (nb.listPrice != null ? `（定価${yen(nb.listPrice)}）` : '');
    li.querySelector('button').onclick = e => { const g = $('scanGenre').value; put({ ...nb, ...(g ? { genre: g } : {}) }); e.target.disabled = true; e.target.textContent = '登録しました'; scanSay(`「${nb.title || 'ISBN ' + isbn}」を登録しました`); };
    scanSay('持っていません', true);
  }
  $('scanList').prepend(li); while ($('scanList').children.length > 8) $('scanList').lastElementChild.remove();
}
function updSellSum() {
  const bs = sellSession.map(s => books.get(s.id)).filter(Boolean), lp = bs.filter(b => b.listPrice != null);
  $('sellSum').textContent = bs.length ? `今回 ${bs.length}冊${lp.length ? `・定価の合計 ${yen(lp.reduce((a, b) => a + b.listPrice, 0))}${lp.length < bs.length ? `（${bs.length - lp.length}冊は定価不明）` : ''}` : ''}` : '';
}
function finishSell(later) {
  const ids = sellSession.map(s => s.id).filter(x => books.has(x)), at = $('sellAt').value, to = $('sellTo').value.trim(); sellSession = [];
  if (ids.length) setTimeout(() => openSold(ids, { at, to, fromScan: true }), later ? 30 : 0);
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
  const li = document.createElement('li'); li.innerHTML = `<div class="mini">${coverHtml(b)}</div><span class="lt" style="flex:1"></span><button class="btn" style="min-height:32px;flex:none;padding:0 10px;font-size:13px">取り消す</button>`;
  li.querySelector('.lt').textContent = (b.title || `ISBN ${isbn}`) + (b.listPrice != null ? `（定価${yen(b.listPrice)}）` : '');
  li.querySelector('button').onclick = () => { const i = sellSession.findIndex(s => s.id === b.id); if (i < 0) return; const s2 = sellSession.splice(i, 1)[0];
    if (s2.before) put(s2.before); else removeBook(b.id); li.remove(); updSellSum(); scanSay('取り消しました'); };
  $('scanList').prepend(li); updSellSum(); scanSay(said + '。次の本をどうぞ。', !o && !b.title);
}
const scanCv = document.createElement('canvas');
function scanSay(t, warn) { $('scanMsg').textContent = t; $('scanMsg').className = 'msg' + (warn ? ' warn' : ''); }
async function openScan(pre = {}) {
  scanCount = 0; lastAdded = null; sellSession = []; $('sellAt').value = ''; $('sellTo').value = '';
  $('scanFmt').value = pre.format || lsGet('hondana.lastFmt', '紙'); $('scanRead').value = ''; $('scanGenre').value = pre.genre || ''; $('scanPlace').value = pre.place ?? lsGet('hondana.lastPlace', '');
  setScanMode(pre.mode || lsGet('hondana.scanMode', 'add')); openV('vScan');
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
// 画面の青い枠（少しゆとりを持たせる）が、カメラの映像のどこに当たるかを計算する。枠の外に写ったバーコードは読まない
function frameInVideo(v) {
  const cw = v.clientWidth || 1, chh = v.clientHeight || 1, vw = v.videoWidth, vh = v.videoHeight, sc = Math.max(cw / vw, chh / vh), ox = (vw * sc - cw) / 2, oy = (vh * sc - chh) / 2;
  const L = cw * .03, R = cw * .97, T = chh * .22, B = chh * .78;
  return { x: Math.max(0, (L + ox) / sc), y: Math.max(0, (T + oy) / sc), w: Math.min(vw, (R - L) / sc), h: Math.min(vh, (B - T) / sc) };
}
// 読み間違いを防ぐため、同じ数字を続けて2回読めたときだけ受け付ける
const seenCodes = new Map();
function confirmed(c) { const now = Date.now(), p = seenCodes.get(c); for (const [k, x] of seenCodes) if (now - x.at > 1200) seenCodes.delete(k); seenCodes.set(c, { n: p ? p.n + 1 : 1, at: now }); return (p ? p.n + 1 : 1) >= 2; }
async function tick() {
  if (!stream) return; const v = $('video'); let codes = [];
  if (v.readyState >= 2 && v.videoWidth) {
    const fr = frameInVideo(v);
    if (detector) { try { codes = (await detector.detect(v)).filter(r => { const bb = r.boundingBox; if (!bb) return true; const cx = bb.x + bb.width / 2, cy = bb.y + bb.height / 2; return cx >= fr.x && cx <= fr.x + fr.w && cy >= fr.y && cy <= fr.y + fr.h; }).map(r => r.rawValue); } catch (e) {} }
    else if (zr) {
      scanCv.width = Math.min(fr.w, 1000); scanCv.height = fr.h * scanCv.width / fr.w;
      scanCv.getContext('2d', { willReadFrequently: true }).drawImage(v, fr.x, fr.y, fr.w, fr.h, 0, 0, scanCv.width, scanCv.height);
      try { const r = zr.decodeWithState(new ZXing.BinaryBitmap(new ZXing.HybridBinarizer(new ZXing.HTMLCanvasElementLuminanceSource(scanCv)))); codes = [r.getText()]; } catch (e) {}
    }
  }
  codes = codes.filter(confirmed);
  for (const c of codes) {
    if (c === lastCode && Date.now() - lastAt < 4000) continue;
    const isbn = normIsbn(c), cc = priceCode(c);
    if (isbn) { lastCode = c; lastAt = Date.now(); await onIsbn(isbn); break; }
    if (cc && lastAdded && Date.now() - lastAdded.at < 15000) { lastCode = c; lastAt = Date.now(); const b = books.get(lastAdded.id), g = genreFromC(cc), lp = priceFromCode(c); if (b) { const nb = { ...b }, said = [];
      if (g && b.genre !== g && !b.genreSet && !$('scanGenre').value) { nb.genre = g; said.push(`ジャンル「${g}」`); }
      if (lp && b.listPrice == null) { nb.listPrice = lp; if (!sellMode && (b.paid == null || b.paidAuto)) { nb.paid = taxIn(lp); nb.paidAuto = true; } said.push(`定価${yen(lp)}`); }
      if (said.length) { put(nb); scanSay(`${said.join('と')}を入れました。次の本をどうぞ。`); if (sellMode) { updSellSum(); const li = $('scanList').firstElementChild?.querySelector('.lt'); if (li && lp) li.textContent = (nb.title || `ISBN ${nb.isbn}`) + `（定価${yen(lp)}）`; } } } break; }
    // 45・49で始まる商品用のバーコード：ISBNのない本（同人誌やゲーム会社の本など）かもしれないので、その番号で探す・登録できるようにする
    const jan = janOf(c); if (jan) { lastCode = c; lastAt = Date.now(); await onJan(jan); break; }
    // 本以外のバーコード（CDやグッズのJANコードなど）は、読めたことだけ知らせる
    if (!isbn && !cc && /^\d{8,13}$/.test(c) && !/^19[12]/.test(c)) { lastCode = c; lastAt = Date.now(); scanSay('本のバーコードではないようです。本の裏の、978で始まるバーコードを映してください。', true); }
  }
  if (stream) scanTimer = setTimeout(tick, 160);
}
async function onJan(jan) {
  try { navigator.vibrate?.(60); } catch (e) {}
  const same = [...books.values()].filter(x => x.jan === jan), own = same.find(x => x.status !== 'sold'), b = own || same[0];
  const li = document.createElement('li'); li.className = 'chk-res';
  const addBtn = () => { const bt = document.createElement('button'); bt.className = 'btn'; bt.style.cssText = 'min-height:34px;flex:none;padding:0 10px;font-size:13px'; bt.textContent = 'この番号で登録';
    bt.onclick = () => { closeV('vScan'); openEdit(bookFromLookup('', null, { jan, format: '紙', place: $('scanPlace').value.trim(), read: $('scanRead').value }), 'ISBNのない本です。書名などを入れて保存してください。次からこのバーコードで見つけられます。'); }; return bt; };
  if (b && sellMode) {
    if (!own) { scanSay(`「${b.title}」は、もう売った本に入っています`, true); return; }
    const at = $('sellAt').value || today(), to = $('sellTo').value.trim(), before = { ...own }, nb = { ...own, status: 'sold', soldAt: at, soldTo: to, trial: false }; put(nb);
    sellSession.push({ id: nb.id, before }); lastAdded = { id: nb.id, at: Date.now() };
    li.innerHTML = `<div class="mini">${coverHtml(nb)}</div><span class="lt" style="flex:1"></span><button class="btn" style="min-height:32px;flex:none;padding:0 10px;font-size:13px">取り消す</button>`;
    li.querySelector('.lt').textContent = nb.title;
    li.querySelector('button').onclick = () => { const i = sellSession.findIndex(s2 => s2.id === nb.id); if (i < 0) return; put(sellSession.splice(i, 1)[0].before); li.remove(); updSellSum(); scanSay('取り消しました'); };
    $('scanList').prepend(li); updSellSum(); scanSay(`「${nb.title}」を売った本にしました。次の本をどうぞ。`); return;
  }
  if (b) {
    li.innerHTML = `<div class="mini">${coverHtml(b)}</div><span style="flex:1"><span class="yes"></span><br><span class="t"></span></span>`;
    li.querySelector('.yes').textContent = own ? `持っています（${[b.format, b.place, b.read || ''].filter(Boolean).join('・')}）` : `売った本です（${jdate(b.soldAt) || '日付なし'}）`; li.querySelector('.t').textContent = b.title;
    scanSay(own ? (scanMode === 'add' ? `もう持っています：${b.title}` : '持っています！') : 'この本は前に売りました', !own || scanMode === 'add');
  } else {
    li.innerHTML = `<div class="mini"><div class="cv nocv" style="background:${tint(jan)}"><span>${jan}</span></div></div><span style="flex:1"><span class="no">ISBNのない本か、本以外の商品です</span><br><span class="t"></span></span>`;
    li.querySelector('.t').textContent = 'バーコード ' + jan; li.append(addBtn());
    scanSay('ISBNのない本なら「この番号で登録」から手で登録できます', true);
  }
  $('scanList').prepend(li); while ($('scanList').children.length > 8) $('scanList').lastElementChild.remove();
}
async function onIsbn(isbn) {
  try { navigator.vibrate?.(60); } catch (e) {}
  if (scanMode === 'check') { await onCheckIsbn(isbn); return; }
  if (sellMode) { await onSellIsbn(isbn); return; }
  const fmt = $('scanFmt').value, place = $('scanPlace').value.trim(), rd = $('scanRead').value, gn = $('scanGenre').value; lsSet('hondana.lastFmt', fmt); if (place) lsSet('hondana.lastPlace', place);
  const same = [...books.values()].filter(x => x.isbn === isbn), d = same.find(x => x.status !== 'sold') || null, soldOne = !d && same.find(x => x.status === 'sold');
  if (soldOne && $('scanCont').checked) {
    const nb = rebuy(soldOne, { place, ...(rd ? { read: rd } : {}) }); lastAdded = { id: nb.id, at: Date.now() }; scanCount++;
    scanSay(`前に売った「${soldOne.title || 'ISBN ' + isbn}」を、買い戻した1冊として登録しました。次の本をどうぞ。`); return;
  }
  if (!$('scanCont').checked) {
    closeV('vScan'); openEdit(bookFromLookup(isbn, null, { format: fmt, place, read: rd, genre: gn, genreFixed: !!gn })); $('fIsbn').dispatchEvent(new Event('change')); return;
  }
  if (d) { lastAdded = { id: d.id, at: Date.now() }; scanSay(`もう持っています：${d.title || 'ISBN ' + isbn}（${d.format}${d.status === 'sold' ? '・売った' : ''}${d.place ? '・' + d.place : ''}）${d.listPrice == null ? '。下の段を読むと定価を入れます' : ''}`, true); return; }
  scanSay(`ISBN ${isbn} を調べています…`);
  const r = await lookup(isbn), b = bookFromLookup(isbn, r, { format: fmt, place, read: rd, genre: gn });
  put(b); scanCount++; lastAdded = { id: b.id, at: Date.now() };
  const li = document.createElement('li'); li.innerHTML = `<div class="mini">${coverHtml(b)}</div><span class="lt" style="flex:1"></span><button class="btn" data-fix style="min-height:32px;flex:none;padding:0 8px;font-size:13px">直す</button><button class="btn" data-undo style="min-height:32px;flex:none;padding:0 8px;font-size:13px">取り消す</button>`;
  li.querySelector('.lt').textContent = (b.title || `ISBN ${isbn}（書名はあとで）`) + `　ISBN ${isbn}`;
  li.querySelector('[data-undo]').onclick = () => { removeBook(b.id, true); li.remove(); scanCount = Math.max(0, scanCount - 1); if (lastAdded?.id === b.id) lastAdded = null; scanSay('取り消しました。次の本をどうぞ。'); };
  li.querySelector('[data-fix]').onclick = () => { const x = books.get(b.id); if (!x) return; closeV('vScan'); openEdit(x); };
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
  '出版社': 'publisher', 'publisher': 'publisher', 'isbn': 'isbn', 'isbn13': 'isbn', 'asin': 'asin', 'アイテムid': 'asin', 'シリーズ': 'series', '巻': 'vol', 'ジャンル': 'genre', '形態': 'format', '置き場所': 'place', '状態': 'status', 'status': 'kstatus', 'readstatus': 'kstatus', 'readingstatus': 'kstatus', '読書': 'read', '読了日': 'readAt', '読み終えた日': 'readAt',
  '出版日': 'pubdate', '発売日': 'pubdate', '購入日': 'boughtAt', 'acquiredtime': 'boughtAt', 'acquireddate': 'boughtAt', 'purchasedate': 'boughtAt', 'date': 'boughtAt', '売った日': 'soldAt', '売った先': 'soldTo', '金額': 'soldPrice', 'メモ': 'memo', 'お試し': 'trial', '定価': 'listPrice', '買った値段': 'paid', 'price': 'paid', 'まとまり': 'folder', '紙の版isbn': 'pisbn', 'まとめ売り': 'soldLot', 'バーコード': 'jan', 'jan': 'jan',
  '書誌名': 'title', 'レーベル名': 'label', 'レーベル': 'label', '出版社名': 'publisher', 'アーカイブかどうか': 'archive',
  '表紙url': 'cover', 'productimage': 'cover', 'image': 'cover', 'imageurl': 'cover', 'cover': 'cover', '追加日': 'addedAt' };
const colOf = h => COLS[nfkc(h).trim().toLowerCase()] || COLS[nfkc(h).trim()] || '';
function toDate(v) { if (v == null || v === '') return ''; if (typeof v === 'number' || /^\d{10,13}$/.test(String(v))) { const n = +v; return dstr(n < 1e11 ? n * 1000 : n); } const s = normPubdate(v); return s.length === 10 ? s : (Date.parse(v) ? dstr(Date.parse(v)) : ''); }
// BOOK☆WALKERの「レーベル名」からジャンルを決める（コミックス系→漫画、文庫・ノベル→小説）
function genreFromLabel(l) {
  l = nfkc(l || ''); if (!l || /^[―ー-]+$/.test(l)) return '';
  if (/コミック|comic|comix|マンガ|まんが|漫画|マガジン|ジャンプ|サンデー|チャンピオン|モーニング|アフタヌーン|イブニング|kiss|be・love|フレンド|なかよし|デザート|マーガレット|lala|メロディ|aria|itan|パルシィ|comico|サイコミ|colorful|コルク|ゴイチ|days|プリンセス|ゼノン|フラッパー|ガンガン|zero-sum|ブレイド|flos|バンチ|ガルド|デジタル大全|アッパーズ|ヤング|mimi|りぼん|ハツキス|オトナ恋|ハレム|ネメシス|ザクロマニカ|こみ|buncomi|fizz|tl★|psycheloss|one visions|^mfc$|cocochee|rush!|gamna|ganma|studio kiro|トライゾン|デジコレ|黒蜜|meqlme|next creator|ジュール|ヒュー|ビーム|コロナ|ニチブン|バンブー|アクション|ライバル|シリウス|エッジ|mook|ムック/i.test(l)) return /mook|ムック/i.test(l) ? '' : '漫画';
  if (/学術|ソフィア|[+＋]α|新書|ライブラリー|実用|お料理|攻略本|事典/.test(l)) return '';
  if (/文庫|ノベル|novel|e-books|単行本/i.test(l)) return '小説';
  return '';
}
// 書名に「期間限定無料」「無料お試し版」などと書いてある電子書籍は、最初からお試しにする
const FREE_TITLE = /期間限定\s*無料|無料\s*お試し|お試し版|試し読み|【無料】|無料版/;
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
    genre: g('genre') && g('genre') !== 'その他' ? g('genre') : (genreFromLabel(g('label')) || genreFromText(title, g('publisher')) || (fmt !== '紙' && ps.vol && !NOT_MANGA.test(title) ? '漫画' : 'その他')), format: fmt, place: g('place'),
    trial: /はい|true|1|yes/i.test(g('trial')) || /アーカイブ/.test(g('archive')) || (fmt !== '紙' && FREE_TITLE.test(nfkc(title))), folder: g('folder'), pisbn: normIsbn(g('pisbn')), soldLot: g('soldLot'), jan: janOf(g('jan')),
    listPrice: g('listPrice').replace(/\D/g, '') ? +g('listPrice').replace(/\D/g, '') : null, paid: g('paid').replace(/\D/g, '') !== '' ? +g('paid').replace(/\D/g, '') : null, status: /売|sold/.test(g('status')) ? 'sold' : 'own', read, readAt: read === '読んだ' ? toDate(g('readAt')) : '', pubdate: normPubdate(g('pubdate')), boughtAt: toDate(o.boughtAt) || today(),
    cover, memo: g('memo'), soldAt: toDate(g('soldAt')), soldTo: g('soldTo'), soldPrice: price ? +price : null, addedAt: isNaN(added) ? Date.now() : added };
}
let cands = [];
$('fileIn').addEventListener('change', async () => {
  const f = $('fileIn').files[0]; $('fileIn').value = ''; if (!f) return; closeV('vMenu');
  // BOOK☆WALKERのCSVは Shift_JIS なので、UTF-8 で読めなければ Shift_JIS で読み直す
  let text; try { const buf = await f.arrayBuffer(); try { text = new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch (e) { text = new TextDecoder('shift_jis').decode(buf); } } catch (e) { toast('ファイルを読めませんでした'); return; }
  text = text.replace(/^\uFEFF/, '');
  let recs = [], isBW = false;
  let fmtDefault = fileMode === 'kindle' ? 'Kindle' : '紙';
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
      if (keys.includes('label') || keys.includes('archive')) { isBW = true; fmtDefault = 'BookWalker'; }
      if (!keys.includes('title') && !keys.includes('isbn')) { keys = ['title', 'author']; start = 0; }
      recs = rows.slice(start).map(r => { const m = {}; keys.forEach((k, i) => { if (k && !(k in m)) m[k] = r[i] ?? ''; }); return m; });
    }
  } catch (e) { toast('このファイルは読み込めませんでした'); return; }
  const seen = new Set();
  // 登録済みかどうかを、何千冊でもすぐ確かめられるように索引を作っておく
  const ix = new Map(); for (const x of books.values()) { if (x.isbn) ix.set('i' + x.isbn, x); if (x.asin) ix.set('a' + x.asin, x); const t = norm(x.title); if (t) ix.set('t' + t + '|' + x.format, x); }
  const dupOf = b => (b.isbn && ix.get('i' + b.isbn)) || (b.asin && ix.get('a' + b.asin)) || (norm(b.title) && ix.get('t' + norm(b.title) + '|' + b.format)) || null;
  cands = recs.map(r => recordToBook(r, fmtDefault)).filter(Boolean).filter(b => { const k = b.isbn || b.asin || norm(b.title) + '|' + b.format; if (seen.has(k)) return false; seen.add(k); return true; })
    .map(b => ({ b, dup: dupOf(b) }));
  const nDel = cands.filter(c => !c.dup && wasDeleted(c.b)).length; if (nDel) cands = cands.filter(c => c.dup || !wasDeleted(c.b));
  const nArc = isBW ? cands.filter(c => c.b.trial && !c.dup).length : 0;
  $('impT').textContent = isBW ? 'BOOK☆WALKERの本を取り込む' : fileMode === 'kindle' ? 'Kindleの本を取り込む' : 'CSVから戻す'; $('pasteBox').hidden = true;
  $('impMsg').textContent = (nArc ? `BOOK☆WALKERで「アーカイブ」にしていた${nArc}冊は、お試しとして入れます（普段の本棚には出ませんが、検索すれば見つかります）。` : '') + (nDel ? `前に削除した${nDel}冊は、一覧に出していません。` : '');
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
// DMMブックス：購入済み一覧（1冊ごとに「書名・作者・ジャンル・購入済み最新巻のレビューを書く」が並ぶ）と、本のページ（購入日が書いてある）
const DMM_NOISE = /^(未購入続刊あり|新刊あり|単行本一覧|購入済み最新巻のレビューを書く|レビューを書く.*|NEW|セール中|.*%OFF)$/;
function parseDmm(t) {
  const lines = t.split(/\r?\n/).map(x => nfkc(x).trim()).filter(Boolean);
  const bm = t.match(/購入日\s*[:：]?\s*(\d{4})[\/年.-](\d{1,2})[\/月.-](\d{1,2})/);
  if (bm && /購入済み|ブラウザで読む|アプリで読む/.test(t)) {
    const ls = lines.filter(l => !/^(#|この作品は|購入日|ブラウザで読む|アプリで読む|作品をダウンロード|始めの巻|前の巻|次の巻|最新刊|もっと読む|星を選んで|レビュー|[≪<«‹]|\d+(\.\d+)?$|[(（]\d+[)）]$|.*位\s*[(（]|.*ptゲット)/.test(l));
    const title = ls[0] || ''; if (!title) return null;
    const pub = ls[1] && ls[1].length <= 30 && !/[。、]/.test(ls[1]) ? ls[1] : '';
    const b = recordToBook({ title, publisher: pub }, 'DMM'); if (!b) return null;
    b.boughtAt = `${bm[1]}-${bm[2].padStart(2, '0')}-${bm[3].padStart(2, '0')}`; if (pub) b.publisher = pub;
    return { page: true, out: [{ b, page: true }], hidden: 0 };
  }
  if (!/レビューを書く/.test(t)) return null;
  const out = []; let blk = [], hidden = 0;
  const flush = () => { const ls = blk.filter(l => { if (DMM_NOISE.test(l)) { hidden++; return false; } return true; }); blk = [];
    if (!ls.length) return; const n = ls.length, title = ls[n >= 3 ? n - 3 : 0], author = n >= 2 ? ls[n >= 3 ? n - 2 : 1].replace(/\s*他$/, '') : '', cat = n >= 3 ? ls[n - 1] : '';
    const b = recordToBook({ title, author }, 'DMM'); if (!b) return;
    const g = /マンガ|コミック|漫画/.test(cat) ? '漫画' : /小説|ノベル|文芸|ライトノベル/.test(cat) ? '小説' : ''; if (g && (!b.genre || b.genre === 'その他')) b.genre = g;
    out.push({ b }); };
  for (const l of lines) { if (/レビューを書く/.test(l)) { flush(); continue; } blk.push(l); }
  return { out, hidden };
}
$('impParse').onclick = () => {
  const t = $('impText').value.trim(); if (!t) { $('impMsg').textContent = '先に本棚ページの文字を貼り付けてください。'; return; }
  const dmm = parseDmm(t); if (dmm && $('impFmt').value !== 'DMM' && FORMATS.includes('DMM')) $('impFmt').value = 'DMM';
  const { out, hidden } = dmm || parsePaste(t, $('impFmt').value), seen = new Set();
  cands = out.filter(x => { const k = norm(x.b.title); if (!k || seen.has(k)) return false; seen.add(k); return true; }).map(x => ({ ...x, dup: findDup(x.b) }));
  $('impMsg').textContent = dmm?.page ? (cands[0]?.dup ? `「${cands[0].b.title}」に購入日（${jdate(cands[0].b.boughtAt)}）を入れます。「追加する」を押してください。` : `棚にない本なので、購入日（${jdate(cands[0]?.b.boughtAt)}）を付けて追加します。`)
    : (dmm ? 'DMMの一覧として読み取りました。2巻以上持っている作品は1冊ぶんしか出ないので、あとで巻を足してください。' : '') + (hidden ? `画面の文字らしい${hidden}行は最初から外しました。` : '');
  showCands();
};
// 取り込みのとき、棚にある同じストアの本でいちばん新しい購入日より後の本だけに、最初からチェックを入れる（前に取り込んで消した古い本を、また入れてしまわないように）
function latestBought(fmt) { let m = ''; for (const x of books.values()) if (x.format === fmt && x.boughtAt && x.boughtAt > m) m = x.boughtAt; return m; }
function showCands() {
  if (!cands.length) { $('impMsg').textContent = '本が見つかりませんでした。中身を確かめてください。'; $('impPrev').hidden = true; return; }
  const fresh = cands.filter(c => !c.dup && c.b.boughtAt && !c.page), lat = new Map(); fresh.forEach(c => { if (!lat.has(c.b.format)) lat.set(c.b.format, latestBought(c.b.format)); });
  let nOld = 0; cands.forEach(c => { const l = lat.get(c.b.format); c.old = !!(l && !c.dup && !c.page && c.b.boughtAt && c.b.boughtAt <= l); if (c.old) nOld++; });
  if (nOld) { const l = [...lat.values()].filter(Boolean).sort().pop(); $('impMsg').textContent += `棚にある本でいちばん新しい購入日（${jdate(l)}）より後の本にだけ、チェックを入れました。それより前の${nOld}冊は、前に消した本かもしれないので外してあります（入れたい本はチェックしてください）。`; }
  $('impList').innerHTML = cands.map((c, i) => `<label><input type="checkbox" data-i="${i}" ${c.dup || c.rep || c.old ? '' : 'checked'}><span>${esc(c.b.title)}${c.b.author ? `<span class="note">　${esc(c.b.author)}</span>` : ''}${c.dup ? ` <span class="tag">登録済み</span>` : ''}${c.rep && !c.dup ? ' <span class="note">画面の文字かも</span>' : ''}</span></label>`).join('');
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
    // DMMの本のページを貼ったとき：購入日と出版社を入れる
    if (c.page) { if (c.b.boughtAt && cur.boughtAt !== c.b.boughtAt) { nb.boughtAt = c.b.boughtAt; ch = true; } if (c.b.publisher && !cur.publisher) { nb.publisher = c.b.publisher; ch = true; } }
    if (c.b.author && !cur.author) { nb.author = c.b.author; ch = true; }
    if (ch) upd.push(nb);
  }
  if (upd.length) putMany(upd);
  if (!sel.length) { render(); closeV('vImp'); if (upd.length) toast(`登録済みの${upd.length}冊を更新しました（${cands.some(c => c.page) ? '購入日・出版社' : '読んだ・著者名'}）`); return; }
  for (const c of picked) if (c.photo) { try { await setPhoto(c.b.id, await (await fetch(c.photo)).blob()); } catch (e) {} }
  if (!$('pasteBox').hidden) learn(boxes.filter(b => !b.checked).map(b => cands[+b.dataset.i]).filter(c => !c.dup).map(c => c.b.title));
  const now = Date.now(); sel.forEach((b, k) => { if (!b.addedAt || b.addedAt > now) b.addedAt = now - k; });
  putMany(sel); $('impText').value = ''; closeV('vImp'); toast(`${sel.length}冊を追加しました`); go(''); setTimeout(fillAuthors, 300);
};

/* ---------- 書き出し ---------- */
async function exportCsv() {
  const head = ['書名', '著者', '出版社', 'ISBN', 'ASIN', 'シリーズ', '巻', 'ジャンル', '形態', '置き場所', '状態', '読書', '読み終えた日', '出版日', '購入日', '売った日', '売った先', '金額', 'メモ', '表紙URL', '追加日', 'お試し', '定価', '買った値段', 'まとまり', '紙の版ISBN', 'まとめ売り', 'バーコード'];
  const q = v => { const s = String(v ?? ''); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const rows = [...books.values()].sort((a, b) => (a.addedAt || 0) - (b.addedAt || 0)).map(b => [b.title, b.author, b.publisher, b.isbn, b.asin, b.series, b.vol, b.genre, b.format, b.place, b.status === 'sold' ? '売った' : '持っている', b.read, b.readAt, b.pubdate, b.boughtAt, b.soldAt, b.soldTo, b.soldPrice, b.memo, httpsUrl(b.cover), dstr(b.addedAt), b.trial ? 'はい' : '', b.listPrice ?? '', b.paid ?? '', b.folder || '', b.pisbn || '', b.soldLot || '', b.jan || ''].map(q).join(','));
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
// 候補でチェックを外したまま実行したものは覚えておいて、次から出さない（o.dismiss に覚える場所の名前）
const bulkKey = it => it.key || (it.group ? 'g:' + it.group.map(b => b.id).sort().join(',') : 'b:' + it.b.id);
const dismissed = name => { try { return new Set(JSON.parse(lsGet('hondana.dismiss.' + name, '[]'))); } catch (e) { return new Set(); } };
function openBulk(o, showAll) {
  if (o.dismiss) { const d = dismissed(o.dismiss); o.allItems = o.allItems || o.items; o.items = showAll ? o.allItems : o.allItems.filter(it => !d.has(bulkKey(it))); o.hiddenN = o.allItems.length - o.items.length; }
  $('bulkMore').hidden = !o.hiddenN; $('bulkMore').textContent = `前に外した候補も出す（${o.hiddenN || 0}件）`;
  bulk = o;
  $('bulkT').textContent = o.title; $('bulkNote').textContent = o.note + (o.dismiss === 'folder' ? '　チェックしないまま実行した候補は、次から出しません。' : o.dismiss ? '　チェックを外して実行した候補は、次から出しません。' : ''); $('bulkGo').textContent = o.action; $('bulkGo').className = 'btn ' + (o.danger ? 'danger' : 'gold');
  $('bulkList').innerHTML = o.items.length ? o.items.map((it, i) => `<label><input type="checkbox" data-i="${i}" ${it.checked ? 'checked' : ''}><span>${esc(it.label || it.b.title || 'ISBN ' + it.b.isbn)}${it.tag ? ` <span class="tag">${esc(it.tag)}</span>` : ''}</span></label>`).join('') : '<p class="note" style="padding:12px">当てはまる本はありませんでした。</p>';
  bulkCount(); $('bulkGo').dataset.armed = ''; bulkLabel(); closeV('vMenu'); openV('vBulk');
}
const bulkBooks = it => it.group || [it.b];
function bulkCount() { const ch = [...$('bulkList').querySelectorAll('input:checked')].map(x => bulk.items[+x.dataset.i]), n = ch.reduce((a, it) => a + bulkBooks(it).length, 0), all = bulk.items.reduce((a, it) => a + bulkBooks(it).length, 0); $('bulkSum').textContent = `${all}冊中 ${n}冊を選んでいます`; $('bulkGo').disabled = (!n) && !(bulk.dismiss === 'folder' && bulk.items.length); $('bulkGo').dataset.armed = ''; $('bulkGo').textContent = bulk.action; }
$('bulkList').addEventListener('change', bulkCount);
$('bulkList').addEventListener('change', bulkLabel);
function bulkLabel() { if (!bulk || $('bulkGo').dataset.armed) return; const n = $('bulkList').querySelectorAll('input:checked').length; $('bulkGo').textContent = bulk.dismiss === 'folder' && !n && bulk.items.length ? 'どれも選ばない（次から出さない）' : bulk.action; }
$('bulkMore').onclick = () => { const o = bulk; openBulk(o, true); };
$('bulkAll').onclick = () => { const bs = [...$('bulkList').querySelectorAll('input')], on = bs.some(b => !b.checked); bs.forEach(b => b.checked = on); bulkCount(); bulkLabel(); };
$('bulkGo').onclick = async () => {
  const sel = [...$('bulkList').querySelectorAll('input:checked')].flatMap(x => bulkBooks(bulk.items[+x.dataset.i]));
  if (!sel.length) { if (bulk.dismiss === 'folder' && bulk.items.length) { const d = dismissed(bulk.dismiss); bulk.items.forEach(it => d.add(bulkKey(it))); lsSet('hondana.dismiss.' + bulk.dismiss, JSON.stringify([...d])); closeV('vBulk'); toast('どれも選ばなかったので、この候補は次から出しません'); } return; }
  if (bulk.danger && !$('bulkGo').dataset.armed) { $('bulkGo').dataset.armed = '1'; $('bulkGo').textContent = `もう一度押すと ${sel.length}冊を削除します`; return; }
  // まとまりの候補：チェックしなかったものは全部覚える。お試しの候補：最初はチェックが付いていたのに外したものだけ覚える（候補が何百もあるため）
  if (bulk.dismiss) { const d = dismissed(bulk.dismiss); [...$('bulkList').querySelectorAll('input')].forEach(x => { const it = bulk.items[+x.dataset.i], k = bulkKey(it); if (x.checked) d.delete(k); else if (bulk.dismiss === 'folder' || it.checked) d.add(k); }); lsSet('hondana.dismiss.' + bulk.dismiss, JSON.stringify([...d])); }
  await bulk.run(sel); closeV('vBulk');
};
function trialCandidates() {
  const out = [], seen = new Set(), live = [...books.values()].filter(b => b.status !== 'sold' && !b.trial);
  const add = (b, tag, checked) => { if (!seen.has(b.id)) { seen.add(b.id); out.push({ b, tag, checked }); } };
  live.filter(b => /無料|お試し|ダイジェスト|試し読み|サンプル/.test(nfkc(b.title))).forEach(b => add(b, '無料・お試し', true));
  const bySer = new Map(); live.forEach(b => { const k = seriesKey(b); if (k) { if (!bySer.has(k)) bySer.set(k, []); bySer.get(k).push(b); } });
  for (const bs of bySer.values()) if (bs.length === 1 && bs[0].vol === 1 && bs[0].format !== '紙') add(bs[0], '1巻だけ', false);
  // 無料キャンペーンでもらった漫画：電子の漫画で、1巻から2〜3巻までだけ、全部同じ日に買ったシリーズ（シリーズごとに1行）
  for (const bs of bySer.values()) {
    if (bs.length < 2 || bs.length > 3 || bs.some(b => b.format === '紙' || b.genre !== '漫画' || seen.has(b.id))) continue;
    const vs = bs.map(b => +b.vol || 0).sort((a, b) => a - b); if (!vs.every((v, i) => v === i + 1)) continue;
    if (new Set(bs.map(b => b.boughtAt)).size !== 1) continue;
    bs.forEach(b => seen.add(b.id)); out.push({ b: bs[0], group: bs, label: `${bs[0].series}（1〜${bs.length}巻）`, tag: `無料っぽい・${jdate(bs[0].boughtAt)}`, checked: false });
  }
  live.filter(b => b.format !== '紙' && !b.series && /第?[1１一]話/.test(nfkc(b.title))).forEach(b => add(b, '第1話だけ', false));
  // 別のストアで続きを買っている作品の、こちらのストアの最初の数巻（無料キャンペーンで両方からもらったもの）
  const allBySer = new Map(); [...books.values()].filter(b => b.status !== 'sold' && b.format !== '紙' && b.series).forEach(b => { const k = seriesKey(b); if (!allBySer.has(k)) allBySer.set(k, []); allBySer.get(k).push(b); });
  for (const [k, bs] of allBySer) {
    const fm = new Map(); bs.forEach(b => { if (!fm.has(b.format)) fm.set(b.format, []); fm.get(b.format).push(b); }); if (fm.size < 2) continue;
    for (const [f, mine] of fm) {
      const cand = mine.filter(b => !b.trial && !seen.has(b.id)); if (!cand.length) continue;
      const maxMine = Math.max(...mine.map(b => +b.vol || 0)); if (maxMine > 3) continue;
      const other = [...fm].filter(([g]) => g !== f).flatMap(([, x]) => x.filter(b => !b.trial)), maxOther = Math.max(0, ...other.map(b => +b.vol || 0));
      if (maxOther <= maxMine || !cand.every(b => other.some(o => +o.vol === +b.vol))) continue;
      cand.forEach(b => seen.add(b.id)); const vs = cand.map(b => +b.vol).sort((a, b) => a - b);
      out.push({ b: cand[0], group: cand, label: `${cand[0].series}（${f}の${vs.length > 1 ? vs[0] + '〜' + vs[vs.length - 1] : vs[0]}巻）`, tag: `${[...new Set(other.map(b => b.format))].join('・')}で${maxOther}巻まで持っている`, checked: true });
    }
  }
  return out;
}
$('mTrial').onclick = () => openBulk({
  title: 'お試しの本を選ぶ', action: 'お試しにする',
  note: '無料版や、1巻だけ持っている電子書籍、同じ日にまとめて手に入れた1〜3巻だけの漫画（無料キャンペーンでもらったものが多いはず）を並べました。全巻そろえて完結している作品もまざるので、チェックして選んでください。お試しにした本は普段の本棚には出ませんが、検索すれば見つかります。あとで「お試し」の絞り込みから、まとめて消せます。',
  items: trialCandidates(), dismiss: 'trial',
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
      await trashBooks(sel);
      toast(`${sel.length}冊をごみ箱に入れました`, async () => { for (const [k, v] of keep) await setPhoto(k, v); putMany(sel); });
    },
  });
}
$('mTrialDel').onclick = openTrialDelete;
// ごみ箱を開く：消した本を新しい順に並べて、チェックしたものを戻す
async function openTrash() {
  await getTrash(); const now = Date.now();
  const items = trash.slice().sort((a, b) => b.at - a.at).filter(t => !books.has(t.b.id)).map(t => { const d = Math.floor((now - t.at) / 864e5); return { b: { ...BLANK, ...t.b }, tag: d ? `${d}日前に削除` : '今日削除', checked: false }; });
  openBulk({
    title: 'ごみ箱', action: '元に戻す',
    note: '消した本は30日間ここにとっておきます。30日たつと自動で消えます。戻したい本にチェックを入れてください。',
    items,
    run: async sel => { for (const b of sel) { try { const blob = await idb.get(b.id); if (blob) photos.set(b.id, URL.createObjectURL(blob)); } catch (e) {} } putMany(sel.map(b => ({ ...b }))); toast(`${sel.length}冊を本棚に戻しました`); },
  });
}
$('mTrash').onclick = openTrash;

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
    const tiles = [...app.querySelectorAll('.tile,.sp,.vol[data-book]')], all = tiles.flatMap(x => idsOfTile(x)), on = !all.every(id => sel.has(id));
    all.forEach(id => on ? sel.add(id) : sel.delete(id)); tiles.forEach(x => x.classList.toggle('picked', on)); updateSelBar(); return;
  }
  if (!list.length) return;
  if (act === 'trial') { const on = !list.every(b => b.trial); applySel(() => ({ trial: on }), on ? '{n}冊をお試しにしました' : '{n}冊のお試しを外しました'); }
  else if (act === 'read') openPick({ title: '読んだ？', options: [['読んだ', '読んだ'], ['まだ', 'まだ'], ['', '未設定に戻す']], onPick: v => applySel(b => ({ read: v, readAt: v === '読んだ' ? b.readAt || '' : '' }), v ? `{n}冊を「${v}」にしました` : '{n}冊を未設定に戻しました') });
  else if (act === 'genre') openPick({ title: 'ジャンル', options: GENRES.map(g => [g, g]), onPick: v => applySel(() => ({ genre: v, genreSet: true }), `{n}冊を「${v}」にしました`) });
  else if (act === 'format') openPick({ title: 'ストア', options: FORMATS.map(f => [f, f]), onPick: v => applySel(() => ({ format: v }), `{n}冊を「${v}」にしました`) });
  else if (act === 'paid') openPick({ title: '買った値段（1冊あたり）', input: { placeholder: '0（無料なら0）', numeric: true }, onPick: v => { const n = parseInt(nfkc(v).replace(/\D/g, ''), 10); if (isNaN(n)) return; applySel(() => ({ paid: n, paidAuto: false }), `{n}冊を${yen(n)}にしました`); } });
  else if (act === 'fold') {
    openPick({ title: 'まとまりの名前', options: folderOrder(list).map(n => [n, n]), filter: true, note: '選んだ本に合いそうなまとまりを上に並べています。上の欄に打つと絞り込めます。新しく作るときは名前を打って「決定」。',
      input: { placeholder: '新しいまとまりの名前', value: suggestName(list) }, onPick: v => { v = String(v).trim(); if (!v) return; const u = lsJson('hondana.foldUsed', {}); u[v] = Date.now(); lsSet('hondana.foldUsed', JSON.stringify(u)); applySel(() => ({ folder: v }), `{n}冊を「${v}」にまとめました`, () => lookFolder(v)); } });
  }
  else if (act === 'series') {
    const cnt = new Map(); list.forEach(b => { if (b.series) cnt.set(b.series, (cnt.get(b.series) || 0) + 1); });
    const names = [...cnt].sort((a, b) => b[1] - a[1]).map(([n]) => n), guess = names[0] || suggestName(list);
    openPick({ title: 'シリーズ名', options: names.slice(0, 8).map(n => [n, n]), note: '選んだ本を、同じシリーズ名にそろえます。下の候補から選ぶか、名前を打って「決定」。',
      input: { placeholder: 'シリーズ名', value: guess }, onPick: v => { v = String(v).trim(); if (!v) return;
        setTimeout(() => openPick({ title: '巻数はどうしますか？', options: [['keep', '巻数はそのまま'], ['pub', '発売日の古い順に1から振り直す']], onPick: how => {
          const order = new Map(); if (how === 'pub') list.slice().sort((a, b) => (a.pubdate || '9999').localeCompare(b.pubdate || '9999') || (a.vol || 0) - (b.vol || 0) || String(a.title).localeCompare(String(b.title), 'ja')).forEach((b, i) => order.set(b.id, i + 1));
          applySel(b => ({ series: v, ...(how === 'pub' ? { vol: order.get(b.id) } : {}) }), `{n}冊を「${v}」のシリーズにしました`, () => () => go('#s-' + encodeURIComponent(norm(v)))); } }), 60); } });
  }

  else if (act === 'sold') openSold(list.map(b => b.id), {});
  else if (act === 'unfold') applySel(() => ({ folder: '' }), '{n}冊をまとまりから外しました');
  else if (act === 'delete') {
    if (!t.dataset.armed) { t.dataset.armed = '1'; t.textContent = `もう一度押すと${list.length}冊を削除`; return; }
    t.dataset.armed = ''; const keep = new Map(); try { const m = await idb.all(); list.forEach(b => { if (m.has(b.id)) keep.set(b.id, m.get(b.id)); }); } catch (er) {}
    await trashBooks(list); endSelect();
    toast(`${list.length}冊をごみ箱に入れました（30日は戻せます）`, async () => { for (const [k, v] of keep) await setPhoto(k, v); putMany(list); });
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
// まとまりに入れるとき、選んだ本に合いそうなまとまりを上に並べる：同じ作者 → 同じシリーズ・似た名前 → ジャンルや出版社が同じ本が多い → 最近使った → 名前順
const lsJson0 = (k, d) => { try { return JSON.parse(lsGet(k, '')) || d; } catch (e) { return d; } };
function folderOrder(list) {
  const fs = new Map(); for (const b of books.values()) if (b.folder) { if (!fs.has(b.folder)) fs.set(b.folder, []); fs.get(b.folder).push(b); }
  const used = lsJson0('hondana.foldUsed', {}), now = Date.now();
  const aus = new Set(list.flatMap(b => authorsOf(b.author).map(norm))), sers = new Set(list.map(seriesKey).filter(Boolean));
  const gens = new Set(list.map(b => b.genre).filter(g => g && g !== 'その他')), pubs = new Set(list.map(b => norm(b.publisher)).filter(Boolean)), words = list.map(b => norm(b.series || b.title)).filter(Boolean);
  const score = (name, bs) => {
    let sc = 0; const nn = norm(name);
    if (aus.size && bs.some(b => authorsOf(b.author).some(a => aus.has(norm(a))))) sc += 100;
    if (sers.size && bs.some(b => sers.has(seriesKey(b)))) sc += 80;
    if (nn.length >= 2 && words.some(w => w.includes(nn) || nn.includes(w.slice(0, Math.min(4, w.length))))) sc += 60;
    sc += Math.round(25 * bs.filter(b => gens.has(b.genre)).length / bs.length + 25 * bs.filter(b => pubs.has(norm(b.publisher))).length / bs.length);
    if (used[name]) sc += Math.max(0, 20 - (now - used[name]) / 864e5 / 3);
    return sc;
  };
  return [...fs].map(([n, bs]) => ({ n, sc: score(n, bs) })).sort((a, b) => b.sc - a.sc || a.n.localeCompare(b.n, 'ja')).map(x => x.n);
}
function openPick(o) {
  pickCb = o.onPick; $('pickT').textContent = o.title;
  $('pickNote').textContent = o.note || ''; $('pickNote').hidden = !o.note;
  if (o.filter) $('pickOpts').before($('pickInBox')); else $('pickOpts').after($('pickInBox'));
  $('pickIn').oninput = o.filter ? () => { const q = norm($('pickIn').value); $('pickOpts').querySelectorAll('[data-v]').forEach(x => { x.hidden = !!q && !norm(x.dataset.v).includes(q); }); } : null;
  $('pickOpts').innerHTML = (o.options || []).map(([v, l]) => `<button class="opt" data-v="${esc(v)}" style="min-height:52px"><b>${esc(l)}</b></button>`).join('');
  $('pickInBox').hidden = !o.input;
  if (o.input) { $('pickIn').value = o.input.value || ''; $('pickIn').placeholder = o.input.placeholder || ''; $('pickIn').inputMode = o.input.numeric ? 'numeric' : 'text'; }
  openV('vPick'); if (o.input && !(o.options || []).length) setTimeout(() => $('pickIn').focus(), 40);
}
$('pickOpts').addEventListener('click', e => { const t = e.target.closest('[data-v]'); if (!t) return; closeV('vPick'); pickCb?.(t.dataset.v); });
$('pickOk').onclick = () => { const v = $('pickIn').value; if (!v.trim()) { $('pickIn').focus(); return; } closeV('vPick'); pickCb?.(v); };
$('pickIn').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); $('pickOk').click(); } });

/* ---------- まとまり（フォルダ） ---------- */
function lcsName(a, b) { // ふたつの名前に共通するいちばん長い部分（「第一部 主人公名」と「第二部 主人公名」→「主人公名」）
  a = nfkc(a); b = nfkc(b); let best = '';
  for (let i = 0; i < a.length; i++) for (let j = i + best.length + 1; j <= a.length; j++) { const s2 = a.slice(i, j); if (b.includes(s2)) best = s2; else break; }
  // 単語の途中で切れていたら、切れ端を落とす（「部 主人公名」→「主人公名」）
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
// 作者の本：その人の名前が入っている本を、シリーズごとにまとめて並べる
function renderAuthor(name) {
  const k = norm(name), pick = b => authorsOf(b.author).some(a => norm(a) === k);
  const all = [...books.values()].filter(pick); if (!all.length) { location.hash = ''; return; }
  const own = all.filter(b => b.status !== 'sold' && !b.trial), nSer = new Set(own.map(b => seriesKey(b) || b.id)).size;
  app.innerHTML = `<div class="page" style="padding-left:0;padding-right:0">
    <div style="padding:0 20px">${crumbs([['data-home', '本棚']])}
    <h2 style="margin:4px 0 0;font:700 24px/1.3 var(--serif);color:var(--gold)">${esc(name)}</h2>
    <p class="sub">${nSer}作品・${own.length}冊${all.length > own.length ? `<span class="note">（ほかに売った本・お試し ${all.length - own.length}冊）</span>` : ''}</p></div>
    ${resultsHtml(null, pick)}
  </div>`;
}
function renderFolder(key) {
  const all = [...books.values()].filter(b => folderKey(b) === key);
  if (!all.length) { location.hash = ''; return; }
  const name = all[0].folder, own = all.filter(b => b.status !== 'sold' && !b.trial), money = sumPaid(own);
  const nSer = new Set(all.map(b => seriesKey(b) || b.id)).size;
  app.innerHTML = `<div class="page" style="padding-left:0;padding-right:0">
    <div style="padding:0 20px">${crumbs([['data-home', '本棚']])}
    <h2 style="margin:4px 0 0;font:700 24px/1.3 var(--serif);color:var(--gold)">${esc(name)}</h2>
    <p class="sub">${nSer}作品・${own.length}冊${money.n ? `・${yen(money.sum)}` : ''}</p>
    <div class="row" style="margin-top:12px;flex-wrap:nowrap"><button class="btn" id="fRename" style="min-height:40px;padding:0 8px;font-size:14px;white-space:nowrap">名前を変える</button><button class="btn danger" id="fUndo" style="min-height:40px;padding:0 8px;font-size:14px;white-space:nowrap">まとまりを解く</button></div></div>
    ${resultsHtml(key)}
  </div>`;
  $('fRename').onclick = () => openPick({ title: 'まとまりの名前', input: { value: name }, onPick: v => { v = String(v).trim(); if (!v) return; putMany(all.map(b => ({ ...b, folder: v }))); go('#f-' + encodeURIComponent(norm(v))); toast('名前を変えました'); } });
  let armed = false;
  $('fUndo').onclick = () => { if (!armed) { armed = true; $('fUndo').textContent = 'もう一度押す'; return; } const before = all.map(b => ({ ...b })); putMany(all.map(b => ({ ...b, folder: '' }))); go(''); toast(`「${name}」を解きました（本はそのままです）`, () => putMany(before)); };
}

/* 書名の後ろに付いたシリーズ名（「○○傑作集」「○○辞典シリーズ」など）から、まとまりの候補を探す */
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
  // 外伝・続編・超合本版など：シリーズ名の頭が同じもの（「作品名」と「作品名 外伝」、「作品名」と「作品名 ACT II」）
  const bySer = new Map(); for (const b of live) if (b.series) { if (!bySer.has(b.series)) bySer.set(b.series, []); bySer.get(b.series).push(b); }
  const names = [...bySer.keys()].sort((a, b) => a.length - b.length);
  for (const a of names) {
    if (nfkc(a).length < 3) continue;
    const kids = names.filter(x => x !== a && x.startsWith(a) && (() => { const rest = x.slice(a.length); return /^[\s　~〜～・:：\-－―─!！×(（]/.test(rest) || /^(超合本|合本|外伝|番外|新装|完全版|愛蔵版|act|ACT|第\d)/.test(rest) || (/^[A-Z]/.test(rest) && !/[A-Za-z]$/.test(a)); })());
    if (!kids.length) continue;
    const bs = [a, ...kids].flatMap(x => bySer.get(x));
    out.push({ name: a, books: bs, sig: bs.map(b => b.id).sort().join(), spin: kids.length + 1 });
  }
  out.sort((x, y) => y.name.length - x.name.length);
  const seen = new Set(); out = out.filter(c => !seen.has(c.sig) && seen.add(c.sig));
  return out.sort((x, y) => y.books.length - x.books.length);
}
$('mFolders').onclick = () => {
  const cands = folderCandidates();
  openBulk({
    title: 'まとまりの候補', action: 'まとめる',
    note: '書名の後ろに同じシリーズ名が付いている本や、「作品名」と「作品名 外伝」のように外伝・続編・合本版と思われるシリーズを集めました。チェックした候補が、それぞれひとつのまとまりになります。名前はあとで変えられます。',
    items: cands.map(c => ({ b: { id: c.sig, title: `${c.name}（${c.books.length}冊）`, isbn: '' }, tag: c.spin ? `${c.spin}シリーズ` : c.books.slice(0, 2).map(b => (b.series || b.title).slice(0, 10)).join('、') + (c.books.length > 2 ? '…' : ''), checked: false, c, key: 'f:' + c.name })), dismiss: 'folder',
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
// 国会図書館に送る書名から「?」「!」などの記号を外す（書名に「?」があると検索がつまずくため）。
// 「ABC'S」のような書名の「'」で単語が割れて「S」だけが残ると見つからなくなるので、1文字だけ残った英字は捨てる
const ndlQ = s => unruby(nfkc(s)).replace(/[?？!！"#$%&'’‘*+\/:;<=>@\\^_`{|}~「」『』【】［］〔〕（）()・、。…]/g, ' ').split(/\s+/).filter(w => w && !/^[A-Za-z]$/.test(w)).join(' ').trim();
// 版の違い（愛蔵版・新装版など）。巻の分け方が変わるので、同じ版どうしでしか結びつけない。探すときは版の言葉を外して作品名で探す
const ED_RE = /(愛蔵版|新装版|完全版|文庫版|新版|改訂版|復刻版|ワイド版|豪華版|デラックス版|DX版|決定版|普及版|総集編|カラー版)/g;
const edKinds = s => [...new Set(nfkc(s || '').match(ED_RE) || [])].sort().join(',');
const stripEd = s => nfkc(s || '').replace(ED_RE, ' ').replace(/[\s　]+/g, ' ').trim();
// 本の種類の言葉（上巻・下巻・ファンブック・ガイドブックなど）。片方にだけあるときは別の本
const KIND_RE = /(上巻|中巻|下巻|ファンブック|ガイドブック|公式ガイド|データブック|設定資料|画集|イラスト集|原画集|ビジュアルブック|キャラクターブック|アンソロジー|ノベライズ|小説版|外伝|番外編|完結記念|記念本|公式本|副読本|ムック|小冊子|シーズンゼロ)/g;
// 【完結記念特典付き】のような売り場の飾りは、本の種類ではないので外してから見る
const kinds = s => [...new Set(nfkc(s || '').replace(/【[^】]*】|［[^］]*］|\[[^\]]*\]|[(（][^()（）]*(?:特典|限定|おまけ|描き下ろし|付き)[^()（）]*[)）]/g, ' ').match(KIND_RE) || [])].sort().join(',');
// 書名全体の似かた（2文字ずつ区切って、どれだけ重なるか。0〜1）
function sim(a, b) {
  a = norm(a); b = norm(b); if (!a || !b) return 0; if (a === b) return 1;
  const bg = s => { const m = new Map(); for (let i = 0; i < s.length - 1; i++) { const k = s.slice(i, i + 2); m.set(k, (m.get(k) || 0) + 1); } return m; };
  const x = bg(a), y = bg(b); let hit = 0, n = 0; for (const [k, v] of x) { n += v; hit += Math.min(v, y.get(k) || 0); } for (const v of y.values()) n += v;
  return n ? 2 * hit / n : 0;
}
// 出版社が同じか（「株式会社」などや、KADOKAWAの旧社名の違いは気にしない）
const pubNorm = p => norm(nfkc(p || '').replace(/株式会社|\(株\)|（株）|有限会社/g, '')).replace(/^(角川書店|角川|エンターブレイン|メディアファクトリー|アスキー・メディアワークス|kadokawa)/, 'kadokawa');
function pubMatch(a, b) { const x = pubNorm(a), y = pubNorm(b); if (!x || !y) return false; return x === y || x.includes(y.slice(0, 4)) || y.includes(x.slice(0, 4)); }
// 「違う」と外した紙の版は覚えておき、次から同じ組み合わせを出さない
const enrichNo = () => lsJson0('hondana.enrichNo', {});
function addReject(id, isbn) { if (!id || !isbn) return; const m = enrichNo(); m[id] = [...new Set([...(m[id] || []), isbn])]; lsSet('hondana.enrichNo', JSON.stringify(m)); }
const rejected = (id, isbn, m = enrichNo()) => !!(m[id] && m[id].includes(isbn));
function cleanForSearch(b) {
  const p = parseSeries(b.title);
  let t = p.series ? `${p.series} ${p.vol}` : nfkc(b.title).replace(/【[^】]*】|［[^］]*］|\[[^\]]*\]/g, ' ').replace(/\s*[(（][^()（）]*[)）]\s*$/, '');
  return { q: t.replace(/\s+/g, ' ').trim(), series: p.series, vol: p.vol, author: authorsOf(b.author)[0] || '' };
}
async function paperCandidates(q) {
  const out = [];
  try {
    const x = await ndlText(`https://ndlsearch.ndl.go.jp/api/opensearch?title=${encodeURIComponent(ndlQ(stripEd(q.series || q.q)))}${q.author ? '&creator=' + encodeURIComponent(q.author.replace(/\s/g, '')) : ''}&cnt=40&mediatype=books`, 9000);
    const d = new DOMParser().parseFromString(x, 'application/xml');
    for (const it of d.querySelectorAll('item')) {
      const g = n => it.getElementsByTagName(n)[0]?.textContent.trim() || '';
      const isbn = [...it.getElementsByTagName('dc:identifier')].map(e => normIsbn(e.textContent)).find(Boolean);
      if (isbn) out.push({ isbn, title: g('dc:title'), vol: g('dcndl:volume'), edition: g('dcndl:edition'), author: g('dc:creator'), publisher: g('dc:publisher'), pubdate: normPubdate(g('dcterms:issued')) });
    }
  } catch (e) {}
  if (!out.length) {
    try {
      const j = await fetchJson(`https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent('intitle:' + ndlQ(stripEd(q.q)) + (q.author ? ' inauthor:' + q.author : ''))}&maxResults=10&printType=books`, 9000);
      for (const it of (j && j.items) || []) {
        const v = it.volumeInfo || {}, isbn = (v.industryIdentifiers || []).map(x => normIsbn(x.identifier)).find(Boolean);
        if (isbn) out.push({ isbn, title: v.title + (v.subtitle ? ' ' + v.subtitle : ''), vol: '', author: (v.authors || []).join('・'), publisher: v.publisher || '', pubdate: normPubdate(v.publishedDate) });
      }
    } catch (e) {}
  }
  return out;
}
// 紙の版の候補が「同じ本」かを見る。sure＝自動で入れてよい、maybe＝確かめてもらう、''＝違う
function judge(b, q, c) {
  const ct = cleanTitle(c.title, c.vol);
  if (rejected(b.id, c.isbn)) return '';
  if (edKinds(b.title) !== edKinds(ct + ' ' + (c.edition || ''))) return ''; // 愛蔵版と普通の版は別
  if (kinds(b.title) !== kinds(ct)) return ''; // 下巻とガイドブック、1巻とファンブックなど
  if (b.boughtAt && c.pubdate && c.pubdate.slice(0, 7) > b.boughtAt.slice(0, 7)) return ''; // 買った日より後に出た本は違う
  const want = norm(stripEd(q.series ? q.series + q.vol : q.q)), got = norm(stripEd(ct));
  const vol = q.vol ? String(q.vol) : '', gp = parseSeries(stripEd(ct));
  const sameVol = !vol || (gp.vol ? String(gp.vol) === vol : got.endsWith(vol));
  const au = q.author && c.author ? norm(c.author).includes(norm(q.author).slice(0, 3)) : true;
  // 著者名のない本（BOOK☆WALKERの本）は、出版社も合っているときだけ自動で入れる。同じ名前の小説と漫画を取り違えないように
  const pubOk = !b.publisher || !c.publisher || pubMatch(b.publisher, c.publisher), strong = q.author ? true : pubMatch(b.publisher, c.publisher);
  if (!au || !pubOk) return '';
  if (got === want || (q.series && gp.series && norm(stripEd(gp.series)) === norm(stripEd(q.series)) && sameVol)) return strong ? 'sure' : 'maybe';
  if ((got.startsWith(want) || want.startsWith(got)) && sameVol && got.length > 1 && sim(got, want) >= 0.6) return 'maybe';
  return '';
}
async function applyPaper(b, c, noLook) {
  const r = noLook ? null : await lookup(c.isbn).catch(() => null), cur = books.get(b.id) || b;
  const nb = { ...cur, pisbn: c.isbn, ptitle: [cleanTitle(c.title, c.vol) || (r && r.title) || '', edKinds(c.edition || '').replace(/,/g, ' ')].filter(Boolean).join(' '), enrichTried: true };
  if (!nb.publisher) nb.publisher = (r && r.publisher) || c.publisher || '';
  if (!nb.pubdate) nb.pubdate = (r && r.pubdate) || c.pubdate || '';
  if (!nb.author) nb.author = (r && r.author) || cleanAuthor(c.author) || '';
  if (!nb.cover && r && r.cover) nb.cover = r.cover;
  const g = (r && r.genre && r.genre !== 'その他') ? r.genre : '';
  if (g && !nb.genreSet) nb.genre = g;
  return nb;
}
$('mEnrich').onclick = () => { closeV('vMenu'); $('enMsg').textContent = ''; $('enList').innerHTML = ''; $('enPrev').hidden = true; updateEnrichInfo(); showMaybes(); openV('vEnrich'); };
// 途中で止めても続きから探せるように：まとめて探し終えたシリーズと、確かめ待ちの候補を覚えておく
const lsJson = lsJson0;
// 前の版で拾った候補も、今の厳しい見分け方で選び直す
const getMaybes = () => lsJson('hondana.enrichMaybe', []).filter(m => { const b = books.get(m.id); return b && !b.pisbn && judge(b, cleanForSearch(b), m.c) !== ''; });
function showMaybes() {
  const ms = getMaybes(); if (!ms.length) { $('enPrev').hidden = true; return; }
  $('enList').innerHTML = ms.map((m, k) => `<label><input type="checkbox" data-k="${k}"><span>${esc(books.get(m.id).title)}<br><span class="note">→ ${esc(cleanTitle(m.c.title, m.c.vol))}・${esc(m.c.publisher || '')} ${esc(jdate(m.c.pubdate))}</span></span></label>`).join('');
  $('enPrev').hidden = false; $('enApply').disabled = false; $('enApply').onclick = async () => {
    // 押したらすぐ入れる（紙のISBN・出版社・出版日）。表紙やジャンルの細かい情報は、そのあと裏で1冊ずつ調べて足す。チェックしなかった候補は「違う」として覚える
    const boxes = [...$('enList').querySelectorAll('input')], pick = boxes.filter(x => x.checked).map(x => ms[+x.dataset.k]).filter(m => books.has(m.id));
    boxes.filter(x => !x.checked).forEach(x => { const m = ms[+x.dataset.k]; addReject(m.id, m.c.isbn); });
    $('enApply').disabled = true; const up = [];
    for (const m of pick) up.push(await applyPaper(books.get(m.id), m.c, true));
    if (up.length) putMany(up); lsSet('hondana.enrichMaybe', '[]'); $('enPrev').hidden = true; toast(up.length ? `${up.length}冊に紙の版の情報を入れました。表紙などは裏で調べて足していきます` : '候補を外しました。次からは出しません');
    const buf = [];
    for (const m of pick) { const b = books.get(m.id); if (!b) continue; buf.push(await applyPaper(b, m.c)); if (buf.length >= 10) putMany(buf.splice(0)); }
    if (buf.length) putMany(buf);
  };
}
// 持っている本を先に、お試しの本はあとで探す
function enrichTargets(again) { const l = [...books.values()].filter(b => b.format !== '紙' && !b.isbn && !b.pisbn && b.title && b.status !== 'sold' && (again || !b.enrichTried)); return [...l.filter(b => !b.trial), ...l.filter(b => b.trial)]; }
function updateEnrichInfo() {
  const l = enrichTargets(false), n = l.length, nt = l.filter(b => b.trial).length, m = enrichTargets(true).length;
  $('enInfo').textContent = `まだ調べていない電子書籍：${n}冊${nt ? `（うちお試し${nt}冊は最後に探します）` : ''}。調べたが見つからなかった本も含めると${m}冊`; $('enGo').disabled = !n;
}
$('enGo').onclick = () => runEnrich(false);
$('enAgain').onclick = () => runEnrich(true);
$('enStop').onclick = () => { if (enrichRun) enrichRun.stop = true; };
// シリーズの巻をまとめて1回で探す：国会図書館にシリーズ名で問い合わせ、返ってきた巻ごとの紙のISBNを配る
async function seriesPaper(series, author, sample) {
  const out = new Map(), ed = edKinds(series + ' ' + (sample || '')), want = norm(stripEd(series)), kd = kinds(series);
  try {
    const x = await ndlText(`https://ndlsearch.ndl.go.jp/api/opensearch?title=${encodeURIComponent(ndlQ(stripEd(series)))}${author ? '&creator=' + encodeURIComponent(author.replace(/\s/g, '')) : ''}&cnt=200&mediatype=books`, 15000);
    const d = new DOMParser().parseFromString(x, 'application/xml');
    for (const it of d.querySelectorAll('item')) {
      const g = n => it.getElementsByTagName(n)[0]?.textContent.trim() || '';
      const isbn = [...it.getElementsByTagName('dc:identifier')].map(e => normIsbn(e.textContent)).find(Boolean); if (!isbn) continue;
      const title = cleanTitle(g('dc:title')), vtxt = nfkc(g('dcndl:volume')), ps = parseSeries(stripEd(title) + (vtxt && !/\d\s*$/.test(nfkc(title)) ? ' ' + vtxt : ''));
      const vol = parseInt((vtxt.match(/\d+/) || [])[0] || ps.vol || 0, 10), name = norm(stripEd(ps.series || title));
      if (!vol || name !== want) continue; // 外伝や別シリーズ（「作品名 外伝」など）はまぜない
      if (edKinds(g('dc:title') + ' ' + g('dcndl:edition')) !== ed || kinds(title) !== kd) continue; // 愛蔵版と普通の版、ガイドブックなどはまぜない
      if (!out.has(vol)) out.set(vol, []); out.get(vol).push({ isbn, title: g('dc:title'), vol: String(vol), edition: g('dcndl:edition'), author: g('dc:creator'), publisher: g('dc:publisher'), pubdate: normPubdate(g('dcterms:issued')) });
    }
  } catch (e) {}
  return out;
}
async function runEnrich(again) {
  if (enrichRun) return;
  const all = enrichTargets(again); if (!all.length) return;
  enrichRun = { stop: false }; const maybes = getMaybes(), buf = []; let sure = 0, none = 0;
  if (again) lsSet('hondana.enrichSer', '[]');
  const serDone = new Set(lsJson('hondana.enrichSer', [])), saveSer = () => lsSet('hondana.enrichSer', JSON.stringify([...serDone]));
  const saveMaybes = () => lsSet('hondana.enrichMaybe', JSON.stringify(maybes.map(m => ({ id: m.id || m.b.id, c: m.c }))));
  $('enGo').disabled = true; $('enAgain').disabled = true; $('enStop').hidden = false; $('enPrev').hidden = true;
  const flush = () => { if (buf.length) { putMany(buf.splice(0)); } };
  const noMap = enrichNo();
  // 持っている本を先に、そのあとお試しの本を、同じやり方で探す
  for (const [label, list] of [['', all.filter(b => !b.trial)], ['お試しの本：', all.filter(b => b.trial)]]) {
    if (enrichRun.stop || !list.length) continue;
    // 1) 2冊以上あるシリーズは、シリーズごとにまとめて探す（1冊ずつより何倍も速い）
    const bySer = new Map(); list.forEach(b => { if (b.series && b.vol) { const k = seriesKey(b) + (b.trial ? '|t' : ''); if (!bySer.has(k)) bySer.set(k, []); bySer.get(k).push(b); } });
    const sers = [...bySer.entries()].filter(([k, bs]) => bs.length >= 2 && !serDone.has(k)).map(([k, bs]) => (bs.key = k, bs)), done = new Set(); let si = 0;
    for (const bs of sers) {
      if (enrichRun.stop) break; si++;
      $('enMsg').textContent = `${label}シリーズごとに探しています ${si}／${sers.length}：${bs[0].series.slice(0, 20)}（見つかった ${sure}冊）`;
      const au = authorsOf(bs.find(b => b.author)?.author)[0] || '', byVol = await seriesPaper(bs[0].series, au, bs[0].title); serDone.add(bs.key); if (si % 5 === 0) saveSer();
      for (const b of bs) {
        const c0 = (byVol.get(+b.vol) || []).filter(c => !rejected(b.id, c.isbn, noMap) && !(b.boughtAt && c.pubdate && c.pubdate.slice(0, 7) > b.boughtAt.slice(0, 7)));
        if (!c0.length) continue;
        const pm = c0.find(c => b.publisher && c.publisher && pubMatch(b.publisher, c.publisher));
        // 著者名がない本は、出版社が合う候補だけ。著者名がある本は、出版社が合う候補を優先
        const c = au ? (pm || c0[0]) : pm; if (!c) continue;
        buf.push(await applyPaper(books.get(b.id) || b, c, true)); sure++; done.add(b.id);
      }
      if (buf.length >= 15) flush();
      await sleep(400);
    }
    flush(); saveSer();
    // 2) 残りは1冊ずつ
    const rest = enrichRun.stop ? [] : list.filter(b => !done.has(b.id)); let i = 0;
    for (const b of rest) {
      if (enrichRun.stop) break; i++;
      $('enMsg').textContent = `${label}${i}／${rest.length}冊目：${b.title.slice(0, 24)}…（見つかった ${sure}冊・確認が必要 ${maybes.length}冊）`;
      const q = cleanForSearch(b); let cands = await paperCandidates(q);
      // 書名の後ろにシリーズ名が付いていて見つからないときは、最初のまとまりだけでもう一度
      if (!cands.length && !q.series) { const first = q.q.split(' ')[0]; if (first.length >= 3 && first !== q.q) { q.q = first; cands = await paperCandidates(q); } }
      let best = null, how = '';
      for (const c of cands) { const j2 = judge(b, q, c); if (j2 === 'sure') { best = c; how = 'sure'; break; } if (j2 === 'maybe' && !best) { best = c; how = 'maybe'; } }
      if (how === 'sure') { buf.push(await applyPaper(b, best)); sure++; }
      else if (how === 'maybe') { maybes.push({ id: b.id, c: best }); saveMaybes(); buf.push({ ...(books.get(b.id) || b), enrichTried: true }); }
      else { none++; buf.push({ ...(books.get(b.id) || b), enrichTried: true }); }
      if (buf.length >= 15) flush();
      await sleep(250);
    }
    flush();
  }
  const stopped = enrichRun.stop; enrichRun = null; $('enStop').hidden = true; $('enAgain').disabled = false; updateEnrichInfo();
  $('enMsg').textContent = `${stopped ? '途中で止めました。' : '終わりました。'}${sure}冊に紙の版の情報を入れました。見つからなかった本：${none}冊。${maybes.length ? `下の${maybes.length}冊は、似た本が見つかったので確かめてください。` : ''}`;
  saveMaybes(); showMaybes(); setTimeout(fillAuthors, 300);
}
// 自動で入れた紙の版を見直す：紙の版の書名を（覚えていなければ openBD にまとめて）調べ、あやしいものだけ並べる
async function reviewPaper() {
  const list = [...books.values()].filter(b => b.pisbn && b.format !== '紙'); if (!list.length) { toast('紙の版を入れた電子書籍はまだありません'); return; }
  $('enReview').disabled = true; const need = list.filter(b => !b.ptitle), info = new Map();
  for (let i = 0; i < need.length; i += 100) {
    $('enMsg').textContent = `紙の版の書名を調べています ${Math.min(i + 100, need.length)}／${need.length}冊`;
    try { const j = await fetchJson('https://api.openbd.jp/v1/get?isbn=' + need.slice(i, i + 100).map(b => b.pisbn).join(','), 20000);
      (j || []).forEach(it => { if (it && it.summary) info.set(nfkc(it.summary.isbn || '').replace(/\D/g, ''), { title: cleanTitle(it.summary.title, it.summary.volume), pubdate: normPubdate(it.summary.pubdate), publisher: it.summary.publisher || '' }); }); } catch (e) {}
    await sleep(200);
  }
  const keep = [], items = [];
  for (const b of list) {
    const p = b.ptitle ? { title: b.ptitle } : info.get(b.pisbn); if (!p || !p.title) continue;
    if (!b.ptitle) keep.push({ ...b, ptitle: p.title });
    const why = [], pv = parseSeries(stripEd(p.title)).vol;
    if (kinds(b.title) !== kinds(p.title)) why.push('本の種類が違う');
    { const e1 = edKinds(b.title), e2 = edKinds(p.title); if (e2 && e1 !== e2) why.push('版が違う'); } // 紙の書名に版の言葉がないときは、書名に書かれていないだけかもしれないので見送る
    if (b.vol && pv && +b.vol !== +pv) why.push('巻数が違う');
    if (p.pubdate && b.boughtAt && p.pubdate.slice(0, 7) > b.boughtAt.slice(0, 7)) why.push('買った日より後に出た本');
    const s1 = norm(stripEd(parseSeries(b.title).series || b.title)), s2 = norm(stripEd(parseSeries(p.title).series || p.title));
    if (s1 && s2 && !s1.includes(s2) && !s2.includes(s1) && sim(s1, s2) < 0.4) why.push('書名があまり似ていない');
    if (why.length) items.push({ b, label: `${b.title} → ${p.title}`, tag: why.join('・'), checked: true, p });
  }
  if (keep.length) putMany(keep);
  $('enReview').disabled = false; $('enMsg').textContent = items.length ? '' : `${list.length}冊を見直しました。あやしいものはありませんでした。`;
  if (!items.length) return;
  closeV('vEnrich');
  openBulk({
    title: '紙の版を見直す', action: '紙の版を外す',
    note: `自動で入れた紙の版のうち、違う本かもしれないものを${items.length}冊並べました。合っているものはチェックを外してください。チェックしたものは紙の版を外し、次から同じ本を結びつけません。`,
    items,
    run: sel => {
      const up = sel.map(b => { const cur = books.get(b.id) || b, it = items.find(x => x.b.id === b.id); addReject(b.id, cur.pisbn);
        const nb = { ...cur, pisbn: '', ptitle: '', enrichTried: true };
        if (it && it.p.pubdate && cur.pubdate === it.p.pubdate) nb.pubdate = '';
        if (cur.cover && cur.cover.includes(cur.pisbn)) nb.cover = '';
        workUrl.delete(b.id); return nb; });
      putMany(up); toast(`${up.length}冊の紙の版を外しました`);
    },
  });
}
$('enReview').onclick = () => reviewPaper();
// 紙の本でISBNがわからないとき：入れてある書名・作者・出版社で探して、候補から選ぶ
async function findIsbn(b) {
  const q = cleanForSearch(b); q.q = stripEd(q.q) || q.q;
  let cands = await paperCandidates({ ...q, series: '' });
  if (!cands.length && q.author) cands = await paperCandidates({ ...q, series: '', author: '' });
  const want = norm(b.title);
  const score = c => (sim(cleanTitle(c.title, c.vol), b.title) * 50) + (b.publisher && pubMatch(b.publisher, c.publisher) ? 30 : 0) + (b.pubdate && c.pubdate ? (c.pubdate.slice(0, 7) === b.pubdate.slice(0, 7) ? 40 : c.pubdate.slice(0, 4) === b.pubdate.slice(0, 4) ? 15 : 0) : 0) + (q.vol && parseSeries(cleanTitle(c.title, c.vol)).vol === q.vol ? 20 : 0);
  return [...new Map(cands.map(c => [c.isbn, c])).values()].map(c => ({ c, s: score(c) })).filter(x => x.s >= 20 || norm(cleanTitle(x.c.title)).includes(want.slice(0, 4))).sort((a, b) => b.s - a.s).slice(0, 8).map(x => x.c);
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

$('fPaid').addEventListener('input', () => { $('fPaid').dataset.auto = ''; });

/* ---------- 背景を飾る ---------- */
// 背景の写真は表紙の写真と同じ IndexedDB に '__bg' という名前で入れる（本のidとは重ならない）
let bgUrl = '';
const bgDim = () => +(lsGet('hondana.bgDim', '75')) / 100;
function applyBg() {
  document.body.classList.toggle('hasbg', !!bgUrl);
  document.documentElement.style.setProperty('--dim', bgDim());
  $('bgImg').style.backgroundImage = bgUrl ? `url("${bgUrl}")` : '';
  $('bgPrev').style.backgroundImage = bgUrl ? `url("${bgUrl}")` : ''; $('bgNone').hidden = !!bgUrl; $('bgOff').hidden = !bgUrl;
}
async function shrinkImage(file, max = 1600) { // 大きすぎる写真は縮めてから保存する
  const bmp = await createImageBitmap(file), sc = Math.min(1, max / Math.max(bmp.width, bmp.height)), cv = document.createElement('canvas');
  cv.width = Math.round(bmp.width * sc); cv.height = Math.round(bmp.height * sc); cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height);
  return await new Promise(r => cv.toBlob(r, 'image/jpeg', .85));
}
$('mBg').onclick = () => { closeV('vMenu'); $('bgDim').value = Math.round(bgDim() * 100); applyBg(); openV('vBg'); };
$('bgDim').oninput = () => { lsSet('hondana.bgDim', $('bgDim').value); applyBg(); };
$('bgIn').onchange = async () => {
  const f = $('bgIn').files[0]; $('bgIn').value = ''; if (!f) return;
  try { const blob = await shrinkImage(f); await idb.put('__bg', blob); if (bgUrl) URL.revokeObjectURL(bgUrl); bgUrl = URL.createObjectURL(blob); applyBg(); toast('背景にしました'); }
  catch (e) { toast('この写真は読み込めませんでした'); }
};
$('bgOff').onclick = async () => { try { await idb.del('__bg'); } catch (e) {} if (bgUrl) URL.revokeObjectURL(bgUrl); bgUrl = ''; applyBg(); toast('背景を外しました'); };

/* ---------- 書名・定価をまとめて調べ直す ---------- */
// ISBNはあるのに書名が空の本、定価が空の紙の本を、もう一度調べる（空いているところだけ埋める）
const needsLook = b => b.isbn && (!b.title || (b.format === '紙' && b.listPrice == null));
function relookTargets(again) { return [...books.values()].filter(b => needsLook(b) && (again || !b.relookAt)); }
function fillFromLookup(b, r) {
  const nb = bookFromLookup(b.isbn, r), out = { ...b, relookAt: Date.now() };
  if (!b.title && nb.title) { out.title = nb.title; if (!b.series && nb.series) { out.series = nb.series; out.vol = nb.vol; } }
  for (const k of ['author', 'publisher', 'pubdate', 'cover']) if (!b[k] && nb[k]) out[k] = nb[k];
  if (!b.genreSet && (!b.genre || b.genre === 'その他') && nb.genre && nb.genre !== 'その他') out.genre = nb.genre;
  if (b.listPrice == null && nb.listPrice != null) out.listPrice = nb.listPrice; // 買った値段は、いつ買ったか（消費税）が分からないので入れない
  return out;
}
let relookRun = null;
$('mRelook').onclick = () => { closeV('vMenu'); $('rlMsg').textContent = ''; updateRelookInfo(); openV('vRelook'); };
function updateRelookInfo() {
  const n = relookTargets(false), m = relookTargets(true), nt = m.filter(b => !b.title).length;
  $('rlInfo').textContent = `調べ直す本：${n.length}冊（書名がない本 ${nt}冊をふくむ）${m.length > n.length ? `。前に調べて見つからなかった本も入れると${m.length}冊` : ''}`;
  $('rlGo').disabled = !n.length; $('rlAgain').hidden = m.length === n.length;
}
$('rlGo').onclick = () => runRelook(false);
$('rlAgain').onclick = () => runRelook(true);
$('rlStop').onclick = () => { if (relookRun) relookRun.stop = true; };
async function runRelook(again) {
  if (relookRun) return; const list = relookTargets(again); if (!list.length) return;
  relookRun = { stop: false }; ndlPatient = true; const buf = []; let got = 0, price = 0, none = 0, i = 0;
  $('rlGo').disabled = true; $('rlAgain').disabled = true; $('rlStop').hidden = false;
  for (const b0 of list) {
    if (relookRun.stop) break; i++; const b = books.get(b0.id); if (!b) continue;
    $('rlMsg').textContent = `${i}／${list.length}冊目：${(b.title || 'ISBN ' + b.isbn).slice(0, 24)}…（埋まった ${got}冊・定価 ${price}冊）`;
    lookCache.delete(b.isbn); let r = null; try { r = await lookup(b.isbn); } catch (e) {}
    if (r) { const nb = fillFromLookup(b, r); if (!b.title && nb.title) got++; if (b.listPrice == null && nb.listPrice != null) price++; buf.push(nb); }
    else { none++; buf.push({ ...b, relookAt: Date.now() }); }
    if (buf.length >= 10) putMany(buf.splice(0));
    await sleep(600);
  }
  if (buf.length) putMany(buf.splice(0));
  const stopped = relookRun.stop; relookRun = null; ndlPatient = false; $('rlStop').hidden = true; $('rlAgain').disabled = false; updateRelookInfo();
  $('rlMsg').textContent = `${stopped ? '途中で止めました。' : '終わりました。'}書名が入った本 ${got}冊、定価が入った本 ${price}冊。見つからなかった本 ${none}冊。${none ? '調べ先が混んでいる日もあるので、日を改めて「もう一度」を押すと埋まることがあります。' : ''}`;
}

/* ---------- 作者名を借りる ---------- */
// BOOK☆WALKERの本には作者名がない。同じ本（同じシリーズの同じ巻・同じ書名）をKindleや紙で持っていれば、そこから作者名を借りる。
// 同じ巻がなくても、同じシリーズに作者名の入った巻があれば借りる
function fillAuthors() {
  const ix = new Map(), bySer = new Map();
  for (const x of books.values()) if (x.author) { const k = sibKey(x); if (k.length > 2 && !ix.has(k)) ix.set(k, x.author); if (x.series && !bySer.has(seriesKey(x))) bySer.set(seriesKey(x), x.author); }
  const up = []; for (const b of books.values()) if (!b.author) { const a = ix.get(sibKey(b)) || (b.series && bySer.get(seriesKey(b))); if (a) up.push({ ...b, author: a }); }
  if (up.length) putMany(up); return up.length;
}
/* ---------- シリーズをまとめ直す ---------- */
function regroup(onlyAuto) {
  const out = [];
  for (const b of books.values()) {
    const p = parseSeries(b.title);
    // 前の読み方で「1」のような数字だけのシリーズにされていた本（書名が数字だけの本など）は、シリーズから外す
    if (!p.series) { if (onlyAuto === 'empty' && /^\d{1,2}$/.test(nfkc(b.series || '').trim())) out.push({ ...b, series: '', vol: null }); continue; }
    if (onlyAuto === 'empty' ? (b.series && !/^[\d\s]+$/.test(nfkc(b.series)) && !EDITION_ONLY.test(b.series)) : onlyAuto && !b.asin) continue;
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
(async () => {
load();
// IndexedDB に引っ越し済み（または localStorage が空でそちらにある）ときは、そちらから読む
if (inIdb() || !books.size) { const ok = await loadFromIdb(); if (ok && !inIdb()) lsSet('hondana.store', 'idb'); }
if (lsGet('hondana.regroupVer', '') !== '2') { lsSet('hondana.regroupVer', '2'); setTimeout(() => { const n = regroup(true); if (n) toast(`Kindleの本 ${n}冊をシリーズにまとめ直しました`); }, 0); }
if (lsGet('hondana.rubyFix', '') !== '1') { lsSet('hondana.rubyFix', '1'); setTimeout(() => { const up = [...books.values()].filter(b => b.series && /[（(][ぁ-ゖァ-ヺー・ 　]{1,12}[)）]/.test(nfkc(b.series)) && unruby(nfkc(b.series)) !== nfkc(b.series)).map(b => ({ ...b, series: unruby(nfkc(b.series)).trim() })); if (up.length) { putMany(up); toast(`読み仮名の入ったシリーズ名 ${up.length}冊分をそろえました`); } }, 150); }
if (lsGet('hondana.freeTrial', '') !== '1') { lsSet('hondana.freeTrial', '1'); setTimeout(() => { const up = [...books.values()].filter(b => !b.trial && b.status !== 'sold' && b.format !== '紙' && FREE_TITLE.test(nfkc(b.title))).map(b => ({ ...b, trial: true })); if (up.length) { putMany(up); toast(`書名に「無料」「お試し版」とある電子書籍 ${up.length}冊を、お試しにしました`); } }, 100); }
if (lsGet('hondana.regroupVer3', '') !== '1') { lsSet('hondana.regroupVer3', '1'); setTimeout(() => { const n = regroup('empty'); if (n) toast(`シリーズに入っていなかった本 ${n}冊を、シリーズにまとめました`); }, 50); }
render();
idb.all().then(m => { for (const [k, blob] of m) { if (books.has(k)) photos.set(k, URL.createObjectURL(blob)); } sibIx = null; if (m.has('__bg')) { bgUrl = URL.createObjectURL(m.get('__bg')); applyBg(); } if (m.size) render(); }).catch(() => {});
setTimeout(() => purgeTrash().catch(() => {}), 3000);
setTimeout(fillAuthors, 400);
// 「作品名 1 1」のように巻数が2回並んだ書名（出版社の登録ミス）を、1回だけ直す
if (lsGet('hondana.dupVolFix', '') !== '1') { lsSet('hondana.dupVolFix', '1'); setTimeout(() => {
  const up = []; for (const b of books.values()) { const t = nfkc(b.title || '').trim(), m = t.match(/(\d{1,4})\s+\1$/); if (!m) continue;
    const nt = t.replace(/(\d{1,4})\s+\1$/, '$1'), old = parseSeries(t), p = parseSeries(nt), auto = !b.series || norm(b.series) === norm(old.series) || norm(t).startsWith(norm(b.series));
    up.push({ ...b, title: nt, ...(auto && p.series ? { series: p.series, vol: p.vol } : {}) }); }
  if (up.length) { putMany(up); toast(`巻数が2回並んでいた書名 ${up.length}冊を直しました`); } }, 250); }
try { navigator.storage?.persist?.(); } catch (e) {}
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
window.addEventListener('storage', e => { if (e.key === KEY) { load(); render(); } });
})();
window.__hondana = { books: () => [...books.values()], putMany, onJan, openScanTest: () => openV("vScan"), coverCands, parseSeries, genreFromC, priceCode, photos, noCov };
}
