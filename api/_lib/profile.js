// Hồ sơ nhân sự của thí sinh (chỉ dữ liệu LIÊN QUAN CÔNG VIỆC), lưu cùng bản ghi thí sinh trong kho riêng của hệ thống.
// Cố ý KHÔNG lưu: ngày sinh đầy đủ (chỉ giữ năm sinh cho thống kê), giới tính, địa chỉ, nơi sinh, quê quán, tôn giáo, dân tộc, quốc tịch, tình trạng hôn nhân.
// Mọi dữ liệu vào đều qua cleanProfile (danh sách trường cố định, giới hạn độ dài): không nhận trường lạ từ trình duyệt.
const STR = { donVi: 80, khoi: 60, phong: 60, boPhan: 80, toNhom: 60, khuVucCon: 30, noiLamViec: 60, mien: 30, loaiNV: 40, chucDanhGoc: 80, quanLy: 80,
  trinhDo: 50, bangCap: 50, chuyenNganh: 80, truong: 100, tinhPhuTrach: 300,
  tapDoan: 60, hinhThuc: 40, hieuLuc: 40, msnvCu: 30, maChamCong: 30 };
const DATES = ["vaoCongTy", "vaoLanDau", "kyHDChinhThuc"];
const clip = (s, n) => String(s == null ? "" : s).replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, n);

function cleanProfile(p) {
  if (!p || typeof p !== "object") return null;
  const out = {};
  Object.keys(STR).forEach((k) => { const v = clip(p[k], STR[k]); if (v) out[k] = v; });
  DATES.forEach((k) => { const v = String(p[k] || "").trim(); if (/^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(Date.parse(v))) out[k] = v; });
  const n = Number(p.nganh); if (n === 1 || n === 2) out.nganh = n;
  // Chỉ NĂM SINH (để thống kê độ tuổi, chỉ quản trị viên thấy; KHÔNG đưa cho AI, không hiện trong hồ sơ từng người)
  const ny = Number(p.namSinh); if (Number.isInteger(ny) && ny >= 1940 && ny <= new Date().getFullYear() - 14) out.namSinh = ny;
  if (!Object.keys(out).length) return null;
  out.at = Date.now();
  return out;
}
function monthsSince(iso, now) {
  const t = Date.parse(iso); if (isNaN(t)) return null;
  const a = new Date(t), b = new Date(now || Date.now());
  const m = (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth()) - (b.getUTCDate() < a.getUTCDate() ? 1 : 0);
  return m < 0 ? 0 : m;
}
// Bản tóm tắt ĐƯA CHO AI (dịch vụ bên ngoài): chỉ vị trí công việc, khu vực, thâm niên. Không có tên, quản lí, trình độ, trường, địa chỉ.
function brief(p, now) {
  if (!p) return null;
  const since = p.vaoLanDau || p.vaoCongTy;
  const o = {
    chuc_danh_goc: p.chucDanhGoc || null, nganh: p.nganh || null, khu_vuc: [p.mien, p.khuVucCon].filter(Boolean).join(" · ") || null,
    loai_nhan_vien: p.loaiNV || null, tham_nien_thang: since ? monthsSince(since, now) : null, phu_trach_tinh: p.tinhPhuTrach || null
  };
  Object.keys(o).forEach((k) => { if (o[k] == null) delete o[k]; });
  return Object.keys(o).length ? o : null;
}
// Hồ sơ của một mã nhân viên (không lỗi nếu chưa có)
async function forCode(code) {
  try {
    const quiz = require("./quiz"), k = quiz.normCode(code);
    const c = (await quiz.getCandidates()).find((x) => quiz.normCode(x.code) === k);
    return c && c.profile ? c.profile : null;
  } catch (e) { return null; }
}
// Lớp chặn thứ hai: mọi phản hồi gửi cho QUẢN LÍ / THÍ SINH đều bị loại khoá "profile" (kể cả khi sau này ai đó lỡ trả nguyên bản ghi thí sinh).
// Hồ sơ chỉ ra khỏi máy chủ qua kt-admin (quản trị viên) và, dạng tóm tắt không có thông tin cá nhân, qua lời khuyên AI.
function stripProfile(v, depth) {
  if (v == null || typeof v !== "object" || (depth || 0) > 12) return v;
  if (Array.isArray(v)) return v.map((x) => stripProfile(x, (depth || 0) + 1));
  const o = {};
  Object.keys(v).forEach((k) => { if (k !== "profile") o[k] = stripProfile(v[k], (depth || 0) + 1); });
  return o;
}
module.exports = { cleanProfile, brief, monthsSince, forCode, stripProfile };
