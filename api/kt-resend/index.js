// Công khai: thí sinh đã nộp bài bấm "Gửi lại email xác nhận". Chỉ gửi tới email đã đăng ký của chính thí sinh đó.
const { reply, guardConfigured, requireAjax } = require("../_lib/http");
const quiz = require("../_lib/quiz");
const resultmail = require("../_lib/resultmail");
const advicelib = require("../_lib/advice");

const COOLDOWN_MS = 60 * 1000; // giãn cách giữa 2 lần gửi
const MAX_RESENDS = 5;         // tối đa số lần gửi lại cho mỗi bài làm

function maskEmail(e) {
  const [u, d] = String(e || "").split("@");
  if (!d) return "email của bạn";
  return (u.charAt(0) || "") + "***@" + d;
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
    const code = quiz.normCode(b.code), email = quiz.normEmail(b.email);
    if (!code || !email) return reply(context, 400, { ok: false, error: "Thiếu thông tin thí sinh." });

    const found = (await quiz.getCandidates()).find((c) => quiz.normCode(c.code) === code && quiz.normEmail(c.email) === email);
    if (!found) { quiz.noteFail(req); return reply(context, 404, { ok: false, error: "Không tìm thấy thí sinh." }); }

    // Bài nộp MỚI NHẤT của thí sinh (trước đây lấy bài đầu tiên tìm thấy nên có thể gửi nhầm kỳ cũ)
    const prior = (await quiz.getIndex()).filter((a) => quiz.normCode(a.code) === code && a.status === "submitted").sort((x, y) => (y.submittedAt || 0) - (x.submittedAt || 0))[0];
    const attempt = prior && (await quiz.getAttempt(prior.id));
    if (!attempt || attempt.status !== "submitted") return reply(context, 404, { ok: false, error: "Chưa có bài làm đã nộp để gửi lại kết quả." });

    const now = Date.now();
    const sends = attempt.mailSends || 0;
    if (sends >= MAX_RESENDS) {
      return reply(context, 429, { ok: false, limit: true, error: "Bạn đã gửi lại quá số lần cho phép. Vui lòng liên hệ quản trị viên phụ trách." });
    }
    if (attempt.mailLastAt && now - attempt.mailLastAt < COOLDOWN_MS) {
      const wait = Math.ceil((COOLDOWN_MS - (now - attempt.mailLastAt)) / 1000);
      return reply(context, 429, { ok: false, retryAfterSec: wait, error: "Vui lòng đợi " + wait + " giây rồi gửi lại." });
    }

    const settings = await quiz.getExamSettings(attempt.period || ""); // cài đặt của ĐÚNG đề thí sinh đã làm (tiêu đề, thi thử...)
    // Email chỉ gồm điểm và lời khuyên (không kèm bản sao câu hỏi). Bài cũ chưa có lời khuyên thì dựng theo luật từ bản sao bài làm.
    const pv = quiz.previousResult(await quiz.getIndex(), attempt.code, attempt.period, attempt.id);
    const advice = advicelib.ensureAnalysis(attempt.advice || advicelib.rulesAdvice(advicelib.facts(attempt, settings, pv)), attempt, settings, pv);

    attempt.email = found.email; // gửi tới email hiện tại (có thể đã được quản lí chỉnh sửa)
    let mailOk = false;
    try { await resultmail.send(attempt, settings, advice); mailOk = true; }
    catch (e) { context.log.error("kt-resend mail", e && e.message); }

    attempt.mailSends = sends + 1; attempt.mailLastAt = now; attempt.mailOk = mailOk;
    await quiz.putAttempt(attempt);
    await quiz.upsertIndex(Object.assign({}, prior, { mailOk }));

    if (!mailOk) return reply(context, 502, { ok: false, error: "Hệ thống chưa gửi được email. Vui lòng thử lại sau ít phút hoặc liên hệ quản trị viên." });
    return reply(context, 200, {
      ok: true, to: maskEmail(attempt.email), retryAfterSec: COOLDOWN_MS / 1000, remaining: MAX_RESENDS - attempt.mailSends
    });
  } catch (e) {
    context.log.error("kt-resend", e && e.message);
    return reply(context, 500, { ok: false, error: "Có lỗi xảy ra, thử lại sau." });
  }
};
