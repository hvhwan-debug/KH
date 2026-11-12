// Sổ ghi cho phần Gửi thông báo:
//  1) LỊCH SỬ NHẮC theo từng đề + từng người (đã nhắc mấy lần, lần cuối khi nào, qua kênh nào);
//  2) GIỚI HẠN TẦN SUẤT: mỗi người tối đa CAP_PER_DAY thư/ngày/đề và cách nhau ít nhất CAP_GAP_MS (thông báo kết quả được miễn);
//  3) BÁO CÁO TỪNG ĐỢT GỬI (ai nhận được, ai lỗi / bị bỏ qua / bị giới hạn) để đối chiếu sau này;
//  4) MẪU DÙNG CHUNG lưu trên máy chủ (trước đây chỉ lưu trong trình duyệt của từng người).
// Mọi hàm ghi dùng store.update (khoá ETag) nên nhiều người cùng gửi không ghi đè nhau. Lỗi sổ ghi KHÔNG được chặn việc gửi.
const store = require("./store");
const quiz = require("./quiz");

const CAP_PER_DAY = 3, CAP_GAP_MS = 2 * 3600 * 1000, CAP_EXEMPT = ["result"];
const HIST_PER_PERSON = 30, BATCHES_PER_EXAM = 40, ITEMS_PER_BATCH = 400, TPL_MAX = 100;

const safeId = (id) => String(id == null ? "" : id).replace(/[^A-Za-z0-9_.\-]/g, "_").slice(0, 80) || "none";
const histKey = (examId) => "kt/notify-hist/" + safeId(examId) + ".json";
const batchKey = (examId) => "kt/notify-batches/" + safeId(examId) + ".json";
const TPL_KEY = "kt/notify-templates.json";
const norm = (c) => quiz.normCode(c);
const vnDay = (ms) => new Date(ms + 7 * 3600000).toISOString().slice(0, 10);
const vnHM = (ms) => { const v = new Date(ms + 7 * 3600000); return String(v.getUTCHours()).padStart(2, "0") + ":" + String(v.getUTCMinutes()).padStart(2, "0"); };
const clip = (s, n) => String(s == null ? "" : s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").slice(0, n);

// ---------- Lịch sử nhắc ----------
async function getHist(examId) {
  try { const d = await store.get(histKey(examId)); return d && d.by ? d : { v: 1, by: {} }; } catch (e) { return { v: 1, by: {} }; }
}
// Tóm tắt cho giao diện: { CODE: { n, last, kind, ch, today } }  (today = số thư nhắc đã gửi trong ngày hôm nay, không tính loại được miễn)
function summarize(doc, now) {
  const out = {}, day = vnDay(now || Date.now());
  Object.keys((doc && doc.by) || {}).forEach((code) => {
    const arr = doc.by[code] || []; if (!arr.length) return;
    const last = arr[arr.length - 1], nud = arr.filter((x) => CAP_EXEMPT.indexOf(x.kind) < 0), lastNudge = nud.length ? nud[nud.length - 1].at : 0;
    out[code] = { n: arr.length, last: last.at, kind: last.kind, ch: last.ch, lastNudge, today: nud.filter((x) => vnDay(x.at) === day).length };
  });
  return out;
}
// Trả về lý do bị giới hạn (chuỗi) hoặc "" nếu được gửi
function capReason(doc, code, kind, now) {
  if (CAP_EXEMPT.indexOf(kind) >= 0) return "";
  now = now || Date.now();
  const arr = ((doc && doc.by && doc.by[norm(code)]) || []).filter((x) => CAP_EXEMPT.indexOf(x.kind) < 0);
  const today = arr.filter((x) => vnDay(x.at) === vnDay(now)).length;
  if (today >= CAP_PER_DAY) return "đã được nhắc " + today + " lần hôm nay (tối đa " + CAP_PER_DAY + ")";
  const last = arr.length ? arr[arr.length - 1] : null;
  if (last && now - last.at < CAP_GAP_MS) return "vừa được nhắc lúc " + vnHM(last.at) + " (cách nhau tối thiểu " + (CAP_GAP_MS / 3600000) + " giờ)";
  return "";
}
async function recordHist(examId, codes, meta) {
  if (!codes || !codes.length) return;
  const at = (meta && meta.at) || Date.now();
  await store.update(histKey(examId), (cur) => {
    const doc = cur && cur.by ? cur : { v: 1, by: {} };
    codes.forEach((c) => {
      const k = norm(c); if (!k) return;
      const arr = doc.by[k] || [];
      arr.push({ at, kind: clip(meta && meta.kind, 20) || "custom", ch: clip(meta && meta.ch, 10) || "email", by: clip(meta && meta.by, 80) });
      doc.by[k] = arr.slice(-HIST_PER_PERSON);
    });
    return doc;
  });
}

// ---------- Báo cáo từng đợt gửi ----------
// Một đợt = nhiều lượt gọi (trình duyệt gửi từng nhóm nhỏ) cùng một batchId; mỗi lượt được gộp vào đúng bản ghi của đợt.
async function recordBatch(examId, batchId, meta, entries) {
  const id = clip(batchId, 40) || ("b" + Date.now().toString(36));
  await store.update(batchKey(examId), (cur) => {
    const doc = cur && Array.isArray(cur.list) ? cur : { v: 1, list: [] };
    let b = doc.list.find((x) => x.id === id);
    if (!b) {
      b = { id, at: Date.now(), by: clip(meta.by, 80), byName: clip(meta.byName, 80), examId: clip(examId, 80), examTitle: clip(meta.examTitle, 150), kind: clip(meta.kind, 20), ch: clip(meta.ch, 10) || "email", subject: clip(meta.subject, 150), items: [] };
      doc.list.push(b);
    }
    (entries || []).forEach((e) => {
      const code = clip(e.code, 40), i = b.items.findIndex((x) => x.code === code);
      const row = { code, name: clip(e.name, 80), status: e.status, reason: clip(e.reason, 120) };
      if (i >= 0) { if (b.items[i].status !== "sent") b.items[i] = row; } else if (b.items.length < ITEMS_PER_BATCH) b.items.push(row);
    });
    const n = (s) => b.items.filter((x) => x.status === s).length;
    b.sent = n("sent"); b.failed = n("failed"); b.skipped = n("skipped"); b.dup = n("dup"); b.capped = n("capped"); b.total = b.items.length; b.last = Date.now();
    doc.list = doc.list.slice(-BATCHES_PER_EXAM);
    return doc;
  });
}
// by = email người xem; nếu truyền thì chỉ trả các đợt của chính người đó (quản lí thường chỉ xem đợt của mình)
async function getBatches(examId, by) {
  let doc = null; try { doc = await store.get(batchKey(examId)); } catch (e) { doc = null; }
  const list = (doc && Array.isArray(doc.list) ? doc.list : []).filter((b) => !by || String(b.by || "").toLowerCase() === String(by).toLowerCase());
  return list.slice(-15).reverse().map((b) => ({ id: b.id, at: b.at, by: b.by, byName: b.byName, kind: b.kind, ch: b.ch, subject: b.subject, sent: b.sent || 0, failed: b.failed || 0, skipped: b.skipped || 0, dup: b.dup || 0, capped: b.capped || 0, total: b.total || 0,
    problems: (b.items || []).filter((x) => x.status !== "sent").slice(0, 60) }));
}

// ---------- Mẫu dùng chung ----------
async function listTemplates() {
  try { const d = await store.get(TPL_KEY); return d && Array.isArray(d.list) ? d.list : []; } catch (e) { return []; }
}
function cleanTpl(t) {
  t = t || {};
  const vars = {};
  if (t.vars && typeof t.vars === "object") Object.keys(t.vars).slice(0, 40).forEach((k) => { if (/^\w{1,30}$/.test(k)) vars[k] = clip(t.vars[k], 500); });
  const name = clip(t.name, 60).trim(), text = clip(t.text, 4000), base = clip(t.base, 30).replace(/[^\w]/g, "");
  if (!name) return { error: "Nhập tên mẫu." };
  if (!text.trim()) return { error: "Nội dung mẫu đang trống." };
  return { tpl: { name, base: base || "custom", subject: clip(t.subject, 150), text, vars } };
}
async function saveTemplate(t, by, byName) {
  const c = cleanTpl(t); if (c.error) return { ok: false, error: c.error };
  let out = null, full = false;
  await store.update(TPL_KEY, (cur) => {
    const doc = cur && Array.isArray(cur.list) ? cur : { v: 1, list: [] };
    const id = /^s[a-z0-9]{3,16}$/.test(String(t.id || "")) ? t.id : "";
    const i = id ? doc.list.findIndex((x) => x.id === id) : doc.list.findIndex((x) => x.name === c.tpl.name);
    if (i < 0 && doc.list.length >= TPL_MAX) { full = true; return doc; }
    const rec = Object.assign({}, c.tpl, { id: i >= 0 ? doc.list[i].id : "s" + Date.now().toString(36), by: clip(by, 80), byName: clip(byName, 80), at: Date.now() });
    if (i >= 0) doc.list[i] = rec; else doc.list.push(rec);
    out = rec; return doc;
  });
  if (full) return { ok: false, error: "Đã đủ " + TPL_MAX + " mẫu dùng chung, hãy xoá bớt." };
  return { ok: true, template: out };
}
async function deleteTemplate(id) {
  let n = 0;
  await store.update(TPL_KEY, (cur) => { const doc = cur && Array.isArray(cur.list) ? cur : { v: 1, list: [] }; const k = doc.list.filter((x) => x.id !== id); n = doc.list.length - k.length; doc.list = k; return doc; });
  return n;
}

module.exports = { CAP_PER_DAY, CAP_GAP_MS, getHist, summarize, capReason, recordHist, recordBatch, getBatches, listTemplates, saveTemplate, deleteTemplate, vnHM };
