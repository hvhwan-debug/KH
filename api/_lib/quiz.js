// Thư viện dùng chung cho nền tảng kiểm tra: ngân hàng đề, danh sách thí sinh, cài đặt, bài làm.
const store = require("./store");
const crypto = require("crypto");
const { cfg } = require("./config");

const Q_KEY = "kt/questions.json";
const C_KEY = "kt/candidates.json";
const S_KEY = "kt/settings.json";
const IDX_KEY = "kt/attempts-index.json";

const DEFAULT_SETTINGS = {
  examTitle: "Bài kiểm tra",
  questionCount: 30,
  // Thí sinh bán cả 2 ngành (segment "both"): lấy co dinh so cau "Gia dụng" nay, so con lai (questionCount - so nay)
  // lay tu moi cau hoi KHONG thuoc "Gia dụng" (Máy lọc nước, Kiến thức khác... — tu dong gom moi category khac).
  bothGiaDungCount: 10,
  secondsPerQuestion: 60,
  // Ngưỡng đạt chỉ áp dụng khi bật (passEnabled). Mặc định TẮT: bài không có ngưỡng thì không hiện Đạt/Chưa đạt.
  passEnabled: false,
  passScore: 70,
  allowRetake: false,
  // Điểm tuân thủ học tập: quy đổi từ tỉ lệ đúng (thang điểm 10) sang một mốc điểm cố định
  // (mặc định theo quy tắc kiểm tra định kỳ PC: <6 → 0, 6-6.99 → 10, 7-8.99 → 15, >=9 → 20).
  complianceEnabled: true,
  complianceHighMin: 9,   // >= mốc này: 20 điểm
  complianceMidMin: 7,    // >= mốc này (và < mốc trên): 15 điểm
  complianceLowMin: 6     // >= mốc này (và < mốc trên): 10 điểm; dưới mốc này: 0 điểm
};

// Quy đổi điểm thang 10 (tỉ lệ đúng * 10) sang điểm tuân thủ học tập theo mốc đã cấu hình.
function compliancePoints(scoreOutOf10, settings) {
  const s = settings || DEFAULT_SETTINGS;
  if (scoreOutOf10 >= s.complianceHighMin) return 20;
  if (scoreOutOf10 >= s.complianceMidMin) return 15;
  if (scoreOutOf10 >= s.complianceLowMin) return 10;
  return 0;
}

// Trạng thái đạt: true/false nếu bài có ngưỡng đạt, null nếu bài không có ngưỡng (luôn tính theo cài đặt hiện tại).
function passState(pct, settings) {
  const s = settings || DEFAULT_SETTINGS;
  return s.passEnabled && (s.passScore || 0) > 0 ? pct >= s.passScore : null;
}
function passScoreOf(settings) { return settings && settings.passEnabled ? (settings.passScore || 0) : 0; }

function normCode(s) { return String(s || "").trim().toLowerCase(); }
function normEmail(s) { return String(s || "").trim().toLowerCase(); }

// Nhóm ngành hàng của thí sinh, quyết định đề sẽ trộn từ nhóm câu hỏi nào.
// "both": cả hai ngành (đề trộn từ toàn bộ ngân hàng) · "gia_dung" / "may_loc": chỉ một ngành.
const SEGMENTS = { both: "both", ca_hai: "both", "cả hai": "both", gia_dung: "gia_dung", "gia dụng": "gia_dung", may_loc: "may_loc", "máy lọc": "may_loc", "máy lọc nước": "may_loc" };
function normSegment(s) {
  const k = String(s || "").trim().toLowerCase();
  return SEGMENTS[k] || "both"; // mặc định: không rõ thì coi như bán cả hai (đề đầy đủ hơn, an toàn hơn)
}
const CATEGORY_BY_SEGMENT = { gia_dung: "Gia dụng", may_loc: "Máy lọc nước" };

// Bản sao lưu ngân hàng đề trước khi xoá hàng loạt (giữ bản gần nhất để khôi phục).
const QB_KEY = "kt/questions-backup.json";
async function backupQuestions(list) { await store.put(QB_KEY, { at: Date.now(), questions: list }); }
async function getQuestionsBackup() { return store.get(QB_KEY); }
// Số thí sinh đang làm bài dở (chưa hết giờ).
async function countInProgress() {
  let n = 0;
  const names = (await store.list("kt/active/")).slice(0, 300);
  for (const name of names) {
    try {
      const p = await store.get(name);
      const a = p && p.attemptId ? await getAttempt(p.attemptId) : null;
      if (a && a.status === "in_progress") { const c = Object.assign({}, a); syncAttempt(c, Date.now()); if (c.cursor < c.questionIds.length) n++; }
    } catch (e) { /* bỏ qua mục lỗi */ }
  }
  return n;
}

async function getQuestions() { return (await store.get(Q_KEY)) || []; }
async function saveQuestions(list) { await store.put(Q_KEY, list); }

async function getCandidates() { return (await store.get(C_KEY)) || []; }
async function saveCandidates(list) { await store.put(C_KEY, list); }

async function getSettings() {
  return Object.assign({}, DEFAULT_SETTINGS, (await store.get(S_KEY)) || {});
}
async function saveSettings(s) { await store.put(S_KEY, s); }

async function getAttempt(id) {
  if (!id || /[^a-z0-9]/i.test(id)) return null;
  return store.get("kt/attempt/" + id + ".json");
}
async function putAttempt(a) { await store.put("kt/attempt/" + a.id + ".json", a); }

async function getIndex() { return (await store.get(IDX_KEY)) || []; }
async function upsertIndex(entry) {
  const list = await getIndex();
  const i = list.findIndex((x) => x.id === entry.id);
  if (i >= 0) list[i] = entry; else list.push(entry);
  await store.put(IDX_KEY, list);
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}

// Mã minh chứng in trên thẻ kết quả để quản trị viên đối chiếu với hệ thống (suy ra từ mã bài làm, không cần lưu thêm).
function proofCode(id) { return "KT-" + String(id || "").slice(-8).toUpperCase(); }

// Mã trong QR trên thẻ kết quả: <mã bài làm>.<chữ ký>. Chữ ký do máy chủ ký nên không thể đoán hoặc tự chế mã cho bài khác.
function verifySig(id) { return crypto.createHmac("sha256", cfg().secret || "x").update("verify:" + id).digest("base64url").slice(0, 16); }
function verifyToken(id) { return id + "." + verifySig(id); }
function checkVerifyToken(t) {
  const s = String(t || ""), i = s.lastIndexOf(".");
  if (i < 1 || /[^a-z0-9]/i.test(s.slice(0, i))) return null;
  const id = s.slice(0, i), sig = s.slice(i + 1), want = verifySig(id);
  const a = Buffer.from(sig), b = Buffer.from(want);
  return a.length === b.length && crypto.timingSafeEqual(a, b) ? id : null;
}

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

// ---------------------------------------------------------------------------------------------
// Tính giờ & tiến trình do MÁY CHỦ quyết định (thí sinh tải lại trang / đổi máy vẫn làm tiếp đúng chỗ,
// không thể "xem đề rồi làm lại từ đầu" và không thể kéo dài thời gian bằng cách thoát ra vào lại).
// ---------------------------------------------------------------------------------------------
const GRACE_MS = 3000; // dung sai độ trễ mạng cho mỗi câu

function actKey(code) { return "kt/active/" + String(code || "").toLowerCase().replace(/[^a-z0-9_-]/g, "_") + ".json"; }

// Bài làm đang dở (chưa nộp) của một mã nhân viên, hoặc null.
async function getActive(code) {
  const p = await store.get(actKey(code));
  if (!p || !p.attemptId) return null;
  const a = await getAttempt(p.attemptId);
  return a && a.status === "in_progress" ? a : null;
}
async function setActive(code, attemptId) { await store.put(actKey(code), { attemptId, at: Date.now() }); }

// Đưa con trỏ câu hỏi về đúng hiện tại: câu nào đã quá hạn mà chưa trả lời thì tính là bỏ trống.
// Trả về true nếu bài làm bị thay đổi (cần lưu lại).
function syncAttempt(a, now) {
  const n = a.questionIds.length, S = a.secondsPerQuestion * 1000;
  let changed = false;
  if (typeof a.cursor !== "number") { // bài làm tạo trước khi có cơ chế này
    let c = 0;
    while (c < n && a.answers[a.questionIds[c]]) c++;
    a.cursor = c; a.qStartedAt = now; changed = true;
  }
  while (a.cursor < n && now > a.qStartedAt + S + GRACE_MS) {
    const qid = a.questionIds[a.cursor];
    if (!a.answers[qid]) a.answers[qid] = { answerIndex: -1, auto: true, answeredAt: a.qStartedAt + S };
    a.cursor++; a.qStartedAt += S; changed = true;
  }
  return changed;
}

// Trạng thái gửi cho thí sinh: câu hiện tại (chỉ MỘT câu mỗi lần) + thời gian còn lại, hoặc done=true.
function clientState(a, byId, now) {
  const n = a.questionIds.length, S = a.secondsPerQuestion * 1000;
  let changed = false;
  while (a.cursor < n && !byId[a.questionIds[a.cursor]]) { // câu đã bị xoá khỏi ngân hàng giữa chừng: bỏ qua
    a.answers[a.questionIds[a.cursor]] = { answerIndex: -1, auto: true, answeredAt: now };
    a.cursor++; a.qStartedAt = now; changed = true;
  }
  if (a.cursor >= n) return { state: { done: true, total: n }, changed };
  const qid = a.questionIds[a.cursor], q = byId[qid];
  const order = a.orders[qid] || q.options.map((_, i) => i);
  return {
    state: {
      done: false, index: a.cursor, total: n,
      remainingMs: Math.max(0, a.qStartedAt + S - now),
      secondsPerQuestion: a.secondsPerQuestion,
      question: { id: qid, text: q.text, options: order.map((i) => q.options[i]) }
    },
    changed
  };
}

// Giới hạn số lần thử sai theo IP (best-effort, trong bộ nhớ của tiến trình) để chống dò mã nhân viên + email.
const _fails = new Map();
function ipOf(req) {
  const h = (req && req.headers) || {};
  return String(h["x-forwarded-for"] || h["x-azure-clientip"] || "").split(",")[0].trim().split(":")[0] || "unknown";
}
function tooManyFails(req, max, windowMs) {
  const k = ipOf(req), now = Date.now();
  const list = (_fails.get(k) || []).filter((t) => now - t < windowMs);
  _fails.set(k, list);
  if (_fails.size > 5000) { for (const [key, v] of _fails) if (!v.length || now - v[v.length - 1] > windowMs) _fails.delete(key); }
  return list.length >= max;
}
function noteFail(req) {
  const k = ipOf(req), list = _fails.get(k) || [];
  list.push(Date.now()); _fails.set(k, list);
}

module.exports = {
  normCode, normEmail, normSegment, CATEGORY_BY_SEGMENT,
  getQuestions, saveQuestions,
  getCandidates, saveCandidates,
  getSettings, saveSettings,
  getAttempt, putAttempt,
  getIndex, upsertIndex,
  shuffle, genId, compliancePoints,
  passState, passScoreOf, verifyToken, checkVerifyToken, backupQuestions, getQuestionsBackup, countInProgress, proofCode, GRACE_MS, getActive, setActive, syncAttempt, clientState, tooManyFails, noteFail
};
