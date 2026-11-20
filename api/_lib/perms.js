// Phân quyền chi tiết cho tài khoản QUẢN LÍ (viewer) do quản trị viên cấp.
// - Quản trị viên (ADMIN_EMAILS) luôn có TOÀN BỘ quyền, không phụ thuộc bảng này.
// - KHÔNG có quyền "xem ảnh thí sinh": ảnh chụp khuôn mặt khi làm bài chỉ quản trị viên xem được.
//   Quyền này cố tình không nằm trong danh mục nên không thể bật cho quản lí dù lưu dữ liệu thế nào.
const KEYS = [
  "viewResults",     // xem danh sách nhân viên trong phạm vi + kết quả, hồ sơ kiểm tra
  "viewPaper",       // xem lại bài làm chi tiết (từng câu) của nhân viên
  "viewAi",          // xem cảnh báo của AI và lịch sử làm bài (chẩn đoán hành vi, cờ bất thường)
  "editEmployees",   // thêm / sửa / xác nhận thông tin nhân viên trong phạm vi
  "deleteEmployees", // xoá nhân viên khỏi phạm vi của mình
  "manageExams",     // tạo đề và quản lí đề (câu hỏi, thời gian, đối tượng) do chính mình tạo
  "notify"           // gửi thông báo / nhắc làm bài cho nhân viên trong phạm vi
];

const LABELS = {
  viewResults: "Xem nhân viên & kết quả",
  viewPaper: "Xem bài làm chi tiết",
  viewAi: "Xem cảnh báo AI & lịch sử làm bài",
  editEmployees: "Thêm / sửa / xác nhận nhân viên",
  deleteEmployees: "Xoá nhân viên",
  manageExams: "Tạo & quản lí đề của nhóm mình",
  notify: "Gửi thông báo cho nhân viên"
};

// Tài khoản quản lí cũ (chưa có trường perms) giữ nguyên quyền đang dùng, trừ ảnh (đã bỏ) và quyền tạo đề (mới, mặc định tắt).
const LEGACY = { viewResults: true, viewPaper: true, viewAi: true, editEmployees: true, deleteEmployees: true, manageExams: false, notify: true };

const PRESETS = {
  viewer: { viewResults: true, viewPaper: false, viewAi: true, editEmployees: false, deleteEmployees: false, manageExams: false, notify: false },
  manager: { viewResults: true, viewPaper: true, viewAi: true, editEmployees: true, deleteEmployees: false, manageExams: true, notify: true },
  full: { viewResults: true, viewPaper: true, viewAi: true, editEmployees: true, deleteEmployees: true, manageExams: true, notify: true }
};

// Làm sạch dữ liệu quyền gửi lên: chỉ nhận các khoá trong danh mục, giá trị ép về true/false.
function clean(input) {
  const out = {};
  KEYS.forEach((k) => { out[k] = !!(input && input[k]); });
  return out;
}

function permsOf(viewer) {
  if (viewer && viewer.isAdmin) { const all = {}; KEYS.forEach((k) => { all[k] = true; }); return all; }
  if (viewer && viewer.perms && typeof viewer.perms === "object") return clean(viewer.perms);
  return Object.assign({}, LEGACY);
}

function can(viewer, key) { return !!permsOf(viewer)[key]; }

// Ảnh thí sinh: chỉ quản trị viên.
function canViewPhoto(viewer) { return !!(viewer && viewer.isAdmin); }

module.exports = { KEYS, LABELS, LEGACY, PRESETS, clean, permsOf, can, canViewPhoto };
