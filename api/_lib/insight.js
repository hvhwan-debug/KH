// "Chân dung làm bài" của MỘT thí sinh: các quan sát CỤ THỂ, có số liệu, tính hoàn toàn bằng thống kê (không cần AI).
// Mục tiêu: người đọc thấy nhận xét "nói đúng về chính mình", vì mỗi ý đều dựa trên dấu vết thật của bài làm:
//   nhịp độ từng câu, phong độ nửa đầu / nửa sau, chuỗi đúng liên tiếp, độ chính xác khi trả lời nhanh / chậm,
//   mảng mạnh / yếu (và so với kỳ trước), vị trí so với đồng nghiệp cùng đề và cùng nhóm, xu hướng qua các kỳ.
// Dùng cho: lời khuyên theo luật (dự phòng) và làm DỮ LIỆU DUY NHẤT cho AI viết lời văn (AI không được bịa thêm).
const ts = require("./timestats");

const r0 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x));
const r1 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 10) / 10);
function median(a) { if (!a.length) return null; const b = a.slice().sort((x, y) => x - y), h = b.length >> 1; return b.length % 2 ? b[h] : (b[h - 1] + b[h]) / 2; }
const clip = (s, n) => String(s == null ? "" : s).replace(/\s+/g, " ").trim().slice(0, n);
const vn = (x) => String(x).replace(".", ",");

// Tên gọi: tiếng Việt gọi bằng tên (từ cuối), vd "Hoàng Văn Hoan" -> "Hoan"
function firstName(full) {
  const p = clip(full, 80).split(" ").filter(Boolean);
  return p.length ? p[p.length - 1] : "";
}

function catOf(paper) {
  const m = {};
  (paper || []).forEach((q) => { const k = clip(q.category, 60) || "Kiến thức chung"; const x = (m[k] = m[k] || { name: k, n: 0, ok: 0 }); x.n++; if (q.ok) x.ok++; });
  return m;
}

// ctx: { index: [dòng chỉ số bài làm], prevAttempt: bài làm gần nhất trước đó (đủ paper) | null }
function build(attempt, settings, ctx) {
  ctx = ctx || {};
  const paper = Array.isArray(attempt.paper) ? attempt.paper : [];
  const total = attempt.total || paper.length || 0;
  const correct = attempt.score != null ? attempt.score : paper.filter((q) => q.ok).length;
  const pct = attempt.pct != null ? attempt.pct : (total ? Math.round(correct / total * 100) : 0);
  const T = ts.perQuestion(attempt), L = T.limit;
  const okAt = {}; paper.forEach((q) => { okAt[q.n] = q.chosen < 0 ? "blank" : (q.ok ? "ok" : "bad"); });
  const rows = T.rows.map((r) => Object.assign({}, r, { st: r.timeout ? "timeout" : (okAt[r.pos] || (r.answered ? "bad" : "blank")) }));
  const n = rows.length;

  // ---- Nhịp độ
  const timed = rows.filter((r) => r.sec != null && r.answered);
  const secs = timed.map((r) => r.sec);
  const speed = {
    limitSec: L, medianSec: r1(median(secs)), meanSec: r1(secs.length ? secs.reduce((a, b) => a + b, 0) / secs.length : null),
    timeouts: rows.filter((r) => r.timeout).length,
    timeoutPositions: rows.filter((r) => r.timeout).map((r) => r.pos)
  };
  // Độ chính xác khi trả lời nhanh (dưới 35% thời gian cho phép) và khi cân nhắc lâu hơn
  const fastRows = timed.filter((r) => r.sec < L * 0.35), slowRows = timed.filter((r) => r.sec >= L * 0.35);
  const acc = (list) => (list.length ? Math.round(list.filter((r) => r.st === "ok").length / list.length * 100) : null);
  speed.fast = { n: fastRows.length, accuracyPct: acc(fastRows) };
  speed.slow = { n: slowRows.length, accuracyPct: acc(slowRows) };
  const fastWrong = timed.filter((r) => r.st === "bad" && r.sec < L * 0.15);
  speed.fastWrong = fastWrong.length; speed.fastWrongPositions = fastWrong.map((r) => r.pos).slice(0, 6);
  const slowWrong = timed.filter((r) => r.st === "bad" && r.sec >= L * 0.6);
  speed.slowWrong = slowWrong.length;
  const slowest = timed.slice().sort((a, b) => b.sec - a.sec)[0], fastest = timed.slice().sort((a, b) => a.sec - b.sec)[0];
  speed.slowest = slowest ? { pos: slowest.pos, sec: slowest.sec, result: slowest.st } : null;
  speed.fastest = fastest ? { pos: fastest.pos, sec: fastest.sec, result: fastest.st } : null;

  // ---- Phong độ theo tiến trình bài
  const half = Math.floor(n / 2);
  const part = (list) => ({ n: list.length, correct: list.filter((r) => r.st === "ok").length, pct: acc(list), medianSec: r1(median(list.filter((r) => r.sec != null && r.answered).map((r) => r.sec))) });
  const flow = n >= 8 ? { firstHalf: part(rows.slice(0, half)), secondHalf: part(rows.slice(half)) } : null;
  if (flow) flow.deltaPct = flow.secondHalf.pct - flow.firstHalf.pct;
  // Chuỗi đúng liên tiếp dài nhất, mở đầu và kết thúc bài
  let best = 0, cur = 0, bestEnd = 0;
  rows.forEach((r, i) => { if (r.st === "ok") { cur++; if (cur > best) { best = cur; bestEnd = i + 1; } } else cur = 0; });
  const streak = best >= 3 ? { length: best, fromQ: bestEnd - best + 1, toQ: bestEnd } : null;
  const k = Math.min(5, Math.floor(n / 3));
  const opening = k >= 3 ? { questions: k, correct: rows.slice(0, k).filter((r) => r.st === "ok").length } : null;
  const closing = k >= 3 ? { questions: k, correct: rows.slice(n - k).filter((r) => r.st === "ok").length } : null;

  // ---- Mảng kiến thức (+ so với kỳ trước nếu có bài kỳ trước)
  const cm = catOf(paper), prevCm = ctx.prevAttempt && Array.isArray(ctx.prevAttempt.paper) ? catOf(ctx.prevAttempt.paper) : null;
  const secByCat = {};
  paper.forEach((q) => { const r = T.rows[q.n - 1]; if (r && r.sec != null && r.answered) { const c = clip(q.category, 60) || "Kiến thức chung"; (secByCat[c] = secByCat[c] || []).push(r.sec); } });
  const categories = Object.values(cm).map((c) => {
    const o = { name: c.name, n: c.n, correct: c.ok, pct: Math.round(c.ok / c.n * 100), medianSec: r1(median(secByCat[c.name] || [])) };
    const p = prevCm && prevCm[c.name];
    if (p && p.n >= 2) { o.prevPct = Math.round(p.ok / p.n * 100); o.deltaPct = o.pct - o.prevPct; }
    return o;
  }).sort((a, b) => a.pct - b.pct || b.n - a.n);
  const usable = categories.filter((c) => c.n >= 3);
  const strongest = usable.slice().sort((a, b) => b.pct - a.pct)[0] || null, weakest = usable[0] || null;

  // ---- So với đồng nghiệp (cùng đề) và cùng nhóm quản lí
  let peers = null;
  const idx = Array.isArray(ctx.index) ? ctx.index : [];
  const same = idx.filter((x) => x.status === "submitted" && (x.period || "") === (attempt.period || "") && x.id !== attempt.id && x.total);
  const latestBy = {}; same.forEach((x) => { const c = String(x.code || "").toLowerCase(); if (!latestBy[c] || (x.submittedAt || 0) > (latestBy[c].submittedAt || 0)) latestBy[c] = x; });
  const others = Object.values(latestBy).filter((x) => String(x.code || "").toLowerCase() !== String(attempt.code || "").toLowerCase());
  if (others.length >= 4) {
    const below = others.filter((x) => (x.pct || 0) < pct).length, eq = others.filter((x) => (x.pct || 0) === pct).length;
    const pr = Math.round((below + eq / 2) / others.length * 100);
    const avg = Math.round(others.reduce((a, x) => a + (x.pct || 0), 0) / others.length);
    const mySpq = attempt.submittedAt && attempt.startedAt && total ? (attempt.submittedAt - attempt.startedAt) / 1000 / total : null;
    const spqs = others.map((x) => (x.durationSec && x.total ? x.durationSec / x.total : null)).filter((v) => v != null);
    peers = { count: others.length, avgPct: avg, betterThanPct: pr, diffFromAvg: pct - avg };
    if (mySpq != null && spqs.length >= 4) { peers.avgSecPerQ = r1(spqs.reduce((a, b) => a + b, 0) / spqs.length); peers.mySecPerQ = r1(mySpq); peers.fasterThanPct = Math.round(spqs.filter((v) => v > mySpq).length / spqs.length * 100); }
    const team = others.filter((x) => attempt.manager && x.manager === attempt.manager);
    if (team.length >= 3) {
      const rankT = team.filter((x) => (x.pct || 0) > pct).length + 1;
      peers.team = { size: team.length + 1, rank: rankT, avgPct: Math.round(team.reduce((a, x) => a + (x.pct || 0), 0) / team.length) };
    }
  }

  // ---- Lịch sử qua các kỳ (bài chính thức, mỗi kỳ lấy bài mới nhất)
  const mine = idx.filter((x) => x.status === "submitted" && !x.practice && String(x.code || "").toLowerCase() === String(attempt.code || "").toLowerCase() && (x.period || "") !== (attempt.period || ""));
  const byP = {}; mine.forEach((x) => { const p = x.period || ""; if (!byP[p] || (x.submittedAt || 0) > (byP[p].submittedAt || 0)) byP[p] = x; });
  const hist = Object.values(byP).sort((a, b) => (a.submittedAt || 0) - (b.submittedAt || 0)).slice(-4).map((x) => ({ period: x.period || "", pct: x.pct }));
  let history = null;
  if (hist.length) {
    const seq = hist.map((h) => h.pct).concat([pct]);
    let ups = 0; for (let i = seq.length - 1; i > 0 && seq[i] > seq[i - 1]; i--) ups++;
    history = { previous: hist, deltaFromLast: pct - hist[hist.length - 1].pct, consecutiveImprovements: ups, personalBest: hist.every((h) => pct > h.pct), bestPrevPct: Math.max.apply(null, hist.map((h) => h.pct)) };
  }

  // ---- Đặc điểm nổi bật (traits) kèm bằng chứng cụ thể. Sắp theo mức quan trọng.
  const traits = [];
  const add = (key, label, evidence, w, say) => traits.push({ key, label, evidence, weight: w, say: say || (label + ": " + evidence) });
  const fq = speed.medianSec != null ? speed.medianSec / L : null;
  if (pct >= 85 && fq != null && fq < 0.3) add("sharp", "Chắc tay và nhanh nhạy", "đúng " + correct + "/" + total + " câu, trung vị chỉ " + vn(speed.medianSec) + " giây mỗi câu", 9);
  else if (pct >= 85) add("careful", "Cẩn thận, chắc chắn", "đúng " + correct + "/" + total + " câu, dành trung vị " + vn(speed.medianSec) + " giây để cân nhắc mỗi câu", 8);
  if (flow && flow.firstHalf.n >= 4 && flow.deltaPct <= -20) add("fade", "Mạnh ở đầu, hụt hơi về cuối", "nửa đầu đúng " + flow.firstHalf.correct + "/" + flow.firstHalf.n + " câu nhưng nửa sau chỉ " + flow.secondHalf.correct + "/" + flow.secondHalf.n + " câu", 10, "Bạn vào bài rất chắc với " + flow.firstHalf.correct + "/" + flow.firstHalf.n + " câu đúng ở nửa đầu, nhưng nửa sau chỉ còn " + flow.secondHalf.correct + "/" + flow.secondHalf.n + (flow.secondHalf.medianSec != null && flow.firstHalf.medianSec != null && flow.secondHalf.medianSec < flow.firstHalf.medianSec * 0.6 ? ", đúng lúc bạn tăng tốc từ khoảng " + vn(flow.firstHalf.medianSec) + " giây xuống chỉ " + vn(flow.secondHalf.medianSec) + " giây mỗi câu" : ""));
  if (flow && flow.firstHalf.n >= 4 && flow.deltaPct >= 20) add("warmup", "Khởi động chậm, càng về sau càng chắc", "nửa đầu đúng " + flow.firstHalf.correct + "/" + flow.firstHalf.n + " câu, nửa sau lên " + flow.secondHalf.correct + "/" + flow.secondHalf.n + " câu", 9);
  if (speed.fastWrong >= 3 && speed.fastWrong >= (attempt.wrong || 0) * 0.5) add("rush", "Nhanh nhưng dễ trượt vì vội", speed.fastWrong + " câu sai được chọn trong chưa đầy " + Math.round(L * 0.15) + " giây", 10, speed.fastWrong + "/" + rows.filter((r) => r.st === "bad").length + " câu bạn trả lời sai được chọn trong chưa đầy " + Math.round(L * 0.15) + " giây, nghĩa là phần lớn điểm mất đi vì vội chứ chưa hẳn vì không biết");
  if (speed.slowWrong >= 3) add("unsure", "Cân nhắc kỹ nhưng kiến thức còn chưa chắc", speed.slowWrong + " câu mất từ " + Math.round(L * 0.6) + " giây trở lên mà vẫn sai", 8);
  if (speed.timeouts >= 2) add("clock", "Bị đồng hồ bỏ lại", speed.timeouts + " câu hết giờ (câu " + speed.timeoutPositions.slice(0, 5).join(", ") + ")", 9, "Đồng hồ đã lấy mất của bạn " + speed.timeouts + " câu (câu " + speed.timeoutPositions.slice(0, 5).join(", ") + ") mà bạn chưa kịp chọn");
  if (strongest && weakest && strongest.name !== weakest.name && strongest.pct - weakest.pct >= 40) add("split", "Lệch mảng rõ rệt", "\"" + strongest.name + "\" đúng " + strongest.correct + "/" + strongest.n + " nhưng \"" + weakest.name + "\" chỉ " + weakest.correct + "/" + weakest.n, 9, "Bạn rất vững \"" + strongest.name + "\" (" + strongest.correct + "/" + strongest.n + ") nhưng \"" + weakest.name + "\" mới đúng " + weakest.correct + "/" + weakest.n + ": khoảng trống nằm gọn ở một mảng, nên sửa được nhanh");
  if (speed.fast.n >= 5 && speed.slow.n >= 5 && speed.fast.accuracyPct - speed.slow.accuracyPct >= 25) add("instinct", "Trực giác tốt: câu chọn nhanh lại đúng nhiều hơn", "chọn nhanh đúng " + speed.fast.accuracyPct + "%, câu phải nghĩ lâu chỉ đúng " + speed.slow.accuracyPct + "%", 7);
  if (speed.fast.n >= 5 && speed.slow.n >= 5 && speed.slow.accuracyPct - speed.fast.accuracyPct >= 25) add("think", "Làm tốt hơn hẳn khi chịu dừng lại suy nghĩ", "câu cân nhắc lâu đúng " + speed.slow.accuracyPct + "%, câu chọn nhanh chỉ đúng " + speed.fast.accuracyPct + "%", 8, "Khi chịu dừng lại suy nghĩ, bạn đúng tới " + speed.slow.accuracyPct + "%; khi chọn nhanh thì chỉ đúng " + speed.fast.accuracyPct + "%");
  if (streak && streak.length >= Math.max(5, Math.round(n * 0.3))) add("streak", "Có những đoạn rất chắc tay", streak.length + " câu đúng liên tiếp (câu " + streak.fromQ + " đến câu " + streak.toQ + ")", 6);
  if (history && history.consecutiveImprovements >= 2) add("rising", "Đang tiến bộ đều", "tăng " + history.consecutiveImprovements + " kỳ liên tiếp", 9);
  else if (history && history.personalBest && history.deltaFromLast >= 5) add("best", "Kết quả tốt nhất từ trước đến nay", "cao hơn mức tốt nhất trước đây (" + history.bestPrevPct + "%)", 8, "Đây là kết quả tốt nhất của bạn từ trước đến nay, vượt mức " + history.bestPrevPct + "% trước đây");
  else if (history && history.deltaFromLast <= -10) add("dip", "Phong độ đi xuống so với kỳ trước", "giảm " + Math.abs(history.deltaFromLast) + " điểm % so với kỳ " + history.previous[history.previous.length - 1].period, 8);
  const improvedCat = categories.filter((c) => c.deltaPct != null && c.deltaPct >= 25 && c.n >= 3).sort((a, b) => b.deltaPct - a.deltaPct)[0];
  if (improvedCat) add("catup", "Đã cải thiện rõ ở \"" + improvedCat.name + "\"", "từ " + improvedCat.prevPct + "% lên " + improvedCat.pct + "%", 7);
  if (peers && peers.team && peers.team.rank === 1 && peers.team.size >= 4) add("teamtop", "Đứng đầu nhóm", "hạng 1/" + peers.team.size + " trong nhóm cùng quản lí (trung bình nhóm " + peers.team.avgPct + "%)", 7);
  if (peers && peers.betterThanPct >= 80) add("top", "Thuộc nhóm dẫn đầu", "cao hơn " + peers.betterThanPct + "% người cùng làm đề này", 7);
  traits.sort((a, b) => b.weight - a.weight);

  return {
    firstName: firstName(attempt.name),
    speed, flow, streak, opening, closing,
    categories, strongest: strongest ? { name: strongest.name, correct: strongest.correct, n: strongest.n, pct: strongest.pct } : null,
    weakest: weakest && weakest.pct < 100 ? { name: weakest.name, correct: weakest.correct, n: weakest.n, pct: weakest.pct } : null,
    peers, history,
    traits: traits.slice(0, 4).map((t) => ({ key: t.key, label: t.label, evidence: t.evidence, say: t.say })),
    suggestSecPerQ: Math.max(10, Math.round(L * 0.25))
  };
}

// Chân dung bằng lời (dự phòng khi không có AI): 2-3 câu, mỗi câu dựa trên một bằng chứng cụ thể.
function portraitText(ins, f) {
  if (!ins) return "";
  const t = ins.traits || [];
  if (f && f.beh && f.beh.random) return "Bài làm của bạn diễn ra rất nhanh" + (ins.speed.medianSec != null ? " (trung vị " + vn(ins.speed.medianSec) + " giây mỗi câu)" : "") + " và kết quả gần mức chọn ngẫu nhiên, nên đây chưa phải thước đo đúng về bạn.";
  const s = t.slice(0, 2).map((x) => x.say + ".");
  if (s.length < 2 && ins.streak) s.push("Đoạn chắc tay nhất của bạn là từ câu " + ins.streak.fromQ + " đến câu " + ins.streak.toQ + ", " + ins.streak.length + " câu đúng liên tiếp.");
  if (ins.peers && s.length < 3) {
    const p = ins.peers;
    s.push(p.diffFromAvg >= 0 ? "Trong " + p.count + " người cùng làm đề, bạn cao hơn " + p.betterThanPct + "% số người (trung bình chung " + p.avgPct + "%)."
      : "Kết quả đang thấp hơn mức trung bình chung của " + p.count + " người cùng làm đề (" + p.avgPct + "%) " + Math.abs(p.diffFromAvg) + " điểm %.");
  }
  return s.slice(0, 3).join(" ");
}
function cap(x) { return x ? x.charAt(0).toUpperCase() + x.slice(1) : x; }

module.exports = { build, portraitText, firstName };
