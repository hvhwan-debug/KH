// Khảo sát tích hợp trong hệ thống kiểm tra. Lưu bằng store (Azure Blob), cùng nơi với dữ liệu bài kiểm tra:
//   ks/survey/<mã>.json            cấu hình khảo sát
//   ks/resp/<mã>/<id>.json         từng phiếu trả lời (id = mã nhân viên nếu chế độ "emp", ngược lại ngẫu nhiên)
//
// Mô hình câu hỏi (mỗi câu có id ổn định, câu trả lời lưu theo id):
//   section  tiêu đề + bắt đầu TRANG mới (không có câu trả lời)
//   single   chọn một (radio hoặc dropdown), có thể có lựa chọn "Khác"
//   multi    chọn nhiều, giới hạn tối thiểu/tối đa, có thể có "Khác"
//   yesno    Có / Không (0 = Có, 1 = Không)
//   rating   thang điểm 1..max (3–10)
//   nps      thang 0–10
//   matrix   bảng: mỗi dòng chọn một cột
//   ranking  sắp xếp thứ tự ưu tiên
//   text     văn bản ngắn / dài, kiểm tra email / số điện thoại
//   number   số (min, max, số nguyên)
//   date     ngày YYYY-MM-DD
// Logic: showIf (hiện câu khi thoả điều kiện) và endIf (kết thúc khảo sát sau câu này khi thoả điều kiện).
const store = require("./store");

const CODE_RE = /^[a-z0-9-]{2,40}$/;
const ID_RE = /^[a-z0-9_]{1,20}$/;
const TYPES = ["section", "single", "multi", "yesno", "rating", "nps", "matrix", "ranking", "text", "number", "date"];
const OPS = ["eq", "neq", "has", "nothas", "gt", "gte", "lt", "lte", "empty", "notempty"];
const MAX_Q = 100;

const validCode = (c) => CODE_RE.test(String(c || ""));
const surveyKey = (code) => "ks/survey/" + code + ".json";
const respPrefix = (code) => "ks/resp/" + code + "/";
const str = (v, n) => String(v == null ? "" : v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ").trim().slice(0, n);
const isInt = Number.isInteger;

// ---------- Trạng thái mở / đóng ----------
// Trả về "open" | "notyet" | "closed"
function state(s, now) {
  now = now || Date.now();
  if (s.open === false) return "closed";
  if (s.openAt && s.openAt > now) return "notyet";
  if (s.closeAt && s.closeAt <= now) return "closed";
  return "open";
}

// ---------- Điều kiện ----------
function cleanCond(c, priorIds, label) {
  if (!c || !Array.isArray(c.rules) || !c.rules.length) return null;
  if (c.rules.length > 10) throw new Error(label + ": tối đa 10 điều kiện.");
  const rules = c.rules.map((r) => {
    const q = String(r.q || "");
    if (!priorIds.includes(q)) throw new Error(label + ": điều kiện phải dựa trên một câu hỏi ĐỨNG TRƯỚC câu này.");
    if (!OPS.includes(r.op)) throw new Error(label + ": phép so sánh không hợp lệ.");
    const out = { q, op: r.op };
    if (!["empty", "notempty"].includes(r.op)) {
      const v = Number(r.v);
      if (!Number.isFinite(v)) throw new Error(label + ": thiếu giá trị so sánh.");
      out.v = v;
    }
    return out;
  });
  return { mode: c.mode === "any" ? "any" : "all", rules };
}

function emptyVal(a) {
  if (a === null || a === undefined || a === "") return true;
  if (Array.isArray(a)) return !a.length || a.every((x) => x === null || x === undefined);
  return false;
}
function evalRule(r, answers) {
  const a = answers[r.q];
  if (r.op === "empty") return emptyVal(a);
  if (r.op === "notempty") return !emptyVal(a);
  if (emptyVal(a)) return r.op === "neq" || r.op === "nothas";
  if (r.op === "has") return Array.isArray(a) && a.includes(r.v);
  if (r.op === "nothas") return !(Array.isArray(a) && a.includes(r.v));
  const n = Number(a);
  if (!Number.isFinite(n)) return false;
  switch (r.op) {
    case "eq": return n === r.v;
    case "neq": return n !== r.v;
    case "gt": return n > r.v;
    case "gte": return n >= r.v;
    case "lt": return n < r.v;
    case "lte": return n <= r.v;
  }
  return false;
}
function evalCond(c, answers) {
  if (!c || !c.rules || !c.rules.length) return true;
  return c.mode === "any" ? c.rules.some((r) => evalRule(r, answers)) : c.rules.every((r) => evalRule(r, answers));
}

// Câu nào đang hiển thị với bộ câu trả lời này. Câu ẩn bị bỏ qua khi tính điều kiện cho các câu sau.
function visibility(qs, answers) {
  const vis = [], eff = {};
  let ended = false, pageHidden = false; // tiêu đề trang bị ẩn thì ẩn cả trang (mọi câu cho tới tiêu đề trang kế tiếp)
  qs.forEach((q) => {
    const own = !ended && (!q.showIf || evalCond(q.showIf, eff));
    if (q.type === "section") pageHidden = !own;
    const v = own && !pageHidden;
    vis.push(v);
    if (v && q.type !== "section") {
      if (answers[q.id] !== undefined) eff[q.id] = answers[q.id];
      if (q.endIf && evalCond(q.endIf, eff)) ended = true;
    }
  });
  return vis;
}

// ---------- Làm sạch cấu hình câu hỏi ----------
function cleanOptions(list, min, max, label) {
  const out = [], seen = new Set();
  (Array.isArray(list) ? list : []).forEach((o) => {
    const t = str(o, 200);
    if (t && !seen.has(t.toLowerCase())) { seen.add(t.toLowerCase()); out.push(t); }
  });
  if (out.length < min || out.length > max) throw new Error(label + ": cần " + min + "–" + max + " mục (không trùng nhau).");
  return out;
}
function optNum(v) { if (v === "" || v === null || v === undefined) return null; const n = Number(v); return Number.isFinite(n) ? n : null; }

function cleanQuestions(list) {
  if (!Array.isArray(list) || !list.length || list.length > MAX_Q) throw new Error("Cần 1–" + MAX_Q + " câu hỏi.");
  const ids = [], used = new Set();
  const out = list.map((q, i) => {
    const label = "Câu " + (i + 1);
    const type = TYPES.includes(q && q.type) ? q.type : null;
    if (!type) throw new Error(label + ": loại câu hỏi không hợp lệ.");
    const text = str(q.text, 500);
    if (!text) throw new Error(label + (type === "section" ? ": cần tiêu đề trang." : ": thiếu nội dung câu hỏi."));
    let id = String(q.id || "");
    if (!ID_RE.test(id) || used.has(id)) { let n = i + 1; while (used.has("q" + n)) n++; id = "q" + n; }
    used.add(id);
    const o = { id, type, text, help: str(q.help, 500) };
    if (type !== "section") o.required = !!q.required;
    if (type === "single") {
      o.options = cleanOptions(q.options, 2, 30, label); o.allowOther = !!q.allowOther; o.randomize = !!q.randomize;
      o.display = q.display === "dropdown" ? "dropdown" : "radio";
    } else if (type === "multi") {
      o.options = cleanOptions(q.options, 2, 30, label); o.allowOther = !!q.allowOther; o.randomize = !!q.randomize;
      const n = o.options.length + (o.allowOther ? 1 : 0);
      let mn = optNum(q.min), mx = optNum(q.max);
      mn = mn === null ? 0 : Math.max(0, Math.floor(mn)); mx = mx === null ? 0 : Math.max(0, Math.floor(mx));
      if (mx && mx > n) mx = n; if (mn > n) mn = n;
      if (mx && mn > mx) throw new Error(label + ": số lựa chọn tối thiểu không được lớn hơn tối đa.");
      o.min = mn; o.max = mx; // 0 = không giới hạn
    } else if (type === "rating") {
      const m = optNum(q.max); o.max = m && m >= 3 && m <= 10 ? Math.floor(m) : 5;
      o.low = str(q.low, 60); o.high = str(q.high, 60);
    } else if (type === "nps") {
      o.low = str(q.low, 60) ; o.high = str(q.high, 60);
    } else if (type === "matrix") {
      o.rows = cleanOptions(q.rows, 1, 20, label + " (dòng)"); o.cols = cleanOptions(q.cols, 2, 10, label + " (cột)");
    } else if (type === "ranking") {
      o.options = cleanOptions(q.options, 2, 15, label); o.randomize = !!q.randomize;
    } else if (type === "text") {
      o.multiline = !!q.multiline; o.validate = ["email", "phone"].includes(q.validate) ? q.validate : "";
      const m = optNum(q.maxLen); o.maxLen = m && m >= 10 && m <= 2000 ? Math.floor(m) : (o.multiline ? 1000 : 200);
      o.placeholder = str(q.placeholder, 100);
    } else if (type === "number") {
      o.min = optNum(q.min); o.max = optNum(q.max); o.integer = !!q.integer;
      if (o.min !== null && o.max !== null && o.min > o.max) throw new Error(label + ": giá trị nhỏ nhất lớn hơn lớn nhất.");
      o.unit = str(q.unit, 20);
    } else if (type === "date") {
      const d = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || "")) ? String(v) : "");
      o.min = d(q.min); o.max = d(q.max);
    }
    if (q.showIf) { const c = cleanCond(q.showIf, ids.slice(), label + " (điều kiện hiện)"); if (c) o.showIf = c; }
    if (q.endIf && type !== "section") { const c = cleanCond(q.endIf, ids.concat([id]), label + " (điều kiện kết thúc)"); if (c) o.endIf = c; }
    if (type !== "section") ids.push(id);
    return o;
  });
  if (!out.some((q) => q.type !== "section")) throw new Error("Cần ít nhất một câu hỏi (không chỉ là tiêu đề trang).");
  return out;
}

// ---------- Kiểm tra câu trả lời ----------
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[0-9+\s().-]{8,20}$/;
function validDate(s) { if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false; const d = new Date(s + "T00:00:00Z"); return !isNaN(d) && d.toISOString().slice(0, 10) === s; }

class AnsErr extends Error {}
function fail(i, msg) { throw new AnsErr("Câu " + (i + 1) + ": " + msg); }

// Kiểm tra MỘT câu. Trả về giá trị đã làm sạch hoặc null (bỏ trống). `other` là chữ của ô "Khác".
function cleanOne(q, a, other, i) {
  if (emptyVal(a)) { if (q.required) fail(i, "đây là câu bắt buộc."); return { v: null }; }
  const res = { v: null };
  switch (q.type) {
    case "single": {
      const n = q.options.length, max = n + (q.allowOther ? 1 : 0);
      if (!isInt(a) || a < 0 || a >= max) fail(i, "lựa chọn không hợp lệ.");
      res.v = a;
      if (a === n) { const t = str(other, 200); if (!t) fail(i, "hãy ghi rõ lựa chọn \"Khác\"."); res.other = t; }
      break;
    }
    case "multi": {
      const n = q.options.length, max = n + (q.allowOther ? 1 : 0);
      if (!Array.isArray(a) || !a.every((x) => isInt(x) && x >= 0 && x < max)) fail(i, "lựa chọn không hợp lệ.");
      const v = Array.from(new Set(a)).sort((x, y) => x - y);
      if (q.min && v.length < q.min) fail(i, "chọn ít nhất " + q.min + " mục.");
      if (q.max && v.length > q.max) fail(i, "chọn tối đa " + q.max + " mục.");
      res.v = v;
      if (v.includes(n)) { const t = str(other, 200); if (!t) fail(i, "hãy ghi rõ lựa chọn \"Khác\"."); res.other = t; }
      break;
    }
    case "yesno": if (a !== 0 && a !== 1) fail(i, "lựa chọn không hợp lệ."); res.v = a; break;
    case "rating": if (!isInt(a) || a < 1 || a > q.max) fail(i, "điểm không hợp lệ."); res.v = a; break;
    case "nps": if (!isInt(a) || a < 0 || a > 10) fail(i, "điểm không hợp lệ."); res.v = a; break;
    case "matrix": {
      if (!Array.isArray(a) || a.length !== q.rows.length || !a.every((x) => x === null || (isInt(x) && x >= 0 && x < q.cols.length))) fail(i, "dữ liệu không hợp lệ.");
      if (q.required && a.some((x) => x === null)) fail(i, "hãy chọn đủ cho tất cả các dòng.");
      res.v = a; break;
    }
    case "ranking": {
      const n = q.options.length;
      if (!Array.isArray(a) || a.length !== n || new Set(a).size !== n || !a.every((x) => isInt(x) && x >= 0 && x < n)) fail(i, "thứ tự không hợp lệ.");
      res.v = a; break;
    }
    case "text": {
      const t = str(a, q.maxLen);
      if (!t) { if (q.required) fail(i, "đây là câu bắt buộc."); return { v: null }; }
      if (q.validate === "email" && !EMAIL_RE.test(t)) fail(i, "email chưa đúng định dạng.");
      if (q.validate === "phone" && !PHONE_RE.test(t)) fail(i, "số điện thoại chưa đúng định dạng.");
      res.v = t; break;
    }
    case "number": {
      const n = typeof a === "number" ? a : Number(a);
      if (!Number.isFinite(n)) fail(i, "hãy nhập một số.");
      if (q.integer && !isInt(n)) fail(i, "hãy nhập số nguyên.");
      if (q.min !== null && n < q.min) fail(i, "giá trị nhỏ nhất là " + q.min + ".");
      if (q.max !== null && n > q.max) fail(i, "giá trị lớn nhất là " + q.max + ".");
      res.v = n; break;
    }
    case "date": {
      const d = String(a);
      if (!validDate(d)) fail(i, "ngày không hợp lệ.");
      if (q.min && d < q.min) fail(i, "ngày sớm nhất là " + q.min + ".");
      if (q.max && d > q.max) fail(i, "ngày muộn nhất là " + q.max + ".");
      res.v = d; break;
    }
  }
  return res;
}

// answers/others: object theo id câu hỏi. Chỉ giữ câu ĐANG HIỂN THỊ; câu ẩn bị loại và không bị bắt buộc.
function cleanAnswers(qs, answers, others) {
  if (!answers || typeof answers !== "object" || Array.isArray(answers)) throw new AnsErr("Dữ liệu trả lời không hợp lệ.");
  others = others && typeof others === "object" ? others : {};
  const vis = visibility(qs, answers);
  const outA = {}, outO = {};
  qs.forEach((q, i) => {
    if (q.type === "section" || !vis[i]) return;
    const r = cleanOne(q, answers[q.id], others[q.id], i);
    if (r.v !== null) { outA[q.id] = r.v; if (r.other) outO[q.id] = r.other; }
  });
  return { answers: outA, others: outO };
}

async function getSurvey(code) { return validCode(code) ? store.get(surveyKey(code)) : null; }
async function countResponses(code) { return (await store.list(respPrefix(code))).length; }

module.exports = {
  validCode, surveyKey, respPrefix, state, cleanQuestions, cleanAnswers, getSurvey, countResponses,
  visibility, evalCond, AnsErr, str, TYPES
};
