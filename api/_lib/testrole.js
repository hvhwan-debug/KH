// Tài khoản thử nghiệm: người đang cầm trình duyệt có phải QUẢN TRỊ VIÊN đã đăng nhập không.
// Chỉ quản trị viên mới được chọn vai trò "Quản trị viên" và bỏ qua từng chức năng (vd quét khuôn mặt) khi thử đề; người dùng khác
// nhập mã + email của tài khoản thử nghiệm vẫn đi như thí sinh thường, không bỏ qua được gì.
const session = require("./session");
const { isAdmin } = require("./config");
function isAdminReq(req) {
  try { const u = session.userFromReq(req); return !!(u && u.email && isAdmin(u.email)); } catch (e) { return false; }
}
module.exports = { isAdminReq };
