// Chuẩn hoá và kiểm tra số điện thoại Việt Nam (10 số, bắt đầu bằng 0; chấp nhận +84 / 84 và khoảng trắng, dấu chấm, gạch nối).
// Trả về chuỗi 10 số dạng 0xxxxxxxxx, hoặc "" nếu không hợp lệ.
function normPhone(input) {
  let s = String(input == null ? "" : input).trim().slice(0, 30).replace(/[\s.\-()]/g, "");
  if (/^\+84/.test(s)) s = "0" + s.slice(3);
  else if (/^84\d{9}$/.test(s)) s = "0" + s.slice(2);
  return /^0[2-9]\d{8}$/.test(s) ? s : "";
}
module.exports = { normPhone };
