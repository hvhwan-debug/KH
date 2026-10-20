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

    const settings = await quiz.getSettings();
    if (!settings.allowRetake) {
      const idx = await quiz.getIndex();
      const prior = idx.find((a) => quiz.normCode(a.code) === code && a.status === "submitted" && (a.period || "") === settings.examPeriod);
      if (prior) return reply(context, 409, { ok: false, error: "Bạn đã hoàn thành bài kiểm tra này rồi." });
    }

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
      const activeQuestions = allQuestions.filter((q) => q.active !== false && q.text && Array.isArray(q.options) && q.options.length >= 2);
      // Nhóm ngành quyết định đề trộn từ nhóm câu hỏi nào:
      // - bán 1 ngành -> chỉ lấy câu thuộc danh mục ngành đó.
      // - bán cả 2 ngành -> số câu "Gia dụng" cố định, phần còn lại lấy từ mọi danh mục khác.
      const segment = quiz.normSegment(found.segment);
      const wantCategory = quiz.CATEGORY_BY_SEGMENT[segment];
      const total = settings.questionCount || activeQuestions.length;
      let picked;
      if (wantCategory) {
        const pool = activeQuestions.filter((q) => q.category === wantCategory);
        if (!pool.length) return reply(context, 503, { ok: false, error: "Ngân hàng đề chưa có câu hỏi phù hợp với nhóm ngành của bạn, liên hệ quản trị viên." });
        picked = quiz.shuffle(pool).slice(0, Math.min(total, pool.length));
      } else {
        const giaDungPool = activeQuestions.filter((q) => q.category === "Gia dụng");
        const otherPool = activeQuestions.filter((q) => q.category !== "Gia dụng");
        if (!giaDungPool.length && !otherPool.length) return reply(context, 503, { ok: false, error: "Ngân hàng đề chưa có câu hỏi, liên hệ quản trị viên." });
        const giaDungN = Math.min(settings.bothGiaDungCount || 0, giaDungPool.length);
        const otherN = Math.min(Math.max(total - giaDungN, 0), otherPool.length);
        picked = quiz.shuffle(quiz.shuffle(giaDungPool).slice(0, giaDungN).concat(quiz.shuffle(otherPool).slice(0, otherN)));
      }
      if (!picked.length) return reply(context, 503, { ok: false, error: "Chưa có câu hỏi nào phù hợp để tạo đề (kiểm tra ngân hàng đề và cài đặt số câu), liên hệ quản trị viên." });
      const orders = {};
      picked.forEach((q) => { orders[q.id] = quiz.shuffle(q.options.map((_, i) => i)); }); // order[vị trí hiển thị] = chỉ số gốc
      attempt = {
        id: quiz.genId(), code: found.code, name: found.name, email: found.email, manager: found.manager || "", segment,
        period: settings.examPeriod,
        questionIds: picked.map((q) => q.id), orders,
        answers: {},
        photo,
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
