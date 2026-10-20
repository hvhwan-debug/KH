// Thư viện dùng chung cho nền tảng kiểm tra: ngân hàng đề, danh sách thí sinh, cài đặt, bài làm.
// Bài làm lưu theo từng blob riêng (kt/attempt/<id>, kt/idx/<id>, kt/cand/<mã>) để nhiều người nộp cùng lúc
// không ghi đè lên nhau (không còn một file chỉ mục chung bị đọc-sửa-ghi đồng thời).
const store = require("./store");

const Q_KEY = "kt/questions.json";
const C_KEY = "kt/candidates.json";
const S_KEY = "kt/settings.json";
const LEGACY_IDX_KEY = "kt/attempts-index.json"; // chỉ đọc, dữ liệu của phiên bản cũ

const GRACE_MS = 5000; // dung sai mạng cho mỗi câu (không hiển thị cho thí sinh)

const DEFAULT_SETTINGS = {
  examTitle: "Bài kiểm tra",
  enabled: true,        // quản trị viên có thể đóng/mở bài kiểm tra
  opensAt: null,        // mốc mở bài (ms), null = không giới hạn
  closesAt: null,       // mốc đóng bài (ms), null = không giới hạn
  questionCount: 30,
  // Thí sinh bán cả 2 ngành: lấy cố định số câu "Gia dụng" này, phần còn lại lấy từ mọi danh mục khác.
  bothGiaDungCount: 10,
  secondsPerQuestion: 60,
  passScore: 70,
  allowRetake: false,
  showReview: false,    // cho thí sinh xem đáp án đúng ngay sau khi nộp
  complianceEnabled: true,
  complianceHighMin: 9,
  complianceMidMin: 7,
  complianceLowMin: 6
};

function compliancePoints(scoreOutOf10, settings) {
  const s = settings || DEFAULT_SETTINGS;
  if (scoreOutOf10 >= s.complianceHighMin) return 20;
  if (scoreOutOf10 >= s.complianceMidMin) return 15;
  if (scoreOutOf10 >= s.complianceLowMin) return 10;
  return 0;
}

function normCode(s) { return String(s || "").trim().toLowerCase(); }
function normEmail(s) { return String(s || "").trim().toLowerCase(); }
// So sánh danh mục không phân biệt hoa/thường và dấu tiếng Việt.
function normCat(s) {
  return String(s || "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/\s+/g, " ");
}
const CAT_GIA_DUNG = "gia dung";
const CAT_MAY_LOC = "may loc nuoc";

const SEGMENTS = { both: "both", ca_hai: "both", "cả hai": "both", gia_dung: "gia_dung", "gia dụng": "gia_dung", may_loc: "may_loc", "máy lọc": "may_loc", "máy lọc nước": "may_loc" };
function normSegment(s) {
  const k = String(s || "").trim().toLowerCase();
  return SEGMENTS[k] || "both";
}
const CATEGORY_BY_SEGMENT = { gia_dung: "Gia dụng", may_loc: "Máy lọc nước" };

async function getQuestions() { return (await store.get(Q_KEY)) || []; }
async function saveQuestions(list) { await store.put(Q_KEY, list); }
async function getCandidates() { return (await store.get(C_KEY)) || []; }
async function saveCandidates(list) { await store.put(C_KEY, list); }
async function getSettings() { return Object.assign({}, DEFAULT_SETTINGS, (await store.get(S_KEY)) || {}); }
async function saveSettings(s) { await store.put(S_KEY, s); }

// ---- bài làm ----
function safeId(id) { return id && !/[^a-z0-9]/i.test(id) ? id : null; }
async function getAttempt(id) { return safeId(id) ? store.get("kt/attempt/" + id + ".json") : null; }
async function putAttempt(a) { await store.put("kt/attempt/" + a.id + ".json", a); }

function hex(s) { return Buffer.from(normCode(s), "utf8").toString("hex"); }
async function getPointer(code) { return store.get("kt/cand/" + hex(code) + ".json"); }
async function putPointer(code, attemptId) { await store.put("kt/cand/" + hex(code) + ".json", { attemptId, at: Date.now() }); }
async function delPointer(code) { await store.del("kt/cand/" + hex(code) + ".json"); }

function indexEntry(a) {
  return {
    id: a.id, code: a.code, name: a.name, email: a.email, manager: a.manager || "", segment: a.segment || "both",
    status: a.status, startedAt: a.startedAt, submittedAt: a.submittedAt || null,
    score: a.score != null ? a.score : null, total: a.total != null ? a.total : (a.items ? a.items.length : null),
    pct: a.pct != null ? a.pct : null, passed: a.passed != null ? a.passed : null,
    scoreOutOf10: a.scoreOutOf10 != null ? a.scoreOutOf10 : null, compliancePoints: a.compliancePoints != null ? a.compliancePoints : null,
    answered: a.items ? Math.min(a.idx || 0, a.items.length) : null,
    mailSent: a.mail ? !!a.mail.sent : null, durationMs: a.durationMs || null
  };
}
async function putIndex(a) { await store.put("kt/idx/" + a.id + ".json", indexEntry(a)); }

async function mapLimit(items, n, fn) {
  const out = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k]); }
  }));
  return out;
}
// Toàn bộ chỉ mục kết quả: các blob mới + chỉ mục cũ (nếu còn). Bỏ qua mục trùng id.
async function listIndex() {
  const names = await store.list("kt/idx/");
  const fresh = (await mapLimit(names, 16, (n) => store.get(n))).filter(Boolean);
  const seen = new Set(fresh.map((x) => x.id));
  const legacy = ((await store.get(LEGACY_IDX_KEY)) || []).filter((x) => x && !seen.has(x.id));
  return fresh.concat(legacy);
}
async function findLegacySubmitted(code) {
  const legacy = (await store.get(LEGACY_IDX_KEY)) || [];
  return legacy.find((a) => normCode(a.code) === normCode(code) && a.status === "submitted") || null;
}

async function removeLegacy(id) {
  const legacy = (await store.get(LEGACY_IDX_KEY)) || [];
  const next = legacy.filter((x) => x && x.id !== id);
  if (next.length !== legacy.length) await store.put(LEGACY_IDX_KEY, next);
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; }
  return a;
}
function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 10); }

// Cổng mở/đóng bài: trả về thông báo lỗi nếu chưa được phép bắt đầu bài mới, ngược lại null.
function examGate(settings, now) {
  now = now || Date.now();
  if (settings.enabled === false) return "Bài kiểm tra hiện đang đóng.";
  if (settings.opensAt && now < settings.opensAt) return "Bài kiểm tra chưa mở. Mở lúc " + new Date(settings.opensAt).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" }) + ".";
  if (settings.closesAt && now > settings.closesAt) return "Bài kiểm tra đã đóng.";
  return null;
}

// Chọn câu hỏi theo nhóm ngành của thí sinh. Trả về { picked } hoặc { error }.
function pickQuestions(allQuestions, segment, settings) {
  const active = allQuestions.filter((q) => q.active !== false && q.text && Array.isArray(q.options) && q.options.length >= 2);
  const total = settings.questionCount || active.length;
  if (segment === "gia_dung" || segment === "may_loc") {
    const want = segment === "gia_dung" ? CAT_GIA_DUNG : CAT_MAY_LOC;
    const pool = active.filter((q) => normCat(q.category) === want);
    if (!pool.length) return { error: "Ngân hàng đề chưa có câu hỏi phù hợp với nhóm ngành của bạn, liên hệ quản trị viên." };
    return { picked: shuffle(pool).slice(0, Math.min(total, pool.length)) };
  }
  const gd = active.filter((q) => normCat(q.category) === CAT_GIA_DUNG);
  const other = active.filter((q) => normCat(q.category) !== CAT_GIA_DUNG);
  if (!gd.length && !other.length) return { error: "Ngân hàng đề chưa có câu hỏi, liên hệ quản trị viên." };
  const gdN = Math.min(settings.bothGiaDungCount || 0, gd.length);
  const otherN = Math.min(Math.max(total - gdN, 0), other.length);
  return { picked: shuffle(shuffle(gd).slice(0, gdN).concat(shuffle(other).slice(0, otherN))) };
}

// Đề được chụp lại (snapshot) vào bài làm: sửa/xoá câu hỏi sau đó không làm đổi kết quả đã có.
function newAttempt(candidate, segment, picked, settings, now) {
  const items = picked.map((q) => {
    const order = shuffle(q.options.map((_, i) => i));
    return { id: q.id, text: q.text, category: q.category || "", options: order.map((i) => q.options[i]), correct: order.indexOf(q.correctIndex) };
  });
  return {
    v: 2, id: genId(), code: candidate.code, name: candidate.name, email: candidate.email, manager: candidate.manager || "", segment,
    items, idx: 0, answers: {}, secondsPerQuestion: Math.max(10, settings.secondsPerQuestion || 60),
    startedAt: now, qStartedAt: now, status: "in_progress"
  };
}

// Câu hỏi hiện tại gửi cho thí sinh (không kèm đáp án đúng).
function stateFor(a, settings, now) {
  const total = a.items.length;
  if (a.idx >= total) return { done: true, index: total, total };
  const it = a.items[a.idx];
  return {
    done: false, index: a.idx, total, secondsPerQuestion: a.secondsPerQuestion,
    remainingMs: Math.max(0, a.qStartedAt + a.secondsPerQuestion * 1000 - now),
    question: { id: it.id, text: it.text, options: it.options },
    examTitle: settings.examTitle
  };
}

// Hết giờ thì câu hiện tại tính là không trả lời và chuyển sang câu kế; bỏ đi thì thời gian vẫn trôi.
function advanceByTime(a, now) {
  if (a.status !== "in_progress") return false;
  const slot = a.secondsPerQuestion * 1000 + GRACE_MS;
  let changed = false;
  while (a.idx < a.items.length && now > a.qStartedAt + slot) {
    const it = a.items[a.idx];
    if (!a.answers[it.id]) a.answers[it.id] = { a: -1, timeout: true, at: a.qStartedAt + slot };
    a.qStartedAt += slot; a.idx++; changed = true;
  }
  return changed;
}

function grade(a, settings, now) {
  let correct = 0;
  a.items.forEach((it) => { const r = a.answers[it.id]; if (r && r.a === it.correct) correct++; });
  const total = a.items.length;
  const pct = total ? Math.round((correct / total) * 100) : 0;
  const out10 = total ? (correct / total) * 10 : 0;
  a.status = "submitted"; a.submittedAt = now; a.score = correct; a.total = total; a.pct = pct;
  a.passed = pct >= (settings.passScore || 0);
  a.scoreOutOf10 = Math.round(out10 * 100) / 100;
  a.compliancePoints = settings.complianceEnabled ? compliancePoints(out10, settings) : null;
  a.durationMs = Math.max(0, now - a.startedAt);
  return a;
}

module.exports = {
  GRACE_MS, DEFAULT_SETTINGS,
  normCode, normEmail, normCat, normSegment, CATEGORY_BY_SEGMENT,
  getQuestions, saveQuestions, getCandidates, saveCandidates, getSettings, saveSettings,
  getAttempt, putAttempt, getPointer, putPointer, delPointer, putIndex, indexEntry, listIndex, findLegacySubmitted, removeLegacy, mapLimit,
  shuffle, genId, compliancePoints, examGate, pickQuestions, newAttempt, stateFor, advanceByTime, grade
};
