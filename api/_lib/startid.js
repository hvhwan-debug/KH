// Đối chiếu khuôn mặt LÚC BẮT ĐẦU LÀM BÀI với các lần làm bài trước của CHÍNH tài khoản đó (phát hiện người khác làm hộ ngay từ đầu).
// - Khuôn mặt khác (mismatch): ghi vào bài làm (attempt.faceId, hiện thành nhãn "Khuôn mặt khác các lần trước" trong trang quản trị)
//   và gửi email cảnh báo kèm ảnh các lần trước + ảnh người vừa bắt đầu. Mặc định KHÔNG chặn (như thiết kế của faceid.js).
// - Chưa có ảnh trước (first) hoặc không đủ dữ liệu: không cảnh báo. Quá thời gian chờ: bỏ qua, lượt quét sau khi nộp bài sẽ đối chiếu như cũ.
// FACE_IDENTITY = warn (mặc định: cảnh báo, vẫn cho làm bài) | block (chặn không cho bắt đầu làm bài) | off (tắt)
const faceid = require("./faceid");
const secalert = require("./securityalert");

function mode() { const m = String(process.env.FACE_IDENTITY || "warn").toLowerCase(); return m === "off" || m === "block" ? m : "warn"; }

// ctx: { req, photo, found, settings, attemptId, now, enrolOk }. Trả { mode, status, rec, faceDesc, block }
async function run(ctx) {
  const m = mode();
  if (m === "off" || !ctx.found || ctx.found.test) return { mode: m, status: null, block: false };
  const probe = { id: ctx.attemptId, code: ctx.found.code, startedAt: ctx.now, photo: ctx.photo }, out = {};
  let rec = null;
  try { rec = await faceid.checkWithin(probe, 12000, null, { enrol: ctx.enrolOk !== false, out }); } catch (e) { rec = null; }
  if (!rec) return { mode: m, status: null, block: false };
  if (rec.s === "mismatch") {
    try {
      await secalert.alertIdentity(ctx.req, { id: ctx.attemptId, code: ctx.found.code, name: ctx.found.name, manager: ctx.found.manager, examTitle: ctx.settings && ctx.settings.examTitle, period: ctx.settings && ctx.settings.examPeriod },
        { selfie: ctx.photo, refPhoto: out.refPhoto, distance: rec.d, threshold: rec.t, blocked: m === "block" });
    } catch (e) { /* không chặn luồng chính */ }
  }
  return { mode: m, status: rec.s, rec, faceDesc: probe.faceDesc, block: m === "block" && rec.s === "mismatch" };
}

module.exports = { run, mode };
