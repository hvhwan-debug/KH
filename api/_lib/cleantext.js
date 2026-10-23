// Làm sạch chữ do AI soạn / nhập tay: bỏ dấu gạch chéo thừa trước dấu ngoặc kép (\" -> ") và bỏ các lớp
// ngoặc kép bọc cả chuỗi ("\"abc\"" -> abc). Chạy lặp nên xử lý được cả trường hợp bị escape 2-3 lần.
// Chuỗi có ngoặc kép THẬT ở giữa (vd: Chọn "A" hoặc "B") được giữ nguyên.
const QUOTES = "\"“”«»";
const WRAP = new RegExp("^[" + QUOTES + "]+([^" + QUOTES + "]*)[" + QUOTES + "]+$");

function cleanText(s) {
  let t = String(s == null ? "" : s);
  for (let i = 0; i < 6; i++) {
    const prev = t;
    t = t.replace(/\\+(["'])/g, "$1").trim();   // \" \\" \' -> " '
    const m = t.match(WRAP);
    if (m) t = m[1].trim();                     // "abc" / ""abc"" -> abc
    if (t === prev) break;
  }
  return t;
}
const cleanList = (a) => (Array.isArray(a) ? a.map(cleanText) : a);
// Làm sạch một câu hỏi lấy từ kho (không đổi thứ tự phương án nên đáp án đúng giữ nguyên)
function cleanQuestion(q) {
  if (!q || typeof q !== "object") return q;
  const o = Object.assign({}, q);
  if (typeof o.text === "string") o.text = cleanText(o.text);
  if (Array.isArray(o.options)) o.options = cleanList(o.options);
  if (Array.isArray(o.accepted)) o.accepted = cleanList(o.accepted);
  if (typeof o.explain === "string") o.explain = cleanText(o.explain);
  return o;
}
module.exports = { cleanText, cleanList, cleanQuestion };
