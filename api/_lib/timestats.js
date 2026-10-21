// Thống kê THỜI GIAN TRẢ LỜI: từng câu của một bài làm, từng câu hỏi trên toàn đề, và tổng quan cả đề.
// Cách tính: thời gian một câu = lúc trả lời câu đó - lúc câu đó hiện ra
//   (câu đầu: lúc bắt đầu làm bài; câu sau: lúc trả lời câu ngay trước).
// - Câu HẾT GIỜ do máy chủ tự ghi (auto) không có thời gian "trả lời" thật: tách riêng thành tỉ lệ hết giờ,
//   KHÔNG đưa vào trung bình (nếu đưa vào sẽ kéo trung bình lên sai).
// - Thời gian bị chặn trên ở mức tối đa mỗi câu + 3 giây dung sai mạng (khớp GRACE_MS của máy chủ).
// - Bài làm bị gián đoạn (thoát ra vào lại) vẫn đúng vì máy chủ đã tự ghi các câu quá hạn là hết giờ.

function mean(a) { return a.length ? a.reduce((x, y) => x + y, 0) / a.length : null; }
function sd(a) { if (a.length < 2) return null; const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) * (x - m), 0) / (a.length - 1)); }
function quant(a, p) {
  if (!a.length) return null;
  const b = a.slice().sort((x, y) => x - y), pos = (b.length - 1) * p, lo = Math.floor(pos), hi = Math.ceil(pos);
  return b[lo] + (b[hi] - b[lo]) * (pos - lo);
}
const r1 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 10) / 10);
const vn = (x) => (x == null ? "–" : String(x).replace(".", ","));
const r3 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 1000) / 1000);

// Ngưỡng nhận xét (tính theo PHẦN của thời gian tối đa mỗi câu)
const FAST = 0.15;      // trung vị dưới 15% thời gian: trả lời rất nhanh
const SLOW = 0.6;       // trung vị từ 60% thời gian: mất nhiều thời gian đọc / suy nghĩ
const TIMEOUT_HI = 0.15;// trên 15% lượt hết giờ
const MIN_TIMED = 5;    // dưới số lượt có thời gian này thì không nhận xét
// Các khoảng phân bố (phần của thời gian tối đa). Khoảng cuối là "hết giờ".
const BINS = [0, 0.1, 0.25, 0.5, 0.75, 1.0001];

// Thời gian từng câu của MỘT bài làm, theo đúng thứ tự câu trong đề.
// Trả về [{ qid, pos (1..n), sec|null, timeout, answered }]
function perQuestion(a) {
  const limit = Math.max(10, a.secondsPerQuestion || 60), capMs = limit * 1000 + 3000;
  const out = []; let prevT = a.startedAt || null;
  (a.questionIds || []).forEach((qid, i) => {
    const ans = (a.answers || {})[qid];
    if (!ans) { out.push({ qid, pos: i + 1, sec: null, timeout: false, answered: false, missing: true }); return; }
    const at = ans.answeredAt || null, auto = !!ans.auto;
    let sec = null;
    if (!auto && at && prevT) sec = Math.max(0, Math.min(capMs, at - prevT)) / 1000;
    if (at) prevT = at;
    const blank = auto || (ans.answerIndex === -1 && !(ans.answerIndexes && ans.answerIndexes.length) && !(typeof ans.text === "string" && ans.text.trim()));
    out.push({ qid, pos: i + 1, sec: r1(sec), timeout: auto, answered: !blank });
  });
  return { limit, rows: out };
}

// Tóm tắt thời gian của MỘT bài làm (để hiện cùng bản sao bài làm).
function attemptSummary(a) {
  const { limit, rows } = perQuestion(a);
  const secs = rows.filter((r) => r.sec != null && r.answered).map((r) => r.sec);
  const fastest = rows.filter((r) => r.sec != null && r.answered).sort((x, y) => x.sec - y.sec)[0];
  const slowest = rows.filter((r) => r.sec != null && r.answered).sort((x, y) => y.sec - x.sec)[0];
  return {
    limit, rows,
    mean: r1(mean(secs)), median: r1(quant(secs, 0.5)), sd: r1(sd(secs)),
    fastest: fastest ? { pos: fastest.pos, sec: fastest.sec } : null,
    slowest: slowest ? { pos: slowest.pos, sec: slowest.sec } : null,
    timeouts: rows.filter((r) => r.timeout).length, timed: secs.length,
    totalSec: r1(secs.reduce((x, y) => x + y, 0) + rows.filter((r) => r.timeout).length * limit)
  };
}

function statsOf(secs, limit) {
  return {
    n: secs.length,
    mean: r1(mean(secs)), median: r1(quant(secs, 0.5)), sd: r1(sd(secs)),
    min: r1(secs.length ? Math.min.apply(null, secs) : null), max: r1(secs.length ? Math.max.apply(null, secs) : null),
    p10: r1(quant(secs, 0.1)), p25: r1(quant(secs, 0.25)), p75: r1(quant(secs, 0.75)), p90: r1(quant(secs, 0.9)),
    medianFrac: limit && secs.length ? r3(quant(secs, 0.5) / limit) : null
  };
}
function histOf(secs, timeouts, limit) {
  const counts = new Array(BINS.length - 1).fill(0);
  secs.forEach((s) => { const f = s / limit; for (let k = 0; k < BINS.length - 1; k++) if (f >= BINS[k] && f < BINS[k + 1]) { counts[k]++; return; } counts[counts.length - 1]++; });
  return BINS.slice(0, -1).map((lo, k) => ({ from: r1(lo * limit), to: r1(Math.min(1, BINS[k + 1]) * limit), count: counts[k] })).concat([{ timeout: true, count: timeouts }]);
}
function notesFor(it) {
  const out = [];
  if (it.timed < MIN_TIMED) return out;
  const f = it.time.medianFrac;
  if (it.timeoutRate > TIMEOUT_HI) out.push({ level: "warn", text: "Nhiều lượt hết giờ (" + Math.round(it.timeoutRate * 100) + "%): câu có thể quá dài hoặc khó hiểu" });
  if (f != null && f >= SLOW) out.push({ level: "warn", text: "Mất nhiều thời gian (trung vị " + vn(it.time.median) + " giây, " + Math.round(f * 100) + "% thời gian cho phép)" });
  if (f != null && f < FAST && it.pCorrect != null && it.pCorrect < 0.5) out.push({ level: "warn", text: "Trả lời rất nhanh nhưng đúng ít: có thể đoán bừa hoặc phương án gây hiểu nhầm" });
  if (f != null && f < FAST && it.pCorrect != null && it.pCorrect > 0.9) out.push({ level: "info", text: "Trả lời rất nhanh và hầu hết đúng: câu quá dễ hoặc lộ đáp án" });
  if (it.correctMean != null && it.wrongMean != null && it.wrongMean > it.correctMean * 1.5 && it.wrongN >= 3) out.push({ level: "info", text: "Người làm sai mất thời gian gấp " + vn(r1(it.wrongMean / it.correctMean)) + " lần người làm đúng" });
  return out;
}

// Phân tích cả đề. attempts: [{ questionIds, answers, orders, startedAt, secondsPerQuestion }]; byId: ngân hàng câu hỏi;
// grade(q, ans, order) -> { ok, state }.
function analyze(attempts, byId, grade) {
  const per = {}, all = [], allOk = [], allBad = [], byPos = {}, byCat = {}, perAttempt = [];
  let timeoutsAll = 0, rowsAll = 0;
  const limits = {};
  attempts.forEach((a) => {
    const { limit, rows } = perQuestion(a);
    limits[limit] = (limits[limit] || 0) + 1;
    let attSecs = 0, attTimed = 0;
    rows.forEach((r) => {
      const q = byId[r.qid]; if (!q || r.missing) return;
      const g = grade(q, (a.answers || {})[r.qid], (a.orders || {})[r.qid]);
      const ok = !!g.ok;
      rowsAll++;
      const rec = (per[r.qid] = per[r.qid] || { q, limitVotes: {}, secs: [], okSecs: [], badSecs: [], seen: 0, timeouts: 0, correct: 0, positions: [] });
      rec.seen++; rec.limitVotes[limit] = (rec.limitVotes[limit] || 0) + 1; rec.positions.push(r.pos);
      if (ok) rec.correct++;
      if (r.timeout) { rec.timeouts++; timeoutsAll++; }
      const cat = q.category || "Chưa phân loại";
      const c = (byCat[cat] = byCat[cat] || { name: cat, secs: [], seen: 0, timeouts: 0, correct: 0 });
      c.seen++; if (r.timeout) c.timeouts++; if (ok) c.correct++;
      const p = (byPos[r.pos] = byPos[r.pos] || { pos: r.pos, secs: [], seen: 0, timeouts: 0, correct: 0 });
      p.seen++; if (r.timeout) p.timeouts++; if (ok) p.correct++;
      if (r.sec != null && r.answered) {
        rec.secs.push(r.sec); (ok ? rec.okSecs : rec.badSecs).push(r.sec);
        all.push(r.sec); (ok ? allOk : allBad).push(r.sec);
        c.secs.push(r.sec); p.secs.push(r.sec);
        attSecs += r.sec; attTimed++;
      }
    });
    if (attTimed) perAttempt.push(attSecs / attTimed);
  });
  const mainLimit = +Object.keys(limits).sort((x, y) => limits[y] - limits[x])[0] || 60;

  const items = Object.keys(per).map((qid) => {
    const r = per[qid];
    const limit = +Object.keys(r.limitVotes).sort((x, y) => r.limitVotes[y] - r.limitVotes[x])[0] || mainLimit;
    const it = {
      id: qid, limit, seen: r.seen, timed: r.secs.length,
      timeouts: r.timeouts, timeoutRate: r.seen ? r3(r.timeouts / r.seen) : 0,
      pCorrect: r.seen ? r3(r.correct / r.seen) : null,
      time: statsOf(r.secs, limit),
      correctMean: r1(mean(r.okSecs)), correctMedian: r1(quant(r.okSecs, 0.5)), correctN: r.okSecs.length,
      wrongMean: r1(mean(r.badSecs)), wrongMedian: r1(quant(r.badSecs, 0.5)), wrongN: r.badSecs.length,
      avgPos: r1(mean(r.positions)),
      hist: histOf(r.secs, r.timeouts, limit)
    };
    it.notes = notesFor(it);
    return it;
  });

  // Độ chính xác theo tốc độ (so với thời gian cho phép): trả lời nhanh / vừa / chậm thì đúng bao nhiêu %
  const speedBands = [["Rất nhanh", 0, 0.15], ["Nhanh", 0.15, 0.35], ["Vừa", 0.35, 0.6], ["Chậm", 0.6, 1.1]].map(([label, lo, hi]) => {
    let n = 0, ok = 0;
    attempts.forEach((a) => {
      const { limit, rows } = perQuestion(a);
      rows.forEach((r) => {
        if (r.sec == null || !r.answered) return; const f = r.sec / limit; if (f < lo || f >= hi) return;
        const q = byId[r.qid]; if (!q) return; n++; if (grade(q, a.answers[r.qid], (a.orders || {})[r.qid]).ok) ok++;
      });
    });
    return { label, from: r1(lo * mainLimit), to: r1(Math.min(1, hi) * mainLimit), n, accuracy: n ? r3(ok / n) : null };
  });

  return {
    summary: Object.assign(statsOf(all, mainLimit), {
      limit: mainLimit, attempts: attempts.length, questionsSeen: rowsAll,
      timeouts: timeoutsAll, timeoutRate: rowsAll ? r3(timeoutsAll / rowsAll) : 0,
      correctMean: r1(mean(allOk)), correctMedian: r1(quant(allOk, 0.5)),
      wrongMean: r1(mean(allBad)), wrongMedian: r1(quant(allBad, 0.5)),
      perAttemptMean: statsOf(perAttempt, mainLimit), // trung bình mỗi câu của từng người, rồi thống kê giữa các người
      hist: histOf(all, timeoutsAll, mainLimit)
    }),
    byCategory: Object.values(byCat).map((c) => Object.assign({ name: c.name, seen: c.seen, timeoutRate: c.seen ? r3(c.timeouts / c.seen) : 0, pCorrect: c.seen ? r3(c.correct / c.seen) : null }, statsOf(c.secs, mainLimit)))
      .sort((x, y) => (y.median || 0) - (x.median || 0)),
    byPosition: Object.values(byPos).sort((x, y) => x.pos - y.pos).map((p) => ({ pos: p.pos, seen: p.seen, mean: r1(mean(p.secs)), median: r1(quant(p.secs, 0.5)), timeoutRate: p.seen ? r3(p.timeouts / p.seen) : 0, pCorrect: p.seen ? r3(p.correct / p.seen) : null })),
    speedBands,
    items
  };
}

module.exports = { perQuestion, attemptSummary, analyze };
