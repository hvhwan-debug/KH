// Công khai nhưng có kiểm soát: thí sinh xem lại ĐÚNG đề mình đã làm, từ link/QR trên thẻ kết quả.
// Hai lớp bảo vệ: (1) phải đúng mã nhân viên + email của chính bài làm đó, (2) đề chỉ xem lại được
// SAU KHI đã đóng (có "Thời gian đóng" và đã qua) - tránh lộ đề/đáp án cho người khác khi kỳ thi còn mở.
const { reply, guardConfigured, requireAjax } = require("../_lib/http");
const quiz = require("../_lib/quiz");
const { cleanText, cleanList } = require("../_lib/cleantext");
const { userFromReq } = require("../_lib/session");
const { isAdmin } = require("../_lib/config");
const auditlog = require("../_lib/auditlog");
const device = require("../_lib/device");
const facecheck = require("../_lib/facecheck");
const { normPhone } = require("../_lib/phone");

// Quản trị viên đang đăng nhập (cookie phiên) được xem mọi bài mà không cần mã NV + email của chủ bài.
function adminOf(req) {
  try { const u = userFromReq(req); return u && u.email && isAdmin(u.email) ? u : null; } catch (e) { return null; }
}

// Ghi nhật ký mỗi lần xem lại đề của người thường (kể cả bị từ chối). Không lưu ảnh vừa chụp.
async function logView(req, attempt, result, why, detail) {
  try {
    await auditlog.write({ area: "verify", role: "candidate", by: String(attempt.code || "").toLowerCase(), name: attempt.name || "", op: "viewPaper", label: "Thí sinh xem lại đề (SĐT + đối chiếu khuôn mặt)",
      kind: result === "ok" ? "read" : "denied", status: result === "ok" ? 200 : 403, ok: result === "ok", details: { attempt: attempt.id, result: why, note: detail || "" }, ip: device.ipOf(req) });
  } catch (e) { /* không chặn luồng chính */ }
}

module.exports = async function (context, req) {
  try {
    if (guardConfigured(context)) return;
    if (req.method !== "POST") return reply(context, 405, { ok: false, error: "Phương thức không hợp lệ." });
    if (!requireAjax(context, req)) return;
    if (quiz.tooManyFails(req, 8, 10 * 60 * 1000)) {
      return reply(context, 429, { ok: false, error: "Bạn đã thử quá nhiều lần. Vui lòng đợi vài phút rồi thử lại." });
    }
    const b = req.body || {};
    const adminU = adminOf(req);
    if (b.probe) return reply(context, 200, { ok: true, admin: !!adminU }); // trang kết quả hỏi: có phải quản trị viên không
    const id = quiz.checkVerifyToken(b.t);
    const attempt = id ? await quiz.getAttempt(id) : null;
    if (!attempt || attempt.status !== "submitted") { quiz.noteFail(req); return reply(context, 404, { ok: false, error: "Không tìm thấy kết quả. Mã QR không hợp lệ." }); }

    const code = quiz.normCode(b.code), email = quiz.normEmail(b.email);
    const master = !!(adminU && b.admin === true);
    if (!master && (!code || !email || quiz.normCode(attempt.code) !== code || quiz.normEmail(attempt.email) !== email)) {
      quiz.noteFail(req);
      return reply(context, 403, { ok: false, error: "Mã nhân viên hoặc email không khớp với bài làm này." });
    }

    const settings = await quiz.getExamSettings(attempt.period || "");
    if (!master && (!settings.closeAt || Date.now() <= settings.closeAt)) {
      return reply(context, 403, { ok: false, error: "Đề chỉ xem lại được sau khi bài kiểm tra đã kết thúc" + (settings.closeAt ? " (dự kiến " + quiz.fmtVN(settings.closeAt) + ")" : "") + "." });
    }
    let paper = Array.isArray(attempt.paper) ? attempt.paper : [];
    if (master && !paper.length) { // bài cũ chưa có bản lưu đề: dựng lại từ ngân hàng câu hỏi hiện tại
      try { const byId = {}; (await quiz.getQuestions()).forEach((q) => { byId[q.id] = q; }); paper = quiz.buildPaper(attempt, byId) || []; } catch (e) { paper = []; }
    }
    if (!paper.length) {
      return reply(context, 404, { ok: false, error: "Bài làm này chưa có bản lưu đề để xem lại." });
    }

    // Người thường: phải nhập đúng số điện thoại trong hồ sơ VÀ đối chiếu khuôn mặt với ảnh đã lưu của chủ bài.
    if (!master) {
      const phone = normPhone(b.phone);
      if (!phone) return reply(context, 400, { ok: false, error: "Nhập số điện thoại (10 số, bắt đầu bằng 0)." });
      const cands = await quiz.getCandidates();
      const prof = cands.find((c) => quiz.normCode(c.code) === quiz.normCode(attempt.code));
      const onFile = prof ? normPhone(prof.phone) : "";
      if (onFile && onFile !== phone) {
        quiz.noteFail(req);
        await logView(req, attempt, "denied", "phone");
        return reply(context, 403, { ok: false, error: "Số điện thoại không khớp với hồ sơ." });
      }
      const selfie = typeof b.photo === "string" ? b.photo : "";
      if (!selfie.startsWith("data:image/") || selfie.length > 350000) return reply(context, 400, { ok: false, error: "Cần chụp ảnh khuôn mặt bằng camera để đối chiếu." });
      // Ảnh đã lưu của chủ hồ sơ: ảnh của bài này trước, rồi các bài khác cùng mã nhân viên (mới nhất trước)
      const refs = [];
      if (attempt.photo) refs.push(attempt.photo);
      const rows = (await quiz.getIndex()).filter((r) => quiz.normCode(r.code) === quiz.normCode(attempt.code) && r.id !== attempt.id).sort((a, c) => (c.startedAt || 0) - (a.startedAt || 0)).slice(0, 4);
      for (const r of rows) { if (refs.length >= 3) break; const a2 = await quiz.getAttempt(r.id); if (a2 && a2.photo) refs.push(a2.photo); }
      const cmp = await facecheck.compare(selfie, refs);
      if (!cmp.ok) {
        if (cmp.code !== "unavailable") quiz.noteFail(req);
        await logView(req, attempt, "denied", "face:" + cmp.code, cmp.result && cmp.result.reason);
        return reply(context, cmp.code === "unavailable" ? 503 : 403, { ok: false, error: cmp.message });
      }
      if (prof && !onFile) { prof.phone = phone; await quiz.saveCandidates(cands); } // hồ sơ chưa có số: lưu số vừa nhập sau khi khuôn mặt khớp
      await logView(req, attempt, "ok", "face:ok", cmp.result && cmp.result.reason);
    }

    if (master) {
      await auditlog.write({ area: "admin", role: "admin", by: String(adminU.email).toLowerCase(), name: adminU.name || "", op: "viewPaper", label: "Xem đề như thí sinh", kind: "read", status: 200, ok: true,
        details: { code: attempt.code, name: attempt.name, attempt: attempt.id }, ip: device.ipOf(req) });
    }
    return reply(context, 200, {
      ok: true,
      title: attempt.examTitle || settings.examTitle || "Bài kiểm tra",
      name: attempt.name || "", code: attempt.code || "",
      score: attempt.score, total: attempt.total, pct: attempt.pct,
      paper: paper.map((q) => ({ n: q.n, text: cleanText(q.text), category: q.category, options: cleanList(q.options), chosen: q.chosen, correct: q.correct, chosenList: q.chosenList, correctList: q.correctList, ok: q.ok, answerText: cleanText(q.answerText), chosenText: cleanText(q.chosenText), type: q.type }))
    });
  } catch (e) {
    context.log.error("kt-mypaper", e && e.message);
    return reply(context, 500, { ok: false, error: "Có lỗi xảy ra, thử lại sau." });
  }
};
