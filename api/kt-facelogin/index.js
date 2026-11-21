// ĐĂNG NHẬP BẰNG KHUÔN MẶT: nhân viên đã có dữ liệu khuôn mặt trên hệ thống chỉ cần quét mặt, không phải gõ mã NV + email.
// Máy chủ chỉ trả về mã NV + email của người được nhận diện; trình duyệt dùng chính hai giá trị đó đi tiếp đường /api/kt-check như
// khi nhập tay, nên mọi kiểm tra phía sau (đề có mở không, có thuộc đối tượng không, số lần làm...) giữ nguyên.
// Không nhận diện được (lần đầu chưa có dữ liệu, mặt thay đổi nhiều, kết quả mập mờ...) -> trả "notFound", giao diện quay về nhập tay.
// Các lớp bảo vệ:
//   (1) ảnh phải chụp trực tiếp và PHẢI do AI máy chủ xác nhận (không có AI xác nhận thì từ chối, không "cho qua" như các nơi khác);
//   (2) đúng một khuôn mặt, nhận diện 1-N với ngưỡng chặt + yêu cầu cách xa người giống thứ hai (facegallery);
//   (3) chỉ nhân viên còn trong danh sách và chưa nghỉ; (4) giới hạn số lần thử theo IP; (5) ghi nhật ký mọi lần (không lưu ảnh).
// Tắt nhanh bằng biến môi trường FACE_LOGIN=off.
const _http = require("../_lib/http");
const { guardConfigured, requireAjax } = _http;
const __reply = (ctx, status, body) => _http.reply(ctx, status, require("../_lib/profile").stripProfile(body));
const quiz = require("../_lib/quiz");
const auditlog = require("../_lib/auditlog");
const device = require("../_lib/device");
const facecheck = require("../_lib/facecheck");
const facematch = require("../_lib/facematch");
const gallery = require("../_lib/facegallery");

const NOT_FOUND = "Chưa nhận diện được bạn bằng khuôn mặt. Nếu đây là lần đầu hoặc diện mạo thay đổi nhiều, hãy nhập mã nhân viên và email để vào hệ thống.";

async function log(req, who, ok, why, detail) {
  try {
    await auditlog.write({ area: "verify", role: "candidate", by: String(who && who.code || "").toLowerCase(), name: (who && who.name) || "", op: "faceLogin", label: "Đăng nhập bằng khuôn mặt",
      kind: ok ? "read" : "denied", status: ok ? 200 : 403, ok, details: { result: why, note: detail || "" }, ip: device.ipOf(req) });
  } catch (e) { /* không chặn luồng chính */ }
}

module.exports = async function (context, req) {
  const reply = require("../_lib/entrylog").wrap(req, "check", __reply);
  try {
    if (process.env.FACE_LOGIN === "off") return reply(context, 404, { ok: false, off: true, error: "Đăng nhập bằng khuôn mặt đang tắt. Hãy nhập mã nhân viên và email." });
    if (guardConfigured(context)) return;
    if (req.method !== "POST") return reply(context, 405, { ok: false, error: "Phương thức không hợp lệ." });
    if (!requireAjax(context, req)) return;
    if (quiz.tooManyFails(req, 6, 10 * 60 * 1000)) return reply(context, 429, { ok: false, error: "Bạn đã thử quá nhiều lần. Vui lòng đợi vài phút hoặc nhập mã nhân viên và email." });

    const b = req.body || {};
    const photo = typeof b.photo === "string" ? b.photo : "";
    if (!/^data:image\/jpe?g;base64,/i.test(photo) || photo.length > 350000) return reply(context, 400, { ok: false, error: "Cần quét khuôn mặt bằng camera để đăng nhập." });

    // 1) Chụp trực tiếp, đúng một người. AI nhìn ảnh (nếu trả lời) có quyền TỪ CHỐI (không thấy mặt / nhiều người / nghi chụp lại màn hình).
    const live = await facecheck.verify(photo, b.face, "", "dang-nhap-khuon-mat");
    if (!live.allow) { quiz.noteFail(req); await log(req, null, false, "live", live.message); return reply(context, 403, { ok: false, error: live.message }); }
    const by = live.record && live.record.by, aiOk = by === "azure" || by === "groq";

    // 1b) Thử thách sống (nhìn thẳng, quay trái, quay phải) là lớp chống ảnh giả CHÍNH và không phụ thuộc dịch vụ AI bên ngoài.
    //     Đăng nhập bằng khuôn mặt chặt hơn: chế độ "soft" cũng không được bỏ qua. Chỉ khi thử thách bị tắt (off) mới BẮT BUỘC AI xác nhận.
    const fl = require("../_lib/facelive");
    if (fl.mode() !== "off") {
      const lv = await fl.verify(b.live, photo);
      if (!lv.ok) { quiz.noteFail(req); await log(req, null, false, "liveness:" + lv.code); return reply(context, lv.unavailable ? 503 : 403, { ok: false, liveFailed: true, error: lv.message }); }
    } else if (!aiOk) {
      await log(req, null, false, "live:unverified");
      return reply(context, 503, { ok: false, unavailable: true, error: "Hệ thống chưa thể xác nhận ảnh chụp trực tiếp lúc này. Hãy nhập mã nhân viên và email để vào hệ thống." });
    }

    // 2) Dấu vân khuôn mặt của người đang quét, rồi tìm trong thư viện
    let me;
    try { me = await facematch.describe(photo); } catch (e) { return reply(context, 503, { ok: false, unavailable: true, error: "Hệ thống nhận diện khuôn mặt tạm thời không khả dụng. Hãy nhập mã nhân viên và email." }); }
    if (me.n === 0) { quiz.noteFail(req); await log(req, null, false, "noface"); return reply(context, 403, { ok: false, error: "Không thấy khuôn mặt trong ảnh. Hãy nhìn thẳng camera, đủ sáng rồi quét lại." }); }
    if (me.n > 1) { quiz.noteFail(req); await log(req, null, false, "multi"); return reply(context, 403, { ok: false, error: "Ảnh có nhiều hơn một người. Chỉ người đăng nhập được có mặt trong ảnh." }); }
    const id = await gallery.identify(me.desc);
    if (!id.ok) {
      quiz.noteFail(req);
      await log(req, null, false, "id:" + id.reason, id.distance != null ? "khoảng cách " + id.distance.toFixed(3) : "");
      return reply(context, 404, { ok: false, notFound: true, error: NOT_FOUND }); // cùng một thông báo cho mọi lý do: không tiết lộ ai có / không có dữ liệu
    }

    // 3) Người được nhận diện phải còn trong danh sách và chưa nghỉ
    const c = (await quiz.getCandidates()).find((x) => quiz.normCode(x.code) === id.code) || (await quiz.findTestByCode(id.code)); // thí sinh hoặc tài khoản thử nghiệm
    if (!c || quiz.isLeft(c) || !c.email) {
      quiz.noteFail(req);
      await log(req, { code: id.code }, false, "id:inactive");
      return reply(context, 404, { ok: false, notFound: true, error: NOT_FOUND });
    }
    await log(req, c, true, "ok", "khoảng cách " + id.distance.toFixed(3) + (id.second != null ? " · người thứ hai " + id.second.toFixed(3) : "") + (aiOk ? "" : " · AI nhìn ảnh không trả lời, dựa vào thử thách quay mặt"));
    return reply(context, 200, { ok: true, code: c.code, email: c.email, name: c.name || "" });
  } catch (e) {
    context.log.error("kt-facelogin", e && e.message);
    return reply(context, 500, { ok: false, error: "Có lỗi xảy ra. Hãy nhập mã nhân viên và email để vào hệ thống." });
  }
};
