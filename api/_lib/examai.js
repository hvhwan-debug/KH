// Tạo câu hỏi trắc nghiệm bằng AI, dùng chung cho cả admin (kt-admin) và quản lí (kt-viewer).
// Trả về bản NHÁP để người dùng xem lại trước khi đưa vào ngân hàng đề - không tự động lưu.
const llm = require("./llm");

const MAX_COUNT = 30;

const BATCH = 10; // mỗi lần gọi AI soạn tối đa 10 câu: tránh bị cắt cụt vì giới hạn độ dài (trước đây xin 30 câu là hỏng)

function buildPrompt(topic, count, category, avoid) {
  const sys =
    "Bạn là trợ lí soạn câu hỏi trắc nghiệm cho bài kiểm tra nghiệp vụ nội bộ của nhân viên bán hàng (điện máy gia dụng, máy lọc nước...). " +
    "Soạn đúng " + count + " câu hỏi trắc nghiệm, mỗi câu có đúng 4 phương án, chỉ một đáp án đúng. " +
    "Yêu cầu chất lượng: câu hỏi rõ ràng, một ý; không đánh đố; không có hai đáp án cùng đúng; các phương án sai phải hợp lý và cùng độ dài tương đương đáp án đúng; " +
    "không dùng \"tất cả các đáp án trên\" / \"không có đáp án nào\"; ưu tiên tình huống thực tế khi tư vấn bán hàng. " +
    "Chỉ dùng kiến thức phổ biến, đã được công nhận rộng rãi; KHÔNG bịa thông số kỹ thuật, giá, chính sách bảo hành hay quy trình riêng của một công ty cụ thể. " +
    "Các câu phải khác nhau về nội dung, không trùng ý với nhau và với các câu đã có được liệt kê. " +
    "Chỉ trả về DUY NHẤT một đối tượng JSON hợp lệ đúng dạng: " +
    '{"questions":[{"text":"Nội dung câu hỏi","options":["...","...","...","..."],"correctIndex":0,"explain":"giải thích ngắn vì sao đúng"}]} ' +
    "(correctIndex đếm từ 0).";
  const user = "Chủ đề: " + topic + (category ? "\nDanh mục/ngành hàng: " + category : "") +
    (avoid && avoid.length ? "\nCác câu ĐÃ CÓ, không được soạn trùng ý:\n- " + avoid.slice(0, 40).map((t) => t.slice(0, 140)).join("\n- ") : "");
  return [{ role: "system", content: sys }, { role: "user", content: user }];
}

function extractQuestions(text) {
  let s = String(text || "").trim().replace(/^```[a-z]*\s*/i, "").replace(/```\s*$/i, "").trim();
  try { const o = JSON.parse(s.slice(s.indexOf("{"), s.lastIndexOf("}") + 1)); if (o && Array.isArray(o.questions)) return o.questions; } catch (e) { /* thử dạng mảng */ }
  const start = s.indexOf("["), end = s.lastIndexOf("]");
  if (start < 0 || end < start) return null;
  try { return JSON.parse(s.slice(start, end + 1)); } catch (e) { return null; }
}
const norm = (t) => String(t || "").toLowerCase().normalize("NFC").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
// Độ giống nhau giữa 2 câu (Jaccard trên từ): >= 0,8 coi là trùng ý
function similar(a, b) {
  const A = new Set(norm(a).split(" ").filter((w) => w.length > 1)), B = new Set(norm(b).split(" ").filter((w) => w.length > 1));
  if (!A.size || !B.size) return 0;
  let inter = 0; A.forEach((w) => { if (B.has(w)) inter++; });
  return inter / (A.size + B.size - inter);
}
function shuffleOptions(options, correctIndex) {
  const idx = options.map((_, i) => i);
  for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
  return { options: idx.map((i) => options[i]), correctIndex: idx.indexOf(correctIndex) };
}

// Sinh câu hỏi nháp. Không lưu gì cả - chỉ trả JSON cho người dùng xem lại.
// existing: danh sách nội dung câu đã có trong ngân hàng (để loại câu trùng ý).
async function generateDraft(topic, count, category, existing) {
  const t = String(topic || "").trim().slice(0, 300);
  if (!t) return { ok: false, error: "Nhập chủ đề cần soạn câu hỏi." };
  const n = Math.min(MAX_COUNT, Math.max(1, parseInt(count, 10) || 10));
  const known = (existing || []).map(String).filter(Boolean);
  const sizes = []; for (let left = n; left > 0; left -= BATCH) sizes.push(Math.min(BATCH, left));
  let lastErr = null, raws;
  // Các lượt chạy song song (tối đa 3), mỗi lượt có hạn chót riêng
  raws = await Promise.all(sizes.map((sz, i) => llm.chat(buildPrompt(t, sz + (i === 0 ? 1 : 0), category, known.filter((x) => similar(x, t) > 0.15 || known.length < 40)), { temperature: 0.7, max_tokens: 260 * (sz + 1) + 200, json: true, timeoutMs: 45000, task: "questions" })
    .catch((e) => { lastErr = e; return null; })));
  if (raws.every((r) => r == null)) return { ok: false, error: lastErr && lastErr.status === 503 ? "Chưa cấu hình dịch vụ AI, liên hệ quản trị viên." : "Không gọi được AI, thử lại sau." };
  const questions = [], seen = known.slice();
  let dup = 0, bad = 0;
  raws.forEach((raw) => {
    const arr = extractQuestions(raw); if (!Array.isArray(arr)) { if (raw) bad++; return; }
    arr.forEach((q) => {
      const text = String((q && q.text) || "").trim().slice(0, 2000);
      const options = Array.isArray(q && q.options) ? q.options.map((o) => String(o || "").trim().slice(0, 500)).filter(Boolean) : [];
      const ci = Number.isInteger(q && q.correctIndex) ? q.correctIndex : -1;
      const distinct = new Set(options.map(norm)).size === options.length;
      if (!text || options.length < 2 || ci < 0 || ci >= options.length || !distinct) { bad++; return; }
      if (seen.some((x) => similar(x, text) >= 0.8)) { dup++; return; }
      seen.push(text);
      const sh = shuffleOptions(options, ci); // AI hay đặt đáp án đúng ở vị trí đầu: xáo lại cho đều
      questions.push({ text, options: sh.options, correctIndex: sh.correctIndex, category: String(category || "").trim().slice(0, 100), explain: String((q && q.explain) || "").trim().slice(0, 300) });
    });
  });
  if (!questions.length) return { ok: false, error: dup ? "AI chỉ soạn ra câu trùng với câu đã có, hãy đổi chủ đề hoặc thử lại." : "AI không trả về câu hỏi hợp lệ nào, thử lại." };
  return { ok: true, questions: questions.slice(0, n), skippedDuplicates: dup, skippedInvalid: bad, note: "Câu hỏi do AI soạn từ kiến thức phổ biến: hãy kiểm tra lại đáp án và đối chiếu với tài liệu nội bộ trước khi lưu." };
}

module.exports = { generateDraft, MAX_COUNT, similar };
