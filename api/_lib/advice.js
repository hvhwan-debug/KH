// Lời khuyên cải thiện sau khi thí sinh nộp bài.
// - LUÔN có bản dựa trên luật (tức thì, không phụ thuộc dịch vụ ngoài), nên nộp bài không bao giờ bị lỗi vì AI.
// - Nếu AI cấu hình sẵn và trả lời kịp (mặc định 7 giây) thì dùng bản AI viết lại cho tự nhiên và sát tình huống;
//   AI lỗi / chậm / trả sai định dạng thì tự dùng bản dựa trên luật.
// - KHÔNG tiết lộ đáp án hay nội dung câu hỏi (đề dùng trong nhiều ngày, lộ đáp án qua email là rò rỉ ngân hàng đề):
//   chỉ khuyên theo mảng kiến thức, cách ôn và cách làm bài.
const llm = require("./llm");

const MAX_ACTIONS = 5;
const DEFAULT_TIMEOUT_MS = Math.max(1000, parseInt(process.env.ADVICE_TIMEOUT_MS, 10) || 7000); // chờ AI tối đa bấy nhiêu rồi dùng bản dựa trên luật

function clip(s, n) { return String(s == null ? "" : s).replace(/[\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, n); }
// Bỏ định dạng markdown/HTML mà AI hay chèn để hiển thị và email luôn sạch.
function plain(s, n) { return clip(String(s == null ? "" : s).replace(/<[^>]*>/g, "").replace(/[*_`#>]+/g, "").replace(/^\s*[-•·]\s*/, ""), n); }

// Thống kê theo mảng kiến thức từ bản sao bài làm (paper) đã lưu lúc nộp.
function categoryStats(paper) {
  const m = {};
  (paper || []).forEach((q) => {
    const k = clip(q.category, 60) || "Kiến thức chung";
    const x = (m[k] = m[k] || { name: k, n: 0, ok: 0 });
    x.n++; if (q.ok) x.ok++;
  });
  return Object.keys(m).map((k) => Object.assign(m[k], { pct: m[k].n ? Math.round(m[k].ok / m[k].n * 100) : 0 }))
    .sort((a, b) => a.pct - b.pct || b.n - a.n);
}

// Mốc điểm tuân thủ kế tiếp: cần thêm bao nhiêu câu đúng để lên mốc cao hơn.
function nextBand(correct, total, settings) {
  if (!total || !settings || !settings.complianceEnabled) return null;
  const cur = correct / total * 10;
  const bands = [[settings.complianceLowMin, 10], [settings.complianceMidMin, 15], [settings.complianceHighMin, 20]]
    .filter((b) => b[0] > 0).sort((a, b) => a[0] - b[0]);
  const nb = bands.find((b) => b[0] > cur + 1e-9);
  if (!nb) return null;
  const need = Math.min(total, Math.ceil(nb[0] / 10 * total - 1e-9));
  return { points: nb[1], needCorrect: need, gap: Math.max(1, need - correct) };
}

// Tổng hợp dữ kiện để cả luật lẫn AI cùng dùng. prev = kết quả kỳ trước của chính thí sinh (nếu có): { pct, period }.
function facts(attempt, settings, prev) {
  const paper = Array.isArray(attempt.paper) ? attempt.paper : [];
  const total = attempt.total || (attempt.questionIds || []).length || paper.length;
  const correct = attempt.score != null ? attempt.score : paper.filter((q) => q.ok).length;
  const timeouts = Object.keys(attempt.answers || {}).filter((k) => attempt.answers[k] && attempt.answers[k].auto).length;
  const cats = categoryStats(paper);
  const secs = Math.max(10, attempt.secondsPerQuestion || (settings && settings.secondsPerQuestion) || 60);
  const dur = attempt.submittedAt && attempt.startedAt ? Math.round((attempt.submittedAt - attempt.startedAt) / 1000) : null;
  return {
    total, correct, wrong: attempt.wrong != null ? attempt.wrong : Math.max(0, total - correct - (attempt.blank || 0)), blank: attempt.blank || 0,
    pct: attempt.pct != null ? attempt.pct : (total ? Math.round(correct / total * 100) : 0),
    timeouts, categories: cats,
    weak: cats.filter((c) => c.ok < c.n && c.pct < 70).slice(0, 3),
    strong: cats.filter((c) => c.n >= 2 && c.pct >= 90).slice(0, 2),
    compliance: attempt.compliancePoints == null ? null : attempt.compliancePoints,
    nextBand: nextBand(correct, total, settings),
    practice: !!(attempt.practice || (settings && settings.practice)),
    avgSecPerQ: dur != null && total ? Math.round(dur / total) : null, secsPerQ: secs,
    prev: prev && prev.pct != null ? { pct: prev.pct, period: prev.period || "" } : null
  };
}

function trendSentence(f) {
  if (!f.prev) return "";
  const d = f.pct - f.prev.pct;
  const where = f.prev.period ? " kỳ " + f.prev.period : " lần trước";
  if (d >= 5) return "Bạn tiến bộ " + d + " điểm phần trăm so với" + where + " (" + f.prev.pct + "%).";
  if (d <= -5) return "Kết quả thấp hơn" + where + " (" + f.prev.pct + "%) " + Math.abs(d) + " điểm phần trăm, hãy xem lại cách ôn tập.";
  return "Kết quả tương đương" + where + " (" + f.prev.pct + "%).";
}

// ---- Bản dựa trên luật ----
function rulesAdvice(f) {
  const p = f.pct;
  const headline = p >= 90 ? "Kết quả xuất sắc" : p >= 80 ? "Kết quả tốt" : p >= 70 ? "Kết quả khá, còn có thể tốt hơn" : p >= 50 ? "Cần ôn tập thêm" : "Cần củng cố lại kiến thức nền";
  const parts = ["Bạn trả lời đúng " + f.correct + "/" + f.total + " câu (" + p + "%)."];
  const tr = trendSentence(f); if (tr) parts.push(tr);
  if (f.practice) parts.push("Đây là bài thi thử, không phải thi chính thức.");
  const actions = [];
  f.weak.forEach((c) => actions.push("Ôn lại mảng \"" + c.name + "\" (đúng " + c.ok + "/" + c.n + " câu): đọc lại tài liệu hoặc quy trình của mảng này, ghi ra 3-5 ý chính rồi tự trả lời lại không nhìn tài liệu."));
  if (!f.weak.length && f.wrong === 1) actions.push("Bạn chỉ sai 1 câu, có thể chỉ do đọc đề chưa kỹ: lần sau hãy đọc đủ các phương án trước khi chọn.");
  else if (!f.weak.length && f.wrong > 1) actions.push("Các câu sai rải rác ở nhiều mảng, không có mảng nào yếu rõ rệt: hãy đọc kỹ đề và đủ các phương án trước khi chọn, tránh chọn vội theo cảm tính.");
  if (f.timeouts > 0) actions.push("Có " + f.timeouts + " câu hết giờ chưa kịp trả lời: tập đọc đề nhanh hơn, và khi chưa chắc hãy chọn phương án hợp lý nhất thay vì để trống.");
  else if (f.blank > 0) actions.push("Có " + f.blank + " câu bỏ trống: khi chưa chắc, hãy loại trừ các phương án sai rồi chọn phương án hợp lý nhất, không để trống.");
  if (f.avgSecPerQ != null && f.avgSecPerQ < f.secsPerQ * 0.2 && p < 80) actions.push("Bạn làm bài khá nhanh (khoảng " + f.avgSecPerQ + " giây mỗi câu) trong khi còn nhiều thời gian: hãy dành thêm vài giây đọc lại câu hỏi trước khi chọn.");
  if (f.nextBand) actions.push("Để đạt " + f.nextBand.points + " điểm tuân thủ học tập, lần sau cần đúng ít nhất " + f.nextBand.needCorrect + "/" + f.total + " câu (bạn cần thêm " + f.nextBand.gap + " câu đúng).");
  if (p >= 90) actions.push("Bạn nắm kiến thức rất vững: hãy chia sẻ cách học của mình với đồng nghiệp trong nhóm.");
  else actions.push("Sau khi ôn, hãy hỏi quản lí trực tiếp để được giải đáp những phần còn mơ hồ.");
  return { source: "rules", headline, summary: parts.join(" "), actions: actions.slice(0, MAX_ACTIONS) };
}

// ---- Bản AI ----
function aiConfigured() {
  if (process.env.ADVICE_AI === "off") return false; // công tắc tắt khẩn cấp
  return process.env.AI_MODE === "mock" || !!(process.env.GROQ_API_KEY || (process.env.AZURE_OPENAI_ENDPOINT && process.env.AZURE_OPENAI_KEY && process.env.AZURE_OPENAI_DEPLOYMENT));
}
function buildPrompt(f) {
  const sys =
    "Bạn là huấn luyện viên đào tạo nghiệp vụ cho nhân viên bán hàng điện máy gia dụng và máy lọc nước. " +
    "Hãy viết lời khuyên ngắn gọn, thân thiện, cụ thể bằng tiếng Việt, xưng \"bạn\", dựa DUY NHẤT vào số liệu được cung cấp. " +
    "TUYỆT ĐỐI KHÔNG tiết lộ hoặc đoán đáp án của bất kỳ câu hỏi nào, KHÔNG nêu nội dung câu hỏi, KHÔNG bịa thông số sản phẩm, chính sách hay quy trình cụ thể của công ty. " +
    "Chỉ khuyên về: mảng kiến thức cần ôn và cách ôn hiệu quả, cách quản lý thời gian khi làm bài, việc nên làm tiếp theo (tự luyện lại, hỏi quản lí, trao đổi với đồng nghiệp). " +
    "Nếu là bài thi thử, nhắc rõ đây không phải thi chính thức. Giọng khích lệ, không phán xét. " +
    "Chỉ trả về DUY NHẤT một đối tượng JSON hợp lệ, không kèm lời dẫn hay dấu ```, đúng dạng: " +
    '{"headline":"tiêu đề tối đa 80 ký tự","summary":"1-3 câu nhận xét tổng quan","actions":["việc nên làm 1","việc nên làm 2","..."]} ' +
    "với 3 đến 5 mục trong actions, mỗi mục tối đa 160 ký tự, bắt đầu bằng động từ.";
  const data = {
    so_cau_dung: f.correct, tong_so_cau: f.total, ty_le_dung_phan_tram: f.pct, so_cau_sai: f.wrong, so_cau_bo_trong: f.blank, so_cau_het_gio: f.timeouts,
    cac_mang_kien_thuc: f.categories.map((c) => ({ mang: c.name, dung: c.ok, tong: c.n })),
    diem_tuan_thu: f.compliance, moc_diem_tuan_thu_ke_tiep: f.nextBand ? { diem: f.nextBand.points, can_dung_toi_thieu: f.nextBand.needCorrect, con_thieu: f.nextBand.gap } : null,
    la_bai_thi_thu: f.practice, ky_truoc: f.prev ? { ty_le_dung_phan_tram: f.prev.pct } : null,
    giay_trung_binh_moi_cau: f.avgSecPerQ, thoi_gian_toi_da_moi_cau_giay: f.secsPerQ
  };
  return [{ role: "system", content: sys }, { role: "user", content: "Số liệu bài làm:\n" + JSON.stringify(data) }];
}
function parseAi(text) {
  let s = String(text || "").trim().replace(/^```[a-z]*\s*/i, "").replace(/```\s*$/i, "").trim();
  const a = s.indexOf("{"), b = s.lastIndexOf("}");
  if (a < 0 || b < a) return null;
  let o; try { o = JSON.parse(s.slice(a, b + 1)); } catch (e) { return null; }
  const headline = plain(o && o.headline, 90), summary = plain(o && o.summary, 420);
  const actions = (Array.isArray(o && o.actions) ? o.actions : []).map((x) => plain(x, 180)).filter((x) => x.length >= 8).slice(0, MAX_ACTIONS);
  if (!headline || !summary || actions.length < 2) return null; // thiếu ý: bỏ, dùng bản luật
  return { source: "ai", headline, summary, actions };
}
function withTimeout(promise, ms) {
  let t; const to = new Promise((_, rej) => { t = setTimeout(() => rej(new Error("timeout")), ms); });
  return Promise.race([promise, to]).finally(() => clearTimeout(t));
}
async function aiAdvice(f, timeoutMs) {
  if (!aiConfigured()) return null;
  try {
    const raw = await withTimeout(llm.chat(buildPrompt(f), { temperature: 0.4, max_tokens: 600, task: "advice" }), timeoutMs || DEFAULT_TIMEOUT_MS);
    return parseAi(raw);
  } catch (e) { return null; }
}

// Lời khuyên tốt nhất có thể: AI nếu được, không thì luật. Luôn trả về một kết quả hợp lệ.
async function build(attempt, settings, prev, opt) {
  const f = facts(attempt, settings, prev);
  const rules = rulesAdvice(f);
  const useAI = !(opt && opt.ai === false);
  const ai = useAI ? await aiAdvice(f, opt && opt.timeoutMs) : null;
  const out = ai || rules;
  out.at = Date.now();
  return out;
}

module.exports = { build, facts, rulesAdvice, parseAi, categoryStats, nextBand, aiConfigured };
