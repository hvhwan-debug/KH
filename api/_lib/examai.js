// Tạo câu hỏi trắc nghiệm bằng AI, dùng chung cho cả admin (kt-admin) và quản lí (kt-viewer).
// Trả về bản NHÁP để người dùng xem lại trước khi đưa vào ngân hàng đề - không tự động lưu.
const llm = require("./llm");

const MAX_COUNT = 30;

function buildPrompt(topic, count, category) {
  const sys =
    "Bạn là trợ lí soạn câu hỏi trắc nghiệm cho bài kiểm tra nghiệp vụ nội bộ của nhân viên bán hàng (điện máy gia dụng, máy lọc nước...). " +
    "Soạn đúng " + count + " câu hỏi trắc nghiệm, mỗi câu có đúng 4 phương án (A/B/C/D), chỉ một đáp án đúng. " +
    "Câu hỏi phải RÕ RÀNG, không đánh đố vô lý, không có hai đáp án cùng đúng, các phương án sai phải hợp lý (không ngớ ngẩn). " +
    "Chỉ trả về DUY NHẤT một mảng JSON hợp lệ, không kèm lời dẫn, không kèm dấu ```, đúng định dạng:\n" +
    '[{"text":"Nội dung câu hỏi","options":["Phương án A","Phương án B","Phương án C","Phương án D"],"correctIndex":0}]\n' +
    "correctIndex đếm từ 0 (0 = phương án đầu tiên trong mảng options).";
  const user = "Chủ đề: " + topic + (category ? "\nDanh mục/ngành hàng: " + category : "");
  return [{ role: "system", content: sys }, { role: "user", content: user }];
}

function extractJsonArray(text) {
  let s = String(text || "").trim();
  s = s.replace(/^```[a-z]*\s*/i, "").replace(/```\s*$/i, "").trim();
  const start = s.indexOf("["), end = s.lastIndexOf("]");
  if (start < 0 || end < start) return null;
  try { return JSON.parse(s.slice(start, end + 1)); } catch (e) { return null; }
}

// Sinh câu hỏi nháp. Không lưu gì cả - chỉ trả JSON cho người dùng xem lại.
async function generateDraft(topic, count, category) {
  const t = String(topic || "").trim().slice(0, 300);
  if (!t) return { ok: false, error: "Nhập chủ đề cần soạn câu hỏi." };
  const n = Math.min(MAX_COUNT, Math.max(1, parseInt(count, 10) || 10));
  let raw;
  try {
    raw = await llm.chat(buildPrompt(t, n, category), { temperature: 0.6, max_tokens: Math.min(1500, 120 * n) });
  } catch (e) {
    return { ok: false, error: e && e.status === 503 ? "Chưa cấu hình dịch vụ AI, liên hệ quản trị viên." : "Không gọi được AI, thử lại sau." };
  }
  const arr = extractJsonArray(raw);
  if (!Array.isArray(arr) || !arr.length) return { ok: false, error: "AI không trả về đúng định dạng, thử lại hoặc đổi chủ đề." };
  const questions = [];
  arr.forEach((q) => {
    const text = String((q && q.text) || "").trim().slice(0, 2000);
    const options = Array.isArray(q && q.options) ? q.options.map((o) => String(o || "").trim().slice(0, 500)).filter(Boolean) : [];
    const correctIndex = Number.isInteger(q && q.correctIndex) ? q.correctIndex : -1;
    if (text && options.length >= 2 && correctIndex >= 0 && correctIndex < options.length) {
      questions.push({ text, options, correctIndex, category: String(category || "").trim().slice(0, 100) });
    }
  });
  if (!questions.length) return { ok: false, error: "AI không trả về câu hỏi hợp lệ nào, thử lại." };
  return { ok: true, questions };
}

module.exports = { generateDraft, MAX_COUNT };
