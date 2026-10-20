// Chỉ ADMIN_EMAILS: quản lý ngân hàng đề, danh sách thí sinh, cài đặt bài kiểm tra, xem kết quả.
const { reply, guardConfigured, requireAjax, requireUserActive } = require("../_lib/http");
const { isAdmin, validEmail, emailAllowed } = require("../_lib/config");
const quiz = require("../_lib/quiz");
const store = require("../_lib/store");
const pwdlib = require("../_lib/pwd");
const crypto = require("crypto");
const { uidOf } = require("../_lib/session");

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
        return reply(context, 200, { ok: true, questions: await quiz.getQuestions(), currentPeriod: st.examPeriod, questionCount: st.questionCount, bothGiaDungCount: st.bothGiaDungCount });
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
        const cands = await quiz.getCandidates();
        const reqP = String((req.query && req.query.period) || "");
        const period = /^\d{4}-\d{2}$/.test(reqP) ? reqP : st.examPeriod;
        const periods = Array.from(new Set(all.map((r) => r.period).filter(Boolean).concat([st.examPeriod]))).sort();
        const untagged = all.filter((r) => !r.period).length;
        const latestOf = (p) => { const m = {}; all.filter((r) => (r.period || "") === p).forEach((r) => { const k = quiz.normCode(r.code); if (!m[k] || (r.submittedAt || 0) > (m[k].submittedAt || 0)) m[k] = r; }); return m; };
        const cur = latestOf(period), rows = Object.values(cur);
        const candBy = {}; cands.forEach((c) => { candBy[quiz.normCode(c.code)] = c; });
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
        const prevP = periods.filter((p) => p < period).pop() || "";
        let prev = null;
        if (prevP) { const pr = Object.values(latestOf(prevP)); prev = { period: prevP, submitted: pr.length, avgPct: avg(pr.map((r) => r.pct || 0)), weak: pr.filter((r) => (r.pct || 0) < lo).length }; }
        // Câu hỏi sai nhiều nhất: đọc bản sao bài làm (tối đa 400 bài gần nhất của kỳ)
        const qs = {};
        const sample = rows.slice().sort((a, b) => (b.submittedAt || 0) - (a.submittedAt || 0)).slice(0, 400);
        const atts = await Promise.all(sample.map((r) => quiz.getAttempt(r.id).catch(() => null)));
        atts.forEach((a) => { if (!a || !Array.isArray(a.paper)) return; a.paper.forEach((q) => {
          const k = q.text; const x = (qs[k] = qs[k] || { text: q.text, answer: (q.options || [])[q.correct] || "", n: 0, wrong: 0, blank: 0 });
          x.n++; if (q.chosen < 0) x.blank++; else if (!q.ok) x.wrong++; }); });
        const topWrong = Object.values(qs).filter((x) => x.n >= Math.min(3, rows.length)).map((x) => Object.assign(x, { rate: Math.round((x.wrong + x.blank) / x.n * 100) }))
          .filter((x) => x.rate > 0).sort((a, b) => b.rate - a.rate || b.n - a.n).slice(0, 8);
        return reply(context, 200, { ok: true, period, currentPeriod: st.examPeriod, periods, untagged,
          candidates: cands.length, submitted: rows.length, avgPct: avg(pcts), medianPct: median, minPct: pcts[0] == null ? null : pcts[0], maxPct: pcts.length ? pcts[pcts.length - 1] : null,
          avgDurationSec: durs.length ? Math.round(durs.reduce((a, b) => a + b, 0) / durs.length) : null,
          passEnabled: !!st.passEnabled, passed: st.passEnabled ? rows.filter((r) => quiz.passState(r.pct, st) === true).length : null,
          complianceEnabled: !!st.complianceEnabled, bands, byManager, bySegment, notDone: notDone.slice(0, 1000), notDoneCount: notDone.length, flags, prev, topWrong, papersRead: atts.filter(Boolean).length });
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
          const chosenIndex = ans && ans.answerIndex >= 0 ? order[ans.answerIndex] : -1;
          return { text: q.text, options: q.options || [], correctIndex: q.correctIndex, chosenIndex, answered: !!ans };
        });
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
      const text = String(q.text || "").trim().slice(0, 2000);
      const options = Array.isArray(q.options) ? q.options.map((o) => String(o || "").trim().slice(0, 500)).filter(Boolean) : [];
      const correctIndex = Number.isInteger(q.correctIndex) ? q.correctIndex : -1;
      if (!text || options.length < 2 || correctIndex < 0 || correctIndex >= options.length) {
        return reply(context, 400, { ok: false, error: "Câu hỏi cần có nội dung, ít nhất 2 phương án, và chọn đúng 1 đáp án đúng hợp lệ." });
      }
      // Kỳ của câu hỏi: lấy theo yêu cầu; câu mới không nêu kỳ thì vào kỳ hiện tại
      const per = quiz.validPeriod(q.period) && typeof q.period === "string" ? q.period : undefined;
      if (q.id) {
        const i = list.findIndex((x) => x.id === q.id);
        if (i < 0) return reply(context, 404, { ok: false, error: "Không tìm thấy câu hỏi." });
        list[i] = Object.assign({}, list[i], { text, options, correctIndex, category: String(q.category || "").slice(0, 100), active: q.active !== false }, per !== undefined ? { period: per } : {});
      } else {
        list.push({ id: quiz.genId(), text, options, correctIndex, category: String(q.category || "").slice(0, 100), active: true, period: per !== undefined ? per : (await quiz.getSettings()).examPeriod });
      }
      await quiz.saveQuestions(list);
      return reply(context, 200, { ok: true, questions: list });
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
        list.push({ id: quiz.genId(), text, options, correctIndex, category: String(q.category || "").trim().slice(0, 100), active: true, period: per });
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
    if (op === "copyQuestions") {
      const from = String(b.from == null ? "" : b.from), to = String(b.to || "");
      if (!quiz.validPeriod(from) || !/^\d{4}-\d{2}$/.test(to) || from === to) return reply(context, 400, { ok: false, error: "Chọn kỳ nguồn và kỳ đích hợp lệ (khác nhau)." });
      const list = await quiz.getQuestions();
      const norm = (t) => String(t || "").trim().toLowerCase().replace(/\s+/g, " ");
      const have = new Set(list.filter((q) => (q.period || "") === to).map((q) => norm(q.text)));
      let added = 0, skipped = 0;
      list.filter((q) => (q.period || "") === from).forEach((q) => {
        if (have.has(norm(q.text))) { skipped++; return; }
        list.push({ id: quiz.genId(), text: q.text, options: (q.options || []).slice(), correctIndex: q.correctIndex, category: q.category || "", active: q.active !== false, period: to, copiedFrom: q.id });
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
      return reply(context, 200, { ok: true, viewer: Object.assign({}, entry, { employees: cands.filter((c) => quiz.inScope(entry, c)).length }), created: k < 0 });
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

    if (op === "deleteCandidate") {
      let list = await quiz.getCandidates();
      list = list.filter((c) => quiz.normCode(c.code) !== quiz.normCode(b.code));
      await quiz.saveCandidates(list);
      return reply(context, 200, { ok: true, candidates: list });
    }

    if (op === "saveSettings") {
      const cur = await quiz.getSettings();
      const next = Object.assign({}, cur, {
        examTitle: String(b.examTitle || cur.examTitle || "").slice(0, 200),
        shareTitle: String(b.shareTitle == null ? cur.shareTitle || "" : b.shareTitle).trim().slice(0, 80),
        questionCount: Math.max(1, parseInt(b.questionCount, 10) || cur.questionCount),
        bothGiaDungCount: Math.max(0, parseInt(b.bothGiaDungCount, 10) || 0),
        secondsPerQuestion: Math.max(10, parseInt(b.secondsPerQuestion, 10) || cur.secondsPerQuestion),
        passEnabled: !!b.passEnabled,
        passScore: Math.min(100, Math.max(0, parseInt(b.passScore, 10) || 0)),
        allowRetake: !!b.allowRetake,
        complianceEnabled: !!b.complianceEnabled,
        complianceHighMin: Math.min(10, Math.max(0, parseFloat(b.complianceHighMin) || 0)),
        complianceMidMin: Math.min(10, Math.max(0, parseFloat(b.complianceMidMin) || 0)),
        complianceLowMin: Math.min(10, Math.max(0, parseFloat(b.complianceLowMin) || 0)),
        examPeriod: /^\d{4}-\d{2}$/.test(String(b.examPeriod || "").trim()) ? String(b.examPeriod).trim() : cur.examPeriod
      });
      await quiz.saveSettings(next);
      return reply(context, 200, { ok: true, settings: next });
    }

    return reply(context, 400, { ok: false, error: "Thao tác không hợp lệ." });
  } catch (e) {
    context.log.error("kt-admin", e && e.message);
    return reply(context, 500, { ok: false, error: "Có lỗi xảy ra." });
  }
};

// Mọi thao tác qua API này đều được ghi vào nhật ký (xem _lib/auditlog.js)
module.exports = require("../_lib/auditlog").wrap(handler, "admin");
