// Nhân viên thử việc: tính theo ngày vào công ty (api/_lib/probation.json), tự hết hạn sau số ngày quy định.
// Chỉ áp dụng cho nhân viên có trong danh sách (PURESYS, AQUALINK). Mã nhân viên được băm SHA-256 để không lộ trong repo.
const crypto = require("crypto");
const data = require("./probation.json");
const DAY = 86400000;

const hashOf = (code) => crypto.createHash("sha256").update(String(code || "").trim().toLowerCase()).digest("hex");
// Ngày vào công ty (YYYY-MM-DD) hoặc "" nếu nhân viên không có trong danh sách
function joinDateOf(code) { return data.join[hashOf(code)] || ""; }

function probationOf(code, now) {
  const j = joinDateOf(code);
  if (!j) return null;
  const start = Date.parse(j + "T00:00:00+07:00");
  const t = now || Date.now();
  const end = start + data.days * DAY;
  if (t < start || t >= end) return null;
  const e = new Date(end - DAY + 7 * 3600000); // ngày cuối còn thử việc, theo giờ VN
  return { from: j, until: e.toISOString().slice(0, 10) };
}
module.exports = { probationOf, joinDateOf };
