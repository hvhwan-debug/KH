// Phân tích chất lượng câu hỏi theo lý thuyết trắc nghiệm cổ điển (classical test theory).
// Với mỗi câu: độ khó thực tế (% làm đúng), tỉ lệ bỏ trống, độ phân biệt (tương quan điểm-nhị phân giữa
// "đúng/sai câu này" và điểm tổng của thí sinh TRỪ chính câu này), và số lượt chọn từng phương án gây nhiễu.
// Lưu ý: đề được rút ngẫu nhiên nên mỗi câu chỉ được tính trên những thí sinh đã gặp câu đó.
const quiz = require("./quiz");

const MIN_N = 30;          // dưới ngưỡng này không đưa ra nhận xét về độ phân biệt (mẫu quá nhỏ, tương quan rất nhiễu)
const HARD_BELOW = 0.30;   // % đúng thấp hơn: quá khó
const EASY_ABOVE = 0.90;   // % đúng cao hơn: quá dễ
const BLANK_ABOVE = 0.20;  // % bỏ trống cao hơn: có thể câu mơ hồ hoặc quá dài, hết giờ

function mean(a) { return a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0; }
function sd(a) { if (a.length < 2) return 0; const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) * (x - m), 0) / (a.length - 1)); }
function median(a) { if (!a.length) return 0; const b = a.slice().sort((x, y) => x - y), h = b.length >> 1; return b.length % 2 ? b[h] : (b[h - 1] + b[h]) / 2; }

// Tương quan điểm-nhị phân: r = (M1 - M0) / s * sqrt(p*q). Trả null nếu không tính được.
function pointBiserial(flags, totals) {
  const n = flags.length; if (n < 2) return null;
  const s = sd(totals); if (!s) return null;
  const ones = [], zeros = [];
  flags.forEach((f, i) => (f ? ones : zeros).push(totals[i]));
  if (!ones.length || !zeros.length) return null;
  const p = ones.length / n, q = 1 - p;
  // s dùng độ lệch chuẩn tổng thể (n) cho đúng công thức r_pb
  const sPop = s * Math.sqrt((n - 1) / n);
  return (mean(ones) - mean(zeros)) / sPop * Math.sqrt(p * q);
}

function verdictFor(it) {
  const flags = [];
  if (it.n < MIN_N) { flags.push({ code: "small", level: "info", text: "Chưa đủ mẫu (" + it.n + "/" + MIN_N + " lượt)" }); }
  if (it.pCorrect != null && it.n >= 10) {
    if (it.pCorrect < HARD_BELOW) flags.push({ code: "hard", level: "warn", text: "Quá khó (" + Math.round(it.pCorrect * 100) + "% đúng)" });
    if (it.pCorrect > EASY_ABOVE) flags.push({ code: "easy", level: "info", text: "Quá dễ (" + Math.round(it.pCorrect * 100) + "% đúng)" });
  }
  if (it.blankRate > BLANK_ABOVE && it.n >= 10) flags.push({ code: "blank", level: "warn", text: "Nhiều người bỏ trống (" + Math.round(it.blankRate * 100) + "%)" });
  // Câu quá dễ/quá khó (đa số cùng đúng hoặc cùng sai) thì tương quan không ổn định, không kết luận về độ phân biệt.
  if (it.n >= MIN_N && it.discrimination != null && it.pCorrect >= 0.10 && it.pCorrect <= 0.95) {
    // Âm có ý nghĩa thống kê (một phía, ~95%): r < -1.65/sqrt(n-1), và tối thiểu -0.10, để không báo oan vì nhiễu.
    const negCut = -Math.max(0.10, 1.65 / Math.sqrt(it.n - 1));
    if (it.discrimination < negCut) flags.push({ code: "negative", level: "bad", text: "Người giỏi làm sai nhiều hơn người yếu: kiểm tra lại đáp án" });
    else if (it.discrimination < 0.15) flags.push({ code: "weak", level: "warn", text: "Phân biệt kém: cân nhắc sửa hoặc thay" });
  }
  // Phương án gây nhiễu không ai chọn: vô dụng (chỉ xét câu có >= 3 phương án và đủ mẫu)
  if (it.n >= MIN_N && it.options && it.options.length >= 3) {
    const dead = it.options.filter((o) => !o.isKey && o.count === 0).length;
    if (dead > 0) flags.push({ code: "deadOption", level: "info", text: dead + " phương án sai không ai chọn" });
  }
  if (!flags.length || (flags.length === 1 && flags[0].code === "small")) {
    if (it.n >= MIN_N && it.discrimination != null && it.discrimination >= 0.3) flags.push({ code: "good", level: "ok", text: "Tốt" });
  }
  return flags;
}
const RANK = { bad: 0, warn: 1, info: 2, ok: 3 };

// attempts: danh sách bài đã nộp (đã nạp đủ answers/orders/questionIds); byId: ngân hàng câu hỏi hiện tại.
function analyze(attempts, byId) {
  const graded = attempts.map((a) => {
    const items = [];
    (a.questionIds || []).forEach((qid) => {
      const q = byId[qid]; if (!q) return;
      const g = quiz.gradeAnswer(q, a.answers && a.answers[qid], a.orders && a.orders[qid]);
      items.push({ qid, q, g });
    });
    const ok = items.filter((x) => x.g.ok).length;
    return { a, items, ok, total: items.length };
  }).filter((x) => x.total >= 2); // bài chỉ có 1 câu không có "điểm tổng trừ câu này" để so sánh

  const per = {};
  graded.forEach((r) => {
    r.items.forEach((x) => {
      const rec = (per[x.qid] = per[x.qid] || { q: x.q, flags: [], rest: [], correct: 0, blank: 0, n: 0, counts: {} });
      rec.n++;
      rec.flags.push(x.g.ok ? 1 : 0);
      rec.rest.push((r.ok - (x.g.ok ? 1 : 0)) / (r.total - 1)); // điểm tổng (0..1) không tính chính câu này
      if (x.g.ok) rec.correct++;
      if (x.g.state === "blank") rec.blank++;
      x.g.chosenOrig.forEach((i) => { rec.counts[i] = (rec.counts[i] || 0) + 1; });
    });
  });

  const items = Object.keys(per).map((qid) => {
    const r = per[qid], q = r.q, type = quiz.qType(q);
    const it = {
      id: qid, text: q.text, type, category: q.category || "", bankId: q.bankId || "default", difficulty: q.difficulty || "",
      n: r.n, pCorrect: r.n ? r.correct / r.n : null, blankRate: r.n ? r.blank / r.n : 0,
      discrimination: pointBiserial(r.flags, r.rest)
    };
    if (type !== "fill") {
      const keys = type === "multi" ? (q.correctIndexes || []) : [q.correctIndex];
      it.options = (q.options || []).map((text, i) => ({ text, isKey: keys.indexOf(i) >= 0, count: r.counts[i] || 0, rate: r.n ? (r.counts[i] || 0) / r.n : 0 }));
    }
    it.flags = verdictFor(it);
    it.severity = it.flags.length ? Math.min.apply(null, it.flags.map((f) => RANK[f.level])) : 3;
    return it;
  });
  items.sort((a, b) => a.severity - b.severity || (a.pCorrect || 0) - (b.pCorrect || 0));

  const pcts = graded.map((r) => r.ok / r.total * 100);
  return {
    summary: { attempts: graded.length, meanPct: Math.round(mean(pcts) * 10) / 10, sdPct: Math.round(sd(pcts) * 10) / 10, medianPct: Math.round(median(pcts) * 10) / 10, minN: MIN_N },
    items
  };
}

module.exports = { analyze, pointBiserial, MIN_N };
