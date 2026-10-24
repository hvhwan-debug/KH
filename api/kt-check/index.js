// Công khai, không cần đăng nhập: thí sinh nhập mã nhân viên + email để vào bài kiểm tra.
// Trả về: thông tin thí sinh, thể lệ bài thi, và trạng thái (chưa làm / đang làm dở / đã hoàn thành).
const { reply, guardConfigured, requireAjax } = require("../_lib/http");
const quiz = require("../_lib/quiz");
const advicelib = require("../_lib/advice");

module.exports = async function (context, req) {
  try {
    if (guardConfigured(context)) return;
    if (req.method !== "POST") return reply(context, 405, { ok: false, error: "Phương thức không hợp lệ." });
    if (!requireAjax(context, req)) return;
    if (quiz.tooManyFails(req, 8, 10 * 60 * 1000)) {
      return reply(context, 429, { ok: false, error: "Bạn đã thử quá nhiều lần. Vui lòng đợi vài phút rồi thử lại." });
    }
    const b = req.body || {};
    const code = quiz.normCode(b.code);
    const email = quiz.normEmail(b.email);
    if (!code || !email) return reply(context, 400, { ok: false, error: "Nhập đầy đủ mã nhân viên và email." });

    const candidates = await quiz.getCandidates();
    const found = candidates.find((c) => quiz.normCode(c.code) === code && quiz.normEmail(c.email) === email);
    if (!found) {
      quiz.noteFail(req);
      return reply(context, 404, { ok: false, error: "Không tìm thấy thông tin khớp với mã nhân viên và email đã nhập. Kiểm tra lại hoặc liên hệ quản trị viên." });
    }

    const defaultSettings = await quiz.getSettings();
    const examId = String(b.examId || (req.query && req.query.exam) || "").trim();
    if (!examId) return reply(context, 400, { ok: false, needExam: true, error: "Vui lòng nhập mã đề thi hoặc mở đường link của đề.", serverNow: Date.now() });
    if (!(await quiz.examKnown(examId, defaultSettings))) {
      quiz.noteFail(req);
      return reply(context, 404, { ok: false, error: "Không tìm thấy đề thi này. Hãy kiểm tra lại đường link hoặc liên hệ quản trị viên." });
    }
    const settings = await quiz.getExamSettings(examId);
    const candidate = { code: found.code, name: found.name, email: found.email, manager: found.manager || "", phone: require("../_lib/phone").normPhone(found.phone), segment: quiz.normSegment(found.segment), title: quiz.titleOf(found),
      province: require("../_lib/provinces").canonProvince(found.province) || "", region: quiz.normRegion(found.region) };
    // PC chưa có tỉnh/miền: phải chọn ở màn xác nhận trước khi làm bài (miền quyết định bộ đề sản phẩm)
    candidate.needRegion = quiz.needsRegion(found) && !(candidate.province && candidate.region);
    const pendingRequest = (await require("../_lib/changereq").getAll()).some((r) => r.status === "pending" && quiz.normCode(r.code) === code);
    // Khung thời gian mở/đóng + đối tượng được thi (chỉ áp dụng cho đề thi có cấu hình các mục này)
    const denied = quiz.examAccessError(settings, found, Date.now());
    if (denied) return reply(context, 403, { ok: false, error: denied });
    const exam = {
      id: examId,
      title: settings.examTitle,
      shareTitle: String(settings.shareTitle || "").trim() || settings.examTitle,
      questionCount: quiz.countFor(settings, found.segment, found.region),
      secondsPerQuestion: Math.max(10, settings.secondsPerQuestion || 60),
      passScore: quiz.passScoreOf(settings),
      practice: !!settings.practice,
      maxAttempts: quiz.attemptLimit(settings) === Infinity ? 0 : quiz.attemptLimit(settings) // 0 = không giới hạn
    };
    const idxAll = await quiz.getIndex();
    const subs = quiz.submittedOf(idxAll, code, settings.examPeriod);
    const limit = quiz.attemptLimit(settings);

    const active0 = await quiz.activeForPeriod(found.code, settings.examPeriod);
    if (subs.length >= limit && !active0) {
      const idx = idxAll;
      let prior = null; subs.forEach((a) => { if (quiz.betterResult(a, prior)) prior = a; }); // hết lượt: hiện kết quả CAO NHẤT
      if (prior) {
        let adv = null;
        try { const pa = await quiz.getAttempt(prior.id); if (pa) { const pv = quiz.previousResult(idx, pa.code, pa.period, pa.id); adv = advicelib.ensureAnalysis(pa.advice || advicelib.rulesAdvice(advicelib.facts(pa, settings, pv)), pa, settings, pv); } } catch (e) { adv = null; }
        return reply(context, 200, {
          ok: true, candidate, exam, pendingRequest, alreadyDone: true,
          result: {
            score: prior.score, total: prior.total, pct: prior.pct, passed: quiz.passState(prior.pct, settings),
            compliancePoints: prior.compliancePoints, submittedAt: prior.submittedAt,
            mailOk: prior.mailOk, passScore: exam.passScore, durationSec: prior.durationSec,
            startedAt: prior.startedAt, wrong: prior.wrong, blank: prior.blank, proof: quiz.proofCode(prior.id), verify: quiz.verifyToken(prior.id), advice: adv
          },
          serverNow: Date.now()
        });
      }
    }

    // Bài làm đang dở: cho phép làm tiếp (thời gian vẫn tính theo máy chủ).
    let inProgress = null;
    const active = await quiz.activeForPeriod(found.code, settings.examPeriod);
    if (active) {
      quiz.syncAttempt(active, Date.now());
      inProgress = { answered: Math.min(active.cursor, active.questionIds.length), total: active.questionIds.length };
    }
    // Đã làm nhưng còn lượt: báo số lượt đã dùng + kết quả lần gần nhất
    let best = null; subs.forEach((a) => { if (quiz.betterResult(a, best)) best = a; });
    const attempts = subs.length ? { used: subs.length, max: exam.maxAttempts, best: best ? { score: best.score, total: best.total, pct: best.pct, submittedAt: best.submittedAt } : null } : null;
    return reply(context, 200, { ok: true, candidate, exam, pendingRequest, inProgress, attempts, examTitle: settings.examTitle, serverNow: Date.now() });
  } catch (e) {
    context.log.error("kt-check", e && e.message);
    return reply(context, 500, { ok: false, error: "Có lỗi xảy ra, thử lại sau." });
  }
};
