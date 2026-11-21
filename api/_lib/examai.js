// Tạo câu hỏi trắc nghiệm bằng AI, dùng chung cho cả admin (kt-admin) và quản lí (kt-viewer).
// Trả về bản NHÁP để người dùng xem lại trước khi đưa vào ngân hàng đề - không tự động lưu.
const llm = require("./llm");
const { cleanText } = require("./cleantext");

const MAX_COUNT = 30;

const BATCH = 10; // mỗi lần gọi AI soạn tối đa 10 câu: tránh bị cắt cụt vì giới hạn độ dài (trước đây xin 30 câu là hỏng)

const DOC_CHUNK = 18000; // ký tự tài liệu gửi kèm MỖI lượt gọi AI (tài liệu dài: mỗi lượt nhận một phần khác nhau để câu hỏi trải đều)
const DOC_MAX = 150000;  // tổng ký tự tài liệu nhận từ trình duyệt

// Cắt tài liệu thành các phần ~DOC_CHUNK ký tự, ưu tiên cắt ở chỗ xuống dòng
function chunkDoc(text) {
  const t = String(text || "").replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim(), out = [];
  for (let i = 0; i < t.length;) {
    let end = Math.min(t.length, i + DOC_CHUNK);
    if (end < t.length) { const nl = t.lastIndexOf("\n", end); if (nl > i + DOC_CHUNK * 0.6) end = nl; }
    out.push(t.slice(i, end).trim()); i = end;
  }
  return out.filter(Boolean);
}

// Soạn câu hỏi DỰA TRÊN TÀI LIỆU người dùng gắn: đáp án phải kiểm chứng được trong tài liệu, không dùng kiến thức ngoài
function buildDocPrompt(topic, count, category, avoid, doc) {
  const sys =
    "Bạn là trợ lí soạn câu hỏi trắc nghiệm cho bài kiểm tra nội bộ của nhân viên bán hàng. " +
    "Soạn đúng " + count + " câu hỏi trắc nghiệm CHỈ DỰA TRÊN NỘI DUNG TÀI LIỆU người dùng cung cấp, mỗi câu có đúng 4 phương án, chỉ một đáp án đúng. " +
    "Quy tắc bắt buộc: (1) đáp án đúng phải tìm thấy hoặc suy ra trực tiếp từ tài liệu, không dùng kiến thức bên ngoài để quyết định đáp án; " +
    "(2) giữ nguyên số liệu, tên sản phẩm, model, thuật ngữ đúng như tài liệu, không bịa thêm; " +
    "(3) trải đều câu hỏi trên các phần khác nhau của tài liệu, ưu tiên ý quan trọng và tình huống áp dụng khi tư vấn bán hàng, tránh hỏi chi tiết vụn vặt; " +
    "(4) phương án sai phải hợp lý, cùng độ dài tương đương đáp án đúng, không dùng \"tất cả các đáp án trên\" / \"không có đáp án nào\"; " +
    "(5) các câu khác nhau về nội dung, không trùng ý với nhau và với các câu đã có. " +
    "Trường explain: một câu ngắn nêu căn cứ trong tài liệu (mục/ý nào). Nếu tài liệu không đủ nội dung cho đủ số câu thì soạn ít hơn, không bịa. " +
    "Chỉ trả về DUY NHẤT một đối tượng JSON hợp lệ đúng dạng: " +
    '{"questions":[{"text":"Nội dung câu hỏi","options":["...","...","...","..."],"correctIndex":0,"explain":"căn cứ trong tài liệu"}]} ' +
    "(correctIndex đếm từ 0).";
  const user = (topic ? "Trọng tâm cần hỏi: " + topic + "\n" : "") + (category ? "Danh mục/ngành hàng: " + category + "\n" : "") +
    "\n=== TÀI LIỆU: " + doc.name + (doc.part ? " (phần " + doc.part + ")" : "") + " ===\n" + doc.text + "\n=== HẾT TÀI LIỆU ===" +
    (avoid && avoid.length ? "\n\nCác câu ĐÃ CÓ, không được soạn trùng ý:\n- " + avoid.slice(0, 40).map((t) => t.slice(0, 140)).join("\n- ") : "");
  return [{ role: "system", content: sys }, { role: "user", content: user }];
}

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
// AI đôi khi tự escape dấu ngoặc kép 2 lần khi viết đáp án dạng "lời thoại" (vd mời khách mua kèm),
// khiến hiện ra chữ \" thừa thay vì dấu ngoặc bình thường; và hay bọc cả câu trong một cặp ngoặc kép
// thừa (không cần thiết vì đã là một phương án riêng biệt trên màn hình). Dọn sạch cả hai trường hợp.
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
// doc (tuỳ chọn): { name, text } tài liệu đã đọc chữ trên trình duyệt -> câu hỏi bám theo tài liệu
async function generateDraft(topic, count, category, existing, doc) {
  const dtext = doc && typeof doc.text === "string" ? doc.text.slice(0, DOC_MAX).trim() : "";
  const dname = cleanText((doc && doc.name) || "tài liệu").slice(0, 200) || "tài liệu";
  const t = String(topic || "").trim().slice(0, 300);
  if (!t && !dtext) return { ok: false, error: "Nhập chủ đề hoặc gắn tài liệu để soạn câu hỏi." };
  if (dtext && dtext.length < 200) return { ok: false, error: "Tài liệu quá ngắn (dưới 200 ký tự) để soạn câu hỏi. Kiểm tra lại file hoặc gắn thêm tài liệu." };
  const chunks = dtext ? chunkDoc(dtext) : [];
  const n = Math.min(MAX_COUNT, Math.max(1, parseInt(count, 10) || 10));
  const known = (existing || []).map(String).filter(Boolean);
  const sizes = []; for (let left = n; left > 0; left -= BATCH) sizes.push(Math.min(BATCH, left));
  let lastErr = null, raws;
  // Các lượt chạy song song (tối đa 3), mỗi lượt có hạn chót riêng
  // Tài liệu dài: mỗi lượt nhận một phần khác nhau (chọn đều từ đầu đến cuối tài liệu)
  // nhiều phần hơn số lượt: chia nhỏ số câu ra nhiều lượt hơn (tối đa 6 lượt song song) để phần nào của tài liệu cũng có câu hỏi
  if (chunks.length > sizes.length) { const nb = Math.min(chunks.length, 6, n); sizes.length = 0; for (let i = 0; i < nb; i++) sizes.push(Math.floor(n / nb) + (i < n % nb ? 1 : 0)); }
  const partOf = (i) => { if (!chunks.length) return null; const k = chunks.length <= sizes.length ? i % chunks.length : Math.round(i * (chunks.length - 1) / Math.max(1, sizes.length - 1)); return { name: dname, text: chunks[k], part: chunks.length > 1 ? (k + 1) + "/" + chunks.length : "" }; };
  const avoidFor = known.filter((x) => !t || similar(x, t) > 0.15 || known.length < 40);
  raws = await Promise.all(sizes.map((sz, i) => llm.chat(chunks.length ? buildDocPrompt(t, sz + (i === 0 ? 1 : 0), category, avoidFor, partOf(i)) : buildPrompt(t, sz + (i === 0 ? 1 : 0), category, avoidFor),
    { temperature: chunks.length ? 0.4 : 0.7, max_tokens: 260 * (sz + 1) + 200, json: true, timeoutMs: chunks.length ? 60000 : 45000, task: "questions" })
    .catch((e) => { lastErr = e; return null; })));
  if (raws.every((r) => r == null)) return { ok: false, error: lastErr && lastErr.status === 503 ? "Chưa cấu hình dịch vụ AI, liên hệ quản trị viên." : "Không gọi được AI, thử lại sau." };
  const questions = [], seen = known.slice();
  let dup = 0, bad = 0;
  raws.forEach((raw) => {
    const arr = extractQuestions(raw); if (!Array.isArray(arr)) { if (raw) bad++; return; }
    arr.forEach((q) => {
      const text = cleanText((q && q.text) || "").slice(0, 2000);
      const options = Array.isArray(q && q.options) ? q.options.map((o) => cleanText(o || "").slice(0, 500)).filter(Boolean) : [];
      const ci = Number.isInteger(q && q.correctIndex) ? q.correctIndex : -1;
      const distinct = new Set(options.map(norm)).size === options.length;
      if (!text || options.length < 2 || ci < 0 || ci >= options.length || !distinct) { bad++; return; }
      if (seen.some((x) => similar(x, text) >= 0.8)) { dup++; return; }
      seen.push(text);
      const sh = shuffleOptions(options, ci); // AI hay đặt đáp án đúng ở vị trí đầu: xáo lại cho đều
      const ex = cleanText((q && q.explain) || "").slice(0, 300), explanation = (chunks.length ? "Theo tài liệu \u201C" + dname + "\u201D" + (ex ? ": " + ex : ".") : ex).slice(0, 1000);
      questions.push({ text, options: sh.options, correctIndex: sh.correctIndex, category: String(category || "").trim().slice(0, 100), explain: ex, explanation }); // explanation: được lưu khi nhập vào ngân hàng đề
    });
  });
  if (!questions.length) return { ok: false, error: dup ? "AI chỉ soạn ra câu trùng với câu đã có, hãy đổi chủ đề hoặc thử lại." : "AI không trả về câu hỏi hợp lệ nào, thử lại." };
  return { ok: true, questions: questions.slice(0, n), skippedDuplicates: dup, skippedInvalid: bad, fromDoc: !!chunks.length, docParts: chunks.length,
    note: chunks.length ? "Câu hỏi do AI soạn từ tài liệu đã gắn: hãy kiểm tra lại đáp án với tài liệu trước khi lưu." : "Câu hỏi do AI soạn từ kiến thức phổ biến: hãy kiểm tra lại đáp án và đối chiếu với tài liệu nội bộ trước khi lưu." };
}

module.exports = { generateDraft, MAX_COUNT, similar, chunkDoc, DOC_MAX };
