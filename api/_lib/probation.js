// Nhân viên thử việc: tính theo ngày vào công ty (api/_lib/probation.json), tự hết hạn sau số ngày quy định.
// Chỉ áp dụng cho nhân viên có trong danh sách (PURESYS, AQUALINK). Mã nhân viên được băm SHA-256 để không lộ trong repo.
const crypto = require("crypto");
const data = require("./probation.json");
const DAY = 86400000;

const hashOf = (code) => crypto.createHash("sha256").update(String(code || "").trim().toLowerCase()).digest("hex");
// Ngày vào công ty (YYYY-MM-DD) hoặc "" nếu nhân viên không có trong danh sách
// override: ngày vào làm ghi riêng trên hồ sơ thí sinh (đặt khi đổi mã nhân viên, vì danh sách tra theo mã băm của mã cũ)
function joinDateOf(code, override) { return /^\d{4}-\d{2}-\d{2}$/.test(override || "") ? override : (data.join[hashOf(code)] || ""); }

function probationOf(code, now, override) {
  const j = joinDateOf(code, override);
  if (!j) return null;
  const start = Date.parse(j + "T00:00:00+07:00");
  const t = now || Date.now();
  const end = start + data.days * DAY;
  if (t < start || t >= end) return null;
  const e = new Date(end - DAY + 7 * 3600000); // ngày cuối còn thử việc, theo giờ VN
  return { from: j, until: e.toISOString().slice(0, 10) };
}
module.exports = { probationOf, joinDateOf };
