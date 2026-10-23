// Tài khoản QUẢN LÍ (do quản trị viên cấp): xem nhân viên thuộc phạm vi của mình và kết quả của họ,
// thêm nhân viên mới, sửa / xoá / xác nhận thông tin nhân viên thuộc phạm vi của mình.
// Không xoá được KẾT QUẢ bài làm (chỉ quản trị viên mới reset được bài làm, qua kt-admin).
const { reply, guardConfigured, requireAjax, requireUserActive } = require("../_lib/http");
const { validEmail, isAdmin } = require("../_lib/config");
const quiz = require("../_lib/quiz");
const { modelName, prettyLabel } = require("../_lib/devicename");
const behavior = require("../_lib/behavior");

const SEGMENT_INPUTS = ["both", "ca_hai", "gia_dung", "may_loc"]; // giá trị được chấp nhận; lưu dạng chuẩn: both | gia_dung | may_loc
const AUDIT_MAX = 30;

const empView = (c) => ({
  code: c.code, name: c.name || "", email: c.email || "", manager: c.manager || "", segment: quiz.normSegment(c.segment),
  confirmed: c.confirmed ? { by: c.confirmed.by, byName: c.confirmed.byName || c.confirmed.by, at: c.confirmed.at } : null
});

// admin = true: kèm thiết bị và vị trí (chỉ quản trị viên được xem, quản lí thường không nhận dữ liệu này)
function summaryOf(r, settings, admin) {
  return {
    id: r.id, period: r.period || "",
    score: r.score, total: r.total, pct: r.pct, compliancePoints: r.compliancePoints, passed: quiz.passState(r.pct, settings), practice: !!r.practice,
    submittedAt: r.submittedAt, startedAt: r.startedAt, durationSec: r.durationSec, wrong: r.wrong, blank: r.blank,
    proof: quiz.proofCode(r.id), verify: quiz.verifyToken(r.id), flags: r.flags || null, mailOk: r.mailOk, device: admin ? (r.device ? Object.assign({}, r.device, { label: prettyLabel(r.device.label) }) : null) : undefined
  };
}

const handler = async function (context, req) {
  try {
    if (guardConfigured(context)) return;
    const u = await requireUserActive(context, req);
    if (!u) return;
    // Quản trị viên (ADMIN_EMAILS) luôn được vào, xem/thao tác được với MỌI quản lí và MỌI nhân viên,
    // không cần (và không bị giới hạn bởi) quyền quản lí riêng như các viewer thường, kể cả khi email
    // đó cũng có mặt trong danh sách viewer với phạm vi hẹp hơn - admin luôn ưu tiên toàn quyền.
    let viewer;
    if (isAdmin(u.email)) {
      const own = await quiz.findViewer(u.email);
      viewer = { email: u.email, name: (own && own.name) || u.name || "Quản trị viên", scopes: [], isAdmin: true };
    } else {
      viewer = await quiz.findViewer(u.email);
    }
    if (!viewer) return reply(context, 403, { ok: false, error: "Tài khoản này chưa được cấp quyền quản lí. Hãy liên hệ quản trị viên." });
    const mine = (await quiz.getCandidates()).filter((c) => quiz.inScope(viewer, c));

    if (req.method === "GET") {
      const op = (req.query && req.query.op) || "";
      if (op === "me") return reply(context, 200, { ok: true, viewer: { email: viewer.email, name: viewer.name || "", scopes: viewer.scopes || [], isAdmin: !!viewer.isAdmin }, serverNow: Date.now() });
      if (op === "employees") {
        const settings = await quiz.getSettings();
        const idx = await quiz.getIndex();
        // Theo kỳ: mặc định kỳ hiện tại; "" = bài nộp trước khi có kỳ (chưa gắn kỳ)
        const qp = req.query && typeof req.query.period === "string" ? req.query.period : null;
        const period = qp !== null && quiz.validPeriod(qp) ? qp : settings.examPeriod; // nhận cả mã đề tự đặt
        const inMine = {}; mine.forEach((x) => { inMine[quiz.normCode(x.code)] = 1; });
        const subs = idx.filter((a) => a.status === "submitted" && inMine[quiz.normCode(a.code)]);
        // Danh sách mã đề để chọn: mọi đề đã đăng kí (kể cả đề chưa ai nộp bài / đề tự đặt như "thi-thu") dành cho nhóm của mình,
        // cộng các kỳ đã có bài nộp và kỳ hiện tại. Trước đây chỉ liệt kê kỳ đã có bài nộp nên không chọn được đề khác.
        const exams = await quiz.listExamsSummary();
        const examFor = (e) => !Array.isArray(e.codes) || !e.codes.length || e.codes.some((c) => inMine[quiz.normCode(c)]);
        const examTitles = {}; exams.forEach((e) => { if (e.title && String(e.title).trim() !== e.id) examTitles[e.id] = String(e.title).trim(); });
        const periods = Array.from(new Set(subs.map((a) => a.period || "").concat([settings.examPeriod], exams.filter(examFor).map((e) => e.id)))).sort().reverse();
        const latest = {};
        subs.filter((a) => (a.period || "") === period).forEach((a) => {
          const k = quiz.normCode(a.code);
          if (!latest[k] || (a.submittedAt || 0) > (latest[k].submittedAt || 0)) latest[k] = a;
        });
        const list = await Promise.all(mine.map(async (c) => {
          const r = latest[quiz.normCode(c.code)];
          let status = "none", active = null;
          if (r) status = "done";
          else if (period === settings.examPeriod) { active = await quiz.getActive(c.code); if (active && (active.period || "") === period) { const t = Object.assign({}, active); quiz.syncAttempt(t, Date.now()); if (t.cursor < t.questionIds.length) status = "doing"; } }
          return Object.assign(empView(c), { status, result: r ? summaryOf(r, settings, !!viewer.isAdmin) : null });
        }));
        return reply(context, 200, { ok: true, employees: list, period, periods, examTitles, currentPeriod: settings.examPeriod, serverNow: Date.now() });
      }
      // Chẩn đoán hành vi học tập của MỘT nhân viên trong phạm vi của quản lí (bằng chứng + nguyên nhân giả thuyết + việc nên làm).
      // Thiết bị / vị trí chỉ đưa vào phân tích khi người xem là quản trị viên (giống các màn hình khác).
      if (op === "insight") {
        const c = mine.find((x) => quiz.normCode(x.code) === quiz.normCode(req.query.code));
        if (!c) return reply(context, 404, { ok: false, error: "Không tìm thấy nhân viên trong phạm vi của bạn." });
        const r = await behavior.forEmployee(c.code, { admin: !!viewer.isAdmin, ai: req.query.ai !== "0" });
        if (!r) return reply(context, 404, { ok: false, error: "Nhân viên chưa có bài đã nộp để phân tích." });
        return reply(context, 200, Object.assign({ ok: true, employee: { code: c.code, name: c.name || "" } }, r));
      }
      // Chẩn đoán cả nhóm (những nhân viên thuộc phạm vi của quản lí) cho một đề / kỳ.
      if (op === "teamInsight") {
        const st = await quiz.getSettings();
        const qp = req.query && typeof req.query.period === "string" ? req.query.period : "";
        const period = qp && quiz.validPeriod(qp) ? qp : st.examPeriod;
        const exSt = await quiz.getExamSettings(period);
        const r = await behavior.forCohort(period, mine.filter((c) => quiz.inAudience(exSt, c)), { ai: req.query.ai !== "0" });
        return reply(context, 200, Object.assign({ ok: true }, r));
      }
      if (op === "paper") {
        // Xem lại bản sao bài làm của nhân viên trong phạm vi của mình (chỉ đọc)
        const c = mine.find((x) => quiz.normCode(x.code) === quiz.normCode(req.query.code));
        if (!c) return reply(context, 404, { ok: false, error: "Không tìm thấy nhân viên trong phạm vi của bạn." });
        const settings = await quiz.getSettings();
        const mineAll = (await quiz.getIndex()).filter((a) => a.status === "submitted" && quiz.normCode(a.code) === quiz.normCode(c.code))
          .sort((a, b) => (b.submittedAt || 0) - (a.submittedAt || 0));
        const wantId = String((req.query && req.query.id) || "");
        const entry = wantId ? mineAll.find((a) => a.id === wantId) : mineAll[0];
        const attempt = entry && (await quiz.getAttempt(entry.id));
        if (!attempt || attempt.status !== "submitted") return reply(context, 404, { ok: false, error: "Nhân viên này chưa có bài làm đã nộp." });
        let paper = attempt.paper, source = "snapshot", partial = false;
        if (!Array.isArray(paper)) { // bài nộp trước khi có bản sao: dựng lại từ ngân hàng đề nếu còn
          const byId = {}; (await quiz.getQuestions()).forEach((q) => { byId[q.id] = q; });
          paper = quiz.buildPaper(attempt, byId); source = "rebuilt";
          partial = paper.length < (attempt.questionIds || []).length;
        }
        if (!paper.length) return reply(context, 404, { ok: false, error: "Không còn bản sao bài làm này (câu hỏi đã bị xoá khỏi ngân hàng đề trước khi bài được lưu bản sao)." });
        let timing = null; try { timing = require("../_lib/timestats").attemptSummary(attempt); } catch (e) { timing = null; }
        return reply(context, 200, { ok: true, employee: { code: c.code, name: c.name || "" }, summary: summaryOf(entry, settings, !!viewer.isAdmin), paper, source, partial, timing, photo: typeof attempt.photo === "string" && attempt.photo.startsWith("data:image/") ? attempt.photo : "", serverNow: Date.now() });
      }
      if (op === "profile") {
        // Hồ sơ kiểm tra của MỘT nhân viên trong phạm vi: điểm từng kỳ (so với trung bình đội & thứ hạng),
        // kết quả theo mảng kiến thức, câu sai lặp lại. Không kèm thiết bị/vị trí.
        const c = mine.find((x) => quiz.normCode(x.code) === quiz.normCode(req.query.code));
        if (!c) return reply(context, 404, { ok: false, error: "Không tìm thấy nhân viên trong phạm vi của bạn." });
        const settings = await quiz.getSettings();
        const idx = (await quiz.getIndex()).filter((a) => a.status === "submitted");
        const inMine = {}; mine.forEach((x) => { inMine[quiz.normCode(x.code)] = 1; });
        // Bài nộp gần nhất của mỗi người trong phạm vi, theo từng kỳ -> trung bình đội & thứ hạng
        const team = {};
        idx.forEach((a) => { const k = quiz.normCode(a.code); if (!inMine[k]) return; const p = a.period || "";
          const t = (team[p] = team[p] || {}); if (!t[k] || (a.submittedAt || 0) > (t[k].submittedAt || 0)) t[k] = a; });
        const mineList = idx.filter((a) => quiz.normCode(a.code) === quiz.normCode(c.code)).sort((a, b) => (a.submittedAt || 0) - (b.submittedAt || 0));
        const lo = settings.complianceLowMin * 10;
        const history = mineList.map((a) => {
          const t = Object.values(team[a.period || ""] || {}); const ps = t.map((x) => x.pct || 0);
          const latestInPeriod = (team[a.period || ""] || {})[quiz.normCode(c.code)];
          return { id: a.id, period: a.period || "", score: a.score, total: a.total, pct: a.pct, passed: quiz.passState(a.pct, settings), practice: !!a.practice, compliancePoints: a.compliancePoints,
            submittedAt: a.submittedAt, durationSec: a.durationSec, flags: a.flags || null, proof: quiz.proofCode(a.id), wrong: a.wrong, blank: a.blank,
            latest: !!latestInPeriod && latestInPeriod.id === a.id,
            teamAvg: ps.length ? Math.round(ps.reduce((x, y) => x + y, 0) / ps.length * 10) / 10 : null, teamSize: ps.length,
            rank: ps.length ? 1 + ps.filter((v) => v > (a.pct || 0)).length : null, weak: (a.pct || 0) < lo };
        });
        // Mảng kiến thức + câu sai lặp lại: đọc bản sao bài làm (tối đa 12 bài gần nhất)
        const cats = {}, wq = {};
        const recent = mineList.slice(-12);
        const atts = await Promise.all(recent.map((a) => quiz.getAttempt(a.id).catch(() => null)));
        const lastId = mineList.length ? mineList[mineList.length - 1].id : "";
        let lastWrong = [];
        atts.forEach((at, i) => {
          if (!at || !Array.isArray(at.paper)) return; const p = recent[i].period || "";
          at.paper.forEach((q) => {
            const cat = q.category || "Khác"; const x = (cats[cat] = cats[cat] || { category: cat, n: 0, ok: 0, last: { n: 0, ok: 0 } });
            x.n++; if (q.ok) x.ok++; if (recent[i].id === lastId) { x.last.n++; if (q.ok) x.last.ok++; }
            if (!q.ok) { const w = (wq[q.text] = wq[q.text] || { text: q.text, category: cat, answer: q.answerText || (q.options || [])[q.correct] || "", times: 0, periods: [] });
              w.times++; if (w.periods.indexOf(p) < 0) w.periods.push(p);
              if (recent[i].id === lastId) lastWrong.push({ text: q.text, category: cat, answer: q.answerText || (q.options || [])[q.correct] || "", chosen: q.chosen >= 0 ? (q.chosenText != null ? q.chosenText : (q.options || [])[q.chosen] || "") : null }); }
          });
        });
        const categories = Object.values(cats).map((x) => ({ category: x.category, n: x.n, pct: x.n ? Math.round(x.ok / x.n * 100) : null, lastN: x.last.n, lastPct: x.last.n ? Math.round(x.last.ok / x.last.n * 100) : null })).sort((a, b) => (a.pct || 0) - (b.pct || 0));
        const repeatWrong = Object.values(wq).filter((w) => w.times >= 2).sort((a, b) => b.times - a.times).slice(0, 10);
        let status = "none";
        const act = await quiz.getActive(c.code);
        if (act) { const t = Object.assign({}, act); quiz.syncAttempt(t, Date.now()); if (t.cursor < t.questionIds.length) status = "doing"; }
        return reply(context, 200, { ok: true, employee: empView(c), currentPeriod: settings.examPeriod, status, passEnabled: !!settings.passEnabled,
          complianceLowMin: settings.complianceLowMin, history, categories, repeatWrong, lastWrong: lastWrong.slice(0, 15), papersRead: atts.filter(Boolean).length });
      }
      if (op === "photo") {
        // Ảnh xác nhận khuôn mặt chụp ngay trước khi bắt đầu làm bài - minh chứng cho ĐÚNG MỘT kỳ, không dùng chéo sang kỳ khác.
        // Chọn theo: id (một bài cụ thể) > period (bài nộp gần nhất của kỳ, nếu chưa nộp thì bài đang làm của kỳ đó).
        const c = mine.find((x) => quiz.normCode(x.code) === quiz.normCode(req.query.code));
        if (!c) return reply(context, 404, { ok: false, error: "Không tìm thấy nhân viên trong phạm vi của bạn." });
        const st0 = await quiz.getSettings();
        const wantId = String((req.query && req.query.id) || "");
        const wantP = req.query && typeof req.query.period === "string" ? req.query.period : st0.examPeriod;
        const subsC = (await quiz.getIndex()).filter((a) => a.status === "submitted" && quiz.normCode(a.code) === quiz.normCode(c.code))
          .sort((a, b) => (b.submittedAt || 0) - (a.submittedAt || 0));
        const entry = wantId ? subsC.find((a) => a.id === wantId) : subsC.find((a) => (a.period || "") === wantP);
        if (wantId && !entry) return reply(context, 404, { ok: false, error: "Không tìm thấy bài làm này." });
        let attempt = entry && (await quiz.getAttempt(entry.id));
        if (!attempt && !wantId) { const act = await quiz.getActive(c.code); if (act && (act.period || "") === wantP) attempt = act; }
        const photo = attempt && typeof attempt.photo === "string" && attempt.photo.startsWith("data:image/") ? attempt.photo : "";
        const devices = !viewer.isAdmin ? [] : attempt ? (Array.isArray(attempt.devices) ? attempt.devices : (attempt.device ? [attempt.device] : [])) : [];
        return reply(context, 200, { ok: true, photo, takenAt: (attempt && attempt.startedAt) || null, face: attempt && attempt.faceCheck ? attempt.faceCheck.status : null, period: attempt ? (attempt.period || "") : wantP, inProgress: !!(attempt && attempt.status === "in_progress"),
          devices: !viewer.isAdmin ? undefined : devices.map((d) => ({ type: d.type, os: d.os, browser: d.browser, model: modelName(d.model, d.screen) || d.model, ip: d.ip, screen: d.screen, tz: d.tz, lang: d.lang, stage: d.stage, at: d.at, ua: d.ua, loc: d.loc || null, locErr: d.locErr || "" })) });
      }
      if (op === "employee") {
        const c = mine.find((x) => quiz.normCode(x.code) === quiz.normCode(req.query.code));
        if (!c) return reply(context, 404, { ok: false, error: "Không tìm thấy nhân viên trong phạm vi của bạn." });
        return reply(context, 200, { ok: true, employee: empView(c), history: (c.audit || []).slice().reverse().slice(0, 20) });
      }
      return reply(context, 400, { ok: false, error: "Thiếu tham số op." });
    }

    if (!requireAjax(context, req)) return;
    const b = req.body || {};
    const op = b.op || "";
    const all = await quiz.getCandidates();
    const i = all.findIndex((x) => quiz.normCode(x.code) === quiz.normCode(b.code));
    // Chỉ thao tác được trên nhân viên thuộc phạm vi của mình
    if (["updateEmployee", "confirmEmployee", "deleteEmployee"].indexOf(op) >= 0 && (i < 0 || !quiz.inScope(viewer, all[i]))) {
      return reply(context, 404, { ok: false, error: "Không tìm thấy nhân viên trong phạm vi của bạn." });
    }
    const who = { by: viewer.email, byName: viewer.name || viewer.email };

    // Thêm nhân viên mới vào phạm vi của mình. Quản trị viên (scopes rỗng) phải tự nêu rõ quản lí phụ trách qua b.scope.
    if (op === "addEmployee") {
      const myScopes = viewer.scopes || [];
      let scope = String(b.scope || "").trim();
      if (!scope && myScopes.length === 1) scope = myScopes[0];
      if (!viewer.isAdmin && myScopes.indexOf(scope) < 0) return reply(context, 400, { ok: false, field: "scope", error: "Chọn đúng một tên quản lí thuộc phạm vi của bạn." });
      if (!scope) return reply(context, 400, { ok: false, field: "scope", error: "Cần chọn quản lí phụ trách cho nhân viên này." });
      const code = String(b.code || "").trim().slice(0, 50);
      const name = String(b.name || "").trim().slice(0, 100);
      const email = quiz.normEmail(b.email);
      const segIn = String(b.segment || "both").trim().toLowerCase();
      if (!code) return reply(context, 400, { ok: false, field: "code", error: "Nhập mã nhân viên." });
      if (!name) return reply(context, 400, { ok: false, field: "name", error: "Nhập họ tên." });
      if (!validEmail(email)) return reply(context, 400, { ok: false, field: "email", error: "Email không hợp lệ." });
      if (SEGMENT_INPUTS.indexOf(segIn) < 0) return reply(context, 400, { ok: false, field: "segment", error: "Nhóm ngành không hợp lệ." });
      if (all.some((x) => quiz.normCode(x.code) === quiz.normCode(code))) return reply(context, 409, { ok: false, field: "code", error: "Mã nhân viên này đã có trong hệ thống." });
      if (all.some((x) => quiz.normEmail(x.email) === email)) return reply(context, 409, { ok: false, field: "email", error: "Email này đã được dùng cho nhân viên khác." });
      const entry = {
        code, name, email, manager: scope, segment: quiz.normSegment(segIn),
        audit: [Object.assign({ at: Date.now(), kind: "create" }, who)]
      };
      all.push(entry);
      await quiz.saveCandidates(all);
      return reply(context, 200, { ok: true, employee: empView(entry) });
    }

    if (op === "deleteEmployee") {
      const removed = all.splice(i, 1)[0];
      await quiz.saveCandidates(all);
      return reply(context, 200, { ok: true, removed: empView(removed) });
    }

    if (op === "updateEmployee") {
      const c = all[i];
      const name = String(b.name == null ? c.name : b.name).trim().slice(0, 100);
      const email = quiz.normEmail(b.email == null ? c.email : b.email);
      const segIn = b.segment == null ? quiz.normSegment(c.segment) : String(b.segment).trim().toLowerCase();
      if (!name) return reply(context, 400, { ok: false, field: "name", error: "Họ tên không được để trống." });
      if (!validEmail(email)) return reply(context, 400, { ok: false, field: "email", error: "Email không hợp lệ." });
      if (SEGMENT_INPUTS.indexOf(segIn) < 0) return reply(context, 400, { ok: false, field: "segment", error: "Nhóm ngành không hợp lệ." });
      const segment = quiz.normSegment(segIn);
      const dup = all.find((x, k) => k !== i && quiz.normEmail(x.email) === email);
      if (dup) return reply(context, 409, { ok: false, field: "email", error: "Email này đang được dùng cho nhân viên khác (mã " + dup.code + ")." });
      const changes = {};
      if (name !== (c.name || "")) changes.name = { from: c.name || "", to: name };
      if (email !== quiz.normEmail(c.email)) changes.email = { from: c.email || "", to: email };
      if (segment !== quiz.normSegment(c.segment)) changes.segment = { from: quiz.normSegment(c.segment), to: segment };
      if (!Object.keys(changes).length) return reply(context, 200, { ok: true, unchanged: true, employee: empView(c) });
      const next = Object.assign({}, c, { name, email, segment });
      delete next.confirmed; // thông tin đã đổi thì cần xác nhận lại
      next.audit = (c.audit || []).concat([Object.assign({ at: Date.now(), kind: "edit", changes }, who)]).slice(-AUDIT_MAX);
      all[i] = next;
      await quiz.saveCandidates(all);
      return reply(context, 200, { ok: true, employee: empView(next), needReconfirm: true });
    }

    if (op === "confirmEmployee") {
      const c = all[i];
      const next = Object.assign({}, c, { confirmed: Object.assign({ at: Date.now(), snap: { name: c.name || "", email: c.email || "", segment: quiz.normSegment(c.segment) } }, who) });
      next.audit = (c.audit || []).concat([Object.assign({ at: Date.now(), kind: "confirm" }, who)]).slice(-AUDIT_MAX);
      all[i] = next;
      await quiz.saveCandidates(all);
      return reply(context, 200, { ok: true, employee: empView(next) });
    }

    // Soạn câu hỏi bằng AI (nháp, chưa lưu) và đưa vào ngân hàng đề - quản lí dùng được, không cần xem/duyệt
    // toàn bộ ngân hàng đề sẵn có (chỉ thấy đúng những câu mình vừa soạn, để xét duyệt trước khi lưu).
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
        const text = String(q.text || "").trim().slice(0, 2000);
        const options = Array.isArray(q.options) ? q.options.map((o) => String(o || "").trim().slice(0, 500)).filter(Boolean) : [];
        const correctIndex = Number.isInteger(q.correctIndex) ? q.correctIndex : -1;
        if (!text || options.length < 2 || correctIndex < 0 || correctIndex >= options.length) { skipped++; return; }
        list.push({ id: quiz.genId(), text, options, correctIndex, category: String(q.category || "").trim().slice(0, 100), active: true, period: per, addedBy: who });
        added++;
      });
      await quiz.saveQuestions(list);
      return reply(context, 200, { ok: true, added, skipped, period: per });
    }

    if (/^delete|^remove|^clear/i.test(op)) return reply(context, 403, { ok: false, error: "Tài khoản quản lí không có quyền xoá. Hãy liên hệ quản trị viên." });
    return reply(context, 400, { ok: false, error: "Thao tác không hợp lệ." });
  } catch (e) {
    context.log.error("kt-viewer", e && e.message);
    return reply(context, 500, { ok: false, error: "Có lỗi xảy ra, thử lại sau." });
  }
};

// Mọi thao tác qua API này đều được ghi vào nhật ký (xem _lib/auditlog.js)
module.exports = require("../_lib/auditlog").wrap(handler, "viewer");
