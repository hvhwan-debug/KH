// Câu hướng dẫn liên hệ hỗ trợ dùng chung cho các email gửi học viên.
// Không rõ tên quản lí thì bỏ phần "hoặc Quản lí: …" để câu vẫn tự nhiên.
function supportLine(manager) {
  const m = String(manager == null ? "" : manager).replace(/\s+/g, " ").trim().slice(0, 80);
  return "Nếu cần hỗ trợ, liên hệ ĐTKD Kênh GT" + (m ? " hoặc Quản lí: " + m : "") + " để được hỗ trợ.";
}
module.exports = { supportLine };
