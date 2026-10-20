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
  allowRetake: false
};

function normCode(s) { return String(s || "").trim().toLowerCase(); }
function normEmail(s) { return String(s || "").trim().toLowerCase(); }

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
  normCode, normEmail,
  getQuestions, saveQuestions,
  getCandidates, saveCandidates,
  getSettings, saveSettings,
  getAttempt, putAttempt,
  getIndex, upsertIndex,
  shuffle, genId
};
