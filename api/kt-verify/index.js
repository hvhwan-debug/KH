// Công khai: xem kết quả đã xác thực bằng mã trong QR trên thẻ kết quả.
// Chỉ trả những thông tin có sẵn trên thẻ (không có email, không có đáp án từng câu).
const { reply: __reply, guardConfigured } = require("../_lib/http");
const quiz = require("../_lib/quiz");

module.exports = async function (context, req) {
  const reply = require("../_lib/entrylog").wrap(req, "verify", __reply); // lỗi / lần vào không được -> nhật ký
  try {
    if (guardConfigured(context)) return;
    if (quiz.tooManyFails(req, 20, 10 * 60 * 1000)) {
      return reply(context, 429, { ok: false, error: "Bạn đã thử quá nhiều lần. Vui lòng đợi vài phút rồi thử lại." });
    }
    let id = quiz.checkVerifyToken(req.query && req.query.t);
    // Hoặc tra bằng mã minh chứng KT-XXXXXXXX in trên thẻ kết quả (không cần liên kết có chữ ký).
    // Mã này chỉ cho xem đúng những gì in trên thẻ; KHÔNG trả về token nên không mở được phần xem bài làm chi tiết.
    let byCode = false, codeBad = false;
    if (!id && req.query && req.query.c) {
      byCode = true;
      const m = /^KT-?([0-9A-Z]{8})$/.exec(String(req.query.c).trim().toUpperCase());
      if (m) {
        const want = "KT-" + m[1];
        const hit = (await quiz.getIndex()).filter((x) => x.status === "submitted" && String(x.proof || quiz.proofCode(x.id)).toUpperCase() === want);
        if (hit.length === 1) id = hit[0].id; else if (!hit.length && (id = await quiz.testAttemptByProof(want))) { /* bài của tài khoản thử nghiệm */ } else codeBad = true;
      } else codeBad = true;
    }
    const attempt = id ? await quiz.getAttempt(id) : null;
    if (!attempt || attempt.status !== "submitted") {
      quiz.noteFail(req);
      return reply(context, 404, { ok: false, error: byCode ? "Không tìm thấy kết quả với mã này. Kiểm tra lại mã KT-… trên thẻ kết quả." : "Không tìm thấy kết quả. Mã QR không hợp lệ hoặc đã bị chỉnh sửa." });
    }
    // Cài đặt của ĐÚNG đề thí sinh đã làm (tiêu đề, ngưỡng đạt, thi thử...), không phải cài đặt chung.
    const settings = await quiz.getExamSettings(attempt.period || "");
    // Cờ thi thử lưu cùng bài làm lúc nộp; bài cũ chưa có cờ thì theo cấu hình hiện tại của đề.
    const practice = attempt.practice != null ? !!attempt.practice : !!settings.practice;
    await require("../_lib/accesslog").write(req, { kind: "score", role: "public", attempt, via: byCode ? "Tra bằng mã " + quiz.proofCode(attempt.id) : "Liên kết / mã QR kết quả" });
    return reply(context, 200, {
      ok: true, serverNow: Date.now(),
      result: {
        title: attempt.examTitle || settings.examTitle || "Bài kiểm tra", practice,
        name: attempt.name || "", code: attempt.code || "",
        score: attempt.score, total: attempt.total, pct: attempt.pct, passed: quiz.passState(attempt.pct, settings),
        compliancePoints: attempt.compliancePoints, passScore: quiz.passScoreOf(settings),
        wrong: attempt.wrong, blank: attempt.blank,
        startedAt: attempt.startedAt, submittedAt: attempt.submittedAt,
        durationSec: Math.round(((attempt.submittedAt || 0) - (attempt.startedAt || attempt.submittedAt || 0)) / 1000),
        proof: quiz.proofCode(attempt.id)
      }
    });
  } catch (e) {
    context.log.error("kt-verify", e && e.message);
    return reply(context, 500, { ok: false, error: "Có lỗi xảy ra, thử lại sau." });
  }
};
