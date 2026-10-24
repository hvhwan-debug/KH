// Công khai: bắt đầu (hoặc LÀM TIẾP) bài kiểm tra. Mỗi thí sinh chỉ có một bài đang dở tại một thời điểm.
// Đề được trộn riêng cho từng thí sinh; máy chủ chỉ gửi MỘT câu hỏi mỗi lần và tự tính giờ từng câu.
const { reply, guardConfigured, requireAjax } = require("../_lib/http");
const quiz = require("../_lib/quiz");
const device = require("../_lib/device");

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
    if (!code || !email) return reply(context, 400, { ok: false, error: "Thiếu thông tin thí sinh." });
    // Ảnh xác nhận (chụp trước khi làm bài): giới hạn kích thước để tránh bài làm phình quá to.
    let photo = typeof b.photo === "string" ? b.photo : "";
    if (photo && (!photo.startsWith("data:image/") || photo.length > 350000)) photo = "";

    const candidates = await quiz.getCandidates();
    const found = candidates.find((c) => quiz.normCode(c.code) === code && quiz.normEmail(c.email) === email);
    if (!found) { quiz.noteFail(req); return reply(context, 404, { ok: false, error: "Không tìm thấy thí sinh." }); }

    const defaultSettings = await quiz.getSettings();
    const examId = String(b.examId || (req.query && req.query.exam) || defaultSettings.examPeriod);
    if (!(await quiz.examKnown(examId, defaultSettings))) {
      quiz.noteFail(req);
      return reply(context, 404, { ok: false, error: "Không tìm thấy đề thi này. Hãy kiểm tra lại đường link hoặc liên hệ quản trị viên." });
    }
    const settings = await quiz.getExamSettings(examId);
    // Bài đang dở vẫn được làm tiếp kể cả khi đã quá giờ đóng đề; chỉ chặn khi bắt đầu bài mới.
    const hasActive = !!(await quiz.activeForPeriod(found.code, settings.examPeriod));
    if (!hasActive) {
      const denied = quiz.examAccessError(settings, found, Date.now());
      if (denied) return reply(context, 403, { ok: false, error: denied });
    }
    if (!settings.allowRetake) {
      const idx = await quiz.getIndex();
      const prior = idx.find((a) => quiz.normCode(a.code) === code && a.status === "submitted" && (a.period || "") === settings.examPeriod);
      if (prior) return reply(context, 409, { ok: false, error: "Bạn đã hoàn thành bài kiểm tra này rồi." });
    }

    // Bắt buộc có số điện thoại / Zalo: chưa có trong hồ sơ thì phải nhập (và được lưu lại vào hồ sơ thí sinh)
    const { normPhone } = require("../_lib/phone");
    if (!normPhone(found.phone)) {
      const np = normPhone(b.phone);
      if (!np) return reply(context, 400, { ok: false, needPhone: true, error: "Vui lòng nhập số điện thoại hoặc Zalo của bạn (10 số, ví dụ 0912345678)." });
      found.phone = np;
      await quiz.saveCandidates(candidates);
    }

    await quiz.ensureBankPeriods();
    const allQuestions = await quiz.getQuestions();
    const byId = {};
    allQuestions.forEach((q) => { byId[q.id] = q; });
    const now = Date.now();

    // 1) Có bài đang dở -> làm tiếp, KHÔNG tạo đề mới.
    let attempt = await quiz.activeForPeriod(found.code, settings.examPeriod); // bài dở của kỳ cũ không được làm tiếp
    let resumed = !!attempt;

    // 2) Chưa có -> tạo đề mới. Bắt buộc có ảnh xác nhận trước khi tạo đề (không áp dụng khi làm tiếp bài đang dở).
    if (!attempt) {
      if (!photo) return reply(context, 400, { ok: false, error: "Cần chụp ảnh xác nhận trước khi bắt đầu làm bài." });
      // AI kiểm tra ảnh có đúng một khuôn mặt người; không đạt -> không cho vào làm bài
      var faceCheck = null;
      if (process.env.FACE_CHECK !== "off") {
        const fc = await require("../_lib/facecheck").verify(photo, b.face, found.code, settings.examPeriod);
        faceCheck = fc.record;
        if (!fc.allow) return reply(context, 422, { ok: false, faceRejected: true, error: fc.message });
      }
      const segment = quiz.normSegment(found.segment);
      // Phân bổ đề: dùng DUY NHẤT quiz.planExam (khống chế số câu, trần cứng, không bao giờ phát cả ngân hàng)
      const plan = quiz.planExam(allQuestions, settings, segment);
      if (plan.error || !plan.picked.length) return reply(context, 503, { ok: false, error: (plan.error || "Chưa có câu hỏi phù hợp để tạo đề.") + " Liên hệ quản trị viên." });
      const picked = plan.picked;
      if (plan.short) (context.log.warn || context.log)("kt-start: de thieu cau", settings.examPeriod, segment, plan.picked.length + "/" + plan.target);
      const orders = {};
      picked.forEach((q) => { orders[q.id] = quiz.shuffle(q.options.map((_, i) => i)); }); // order[vị trí hiển thị] = chỉ số gốc
      attempt = {
        id: quiz.genId(), code: found.code, name: found.name, email: found.email, phone: normPhone(found.phone), manager: found.manager || "", segment,
        period: settings.examPeriod,
        questionIds: picked.map((q) => q.id), orders,
        answers: {},
        photo, faceCheck,
        startedAt: now,
        secondsPerQuestion: Math.max(10, settings.secondsPerQuestion || 60),
        cursor: 0, qStartedAt: now,
        status: "in_progress"
      };
    } else {
      quiz.syncAttempt(attempt, now);
    }
    // Ghi thiết bị đang dùng (bắt đầu / làm tiếp) để quản lí đối chiếu; đổi máy giữa chừng sẽ được đánh dấu.
    try { device.record(attempt, device.capture(req, b.device, resumed ? "resume" : "start")); } catch (e) { (context.log.warn || context.log)("kt-start device", e && e.message); }

    const cs = quiz.clientState(attempt, byId, now);
    await quiz.putAttempt(attempt);
    if (!resumed) await quiz.setActive(found.code, attempt.id);

    return reply(context, 200, Object.assign({ ok: true, attemptId: attempt.id, resumed, examTitle: settings.examTitle }, cs.state));
  } catch (e) {
    context.log.error("kt-start", e && e.message);
    return reply(context, 500, { ok: false, error: "Có lỗi xảy ra, thử lại sau." });
  }
};
