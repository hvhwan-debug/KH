// Công khai: xác nhận người mở khảo sát "nhân sự được gán" bằng mã nhân viên + email trong Hồ sơ học tập
// (giống bài kiểm tra). Trả họ tên và cho biết đã trả lời chưa. Quyền thật sự vẫn được kiểm lại khi gửi phiếu.
const { reply, guardConfigured, requireAjax } = require("../_lib/http");
const store = require("../_lib/store");
const quiz = require("../_lib/quiz");
const ks = require("../_lib/survey");

module.exports = async function (context, req) {
  try {
    if (guardConfigured(context)) return;
    if (req.method !== "POST") return reply(context, 405, { ok: false, error: "Phương thức không hợp lệ." });
    if (!requireAjax(context, req)) return;
    if (quiz.tooManyFails(req, 8, 10 * 60 * 1000)) return reply(context, 429, { ok: false, error: "Bạn đã thử quá nhiều lần. Vui lòng đợi vài phút rồi thử lại." });
    const b = req.body || {};
    const s = await ks.getSurvey(String(b.code || "").trim().toLowerCase());
    if (!s || s.identity !== "roster") return reply(context, 404, { ok: false, error: "Không tìm thấy phiếu khảo sát này." });
    const st = ks.state(s);
    if (st === "notyet") return reply(context, 400, { ok: false, error: "Khảo sát chưa mở." });
    if (st === "closed") return reply(context, 400, { ok: false, error: "Khảo sát đã đóng." });

    const found = await ks.identify(b.empId, b.email);
    if (!found) { quiz.noteFail(req); return reply(context, 404, { ok: false, error: "Không tìm thấy nhân viên có mã và email này. Hãy kiểm tra lại hoặc liên hệ quản trị viên." }); }
    if (quiz.isLeft(found)) return reply(context, 403, { ok: false, error: "Tài khoản này đã được đánh dấu nghỉ việc nên không thể tham gia khảo sát." });
    if (!ks.inAudience(s.audience, found)) return reply(context, 403, { ok: false, error: "Bạn không nằm trong danh sách nhân sự được mời tham gia khảo sát này." });
    const done = !!(await store.get(ks.respPrefix(s.code) + ks.respId(found.code) + ".json"));
    return reply(context, 200, { ok: true, name: found.name || "", done });
  } catch (e) {
    context.log.error(e);
    return reply(context, 500, { ok: false, error: "Lỗi máy chủ." });
  }
};
