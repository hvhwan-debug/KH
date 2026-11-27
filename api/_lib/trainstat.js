// Thống kê phục vụ lập kế hoạch đào tạo và ĐÁNH GIÁ HIỆU QUẢ sau đào tạo.
//  - hardQuestions: câu hỏi có tỷ lệ trả lời sai cao theo từng vị trí (chỉ số liệu tổng hợp, không định danh người). Quét bài làm theo từng lần có giới hạn thời gian
//    và lưu tạm (kt/trainplan-qstat.json) nên lần sau nhanh; bài chưa quét kịp sẽ được quét ở lần sau.
//  - effectiveness: với luồng đào tạo của một tháng: đăng ký, kết quả bài kiểm tra củng cố, số phản hồi khảo sát, đối chiếu với số liệu nền lúc lập kế hoạch.
//    Không kết luận nhân quả: chỉ nêu số liệu để quản trị viên đánh giá.
const store = require("./store");
const quiz = require("./quiz");
const CTX = require("./hrcontext");
const P = require("./programs");

const QC_KEY = "kt/trainplan-qstat.json", MIN_N = 5, MIN_WRONG = 40;
const keyOf = (text) => quiz.normText(text).slice(0, 120);
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const r1 = (v) => (v == null || !isFinite(v) ? null : Math.round(v * 10) / 10);

async function hardQuestions(opt) {
  opt = opt || {}; const budget = opt.budgetMs || 8000, t0 = Date.now();
  const cands = (await quiz.getCandidates()).filter((c) => !quiz.isLeft(c)), byCode = new Map(cands.map((c) => [quiz.normCode(c.code), c]));
  const index = (await quiz.getIndex()).filter((r) => r && r.status === "submitted" && byCode.has(quiz.normCode(r.code)));
  const cache = (await store.get(QC_KEY).catch(() => null)) || {}; cache.att = cache.att || {}; cache.texts = cache.texts || {};
  const need = index.filter((r) => !cache.att[r.id]); let i = 0, changed = 0;
  async function worker() {
    while (i < need.length && Date.now() - t0 < budget) {
      const r = need[i++];
      try {
        const a = await quiz.getAttempt(r.id), list = [];
        if (a && Array.isArray(a.paper)) a.paper.forEach((q) => { if (!q || !q.text) return; const k = keyOf(q.text); if (!cache.texts[k]) cache.texts[k] = { t: String(q.text).slice(0, 200), c: String(q.category || "").slice(0, 100) }; list.push([k, q.ok ? 1 : 0]); });
        cache.att[r.id] = list; changed++;
      } catch (e) { /* quét lại lần sau */ }
    }
  }
  await Promise.all(Array.from({ length: 8 }, worker));
  if (changed) await store.put(QC_KEY, cache).catch(() => {});
  const agg = {};
  index.forEach((r) => {
    const list = cache.att[r.id]; if (!list) return; const c = byCode.get(quiz.normCode(r.code)), label = CTX.audienceOf({ title: c.title, segment: quiz.normSegment(c.segment) }), A = agg[label] = agg[label] || {};
    list.forEach((x) => { const o = A[x[0]] = A[x[0]] || { n: 0, wrong: 0 }; o.n++; if (!x[1]) o.wrong++; });
  });
  const areaOf = require("./hrcompetency").areaOf, byAudience = {};
  Object.keys(agg).forEach((label) => {
    byAudience[label] = Object.keys(agg[label]).map((k) => { const a = areaOf(cache.texts[k].c); return { text: cache.texts[k].t, area: a === "gn" ? "" : a, n: agg[label][k].n, wrongPct: Math.round(100 * agg[label][k].wrong / agg[label][k].n) }; })
      .filter((x) => x.n >= MIN_N && x.wrongPct >= MIN_WRONG).sort((a, b) => b.wrongPct - a.wrongPct || b.n - a.n).slice(0, 5);
  });
  return { byAudience, missing: index.filter((r) => !cache.att[r.id]).length };
}

async function effectiveness(month) {
  const TP = require("./trainplan"), TF = require("./trainflow"), ks = require("./survey");
  const plan = await TP.get(month), flow = await TF.load(month);
  if (!flow) return { ok: true, month, created: false, items: [] };
  const index = await quiz.getIndex(), exams = await quiz.getExams(), base = (plan && plan.baseline && plan.baseline.items) || [], items = [];
  for (const it of flow.items) {
    if (!it.programId && !it.examId) continue;
    const o = { index: it.index, title: it.title, audience: it.audience || "" };
    if (it.programId) { const R = await P.regs(it.programId); o.program = { invited: Object.keys(R.invited).length, regs: Object.keys(R.regs).length, cancels: Object.keys(R.cancels).length }; }
    if (it.examId) {
      const ex = exams.find((e) => e.id === it.examId), best = new Map();
      index.filter((r) => r && r.status === "submitted" && (r.period || "") === it.examId && r.pct != null).forEach((r) => { const k = quiz.normCode(r.code), v = Number(r.pct); if (!best.has(k) || v > best.get(k)) best.set(k, v); });
      const set = ex ? await quiz.getExamSettings(it.examId) : null, vals = Array.from(best.values()), total = ex ? (ex.codes || []).length : 0;
      o.exam = { audience: total, taken: vals.length, takenPct: total ? Math.round(100 * vals.length / total) : null, avgPct: r1(mean(vals)), passRate: set && set.passEnabled && vals.length ? Math.round(100 * vals.filter((v) => v >= Number(set.passScore || 0)).length / vals.length) : null, passScore: set && set.passEnabled ? Number(set.passScore || 0) : null };
    }
    if (it.surveyCode) o.survey = { responses: await ks.countResponses(it.surveyCode).catch(() => 0) };
    const key = Object.keys(TP.SHORT).find((k) => TP.SHORT[k] === o.audience); o.baseline = base.filter((b) => b.key === key).map((b) => ({ area: b.areaName, avg: b.avg, min: b.min }));
    items.push(o);
  }
  return { ok: true, month, created: true, hasBaseline: !!base.length, items, note: "Điểm bài kiểm tra củng cố không cùng thang với điểm năng lực theo mảng trước đào tạo; số liệu chỉ để tham khảo, không kết luận nhân quả." };
}

module.exports = { hardQuestions, effectiveness };
