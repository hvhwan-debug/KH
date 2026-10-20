// Thư viện dùng chung cho nền tảng kiểm tra: ngân hàng đề, danh sách thí sinh, cài đặt, bài làm.
const store = require("./store");

const Q_KEY = "kt/questions.json";
const C_KEY = "kt/candidates.json";
const S_KEY = "kt/settings.json";
const IDX_KEY = "kt/attempts-index.json";

const DEFAULT_SETTINGS = {
  examTitle: "Bài kiểm tra",
  questionCount: 20,
  secondsPerQuestion: 60,
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

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

module.exports = {
  normCode, normEmail, normSegment, CATEGORY_BY_SEGMENT,
  getQuestions, saveQuestions,
  getCandidates, saveCandidates,
  getSettings, saveSettings,
  getAttempt, putAttempt,
  getIndex, upsertIndex,
  shuffle, genId, compliancePoints
};
