// Thư viện dùng chung cho nền tảng kiểm tra: ngân hàng đề, danh sách thí sinh, cài đặt, bài làm.
const store = require("./store");
const crypto = require("crypto");
const { cfg } = require("./config");

const Q_KEY = "kt/questions.json";
const C_KEY = "kt/candidates.json";
const S_KEY = "kt/settings.json";
const IDX_KEY = "kt/attempts-index.json";
const EX_KEY = "kt/exams.json"; // danh sách các đề thi (nhiều đề độc lập, mỗi đề 1 "period"/mã riêng, có cài đặt riêng)

const DEFAULT_SETTINGS = {
  examTitle: "Bài kiểm tra",
  // Dòng đầu của nội dung chia sẻ qua Zalo (tên rút gọn của kỳ kiểm tra). Để trống thì dùng tên bài kiểm tra.
  shareTitle: "PCs - KTTĐK 10/2026",
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
  complianceLowMin: 6,    // >= mốc này (và < mốc trên): 10 điểm; dưới mốc này: 0 điểm
  // Kỳ kiểm tra hiện tại (vd "2026-10"): bài làm được gắn đúng kỳ lúc nộp. "Đã làm bài" chỉ chặn trong
  // CÙNG kỳ - đổi giá trị này (ví dụ sang tháng mới) là mọi thí sinh tự động được làm lại, không cần
  // quản trị viên reset tay từng người; kết quả các kỳ cũ vẫn giữ nguyên để đối chiếu.
  examPeriod: defaultPeriod()
};

function defaultPeriod() {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
}

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

// Ngân hàng đề THEO KỲ: mỗi câu hỏi có period ("YYYY-MM"); "" = chưa gắn kỳ.
// Đề của kỳ P chỉ lấy câu thuộc kỳ P. Nếu kỳ P chưa có câu nào, tạm dùng các câu CHƯA GẮN KỲ (dự phòng),
// để bài thi không bị gián đoạn khi mới chuyển sang cấu trúc theo kỳ.
// Mã đề thi/kỳ: chấp nhận dạng tháng "YYYY-MM" (lặp lại định kỳ) HOẶC một mã tự chọn (vd "thu-nghiem")
// để mở được NHIỀU đề thi độc lập, không chỉ một đề lặp lại theo tháng.
const validPeriod = (p) => p === "" || /^\d{4}-\d{2}$/.test(String(p)) || /^[a-z0-9][a-z0-9-]{0,39}$/i.test(String(p));
function usableQ(q) { return q && q.active !== false && q.text && Array.isArray(q.options) && q.options.length >= 2; }
// Chuyển đổi một lần: ngân hàng đề cũ (chưa câu nào có kỳ) chính là đề của kỳ đang chạy -> gắn vào kỳ hiện tại.
async function ensureBankPeriods() {
  const list = await getQuestions();
  if (!list.length || list.some((q) => q.period)) return null;
  const st = await getSettings();
  list.forEach((q) => { q.period = st.examPeriod; });
  await saveQuestions(list);
  try { await require("./auditlog").write({ area: "system", role: "system", by: "hệ thống", name: "Hệ thống", op: "migrateBank", label: "Tự gắn ngân hàng đề cũ vào kỳ hiện tại", kind: "change", status: 200, ok: true, details: { count: list.length, period: st.examPeriod } }); } catch (e) {}
  return { migrated: list.length, period: st.examPeriod };
}
// Thứ tự lấy đề cho kỳ P: câu của kỳ P -> câu chưa gắn kỳ -> đề của kỳ gần nhất TRƯỚC P (dự phòng tạm thời,
// để đổi sang kỳ mới mà chưa kịp soạn đề thì thí sinh vẫn làm được bài; trang quản trị báo rõ đang dùng tạm).
function bankFor(all, period) {
  const own = all.filter((q) => usableQ(q) && (q.period || "") === period);
  if (own.length || !period) return { list: own, source: own.length ? "period" : "none" };
  const shared = all.filter((q) => usableQ(q) && !q.period);
  if (shared.length) return { list: shared, source: "unassigned" };
  const prev = Array.from(new Set(all.filter((q) => usableQ(q) && q.period && q.period < period).map((q) => q.period))).sort().pop();
  if (prev) return { list: all.filter((q) => usableQ(q) && q.period === prev), source: "previous", from: prev };
  return { list: [], source: "none" };
}

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

// ---------- Tài khoản quản lí (chỉ xem kết quả + chỉnh thông tin nhân viên của mình) ----------
const V_KEY = "kt/viewers.json";
async function getViewers() { return (await store.get(V_KEY)) || []; }
async function saveViewers(list) { await store.put(V_KEY, list); }
// So khớp tên người (không phân biệt hoa thường, dấu, khoảng trắng thừa).
function normPerson(s) {
  return String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/gi, "d").toLowerCase().replace(/\s+/g, " ").trim();
}
async function findViewer(email) {
  const e = normEmail(email);
  return (await getViewers()).find((v) => normEmail(v.email) === e) || null;
}
// Nhân viên có thuộc phạm vi của quản lí này không (theo tên quản lí ghi trong danh sách thí sinh).
function inScope(viewer, candidate) {
  if (viewer && viewer.isAdmin) return true; // quản trị viên: toàn quyền, không giới hạn theo quản lí nào
  const mine = new Set(((viewer && viewer.scopes) || []).map(normPerson).filter(Boolean));
  return mine.size > 0 && mine.has(normPerson(candidate && candidate.manager));
}

async function getQuestions() { return (await store.get(Q_KEY)) || []; }
async function saveQuestions(list) { await store.put(Q_KEY, list); }

async function getCandidates() { return (await store.get(C_KEY)) || []; }
async function saveCandidates(list) { await store.put(C_KEY, list); }

async function getSettings() {
  return Object.assign({}, DEFAULT_SETTINGS, (await store.get(S_KEY)) || {});
}
async function saveSettings(s) { await store.put(S_KEY, s); }

// ---------- Nhiều đề thi độc lập ----------
// Mỗi đề thi là MỘT BẢN GHI gắn với một mã "period" riêng (vd "2026-10" cho đề lặp lại theo tháng,
// hoặc "thu-nghiem" cho một đề thử). Mỗi đề có cài đặt RIÊNG (số câu, thời gian/câu, ngưỡng đạt, điểm
// tuân thủ...); đề nào không tự nêu cài đặt riêng thì dùng theo cài đặt chung (getSettings()) làm mặc định.
const OVERRIDABLE_FIELDS = [
  "examTitle", "shareTitle", "questionCount", "bothGiaDungCount", "secondsPerQuestion",
  "passEnabled", "passScore", "allowRetake",
  "complianceEnabled", "complianceHighMin", "complianceMidMin", "complianceLowMin"
];

async function getExams() { return (await store.get(EX_KEY)) || []; }
async function saveExams(list) { await store.put(EX_KEY, list); }

// Cài đặt THỰC TẾ áp dụng cho một đề thi cụ thể: lấy cài đặt chung làm nền, đè lên bằng phần đề thi đó tự nêu riêng.
async function getExamSettings(examId) {
  const base = await getSettings();
  const exams = await getExams();
  const ex = exams.find((e) => e.id === examId);
  const effective = Object.assign({}, base, ex ? pick(ex, OVERRIDABLE_FIELDS) : {});
  effective.examPeriod = examId != null ? examId : base.examPeriod;
  // Cấu trúc đề + khung thời gian + đối tượng: chỉ có ở đề thi đã đăng ký (không kế thừa từ cài đặt chung).
  effective.blueprint = ex && ex.blueprint ? ex.blueprint : null;
  effective.openAt = ex && ex.openAt ? ex.openAt : 0;
  effective.closeAt = ex && ex.closeAt ? ex.closeAt : 0;
  effective.segments = ex && Array.isArray(ex.segments) ? ex.segments : [];
  effective.description = ex && ex.description ? ex.description : "";
  return effective;
}
function pick(obj, keys) {
  const out = {};
  keys.forEach((k) => { if (obj[k] !== undefined && obj[k] !== null && obj[k] !== "") out[k] = obj[k]; });
  return out;
}

// Tạo mới hoặc cập nhật một đề thi (theo id). Validate id và các trường ghi đè trước khi lưu.
async function upsertExam(data) {
  const id = String((data && data.id) || "").trim();
  if (!validPeriod(id) || !id) return { ok: false, error: "Mã đề thi không hợp lệ (chỉ chữ/số/gạch ngang, tối đa 40 ký tự, hoặc dạng năm-tháng)." };
  const exams = await getExams();
  const i = exams.findIndex((e) => e.id === id);
  const now = Date.now();
  const entry = Object.assign(
    { id, title: String((data && data.title) || id).trim().slice(0, 150), createdAt: i >= 0 ? exams[i].createdAt : now },
    pick(data || {}, OVERRIDABLE_FIELDS)
  );
  if (data && data.description !== undefined) entry.description = String(data.description || "").trim().slice(0, 500);
  if (data && data.blueprint !== undefined) {
    const bp = cleanBlueprint(data.blueprint);
    if (bp && bp.error) return { ok: false, error: bp.error };
    entry.blueprint = bp; // null = dùng cách ra đề cũ
  }
  if (data && data.openAt !== undefined) entry.openAt = Math.max(0, Number(data.openAt) || 0);
  if (data && data.closeAt !== undefined) entry.closeAt = Math.max(0, Number(data.closeAt) || 0);
  if (entry.openAt && entry.closeAt && entry.closeAt <= entry.openAt) return { ok: false, error: "Thời gian đóng phải sau thời gian mở." };
  if (data && data.segments !== undefined) entry.segments = (Array.isArray(data.segments) ? data.segments : []).map(normSegment).filter((v, k, a) => a.indexOf(v) === k);
  if (i >= 0) exams[i] = Object.assign({}, exams[i], entry); else exams.push(entry);
  await saveExams(exams);
  return { ok: true, exam: entry };
}
async function deleteExam(id) {
  const exams = await getExams();
  const kept = exams.filter((e) => e.id !== id);
  await saveExams(kept);
  return exams.length - kept.length;
}

// Danh sách đề thi để hiển thị (gộp đề đã đăng kí RIÊNG trong kt/exams.json với mọi "period" đã có dữ liệu
// thật trong ngân hàng đề/kết quả, để không "mất" các kỳ cũ tạo trước khi có màn quản lý đề thi này).
async function listExamsSummary() {
  const [exams, questions, idx, settings] = await Promise.all([getExams(), getQuestions(), getIndex(), getSettings()]);
  const byId = {};
  exams.forEach((e) => { byId[e.id] = Object.assign({ id: e.id, title: e.title || e.id, questionCount: 0, resultCount: 0 }, byId[e.id]); byId[e.id] = Object.assign({}, e, { questionCount: 0, resultCount: 0 }); });
  const touch = (id) => {
    if (!id && id !== "") return;
    if (!byId[id]) byId[id] = { id, title: id || "(chưa gắn đề)", questionCount: 0, resultCount: 0 };
  };
  questions.forEach((q) => { touch(q.period || ""); if (byId[q.period || ""]) byId[q.period || ""].questionCount++; });
  idx.forEach((r) => { touch(r.period || ""); if (byId[r.period || ""]) byId[r.period || ""].resultCount++; });
  touch(settings.examPeriod);
  return Object.values(byId).filter((e) => e.id !== "").sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0) || a.id.localeCompare(b.id));
}

// ---------- Nhiều ngân hàng câu hỏi ----------
// Câu hỏi chưa có bankId thuộc ngân hàng "default" (Ngân hàng chung) để dữ liệu cũ vẫn chạy bình thường.
const BANKS_KEY = "kt/banks.json";
const DEFAULT_BANK = "default";
const DIFFICULTIES = ["easy", "medium", "hard"];
async function getBanks() {
  const list = (await store.get(BANKS_KEY)) || [];
  if (!list.some((b) => b.id === DEFAULT_BANK)) list.unshift({ id: DEFAULT_BANK, name: "Ngân hàng chung", description: "Các câu hỏi chưa xếp vào ngân hàng riêng", createdAt: 0 });
  return list;
}
async function saveBanks(list) { await store.put(BANKS_KEY, list.filter((b) => b.id !== DEFAULT_BANK)); } // "default" luôn là ngân hàng ảo, không lưu
const bankOf = (q) => (q && q.bankId) || DEFAULT_BANK;
function validBankId(id) { return /^[a-z0-9][a-z0-9-]{0,39}$/i.test(String(id || "")); }
function slugify(s) {
  return normPerson(s).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30) || "bank";
}
// Làm sạch các trường mở rộng của câu hỏi (ngân hàng, độ khó, thẻ, giải thích).
function cleanQuestionMeta(q, prev) {
  const out = {};
  const p = prev || {};
  if (q.bankId !== undefined) out.bankId = validBankId(q.bankId) ? String(q.bankId) : DEFAULT_BANK;
  else if (p.bankId) out.bankId = p.bankId;
  const d = q.difficulty !== undefined ? q.difficulty : p.difficulty;
  if (DIFFICULTIES.indexOf(d) >= 0) out.difficulty = d; else out.difficulty = "";
  const t = q.tags !== undefined ? q.tags : p.tags;
  const tags = Array.isArray(t) ? t : String(t || "").split(",");
  out.tags = tags.map((x) => String(x || "").trim().slice(0, 40)).filter(Boolean).filter((v, k, a) => a.indexOf(v) === k).slice(0, 12);
  const e = q.explanation !== undefined ? q.explanation : p.explanation;
  out.explanation = String(e || "").trim().slice(0, 1000);
  return out;
}

// ---------- Cấu trúc đề (blueprint) ----------
// blueprint = { rules: [{ bankId: "*"|<id>, category: "", difficulty: ""|easy|medium|hard, tag: "", count: N }] }
function cleanBlueprint(bp) {
  if (bp === null || bp === "") return null;
  const rules = bp && Array.isArray(bp.rules) ? bp.rules : null;
  if (!rules) return { error: "Cấu trúc đề không hợp lệ." };
  if (!rules.length) return null;
  if (rules.length > 30) return { error: "Tối đa 30 quy tắc cho một đề." };
  const out = [];
  for (const r of rules) {
    const count = parseInt(r && r.count, 10);
    if (!(count >= 1 && count <= 500)) return { error: "Số câu của mỗi quy tắc phải từ 1 đến 500." };
    const bankId = r.bankId === "*" ? "*" : (validBankId(r.bankId) ? String(r.bankId) : DEFAULT_BANK);
    out.push({
      bankId, count,
      category: String(r.category || "").trim().slice(0, 100),
      difficulty: DIFFICULTIES.indexOf(r.difficulty) >= 0 ? r.difficulty : "",
      tag: String(r.tag || "").trim().slice(0, 40)
    });
  }
  return { rules: out };
}
function ruleMatches(rule, q) {
  if (rule.bankId !== "*" && bankOf(q) !== rule.bankId) return false;
  if (rule.category && (q.category || "") !== rule.category) return false;
  if (rule.difficulty && (q.difficulty || "") !== rule.difficulty) return false;
  if (rule.tag && !(Array.isArray(q.tags) && q.tags.indexOf(rule.tag) >= 0)) return false;
  return true;
}
function blueprintTotal(bp) { return bp && bp.rules ? bp.rules.reduce((n, r) => n + (r.count || 0), 0) : 0; }
// Rút câu theo từng quy tắc theo thứ tự; một câu không xuất hiện hai lần trong cùng một đề.
// Trả về { picked, report: [{ rule, available, taken, short }] } để quản trị viên biết quy tắc nào thiếu câu.
function buildFromBlueprint(all, blueprint) {
  const usable = all.filter(usableQ), used = new Set(), picked = [], report = [];
  (blueprint.rules || []).forEach((rule) => {
    const pool = usable.filter((q) => !used.has(q.id) && ruleMatches(rule, q));
    const take = shuffle(pool).slice(0, rule.count);
    take.forEach((q) => { used.add(q.id); picked.push(q); });
    report.push({ rule, available: pool.length, taken: take.length, short: Math.max(0, rule.count - take.length) });
  });
  return { picked: shuffle(picked), report };
}

// ---------- Khung thời gian & đối tượng của đề thi ----------
// Trả về chuỗi lỗi (tiếng Việt) nếu thí sinh không được vào đề này lúc này, ngược lại trả về "".
function examAccessError(settings, candidate, now) {
  const t = now || Date.now();
  if (settings.openAt && t < settings.openAt) return "Bài kiểm tra chưa mở. Thời gian mở: " + fmtVN(settings.openAt) + ".";
  if (settings.closeAt && t > settings.closeAt) return "Bài kiểm tra đã đóng từ " + fmtVN(settings.closeAt) + ".";
  if (settings.segments && settings.segments.length && settings.segments.indexOf(normSegment(candidate && candidate.segment)) < 0) {
    return "Bài kiểm tra này không dành cho nhóm của bạn.";
  }
  return "";
}
function fmtVN(ms) {
  const d = new Date(ms + 7 * 3600 * 1000), p = (n) => String(n).padStart(2, "0");
  return p(d.getUTCHours()) + ":" + p(d.getUTCMinutes()) + " " + p(d.getUTCDate()) + "/" + p(d.getUTCMonth() + 1) + "/" + d.getUTCFullYear();
}

async function getAttempt(id) {
  if (!id || /[^a-z0-9]/i.test(id)) return null;
  return store.get("kt/attempt/" + id + ".json");
}
async function putAttempt(a) { await store.put("kt/attempt/" + a.id + ".json", a); }

async function getIndex() { return (await store.get(IDX_KEY)) || []; }
async function saveIndex(list) { await store.put(IDX_KEY, list); }
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

// Bản sao bài làm (từng câu theo ĐÚNG thứ tự đáp án thí sinh đã thấy): lưu lúc nộp bài để xem lại ổn định
// kể cả khi ngân hàng đề sau đó bị sửa/xoá.
function buildPaper(a, byId) {
  return (a.questionIds || []).map((qid, i) => {
    const q = byId[qid]; if (!q) return null;
    const order = (a.orders && a.orders[qid]) || q.options.map((_, k) => k);
    const ans = a.answers && a.answers[qid];
    const chosen = ans && Number.isInteger(ans.answerIndex) && ans.answerIndex >= 0 && ans.answerIndex < order.length ? ans.answerIndex : -1;
    const correct = order.indexOf(q.correctIndex);
    return { n: i + 1, text: q.text, options: order.map((k) => q.options[k]), chosen, correct, ok: chosen >= 0 && chosen === correct, category: q.category || "" };
  }).filter(Boolean);
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

// Xoá (các) bản ghi kết quả "đã nộp" của một mã nhân viên khỏi bảng chỉ số, để họ được làm bài lại từ đầu
// (không đụng tới bài làm cũ đã lưu riêng trong kt/attempt/<id>.json, chỉ bỏ dấu "đã nộp" đang chặn check/start).
// Cho làm lại: chỉ xoá kết quả của MỘT kỳ (period). Không truyền period = hành vi cũ (xoá mọi kỳ) - chỉ dùng khi thật sự cần.
// Bài đang làm dở chỉ bị huỷ khi nó thuộc đúng kỳ được làm lại (không đụng tới bài đang làm của kỳ khác).
async function resetByCode(code, period) {
  const norm = normCode(code);
  const list = await getIndex();
  const byPeriod = typeof period === "string";
  const kept = list.filter((x) => normCode(x.code) !== norm || (byPeriod && (x.period || "") !== period));
  await store.put(IDX_KEY, kept);
  const act = await getActive(code);
  if (!byPeriod || (act && (act.period || "") === period) || !act) await setActive(code, null);
  return list.length - kept.length;
}
// Bài làm dở được bắt đầu ở kỳ khác kỳ hiện tại: không cho làm tiếp sang kỳ mới (ảnh chụp chỉ là minh chứng cho kỳ đã chụp).
async function activeForPeriod(code, period) {
  const a = await getActive(code);
  if (!a) return null;
  if ((a.period || "") === period) return a;
  a.status = "expired"; a.expiredAt = Date.now(); a.expiredReason = "Sang kỳ mới " + period;
  await putAttempt(a); await setActive(code, null);
  return null;
}

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
  normCode, normEmail, normSegment, CATEGORY_BY_SEGMENT, bankFor, usableQ, validPeriod, ensureBankPeriods,
  getQuestions, saveQuestions,
  getCandidates, saveCandidates,
  getSettings, saveSettings,
  getAttempt, putAttempt, saveIndex, activeForPeriod,
  getExams, saveExams, getExamSettings, upsertExam, deleteExam, listExamsSummary,
  getBanks, saveBanks, bankOf, validBankId, slugify, cleanQuestionMeta, DEFAULT_BANK, DIFFICULTIES,
  cleanBlueprint, buildFromBlueprint, blueprintTotal, examAccessError,
  getIndex, upsertIndex, resetByCode,
  shuffle, genId, compliancePoints,
  buildPaper, getViewers, saveViewers, findViewer, normPerson, inScope, passState, passScoreOf, verifyToken, checkVerifyToken, backupQuestions, getQuestionsBackup, countInProgress, proofCode, GRACE_MS, getActive, setActive, syncAttempt, clientState, tooManyFails, noteFail
};
