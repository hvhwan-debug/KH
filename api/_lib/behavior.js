// Phân tích HÀNH VI học / làm bài từ dữ liệu hệ thống đã ghi sẵn, rồi chẩn đoán nguyên nhân và đề xuất khắc phục.
//
// Nguyên tắc:
// 1) Tầng luật luôn chạy và kiểm chứng được: mỗi kết luận có BẰNG CHỨNG bằng số liệu, NGUYÊN NHÂN (giả thuyết), MỨC TIN CẬY và VIỆC NÊN LÀM.
// 2) AI (nếu có) chỉ TỔNG HỢP thành nguyên nhân gốc + kế hoạch hành động, trên số liệu đã ẩn danh. Lỗi/chậm thì dùng bản luật.
// 3) Mọi nguyên nhân chỉ là giả thuyết từ dữ liệu; tín hiệu về tuân thủ làm bài (rời màn hình, đổi thiết bị...) KHÔNG phải bằng chứng gian lận.
// 4) Quyền riêng tư: thiết bị/vị trí chỉ đưa vào phân tích khi người xem là quản trị viên (giống các màn hình khác).
const llm = require("./llm");
const advice = require("./advice");
const itemstats = require("./itemstats");

const FAST = 0.20;       // trả lời trong < 20% thời gian cho phép = "nhanh"
const SLOW = 0.75;       // dùng > 75% thời gian = "chậm"
const TIMEOUT_FRAC = 0.95;
const MIN_COHORT = 8;    // dưới số bài này không chẩn đoán cả nhóm (mẫu quá nhỏ)

const LEVEL_RANK = { bad: 0, warn: 1, info: 2, ok: 3 };
const median = (a) => { if (!a.length) return null; const b = a.slice().sort((x, y) => x - y), h = b.length >> 1; return b.length % 2 ? b[h] : (b[h - 1] + b[h]) / 2; };
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const r1 = (x) => (x == null ? null : Math.round(x * 10) / 10);
const pc = (x) => Math.round(x * 100);
const clip = (s, n) => String(s == null ? "" : s).replace(/[\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, n);
const plain = (s, n) => clip(String(s == null ? "" : s).replace(/<[^>]*>/g, "").replace(/[*_`#>]+/g, "").replace(/^\s*[-•·]\s*/, ""), n);

// ---------------------------------------------------------------------------------------------
// 1. Rút đặc trưng từ MỘT bài làm
// ---------------------------------------------------------------------------------------------
// Thời gian làm từng câu = thời điểm trả lời - thời điểm câu đó hiện ra (câu đầu: lúc bắt đầu; câu sau: lúc trả lời câu trước).
// Câu hết giờ do máy chủ tự ghi (auto) được tính đúng bằng thời gian tối đa.
function rowsOf(a) {
  const S = Math.max(10, a.secondsPerQuestion || 60) * 1000;
  const pm = {}; (a.paper || []).forEach((p) => { pm[p.n] = p; });
  const rows = []; let prevT = a.startedAt || null;
  (a.questionIds || []).forEach((qid, i) => {
    const ans = (a.answers || {})[qid]; if (!ans) return;
    const p = pm[i + 1] || {};
    const auto = !!ans.auto, at = ans.answeredAt || null;
    const ms = auto ? S : (at && prevT ? Math.max(0, Math.min(S + 3000, at - prevT)) : null);
    if (at) prevT = at;
    const blank = p.chosen != null ? p.chosen < 0 : false;
    const frac = ms == null ? null : ms / S;
    const timeout = auto || (blank && frac != null && frac >= TIMEOUT_FRAC);
    rows.push({ i, cat: clip(p.category, 60) || "Kiến thức chung", ok: !!p.ok, blank, auto, timeout, ms, frac, answered: !timeout && !blank });
  });
  return { rows, S };
}

function featuresOf(a) {
  const { rows, S } = rowsOf(a);
  const n = rows.length;
  const answered = rows.filter((r) => r.answered);
  const wrong = answered.filter((r) => !r.ok);
  const timed = answered.filter((r) => r.frac != null);
  const timeouts = rows.filter((r) => r.timeout);
  const skipped = rows.filter((r) => r.blank && !r.timeout);
  const fastWrong = wrong.filter((r) => r.frac != null && r.frac < FAST);
  const slowWrong = wrong.filter((r) => r.frac != null && r.frac > SLOW);
  const rightT = answered.filter((r) => r.ok && r.frac != null).map((r) => r.frac * S / 1000);
  const hasTiming = timed.length >= Math.max(3, Math.floor(n / 2));
  // "Xuống sức" chỉ so sánh trên các câu THỰC SỰ đã trả lời; câu hết giờ đã được chẩn đoán riêng, tránh chẩn đoán trùng một hiện tượng
  const half = Math.floor(answered.length / 2);
  const acc = (list) => (list.length ? list.filter((r) => r.ok).length / list.length : null);
  const third = Math.ceil(n * 2 / 3);
  const flags = a.flags || {};
  const byCat = {};
  rows.forEach((r, k) => {
    const x = (byCat[r.cat] = byCat[r.cat] || { name: r.cat, n: 0, ok: 0, timeouts: 0, fastWrong: 0, slowWrong: 0, fracs: [] });
    x.n++; if (r.ok) x.ok++; if (r.timeout) x.timeouts++;
    if (fastWrong.indexOf(r) >= 0) x.fastWrong++; if (slowWrong.indexOf(r) >= 0) x.slowWrong++;
    if (r.answered && r.frac != null) x.fracs.push(r.frac);
  });
  return {
    n, S, hasTiming, pct: a.pct, total: a.total, practice: !!a.practice,
    answered: answered.length, wrong: wrong.length, timeouts: timeouts.length, skipped: skipped.length,
    fastWrong: fastWrong.length, slowWrong: slowWrong.length,
    medFrac: hasTiming ? median(timed.map((r) => r.frac)) : null,
    meanSec: hasTiming ? r1(mean(timed.map((r) => r.frac * S / 1000))) : null,
    rightMedSec: rightT.length >= 3 ? r1(median(rightT)) : null,
    fastShare: hasTiming ? timed.filter((r) => r.frac < FAST).length / timed.length : null,
    accFirst: answered.length >= 10 ? acc(answered.slice(0, half)) : null, accSecond: answered.length >= 10 ? acc(answered.slice(half)) : null,
    timeoutsLastThird: n >= 6 ? rows.slice(third).filter((r) => r.timeout).length : 0,
    byCat: Object.keys(byCat).map((k) => Object.assign(byCat[k], { acc: byCat[k].n ? byCat[k].ok / byCat[k].n : 0 })).sort((x, y) => x.acc - y.acc),
    blur: flags.blur || 0, shot: flags.shot || 0,
    device: a.device || null // chỉ dùng khi người xem là quản trị viên
  };
}

// Các "mẫu hành vi" dùng cả để chẩn đoán và để đếm lặp lại qua nhiều lần làm bài
const patterns = {
  rush: (f) => f.hasTiming && f.fastWrong >= 3 && f.wrong > 0 && f.fastWrong / f.wrong >= 0.4,
  struggle: (f) => f.hasTiming && f.slowWrong >= 3 && f.wrong > 0 && f.slowWrong / f.wrong >= 0.4,
  timeouts: (f) => f.timeouts >= 2,
  fatigue: (f) => f.accFirst != null && f.accSecond != null && f.accFirst - f.accSecond >= 0.25,
  distract: (f) => f.blur >= 3
};

const F = (code, level, title, evidence, causes, actions, confidence, extra) => Object.assign({ code, level, title, evidence, causes, actions, confidence }, extra || {});
const A = (t, who) => ({ t, who }); // who: nv = nhân viên, ql = quản lí trực tiếp, dt = đào tạo / quản trị

function confOf(count, repeated, total) {
  if (repeated >= 1 && count >= 3) return "cao";
  if (count >= 6) return "cao";
  if (count >= 3) return "vừa";
  return "thấp";
}

// ---------------------------------------------------------------------------------------------
// 2. Chẩn đoán MỘT người học (nhiều lần làm bài, từ cũ đến mới)
// ---------------------------------------------------------------------------------------------
// items: [{ attempt, settings }] sắp theo thời gian tăng dần. ctx: { admin }
function individual(items, ctx) {
  ctx = ctx || {};
  const fs = items.map((it) => featuresOf(it.attempt));
  const cur = fs[fs.length - 1], priors = fs.slice(0, -1);
  const findings = [];
  const times = (fn) => priors.filter(fn).length;
  const rep = (fn) => { const k = times(fn); return k ? " (lặp lại ở " + k + "/" + priors.length + " lần làm trước)" : ""; };
  const spendTxt = cur.meanSec != null ? "trung bình " + cur.meanSec + " giây/câu trên giới hạn " + Math.round(cur.S / 1000) + " giây" : "";

  if (!cur.hasTiming) {
    findings.push(F("notiming", "info", "Bài này không có dữ liệu thời gian từng câu", ["Bài làm được nộp trước khi hệ thống ghi nhận thời gian từng câu, nên chưa phân tích được tốc độ làm bài."], [], [A("Các phân tích về tốc độ sẽ có ở lần kiểm tra sau.", "dt")], "thấp"));
  }

  // --- Làm vội / đoán ---
  if (patterns.rush(cur)) {
    const top = cur.byCat.filter((c) => c.fastWrong > 0).sort((a, b) => b.fastWrong - a.fastWrong)[0];
    const concentrated = top && top.fastWrong / cur.fastWrong >= 0.6;
    const causes = concentrated
      ? ["Chưa nắm chắc mảng \"" + top.name + "\" nên chọn nhanh theo cảm tính (đa số câu trả lời vội nằm ở mảng này).", "Có thể ngại dừng lại suy nghĩ ở phần không tự tin."]
      : ["Đọc đề và các phương án chưa kỹ, trả lời cho xong.", "Tâm lý chủ quan hoặc muốn kết thúc sớm."];
    const evid = [cur.fastWrong + "/" + cur.wrong + " câu sai được trả lời quá nhanh (dưới " + pc(FAST) + "% thời gian cho phép)" + rep(patterns.rush) + ".", spendTxt && ("Tốc độ " + spendTxt + ".")];
    if (cur.rightMedSec != null) evid.push("Những câu đúng thường mất khoảng " + cur.rightMedSec + " giây; các câu sai trả lời vội ngắn hơn hẳn.");
    findings.push(F("rush", "warn", "Có dấu hiệu trả lời vội hoặc đoán", evid.filter(Boolean), causes, [
      A("Đặt quy tắc: đọc đủ tất cả phương án trước khi chọn" + (cur.rightMedSec != null ? ", dành ít nhất khoảng " + Math.max(8, Math.round(cur.rightMedSec * 0.7)) + " giây cho mỗi câu" : "") + ".", "nv"),
      concentrated ? A("Ôn riêng mảng \"" + top.name + "\" và tự kiểm tra lại không nhìn tài liệu.", "nv") : A("Khi làm thử, tập gạch chân từ khoá của câu hỏi trước khi chọn.", "nv"),
      A("Trao đổi ngắn với nhân viên để biết họ vội vì thiếu kiến thức hay vì chủ quan, rồi hỗ trợ đúng nguyên nhân.", "ql")
    ], confOf(cur.fastWrong, times(patterns.rush), cur.n)));
  }

  // --- Chậm mà vẫn sai ---
  if (patterns.struggle(cur)) {
    const top = cur.byCat.filter((c) => c.slowWrong > 0).sort((a, b) => b.slowWrong - a.slowWrong)[0];
    findings.push(F("struggle", "warn", "Mất nhiều thời gian nhưng vẫn trả lời sai", [
      cur.slowWrong + "/" + cur.wrong + " câu sai dùng hơn " + pc(SLOW) + "% thời gian cho phép" + rep(patterns.struggle) + ".",
      top ? "Tập trung ở mảng \"" + top.name + "\" (" + top.slowWrong + " câu)." : ""
    ].filter(Boolean), [
      "Hiểu chưa đúng khái niệm hoặc nhầm giữa các phương án giống nhau, nên phân vân lâu.",
      "Thiếu tự tin, cân nhắc nhiều rồi vẫn chọn sai."
    ], [
      A("Kèm cặp trực tiếp" + (top ? " về mảng \"" + top.name + "\"" : "") + ": nhờ nhân viên tự giải thích vì sao chọn, để tìm đúng chỗ hiểu nhầm.", "ql"),
      A("Học theo tình huống bán hàng thực tế thay vì học thuộc, rồi làm lại bài tự luyện.", "nv")
    ], confOf(cur.slowWrong, times(patterns.struggle), cur.n)));
  }

  // --- Hết giờ ---
  if (patterns.timeouts(cur)) {
    const endShare = cur.timeouts ? cur.timeoutsLastThird / cur.timeouts : 0;
    const topT = cur.byCat.filter((c) => c.timeouts > 0).sort((a, b) => b.timeouts - a.timeouts)[0];
    let causes, actions;
    if (endShare >= 0.7 && cur.n >= 6) {
      causes = ["Quản lý thời gian chưa tốt: dùng quá nhiều thời gian ở đầu bài nên cuối bài bị hết giờ.", "Có thể mệt hoặc mất tập trung về cuối bài."];
      actions = [A("Đặt nhịp làm bài: không quá khoảng " + Math.round(cur.S / 1000 * 0.7) + " giây cho một câu; câu chưa chắc thì chọn phương án hợp lý nhất rồi đi tiếp.", "nv"), A("Làm thử một bài tự luyện đủ độ dài để quen nhịp.", "nv")];
    } else if (topT && topT.timeouts / cur.timeouts >= 0.6) {
      causes = ["Mảng \"" + topT.name + "\" còn lạ hoặc khó nên mất nhiều thời gian suy nghĩ dẫn đến hết giờ."];
      actions = [A("Ôn lại mảng \"" + topT.name + "\" trước, đây là nơi mất thời gian nhiều nhất.", "nv"), A("Hỗ trợ giải đáp các phần chưa rõ của mảng này.", "ql")];
    } else {
      causes = ["Đọc đề hoặc suy nghĩ chậm ở nhiều câu.", "Chưa quen hình thức thi trực tuyến có giới hạn thời gian từng câu."];
      actions = [A("Luyện đọc nhanh và nắm ý chính câu hỏi; khi chưa chắc thì loại trừ phương án sai rồi chọn.", "nv"), A("Cho nhân viên làm thử một bài để làm quen giao diện và nhịp thời gian.", "ql")];
    }
    findings.push(F("timeouts", "warn", "Có câu hết giờ chưa kịp trả lời", [
      cur.timeouts + " câu hết giờ" + (cur.timeoutsLastThird ? " (" + cur.timeoutsLastThird + " câu nằm ở 1/3 cuối bài)" : "") + rep(patterns.timeouts) + "."
    ], causes, actions, confOf(cur.timeouts + 1, times(patterns.timeouts), cur.n)));
  }

  // --- Xuống sức về cuối bài ---
  if (patterns.fatigue(cur)) {
    findings.push(F("fatigue", "info", "Độ chính xác giảm về cuối bài", [
      "Nửa đầu bài đúng " + pc(cur.accFirst) + "%, nửa sau chỉ đúng " + pc(cur.accSecond) + "%" + rep(patterns.fatigue) + "."
    ], ["Mất tập trung hoặc mệt dần khi làm bài dài.", "Có thể vội hơn ở cuối bài để kịp thời gian."], [
      A("Làm bài vào lúc tỉnh táo, tránh làm ngay sau ca bận hoặc giữa giờ làm việc.", "nv"),
      A("Nghỉ ngắn trước khi làm bài; kiểm tra lại các câu khó ở cuối nếu còn thời gian.", "nv")
    ], cur.n >= 20 ? "vừa" : "thấp"));
  }

  // --- Lỗ hổng theo mảng (kèm tính dai dẳng qua các lần làm) ---
  const priorWeak = (name) => priors.filter((f) => { const c = f.byCat.find((x) => x.name === name); return c && c.n >= 2 && c.acc < 0.7; }).length;
  const gaps = cur.byCat.filter((c) => c.n >= 3 && c.acc < 0.6).slice(0, 3);
  gaps.forEach((c) => {
    const persisted = priorWeak(c.name);
    const rushHere = c.fastWrong >= 2, slowHere = c.slowWrong >= 2;
    findings.push(F("gap", persisted ? "bad" : "warn", persisted ? "Lỗ hổng kiến thức dai dẳng: " + c.name : "Mảng yếu: " + c.name, [
      "Mảng \"" + c.name + "\": đúng " + c.ok + "/" + c.n + " câu (" + pc(c.acc) + "%).",
      persisted ? "Cũng yếu ở " + persisted + "/" + priors.length + " lần làm trước, nên đây không phải lỗi ngẫu nhiên." : "Lần đầu mảng này xuất hiện là điểm yếu trong dữ liệu hiện có."
    ], persisted
      ? ["Các lần ôn trước chưa lấp được lỗ hổng, hoặc mảng này chưa được ôn kỹ.", rushHere ? "Có xu hướng chọn vội ở mảng này." : slowHere ? "Phân vân lâu rồi vẫn sai: nhiều khả năng hiểu nhầm khái niệm." : "Tài liệu hoặc cách học hiện tại chưa phù hợp với mảng này."]
      : ["Mảng ít tiếp xúc trong công việc hàng ngày.", "Chưa kịp ôn kỹ trước khi kiểm tra."],
    [
      A(persisted ? "Lập kế hoạch ôn riêng cho \"" + c.name + "\" trong 2 tuần, có người kiểm tra lại (không chỉ tự đọc)." : "Ôn lại mảng \"" + c.name + "\" bằng cách tóm tắt 5 ý chính rồi tự trả lời lại.", persisted ? "ql" : "nv"),
      A("Làm lại bài tự luyện riêng mảng này và so sánh kết quả.", "nv")
    ], confOf(c.n, persisted, c.n)));
  });

  // --- Xu hướng giữa các kỳ chính thức ---
  const official = items.map((it, k) => ({ f: fs[k], at: it.attempt })).filter((x) => !x.f.practice);
  if (official.length >= 2) {
    const a = official[official.length - 1], b = official[official.length - 2], d = Math.round((a.f.pct || 0) - (b.f.pct || 0));
    if (d <= -10) {
      const reasons = ["Chưa ôn lại kiến thức sau lần trước, hoặc lâu không tiếp xúc với nội dung."];
      if (patterns.rush(a.f)) reasons.push("Làm vội hơn (có dấu hiệu trả lời nhanh nhưng sai).");
      if (patterns.timeouts(a.f)) reasons.push("Hết giờ nhiều hơn nên mất điểm.");
      findings.push(F("drop", "warn", "Kết quả giảm so với lần kiểm tra chính thức trước", ["Giảm " + Math.abs(d) + " điểm phần trăm (từ " + b.f.pct + "% xuống " + a.f.pct + "%)."], reasons, [
        A("Trao đổi để tìm nguyên nhân thay đổi: công việc bận, nghỉ lâu, hay đề đổi mảng.", "ql"), A("Ôn lại các mảng yếu nêu ở trên trước kỳ sau.", "nv")], "vừa"));
    } else if (d >= 10) {
      findings.push(F("rise", "ok", "Tiến bộ rõ so với lần kiểm tra chính thức trước", ["Tăng " + d + " điểm phần trăm (từ " + b.f.pct + "% lên " + a.f.pct + "%)."], ["Cách ôn gần đây đang có hiệu quả."], [A("Ghi nhận và hỏi nhân viên đã ôn bằng cách nào để nhân rộng cho đồng nghiệp.", "ql")], "vừa"));
    }
  }

  // --- Thế mạnh ---
  const strong = cur.byCat.filter((c) => c.n >= 3 && c.acc >= 0.9).slice(0, 2);
  if (strong.length) findings.push(F("strength", "ok", "Thế mạnh: " + strong.map((c) => c.name).join(", "), strong.map((c) => "Mảng \"" + c.name + "\": đúng " + c.ok + "/" + c.n + " câu."), ["Nắm vững nội dung mảng này."], [A("Có thể nhờ nhân viên chia sẻ cách làm với đồng nghiệp ở mảng này.", "ql")], "vừa"));

  // --- Tín hiệu về tuân thủ cách làm bài: chỉ là tín hiệu, KHÔNG kết luận gian lận ---
  if (patterns.distract(cur)) {
    findings.push(F("distract", "info", "Rời khỏi màn hình bài thi nhiều lần", ["Hệ thống ghi nhận " + cur.blur + " lần rời hoặc chuyển khỏi màn hình bài thi" + rep(patterns.distract) + "."],
      ["Bị gián đoạn bởi điện thoại, cuộc gọi hoặc công việc xen vào.", "Có thể mở thêm cửa sổ khác (ví dụ tra cứu). Đây chỉ là tín hiệu, chưa phải bằng chứng."], [
      A("Trao đổi cởi mở, nhắc lại quy định làm bài và gợi ý chọn nơi yên tĩnh, tắt thông báo khi làm.", "ql")], cur.blur >= 6 ? "vừa" : "thấp"));
  }
  if (cur.shot >= 1) {
    findings.push(F("shot", "info", "Có thao tác chụp màn hình hoặc in khi đang làm bài", ["Ghi nhận " + cur.shot + " lần."], ["Có thể muốn lưu lại nội dung để ôn, hoặc chưa biết quy định."], [A("Nhắc quy định không chụp hoặc sao chép đề; hướng dẫn dùng nút chia sẻ kết quả thay vì chụp màn hình.", "ql")], "thấp"));
  }
  if (ctx.admin) {
    if (cur.device && cur.device.changed) findings.push(F("device", "info", "Đổi thiết bị hoặc mạng giữa chừng", ["Hệ thống ghi nhận thiết bị hoặc địa chỉ mạng thay đổi trong lúc làm bài."], ["Mạng yếu nên chuyển sang thiết bị hoặc mạng khác.", "Hoặc có người khác tham gia làm bài (cần xác minh, chưa kết luận)."], [A("Hỏi lại nhân viên về hoàn cảnh làm bài; đối chiếu ảnh xác nhận nếu cần.", "dt")], "thấp"));
    if (cur.device && cur.device.movedKm > 2) findings.push(F("moved", "info", "Vị trí thay đổi trong lúc làm bài", ["Vị trí dịch chuyển khoảng " + cur.device.movedKm + " km giữa các lần ghi."], ["Làm bài khi đang di chuyển."], [A("Nhắc nhân viên làm bài ở một nơi cố định, ổn định mạng.", "ql")], "thấp"));
    if (cur.hasTiming && cur.medFrac != null && cur.medFrac < 0.1 && cur.pct >= 90 && cur.n >= 10) findings.push(F("fastperfect", "info", "Trả lời rất nhanh nhưng gần như đúng hết", ["Trung vị chỉ " + pc(cur.medFrac) + "% thời gian cho phép, đúng " + cur.pct + "%."], ["Nắm rất vững và quen nội dung.", "Hoặc đã xem trước đề (chỉ là giả thuyết)."], [A("Trao đổi hoặc hỏi miệng vài nội dung để xác nhận mức độ nắm vững.", "ql")], "thấp"));
  }

  if (!findings.some((x) => x.level !== "ok" && x.code !== "notiming") && !findings.some((x) => x.level === "ok")) {
    findings.push(F("stable", "ok", "Không phát hiện vấn đề đáng chú ý", ["Tốc độ, độ chính xác và các mảng kiến thức đều ổn trong dữ liệu hiện có."], [], [A("Duy trì cách học hiện tại.", "nv")], "vừa"));
  }
  findings.sort((x, y) => LEVEL_RANK[x.level] - LEVEL_RANK[y.level]);
  return {
    kind: "individual",
    stats: {
      attempts: items.length, pct: cur.pct, practice: cur.practice, meanSec: cur.meanSec, medFrac: cur.medFrac == null ? null : r1(cur.medFrac * 100),
      timeouts: cur.timeouts, fastWrong: cur.fastWrong, slowWrong: cur.slowWrong, hasTiming: cur.hasTiming,
      categories: cur.byCat.map((c) => ({ name: c.name, n: c.n, ok: c.ok, pct: pc(c.acc) }))
    },
    findings
  };
}

// ---------------------------------------------------------------------------------------------
// 3. Chẩn đoán CẢ NHÓM (mỗi người một bài mới nhất của một đề)
// ---------------------------------------------------------------------------------------------
// items: [{ attempt, settings, cand: { code, manager, segment } }]; ctx: { byId } (ngân hàng câu hỏi, để xét chất lượng câu hỏi)
function cohort(items, ctx) {
  ctx = ctx || {};
  const fs = items.map((it) => featuresOf(it.attempt));
  const N = items.length;
  const out = [];
  if (N < MIN_COHORT) {
    return { kind: "cohort", stats: { attempts: N, enough: false, minN: MIN_COHORT }, findings: [F("small", "info", "Chưa đủ dữ liệu để chẩn đoán cả nhóm", ["Mới có " + N + " bài, cần ít nhất " + MIN_COHORT + " bài để các tỉ lệ có ý nghĩa."], [], [A("Chờ thêm nhân viên hoàn thành bài rồi phân tích lại.", "dt")], "thấp")] };
  }
  const share = (fn, base) => { const b = base || fs; return b.length ? b.filter(fn).length / b.length : 0; };
  const timed = fs.filter((f) => f.hasTiming);
  const meanPct = r1(mean(fs.map((f) => f.pct || 0)));
  const S = Math.round(median(fs.map((f) => f.S)) / 1000);

  // Áp lực thời gian
  const totalRows = fs.reduce((a, f) => a + f.n, 0), totalTO = fs.reduce((a, f) => a + f.timeouts, 0);
  const staffTO = share(patterns.timeouts);
  if (totalRows && (totalTO / totalRows >= 0.06 || staffTO >= 0.3)) {
    const lastShare = totalTO ? fs.reduce((a, f) => a + f.timeoutsLastThird, 0) / totalTO : 0;
    const catTO = {}; fs.forEach((f) => f.byCat.forEach((c) => { catTO[c.name] = (catTO[c.name] || 0) + c.timeouts; }));
    const topCat = Object.keys(catTO).sort((a, b) => catTO[b] - catTO[a])[0];
    const catShare = totalTO && topCat ? catTO[topCat] / totalTO : 0;
    const causes = [], actions = [];
    if (lastShare >= 0.6) { causes.push("Hết giờ dồn về cuối bài: bài hơi dài hoặc nhịp thời gian chưa phù hợp, người làm mệt dần."); actions.push(A("Cân nhắc giảm số câu hoặc tăng thời gian mỗi câu (hiện " + S + " giây).", "dt")); }
    if (catShare >= 0.5 && topCat) { causes.push("Mảng \"" + topCat + "\" chiếm " + pc(catShare) + "% số câu hết giờ: câu dài hoặc khó hơn mặt bằng."); actions.push(A("Rà soát độ dài và độ khó các câu của mảng \"" + topCat + "\".", "dt")); }
    if (!causes.length) { causes.push("Thời gian mỗi câu có thể hơi ngắn so với độ dài câu hỏi, hoặc nhân viên chưa quen làm bài trực tuyến."); actions.push(A("Hướng dẫn nhanh cách làm bài trước kỳ sau và cho làm thử một đề ngắn.", "ql")); }
    out.push(F("timepressure", "warn", "Nhiều nhân viên bị hết giờ", [pc(staffTO) + "% nhân viên có từ 2 câu hết giờ trở lên.", pc(totalTO / totalRows) + "% tổng số câu bị hết giờ (" + totalTO + "/" + totalRows + ")."], causes, actions, N >= 20 ? "cao" : "vừa"));
  }

  // Làm vội
  const rushS = share(patterns.rush, timed);
  if (timed.length >= MIN_COHORT && rushS >= 0.25) {
    out.push(F("rush", "warn", "Nhiều nhân viên có dấu hiệu trả lời vội", [pc(rushS) + "% nhân viên (" + timed.filter(patterns.rush).length + "/" + timed.length + ") có nhiều câu sai được trả lời rất nhanh."],
      ["Tâm lý làm cho xong, hoặc nhận thức kỳ kiểm tra chưa quan trọng.", "Các câu hỏi có thể có phương án sai lộ liễu nên dễ chọn nhanh mà vẫn nghĩ là đúng."],
      [A("Truyền thông trước kỳ sau: kết quả gắn với điểm tuân thủ, nên đọc kỹ đề.", "ql"), A("Rà các câu sai nhanh nhiều nhất để xem đề có gợi ý nhầm không.", "dt")], N >= 20 ? "cao" : "vừa"));
  }

  // Mảng kiến thức yếu của cả nhóm (và liệu nguyên nhân nằm ở đề hay ở người học)
  const cat = {};
  fs.forEach((f) => f.byCat.forEach((c) => { const x = (cat[c.name] = cat[c.name] || { name: c.name, n: 0, ok: 0, staff: 0, weakStaff: 0 }); x.n += c.n; x.ok += c.ok; x.staff++; if (c.n >= 3 && c.acc < 0.6) x.weakStaff++; }));
  let itemRep = null;
  if (ctx.byId) { try { itemRep = itemstats.analyze(items.map((it) => ({ questionIds: it.attempt.questionIds, answers: it.attempt.answers, orders: it.attempt.orders })), ctx.byId); } catch (e) { itemRep = null; } }
  const flaggedByCat = {};
  if (itemRep) itemRep.items.forEach((it) => { const k = it.category || "Kiến thức chung"; const x = (flaggedByCat[k] = flaggedByCat[k] || { n: 0, bad: 0 }); x.n++; if (it.flags.some((fl) => fl.code === "negative" || fl.code === "weak" || fl.code === "hard")) x.bad++; });
  Object.values(cat).filter((c) => c.n >= 15 && c.ok / c.n < 0.6).sort((a, b) => a.ok / a.n - b.ok / b.n).slice(0, 3).forEach((c) => {
    const fl = flaggedByCat[c.name], itemDriven = fl && fl.n >= 3 && fl.bad / fl.n >= 0.5;
    out.push(F("gap", "bad", "Mảng yếu của cả nhóm: " + c.name, [
      "Toàn nhóm đúng " + pc(c.ok / c.n) + "% ở mảng này (" + c.ok + "/" + c.n + " lượt trả lời).", pc(c.weakStaff / c.staff) + "% nhân viên làm dưới 60% mảng này.",
      fl ? fl.bad + "/" + fl.n + " câu của mảng có dấu hiệu bất thường (quá khó, phân biệt kém hoặc nghi sai đáp án)." : ""].filter(Boolean),
      itemDriven
        ? ["Nguyên nhân có thể nằm ở BỘ CÂU HỎI chứ không chỉ ở người học: nhiều câu của mảng này quá khó hoặc nghi gắn sai đáp án.", "Nếu câu hỏi ổn thì mới là lỗ hổng đào tạo."]
        : ["Lỗ hổng đào tạo chung: nội dung mảng này chưa được truyền đạt hoặc ôn đủ.", "Tài liệu hiện có có thể chưa rõ hoặc chưa gắn với tình huống bán hàng."],
      itemDriven
        ? [A("Vào \"Phân tích câu hỏi\" kiểm tra các câu bị cảnh báo của mảng này, sửa đáp án nếu sai rồi \"Chấm lại đề\".", "dt")]
        : [A("Tổ chức buổi đào tạo lại cho mảng \"" + c.name + "\" trước kỳ sau (ưu tiên người làm dưới 60%).", "dt"), A("Bổ sung tài liệu ngắn dạng tình huống cho mảng này.", "dt")], N >= 20 ? "cao" : "vừa"));
  });

  // Chất lượng câu hỏi nói chung
  if (itemRep) {
    const neg = itemRep.items.filter((it) => it.flags.some((fl) => fl.code === "negative"));
    if (neg.length) out.push(F("items", "bad", neg.length + " câu hỏi nghi gắn sai đáp án", ["Ở các câu này người điểm cao lại làm sai nhiều hơn người điểm thấp, dấu hiệu điển hình của đáp án sai hoặc câu mơ hồ."],
      ["Đáp án đúng bị gắn nhầm hoặc câu hỏi có hai cách hiểu."], [A("Vào \"Phân tích câu hỏi\" để xem chi tiết, sửa rồi dùng \"Chấm lại đề\" để điều chỉnh điểm.", "dt")], N >= 30 ? "cao" : "vừa"));
  }

  // Xuống sức
  const fat = fs.filter((f) => f.accFirst != null);
  if (fat.length >= MIN_COHORT && share(patterns.fatigue, fat) >= 0.25) {
    out.push(F("fatigue", "info", "Nhiều người làm kém hơn ở nửa sau bài", [pc(share(patterns.fatigue, fat)) + "% nhân viên đúng ít hơn rõ rệt ở nửa sau bài."], ["Bài đủ dài để gây mệt hoặc mất tập trung."], [A("Cân nhắc rút gọn số câu hoặc chia bài thành hai phần.", "dt")], "vừa"));
  }

  // So sánh theo nhóm quản lí (chỉ nhóm đủ lớn)
  const byMgr = {};
  items.forEach((it, k) => { const m = clip(it.cand && it.cand.manager, 60) || "(chưa có quản lí)"; (byMgr[m] = byMgr[m] || []).push(fs[k]); });
  const mgrRows = Object.keys(byMgr).filter((m) => byMgr[m].length >= 5).map((m) => ({ m, n: byMgr[m].length, avg: mean(byMgr[m].map((f) => f.pct || 0)), fs: byMgr[m] }));
  mgrRows.filter((x) => meanPct - x.avg >= 10).sort((a, b) => a.avg - b.avg).slice(0, 2).forEach((x) => {
    const wk = {}; x.fs.forEach((f) => f.byCat.forEach((c) => { const y = (wk[c.name] = wk[c.name] || { n: 0, ok: 0 }); y.n += c.n; y.ok += c.ok; }));
    const worst = Object.keys(wk).filter((k) => wk[k].n >= 8).sort((a, b) => wk[a].ok / wk[a].n - wk[b].ok / wk[b].n)[0];
    out.push(F("manager", "warn", "Nhóm \"" + x.m + "\" thấp hơn mặt bằng chung", [
      "Trung bình " + r1(x.avg) + "% (" + x.n + " người), thấp hơn trung bình toàn bộ " + r1(meanPct - x.avg) + " điểm phần trăm.", worst ? "Yếu nhất ở mảng \"" + worst + "\" (" + pc(wk[worst].ok / wk[worst].n) + "%)." : ""].filter(Boolean),
      ["Nhóm có thể chưa được phổ biến đủ nội dung, hoặc có nhiều người mới.", "Cách truyền đạt của nhóm chưa hiệu quả với một số mảng."],
      [A("Phối hợp với quản lí nhóm tổ chức buổi ôn tập" + (worst ? " tập trung mảng \"" + worst + "\"" : "") + ".", "dt")], x.n >= 10 ? "vừa" : "thấp",
      { evidenceAI: ["Một nhóm quản lí (" + x.n + " người) thấp hơn trung bình " + r1(meanPct - x.avg) + " điểm phần trăm."], titleAI: "Một nhóm quản lí thấp hơn mặt bằng chung" }));
  });

  // Môi trường làm bài
  const distr = share(patterns.distract);
  if (distr >= 0.2) out.push(F("environment", "info", "Nhiều người rời màn hình bài thi nhiều lần", [pc(distr) + "% nhân viên có từ 3 lần rời màn hình trở lên."], ["Môi trường làm bài hay bị gián đoạn (làm ngay tại điểm bán, giờ cao điểm).", "Đây chỉ là tín hiệu, chưa phải bằng chứng gian lận."], [A("Hướng dẫn làm bài ở nơi yên tĩnh, ngoài giờ cao điểm; nhắc quy định không mở ứng dụng khác.", "ql")], "vừa"));

  const strongCats = Object.values(cat).filter((c) => c.n >= 15 && c.ok / c.n >= 0.85).slice(0, 2);
  if (strongCats.length) out.push(F("strength", "ok", "Thế mạnh của cả nhóm: " + strongCats.map((c) => c.name).join(", "), strongCats.map((c) => "Mảng \"" + c.name + "\": đúng " + pc(c.ok / c.n) + "%."), ["Nội dung mảng này đã được nắm vững."], [A("Giữ nguyên cách đào tạo hiện tại cho mảng này.", "dt")], "vừa"));

  if (!out.length) out.push(F("stable", "ok", "Không phát hiện vấn đề nổi bật ở cả nhóm", ["Điểm trung bình " + meanPct + "%, không có mảng, nhóm hay hành vi bất thường rõ rệt."], [], [A("Duy trì kế hoạch đào tạo hiện tại.", "dt")], "vừa"));
  out.sort((x, y) => LEVEL_RANK[x.level] - LEVEL_RANK[y.level]);
  return {
    kind: "cohort",
    stats: { attempts: N, enough: true, meanPct, medianPct: r1(median(fs.map((f) => f.pct || 0))), timeoutRate: totalRows ? r1(totalTO / totalRows * 100) : null, staffWithTimeouts: pc(staffTO), medFrac: timed.length ? r1(median(timed.map((f) => f.medFrac)) * 100) : null,
      categories: Object.values(cat).map((c) => ({ name: c.name, n: c.n, pct: pc(c.ok / c.n), weakStaffPct: pc(c.weakStaff / c.staff) })).sort((a, b) => a.pct - b.pct) },
    findings: out
  };
}

// ---------------------------------------------------------------------------------------------
// 4. Diễn giải: nguyên nhân gốc + kế hoạch hành động (AI nếu có, không thì theo luật)
// ---------------------------------------------------------------------------------------------
const WHEN = ["Tuần 1", "Tuần 1", "Tuần 2", "Tuần 2", "Tuần 3"];
const CAUTION = "Đây là giả thuyết suy ra từ dữ liệu làm bài (đúng/sai, thời gian, hết giờ, số lần rời màn hình), chưa phải kết luận. Hãy trao đổi với nhân viên để xác nhận trước khi hành động.";

function rulesNarrative(res) {
  const act = res.findings.filter((f) => f.level !== "ok" && f.code !== "notiming" && f.code !== "small");
  const top = act.slice(0, 3);
  const isInd = res.kind === "individual";
  const summary = !act.length
    ? (res.findings.length && res.findings[0].level === "ok" ? res.findings[0].title + "." : "Chưa có đủ dữ liệu để kết luận.")
    : (isInd ? "Dữ liệu cho thấy: " : "Ở cấp nhóm, dữ liệu cho thấy: ") + top.map((f) => f.title.charAt(0).toLowerCase() + f.title.slice(1)).join("; ") + ".";
  const rootCauses = []; top.forEach((f) => { if (f.causes[0] && rootCauses.indexOf(f.causes[0]) < 0) rootCauses.push(f.causes[0]); });
  const plan = []; const seen = {};
  top.forEach((f) => f.actions.forEach((a) => { if (!seen[a.t] && plan.length < 5) { seen[a.t] = 1; plan.push({ action: a.t, owner: a.who, when: WHEN[plan.length] }); } }));
  if (act.length) plan.push({ action: isInd ? "Cho làm lại một bài tự luyện và so sánh với kết quả lần này để đánh giá mức cải thiện." : "Sau kỳ kiểm tra tiếp theo, so sánh lại các chỉ số này để đánh giá hiệu quả.", owner: isInd ? "ql" : "dt", when: "Tuần 4" });
  return { source: "rules", summary, rootCauses: rootCauses.slice(0, 4), plan, caution: CAUTION };
}

function aiConfigured() { return advice.aiConfigured(); }
function buildPrompt(res) {
  const sys =
    "Bạn là chuyên gia phân tích học tập và đào tạo nhân viên bán hàng điện máy gia dụng và máy lọc nước. " +
    "Bạn nhận KẾT QUẢ CHẨN ĐOÁN đã được tính từ dữ liệu làm bài (mỗi mục có bằng chứng, nguyên nhân giả thuyết, mức tin cậy). " +
    "Nhiệm vụ: tổng hợp thành (1) tóm tắt ngắn, (2) các nguyên nhân gốc quan trọng nhất, (3) kế hoạch hành động cụ thể theo thứ tự ưu tiên. " +
    "QUY TẮC: chỉ dựa trên dữ liệu được cung cấp, không bịa số liệu hay thông tin sản phẩm/quy trình của công ty; nguyên nhân chỉ là GIẢ THUYẾT cần xác nhận, dùng từ như \"có thể\", \"nhiều khả năng\"; " +
    "tuyệt đối không buộc tội gian lận hay đánh giá nhân cách; giọng xây dựng, tôn trọng; không nêu tên người. " +
    "Chỉ trả về DUY NHẤT một JSON hợp lệ, không kèm lời dẫn hay dấu ```: " +
    '{"tom_tat":"2-3 câu","nguyen_nhan_goc":["2 đến 4 ý, mỗi ý tối đa 200 ký tự"],"ke_hoach":[{"viec":"việc cụ thể tối đa 200 ký tự, bắt đầu bằng động từ","ai":"nhan_vien|quan_li|dao_tao","khi_nao":"Tuần 1|Tuần 2|Tuần 3|Tuần 4"}],"luu_y":"1 câu về giới hạn của kết luận"} ' +
    "với 3 đến 6 mục trong ke_hoach.";
  const data = {
    cap_do: res.kind === "cohort" ? "ca_nhom" : "ca_nhan", thong_ke: res.stats && Object.assign({}, res.stats, { categories: (res.stats.categories || []).slice(0, 8) }),
    chan_doan: res.findings.slice(0, 7).map((f) => ({ van_de: f.titleAI || f.title, muc: f.level, tin_cay: f.confidence, bang_chung: f.evidenceAI || f.evidence, nguyen_nhan_gia_thuyet: f.causes, goi_y: f.actions.map((a) => a.t) }))
  };
  return [{ role: "system", content: sys }, { role: "user", content: "Kết quả chẩn đoán:\n" + JSON.stringify(data) }];
}
const WHO = { nhan_vien: "nv", quan_li: "ql", dao_tao: "dt", nv: "nv", ql: "ql", dt: "dt" };
function parseAi(text) {
  let s = String(text || "").trim().replace(/^```[a-z]*\s*/i, "").replace(/```\s*$/i, "").trim();
  const a = s.indexOf("{"), b = s.lastIndexOf("}"); if (a < 0 || b < a) return null;
  let o; try { o = JSON.parse(s.slice(a, b + 1)); } catch (e) { return null; }
  const summary = plain(o && o.tom_tat, 480);
  const rootCauses = (Array.isArray(o && o.nguyen_nhan_goc) ? o.nguyen_nhan_goc : []).map((x) => plain(x, 220)).filter((x) => x.length >= 8).slice(0, 4);
  const plan = (Array.isArray(o && o.ke_hoach) ? o.ke_hoach : []).map((x) => ({ action: plain(x && x.viec, 220), owner: WHO[String((x && x.ai) || "").toLowerCase()] || "nv", when: /^Tuần [1-4]$/.test(String((x && x.khi_nao) || "")) ? x.khi_nao : "" })).filter((x) => x.action.length >= 8).slice(0, 6);
  if (!summary || rootCauses.length < 1 || plan.length < 2) return null;
  return { source: "ai", summary, rootCauses, plan, caution: plain(o && o.luu_y, 260) || CAUTION };
}
const cache = new Map(); // tránh gọi AI lặp lại (và tốn tiền) khi bấm nhiều lần cùng một dữ liệu
function withTimeout(p, ms) { let t; const to = new Promise((_, rej) => { t = setTimeout(() => rej(new Error("timeout")), ms); }); return Promise.race([p, to]).finally(() => clearTimeout(t)); }
async function narrate(res, opt) {
  opt = opt || {};
  const rules = rulesNarrative(res);
  if (opt.ai === false || !aiConfigured() || res.findings.every((f) => f.level === "ok" || f.code === "small")) return rules;
  const msgs = buildPrompt(res), key = JSON.stringify(msgs[1].content);
  const hit = cache.get(key); if (hit && Date.now() - hit.at < 10 * 60 * 1000) return hit.v;
  try {
    const raw = await withTimeout(llm.chat(msgs, { temperature: 0.3, max_tokens: 900, task: "behavior" }), opt.timeoutMs || Math.max(3000, parseInt(process.env.INSIGHT_TIMEOUT_MS, 10) || 20000));
    const ai = parseAi(raw);
    if (ai) { if (cache.size > 200) cache.clear(); cache.set(key, { at: Date.now(), v: ai }); return ai; }
  } catch (e) { /* dùng bản luật */ }
  return rules;
}

// ---------------------------------------------------------------------------------------------
// 5. Nạp dữ liệu từ kho rồi phân tích (dùng chung cho kt-viewer và kt-admin)
// ---------------------------------------------------------------------------------------------
const COHORT_CAP = 300;
// Chỉ giữ phần hiển thị cho trình duyệt (bỏ các trường dùng riêng cho AI)
const view = (f) => ({ code: f.code, level: f.level, title: f.title, evidence: f.evidence, causes: f.causes, actions: f.actions, confidence: f.confidence });

async function forEmployee(code, ctx) {
  const quiz = require("./quiz");
  const rows = (await quiz.getIndex()).filter((a) => a.status === "submitted" && quiz.normCode(a.code) === quiz.normCode(code))
    .sort((a, b) => (a.submittedAt || 0) - (b.submittedAt || 0)).slice(-6);
  if (!rows.length) return null;
  const atts = await quiz.loadAttempts(rows), sc = {}, items = [];
  for (const a of atts) { const p = a.period || ""; if (!sc[p]) sc[p] = await quiz.getExamSettings(p); items.push({ attempt: a, settings: sc[p] }); }
  if (!items.length) return null;
  const res = individual(items, ctx);
  const narrative = await narrate(res, { ai: !(ctx && ctx.ai === false) });
  return { attemptsUsed: items.length, stats: res.stats, findings: res.findings.map(view), narrative };
}

async function forCohort(period, cands, ctx) {
  const quiz = require("./quiz");
  const set = {}; cands.forEach((c) => { set[quiz.normCode(c.code)] = c; });
  const latest = {};
  (await quiz.getIndex()).filter((r) => r.status === "submitted" && (r.period || "") === period && set[quiz.normCode(r.code)]).forEach((r) => {
    const k = quiz.normCode(r.code); if (!latest[k] || (r.submittedAt || 0) > (latest[k].submittedAt || 0)) latest[k] = r;
  });
  const all = Object.values(latest).sort((a, b) => (b.submittedAt || 0) - (a.submittedAt || 0));
  const atts = await quiz.loadAttempts(all.slice(0, COHORT_CAP));
  const settings = await quiz.getExamSettings(period);
  const items = atts.map((a) => ({ attempt: a, settings, cand: set[quiz.normCode(a.code)] }));
  const byId = {}; (await quiz.getQuestions()).forEach((q) => { byId[q.id] = q; });
  const res = cohort(items, { byId });
  const narrative = await narrate(res, { ai: !(ctx && ctx.ai === false) });
  return { period, capped: all.length > COHORT_CAP, stats: res.stats, findings: res.findings.map(view), narrative };
}

module.exports = { forEmployee, forCohort, featuresOf, rowsOf, individual, cohort, narrate, rulesNarrative, parseAi, patterns, MIN_COHORT };
