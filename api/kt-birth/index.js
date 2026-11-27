// Nhân viên tự khai ngày, tháng, năm sinh (để chúc mừng sinh nhật). Chỉ nhận kèm "vé" do máy chủ phát sau khi đã nhận diện đúng người
// (xem _lib/birthask.js). Chỉ điền chỗ còn thiếu: ngày sinh đã khai đủ năm thì không ghi đè qua đường này.
const { reply, guardConfigured, requireAjax } = require("../_lib/http");

const handler = async function (context, req) {
  try {
    if (guardConfigured(context)) return;
    if (!requireAjax(context, req)) return;
    const quiz = require("../_lib/quiz"), BA = require("../_lib/birthask");
    if (quiz.tooManyFails(req, 8, 10 * 60 * 1000)) return reply(context, 429, { ok: false, error: "Bạn đã thử quá nhiều lần. Vui lòng đợi vài phút rồi thử lại." });
    const b = req.body || {};
    const code = BA.codeOf(b.tok);
    if (!code) { quiz.noteFail(req); return reply(context, 401, { ok: false, expired: true, error: "Phiên xác thực đã hết hạn. Vui lòng mở lại trang rồi khai ngày sinh." }); }
    const bd = quiz.normBirthDate(b.birth, true);
    if (!bd) return reply(context, 400, { ok: false, error: "Vui lòng nhập đầy đủ ngày, tháng và năm sinh hợp lệ." });
    const k = quiz.normCode(code), list = await quiz.getCandidates();
    const found = list.find((c) => quiz.normCode(c.code) === k) || null, test = found ? null : await quiz.findTestByCode(k);
    const who = found || test;
    if (!who) return reply(context, 404, { ok: false, error: "Không tìm thấy hồ sơ." });
    if (quiz.hasBirthYear(who.birthDate)) return reply(context, 200, { ok: true, already: true });
    if (found) { found.birthDate = bd; await quiz.saveCandidates(list); } else await quiz.updateTestAccount(who.code, { birthDate: bd });
    try { // ghi nhật ký (không ghi ngày sinh vào nhật ký)
      await require("../_lib/auditlog").write({ area: "verify", role: "candidate", by: who.code, name: who.name || "", op: "setBirthDate", label: "Nhân viên tự khai ngày sinh", kind: "write", status: 200, ok: true, details: { code: who.code }, ip: require("../_lib/device").ipOf(req) });
    } catch (e) { /* không chặn */ }
    return reply(context, 200, { ok: true });
  } catch (e) {
    context.log.error("kt-birth", e && e.message);
    return reply(context, 500, { ok: false, error: "Không lưu được. Thử lại sau." });
  }
};

// Thông tin nhân viên tự cập nhật ở đây được ghi vào lịch sử thay đổi của chính họ (xem _lib/personlog.js)
module.exports = require("../_lib/personlog").bind(handler, { by: "self", byName: "Nhân viên (tự nhập ngày sinh)", role: "self" });
