// Tài khoản QUẢN LÍ (do quản trị viên cấp): xem nhân viên thuộc phạm vi của mình và kết quả của họ,
// thêm nhân viên mới, sửa / xoá / xác nhận thông tin nhân viên thuộc phạm vi của mình.
// Không xoá được KẾT QUẢ bài làm (chỉ quản trị viên mới reset được bài làm, qua kt-admin).
const _http = require("../_lib/http");
const { guardConfigured, requireAjax, requireUserActive } = _http;
const reply = (ctx, status, body) => _http.reply(ctx, status, require("../_lib/profile").stripProfile(body)); // không bao giờ trả hồ sơ nhân sự ra ngoài kt-admin
const { validEmail, isAdmin } = require("../_lib/config");
const quiz = require("../_lib/quiz");
const { cleanText } = require("../_lib/cleantext");
const { probationOf, joinDateOf } = require("../_lib/probation");
const { modelName, prettyLabel } = require("../_lib/devicename");
const behavior = require("../_lib/behavior");
const perms = require("../_lib/perms");

const SEGMENT_INPUTS = ["both", "ca_hai", "gia_dung", "may_loc"]; // giá trị được chấp nhận; lưu dạng chuẩn: both | gia_dung | may_loc
const AUDIT_MAX = 30;

const empView = (c) => ({
  code: c.code, name: c.name || "", email: c.email || "", manager: c.manager || "", phone: require("../_lib/phone").normPhone(c.phone), title: quiz.titleOf(c), segment: quiz.normSegment(c.segment), probation: probationOf(c.code, undefined, c.joinDate), joinDate: joinDateOf(c.code, c.joinDate),
  left: !!c.left,
  work: c.work ? { status: c.work.status, by: c.work.by, byName: c.work.byName || c.work.by, at: c.work.at } : null,
  confirmed: c.confirmed ? { by: c.confirmed.by, byName: c.confirmed.byName || c.confirmed.by, at: c.confirmed.at } : null
});

// admin = true: kèm thiết bị và vị trí (chỉ quản trị viên được xem, quản lí thường không nhận dữ liệu này)
function summaryOf(r, settings, admin, ai) {
  return {
    id: r.id, period: r.period || "",
    score: r.score, total: r.total, pct: r.pct, compliancePoints: r.compliancePoints, passed: quiz.passState(r.pct, settings), practice: !!r.practice,
    submittedAt: r.submittedAt, startedAt: r.startedAt, durationSec: r.durationSec, wrong: r.wrong, blank: r.blank,
    proof: quiz.proofCode(r.id), verify: quiz.verifyToken(r.id), flags: ai === false ? undefined : (r.flags || null), mailOk: r.mailOk, device: admin ? (r.device ? Object.assign({}, r.device, { label: prettyLabel(r.device.label) }) : null) : undefined
  };
}

const ownsExam = (viewer, e) => !!(viewer && viewer.isAdmin) || (e && e.ownerEmail && quiz.normEmail(e.ownerEmail) === quiz.normEmail(viewer.email));

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
    const exOwner = {}; (await quiz.getExams()).forEach((e) => { if (e.ownerEmail) exOwner[e.id] = quiz.normEmail(e.ownerEmail); });
    // Đề do một quản lí tạo (có ownerEmail) chỉ chính người tạo và quản trị viên được thấy; đề của quản trị viên thì quản lí xem kết quả nhân viên mình như cũ.
    const periodOk = (p) => !!viewer.isAdmin || !exOwner[p || ""] || exOwner[p || ""] === quiz.normEmail(viewer.email);
    const P = perms.permsOf(viewer);
    // Hồ sơ học tập như nhân viên bình thường: quản trị viên xem được cả TÀI KHOẢN THỬ NGHIỆM và các bài thử của họ (gắn nhãn test).
    // Quản lí thường không thấy. Trung bình đội / thứ hạng / thống kê vẫn chỉ tính bài chính thức (quiz.getIndex đã loại bài thử).
    const personOf = async (code) => mine.find((x) => quiz.normCode(x.code) === quiz.normCode(code)) || (viewer.isAdmin ? await quiz.findTestByCode(code) : null);
    const idxOf = async () => (viewer.isAdmin ? await quiz.getIndexAll() : await quiz.getIndex());
    const noPerm = (what) => reply(context, 403, { ok: false, error: "Tài khoản của bạn chưa được cấp quyền: " + what + ". Hãy liên hệ quản trị viên." });

    if (req.method === "GET") {
      const op = (req.query && req.query.op) || "";
      if (op === "me") return reply(context, 200, { ok: true, viewer: { email: viewer.email, name: viewer.name || "", scopes: viewer.scopes || [], isAdmin: !!viewer.isAdmin, perms: P, canViewPhoto: perms.canViewPhoto(viewer) }, serverNow: Date.now() });
      // Trang xác nhận nhân sự (/kiemtra/xacnhan.html): danh sách gọn nhân viên thuộc phạm vi để quản lí bấm "Còn làm" / "Đã nghỉ".
      if (op === "workStatus") {
        if (!P.viewResults && !P.editEmployees) return noPerm("xem nhân viên");
        const list = mine.map((c) => ({ code: c.code, name: c.name || "", title: quiz.titleOf(c), manager: c.manager || "", left: !!c.left, leftAt: c.leftAt || 0,
          work: c.work ? { status: c.work.status, byName: c.work.byName || c.work.by, at: c.work.at } : null }))
          .sort((a, b) => String(a.manager).localeCompare(String(b.manager), "vi") || String(a.name).localeCompare(String(b.name), "vi"));
        return reply(context, 200, { ok: true, viewer: { name: viewer.name || viewer.email, email: viewer.email, isAdmin: !!viewer.isAdmin }, canEdit: !!P.editEmployees, employees: list, serverNow: Date.now() });
      }
      if (op === "employees") {
        if (!P.viewResults) return noPerm("xem nhân viên & kết quả");
        const settings = await quiz.getSettings();
        const idx = await quiz.getIndex();
        // Theo kỳ: mặc định kỳ hiện tại; "" = bài nộp trước khi có kỳ (chưa gắn kỳ)
        const qp = req.query && typeof req.query.period === "string" ? req.query.period : null;
        const period = qp !== null && quiz.validPeriod(qp) && periodOk(qp) ? qp : settings.examPeriod; // nhận cả mã đề tự đặt
        const inMine = {}; mine.forEach((x) => { inMine[quiz.normCode(x.code)] = 1; });
        const subs = idx.filter((a) => a.status === "submitted" && inMine[quiz.normCode(a.code)] && periodOk(a.period));
        // Danh sách mã đề để chọn: mọi đề đã đăng kí (kể cả đề chưa ai nộp bài / đề tự đặt như "thi-thu") dành cho nhóm của mình,
        // cộng các kỳ đã có bài nộp và kỳ hiện tại. Trước đây chỉ liệt kê kỳ đã có bài nộp nên không chọn được đề khác.
        const exams = (await quiz.listExamsSummary()).filter((e) => periodOk(e.id));
        const examFor = (e) => !Array.isArray(e.codes) || !e.codes.length || e.codes.some((c) => inMine[quiz.normCode(c)]);
        const examTitles = {}; exams.forEach((e) => { if (e.title && String(e.title).trim() !== e.id) examTitles[e.id] = String(e.title).trim(); });
        if (!examTitles[settings.examPeriod] && settings.examTitle) examTitles[settings.examPeriod] = String(settings.examTitle).trim(); // đề mặc định lấy tên bài kiểm tra trong cài đặt
        const periods = Array.from(new Set(subs.map((a) => a.period || "").concat([settings.examPeriod], exams.filter(examFor).map((e) => e.id)))).sort().reverse();
        const latest = {};
        subs.filter((a) => (a.period || "") === period).forEach((a) => {
          const k = quiz.normCode(a.code);
          if (quiz.betterResult(a, latest[k])) latest[k] = a; // nhiều lượt: lấy lần điểm cao nhất
        });
        const exSt0 = await quiz.getExamSettings(period);
        const list = await Promise.all(mine.map(async (c) => {
          const r = latest[quiz.normCode(c.code)];
          let status = "none", active = null;
          if (r) status = "done";
          else if (period === settings.examPeriod) { active = await quiz.getActive(c.code); if (active && (active.period || "") === period) { const t = Object.assign({}, active); quiz.syncAttempt(t, Date.now()); if (t.cursor < t.questionIds.length) status = "doing"; } }
          // Nhiều lượt: kèm các lần làm (điểm từng lần, lần chính thức = cao nhất) để quản lí thấy đủ
          const tries = r ? subs.filter((a) => (a.period || "") === period && quiz.normCode(a.code) === quiz.normCode(c.code)).sort((a, b) => (a.submittedAt || 0) - (b.submittedAt || 0))
            .map((a, i) => ({ n: i + 1, score: a.score, total: a.total, pct: a.pct, submittedAt: a.submittedAt, official: a.id === r.id })) : [];
          return Object.assign(empView(c), { status, eligible: quiz.inAudience(exSt0, c), result: r ? Object.assign(summaryOf(r, settings, !!viewer.isAdmin, P.viewAi), { tries }) : null });
        }));
        return reply(context, 200, { ok: true, employees: list, exam: { id: period, title: exSt0.examTitle || period, openAt: exSt0.openAt || 0, closeAt: exSt0.closeAt || 0 }, period, periods, examTitles, currentPeriod: settings.examPeriod, serverNow: Date.now() });
      }
      // Chẩn đoán hành vi học tập của MỘT nhân viên trong phạm vi của quản lí (bằng chứng + nguyên nhân giả thuyết + việc nên làm).
      // Thiết bị / vị trí chỉ đưa vào phân tích khi người xem là quản trị viên (giống các màn hình khác).
      if (op === "insight") {
        if (!P.viewAi) return noPerm("xem cảnh báo AI & lịch sử làm bài");
        const c = await personOf(req.query.code);
        if (!c) return reply(context, 404, { ok: false, error: "Không tìm thấy nhân viên trong phạm vi của bạn." });
        const r = await behavior.forEmployee(c.code, { admin: !!viewer.isAdmin, ai: req.query.ai !== "0", okPeriod: periodOk, all: !!viewer.isAdmin });
        if (!r) return reply(context, 404, { ok: false, error: "Nhân viên chưa có bài đã nộp để phân tích." });
        return reply(context, 200, Object.assign({ ok: true, employee: { code: c.code, name: c.name || "" } }, r));
      }
      // Chẩn đoán cả nhóm (những nhân viên thuộc phạm vi của quản lí) cho một đề / kỳ.
      if (op === "teamInsight") {
        if (!P.viewAi) return noPerm("xem cảnh báo AI & lịch sử làm bài");
        const st = await quiz.getSettings();
        const qp = req.query && typeof req.query.period === "string" ? req.query.period : "";
        const period = qp && quiz.validPeriod(qp) && periodOk(qp) ? qp : st.examPeriod;
        const exSt = await quiz.getExamSettings(period);
        const r = await behavior.forCohort(period, mine.filter((c) => quiz.inAudience(exSt, c)), { ai: req.query.ai !== "0" });
        return reply(context, 200, Object.assign({ ok: true }, r));
      }
      if (op === "paper") {
        if (!P.viewPaper) return noPerm("xem bài làm chi tiết");
        // Xem lại bản sao bài làm của nhân viên trong phạm vi của mình (chỉ đọc)
        const c = await personOf(req.query.code);
        if (!c) return reply(context, 404, { ok: false, error: "Không tìm thấy nhân viên trong phạm vi của bạn." });
        const settings = await quiz.getSettings();
        const mineAll = (await idxOf()).filter((a) => a.status === "submitted" && quiz.normCode(a.code) === quiz.normCode(c.code) && periodOk(a.period))
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
        await require("../_lib/accesslog").write(req, { kind: "paper", role: viewer.isAdmin ? "admin" : "manager", attempt, by: viewer.email, byName: viewer.name, via: "Trang quản lí" });
        return reply(context, 200, { ok: true, employee: { code: c.code, name: c.name || "" }, summary: summaryOf(entry, settings, !!viewer.isAdmin, P.viewAi), paper, source, partial, timing: P.viewAi ? timing : null, photo: viewer.isAdmin && typeof attempt.photo === "string" && attempt.photo.startsWith("data:image/") ? attempt.photo : "", serverNow: Date.now() });
      }
      if (op === "profile") {
        if (!P.viewResults) return noPerm("xem nhân viên & kết quả");
        // Hồ sơ kiểm tra của MỘT nhân viên trong phạm vi: điểm từng kỳ (so với trung bình đội & thứ hạng),
        // kết quả theo mảng kiến thức, câu sai lặp lại. Không kèm thiết bị/vị trí.
        const c = await personOf(req.query.code);
        if (!c) return reply(context, 404, { ok: false, error: "Không tìm thấy nhân viên trong phạm vi của bạn." });
        const settings = await quiz.getSettings();
        const idx = (await quiz.getIndex()).filter((a) => a.status === "submitted" && periodOk(a.period)); // chỉ bài chính thức: dùng cho trung bình đội và thứ hạng
        const inMine = {}; mine.forEach((x) => { inMine[quiz.normCode(x.code)] = 1; });
        // Bài nộp gần nhất của mỗi người trong phạm vi, theo từng kỳ -> trung bình đội & thứ hạng
        const team = {};
        idx.forEach((a) => { const k = quiz.normCode(a.code); if (!inMine[k]) return; const p = a.period || "";
          const t = (team[p] = team[p] || {}); if (quiz.betterResult(a, t[k])) t[k] = a; });
        const mineList = (await idxOf()).filter((a) => a.status === "submitted" && periodOk(a.period) && quiz.normCode(a.code) === quiz.normCode(c.code)).sort((a, b) => (a.submittedAt || 0) - (b.submittedAt || 0)); // gồm cả bài thử (quản trị viên)
        const lo = settings.complianceLowMin * 10;
        const history = mineList.map((a) => {
          const t = Object.values(team[a.period || ""] || {}); const ps = t.map((x) => x.pct || 0);
          const latestInPeriod = (team[a.period || ""] || {})[quiz.normCode(c.code)];
          return { id: a.id, period: a.period || "", score: a.score, total: a.total, pct: a.pct, passed: quiz.passState(a.pct, settings), practice: !!a.practice, test: a.test ? true : undefined, compliancePoints: a.compliancePoints,
            submittedAt: a.submittedAt, durationSec: a.durationSec, flags: P.viewAi ? (a.flags || null) : undefined, proof: quiz.proofCode(a.id), wrong: a.wrong, blank: a.blank, hidden: a.hidden ? true : undefined,
            latest: a.test ? true : (!a.hidden && !!latestInPeriod && latestInPeriod.id === a.id),
            teamAvg: ps.length ? Math.round(ps.reduce((x, y) => x + y, 0) / ps.length * 10) / 10 : null, teamSize: ps.length,
            rank: ps.length ? 1 + ps.filter((v) => v > (a.pct || 0)).length : null, weak: (a.pct || 0) < lo };
        });
        // Mảng kiến thức + câu sai lặp lại: đọc bản sao bài làm (tối đa 12 bài gần nhất)
        const cats = {}, wq = {};
        const mineVisible = mineList.filter((a) => !a.hidden); // bài đã ẩn không tính vào mảng kiến thức / câu sai lặp lại
        const recent = mineVisible.slice(-12);
        const atts = await Promise.all(recent.map((a) => quiz.getAttempt(a.id).catch(() => null)));
        const lastId = mineVisible.length ? mineVisible[mineVisible.length - 1].id : "";
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
          complianceLowMin: settings.complianceLowMin, history, categories, repeatWrong, lastWrong: lastWrong.slice(0, 15), papersRead: atts.filter(Boolean).length,
          // Hồ sơ nhân sự CHỈ dành cho quản trị viên (ADMIN_EMAILS). Quản lí thường không nhận khối này.
          hr: viewer.isAdmin && c.profile ? c.profile : undefined, hrEmpty: viewer.isAdmin && !c.profile });
      }
      if (op === "photo") {
        if (!perms.canViewPhoto(viewer)) return reply(context, 403, { ok: false, error: "Ảnh thí sinh chỉ quản trị viên được xem. Tài khoản quản lí không có quyền này." });
        // Ảnh xác nhận khuôn mặt chụp ngay trước khi bắt đầu làm bài - minh chứng cho ĐÚNG MỘT kỳ, không dùng chéo sang kỳ khác.
        // Chọn theo: id (một bài cụ thể) > period (bài nộp gần nhất của kỳ, nếu chưa nộp thì bài đang làm của kỳ đó).
        const c = await personOf(req.query.code);
        if (!c) return reply(context, 404, { ok: false, error: "Không tìm thấy nhân viên trong phạm vi của bạn." });
        const st0 = await quiz.getSettings();
        const wantId = String((req.query && req.query.id) || "");
        const wantP = req.query && typeof req.query.period === "string" ? req.query.period : st0.examPeriod;
        const subsC = (await idxOf()).filter((a) => a.status === "submitted" && quiz.normCode(a.code) === quiz.normCode(c.code))
          .sort((a, b) => (b.submittedAt || 0) - (a.submittedAt || 0));
        const entry = wantId ? subsC.find((a) => a.id === wantId) : subsC.find((a) => (a.period || "") === wantP);
        if (wantId && !entry) return reply(context, 404, { ok: false, error: "Không tìm thấy bài làm này." });
        let attempt = entry && (await quiz.getAttempt(entry.id));
        if (!attempt && !wantId) { const act = await quiz.getActive(c.code); if (act && (act.period || "") === wantP) attempt = act; }
        const photo = attempt && typeof attempt.photo === "string" && attempt.photo.startsWith("data:image/") ? attempt.photo : "";
        if (photo && attempt.status === "submitted") await require("../_lib/accesslog").write(req, { kind: "photo", role: viewer.isAdmin ? "admin" : "manager", attempt, by: viewer.email, byName: viewer.name, via: "Trang quản lí" });
        const devices = !viewer.isAdmin ? [] : attempt ? (Array.isArray(attempt.devices) ? attempt.devices : (attempt.device ? [attempt.device] : [])) : [];
        return reply(context, 200, { ok: true, photo, takenAt: (attempt && attempt.startedAt) || null, face: attempt && attempt.faceCheck ? attempt.faceCheck.status : null, faceId: attempt && attempt.faceId ? { s: attempt.faceId.s, d: attempt.faceId.d, t: attempt.faceId.t, n: attempt.faceId.n } : null, period: attempt ? (attempt.period || "") : wantP, inProgress: !!(attempt && attempt.status === "in_progress"),
          devices: !viewer.isAdmin ? undefined : devices.map((d) => ({ type: d.type, os: d.os, browser: d.browser, model: modelName(d.model, d.screen) || d.model, ip: d.ip, screen: d.screen, tz: d.tz, lang: d.lang, stage: d.stage, at: d.at, ua: d.ua, loc: d.loc || null, locErr: d.locErr || "" })) });
      }
      if (op === "employee") {
        if (!P.viewResults) return noPerm("xem nhân viên & kết quả");
        const c = await personOf(req.query.code);
        if (!c) return reply(context, 404, { ok: false, error: "Không tìm thấy nhân viên trong phạm vi của bạn." });
        return reply(context, 200, { ok: true, employee: empView(c), history: (c.audit || []).slice().reverse().slice(0, 20) });
      }
      if (op === "myExams") {
        if (!P.manageExams) return noPerm("tạo & quản lí đề");
        const inMine = {}; mine.forEach((x) => { inMine[quiz.normCode(x.code)] = 1; });
        const list = (await quiz.listExamsSummary()).filter((e) => ownsExam(viewer, e));
        return reply(context, 200, { ok: true, exams: list, employees: mine.map((c) => ({ code: c.code, name: c.name || "", manager: c.manager || "" })), maxQuestions: quiz.MAX_QUESTION_COUNT });
      }
      if (op === "examQuestions") {
        if (!P.manageExams) return noPerm("tạo & quản lí đề");
        const per = String((req.query && req.query.period) || "");
        const ex = (await quiz.getExams()).find((e) => e.id === per);
        if (!ex || !ownsExam(viewer, ex)) return reply(context, 403, { ok: false, error: "Đây không phải đề do bạn tạo." });
        const qs = (await quiz.getQuestions()).filter((q) => (q.period || "") === per).map((q) => ({ id: q.id, text: q.text, options: q.options, correctIndex: q.correctIndex, category: q.category || "", active: q.active !== false }));
        return reply(context, 200, { ok: true, period: per, questions: qs });
      }
      return reply(context, 400, { ok: false, error: "Thiếu tham số op." });
    }

    if (!requireAjax(context, req)) return;
    const b = req.body || {};
    const op = b.op || "";
    const all = await quiz.getCandidates();
    const i = all.findIndex((x) => quiz.normCode(x.code) === quiz.normCode(b.code));
    // Chỉ thao tác được trên nhân viên thuộc phạm vi của mình
    if (["updateEmployee", "confirmEmployee", "deleteEmployee", "setEmployment"].indexOf(op) >= 0 && (i < 0 || !quiz.inScope(viewer, all[i]))) {
      return reply(context, 404, { ok: false, error: "Không tìm thấy nhân viên trong phạm vi của bạn." });
    }
    const who = { by: viewer.email, byName: viewer.name || viewer.email };
    if (op === "addEmployee" || op === "updateEmployee" || op === "confirmEmployee" || op === "setEmployment") { if (!P.editEmployees) return noPerm("thêm / sửa / xác nhận nhân viên"); }
    if (op === "deleteEmployee" && !P.deleteEmployees) return noPerm("xoá nhân viên");

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
        code, name, email, manager: scope, segment: quiz.normSegment(segIn), title: quiz.normTitle(b.title) || quiz.DEFAULT_TITLE,
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
      const title = b.title == null ? quiz.titleOf(c) : (quiz.normTitle(b.title) || quiz.DEFAULT_TITLE);
      const dup = all.find((x, k) => k !== i && quiz.normEmail(x.email) === email);
      if (dup) return reply(context, 409, { ok: false, field: "email", error: "Email này đang được dùng cho nhân viên khác (mã " + dup.code + ")." });
      const changes = {};
      if (name !== (c.name || "")) changes.name = { from: c.name || "", to: name };
      if (email !== quiz.normEmail(c.email)) changes.email = { from: c.email || "", to: email };
      if (segment !== quiz.normSegment(c.segment)) changes.segment = { from: quiz.normSegment(c.segment), to: segment };
      if (title !== quiz.titleOf(c)) changes.title = { from: quiz.titleOf(c), to: title };
      if (!Object.keys(changes).length) return reply(context, 200, { ok: true, unchanged: true, employee: empView(c) });
      const next = Object.assign({}, c, { name, email, segment, title });
      delete next.confirmed; // thông tin đã đổi thì cần xác nhận lại
      next.audit = (c.audit || []).concat([Object.assign({ at: Date.now(), kind: "edit", changes }, who)]).slice(-AUDIT_MAX);
      all[i] = next;
      await quiz.saveCandidates(all);
      return reply(context, 200, { ok: true, employee: empView(next), needReconfirm: true });
    }

    // Quản lí xác nhận tình trạng làm việc của nhân viên mình: left=true -> đã nghỉ việc (không gán đề, không thông báo,
    // không tính "chưa làm", không vào thi; giống quản trị viên đánh dấu ở kt-admin op=setEmployment); left=false -> còn làm.
    // Không xoá hồ sơ / kết quả cũ. Mỗi lần bấm đều ghi lại người xác nhận và thời điểm (work) để biết đã rà soát tới đâu.
    if (op === "setEmployment") {
      if (b.clear === true) { // hoàn tác về "chưa xác nhận" (vẫn ghi nhật ký)
        const c = all[i], next = Object.assign({}, c); delete next.left; delete next.leftAt; delete next.work;
        next.audit = (c.audit || []).concat([Object.assign({ at: Date.now(), kind: "edit", changes: { work: { from: c.left ? "đã nghỉ việc" : "đang làm việc", to: "chưa xác nhận (hoàn tác)" } } }, who)]).slice(-AUDIT_MAX);
        all[i] = next; await quiz.saveCandidates(all);
        return reply(context, 200, { ok: true, employee: empView(next), changed: !!c.left });
      }
      if (typeof b.left !== "boolean") return reply(context, 400, { ok: false, error: "Yêu cầu không hợp lệ." });
      const c = all[i], left = b.left, now = Date.now();
      const next = Object.assign({}, c, { work: Object.assign({ status: left ? "left" : "active", at: now }, who) });
      if (left) { next.left = true; next.leftAt = c.left ? (c.leftAt || now) : now; } else { delete next.left; delete next.leftAt; }
      const entry = Object.assign({ at: now, kind: "edit" }, who);
      if (!!c.left !== left) entry.changes = { work: { from: c.left ? "đã nghỉ việc" : "đang làm việc", to: left ? "đã nghỉ việc" : "đang làm việc" } };
      else entry.kind = "confirm";
      next.audit = (c.audit || []).concat([entry]).slice(-AUDIT_MAX);
      all[i] = next;
      await quiz.saveCandidates(all);
      return reply(context, 200, { ok: true, employee: empView(next), changed: !!c.left !== left });
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
    { if (/notif|remind|invite|mail/i.test(op) && !P.notify) return noPerm("gửi thông báo cho nhân viên"); }
    { // Gửi thông báo (xem _lib/notifyops.js). Quản lí chỉ thao tác được với nhân viên thuộc phạm vi của mình
      const nr = await require("../_lib/notifyops").handle(op, b, { email: viewer.email, name: viewer.name || viewer.email, isAdmin: !!viewer.isAdmin, allowed: (c) => quiz.inScope(viewer, c) });
      if (nr) return reply(context, nr.status, nr.body);
    }

    if ((op === "genQuestions" || op === "addQuestions") && !P.manageExams) return noPerm("tạo & quản lí đề");
    if (op === "genQuestions") {
      const r = await require("../_lib/examai").generateDraft(b.topic, b.count, b.category, (await quiz.getQuestions()).map((q) => q.text));
      return reply(context, 200, r);
    }

    if (op === "addQuestions") {
      const incoming = Array.isArray(b.questions) ? b.questions : [];
      const list = await quiz.getQuestions();
      const per = typeof b.period === "string" && quiz.validPeriod(b.period) ? b.period : "";
      if (!per) return reply(context, 400, { ok: false, error: "Hãy chọn đề của bạn để thêm câu hỏi." });
      const ex0 = (await quiz.getExams()).find((e) => e.id === per);
      if (!viewer.isAdmin && !(ex0 && ownsExam(viewer, ex0))) return reply(context, 403, { ok: false, error: "Bạn chỉ thêm được câu hỏi vào đề do chính mình tạo." });
      let added = 0, skipped = 0;
      incoming.forEach((q) => {
        const text = cleanText(q.text).slice(0, 2000);
        const options = Array.isArray(q.options) ? q.options.map((o) => cleanText(o).slice(0, 500)).filter(Boolean) : [];
        const correctIndex = Number.isInteger(q.correctIndex) ? q.correctIndex : -1;
        if (!text || options.length < 2 || correctIndex < 0 || correctIndex >= options.length) { skipped++; return; }
        list.push({ id: quiz.genId(), text, options, correctIndex, category: String(q.category || "").trim().slice(0, 100), active: true, period: per, addedBy: who });
        added++;
      });
      await quiz.saveQuestions(list);
      return reply(context, 200, { ok: true, added, skipped, period: per });
    }

    if (op === "saveMyExam" || op === "dropMyExam" || op === "removeMyQuestion") {
      if (!P.manageExams) return noPerm("tạo & quản lí đề");
      const exams = await quiz.getExams();
      const inMine = {}; mine.forEach((x) => { inMine[quiz.normCode(x.code)] = 1; });
      if (op === "saveMyExam") {
        const d = Object.assign({}, b.exam || b);
        const id = String(d.id || "").trim();
        const ex = exams.find((e) => e.id === id);
        if (ex && !ownsExam(viewer, ex)) return reply(context, 403, { ok: false, error: "Mã đề này đã có và không phải do bạn tạo." });
        // Đối tượng làm bài luôn bị giới hạn trong nhóm của mình: không bao giờ để trống = tất cả nhân viên
        const wanted = (Array.isArray(d.codes) ? d.codes : String(d.codes || "").split(/[\s,;]+/)).map(quiz.normCode).filter(Boolean);
        const codes = (wanted.length ? wanted : Object.keys(inMine)).filter((c) => viewer.isAdmin || inMine[c]);
        if (!codes.length) return reply(context, 400, { ok: false, error: "Chưa có nhân viên nào trong phạm vi của bạn để giao đề." });
        d.codes = codes; d.codesExclude = false; d.asgMode = "pick"; d.inviteOff = true;
        const r = await quiz.upsertExam(d);
        if (!r.ok) return reply(context, 400, r);
        const all2 = await quiz.getExams(), k = all2.findIndex((e) => e.id === r.exam.id);
        /* chỉ gắn chủ đề lúc TẠO MỚI; sửa đề sẵn có không đổi chủ */
        if (k >= 0 && r.created && !all2[k].ownerEmail) { all2[k].ownerEmail = viewer.email; all2[k].ownerName = viewer.name || viewer.email; await quiz.saveExams(all2); }
        return reply(context, 200, { ok: true, exam: r.exam, created: !!r.created, exams: (await quiz.listExamsSummary()).filter((e) => ownsExam(viewer, e)) });
      }
      const id = String(b.id || b.period || "");
      const ex = exams.find((e) => e.id === id);
      if (!ex || !ownsExam(viewer, ex)) return reply(context, 403, { ok: false, error: "Đây không phải đề do bạn tạo." });
      if (op === "dropMyExam") {
        if (id === (await quiz.getSettings()).examPeriod) return reply(context, 400, { ok: false, error: "Không xoá được đề đang là đề mặc định của hệ thống." });
        const sum = (await quiz.listExamsSummary()).find((e) => e.id === id);
        if (sum && sum.resultCount > 0) return reply(context, 400, { ok: false, error: "Đề này đã có bài nộp nên không xoá được. Hãy liên hệ quản trị viên." });
        await quiz.deleteExam(id);
        return reply(context, 200, { ok: true, exams: (await quiz.listExamsSummary()).filter((e) => ownsExam(viewer, e)) });
      }
      const list = await quiz.getQuestions();
      const left = list.filter((q) => !((q.period || "") === id && q.id === String(b.qid || "")));
      if (left.length === list.length) return reply(context, 404, { ok: false, error: "Không tìm thấy câu hỏi trong đề của bạn." });
      await quiz.saveQuestions(left);
      return reply(context, 200, { ok: true });
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
