// Chỉ ADMIN_EMAILS: quản lý ngân hàng đề, danh sách thí sinh, cài đặt bài kiểm tra, xem kết quả.
const { reply, guardConfigured, requireAjax, requireUserActive } = require("../_lib/http");
const { isAdmin } = require("../_lib/config");
const quiz = require("../_lib/quiz");

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
        const list = (await quiz.getIndex()).slice().sort((a, b) => (b.submittedAt || 0) - (a.submittedAt || 0));
        return reply(context, 200, { ok: true, results: list });
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
      if (q.id) {
        const i = list.findIndex((x) => x.id === q.id);
        if (i < 0) return reply(context, 404, { ok: false, error: "Không tìm thấy câu hỏi." });
        list[i] = Object.assign({}, list[i], { text, options, correctIndex, category: String(q.category || "").slice(0, 100), active: q.active !== false });
      } else {
        list.push({ id: quiz.genId(), text, options, correctIndex, category: String(q.category || "").slice(0, 100), active: true });
      }
      await quiz.saveQuestions(list);
      return reply(context, 200, { ok: true, questions: list });
    }

    if (op === "deleteQuestion") {
      let list = await quiz.getQuestions();
      list = list.filter((x) => x.id !== b.id);
      await quiz.saveQuestions(list);
      return reply(context, 200, { ok: true, questions: list });
    }

    if (op === "addCandidates") {
      let rows = Array.isArray(b.rows) ? b.rows : [];
      if (!rows.length && b.text) {
        rows = String(b.text).split("\n").map((line) => {
          const parts = line.split(",").map((s) => s.trim());
          return { code: parts[0] || "", name: parts[1] || "", email: parts[2] || "", manager: parts[3] || "" };
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
        const entry = { code: String(r.code).trim().slice(0, 50), name: String(r.name || "").trim().slice(0, 100), email, manager: String(r.manager || "").trim().slice(0, 100) };
        if (byCode[code] != null) { list[byCode[code]] = entry; updated++; }
        else { list.push(entry); byCode[code] = list.length - 1; added++; }
      });
      await quiz.saveCandidates(list);
      return reply(context, 200, { ok: true, candidates: list, added, updated });
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
        questionCount: Math.max(1, parseInt(b.questionCount, 10) || cur.questionCount),
        secondsPerQuestion: Math.max(10, parseInt(b.secondsPerQuestion, 10) || cur.secondsPerQuestion),
        passScore: Math.min(100, Math.max(0, parseInt(b.passScore, 10) || 0)),
        allowRetake: !!b.allowRetake,
        complianceEnabled: !!b.complianceEnabled,
        complianceHighMin: Math.min(10, Math.max(0, parseFloat(b.complianceHighMin) || 0)),
        complianceMidMin: Math.min(10, Math.max(0, parseFloat(b.complianceMidMin) || 0)),
        complianceLowMin: Math.min(10, Math.max(0, parseFloat(b.complianceLowMin) || 0))
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
