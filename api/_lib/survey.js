// Khảo sát tích hợp trong hệ thống kiểm tra. Lưu bằng store (Azure Blob), cùng nơi với dữ liệu bài kiểm tra:
//   ks/survey/<mã>.json            cấu hình khảo sát
//   ks/resp/<mã>/<id>.json         từng phiếu trả lời (id = mã nhân viên nếu bắt nhập danh tính, ngược lại ngẫu nhiên)
const store = require("./store");
const CODE_RE = /^[a-z0-9-]{2,40}$/;
const TYPES = ["single", "multi", "rating", "text"];

const validCode = (c) => CODE_RE.test(String(c || ""));
const surveyKey = (code) => "ks/survey/" + code + ".json";
const respPrefix = (code) => "ks/resp/" + code + "/";

function isOpen(s, now) {
  return s.open !== false && (!s.closeAt || s.closeAt > (now || Date.now()));
}

function cleanQuestions(list) {
  if (!Array.isArray(list) || !list.length || list.length > 50) throw new Error("Cần 1–50 câu hỏi.");
  return list.map((q, i) => {
    const type = TYPES.includes(q && q.type) ? q.type : null;
    const text = String((q && q.text) || "").trim().slice(0, 500);
    if (!type || !text) throw new Error("Câu " + (i + 1) + " thiếu nội dung hoặc loại câu hỏi.");
    const out = { type, text, required: !!q.required };
    if (type === "single" || type === "multi") {
      out.options = (q.options || []).map((o) => String(o).trim().slice(0, 200)).filter(Boolean);
      if (out.options.length < 2 || out.options.length > 20) throw new Error("Câu " + (i + 1) + " cần 2–20 phương án.");
    }
    if (type === "rating") { out.low = String(q.low || "").slice(0, 60); out.high = String(q.high || "").slice(0, 60); }
    return out;
  });
}

// Kiểm tra và làm sạch câu trả lời của một phiếu. Ném lỗi có thông điệp hiển thị được.
function cleanAnswers(qs, answers) {
  if (!Array.isArray(answers) || answers.length !== qs.length) throw new Error("Dữ liệu trả lời không hợp lệ.");
  return qs.map((q, i) => {
    const a = answers[i];
    const empty = a === null || a === undefined || a === "" || (Array.isArray(a) && !a.length);
    if (empty) { if (q.required) throw new Error("Câu " + (i + 1) + " là câu bắt buộc."); return null; }
    const inRange = (x) => Number.isInteger(x) && x >= 0 && x < (q.options || []).length;
    if (q.type === "single") { if (!inRange(a)) throw new Error("Dữ liệu trả lời không hợp lệ."); return a; }
    if (q.type === "multi") {
      if (!Array.isArray(a) || !a.every(inRange)) throw new Error("Dữ liệu trả lời không hợp lệ.");
      return Array.from(new Set(a));
    }
    if (q.type === "rating") { if (!Number.isInteger(a) || a < 1 || a > 5) throw new Error("Dữ liệu trả lời không hợp lệ."); return a; }
    return String(a).slice(0, 1000);
  });
}

async function getSurvey(code) { return validCode(code) ? store.get(surveyKey(code)) : null; }

module.exports = { validCode, surveyKey, respPrefix, isOpen, cleanQuestions, cleanAnswers, getSurvey };
