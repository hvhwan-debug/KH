// Chỉ ADMIN_EMAILS: quản lý ngân hàng đề, thí sinh, cài đặt, theo dõi kết quả.
const { reply, guardConfigured, requireAjax, requireUserActive } = require("../_lib/http");
const { isAdmin, validEmail } = require("../_lib/config");
const quiz = require("../_lib/quiz");
const flow = require("../_lib/ktflow");

function cleanQuestion(q) {
  const text = String(q.text || "").trim().slice(0, 2000);
  const options = Array.isArray(q.options) ? q.options.map((o) => String(o == null ? "" : o).trim().slice(0, 500)).filter(Boolean) : [];
  const correctIndex = Number.isInteger(q.correctIndex) ? q.correctIndex : -1;
  if (!text || options.length < 2 || options.length > 8 || correctIndex < 0 || correctIndex >= options.length) return null;
  if (new Set(options.map((o) => o.toLowerCase())).size !== options.length) return null; // phương án trùng nhau
  return { text, options, correctIndex, category: String(q.category || "").trim().slice(0, 100) };
}
const qKey = (t) => quiz.normCat(t);

function parseTime(v) {
  if (v === "" || v == null) return null;
  const n = typeof v === "number" ? v : Date.parse(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// Bài đang làm dở đã quá hạn thì chốt luôn để bảng kết quả không bị treo ở "đang làm".
async function sweep(index, settings, log) {
  const now = Date.now();
  const open = index.filter((e) => e.status === "in_progress");
  await quiz.mapLimit(open, 8, async (e) => {
    const a = await quiz.getAttempt(e.id);
    if (!a || a.v !== 2 || a.status !== "in_progress") return;
    quiz.advanceByTime(a, now);
    if (a.idx >= a.items.length) {
      await flow.finalize(a, settings, log);
    } else {
      await quiz.putIndex(a);
    }
    Object.assign(e, quiz.indexEntry(a));
  });
}

module.exports = async function (context, req) {
  try {
    if (guardConfigured(context)) return;
    const u = await requireUserActive(context, req);
    if (!u) return;
    if (!isAdmin(u.email)) return reply(context, 403, { ok: false, error: "Bạn không có quyền quản trị." });

    if (req.method === "GET") {
      const op = (req.query && req.query.op) || "";
      if (op === "questions") return reply(context, 200, { ok: true, questions: await quiz.getQuestions() });
      if (op === "candidates") return reply(context, 200, { ok: true, candidates: await quiz.getCandidates() });
      if (op === "settings") return reply(context, 200, { ok: true, settings: await quiz.getSettings() });
      if (op === "results") {
        const settings = await quiz.getSettings();
        const list = await quiz.listIndex();
        await sweep(list, settings, context.log);
        list.sort((a, b) => (b.submittedAt || b.startedAt || 0) - (a.submittedAt || a.startedAt || 0));
        return reply(context, 200, { ok: true, results: list });
      }
      if (op === "result") {
        const a = await quiz.getAttempt(String(req.query.id || ""));
        if (!a) return reply(context, 404, { ok: false, error: "Không tìm thấy." });
        let detail;
        if (a.v === 2) {
          detail = a.items.map((it) => {
            const r = a.answers[it.id];
            return { text: it.text, category: it.category, options: it.options, correctIndex: it.correct, chosenIndex: r ? r.a : -1, answered: !!(r && r.a >= 0), timeout: !!(r && r.timeout) };
          });
        } else {
          const byId = {}; (await quiz.getQuestions()).forEach((q) => { byId[q.id] = q; });
          detail = (a.questionIds || []).map((qid) => {
            const q = byId[qid] || { text: "(câu hỏi đã bị xoá)", options: [] };
            const ans = a.answers[qid]; const order = (a.orders || {})[qid] || (q.options || []).map((_, i) => i);
            return { text: q.text, category: q.category, options: q.options || [], correctIndex: q.correctIndex, chosenIndex: ans && ans.answerIndex >= 0 ? order[ans.answerIndex] : -1, answered: !!ans };
          });
        }
        const safe = Object.assign({}, a); delete safe.items; delete safe.answers; delete safe.orders;
        return reply(context, 200, { ok: true, attempt: safe, detail });
      }
      if (op === "itemstats") {
        // Phân tích từng câu: bao nhiêu người làm, tỉ lệ đúng, tỉ lệ bỏ trống.
        const list = (await quiz.listIndex()).filter((e) => e.status === "submitted");
        const stats = {};
        await quiz.mapLimit(list, 12, async (e) => {
          const a = await quiz.getAttempt(e.id);
          if (!a || a.v !== 2 || a.status !== "submitted") return;
          a.items.forEach((it) => {
            const s = stats[it.id] || (stats[it.id] = { id: it.id, text: it.text, category: it.category, shown: 0, correct: 0, blank: 0 });
            const r = a.answers[it.id];
            s.shown++; if (r && r.a === it.correct) s.correct++; if (!r || r.a < 0) s.blank++;
          });
        });
        return reply(context, 200, { ok: true, items: Object.values(stats).sort((x, y) => (x.correct / x.shown) - (y.correct / y.shown)) });
      }
      return reply(context, 400, { ok: false, error: "Thiếu tham số op." });
    }

    if (!requireAjax(context, req)) return;
    const b = req.body || {};
    const op = b.op || "";

    if (op === "saveQuestion") {
      const list = await quiz.getQuestions();
      const q = b.question || {};
      const c = cleanQuestion(q);
      if (!c) return reply(context, 400, { ok: false, error: "Câu hỏi cần có nội dung, 2–8 phương án khác nhau, và chọn đúng 1 đáp án đúng hợp lệ." });
      if (q.id) {
        const i = list.findIndex((x) => x.id === q.id);
        if (i < 0) return reply(context, 404, { ok: false, error: "Không tìm thấy câu hỏi." });
        list[i] = Object.assign({}, list[i], c, { active: q.active === undefined ? list[i].active !== false : q.active !== false });
      } else {
        list.push(Object.assign({ id: quiz.genId(), active: true }, c));
      }
      await quiz.saveQuestions(list);
      return reply(context, 200, { ok: true, questions: list });
    }

    if (op === "addQuestions") {
      const incoming = Array.isArray(b.questions) ? b.questions : [];
      const list = await quiz.getQuestions();
      const have = new Set(list.map((q) => qKey(q.text)));
      let added = 0, skipped = 0, duplicates = 0;
      incoming.forEach((q) => {
        const c = cleanQuestion(q || {});
        if (!c) { skipped++; return; }
        if (have.has(qKey(c.text))) { duplicates++; return; }
        have.add(qKey(c.text));
        list.push(Object.assign({ id: quiz.genId(), active: true }, c));
        added++;
      });
      await quiz.saveQuestions(list);
      return reply(context, 200, { ok: true, questions: list, added, skipped, duplicates });
    }

    if (op === "deleteQuestion" || op === "deleteQuestions") {
      const ids = new Set(op === "deleteQuestion" ? [b.id] : (Array.isArray(b.ids) ? b.ids : []));
      const list = (await quiz.getQuestions()).filter((x) => !ids.has(x.id));
      await quiz.saveQuestions(list);
      return reply(context, 200, { ok: true, questions: list });
    }

    if (op === "setQuestionsActive") {
      const ids = new Set(Array.isArray(b.ids) ? b.ids : []);
      const list = await quiz.getQuestions();
      list.forEach((q) => { if (ids.has(q.id)) q.active = !!b.active; });
      await quiz.saveQuestions(list);
      return reply(context, 200, { ok: true, questions: list });
    }

    if (op === "renameCategory") {
      const from = qKey(b.from), to = String(b.to || "").trim().slice(0, 100);
      const list = await quiz.getQuestions();
      let n = 0;
      list.forEach((q) => { if (qKey(q.category) === from) { q.category = to; n++; } });
      await quiz.saveQuestions(list);
      return reply(context, 200, { ok: true, questions: list, changed: n });
    }

    if (op === "addCandidates") {
      let rows = Array.isArray(b.rows) ? b.rows : [];
      if (!rows.length && b.text) {
        rows = String(b.text).split(/\r?\n/).map((line) => {
          const sep = line.indexOf("\t") >= 0 ? "\t" : line.indexOf(";") >= 0 && line.indexOf(",") < 0 ? ";" : ",";
          const p = line.split(sep).map((s) => s.trim());
          return { code: p[0] || "", name: p[1] || "", email: p[2] || "", manager: p[3] || "", segment: p[4] || "", _raw: line };
        }).filter((r) => r._raw.trim());
      }
      const list = await quiz.getCandidates();
      const byCode = {}; list.forEach((c, i) => { byCode[quiz.normCode(c.code)] = i; });
      let added = 0, updated = 0; const errors = [];
      rows.forEach((r, n) => {
        const code = quiz.normCode(r.code), email = quiz.normEmail(r.email);
        if (!code) { errors.push({ line: n + 1, reason: "Thiếu mã nhân viên" }); return; }
        if (!validEmail(email)) { errors.push({ line: n + 1, code: r.code, reason: "Email không hợp lệ" }); return; }
        const entry = { code: String(r.code).trim().slice(0, 50), name: String(r.name || "").trim().slice(0, 100), email, manager: String(r.manager || "").trim().slice(0, 100), segment: quiz.normSegment(r.segment) };
        if (byCode[code] != null) { list[byCode[code]] = entry; updated++; } else { list.push(entry); byCode[code] = list.length - 1; added++; }
      });
      await quiz.saveCandidates(list);
      return reply(context, 200, { ok: true, candidates: list, added, updated, errors });
    }

    if (op === "saveCandidate") {
      const c = b.candidate || {};
      const code = quiz.normCode(c.code), email = quiz.normEmail(c.email);
      if (!code || !validEmail(email)) return reply(context, 400, { ok: false, error: "Cần mã nhân viên và email hợp lệ." });
      const list = await quiz.getCandidates();
      const orig = quiz.normCode(b.origCode || c.code);
      const i = list.findIndex((x) => quiz.normCode(x.code) === orig);
      if (i < 0) return reply(context, 404, { ok: false, error: "Không tìm thấy thí sinh." });
      if (code !== orig && list.some((x) => quiz.normCode(x.code) === code)) return reply(context, 409, { ok: false, error: "Mã nhân viên này đã tồn tại." });
      list[i] = { code: String(c.code).trim().slice(0, 50), name: String(c.name || "").trim().slice(0, 100), email, manager: String(c.manager || "").trim().slice(0, 100), segment: quiz.normSegment(c.segment) };
      await quiz.saveCandidates(list);
      return reply(context, 200, { ok: true, candidates: list });
    }

    if (op === "deleteCandidate" || op === "deleteCandidates") {
      const codes = new Set((op === "deleteCandidate" ? [b.code] : (Array.isArray(b.codes) ? b.codes : [])).map(quiz.normCode));
      const list = (await quiz.getCandidates()).filter((c) => !codes.has(quiz.normCode(c.code)));
      await quiz.saveCandidates(list);
      return reply(context, 200, { ok: true, candidates: list });
    }

    // Huỷ một bài làm (ghi nhận "vô hiệu") để thí sinh được làm lại, vẫn giữ dữ liệu cũ để đối chiếu.
    if (op === "voidAttempt") {
      const a = await quiz.getAttempt(String(b.id || ""));
      if (!a) return reply(context, 404, { ok: false, error: "Không tìm thấy bài làm." });
      a.status = "voided"; a.voidedAt = Date.now(); a.voidedBy = u.email;
      await quiz.putAttempt(a);
      await quiz.putIndex(a);
      await quiz.removeLegacy(a.id);
      const ptr = await quiz.getPointer(a.code);
      if (ptr && ptr.attemptId === a.id) await quiz.delPointer(a.code);
      return reply(context, 200, { ok: true });
    }

    if (op === "resendMail") {
      const a = await quiz.getAttempt(String(b.id || ""));
      if (!a || a.v !== 2 || a.status !== "submitted") return reply(context, 404, { ok: false, error: "Không tìm thấy bài đã nộp." });
      const settings = await quiz.getSettings();
      await flow.sendResultMail(a, settings, context.log);
      await quiz.putAttempt(a); await quiz.putIndex(a);
      return reply(context, 200, { ok: !!(a.mail && a.mail.sent), error: a.mail && a.mail.sent ? undefined : "Không gửi được email: " + ((a.mail && a.mail.error) || "chưa cấu hình SMTP") });
    }

    if (op === "saveSettings") {
      const cur = await quiz.getSettings();
      const hi = Math.min(10, Math.max(0, parseFloat(b.complianceHighMin)));
      const mid = Math.min(10, Math.max(0, parseFloat(b.complianceMidMin)));
      const lo = Math.min(10, Math.max(0, parseFloat(b.complianceLowMin)));
      if ([hi, mid, lo].some((x) => !Number.isFinite(x)) || !(hi >= mid && mid >= lo)) {
        return reply(context, 400, { ok: false, error: "Các mốc điểm tuân thủ phải là số từ 0 đến 10 và giảm dần (mốc 20 điểm ≥ mốc 15 điểm ≥ mốc 10 điểm)." });
      }
      const opensAt = parseTime(b.opensAt), closesAt = parseTime(b.closesAt);
      if (opensAt && closesAt && closesAt <= opensAt) return reply(context, 400, { ok: false, error: "Thời điểm đóng phải sau thời điểm mở." });
      const next = Object.assign({}, cur, {
        examTitle: String(b.examTitle || cur.examTitle || "").trim().slice(0, 200) || "Bài kiểm tra",
        enabled: b.enabled !== false, opensAt, closesAt,
        questionCount: Math.min(200, Math.max(1, parseInt(b.questionCount, 10) || cur.questionCount)),
        bothGiaDungCount: Math.max(0, parseInt(b.bothGiaDungCount, 10) || 0),
        secondsPerQuestion: Math.min(1800, Math.max(10, parseInt(b.secondsPerQuestion, 10) || cur.secondsPerQuestion)),
        passScore: Math.min(100, Math.max(0, parseInt(b.passScore, 10) || 0)),
        allowRetake: !!b.allowRetake, showReview: !!b.showReview,
        complianceEnabled: !!b.complianceEnabled, complianceHighMin: hi, complianceMidMin: mid, complianceLowMin: lo
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
