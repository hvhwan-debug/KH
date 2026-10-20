// Công khai: tạo bài làm mới, trộn đề từ ngân hàng câu hỏi + trộn thứ tự đáp án cho từng thí sinh.
const { reply, guardConfigured, requireAjax } = require("../_lib/http");
const quiz = require("../_lib/quiz");

module.exports = async function (context, req) {
  try {
    if (guardConfigured(context)) return;
    if (req.method !== "POST") return reply(context, 405, { ok: false, error: "Phương thức không hợp lệ." });
    if (!requireAjax(context, req)) return;
    const b = req.body || {};
    const code = quiz.normCode(b.code);
    const email = quiz.normEmail(b.email);
    if (!code || !email) return reply(context, 400, { ok: false, error: "Thiếu thông tin thí sinh." });

    const candidates = await quiz.getCandidates();
    const found = candidates.find((c) => quiz.normCode(c.code) === code && quiz.normEmail(c.email) === email);
    if (!found) return reply(context, 404, { ok: false, error: "Không tìm thấy thí sinh." });

    const settings = await quiz.getSettings();
    if (!settings.allowRetake) {
      const idx = await quiz.getIndex();
      const prior = idx.find((a) => quiz.normCode(a.code) === code && a.status === "submitted");
      if (prior) return reply(context, 409, { ok: false, error: "Bạn đã hoàn thành bài kiểm tra này rồi." });
    }

    const activeQuestions = (await quiz.getQuestions()).filter((q) => q.active !== false && q.text && Array.isArray(q.options) && q.options.length >= 2);
    // Nhóm ngành của thí sinh quyết định trộn đề từ nhóm câu hỏi nào: bán cả 2 ngành -> toàn bộ ngân hàng;
    // chỉ bán 1 ngành -> chỉ lấy câu hỏi được gắn đúng danh mục ngành đó.
    const segment = quiz.normSegment(found.segment);
    const wantCategory = quiz.CATEGORY_BY_SEGMENT[segment];
    const all = wantCategory ? activeQuestions.filter((q) => q.category === wantCategory) : activeQuestions;
    if (!all.length) return reply(context, 503, { ok: false, error: "Ngân hàng đề chưa có câu hỏi phù hợp với nhóm ngành của bạn, liên hệ quản trị viên." });

    const n = Math.min(settings.questionCount || all.length, all.length);
    const picked = quiz.shuffle(all).slice(0, n);
    const id = quiz.genId();
    const now = Date.now();

    const questionIds = [];
    const orders = {};
    const clientQuestions = picked.map((q) => {
      questionIds.push(q.id);
      const order = quiz.shuffle(q.options.map((_, i) => i)); // order[vị trí hiển thị] = chỉ số gốc
      orders[q.id] = order;
      return { id: q.id, text: q.text, options: order.map((i) => q.options[i]) };
    });

    const secondsPerQuestion = Math.max(10, settings.secondsPerQuestion || 60);
    const attempt = {
      id, code: found.code, name: found.name, email: found.email, manager: found.manager || "", segment,
      questionIds, orders,
      answers: {},
      startedAt: now,
      deadlineAt: now + n * secondsPerQuestion * 1000 + 15000, // dự phòng 15s cho độ trễ mạng
      secondsPerQuestion,
      status: "in_progress"
    };
    await quiz.putAttempt(attempt);

    return reply(context, 200, {
      ok: true,
      attemptId: id,
      secondsPerQuestion,
      examTitle: settings.examTitle,
      questions: clientQuestions
    });
  } catch (e) {
    context.log.error("kt-start", e && e.message);
    return reply(context, 500, { ok: false, error: "Có lỗi xảy ra, thử lại sau." });
  }
};
