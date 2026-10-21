// Lời khuyên cải thiện sau khi thí sinh nộp bài.
// - LUÔN có bản dựa trên luật (tức thì, không phụ thuộc dịch vụ ngoài), nên nộp bài không bao giờ bị lỗi vì AI.
// - Nếu AI cấu hình sẵn và trả lời kịp (mặc định 7 giây) thì dùng bản AI viết lại cho tự nhiên và sát tình huống;
//   AI lỗi / chậm / trả sai định dạng thì tự dùng bản dựa trên luật.
// - KHÔNG tiết lộ đáp án hay nội dung câu hỏi (đề dùng trong nhiều ngày, lộ đáp án qua email là rò rỉ ngân hàng đề):
//   chỉ khuyên theo mảng kiến thức, cách ôn và cách làm bài.
const llm = require("./llm");

const MAX_ACTIONS = 5;
const DEFAULT_TIMEOUT_MS = Math.max(1000, parseInt(process.env.ADVICE_TIMEOUT_MS, 10) || 9000); // chờ AI tối đa bấy nhiêu rồi dùng bản dựa trên luật

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
function facts(attempt, settings, prev, ctx) {
  const paper = Array.isArray(attempt.paper) ? attempt.paper : [];
  const total = attempt.total || (attempt.questionIds || []).length || paper.length;
  const correct = attempt.score != null ? attempt.score : paper.filter((q) => q.ok).length;
  const timeouts = Object.keys(attempt.answers || {}).filter((k) => attempt.answers[k] && attempt.answers[k].auto).length;
  const cats = categoryStats(paper);
  const secs = Math.max(10, attempt.secondsPerQuestion || (settings && settings.secondsPerQuestion) || 60);
  const dur = attempt.submittedAt && attempt.startedAt ? Math.round((attempt.submittedAt - attempt.startedAt) / 1000) : null;
  // Tín hiệu hành vi làm bài (thời gian từng câu, hết giờ) từ cùng bộ phân tích dùng cho quản lí; lỗi thì bỏ qua, không ảnh hưởng lời khuyên
  let beh = null;
  try {
    const B = require("./behavior"), bf = B.featuresOf(attempt);
    beh = { hasTiming: bf.hasTiming, rush: B.patterns.rush(bf), struggle: B.patterns.struggle(bf), fastWrong: bf.fastWrong, slowWrong: bf.slowWrong, wrongAnswered: bf.wrong,
      fastWrongSec: bf.fastWrongSec, timeouts: bf.timeouts, lateTimeouts: bf.timeouts >= 2 && bf.timeoutsLastThird / bf.timeouts >= 0.7, rightMedSec: bf.rightMedSec,
      random: B.randomSignal(bf, attempt.paper) }; // kết quả gần mức đoán bừa + làm rất nhanh
  } catch (e) { beh = null; }
  // Chân dung làm bài (thống kê thuần): nhịp độ, phong độ, mảng, so với đồng nghiệp, lịch sử. Lỗi thì bỏ qua.
  let ins = null;
  try { ins = require("./insight").build(attempt, settings, ctx || {}); } catch (e) { ins = null; }
  return {
    beh, insight: ins, firstName: ins ? ins.firstName : "",
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

// Số liệu phân tích có cấu trúc để màn hình kết quả và email vẽ biểu đồ từ CÙNG một nguồn.
function analysisOf(f) {
  const rnd = f.beh && f.beh.random ? f.beh.random.chancePct : null;
  return {
    correct: f.correct, total: f.total, pct: f.pct,
    // Làm bừa thì thống kê theo mảng chỉ là nhiễu: không đưa ra để không gây hiểu nhầm
    categories: rnd != null ? [] : f.categories.map((c) => ({ name: c.name, n: c.n, ok: c.ok, pct: c.pct })),
    avgSec: f.avgSecPerQ, limitSec: f.secsPerQ, timeouts: f.timeouts,
    prev: f.prev, nextBand: f.nextBand, random: rnd
  };
}
// Bài lưu trước khi có phần phân tích: bổ sung từ bản sao bài làm (không đụng đến nội dung lời khuyên đã lưu)
function ensureAnalysis(adv, attempt, settings, prev) {
  if (adv && !adv.analysis) { try { adv.analysis = analysisOf(facts(attempt, settings, prev)); } catch (e) { /* bỏ qua */ } }
  return adv;
}

// ---- Bản dựa trên luật ----
// Thứ tự ưu tiên: (1) điều quan trọng nhất của bài này, (2) mảng cần ôn (gộp, không lặp mẫu câu), (3) cách làm bài, (4) mốc điểm, (5) bước tiếp theo.
function rulesAdvice(f) {
  const p = f.pct, b = f.beh || {}, rnd = b.random || null;
  const headline = rnd ? "Kết quả gần bằng mức đoán ngẫu nhiên"
    : p >= 90 ? "Kết quả xuất sắc" : p >= 80 ? "Kết quả tốt" : p >= 70 ? "Kết quả khá, còn có thể tốt hơn" : p >= 50 ? "Cần ôn tập thêm" : "Cần củng cố lại kiến thức nền";
  const parts = [rnd
    ? "Bạn đúng " + f.correct + "/" + f.total + " câu (" + p + "%), gần bằng mức nếu chọn bừa (khoảng " + rnd.chancePct + "%)" + (f.avgSecPerQ != null ? ", và mỗi câu chỉ mất khoảng " + f.avgSecPerQ + " giây" : "") + "."
    : "Bạn trả lời đúng " + f.correct + "/" + f.total + " câu (" + p + "%)."];
  if (rnd) parts.push("Kết quả này nhiều khả năng chưa phản ánh đúng kiến thức của bạn.");
  else { const tr = trendSentence(f); if (tr) parts.push(tr); }
  if (f.practice) parts.push("Đây là bài thi thử, không phải thi chính thức.");

  const actions = [];
  const timeoutAction = () => (f.beh && f.beh.lateTimeouts
    ? "Các câu hết giờ (" + f.timeouts + " câu) dồn ở cuối bài: hãy giữ nhịp, không dành quá " + Math.round(f.secsPerQ * 0.7) + " giây cho một câu; câu chưa chắc thì chọn phương án hợp lý nhất rồi làm tiếp."
    : "Có " + f.timeouts + " câu hết giờ chưa kịp trả lời: tập đọc đề nhanh hơn, và khi chưa chắc hãy chọn phương án hợp lý nhất thay vì để trống.");
  if (rnd) {
    // Làm bừa: thống kê theo mảng chỉ là nhiễu, nên KHÔNG khuyên ôn mảng nào, mà khuyên làm lại cho đúng
    actions.push("Hãy làm lại và đọc kỹ từng câu: mỗi câu cần ít nhất khoảng " + Math.max(10, Math.round(f.secsPerQ * 0.25)) + " giây để đọc đề và đủ các phương án trước khi chọn.");
    actions.push(f.practice
      ? "Nếu được làm lại bài thi thử, hãy thử lại nghiêm túc để nhận lời khuyên sát với kiến thức thật của bạn."
      : "Nếu bạn gặp sự cố khi làm bài (nhầm thao tác, mạng chậm...), hãy báo ngay cho quản lí để được hỗ trợ xem xét lại.");
    if (f.timeouts > 0) actions.push(timeoutAction());
  } else {
    if (f.weak.length >= 2) {
      const list = f.weak.map((c) => "\"" + c.name + "\" (đúng " + c.ok + "/" + c.n + ")").join(", ");
      const allWeak = f.categories.length >= 3 && f.categories.every((c) => c.pct < 60);
      actions.push((allWeak ? "Hầu hết các mảng đều yếu, nên cần ôn lại nội dung nền một cách có hệ thống, bắt đầu từ " : "Ưu tiên ôn các mảng sau, theo thứ tự yếu nhất: ") + list +
        ". Với mỗi mảng: đọc lại tài liệu hoặc quy trình, ghi 3-5 ý chính rồi tự trả lời lại không nhìn tài liệu.");
    } else if (f.weak.length === 1) {
      const c = f.weak[0];
      actions.push("Ôn lại mảng \"" + c.name + "\" (đúng " + c.ok + "/" + c.n + " câu): đọc lại tài liệu hoặc quy trình của mảng này, ghi ra 3-5 ý chính rồi tự trả lời lại không nhìn tài liệu.");
    } else if (f.wrong === 1) actions.push("Bạn chỉ sai 1 câu, có thể chỉ do đọc đề chưa kỹ: lần sau hãy đọc đủ các phương án trước khi chọn.");
    else if (f.wrong > 1) actions.push("Các câu sai rải rác ở nhiều mảng, không có mảng nào yếu rõ rệt: hãy đọc kỹ đề và đủ các phương án trước khi chọn, tránh chọn vội theo cảm tính.");
    if (b.rush) {
      // Chỉ so sánh với câu đúng khi tốc độ thật sự khác nhau (nếu câu đúng cũng nhanh như vậy thì so sánh chẳng có nghĩa)
      const cmp = b.rightMedSec != null && b.fastWrongSec != null && b.rightMedSec >= b.fastWrongSec * 1.5;
      actions.push("Có " + b.fastWrong + "/" + b.wrongAnswered + " câu sai bạn trả lời rất nhanh" + (b.fastWrongSec != null ? " (chỉ khoảng " + b.fastWrongSec + " giây/câu" + (cmp ? ", trong khi các câu đúng thường mất khoảng " + b.rightMedSec + " giây" : "") + ")" : "") + ": hãy dành thêm thời gian đọc kỹ đề và đủ các phương án trước khi chọn.");
    } else if (b.struggle) actions.push("Có " + b.slowWrong + " câu bạn mất gần hết thời gian mà vẫn sai: nhiều khả năng còn hiểu chưa chắc khái niệm, hãy ôn lại phần gốc và nhờ quản lí giải thích trực tiếp.");
    else if (!f.beh && f.avgSecPerQ != null && f.avgSecPerQ < f.secsPerQ * 0.2 && p < 80) actions.push("Bạn làm bài khá nhanh (khoảng " + f.avgSecPerQ + " giây mỗi câu) trong khi còn nhiều thời gian: hãy dành thêm vài giây đọc lại câu hỏi trước khi chọn.");
    if (f.timeouts > 0) actions.push(timeoutAction());
    else if (f.blank > 0) actions.push("Có " + f.blank + " câu bỏ trống: khi chưa chắc, hãy loại trừ các phương án sai rồi chọn phương án hợp lý nhất, không để trống.");
    if (f.nextBand) actions.push("Để đạt " + f.nextBand.points + " điểm tuân thủ học tập, lần sau cần đúng ít nhất " + f.nextBand.needCorrect + "/" + f.total + " câu (bạn cần thêm " + f.nextBand.gap + " câu đúng).");
  }
  // Câu kết luôn có, dù danh sách phía trên dài đến đâu
  const closing = rnd ? "Nếu sau khi làm lại nghiêm túc vẫn còn phần chưa chắc, hãy hỏi quản lí trực tiếp để được giải đáp."
    : p >= 90 ? "Bạn nắm kiến thức rất vững: hãy chia sẻ cách học của mình với đồng nghiệp trong nhóm." : "Sau khi ôn, hãy hỏi quản lí trực tiếp để được giải đáp những phần còn mơ hồ.";
  const ins = f.insight;
  const strengths = [];
  if (!rnd && ins) {
    if (ins.strongest && ins.strongest.pct >= 80) strengths.push("Vững nhất ở \"" + ins.strongest.name + "\": đúng " + ins.strongest.correct + "/" + ins.strongest.n + " câu.");
    if (ins.history && ins.history.personalBest && ins.history.deltaFromLast > 0) strengths.push("Kết quả tốt nhất của bạn từ trước đến nay, vượt mức " + ins.history.bestPrevPct + "% trước đây.");
    if (ins.streak && ins.streak.length >= 4) strengths.push("Chuỗi " + ins.streak.length + " câu đúng liên tiếp (câu " + ins.streak.fromQ + " đến câu " + ins.streak.toQ + ").");
    else if (ins.history && ins.history.deltaFromLast >= 5) strengths.push("Tiến bộ " + ins.history.deltaFromLast + " điểm % so với kỳ trước.");
  }
  return { source: "rules", headline: (f.firstName && !rnd ? f.firstName + ", " + headline.charAt(0).toLowerCase() + headline.slice(1) : headline), summary: parts.join(" "),
    portrait: ins ? require("./insight").portraitText(ins, f) : "", traits: ins && !rnd ? ins.traits.map((t) => t.label) : [],
    strengths: strengths.slice(0, 2), goal: goalOf(f),
    actions: actions.slice(0, MAX_ACTIONS - 1).concat([closing]), analysis: analysisOf(f) };
}
// Mục tiêu đo được cho lần tới (dùng cho cả bản luật và để đối chiếu bản AI)
function goalOf(f) {
  const ins = f.insight || {};
  if (f.beh && f.beh.random) return "Lần tới: làm lại nghiêm túc, dành ít nhất " + Math.max(10, Math.round(f.secsPerQ * 0.25)) + " giây cho mỗi câu.";
  const bits = [];
  if (ins.weakest && ins.weakest.pct < 70) bits.push("đúng ít nhất " + Math.min(ins.weakest.n, ins.weakest.correct + Math.max(1, Math.ceil(ins.weakest.n * 0.2))) + "/" + ins.weakest.n + " câu \"" + ins.weakest.name + "\"");
  if (f.nextBand) bits.push("đạt " + f.nextBand.needCorrect + "/" + f.total + " câu để lên " + f.nextBand.points + " điểm tuân thủ");
  if (f.timeouts >= 2) bits.push("không quá 1 câu hết giờ");
  if (!bits.length) return f.pct >= 90 ? "Lần tới: giữ vững từ " + f.correct + "/" + f.total + " câu đúng trở lên." : "Lần tới: tăng thêm ít nhất 2 câu đúng (từ " + f.correct + " lên " + Math.min(f.total, f.correct + 2) + "/" + f.total + ").";
  return "Lần tới: " + bits.slice(0, 2).join(" và ") + ".";
}

// ---- Bản AI ----
function aiConfigured() {
  if (process.env.ADVICE_AI === "off") return false; // công tắc tắt khẩn cấp
  return process.env.AI_MODE === "mock" || !!(process.env.GROQ_API_KEY || (process.env.AZURE_OPENAI_ENDPOINT && process.env.AZURE_OPENAI_KEY && process.env.AZURE_OPENAI_DEPLOYMENT));
}
function buildPrompt(f) {
  const sys =
    "Bạn là một huấn luyện viên đào tạo nghiệp vụ tinh ý, vừa ngồi quan sát nhân viên bán hàng (điện máy gia dụng, máy lọc nước) làm bài kiểm tra. " +
    "Nhiệm vụ: viết nhận xét RIÊNG cho người này bằng tiếng Việt, xưng \"bạn\", để khi đọc xong họ thấy \"đúng là mình\". " +
    "NGUYÊN TẮC BẮT BUỘC: " +
    "(1) Mọi nhận xét phải dựa trên dữ liệu được cung cấp; mỗi câu trong portrait phải nêu ít nhất một quan sát CỤ THỂ (số câu, vị trí câu, số giây, tên mảng, so với kỳ trước hoặc đồng nghiệp). " +
    "(2) Chỉ dùng ĐÚNG các con số có trong dữ liệu, không tự tính ra số mới, không làm tròn khác đi, không bịa. " +
    "(3) TUYỆT ĐỐI không tiết lộ hay đoán đáp án, không nêu nội dung câu hỏi, không bịa thông số sản phẩm, chính sách hay quy trình của công ty. " +
    "(4) Tránh câu sáo rỗng áp dụng cho ai cũng được (như \"hãy cố gắng hơn\", \"cần chăm chỉ\"). Nói như người đã thấy tận mắt nhịp làm bài của họ: chỗ họ chắc tay, chỗ họ vội, chỗ họ hụt hơi. " +
    "(5) Giọng ấm áp, thẳng thắn, khích lệ, không phán xét, không nịnh. Có thể gọi tên (ten_goi) ở headline. " +
    "(6) Nếu ket_qua_gan_muc_doan_bua là true: nói rõ kết quả chưa phản ánh thực lực, khuyên làm lại nghiêm túc, KHÔNG nhận xét mảng kiến thức. " +
    "(7) Nếu la_bai_thi_thu là true: nhắc ngắn gọn đây không phải thi chính thức. " +
    "(8) Ưu tiên dùng cac_dac_diem_noi_bat (đã được thống kê kiểm chứng) làm xương sống cho portrait. " +
    "Chỉ trả về DUY NHẤT một đối tượng JSON hợp lệ, đúng dạng: " +
    '{"headline":"tối đa 80 ký tự, câu nhận định đắt nhất về bài làm này","portrait":"2-3 câu chân dung cách người này làm bài, mỗi câu một bằng chứng cụ thể","strengths":["1-2 điểm mạnh có bằng chứng"],"actions":["3-4 việc nên làm, mỗi việc bắt đầu bằng động từ, gắn với một bằng chứng và nói rõ cách làm"],"goal":"một mục tiêu đo được cho lần tới, bắt đầu bằng \\"Lần tới:\\""}';
  const ins = f.insight || {};
  const data = {
    ten_goi: f.firstName || null,
    so_cau_dung: f.correct, tong_so_cau: f.total, ty_le_dung_phan_tram: f.pct, so_cau_sai: f.wrong, so_cau_bo_trong: f.blank, so_cau_het_gio: f.timeouts,
    la_bai_thi_thu: f.practice, ket_qua_gan_muc_doan_bua: !!(f.beh && f.beh.random), ty_le_dung_neu_chon_bua_phan_tram: f.beh && f.beh.random ? f.beh.random.chancePct : null,
    diem_tuan_thu: f.compliance, moc_diem_tuan_thu_ke_tiep: f.nextBand ? { diem: f.nextBand.points, can_dung_toi_thieu: f.nextBand.needCorrect, con_thieu: f.nextBand.gap } : null,
    thoi_gian_toi_da_moi_cau_giay: f.secsPerQ,
    cac_dac_diem_noi_bat: (ins.traits || []).map((t) => ({ dac_diem: t.label, bang_chung: t.evidence, dien_giai: t.say })),
    goi_y_so_giay_toi_thieu_moi_cau: ins.suggestSecPerQ || Math.max(10, Math.round(f.secsPerQ * 0.25)),
    nhip_do: ins.speed ? {
      trung_vi_giay_moi_cau: ins.speed.medianSec, trung_binh_giay_moi_cau: ins.speed.meanSec,
      cau_chon_nhanh: { so_cau: ins.speed.fast.n, ty_le_dung_phan_tram: ins.speed.fast.accuracyPct },
      cau_can_nhac_lau: { so_cau: ins.speed.slow.n, ty_le_dung_phan_tram: ins.speed.slow.accuracyPct },
      cau_sai_vi_chon_qua_nhanh: ins.speed.fastWrong, cau_sai_du_nghi_rat_lau: ins.speed.slowWrong,
      cau_lau_nhat: ins.speed.slowest ? { cau_so: ins.speed.slowest.pos, giay: ins.speed.slowest.sec, ket_qua: ins.speed.slowest.result } : null,
      vi_tri_cac_cau_het_gio: ins.speed.timeoutPositions
    } : null,
    phong_do: ins.flow ? { nua_dau: { dung: ins.flow.firstHalf.correct, tong: ins.flow.firstHalf.n, trung_vi_giay: ins.flow.firstHalf.medianSec }, nua_sau: { dung: ins.flow.secondHalf.correct, tong: ins.flow.secondHalf.n, trung_vi_giay: ins.flow.secondHalf.medianSec } } : null,
    chuoi_dung_dai_nhat: ins.streak ? { so_cau: ins.streak.length, tu_cau: ins.streak.fromQ, den_cau: ins.streak.toQ } : null,
    mo_dau: ins.opening ? { dung: ins.opening.correct, trong_so_cau_dau: ins.opening.questions } : null,
    ket_thuc: ins.closing ? { dung: ins.closing.correct, trong_so_cau_cuoi: ins.closing.questions } : null,
    cac_mang_kien_thuc: (f.beh && f.beh.random) ? [] : (ins.categories || f.categories.map((c) => ({ name: c.name, n: c.n, correct: c.ok, pct: c.pct }))).map((c) => ({ mang: c.name, dung: c.correct, tong: c.n, ty_le_phan_tram: c.pct, trung_vi_giay: c.medianSec != null ? c.medianSec : null, ky_truoc_phan_tram: c.prevPct != null ? c.prevPct : null, thay_doi_diem_phan_tram: c.deltaPct != null ? c.deltaPct : null })),
    so_voi_dong_nghiep: ins.peers ? { so_nguoi_cung_de: ins.peers.count, trung_binh_phan_tram: ins.peers.avgPct, cao_hon_phan_tram_so_nguoi: ins.peers.betterThanPct, chenh_lech_voi_trung_binh: ins.peers.diffFromAvg,
      giay_moi_cau_cua_ban: ins.peers.mySecPerQ, giay_moi_cau_trung_binh: ins.peers.avgSecPerQ, nhanh_hon_phan_tram_so_nguoi: ins.peers.fasterThanPct,
      trong_nhom: ins.peers.team ? { so_nguoi: ins.peers.team.size, hang: ins.peers.team.rank, trung_binh_nhom_phan_tram: ins.peers.team.avgPct } : null } : null,
    lich_su: ins.history ? { cac_ky_truoc: ins.history.previous.map((h) => ({ ky: h.period, ty_le_phan_tram: h.pct })), thay_doi_so_voi_ky_gan_nhat: ins.history.deltaFromLast, so_ky_tang_lien_tiep: ins.history.consecutiveImprovements, ket_qua_tot_nhat_tu_truoc: ins.history.personalBest } : (f.prev ? { cac_ky_truoc: [{ ky: f.prev.period, ty_le_phan_tram: f.prev.pct }], thay_doi_so_voi_ky_gan_nhat: f.pct - f.prev.pct } : null),
    muc_tieu_goi_y: goalOf(f)
  };
  return { messages: [{ role: "system", content: sys }, { role: "user", content: "Dữ liệu bài làm (JSON):\n" + JSON.stringify(data) }], data };
}

// ---- Kiểm chứng con số: mọi con số AI viết ra phải có trong dữ liệu đã cung cấp (cho phép làm tròn số thập phân)
function numbersIn(text) { return (String(text || "").match(/\d+(?:[.,]\d+)?/g) || []).map((x) => parseFloat(x.replace(",", "."))); }
function allowedNumbers(data) {
  const set = new Set([0, 1, 2, 3, 4, 5, 100]);
  const add = (v) => { if (!Number.isFinite(v)) return; set.add(v); set.add(Math.round(v)); set.add(Math.floor(v)); set.add(Math.ceil(v)); set.add(Math.abs(v)); set.add(Math.round(Math.abs(v))); };
  numbersIn(JSON.stringify(data)).forEach(add);
  (function walk(o) { if (o == null) return; if (typeof o === "number") add(o); else if (typeof o === "object") Object.keys(o).forEach((k) => walk(o[k])); })(data);
  return set;
}
function badNumbers(adv, data) {
  const ok = allowedNumbers(data), txt = [adv.headline, adv.portrait, adv.goal].concat(adv.strengths || [], adv.actions || []).join(" \n ");
  return Array.from(new Set(numbersIn(txt).filter((v) => !ok.has(v))));
}
// Tên mảng kiến thức AI nêu trong ngoặc kép phải là mảng có thật
function badCategories(adv, f) {
  const names = new Set(((f.insight && f.insight.categories) || f.categories || []).map((c) => String(c.name).toLowerCase()));
  const txt = [adv.headline, adv.portrait, adv.goal].concat(adv.strengths || [], adv.actions || []).join(" ");
  return (txt.match(/["“]([^"”]{2,60})["”]/g) || []).map((x) => x.slice(1, -1).trim()).filter((x) => !names.has(x.toLowerCase()) && !/^lần tới/i.test(x));
}
const GENERIC = /(hãy cố gắng hơn( nữa)?|cần chăm chỉ hơn|cố lên nhé|bạn làm tốt lắm!?$)/i;
function parseAi(text) {
  let s = String(text || "").trim().replace(/^```[a-z]*\s*/i, "").replace(/```\s*$/i, "").trim();
  const a = s.indexOf("{"), b = s.lastIndexOf("}");
  if (a < 0 || b < a) return null;
  let o; try { o = JSON.parse(s.slice(a, b + 1)); } catch (e) { return null; }
  const headline = plain(o && o.headline, 90), portrait = plain(o && (o.portrait || o.summary), 520), goal = plain(o && o.goal, 200);
  const list = (v, n, m) => (Array.isArray(v) ? v : []).map((x) => plain(x, n)).filter((x) => x.length >= 8 && !GENERIC.test(x)).slice(0, m);
  const actions = list(o && o.actions, 220, MAX_ACTIONS), strengths = list(o && o.strengths, 180, 2);
  if (!headline || !portrait || actions.length < 2) return null; // thiếu ý: bỏ, dùng bản luật
  return { source: "ai", headline, summary: portrait, portrait, strengths, actions, goal: /^lần tới/i.test(goal) ? goal : (goal ? "Lần tới: " + goal.charAt(0).toLowerCase() + goal.slice(1) : "") };
}
function withTimeout(promise, ms) {
  let t; const to = new Promise((_, rej) => { t = setTimeout(() => rej(new Error("timeout")), ms); });
  return Promise.race([promise, to]).finally(() => clearTimeout(t));
}
// Trả về { advice, status }. status: ok | ok_retry | not_configured | timeout | invalid | numbers | error | off
async function aiAdvice(f, timeoutMs) {
  if (process.env.ADVICE_AI === "off") return { advice: null, status: "off" };
  if (!aiConfigured()) return { advice: null, status: "not_configured" };
  const budget = timeoutMs || DEFAULT_TIMEOUT_MS, deadline = Date.now() + budget;
  const P = buildPrompt(f);
  let msgs = P.messages, status = "invalid";
  for (let round = 0; round < 2; round++) {
    const left = deadline - Date.now();
    if (left < 1500) break;
    let raw;
    try { raw = await withTimeout(llm.chat(msgs, { temperature: 0.5, max_tokens: 1400, task: "advice", json: true, timeoutMs: left - 100 }), left); }
    catch (e) { return { advice: null, status: e && (e.message === "timeout" || e.status === 504) ? "timeout" : "error" }; }
    const ad = parseAi(raw);
    if (!ad) { status = "invalid"; msgs = P.messages.concat([{ role: "assistant", content: String(raw || "").slice(0, 2000) }, { role: "user", content: "Bản trên chưa đúng định dạng JSON yêu cầu (cần headline, portrait, strengths, actions 3-4 mục, goal). Hãy trả lại đúng một đối tượng JSON." }]); continue; }
    const bn = badNumbers(ad, P.data), bc = badCategories(ad, f);
    if (!bn.length && !bc.length) return { advice: ad, status: round ? "ok_retry" : "ok" };
    status = "numbers";
    msgs = P.messages.concat([{ role: "assistant", content: String(raw).slice(0, 2000) },
      { role: "user", content: "Bản trên có " + (bn.length ? "con số không có trong dữ liệu: " + bn.join(", ") : "") + (bc.length ? (bn.length ? "; " : "") + "tên mảng không có thật: " + bc.join(", ") : "") + ". Viết lại, CHỈ dùng đúng các con số và tên mảng có trong dữ liệu. Trả về đúng một đối tượng JSON." }]);
  }
  return { advice: null, status };
}

// Lời khuyên tốt nhất có thể: AI nếu được, không thì luật. Luôn trả về một kết quả hợp lệ.
async function build(attempt, settings, prev, opt) {
  const f = facts(attempt, settings, prev, opt && opt.ctx);
  const rules = rulesAdvice(f);
  const useAI = !(opt && opt.ai === false);
  const r = useAI ? await aiAdvice(f, opt && opt.timeoutMs) : { advice: null, status: "skipped" };
  const out = r.advice || rules;
  out.analysis = rules.analysis; // phần số liệu luôn lấy từ bản luật (AI chỉ viết lại lời văn)
  out.traits = rules.traits;     // nhãn đặc điểm luôn lấy từ thống kê đã kiểm chứng
  if (!out.goal) out.goal = rules.goal;
  if (!out.strengths || !out.strengths.length) out.strengths = rules.strengths;
  out.aiStatus = r.status; // lưu để quản trị viên biết vì sao một lời khuyên là bản luật
  out.at = Date.now();
  return out;
}

// Chạy THẬT đường AI của lời khuyên trên một bộ số liệu mẫu, để quản trị viên kiểm tra AI có hoạt động và trả đúng định dạng không.
async function selfTest(timeoutMs) {
  const f = { total: 30, correct: 18, wrong: 10, blank: 2, pct: 60, timeouts: 2, categories: [{ name: "Gia dụng", n: 15, ok: 12, pct: 80 }, { name: "Máy lọc nước", n: 15, ok: 6, pct: 40 }],
    weak: [{ name: "Máy lọc nước", n: 15, ok: 6, pct: 40 }], strong: [], compliance: 10, nextBand: { points: 15, needCorrect: 21, gap: 3 }, practice: false, avgSecPerQ: 25, secsPerQ: 60, prev: null, beh: null };
  const t0 = Date.now();
  const r = await aiAdvice(f, timeoutMs || 15000);
  return { status: r.status, ms: Date.now() - t0, headline: r.advice ? r.advice.headline : null, portrait: r.advice ? r.advice.portrait : null };
}

module.exports = { ensureAnalysis, analysisOf, build, facts, rulesAdvice, parseAi, badNumbers, buildPrompt, goalOf, categoryStats, nextBand, aiConfigured, selfTest, aiAdvice };
