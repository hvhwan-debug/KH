// Chuẩn hoá và kiểm tra số điện thoại Việt Nam (10 số, bắt đầu bằng 0; chấp nhận +84 / 84 và khoảng trắng, dấu chấm, gạch nối).
// Trả về chuỗi 10 số dạng 0xxxxxxxxx, hoặc "" nếu không hợp lệ.
function normPhone(input) {
  let s = String(input == null ? "" : input).trim().slice(0, 30).replace(/[\s.\-()]/g, "");
  if (/^\+84/.test(s)) s = "0" + s.slice(3);
  else if (/^84\d{9}$/.test(s)) s = "0" + s.slice(2);
  return /^0[2-9]\d{8}$/.test(s) ? s : "";
}
// Họ và tên đầy đủ: tối thiểu 2 từ, chỉ gồm chữ cái (có dấu) và ' . -, mỗi từ bắt đầu bằng chữ cái, tổng cộng ít nhất 4 chữ cái.
// Trả về tên đã gộp khoảng trắng, hoặc "" nếu không hợp lệ (ví dụ "H", "hvhwan", "SR2", email, có chữ số).
function normName(input) {
  const s = String(input == null ? "" : input).replace(/\s+/g, " ").trim().slice(0, 80);
  if (!/^[\p{L}][\p{L}'.\-]*(?: [\p{L}][\p{L}'.\-]*)+$/u.test(s)) return "";
  return (s.match(/\p{L}/gu) || []).length >= 4 ? s : "";
}
module.exports = { normPhone, normName };
