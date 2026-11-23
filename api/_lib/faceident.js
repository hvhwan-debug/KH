// NHẬN DIỆN CHỈ BẰNG KHUÔN MẶT (không nhập mã nhân viên + email) cho các trang cần quét mặt để vào: tra cứu lịch sử, ...
// Cùng chuẩn với đăng nhập bằng khuôn mặt (kt-facelogin): ảnh chụp trực tiếp (AI loại ảnh chụp lại màn hình / ảnh in),
// đúng MỘT khuôn mặt, nhận diện 1-N trong thư viện với ngưỡng chặt + phải cách xa người giống thứ hai (facegallery).
// Trang gọi vẫn đối chiếu 1-1 với ảnh đã lưu của mã được nhận diện như trước (lớp kiểm tra thứ hai, có khoá + báo quản trị viên).
// Tắt: FACE_LOGIN=off (giao diện quay về nhập mã nhân viên + email).
const facecheck = require("./facecheck");
const facematch = require("./facematch");
const gallery = require("./facegallery");

const NOT_FOUND = "Chưa nhận diện được bạn bằng khuôn mặt. Nếu diện mạo thay đổi nhiều, hãy thử lại nơi đủ sáng, hoặc nhập mã nhân viên và email.";

const enabled = () => process.env.FACE_LOGIN !== "off";

// Trả { ok:true, code, id, live } hoặc { ok:false, status, why, body }
async function identify(selfie, purpose) {
  if (!enabled()) return { ok: false, status: 404, why: "off", body: { ok: false, off: true, needCode: true, error: "Nhận diện bằng khuôn mặt đang tắt. Hãy nhập mã nhân viên và email." } };
  if (typeof selfie !== "string" || !/^data:image\/jpe?g;base64,/i.test(selfie) || selfie.length > 350000) return { ok: false, status: 400, why: "photo", body: { ok: false, error: "Cần quét khuôn mặt bằng máy ảnh." } };
  const live = await facecheck.verify(selfie, null, "", purpose || "nhan-dien-khuon-mat");
  if (!live.allow) return { ok: false, status: 403, why: "live", fail: true, body: { ok: false, error: live.message } };
  let me;
  try { me = await facematch.describe(selfie); } catch (e) { return { ok: false, status: 503, why: "unavailable", body: { ok: false, unavailable: true, error: "Hệ thống nhận diện khuôn mặt tạm thời không khả dụng. Hãy thử lại sau ít phút hoặc nhập mã nhân viên và email." } }; }
  if (me.n === 0) return { ok: false, status: 403, why: "noface", fail: true, body: { ok: false, error: "Không thấy khuôn mặt trong ảnh. Hãy nhìn thẳng vào máy ảnh, đủ sáng rồi quét lại." } };
  if (me.n > 1) return { ok: false, status: 403, why: "multi", fail: true, body: { ok: false, error: "Ảnh có nhiều hơn một người. Chỉ một người được có mặt trong khung hình." } };
  const id = await gallery.identify(me.desc);
  if (!id.ok) return { ok: false, status: 404, why: "id:" + id.reason, fail: true, detail: id.distance != null ? "khoảng cách " + id.distance.toFixed(3) : "", body: { ok: false, notFound: true, error: NOT_FOUND } };
  return { ok: true, code: id.code, id, live };
}

module.exports = { identify, enabled, NOT_FOUND };
