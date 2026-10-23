// Chỉ ADMIN_EMAILS: quản lý ngân hàng đề, danh sách thí sinh, cài đặt bài kiểm tra, xem kết quả.
const { reply, guardConfigured, requireAjax, requireUserActive } = require("../_lib/http");
const { isAdmin, validEmail, emailAllowed } = require("../_lib/config");
const quiz = require("../_lib/quiz");
const { modelName } = require("../_lib/devicename");
const store = require("../_lib/store");
const pwdlib = require("../_lib/pwd");
const crypto = require("crypto");
const { uidOf } = require("../_lib/session");
const { inviteManager } = require("../_lib/invite");

// ---------- Tự chấm lại khi SỬA câu hỏi trong ngân hàng ----------
// Bài đã nộp lưu sẵn điểm + bản sao đề lúc nộp, nên trước đây sửa đáp án trong ngân hàng không làm các nơi đó đổi theo.
// Nay: sửa câu hỏi xong thì mọi bài ĐÃ NỘP có chứa câu đó được chấm lại ngay (điểm, %, đạt/chưa đạt, điểm tuân thủ,
// bản sao bài làm, dòng trong bảng chỉ số) -> kết quả, hồ sơ, trang xác thực, thống kê đều khớp đáp án mới.
// An toàn: bài nào đổi số phương án / đổi loại câu hỏi (không còn khớp thứ tự thí sinh đã thấy) hoặc có câu đã xoá thì KHÔNG đụng tới.
const REGRADE_BUDGET_MS = 25000; // quá thời gian này thì dừng và báo "chưa xong" (có thể bấm Chấm lại ở màn thống kê đề)
function gradingSig(q) { // phần của câu hỏi mà bản sao bài làm / điểm phụ thuộc vào
  if (!q) return "";
  return JSON.stringify([q.text, q.category || "", quiz.qType(q), q.options || [], q.correctIndex, q.correctIndexes || [], q.accepted || []]);
}
function structureOk(a, qid, q) {
  const t = quiz.qType(q);
  const i = (a.questionIds || []).indexOf(qid);
  const old = Array.isArray(a.paper) ? a.paper.find((x) => x && x.n === i + 1) : null;
  if (old && old.type && old.type !== t) return false;                  // đổi loại câu (vd. chọn 1 -> điền từ)
  if (t === "fill") return true;
  const n = (q.options || []).length, order = a.orders && a.orders[qid];
  if (Array.isArray(order)) return order.length === n && order.every((k) => Number.isInteger(k) && k >= 0 && k < n);
  return !(old && Array.isArray(old.options) && old.options.length !== n);
}
async function regradeAffected(qids, by) {
  const want = new Set(qids), started = Date.now();
  const rows = (await quiz.getIndex()).filter((r) => r.status === "submitted");
  const byId = {}; (await quiz.getQuestions()).forEach((q) => { byId[q.id] = q; });
  const advice = require("../_lib/advice"), settingsOf = {};
  const st = { scanned: 0, examined: 0, changed: 0, up: 0, down: 0, paperUpdated: 0, skipped: 0, incomplete: false };
  const patches = {};
  for (let i = 0; i < rows.length; i += 20) {
    if (Date.now() - started > REGRADE_BUDGET_MS) { st.incomplete = true; break; }
    const atts = await Promise.all(rows.slice(i, i + 20).map((r) => quiz.getAttempt(r.id).catch(() => null)));
    for (const a of atts) {
      if (!a || a.status !== "submitted") continue;
      st.scanned++;
      const hit = (a.questionIds || []).filter((qid) => want.has(qid));
      if (!hit.length) continue;
      if ((a.questionIds || []).some((qid) => !byId[qid]) || hit.some((qid) => !structureOk(a, qid, byId[qid]))) { st.skipped++; continue; }
      st.examined++;
      const per = a.period || "";
      const settings = settingsOf[per] || (settingsOf[per] = await quiz.getExamSettings(per));
      const sc = quiz.scoreAttempt(a, byId, settings);
      const same = a.score === sc.correct && a.pct === sc.pct && a.wrong === sc.wrongN && (a.compliancePoints == null ? null : a.compliancePoints) === (sc.compliance == null ? null : sc.compliance);
      const paper = quiz.buildPaper(a, byId);
      const paperChanged = JSON.stringify(paper) !== JSON.stringify(a.paper || []);
      if (same && !paperChanged) continue;
      if (!same) {
        st.changed++; if (sc.pct > a.pct) st.up++; else if (sc.pct < a.pct) st.down++;
        (a.regrade = a.regrade || []).push({ at: Date.now(), by, auto: true, scoreBefore: a.score, pctBefore: a.pct, complianceBefore: a.compliancePoints == null ? null : a.compliancePoints, passedBefore: a.passed == null ? null : a.passed });
        Object.assign(a, { score: sc.correct, total: sc.total, pct: sc.pct, passed: sc.passed, scoreOutOf10: sc.scoreOutOf10, compliancePoints: sc.compliance, wrong: sc.wrongN, blank: sc.blank, regradedAt: Date.now() });
        a.advice = advice.rulesAdvice(advice.facts(a, settings, null)); // điểm đã đổi nên lời khuyên cũ không còn đúng: dựng lại theo luật
        patches[a.id] = { score: sc.correct, total: sc.total, pct: sc.pct, passed: sc.passed, scoreOutOf10: sc.scoreOutOf10, compliancePoints: sc.compliance, wrong: sc.wrongN, blank: sc.blank, regradedAt: a.regradedAt };
      } else st.paperUpdated++;
      a.paper = paper;
      await quiz.putAttempt(a);
    }
  }
  if (Object.keys(patches).length) await quiz.patchIndex(patches);
  return st;
}

const handler = async function (context, req) {
  try {
    if (guardConfigured(context)) return;
    const u = await requireUserActive(context, req);
    if (!u) return;
    if (!isAdmin(u.email)) return reply(context, 403, { ok: false, error: "Bạn không có quyền quản trị." });

    if (req.method === "GET") {
      const op = (req.query && req.query.op) || "";
      if (op === "questions") {
        await quiz.ensureBankPeriods();
        const st = await quiz.getSettings();
        return reply(context, 200, { ok: true, questions: await quiz.getQuestions(), banks: await quiz.getBanks(), currentPeriod: st.examPeriod, questionCount: st.questionCount, bothGiaDungCount: st.bothGiaDungCount });
      }
      // Danh sách ngân hàng kèm thống kê (số câu, theo độ khó, danh mục, thẻ) để dựng cấu trúc đề.
      if (op === "banks") {
        const [banks, qs] = await Promise.all([quiz.getBanks(), quiz.getQuestions()]);
        const stat = (b) => {
          const l = qs.filter((q) => quiz.bankOf(q) === b.id && quiz.usableQ(q));
          const cnt = (f) => l.reduce((m, q) => { const k = f(q); if (k) m[k] = (m[k] || 0) + 1; return m; }, {});
          const tags = {}; l.forEach((q) => (q.tags || []).forEach((t) => { tags[t] = (tags[t] || 0) + 1; }));
          return Object.assign({}, b, { total: qs.filter((q) => quiz.bankOf(q) === b.id).length, usable: l.length, byDifficulty: cnt((q) => q.difficulty), byCategory: cnt((q) => q.category), byTag: tags });
        };
        return reply(context, 200, { ok: true, banks: banks.map(stat) });
      }
      // Phân tích chất lượng câu hỏi của một đề thi: độ khó thực tế, độ phân biệt, phương án gây nhiễu.
      if (op === "itemAnalysis") {
        const examId = String((req.query && req.query.exam) || "");
        const latest = {};
        (await quiz.getIndex()).filter((r) => r.status === "submitted" && (r.period || "") === examId).forEach((r) => {
          const k = quiz.normCode(r.code); if (!latest[k] || (r.submittedAt || 0) > (latest[k].submittedAt || 0)) latest[k] = r; // mỗi người tính bài mới nhất
        });
        const rows = Object.values(latest).sort((a, b) => (b.submittedAt || 0) - (a.submittedAt || 0)).slice(0, 500);
        const atts = [];
        for (let i = 0; i < rows.length; i += 25) { // đọc từng nhóm nhỏ: bài làm có kèm ảnh nên khá nặng
          const chunk = await Promise.all(rows.slice(i, i + 25).map((r) => quiz.getAttempt(r.id).catch(() => null)));
          chunk.forEach((a) => { if (a && a.status === "submitted") atts.push({ questionIds: a.questionIds, answers: a.answers, orders: a.orders, startedAt: a.startedAt, secondsPerQuestion: a.secondsPerQuestion }); });
        }
        const byId = {}; (await quiz.getQuestions()).forEach((q) => { byId[q.id] = q; });
        const r = require("../_lib/itemstats").analyze(atts, byId);
        // Thời gian trả lời: tổng quan đề, theo mảng, theo vị trí câu, theo tốc độ, và từng câu hỏi
        let timing = null;
        try { timing = require("../_lib/timestats").analyze(atts, byId, (q, ans, order) => quiz.gradeAnswer(q, ans, order)); } catch (e) { timing = null; }
        // Theo dõi AI: bao nhiêu bài nhận lời khuyên do AI viết, bao nhiêu rơi về bản luật và vì sao
        const ai = {}; rows.forEach((x) => { const k = x.aiStatus || "unknown"; ai[k] = (ai[k] || 0) + 1; });
        return reply(context, 200, { ok: true, exam: examId, capped: rows.length >= 500, summary: r.summary, items: r.items, timing, ai });
      }
      // Kiểm tra AI của lời khuyên: chạy THẬT đường AI trên số liệu mẫu để biết vì sao lời khuyên có thể đang dùng bản dự phòng.
      // Chỉ trả về trạng thái (không lộ khóa hay tên nhà cung cấp).
      if (op === "aiCheck") {
        const adv = require("../_lib/advice"), env = process.env;
        const r = await adv.selfTest(15000);
        return reply(context, 200, { ok: true, status: r.status, ms: r.ms, timeoutMs: Math.max(1000, parseInt(env.ADVICE_TIMEOUT_MS, 10) || 7000),
          configured: { azure: !!(env.AZURE_OPENAI_ENDPOINT && env.AZURE_OPENAI_KEY && env.AZURE_OPENAI_DEPLOYMENT), groq: !!env.GROQ_API_KEY, mock: env.AI_MODE === "mock", off: env.ADVICE_AI === "off" } });
      }
      // Chẩn đoán cả nhóm cho một đề: hành vi làm bài, mảng yếu, chất lượng câu hỏi, nhóm quản lí, rồi đề xuất khắc phục.
      if (op === "cohortInsight") {
        const st = await quiz.getSettings();
        const reqP = String((req.query && req.query.period) || "");
        const period = reqP && quiz.validPeriod(reqP) ? reqP : st.examPeriod;
        const exSt = await quiz.getExamSettings(period);
        const r = await require("../_lib/behavior").forCohort(period, (await quiz.getCandidates()).filter((c) => quiz.inAudience(exSt, c)), { ai: req.query.ai !== "0" });
        return reply(context, 200, Object.assign({ ok: true }, r));
      }
      // Xem trước cấu trúc đề: mỗi quy tắc có bao nhiêu câu khả dụng, có thiếu không.
      // Xem trước đề SẼ PHÁT cho từng nhóm ngành, theo đúng logic tạo đề thật (quiz.planExam).
      // Nhận cài đặt đang nhập trên form (chưa lưu) để quản trị viên kiểm tra trước khi bấm Lưu.
      if (op === "previewPlan") {
        let draft = {}; try { draft = JSON.parse(String(req.query.exam || "{}")) || {}; } catch (e) { draft = {}; }
        const id = String(draft.id || "");
        const eff = Object.assign({}, await quiz.getExamSettings(id || (await quiz.getSettings()).examPeriod));
        ["questionCount", "bothGiaDungCount"].forEach((k) => { if (draft[k] !== undefined && draft[k] !== "") eff[k] = draft[k]; });
        if (draft.segmentPlans !== undefined) {
          const sp = draft.segmentPlans ? quiz.cleanSegmentPlans(draft.segmentPlans) : {};
          if (sp.error) return reply(context, 400, { ok: false, error: sp.error });
          eff.segmentPlans = Object.keys(sp).length ? sp : ((await quiz.getSettings()).segmentPlans || {});
        }
        if (draft.blueprint !== undefined) { const bp = quiz.cleanBlueprint(draft.blueprint); if (bp && bp.error) return reply(context, 400, { ok: false, error: bp.error }); eff.blueprint = bp; }
        const err = quiz.validateCounts({ questionCount: eff.questionCount, bothGiaDungCount: eff.bothGiaDungCount, blueprint: eff.blueprint }, 0);
        const all = await quiz.getQuestions();
        const segs = eff.blueprint && eff.blueprint.rules && eff.blueprint.rules.length ? [["*", "Mọi thí sinh"]] : [["gia_dung", "Bán Gia dụng"], ["may_loc", "Bán Máy lọc nước"], ["both", "Bán cả 2 ngành"]];
        const plans = segs.map(([seg, label]) => { const p = quiz.planExam(all, eff, seg); return { segment: seg, label, target: p.target, got: p.picked.length, short: p.short, pool: p.pool, mode: p.mode, source: p.source, parts: p.parts, error: p.error }; });
        return reply(context, 200, { ok: true, max: quiz.MAX_QUESTION_COUNT, invalid: err || "", plans });
      }
      if (op === "previewBlueprint") {
        let bp; try { bp = quiz.cleanBlueprint(JSON.parse(String(req.query.blueprint || "null"))); } catch (e) { bp = { error: "Cấu trúc đề không hợp lệ." }; }
        if (!bp) return reply(context, 200, { ok: true, report: [], total: 0 });
        if (bp.error) return reply(context, 400, { ok: false, error: bp.error });
        const r = quiz.buildFromBlueprint(await quiz.getQuestions(), bp);
        return reply(context, 200, { ok: true, report: r.report, total: r.picked.length, wanted: quiz.blueprintTotal(bp) });
      }
      if (op === "questionsBackup") {
        const bk = await quiz.getQuestionsBackup();
        return reply(context, 200, { ok: true, backup: bk && Array.isArray(bk.questions) ? { count: bk.questions.length, at: bk.at } : null });
      }
      if (op === "deleteAllPreview") {
        const bk = await quiz.getQuestionsBackup();
        return reply(context, 200, {
          ok: true, count: (await quiz.getQuestions()).filter((q) => typeof req.query.period !== "string" || (q.period || "") === req.query.period).length, inProgress: await quiz.countInProgress(),
          backup: bk && Array.isArray(bk.questions) ? { count: bk.questions.length, at: bk.at } : null
        });
      }
      if (op === "viewers") {
        const cands = await quiz.getCandidates();
        const viewers = (await quiz.getViewers()).map((v) => Object.assign({}, v, { employees: cands.filter((c) => quiz.inScope(v, c)).length }));
        const managers = Array.from(new Set(cands.map((c) => String(c.manager || "").trim()).filter(Boolean))).sort();
        return reply(context, 200, { ok: true, viewers, managers });
      }
      if (op === "candidates") return reply(context, 200, { ok: true, candidates: (await quiz.getCandidates()).map((c) => { const o = Object.assign({}, c); delete o.audit; return o; }) });
      if (op === "settings") return reply(context, 200, { ok: true, settings: await quiz.getSettings() });
      if (op === "faceRejections") {
        const list = (await require("../_lib/facecheck").getRejections()).slice().reverse();
        return reply(context, 200, { ok: true, rejections: list });
      }
      if (op === "exams") return reply(context, 200, { ok: true, exams: await quiz.listExamsSummary(), currentPeriod: (await quiz.getSettings()).examPeriod, maxQuestions: quiz.MAX_QUESTION_COUNT });
      if (op === "results") {
        const st = await quiz.getSettings();
        const all = await quiz.getIndex();
        const periods = Array.from(new Set(all.map((r) => r.period || "(chưa gắn kỳ)"))).sort().reverse();
        const wantPeriod = (req.query && req.query.period) || "";
        const list = all.filter((r) => !wantPeriod || (r.period || "(chưa gắn kỳ)") === wantPeriod)
          .sort((a, b) => (b.submittedAt || 0) - (a.submittedAt || 0))
          .map((r) => Object.assign({}, r, { passed: quiz.passState(r.pct, st) })); // luôn theo cài đặt hiện tại; null = bài không có ngưỡng
        return reply(context, 200, { ok: true, results: list, periods, currentPeriod: st.examPeriod });
      }
      if (op === "audit") {
        // Nhật ký thao tác theo ngày (giờ Việt Nam). Chỉ quản trị viên xem được; không có thao tác xoá.
        const al = require("../_lib/auditlog");
        const day = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.day || "")) ? String(req.query.day) : al.vnDay(Date.now());
        const r = await al.readDay(day, 3000);
        return reply(context, 200, { ok: true, day, items: r.items, total: r.total });
      }
      if (op === "dashboard") {
        // Tổng quan để đánh giá một kỳ: hoàn thành, phân bố điểm, điểm tuân thủ, theo quản lí / nhóm ngành,
        // ai chưa làm, cảnh báo gian lận, câu hỏi sai nhiều nhất, so sánh với kỳ trước.
        const st = await quiz.getSettings();
        const all = (await quiz.getIndex()).filter((r) => r.status === "submitted");
        let cands = await quiz.getCandidates();
        const reqP = String((req.query && req.query.period) || "");
        const period = reqP && quiz.validPeriod(reqP) ? reqP : st.examPeriod; // nhận cả mã đề tự đặt (vd thi-thu), không chỉ YYYY-MM
        const exSt = await quiz.getExamSettings(period);
        const allCands = cands;
        cands = cands.filter((c) => quiz.inAudience(exSt, c)); // "chưa làm" chỉ tính trên đúng đối tượng của đề
        const periods = Array.from(new Set(all.map((r) => r.period).filter(Boolean).concat([st.examPeriod]))).sort();
        const untagged = all.filter((r) => !r.period).length;
        const latestOf = (p) => { const m = {}; all.filter((r) => (r.period || "") === p).forEach((r) => { const k = quiz.normCode(r.code); if (!m[k] || (r.submittedAt || 0) > (m[k].submittedAt || 0)) m[k] = r; }); return m; };
        const cur = latestOf(period), rows = Object.values(cur);
        const candBy = {}; allCands.forEach((c) => { candBy[quiz.normCode(c.code)] = c; });
        const segOf = (code) => { const c = candBy[quiz.normCode(code)]; return c ? quiz.normSegment(c.segment) : ""; };
        const pcts = rows.map((r) => r.pct || 0).sort((a, b) => a - b);
        const avg = (a) => a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length * 10) / 10 : null;
        const median = pcts.length ? (pcts.length % 2 ? pcts[(pcts.length - 1) / 2] : (pcts[pcts.length / 2 - 1] + pcts[pcts.length / 2]) / 2) : null;
        const lo = st.complianceLowMin * 10, mid = st.complianceMidMin * 10, hi = st.complianceHighMin * 10;
        const bands = [
          { key: "lt", label: "Dưới " + st.complianceLowMin + " điểm", pts: 0, n: 0 },
          { key: "low", label: st.complianceLowMin + " – dưới " + st.complianceMidMin, pts: 10, n: 0 },
          { key: "mid", label: st.complianceMidMin + " – dưới " + st.complianceHighMin, pts: 15, n: 0 },
          { key: "hi", label: "Từ " + st.complianceHighMin + " điểm", pts: 20, n: 0 }
        ];
        rows.forEach((r) => { const p = r.pct || 0; bands[p >= hi ? 3 : p >= mid ? 2 : p >= lo ? 1 : 0].n++; });
        const group = (keyOf, nameOf) => {
          const g = {};
          const get = (k) => (g[k] = g[k] || { name: nameOf(k), total: 0, done: 0, pcts: [], weak: 0 });
          cands.forEach((c) => { get(keyOf(c)).total++; });
          rows.forEach((r) => { const c = candBy[quiz.normCode(r.code)] || { manager: r.manager, segment: "" }; const x = get(keyOf(c)); x.done++; x.pcts.push(r.pct || 0); if ((r.pct || 0) < lo) x.weak++; if (!candBy[quiz.normCode(r.code)]) x.total++; });
          return Object.values(g).map((x) => ({ name: x.name, total: x.total, done: x.done, avgPct: avg(x.pcts), weak: x.weak })).sort((a, b) => b.total - a.total);
        };
        const SEGN = { both: "Cả hai ngành", gia_dung: "Gia dụng", may_loc: "Máy lọc nước" };
        const byManager = group((c) => (c.manager || "").trim() || "(chưa có quản lí)", (k) => k);
        const bySegment = group((c) => quiz.normSegment(c.segment) || "both", (k) => SEGN[k] || k);
        const notDone = cands.filter((c) => !cur[quiz.normCode(c.code)]).map((c) => ({ code: c.code, name: c.name || "", manager: c.manager || "" }));
        const durs = rows.map((r) => r.durationSec).filter((d) => d > 0);
        const flags = {
          blur: rows.filter((r) => r.flags && r.flags.blur).length, shot: rows.filter((r) => r.flags && r.flags.shot).length,
          devChanged: rows.filter((r) => r.device && r.device.changed).length, locDenied: rows.filter((r) => r.device && !r.device.loc && r.device.locErr === "denied").length,
          moved: rows.filter((r) => r.device && r.device.movedKm > 2).length, noDevice: rows.filter((r) => !r.device).length,
          faceUnverified: rows.filter((r) => r.face && r.face !== "ok").length
        };
        const MONTH = /^\d{4}-\d{2}$/; // so sánh "kỳ trước" chỉ có nghĩa giữa các kỳ theo tháng, không so đề mã tự đặt với kỳ tháng
        const prevP = MONTH.test(period) ? periods.filter((p) => MONTH.test(p) && p < period).pop() || "" : "";
        let prev = null;
        if (prevP) { const pr = Object.values(latestOf(prevP)); prev = { period: prevP, submitted: pr.length, avgPct: avg(pr.map((r) => r.pct || 0)), weak: pr.filter((r) => (r.pct || 0) < lo).length }; }
        // Câu hỏi sai nhiều nhất: đọc bản sao bài làm (tối đa 400 bài gần nhất của kỳ)
        const qs = {}, cs = {};
        const sample = rows.slice().sort((a, b) => (b.submittedAt || 0) - (a.submittedAt || 0)).slice(0, 400);
        const atts = await Promise.all(sample.map((r) => quiz.getAttempt(r.id).catch(() => null)));
        atts.forEach((a) => { if (!a || !Array.isArray(a.paper)) return; a.paper.forEach((q) => {
          const k = q.text; const x = (qs[k] = qs[k] || { text: q.text, answer: q.answerText || (q.options || [])[q.correct] || "", n: 0, wrong: 0, blank: 0 });
          x.n++; if (q.chosen < 0) x.blank++; else if (!q.ok) x.wrong++;
          const ck = (q.category || "").trim() || "Kiến thức chung", cx = (cs[ck] = cs[ck] || { name: ck, n: 0, miss: 0 });
          cx.n++; if (!q.ok) cx.miss++; }); });
        // Mảng kiến thức cả nhóm làm yếu nhất (tỉ lệ sai + bỏ trống), chỉ xét mảng đủ số lượt để đáng tin
        const weakCats = Object.values(cs).filter((c) => c.n >= 5 && c.miss > 0).map((c) => Object.assign(c, { rate: Math.round(c.miss / c.n * 100) })).sort((a, b) => b.rate - a.rate || b.n - a.n).slice(0, 6);
        const topWrong = Object.values(qs).filter((x) => x.n >= Math.min(3, rows.length)).map((x) => Object.assign(x, { rate: Math.round((x.wrong + x.blank) / x.n * 100) }))
          .filter((x) => x.rate > 0).sort((a, b) => b.rate - a.rate || b.n - a.n).slice(0, 8);
        return reply(context, 200, { ok: true, period, currentPeriod: st.examPeriod, periods, untagged,
          candidates: cands.length, submitted: rows.length, avgPct: avg(pcts), medianPct: median, minPct: pcts[0] == null ? null : pcts[0], maxPct: pcts.length ? pcts[pcts.length - 1] : null,
          avgDurationSec: durs.length ? Math.round(durs.reduce((a, b) => a + b, 0) / durs.length) : null,
          passEnabled: !!st.passEnabled, passed: st.passEnabled ? rows.filter((r) => quiz.passState(r.pct, st) === true).length : null,
          complianceEnabled: !!st.complianceEnabled, lowPct: st.complianceLowMin * 10, bands, byManager, bySegment, notDone: notDone.slice(0, 1000), notDoneCount: notDone.length, flags, prev, topWrong, weakCats, papersRead: atts.filter(Boolean).length });
      }
      if (op === "result") {
        const a = await quiz.getAttempt(String(req.query.id || ""));
        if (!a) return reply(context, 404, { ok: false, error: "Không tìm thấy." });
        const allQ = await quiz.getQuestions();
        const byId = {}; allQ.forEach((q) => { byId[q.id] = q; });
        const detail = a.questionIds.map((qid) => {
          const q = byId[qid] || { text: "(câu hỏi đã bị xoá)", options: [] };
          const ans = a.answers[qid];
          const order = a.orders[qid] || (q.options || []).map((_, i) => i);
          const type = quiz.qType(q), g = byId[qid] ? quiz.gradeAnswer(q, ans, a.orders[qid]) : null;
          const chosenIndex = type === "single" && ans && ans.answerIndex >= 0 ? order[ans.answerIndex] : -1;
          return { text: q.text, type, options: q.options || [], correctIndex: q.correctIndex, correctIndexes: q.correctIndexes || [], accepted: q.accepted || [],
            chosenIndex, chosenIndexes: g ? g.chosenOrig : [], chosenText: g ? g.chosenText : "", answerText: g ? g.correctText : "", ok: g ? g.ok : false,
            answered: g ? g.state !== "blank" : !!ans };
        });
        if (Array.isArray(a.devices)) a.devices = a.devices.map((d) => Object.assign({}, d, { model: modelName(d.model, d.screen) || d.model }));
        return reply(context, 200, { ok: true, attempt: a, detail });
      }
      return reply(context, 400, { ok: false, error: "Thiếu tham số op." });
    }

    if (!requireAjax(context, req)) return;
    const b = req.body || {};
    const op = b.op || "";

    if (op === "saveQuestion") {
      const list = await quiz.getQuestions();
      const q = b.question || {};
      const nq = quiz.normalizeQuestionInput(q);
      if (nq.error) return reply(context, 400, { ok: false, error: nq.error });
      const base = Object.assign({ category: String(q.category || "").slice(0, 100) }, nq.fields);
      // Kỳ của câu hỏi: lấy theo yêu cầu; câu mới không nêu kỳ thì vào kỳ hiện tại
      const per = quiz.validPeriod(q.period) && typeof q.period === "string" ? q.period : undefined;
      let editedId = "", gradingChanged = false;
      if (q.id) {
        const i = list.findIndex((x) => x.id === q.id);
        if (i < 0) return reply(context, 404, { ok: false, error: "Không tìm thấy câu hỏi." });
        const prev = Object.assign({}, list[i]);
        const sigBefore = gradingSig(list[i]);
        if (nq.fields.type !== "multi") delete prev.correctIndexes;   // đổi loại: bỏ dữ liệu của loại cũ
        if (nq.fields.type !== "fill") delete prev.accepted;
        list[i] = Object.assign({}, prev, base, { active: q.active !== false }, quiz.cleanQuestionMeta(q, list[i]), per !== undefined ? { period: per } : {});
        editedId = q.id; gradingChanged = sigBefore !== gradingSig(list[i]);
      } else {
        list.push(Object.assign({ id: quiz.genId(), active: true, period: per !== undefined ? per : (await quiz.getSettings()).examPeriod }, base, quiz.cleanQuestionMeta(q)));
      }
      await quiz.saveQuestions(list);
      // Sửa đáp án / nội dung câu đã có: chấm lại ngay các bài đã nộp có câu này để mọi nơi đổi theo
      let regrade = null;
      if (editedId && gradingChanged) {
        try { regrade = await regradeAffected([editedId], u.email); }
        catch (e) { context.log.error("regradeAffected", e && e.message); regrade = { failed: true }; }
      }
      return reply(context, 200, { ok: true, questions: list, regrade });
    }

    if (op === "genQuestions") {
      const r = await require("../_lib/examai").generateDraft(b.topic, b.count, b.category, (await quiz.getQuestions()).map((q) => q.text));
      return reply(context, 200, r);
    }

    if (op === "addQuestions") {
      const incoming = Array.isArray(b.questions) ? b.questions : [];
      const list = await quiz.getQuestions();
      const per = typeof b.period === "string" && quiz.validPeriod(b.period) ? b.period : (await quiz.getSettings()).examPeriod;
      let added = 0, skipped = 0;
      incoming.forEach((q) => {
        const nq = quiz.normalizeQuestionInput(q);
        if (nq.error) { skipped++; return; }
        list.push(Object.assign({ id: quiz.genId(), category: String(q.category || "").trim().slice(0, 100), active: true, period: per }, nq.fields,
          quiz.cleanQuestionMeta(Object.assign({}, q, b.bankId !== undefined && q.bankId === undefined ? { bankId: b.bankId } : {}))));
        added++;
      });
      await quiz.saveQuestions(list);
      return reply(context, 200, { ok: true, questions: list, added, skipped });
    }

    if (op === "deleteQuestion") {
      let list = await quiz.getQuestions();
      list = list.filter((x) => x.id !== b.id);
      await quiz.saveQuestions(list);
      return reply(context, 200, { ok: true, questions: list });
    }

    // Xoá TẤT CẢ câu hỏi: bắt buộc xác nhận bằng cụm chữ + số lượng đang thấy; tự sao lưu trước khi xoá.
    if (op === "deleteAllQuestions") {
      // Theo kỳ: chỉ xoá câu hỏi của kỳ được chọn (period); các kỳ khác giữ nguyên
      const all = await quiz.getQuestions();
      const byP = typeof b.period === "string" && quiz.validPeriod(b.period);
      const list = byP ? all.filter((q) => (q.period || "") === b.period) : all;
      if (b.confirm !== "XOA TAT CA") return reply(context, 400, { ok: false, error: "Chưa xác nhận đúng cụm 'XOA TAT CA'." });
      if (!list.length) return reply(context, 400, { ok: false, error: "Ngân hàng đề " + (byP ? "của kỳ này " : "") + "đang trống." });
      if (b.expected !== list.length) return reply(context, 409, { ok: false, error: "Danh sách câu hỏi vừa thay đổi (" + list.length + " câu). Hãy tải lại trang rồi thử lại." });
      await quiz.backupQuestions(list);
      const kept = byP ? all.filter((q) => (q.period || "") !== b.period) : [];
      await quiz.saveQuestions(kept);
      return reply(context, 200, { ok: true, deleted: list.length, questions: kept, backup: { count: list.length, at: Date.now() } });
    }

    // Sao chép đề từ kỳ này sang kỳ khác (tạo câu mới, bỏ qua câu trùng nội dung đã có ở kỳ đích)
    // Đổi tên một danh mục cho TẤT CẢ câu hỏi của một kỳ đang dùng đúng tên cũ - dùng khi câu hỏi nhập vào
    // có tên danh mục khác với tên "phân bổ riêng" của đề đang cấu hình (gõ sai/khác cách đặt tên).
    if (op === "renameCategory") {
      const per = typeof b.period === "string" ? b.period : "";
      const from = String(b.from || "").trim(), to = String(b.to || "").trim();
      if (!from || !to) return reply(context, 400, { ok: false, error: "Thiếu tên danh mục cũ hoặc mới." });
      if (from === to) return reply(context, 400, { ok: false, error: "Tên mới trùng với tên cũ." });
      const list = await quiz.getQuestions();
      let changed = 0;
      list.forEach((q) => { if ((q.period || "") === per && (q.category || "") === from) { q.category = to; changed++; } });
      if (!changed) return reply(context, 404, { ok: false, error: "Không có câu hỏi nào của kỳ này đang dùng danh mục \"" + from + "\"." });
      await quiz.saveQuestions(list);
      return reply(context, 200, { ok: true, changed, questions: list });
    }

    if (op === "copyQuestions") {
      const from = String(b.from == null ? "" : b.from), to = String(b.to || "");
      if (!quiz.validPeriod(from) || !/^\d{4}-\d{2}$/.test(to) || from === to) return reply(context, 400, { ok: false, error: "Chọn kỳ nguồn và kỳ đích hợp lệ (khác nhau)." });
      const list = await quiz.getQuestions();
      const norm = (t) => String(t || "").trim().toLowerCase().replace(/\s+/g, " ");
      const have = new Set(list.filter((q) => (q.period || "") === to).map((q) => norm(q.text)));
      let added = 0, skipped = 0;
      list.filter((q) => (q.period || "") === from).forEach((q) => {
        if (have.has(norm(q.text))) { skipped++; return; }
        list.push({ id: quiz.genId(), text: q.text, options: (q.options || []).slice(), correctIndex: q.correctIndex, category: q.category || "", active: q.active !== false, period: to, copiedFrom: q.id, type: q.type, correctIndexes: q.correctIndexes, accepted: q.accepted, bankId: q.bankId, difficulty: q.difficulty || "", tags: (q.tags || []).slice(), explanation: q.explanation || "" });
        have.add(norm(q.text)); added++;
      });
      await quiz.saveQuestions(list);
      return reply(context, 200, { ok: true, added, skipped, questions: list });
    }
    // Chuyển toàn bộ câu hỏi của một kỳ (thường là "chưa gắn kỳ") sang kỳ khác
    if (op === "moveQuestions") {
      const from = String(b.from == null ? "" : b.from), to = String(b.to || "");
      if (!quiz.validPeriod(from) || !/^\d{4}-\d{2}$/.test(to) || from === to) return reply(context, 400, { ok: false, error: "Chọn kỳ nguồn và kỳ đích hợp lệ (khác nhau)." });
      const list = await quiz.getQuestions(); let moved = 0;
      list.forEach((q) => { if ((q.period || "") === from) { q.period = to; moved++; } });
      await quiz.saveQuestions(list);
      return reply(context, 200, { ok: true, moved, questions: list });
    }

    // Khôi phục từ bản sao lưu gần nhất: chỉ thêm lại câu chưa có (không ghi đè câu hiện tại).
    if (op === "restoreQuestions") {
      const bk = await quiz.getQuestionsBackup();
      if (!bk || !Array.isArray(bk.questions) || !bk.questions.length) return reply(context, 404, { ok: false, error: "Không có bản sao lưu để khôi phục." });
      const list = await quiz.getQuestions();
      const have = new Set(list.map((q) => q.id));
      let restored = 0;
      bk.questions.forEach((q) => { if (!have.has(q.id)) { list.push(q); restored++; } });
      await quiz.saveQuestions(list);
      return reply(context, 200, { ok: true, restored, questions: list });
    }

    // Chấm lại toàn bộ bài đã nộp của một đề theo ngân hàng câu hỏi HIỆN TẠI (dùng sau khi sửa đáp án đúng bị gắn sai).
    // apply=false: chỉ xem trước (không ghi gì). Bài có câu đã bị xoá khỏi ngân hàng sẽ được bỏ qua để không bị hạ điểm oan.
    if (op === "regrade") {
      const examId = String(b.exam == null ? "" : b.exam);
      const apply = b.apply === true;
      const rows = (await quiz.getIndex()).filter((r) => r.status === "submitted" && (r.period || "") === examId).slice(0, 1000);
      if (!rows.length) return reply(context, 400, { ok: false, error: "Đề này chưa có bài nộp nào để chấm lại." });
      const settings = await quiz.getExamSettings(examId);
      const byId = {}; (await quiz.getQuestions()).forEach((q) => { byId[q.id] = q; });
      const changes = [], patches = {}; let examined = 0, skipped = 0, unchanged = 0;
      for (let i = 0; i < rows.length; i += 20) {
        const atts = await Promise.all(rows.slice(i, i + 20).map((r) => quiz.getAttempt(r.id).catch(() => null)));
        for (const a of atts) {
          if (!a || a.status !== "submitted") { skipped++; continue; }
          if ((a.questionIds || []).some((qid) => !byId[qid])) { skipped++; continue; } // có câu đã xoá: không chấm lại bài này
          examined++;
          const sc = quiz.scoreAttempt(a, byId, settings);
          const same = a.score === sc.correct && a.pct === sc.pct && a.wrong === sc.wrongN && (a.compliancePoints == null ? null : a.compliancePoints) === (sc.compliance == null ? null : sc.compliance);
          if (same) { unchanged++; continue; }
          changes.push({ id: a.id, code: a.code, name: a.name || "", scoreBefore: a.score, scoreAfter: sc.correct, total: sc.total, pctBefore: a.pct, pctAfter: sc.pct,
            complianceBefore: a.compliancePoints == null ? null : a.compliancePoints, complianceAfter: sc.compliance, passedBefore: a.passed == null ? null : a.passed, passedAfter: sc.passed });
          if (apply) {
            (a.regrade = a.regrade || []).push({ at: Date.now(), by: u.email, scoreBefore: a.score, pctBefore: a.pct, complianceBefore: a.compliancePoints == null ? null : a.compliancePoints, passedBefore: a.passed == null ? null : a.passed });
            Object.assign(a, { score: sc.correct, total: sc.total, pct: sc.pct, passed: sc.passed, scoreOutOf10: sc.scoreOutOf10, compliancePoints: sc.compliance, wrong: sc.wrongN, blank: sc.blank, regradedAt: Date.now() });
            a.paper = quiz.buildPaper(a, byId);
            a.advice = require("../_lib/advice").rulesAdvice(require("../_lib/advice").facts(a, settings, null)); // điểm đã đổi nên lời khuyên cũ không còn đúng: dựng lại theo luật
            await quiz.putAttempt(a);
            patches[a.id] = { score: sc.correct, total: sc.total, pct: sc.pct, passed: sc.passed, scoreOutOf10: sc.scoreOutOf10, compliancePoints: sc.compliance, wrong: sc.wrongN, blank: sc.blank, regradedAt: a.regradedAt };
          }
        }
      }
      if (apply && changes.length) await quiz.patchIndex(patches);
      return reply(context, 200, { ok: true, apply, exam: examId, examined, skipped, unchanged, changed: changes.length,
        up: changes.filter((c) => c.pctAfter > c.pctBefore).length, down: changes.filter((c) => c.pctAfter < c.pctBefore).length,
        changes: changes.slice(0, 100), truncated: changes.length > 100 });
    }

    // Ẩn / hiện nhanh một câu hỏi (câu ẩn không được rút vào đề mới; bài đã làm vẫn giữ nguyên)
    if (op === "setQuestionActive") {
      const list = await quiz.getQuestions();
      const q = list.find((x) => x.id === b.id);
      if (!q) return reply(context, 404, { ok: false, error: "Không tìm thấy câu hỏi." });
      q.active = !!b.active;
      await quiz.saveQuestions(list);
      return reply(context, 200, { ok: true, id: q.id, active: q.active });
    }

    // ---------- Ngân hàng câu hỏi ----------
    if (op === "saveBank") {
      const name = String(b.name || "").trim().slice(0, 100);
      if (!name) return reply(context, 400, { ok: false, error: "Nhập tên ngân hàng câu hỏi." });
      const banks = (await quiz.getBanks()).filter((x) => x.id !== quiz.DEFAULT_BANK);
      const description = String(b.description || "").trim().slice(0, 300);
      if (b.id) {
        const i = banks.findIndex((x) => x.id === b.id);
        if (i < 0) return reply(context, 404, { ok: false, error: "Không tìm thấy ngân hàng." });
        banks[i] = Object.assign({}, banks[i], { name, description });
      } else {
        let id = quiz.slugify(name), n = 2;
        while (id === quiz.DEFAULT_BANK || banks.some((x) => x.id === id)) id = quiz.slugify(name) + "-" + n++;
        banks.push({ id, name, description, createdAt: Date.now() });
      }
      await quiz.saveBanks(banks);
      return reply(context, 200, { ok: true, banks: await quiz.getBanks() });
    }
    if (op === "deleteBank") {
      const id = String(b.id || "");
      if (!id || id === quiz.DEFAULT_BANK) return reply(context, 400, { ok: false, error: "Không thể xoá ngân hàng chung." });
      const qs = await quiz.getQuestions();
      const used = qs.filter((q) => quiz.bankOf(q) === id).length;
      if (used && b.moveTo !== quiz.DEFAULT_BANK) return reply(context, 409, { ok: false, error: "Ngân hàng còn " + used + " câu hỏi. Chọn chuyển các câu về Ngân hàng chung rồi xoá.", used });
      qs.forEach((q) => { if (quiz.bankOf(q) === id) q.bankId = quiz.DEFAULT_BANK; });
      if (used) await quiz.saveQuestions(qs);
      await quiz.saveBanks((await quiz.getBanks()).filter((x) => x.id !== id));
      return reply(context, 200, { ok: true, moved: used, banks: await quiz.getBanks() });
    }
    // Chuyển nhiều câu hỏi sang một ngân hàng khác
    if (op === "moveToBank") {
      const to = String(b.to || ""), ids = new Set(Array.isArray(b.ids) ? b.ids : []);
      const banks = await quiz.getBanks();
      if (!banks.some((x) => x.id === to)) return reply(context, 400, { ok: false, error: "Ngân hàng đích không tồn tại." });
      const qs = await quiz.getQuestions(); let moved = 0;
      qs.forEach((q) => { if (ids.has(q.id)) { q.bankId = to; moved++; } });
      await quiz.saveQuestions(qs);
      return reply(context, 200, { ok: true, moved, questions: qs });
    }

    // Tài khoản quản lí (chỉ xem kết quả + chỉnh thông tin nhân viên của mình, không xoá được gì)
    if (op === "saveViewer") {
      const email = quiz.normEmail(b.email);
      if (!validEmail(email)) return reply(context, 400, { ok: false, error: "Email quản lí không hợp lệ." });
      if (!emailAllowed(email)) return reply(context, 400, { ok: false, error: "Email này chưa được phép dùng ứng dụng (kiểm tra ALLOWED_EMAILS / tên miền cho phép), quản lí sẽ không đăng nhập được." });
      const raw = Array.isArray(b.scopes) ? b.scopes : String(b.scopes || "").split(/[;\n]/);
      const seen = new Set(); const scopes = [];
      raw.forEach((x) => { const t = String(x || "").trim().slice(0, 100); const k = quiz.normPerson(t); if (t && !seen.has(k)) { seen.add(k); scopes.push(t); } });
      if (!scopes.length) return reply(context, 400, { ok: false, error: "Nhập ít nhất một tên quản lí (đúng như cột 'Quản lí' trong danh sách thí sinh)." });
      const list = await quiz.getViewers();
      const name = String(b.name || "").trim().slice(0, 100);
      const k = list.findIndex((v) => quiz.normEmail(v.email) === email);
      const entry = { email, name, scopes, addedAt: k >= 0 ? list[k].addedAt : Date.now(), addedBy: k >= 0 ? list[k].addedBy : u.email };
      if (k >= 0) list[k] = entry; else list.push(entry);
      await quiz.saveViewers(list);
      const cands = await quiz.getCandidates();
      // Cấp quyền lần đầu: tạo tài khoản (nếu chưa có) và gửi email kèm liên kết cho quản lí
      let invite = null;
      if (k < 0) { try { invite = await inviteManager(email, name); } catch (e) { invite = { mailed: false, reason: "Không tạo/gửi được lời mời: " + String((e && e.message) || e).slice(0, 120) }; } }
      return reply(context, 200, { ok: true, viewer: Object.assign({}, entry, { employees: cands.filter((c) => quiz.inScope(entry, c)).length }), created: k < 0, invite });
    }

    // Gửi lại email kèm liên kết đặt mật khẩu cho một quản lí đã được cấp quyền
    if (op === "sendViewerInvite") {
      const email = quiz.normEmail(b.email);
      const v = (await quiz.getViewers()).find((x) => quiz.normEmail(x.email) === email);
      if (!v) return reply(context, 404, { ok: false, error: "Email này chưa được cấp quyền quản lí." });
      const invite = await inviteManager(email, v.name, { forceLink: true });
      return reply(context, 200, { ok: !!invite.mailed, error: invite.mailed ? undefined : invite.reason, invite });
    }

    // Tạo/đặt lại mật khẩu đăng nhập cho quản lí: quản lí không cần tự đăng ký (qua OTP) nữa,
    // quản trị viên đưa thẳng mật khẩu (hoặc để trống cho hệ thống tự sinh 1 lần, hiện ra để gửi cho họ).
    if (op === "setViewerPassword") {
      const email = quiz.normEmail(b.email);
      if (!validEmail(email)) return reply(context, 400, { ok: false, error: "Email không hợp lệ." });
      if (!emailAllowed(email)) return reply(context, 400, { ok: false, error: "Email này chưa được phép dùng ứng dụng (kiểm tra ALLOWED_EMAILS / tên miền cho phép)." });
      let pw = String(b.password || "");
      if (pw && (pw.length < 8 || pw.length > 200)) return reply(context, 400, { ok: false, error: "Mật khẩu cần từ 8 đến 200 ký tự (hoặc để trống để hệ thống tự tạo)." });
      const uid = uidOf(email), ukey = "user/" + uid + ".json";
      let ud = await store.get(ukey), created = false, tempPassword = "";
      if (!pw) {
        const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
        pw = Array.from(crypto.randomBytes(10)).map((x) => chars[x % chars.length]).join("");
        tempPassword = pw;
      }
      if (!ud) {
        ud = { v: 1, uid, email, name: String(b.name || "").trim().slice(0, 80), rev: 0, state: null, digest: null, prefs: {}, sent: {}, pwd: pwdlib.hash(pw), verified: true };
        await store.put(ukey, ud); created = true;
      } else {
        ud.pwd = pwdlib.hash(pw); ud.verified = true; ud.failTimes = []; ud.otp = ""; ud.otpExp = 0; ud.sessAfter = Date.now();
        if (b.name) ud.name = String(b.name).trim().slice(0, 80);
        await store.put(ukey, ud);
      }
      return reply(context, 200, { ok: true, created, tempPassword });
    }

    if (op === "deleteViewer") {
      const email = quiz.normEmail(b.email);
      const list = (await quiz.getViewers()).filter((v) => quiz.normEmail(v.email) !== email);
      await quiz.saveViewers(list);
      return reply(context, 200, { ok: true });
    }

    if (op === "addCandidates") {
      let rows = Array.isArray(b.rows) ? b.rows : [];
      if (!rows.length && b.text) {
        rows = String(b.text).split("\n").map((line) => {
          const parts = line.split(",").map((s) => s.trim());
          return { code: parts[0] || "", name: parts[1] || "", email: parts[2] || "", manager: parts[3] || "", segment: parts[4] || "" };
        }).filter((r) => r.code && r.email);
      }
      const list = await quiz.getCandidates();
      const byCode = {};
      list.forEach((c, i) => { byCode[quiz.normCode(c.code)] = i; });
      let added = 0, updated = 0;
      rows.forEach((r) => {
        const code = quiz.normCode(r.code);
        const email = quiz.normEmail(r.email);
        if (!code || !email) return;
        const seg = quiz.normSegment(r.segment);
        const entry = { code: String(r.code).trim().slice(0, 50), name: String(r.name || "").trim().slice(0, 100), email, manager: String(r.manager || "").trim().slice(0, 100), segment: seg };
        if (byCode[code] != null) {
          const old = list[byCode[code]];
          const merged = Object.assign({}, old, entry);
          const same = quiz.normEmail(old.email) === entry.email && String(old.name || "") === entry.name && quiz.normSegment(old.segment) === entry.segment && quiz.normPerson(old.manager) === quiz.normPerson(entry.manager);
          if (!same) {
            delete merged.confirmed; // thông tin đổi => cần xác nhận lại
            merged.audit = (old.audit || []).concat([{ at: Date.now(), kind: "edit", by: u.email, byName: "Quản trị viên", changes: { admin: { from: "", to: "cập nhật qua danh sách" } } }]).slice(-30);
          }
          list[byCode[code]] = merged; updated++;
        }
        else { list.push(entry); byCode[code] = list.length - 1; added++; }
      });
      await quiz.saveCandidates(list);
      return reply(context, 200, { ok: true, candidates: list, added, updated });
    }

    if (op === "assignPeriod") {
      // Gắn kỳ cho các bài đã nộp nhưng chưa có kỳ (nộp trước khi có tính năng kỳ). Sau khi gắn,
      // thí sinh không làm lại được trong kỳ đó (trừ khi quản trị viên bấm "Làm lại").
      const period = String(b.period || "").trim();
      if (!/^\d{4}-\d{2}$/.test(period)) return reply(context, 400, { ok: false, error: "Kỳ phải theo định dạng năm-tháng, ví dụ 2026-10." });
      const idx = await quiz.getIndex();
      const ids = idx.filter((r) => r.status === "submitted" && !r.period).map((r) => r.id);
      for (const id of ids) { const a = await quiz.getAttempt(id); if (a && !a.period) { a.period = period; await quiz.putAttempt(a); } }
      const fresh = await quiz.getIndex(); let n = 0;
      fresh.forEach((r) => { if (ids.indexOf(r.id) >= 0 && !r.period) { r.period = period; n++; } });
      await quiz.saveIndex(fresh);
      return reply(context, 200, { ok: true, assigned: n, period });
    }

    if (op === "resetAttempt") {
      // Làm lại theo kỳ: chỉ xoá kết quả của kỳ được chọn (period = "" là bài chưa gắn kỳ).
      const removed = await quiz.resetByCode(b.code, typeof b.period === "string" ? b.period : undefined);
      return reply(context, 200, { ok: true, removed });
    }

    // Đổi mã nhân viên: mã là khoá nối thí sinh với kết quả, nên chuyển theo cả bài đã nộp, bảng chỉ số và bài đang làm dở.
    // Thứ tự: bài làm -> bảng chỉ số -> con trỏ bài dở -> hồ sơ thí sinh (bước CUỐI mới là lúc "chốt"). Gián đoạn giữa chừng
    // thì bấm đổi lại đúng mã cũ -> mã mới là chạy tiếp được (từng bước đều đặt lại về cùng một giá trị).
    if (op === "renameCandidate") {
      const oldN = quiz.normCode(b.from), rawNew = String(b.to == null ? "" : b.to).trim(), newN = quiz.normCode(rawNew);
      if (!oldN) return reply(context, 400, { ok: false, error: "Thiếu mã nhân viên cần đổi." });
      if (!/^[A-Za-z0-9._-]{1,50}$/.test(rawNew)) return reply(context, 400, { ok: false, error: "Mã mới chỉ gồm chữ, số và các dấu . _ - (tối đa 50 ký tự), không có khoảng trắng." });
      const list = await quiz.getCandidates();
      const i = list.findIndex((c) => quiz.normCode(c.code) === oldN);
      if (i < 0) return reply(context, 404, { ok: false, error: "Không tìm thấy thí sinh có mã này." });
      const cur = list[i], sameRecord = oldN === newN;
      if (String(cur.code) === rawNew) return reply(context, 400, { ok: false, error: "Mã mới trùng với mã hiện tại." });
      if (!sameRecord && list.some((c, k) => k !== i && quiz.normCode(c.code) === newN)) return reply(context, 409, { ok: false, error: "Mã " + rawNew + " đã có thí sinh khác dùng." });
      const idx = await quiz.getIndex();
      const oldRows = idx.filter((r) => quiz.normCode(r.code) === oldN);
      const act = await quiz.getActive(cur.code);                       // bài đang làm dở của mã cũ (nếu có)
      let leftover = 0;
      if (!sameRecord) {
        leftover = idx.filter((r) => quiz.normCode(r.code) === newN).length;
        const actNew = await quiz.getActive(rawNew);
        if (act && actNew) return reply(context, 409, { ok: false, error: "Cả hai mã đều đang có bài làm dở, hãy huỷ bớt một bài rồi đổi lại." });
        if ((leftover || actNew) && b.merge !== true) return reply(context, 409, { ok: false, needMerge: true, leftover, error: "Mã " + rawNew + " hiện chưa có thí sinh nhưng còn " + (leftover + (actNew ? 1 : 0)) + " bài kiểm tra cũ gắn với mã này (có thể của một thí sinh đã bị xoá)." });
      }
      const ids = new Set(oldRows.map((r) => r.id)); if (act) ids.add(act.id);
      let moved = 0;
      for (const id of ids) {
        const a = await quiz.getAttempt(id).catch(() => null);
        if (!a) continue;
        const ac = quiz.normCode(a.code);
        if (ac !== oldN && ac !== newN) continue;                         // an toàn: không đụng bài của người khác
        if (a.code !== rawNew) { a.code = rawNew; await quiz.putAttempt(a); }
        moved++;
      }
      const patches = {}; oldRows.forEach((r) => { patches[r.id] = { code: rawNew }; });
      if (oldRows.length) await quiz.patchIndex(patches);
      if (!sameRecord && act) await quiz.moveActive(cur.code, rawNew);
      // Ngày vào làm / thử việc tra theo mã băm của MÃ CŨ trong file dữ liệu cố định -> ghi riêng lên hồ sơ để không mất
      const jd = require("../_lib/probation").joinDateOf(cur.code, cur.joinDate);
      list[i] = Object.assign({}, cur, { code: rawNew }, jd ? { joinDate: jd } : {}, {
        audit: (cur.audit || []).concat([{ at: Date.now(), kind: "edit", by: u.email, byName: "Quản trị viên", changes: { code: { from: String(cur.code), to: rawNew } } }]).slice(-30)
      });
      await quiz.saveCandidates(list);
      return reply(context, 200, { ok: true, from: String(cur.code), to: rawNew, moved, candidates: list.map((c) => { const o = Object.assign({}, c); delete o.audit; return o; }) });
    }

    if (op === "deleteCandidate") {
      let list = await quiz.getCandidates();
      list = list.filter((c) => quiz.normCode(c.code) !== quiz.normCode(b.code));
      await quiz.saveCandidates(list);
      return reply(context, 200, { ok: true, candidates: list });
    }

    if (op === "saveSettings") {
      const cur = await quiz.getSettings();
      const verr = quiz.validateCounts({ questionCount: b.questionCount, bothGiaDungCount: b.bothGiaDungCount }, quiz.targetCount(cur));
      if (verr) return reply(context, 400, { ok: false, error: verr });
      const sp = b.segmentPlans === undefined ? (cur.segmentPlans || {}) : quiz.cleanSegmentPlans(b.segmentPlans);
      if (sp.error) return reply(context, 400, { ok: false, error: sp.error });
      const next = Object.assign({}, cur, {
        examTitle: String(b.examTitle || cur.examTitle || "").slice(0, 200),
        shareTitle: String(b.shareTitle == null ? cur.shareTitle || "" : b.shareTitle).trim().slice(0, 80),
        questionCount: Math.min(quiz.MAX_QUESTION_COUNT, Math.max(1, parseInt(b.questionCount, 10) || quiz.targetCount(cur))),
        bothGiaDungCount: Math.max(0, parseInt(b.bothGiaDungCount, 10) || 0),
        secondsPerQuestion: Math.max(10, parseInt(b.secondsPerQuestion, 10) || cur.secondsPerQuestion),
        passEnabled: !!b.passEnabled,
        passScore: Math.min(100, Math.max(0, parseInt(b.passScore, 10) || 0)),
        allowRetake: !!b.allowRetake,
        complianceEnabled: !!b.complianceEnabled,
        complianceHighMin: Math.min(10, Math.max(0, parseFloat(b.complianceHighMin) || 0)),
        complianceMidMin: Math.min(10, Math.max(0, parseFloat(b.complianceMidMin) || 0)),
        complianceLowMin: Math.min(10, Math.max(0, parseFloat(b.complianceLowMin) || 0)),
        examPeriod: quiz.validPeriod(String(b.examPeriod || "").trim()) && String(b.examPeriod || "").trim() ? String(b.examPeriod).trim() : cur.examPeriod,
        segmentPlans: sp
      });
      await quiz.saveSettings(next);
      return reply(context, 200, { ok: true, settings: next });
    }

    // ---------- Nhiều đề thi độc lập ----------
    if (op === "saveExam") {
      const r = await quiz.upsertExam(b.exam || b);
      if (!r.ok) return reply(context, 400, r);
      return reply(context, 200, { ok: true, exam: r.exam, exams: await quiz.listExamsSummary() });
    }

    if (op === "deleteExam") {
      const id = String(b.id || "");
      if (!id) return reply(context, 400, { ok: false, error: "Thiếu mã đề thi." });
      if (id === (await quiz.getSettings()).examPeriod) return reply(context, 400, { ok: false, error: "Không thể xoá đề đang đặt làm mặc định. Hãy đặt đề khác làm mặc định trước." });
      await quiz.deleteExam(id);
      return reply(context, 200, { ok: true, exams: await quiz.listExamsSummary() });
    }

    if (op === "setDefaultExam") {
      const id = String(b.id || "").trim();
      if (!quiz.validPeriod(id) || !id) return reply(context, 400, { ok: false, error: "Mã đề thi không hợp lệ." });
      const cur = await quiz.getSettings();
      await quiz.saveSettings(Object.assign({}, cur, { examPeriod: id }));
      return reply(context, 200, { ok: true, examPeriod: id });
    }

    return reply(context, 400, { ok: false, error: "Thao tác không hợp lệ." });
  } catch (e) {
    context.log.error("kt-admin", e && e.message);
    return reply(context, 500, { ok: false, error: "Có lỗi xảy ra." });
  }
};

// Mọi thao tác qua API này đều được ghi vào nhật ký (xem _lib/auditlog.js)
module.exports = require("../_lib/auditlog").wrap(handler, "admin");
