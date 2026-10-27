// AI cho khảo sát (chỉ dành cho quản trị viên): soạn bộ câu hỏi, rà soát câu hỏi, phân tích kết quả.
// Nguyên tắc: AI chỉ ĐỀ XUẤT. Mọi bản soạn đều qua ks.cleanQuestions như khi lưu; không tự lưu gì.
// Phân tích: chỉ gửi số liệu tổng hợp + câu trả lời tự do đã xoá email/số điện thoại/đường link; KHÔNG gửi tên, mã nhân viên.
const llm = require("./llm");
const ks = require("./survey");

const str = ks.str;
const OPS = ["eq", "neq", "has", "nothas", "gt", "gte", "lt", "lte", "empty", "notempty"];
const fold = (t) => String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "d").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

function extractJson(text) {
  const s = String(text || "").trim().replace(/^```[a-z]*\s*/i, "").replace(/```\s*$/i, "").trim();
  const a = s.indexOf("{"), b = s.lastIndexOf("}");
  if (a < 0 || b < a) return null;
  try { return JSON.parse(s.slice(a, b + 1)); } catch (e) { return null; }
}
function aiError(e) {
  return e && e.status === 503 ? "Chưa cấu hình dịch vụ AI, liên hệ quản trị viên." : "Không gọi được AI, hãy thử lại sau ít phút.";
}

/* ======================= 1. SOẠN BỘ CÂU HỎI ======================= */
const SCHEMA = [
  "Mỗi câu hỏi là một đối tượng có: id (\"q1\",\"q2\"...), type, text, help (gợi ý ngắn, tuỳ chọn), required (true/false).",
  "Các loại (type) và trường riêng:",
  "- single: options (2–8 mục), allowOther (true/false)",
  "- multi: options (2–8 mục), allowOther, min, max (số lựa chọn tối thiểu/tối đa, 0 = không giới hạn)",
  "- yesno: không có trường riêng (0 = Có, 1 = Không)",
  "- rating: max (5 hoặc 7), low, high (nhãn hai đầu thang)",
  "- nps: thang 0–10 (khả năng giới thiệu)",
  "- matrix: rows (các mục cần đánh giá), cols (3–5 mức độ, từ thấp đến cao)",
  "- ranking: options (3–6 mục cần xếp thứ tự ưu tiên)",
  "- text: multiline (true nếu câu trả lời dài), validate (\"\" hoặc \"email\" hoặc \"phone\")",
  "- number: min, max, integer, unit",
  "- date: không có trường riêng",
  "- section: chỉ có text (tiêu đề trang) và help; dùng để chia trang khi khảo sát dài (trên 8 câu)",
  "Logic hiện câu (tuỳ chọn): showIf = {\"mode\":\"all\",\"rules\":[{\"q\":\"id của câu ĐỨNG TRƯỚC\",\"op\":\"eq|neq|has|nothas|gt|gte|lt|lte|empty|notempty\",\"v\":số}]}.",
  "Với single/multi, v là CHỈ SỐ đáp án đếm từ 0; với yesno v=0 là Có, v=1 là Không; với rating/nps/number v là giá trị số. endIf cùng dạng (kết thúc khảo sát sớm)."
].join("\n");

function draftPrompt(a) {
  const sys =
    "Bạn là chuyên gia thiết kế khảo sát nội bộ cho doanh nghiệp bán lẻ điện máy gia dụng và máy lọc nước tại Việt Nam. " +
    "Hãy soạn bộ câu hỏi khảo sát bằng tiếng Việt tự nhiên, ngắn gọn, dễ hiểu khi làm trên điện thoại. " +
    "Nguyên tắc: câu hỏi trung lập, không dẫn dắt; mỗi câu chỉ hỏi một ý; không hỏi thông tin nhạy cảm (CMND, thu nhập cụ thể, sức khoẻ); " +
    "trộn các loại câu hỏi hợp lý (ưu tiên câu chọn sẵn, dùng câu trả lời tự do ít thôi, tối đa 2–3 câu); câu quan trọng đặt required=true, câu tự do thường không bắt buộc; " +
    "đúng " + a.count + " câu hỏi (không tính các section)" + (a.count > 8 ? ", chia trang bằng section" : "") + "; " +
    (a.logic ? "nên có 1–2 điều kiện hiện câu tự nhiên (ví dụ hỏi lý do khi điểm thấp), chỉ tham chiếu câu ĐỨNG TRƯỚC; " : "không dùng showIf/endIf; ") +
    "KHÔNG bịa số liệu hay chính sách cụ thể của công ty.\n\n" + SCHEMA + "\n\n" +
    "Chỉ trả về DUY NHẤT một đối tượng JSON hợp lệ dạng: {\"title\":\"...\",\"description\":\"1–2 câu giới thiệu\",\"questions\":[...]}.";
  const user = "Mục tiêu / mô tả khảo sát: " + a.prompt + (a.audience ? "\nĐối tượng trả lời: " + a.audience : "");
  return [{ role: "system", content: sys }, { role: "user", content: user }];
}

function okValue(tq, op, v) {
  if (op === "empty" || op === "notempty") return true;
  if (!Number.isFinite(v)) return false;
  if (!tq) return false;
  if (tq.type === "single" || tq.type === "multi") return Number.isInteger(v) && v >= 0 && v <= (tq.options || []).length;
  if (tq.type === "yesno") return v === 0 || v === 1;
  if (tq.type === "rating") return Number.isInteger(v) && v >= 1 && v <= (tq.max || 5);
  if (tq.type === "nps") return Number.isInteger(v) && v >= 0 && v <= 10;
  if (tq.type === "number") return true;
  return false;
}
function lines(a, min, max) {
  const out = (Array.isArray(a) ? a : []).map((x) => str(x, 200)).filter(Boolean);
  return out.length >= min ? out.slice(0, max) : null;
}
// Làm sạch bản nháp AI thành bộ câu hỏi hợp lệ (cùng bước làm sạch khi lưu). Trả {title,description,questions} hoặc {error}.
function sanitizeDraft(o, want) {
  if (!o || !Array.isArray(o.questions)) return { error: "AI trả về dữ liệu không đúng dạng, hãy thử lại." };
  const list = [], byId = {};
  let nq = 0;
  o.questions.slice(0, 80).forEach((q, i) => {
    if (!q || typeof q !== "object") return;
    let type = ks.TYPES.includes(q.type) ? q.type : "text";
    if (type !== "section" && want && nq >= want) return;
    const x = { id: /^[a-z0-9_]{1,20}$/.test(String(q.id || "")) && !byId[q.id] ? String(q.id) : "q" + (i + 1), type, text: str(q.text, 500), help: str(q.help, 500), required: !!q.required };
    if (!x.text) return;
    if (type === "single" || type === "multi") {
      const op = lines(q.options, 2, type === "multi" ? 12 : 12);
      if (!op) { x.type = type = "text"; } else { x.options = op; x.allowOther = !!q.allowOther; x.randomize = false; if (type === "multi") { x.min = Number(q.min) || 0; x.max = Number(q.max) || 0; } }
    }
    if (type === "ranking") { const op = lines(q.options, 3, 8); if (!op) x.type = type = "text"; else x.options = op; }
    if (type === "matrix") { const r = lines(q.rows, 1, 10), c = lines(q.cols, 2, 6); if (!r || !c) x.type = type = "text"; else { x.rows = r; x.cols = c; } }
    if (type === "rating") { x.max = Number(q.max) === 7 ? 7 : 5; x.low = str(q.low, 60); x.high = str(q.high, 60); }
    if (type === "nps") { x.low = str(q.low, 60); x.high = str(q.high, 60); }
    if (type === "text") { x.multiline = !!q.multiline; x.validate = ["email", "phone"].includes(q.validate) ? q.validate : ""; }
    if (type === "number") { x.min = Number.isFinite(Number(q.min)) && q.min !== null && q.min !== "" ? Number(q.min) : null; x.max = Number.isFinite(Number(q.max)) && q.max !== null && q.max !== "" ? Number(q.max) : null; x.integer = !!q.integer; x.unit = str(q.unit, 20); }
    ["showIf", "endIf"].forEach((k) => {
      const c = q[k]; if (!c || type === "section" && k === "endIf") return;
      const rules = (Array.isArray(c.rules) ? c.rules : c.q ? [c] : []).filter((r) => r && OPS.includes(r.op) && byId[String(r.q)] && okValue(byId[String(r.q)], r.op, Number(r.v)))
        .slice(0, 4).map((r) => (["empty", "notempty"].includes(r.op) ? { q: String(r.q), op: r.op } : { q: String(r.q), op: r.op, v: Number(r.v) }));
      if (rules.length) x[k] = { mode: c.mode === "any" ? "any" : "all", rules };
    });
    if (type !== "section") { byId[x.id] = x; nq++; }
    list.push(x);
  });
  if (!nq) return { error: "AI chưa soạn được câu hỏi nào, hãy mô tả rõ hơn và thử lại." };
  let questions;
  try { questions = ks.cleanQuestions(list); } catch (e) { return { error: "Bản AI soạn có chỗ chưa hợp lệ (" + e.message + "). Hãy thử lại." }; }
  return { title: str(o.title, 200), description: str(o.description, 2000), questions };
}
async function draft(a) {
  const prompt = str(a.prompt, 1200);
  if (prompt.length < 8) return { error: "Hãy mô tả mục tiêu khảo sát (ít nhất vài chữ)." };
  const count = Math.min(25, Math.max(3, parseInt(a.count, 10) || 8));
  let raw;
  try { raw = await llm.chat(draftPrompt({ prompt, count, audience: str(a.audience, 200), logic: a.logic !== false }), { json: true, temperature: 0.6, max_tokens: 3600, timeoutMs: 42000, task: "ks_draft" }); }
  catch (e) { return { error: aiError(e) }; }
  return sanitizeDraft(extractJson(raw), count);
}

/* ======================= 2. RÀ SOÁT CÂU HỎI ======================= */
function describeQ(q, i) {
  const bits = [(i + 1) + ". [" + q.type + "] " + q.text + (q.required ? " (bắt buộc)" : "")];
  if (q.options) bits.push("   lựa chọn: " + q.options.join(" | ") + (q.allowOther ? " | Khác" : ""));
  if (q.rows) bits.push("   dòng: " + q.rows.join(" | ") + "; cột: " + q.cols.join(" | "));
  if (q.showIf) bits.push("   (chỉ hiện khi có điều kiện)");
  return bits.join("\n");
}
async function review(a) {
  let qs;
  try { qs = ks.cleanQuestions(a.questions); } catch (e) { return { error: "Hãy sửa lỗi sau trước khi rà soát: " + e.message }; }
  const sys =
    "Bạn là chuyên gia thiết kế khảo sát. Hãy rà soát bộ câu hỏi dưới đây (tiếng Việt) và chỉ ra các vấn đề thật sự đáng sửa: " +
    "câu dẫn dắt/thiên lệch (dan_dat), hỏi hai ý trong một câu (hai_y), câu mơ hồ hoặc khó hiểu (mo_ho), thiếu lựa chọn quan trọng hoặc lựa chọn trùng/chồng lấn (lua_chon), " +
    "câu thừa hoặc trùng ý (trung), khảo sát quá dài (qua_dai), câu nhạy cảm (nhay_cam), thiếu câu quan trọng cho mục tiêu (thieu_cau). " +
    "Chỉ nêu tối đa 8 ghi chú quan trọng nhất; nếu bộ câu hỏi đã tốt thì để danh sách rỗng. Với ghi chú về một câu cụ thể, nếu có thể hãy đề xuất cách viết lại câu (viet_lai). " +
    "Chỉ trả về JSON: {\"tong_quan\":\"1–2 câu nhận xét chung\",\"ghi_chu\":[{\"cau\":số thứ tự câu hoặc 0 nếu là nhận xét chung,\"loai\":\"...\",\"van_de\":\"...\",\"goi_y\":\"...\",\"viet_lai\":\"... (tuỳ chọn)\"}]}.";
  const user = "Tên: " + str(a.title, 200) + "\nMô tả: " + str(a.description, 500) + "\n\n" + qs.map(describeQ).join("\n");
  let raw;
  try { raw = await llm.chat([{ role: "system", content: sys }, { role: "user", content: user }], { json: true, temperature: 0.3, max_tokens: 1800, timeoutMs: 40000, task: "ks_review" }); }
  catch (e) { return { error: aiError(e) }; }
  const o = extractJson(raw);
  if (!o) return { error: "AI trả về dữ liệu không đúng dạng, hãy thử lại." };
  const KINDS = ["dan_dat", "hai_y", "mo_ho", "lua_chon", "trung", "qua_dai", "nhay_cam", "thieu_cau"];
  const notes = (Array.isArray(o.ghi_chu) ? o.ghi_chu : []).slice(0, 8).map((n) => {
    const cau = Number.isInteger(Number(n && n.cau)) ? Number(n.cau) : 0;
    const q = cau >= 1 && cau <= qs.length ? qs[cau - 1] : null;
    return { cau: q ? cau : 0, loai: KINDS.includes(n && n.loai) ? n.loai : "khac", van_de: str(n && n.van_de, 400), goi_y: str(n && n.goi_y, 400), viet_lai: q && q.type !== "section" ? str(n && n.viet_lai, 500) : "" };
  }).filter((n) => n.van_de || n.goi_y);
  return { tong_quan: str(o.tong_quan, 500), ghi_chu: notes };
}

/* ======================= 3. PHÂN TÍCH KẾT QUẢ ======================= */
// Xoá thông tin liên lạc trong câu trả lời tự do trước khi gửi cho AI
function scrub(t) {
  return String(t == null ? "" : t).replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, "[email]").replace(/https?:\/\/\S+/gi, "[link]")
    .replace(/(\+?84|0)[\s.-]?\d(?:[\s.-]?\d){7,9}/g, "[sđt]").replace(/\s+/g, " ").trim();
}
function even(arr, k) { // lấy k phần tử rải đều (ổn định, không ngẫu nhiên)
  if (arr.length <= k) return arr.slice();
  const out = []; for (let i = 0; i < k; i++) out.push(arr[Math.floor(i * arr.length / k)]);
  return out;
}
const pc = (n, d) => (d ? Math.round(n * 100 / d) : 0);
function groupAvg(rows, qid, key, isNps) { // trung bình/NPS theo nhóm hồ sơ, chỉ nhóm có từ 5 phiếu (bảo vệ ẩn danh)
  const g = {};
  rows.forEach((r) => { const v = r.answers && r.answers[qid]; const k = r.meta && r.meta[key]; if (v === undefined || v === null || !k) return; (g[k] = g[k] || []).push(v); });
  const parts = Object.keys(g).filter((k) => g[k].length >= 5).map((k) => {
    const a = g[k], n = a.length;
    const val = isNps ? pc(a.filter((x) => x >= 9).length, n) - pc(a.filter((x) => x <= 6).length, n) : (a.reduce((s, x) => s + x, 0) / n).toFixed(2);
    return (key === "region" ? ({ bac: "Miền Bắc", nam: "Miền Nam" }[k] || k) : k) + " (n=" + n + "): " + val;
  });
  return parts.length >= 2 ? parts.join("; ") : "";
}
// Tạo văn bản số liệu cho AI. textBudget: số câu trả lời tự do tối đa mỗi câu.
function buildAnalysisInput(sv, rows, textBudget) {
  const total = rows.length, out = [], corpus = [];
  const roster = sv.identity === "roster";
  out.push("Khảo sát: " + str(sv.title, 200) + (sv.description ? "\nMô tả: " + str(sv.description, 400) : "") + "\nSố phiếu: " + total);
  sv.questions.forEach((q, i) => {
    if (q.type === "section") { out.push("\n== Trang: " + q.text + " =="); return; }
    const vals = rows.map((r) => r.answers && r.answers[q.id]).filter((v) => v !== undefined && v !== null);
    const L = ["\nCâu " + (i + 1) + " [" + q.type + "]: " + q.text + " — " + vals.length + "/" + total + " người trả lời"];
    if (!vals.length) { out.push(L.join("\n")); return; }
    if (q.type === "single" || q.type === "multi") {
      const n = q.options.length, cnt = new Array(n + 1).fill(0);
      vals.forEach((a) => (Array.isArray(a) ? a : [a]).forEach((x) => { if (cnt[x] !== undefined) cnt[x]++; }));
      q.options.forEach((o, k) => L.push("- " + o + ": " + cnt[k] + " (" + pc(cnt[k], vals.length) + "%)"));
      if (cnt[n]) { L.push("- Khác: " + cnt[n] + " (" + pc(cnt[n], vals.length) + "%)"); const ot = rows.map((r) => r.others && r.others[q.id]).filter(Boolean).map((t) => scrub(t).slice(0, 160)); even(ot, 20).forEach((t) => { L.push("  · " + t); corpus.push(t); }); }
    } else if (q.type === "yesno") {
      const y = vals.filter((a) => a === 0).length; L.push("- Có: " + y + " (" + pc(y, vals.length) + "%); Không: " + (vals.length - y) + " (" + pc(vals.length - y, vals.length) + "%)");
    } else if (q.type === "rating") {
      const m = q.max || 5; L.push("- Trung bình " + (vals.reduce((s, x) => s + x, 0) / vals.length).toFixed(2) + "/" + m + "; phân bố: " + Array.from({ length: m }, (_, k) => (k + 1) + "=" + vals.filter((x) => x === k + 1).length).join(", "));
      if (roster) ["title", "region", "manager"].forEach((g) => { const t = groupAvg(rows, q.id, g, false); if (t) L.push("- Trung bình theo " + ({ title: "chức danh", region: "miền", manager: "quản lí" }[g]) + ": " + t); });
    } else if (q.type === "nps") {
      const pro = vals.filter((x) => x >= 9).length, det = vals.filter((x) => x <= 6).length;
      L.push("- NPS = " + (pc(pro, vals.length) - pc(det, vals.length)) + " (ủng hộ 9–10: " + pc(pro, vals.length) + "%, trung lập 7–8: " + pc(vals.length - pro - det, vals.length) + "%, chê 0–6: " + pc(det, vals.length) + "%)");
      if (roster) ["title", "region", "manager"].forEach((g) => { const t = groupAvg(rows, q.id, g, true); if (t) L.push("- NPS theo " + ({ title: "chức danh", region: "miền", manager: "quản lí" }[g]) + ": " + t); });
    } else if (q.type === "matrix") {
      q.rows.forEach((r, ri) => { const a = vals.map((v) => v[ri]).filter((x) => x !== null && x !== undefined); if (!a.length) return;
        L.push("- " + r + " (n=" + a.length + "): " + q.cols.map((c, ci) => c + " " + pc(a.filter((x) => x === ci).length, a.length) + "%").join(", ")); });
    } else if (q.type === "ranking") {
      L.push("- Vị trí trung bình (1 = ưu tiên nhất): " + q.options.map((o, k) => ({ o, v: vals.reduce((s, a) => s + a.indexOf(k) + 1, 0) / vals.length })).sort((a, b) => a.v - b.v).map((x) => x.o + " " + x.v.toFixed(2)).join("; "));
    } else if (q.type === "number") {
      const s = vals.slice().sort((a, b) => a - b); L.push("- nhỏ nhất " + s[0] + ", lớn nhất " + s[s.length - 1] + ", trung bình " + (s.reduce((a, b) => a + b, 0) / s.length).toFixed(2) + ", trung vị " + s[Math.floor(s.length / 2)]);
    } else if (q.type === "text") {
      const t = vals.map((x) => scrub(x).slice(0, 260)).filter(Boolean);
      L.push("- Các câu trả lời tự do" + (t.length > textBudget ? " (mẫu " + textBudget + "/" + t.length + ")" : "") + ":");
      even(t, textBudget).forEach((x) => { L.push("  · " + x); corpus.push(x); });
    }
    out.push(L.join("\n"));
  });
  return { text: out.join("\n"), corpus: fold(corpus.join(" ")) };
}
function quoteOk(q, corpus) { const f = fold(q); return f.length >= 6 && corpus.indexOf(f) >= 0; }
function strList(a, n, len) { return (Array.isArray(a) ? a : []).map((x) => str(x, len)).filter(Boolean).slice(0, n); }
function sanitizeAnalysis(o, corpus) {
  if (!o || typeof o !== "object") return null;
  const LV = ["nhieu", "vua", "it"];
  const res = {
    tom_tat: strList(o.tom_tat, 6, 400), diem_manh: strList(o.diem_manh, 6, 300), van_de: strList(o.van_de, 6, 300),
    chu_de: (Array.isArray(o.chu_de) ? o.chu_de : []).slice(0, 8).map((c) => ({
      ten: str(c && c.ten, 80), muc_do: LV.includes(fold(c && c.muc_do).replace(/ /g, "")) ? fold(c.muc_do).replace(/ /g, "") : "vua", mo_ta: str(c && c.mo_ta, 400),
      trich_dan: strList(c && c.trich_dan, 2, 220).filter((q) => quoteOk(q, corpus)) // chỉ giữ trích dẫn có thật trong câu trả lời
    })).filter((c) => c.ten),
    de_xuat: (Array.isArray(o.de_xuat) ? o.de_xuat : []).slice(0, 6).map((d) => ({ viec: str(d && d.viec, 300), ly_do: str(d && d.ly_do, 300), uu_tien: ["cao", "trung_binh", "thap"].includes(d && d.uu_tien) ? d.uu_tien : "trung_binh" })).filter((d) => d.viec),
    luu_y: str(o.luu_y, 400)
  };
  return res.tom_tat.length || res.chu_de.length || res.de_xuat.length ? res : null;
}
async function analyze(sv, rows) {
  if (rows.length < 3) return { error: "Cần ít nhất 3 phiếu trả lời để AI phân tích (ít hơn thì số liệu không đáng tin và dễ lộ người trả lời)." };
  let budget = 120, input = buildAnalysisInput(sv, rows, budget);
  while (input.text.length > 26000 && budget > 15) { budget = Math.floor(budget / 2); input = buildAnalysisInput(sv, rows, budget); }
  const sys =
    "Bạn là chuyên viên phân tích khảo sát nội bộ của doanh nghiệp (bán lẻ điện máy gia dụng, máy lọc nước). Dựa DUY NHẤT vào số liệu và câu trả lời bên dưới, hãy viết bản phân tích bằng tiếng Việt, ngắn gọn, dễ hành động. " +
    "Quy tắc: không bịa số liệu; mọi con số phải khớp dữ liệu; nêu rõ nếu mẫu nhỏ (dưới 30 phiếu) thì chỉ mang tính tham khảo; không suy đoán về từng cá nhân; " +
    "chủ đề (chu_de) rút ra từ các câu trả lời tự do và lựa chọn 'Khác' (muc_do: nhieu|vua|it); trich_dan phải là câu/cụm từ chép NGUYÊN VĂN từ dữ liệu (tối đa 25 từ), nếu không chắc thì để rỗng; " +
    "đề xuất (de_xuat) phải cụ thể, gắn với dữ liệu, uu_tien: cao|trung_binh|thap. Nếu là khảo sát nhu cầu đào tạo, hãy nêu rõ chủ đề đào tạo ưu tiên, hình thức và thời điểm phù hợp. " +
    "Chỉ trả về JSON: {\"tom_tat\":[3–5 ý chính],\"diem_manh\":[...],\"van_de\":[...],\"chu_de\":[{\"ten\":\"\",\"muc_do\":\"\",\"mo_ta\":\"\",\"trich_dan\":[]}],\"de_xuat\":[{\"viec\":\"\",\"ly_do\":\"\",\"uu_tien\":\"\"}],\"luu_y\":\"độ tin cậy / hạn chế\"}.";
  let raw;
  try { raw = await llm.chat([{ role: "system", content: sys }, { role: "user", content: input.text }], { json: true, temperature: 0.25, max_tokens: 2400, timeoutMs: 42000, task: "ks_analyze" }); }
  catch (e) { return { error: aiError(e) }; }
  const res = sanitizeAnalysis(extractJson(raw), input.corpus);
  if (!res) return { error: "AI trả về dữ liệu không đúng dạng, hãy thử lại." };
  return { result: res, n: rows.length };
}

module.exports = { draft, review, analyze, sanitizeDraft, sanitizeAnalysis, buildAnalysisInput, scrub, extractJson, fold };
