// Học liệu: danh mục + danh sách tài liệu/video (JSON trong kho chung) và tệp tải lên (Azure Blob, container riêng).
// Học viên CHỈ ĐƯỢC XEM: không có đường tải xuống; tệp phát qua đường dẫn có chữ ký, hết hạn sau ít giờ.
const crypto = require("crypto");
const { cfg } = require("./config");
const store = require("./store");

const INDEX = "hoclieu/index.json";
const VOTES = "hoclieu/votes.json"; // { items: { <id>: { u: {<mã NV>: thời điểm}, d: {<mã NV>: thời điểm}, r: {<mã NV>: lí do} } } }
const REASONS = { hard: "Khó hiểu", old: "Thông tin cũ / chưa đúng", irrelevant: "Không liên quan đến công việc", broken: "Lỗi hiển thị", long: "Quá dài" };
const DEFAULT_CATS = [
  { id: "sp", name: "Kiến thức sản phẩm", icon: "box" },
  { id: "kn", name: "Kỹ năng bán hàng", icon: "chart" },
  { id: "qt", name: "Quy trình & chính sách", icon: "doc" },
  { id: "vd", name: "Video & Microlearning", icon: "play" },
  { id: "on", name: "Tài liệu ôn tập", icon: "bookmark" }
];
const ICONS = ["box", "chart", "doc", "play", "bookmark", "book", "target", "star"];
const TYPES = ["video", "pdf"];
const SRC_KINDS = ["upload", "youtube", "vimeo", "gdrive", "url"];
const LIM = { video: 300 * 1024 * 1024, pdf: 80 * 1024 * 1024, thumb: 4 * 1024 * 1024 };

const clip = (v, n) => String(v == null ? "" : v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim().slice(0, n);
const rid = (n) => crypto.randomBytes(n || 6).toString("hex");

async function load() {
  const d = (await store.get(INDEX)) || {};
  return { categories: Array.isArray(d.categories) && d.categories.length ? d.categories : DEFAULT_CATS.slice(), items: Array.isArray(d.items) ? d.items : [] };
}
function cleanCats(list) {
  const seen = new Set(), out = [];
  (Array.isArray(list) ? list : []).slice(0, 30).forEach((c) => {
    const name = clip(c && c.name, 60); if (!name) return;
    let id = clip(c && c.id, 20).replace(/[^a-z0-9_-]/gi, "") || "c" + rid(3);
    while (seen.has(id)) id = "c" + rid(3);
    seen.add(id);
    out.push({ id, name, icon: ICONS.indexOf(c.icon) >= 0 ? c.icon : "doc" });
  });
  return out.length ? out : DEFAULT_CATS.slice();
}

// ---- liên kết ngoài -> nguồn phát chuẩn hoá ----
function parseLink(raw, type) {
  const url = clip(raw, 600);
  if (!/^https:\/\//i.test(url)) return null;
  let u; try { u = new URL(url); } catch (e) { return null; }
  const h = u.hostname.replace(/^www\./, "").toLowerCase();
  if (h === "youtu.be" || h === "youtube.com" || h === "m.youtube.com" || h === "youtube-nocookie.com") {
    let id = h === "youtu.be" ? u.pathname.slice(1) : (u.searchParams.get("v") || (u.pathname.match(/\/(?:embed|shorts|live)\/([\w-]{6,})/) || [])[1] || "");
    id = String(id).replace(/[^\w-]/g, "").slice(0, 20);
    if (id.length >= 6) return { kind: "youtube", id };
    return null;
  }
  if (h === "vimeo.com" || h === "player.vimeo.com") {
    const m = u.pathname.match(/(\d{5,})/); if (m) return { kind: "vimeo", id: m[1] };
    return null;
  }
  if (h === "drive.google.com") {
    const m = u.pathname.match(/\/file\/d\/([\w-]{10,})/) || [null, u.searchParams.get("id")];
    if (m[1] && /^[\w-]{10,}$/.test(m[1])) return { kind: "gdrive", id: m[1] };
    return null;
  }
  if (type === "video" && /\.(mp4|webm|m4v)(\?|$)/i.test(u.pathname + u.search)) return { kind: "url", url };
  if (type === "pdf" && /\.pdf(\?|$)/i.test(u.pathname + u.search)) return { kind: "url", url };
  return null;
}

function cleanItem(raw, old) {
  const b = raw || {};
  const type = TYPES.indexOf(b.type) >= 0 ? b.type : (old && old.type) || "video";
  const title = clip(b.title, 150); if (!title) return { error: "Vui lòng nhập tiêu đề." };
  const it = {
    id: (old && old.id) || "h" + Date.now().toString(36) + rid(3),
    title, desc: clip(b.desc, 600), cat: clip(b.cat, 20), type,
    dur: Math.max(0, Math.min(1000, Math.round(Number(b.dur) || 0))),
    pages: Math.max(0, Math.min(5000, Math.round(Number(b.pages) || 0))),
    featured: !!b.featured, status: b.status === "draft" ? "draft" : "published",
    views: (old && old.views) || 0,
    exams: Array.isArray(b.exams) ? cleanExamIds(b.exams) : ((old && old.exams) || []),
    createdAt: (old && old.createdAt) || Date.now(), updatedAt: Date.now()
  };
  // nguồn
  const s = b.source || {};
  if (s.kind === "upload") {
    const keep = old && old.source && old.source.kind === "upload" ? old.source : null;
    const blob = clip(s.blob, 80);
    if (!/^f\/[a-f0-9]{16,}$/.test(blob)) return { error: "Chưa có tệp đã tải lên." };
    it.source = { kind: "upload", blob, mime: clip(s.mime, 60), size: Math.max(0, Number(s.size) || 0), name: clip(s.name, 120) };
    if (keep && keep.blob !== blob) it._drop = [keep.blob];
  } else {
    const p = parseLink(s.url, type);
    if (!p) return { error: type === "video" ? "Liên kết video chưa đúng. Dùng link YouTube, Vimeo, Google Drive hoặc tệp .mp4 (https)." : "Liên kết tài liệu chưa đúng. Dùng link Google Drive hoặc tệp .pdf (https)." };
    it.source = Object.assign({ link: clip(s.url, 600) }, p);
    if (old && old.source && old.source.kind === "upload") it._drop = [old.source.blob];
  }
  // ảnh bìa
  const t = b.thumb || {};
  if (t.kind === "upload" && /^f\/[a-f0-9]{16,}$/.test(clip(t.blob, 80))) {
    it.thumb = { kind: "upload", blob: clip(t.blob, 80), mime: clip(t.mime, 40) };
    if (old && old.thumb && old.thumb.kind === "upload" && old.thumb.blob !== it.thumb.blob) (it._drop = it._drop || []).push(old.thumb.blob);
  } else if (t.kind === "url" && /^https:\/\//i.test(clip(t.url, 600))) {
    it.thumb = { kind: "url", url: clip(t.url, 600) };
    if (old && old.thumb && old.thumb.kind === "upload") (it._drop = it._drop || []).push(old.thumb.blob);
  } else {
    if (old && old.thumb && old.thumb.kind === "upload") (it._drop = it._drop || []).push(old.thumb.blob);
  }
  return { item: it };
}

// Mã bài kiểm tra gắn với học liệu (tài liệu ôn tập cho bài đó)
function cleanExamIds(list) {
  const out = [];
  (list || []).forEach((x) => { const id = clip(x, 40); if (/^[\w.-]{1,40}$/.test(id) && out.indexOf(id) < 0) out.push(id); });
  return out.slice(0, 30);
}
// ---- thích / không thích ----
async function loadVotes() { const v = (await store.get(VOTES)) || {}; return v.items && typeof v.items === "object" ? v.items : {}; }
function voteOf(all, id, code) {
  const v = all[id] || {}, u = v.u || {}, d = v.d || {}, k = String(code || "").toUpperCase();
  return { up: Object.keys(u).length, down: Object.keys(d).length, mine: k ? (u[k] ? "up" : d[k] ? "down" : "") : "" };
}
function reasonsOf(all, id) {
  const r = (all[id] || {}).r || {}, d = (all[id] || {}).d || {}, out = {};
  Object.keys(d).forEach((k) => { const x = r[k]; if (x && REASONS[x]) out[x] = (out[x] || 0) + 1; });
  return out;
}

// ---- chữ ký đường dẫn phát tệp ----
function sig(id, exp) { return crypto.createHmac("sha256", cfg().secret || "x").update("hl:" + id + ":" + exp).digest("base64url").slice(0, 22); }
function token(id, ttlMs) { const exp = Date.now() + (ttlMs || 3 * 3600 * 1000); return exp + "." + sig(id, exp); }
function tokenOk(id, t) {
  const m = String(t || "").match(/^(\d{10,16})\.([\w-]{10,40})$/); if (!m) return false;
  const exp = Number(m[1]); if (!(exp > Date.now())) return false;
  const a = Buffer.from(m[2]), b = Buffer.from(sig(id, exp));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// ---- tệp (Azure Blob container "livotec-hoclieu"; chế độ memory khi chạy thử) ----
const mem = new Map();
let contP = null;
function container() {
  if (!contP) contP = (async () => {
    const { BlobServiceClient } = require("@azure/storage-blob");
    const c = BlobServiceClient.fromConnectionString(cfg().conn).getContainerClient("livotec-hoclieu");
    await c.createIfNotExists(); return c;
  })().catch((e) => { contP = null; throw e; });
  return contP;
}
const blockId = (i) => Buffer.from(String(i).padStart(6, "0")).toString("base64");
async function stage(name, idx, buf) {
  if (cfg().storageMode === "memory") { const m = mem.get(name) || { parts: {}, done: null }; m.parts[idx] = buf; mem.set(name, m); return; }
  const c = await container(); await c.getBlockBlobClient(name).stageBlock(blockId(idx), buf, buf.length);
}
async function commit(name, count, mime) {
  if (cfg().storageMode === "memory") { const m = mem.get(name); const bufs = []; for (let i = 0; i < count; i++) bufs.push(m.parts[i]); m.done = { buf: Buffer.concat(bufs), mime }; m.parts = {}; return m.done.buf.length; }
  const c = await container(), b = c.getBlockBlobClient(name);
  const ids = []; for (let i = 0; i < count; i++) ids.push(blockId(i));
  await b.commitBlockList(ids, { blobHTTPHeaders: { blobContentType: mime } });
  return (await b.getProperties()).contentLength;
}
async function head(name) {
  if (cfg().storageMode === "memory") { const m = mem.get(name); return m && m.done ? { size: m.done.buf.length, mime: m.done.mime } : null; }
  const c = await container();
  try { const p = await c.getBlockBlobClient(name).getProperties(); return { size: p.contentLength, mime: p.contentType || "application/octet-stream" }; } catch (e) { if (e && (e.statusCode === 404 || e.code === "BlobNotFound")) return null; throw e; }
}
async function readRange(name, start, count) {
  if (cfg().storageMode === "memory") { const m = mem.get(name); return Buffer.from(m.done.buf.subarray(start, start + count)); }
  const c = await container(); const b = c.getBlockBlobClient(name);
  return b.downloadToBuffer(Buffer.alloc(count), start, count);
}
async function drop(names) {
  for (const n of names || []) {
    if (!/^f\/[a-f0-9]{16,}$/.test(n)) continue;
    try {
      if (cfg().storageMode === "memory") mem.delete(n); else { const c = await container(); await c.getBlockBlobClient(n).deleteIfExists(); }
    } catch (e) { /* bỏ qua */ }
  }
}

function magicOk(kind, buf, mime) {
  if (!buf || buf.length < 12) return false;
  if (kind === "pdf") return buf.subarray(0, 5).toString("latin1") === "%PDF-";
  if (kind === "thumb") return (buf[0] === 0xff && buf[1] === 0xd8) || buf.subarray(1, 4).toString("latin1") === "PNG" || (buf.subarray(0, 4).toString("latin1") === "RIFF" && buf.subarray(8, 12).toString("latin1") === "WEBP");
  if (kind === "video") return buf.subarray(4, 8).toString("latin1") === "ftyp" || (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3);
  return false;
}
const MIME = { video: ["video/mp4", "video/webm"], pdf: ["application/pdf"], thumb: ["image/jpeg", "image/png", "image/webp"] };

module.exports = { VOTES, REASONS, loadVotes, voteOf, reasonsOf, cleanExamIds, load, cleanCats, cleanItem, parseLink, token, tokenOk, stage, commit, head, readRange, drop, magicOk, MIME, LIM, INDEX, DEFAULT_CATS, rid, clip };
