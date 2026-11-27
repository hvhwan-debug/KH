// Lịch sử thay đổi THEO TỪNG NHÂN SỰ (hiện ở tab "Lịch sử thay đổi" của trang Hồ sơ học tập).
// - Ghi tự động mỗi lần danh sách thí sinh được lưu (quiz.saveCandidates): so bản cũ với bản mới, mỗi người có thay đổi
//   là MỘT bản ghi riêng kt/person/<mã NV>/<thời điểm>-<ngẫu nhiên>.json -> chỉ thêm, không sửa/xoá, không ghi đè lẫn nhau.
// - Ghi thêm các thao tác lên kết quả của người đó (ẩn / xoá bài, cho làm lại) từ nhật ký thao tác (auditlog.wrap).
// - Người thao tác lấy theo thứ tự: dòng audit mới trên hồ sơ (có tên người làm) > ngữ cảnh API (AsyncLocalStorage) > "Hệ thống".
// - Không ghi mật khẩu, ảnh, đáp án. Lỗi khi ghi lịch sử không bao giờ làm hỏng thao tác chính.
const crypto = require("crypto");
const { AsyncLocalStorage } = require("async_hooks");
const store = require("./store");

const PREFIX = "kt/person/";
const als = new AsyncLocalStorage();
const nc = (s) => String(s || "").trim().toLowerCase();
const keyOf = (code) => encodeURIComponent(nc(code)).slice(0, 120);
const clip = (v, n) => String(v == null ? "" : v).replace(/[\u0000-\u001f\u007f]+/g, " ").trim().slice(0, n || 200);

// Chạy fn trong ngữ cảnh "ai đang thao tác" (để saveCandidates biết người làm)
function run(actor, fn) { return als.run(Object.assign({}, actor), fn); }
function actor() { return als.getStore() || null; }
// Bọc một hàm API với người thao tác cố định (vd. nhân viên tự cập nhật khi vào làm bài)
function bind(handler, who) { return function (context, req) { return run(who, () => handler(context, req)); }; }

// ---------- Trường được theo dõi ----------
const SEG = { both: "Cả hai ngành", gia_dung: "Gia dụng", may_loc: "Máy lọc nước" };
const segName = (v) => { const k = nc(v).replace(/\s+/g, "_"); return SEG[k] || (v ? String(v) : ""); };
const dmy = (v) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v || "")); return m ? m[3] + "/" + m[2] + "/" + m[1] : String(v || ""); };
const FIELDS = [
  ["code", "Mã NV"], ["name", "Họ tên"], ["email", "Email", (v) => nc(v)], ["phone", "Số điện thoại"], ["title", "Chức danh"],
  ["segment", "Nhóm ngành", segName], ["manager", "Quản lí trực tiếp"], ["region", "Miền"], ["province", "Tỉnh / thành"],
  ["birthDate", "Ngày sinh", dmy], ["joinDate", "Ngày vào làm", dmy]
];
const PROFILE = {
  donVi: "Đơn vị", khoi: "Khối", phong: "Phòng", boPhan: "Bộ phận", toNhom: "Tổ / nhóm", khuVucCon: "Khu vực con", noiLamViec: "Nơi làm việc",
  mien: "Miền (hồ sơ NS)", loaiNV: "Loại nhân viên", chucDanhGoc: "Chức danh gốc", quanLy: "Quản lí (hồ sơ NS)", trinhDo: "Trình độ", bangCap: "Bằng cấp",
  chuyenNganh: "Chuyên ngành", truong: "Trường", tinhPhuTrach: "Tỉnh phụ trách", tapDoan: "Tập đoàn", hinhThuc: "Hình thức", hieuLuc: "Hiệu lực",
  msnvCu: "Mã NV cũ", maChamCong: "Mã chấm công", vaoCongTy: "Ngày vào công ty", vaoLanDau: "Ngày vào lần đầu", kyHDChinhThuc: "Ngày ký HĐ chính thức",
  nganh: "Ngành", namSinh: "Năm sinh"
};
const PDATE = { vaoCongTy: 1, vaoLanDau: 1, kyHDChinhThuc: 1 };
const statusOf = (c) => (c && c.left ? "Đã nghỉ việc" : "Đang làm việc");

// So hai bản ghi của CÙNG một người -> { changes: [{f,l,from,to}], events: [chuỗi] }
function diff(a, b) {
  const changes = [], events = [];
  FIELDS.forEach(([f, l, fmt]) => {
    const n = fmt || ((v) => String(v == null ? "" : v).trim());
    const x = n(a[f]), y = n(b[f]);
    if (x !== y) changes.push({ f, l, from: clip(fmt ? x : a[f], 200), to: clip(fmt ? y : b[f], 200) });
  });
  if (!!a.left !== !!b.left) changes.push({ f: "left", l: "Tình trạng làm việc", from: statusOf(a), to: statusOf(b) });
  const pa = a.profile || {}, pb = b.profile || {};
  Object.keys(PROFILE).forEach((k) => {
    const x = String(pa[k] == null ? "" : pa[k]), y = String(pb[k] == null ? "" : pb[k]);
    if (x !== y) changes.push({ f: "profile." + k, l: PROFILE[k], from: clip(PDATE[k] ? dmy(x) : x, 200), to: clip(PDATE[k] ? dmy(y) : y, 200) });
  });
  const wa = a.work || {}, wb = b.work || {};
  if ((wb.at || 0) > (wa.at || 0) && !!a.left === !!b.left) events.push("Xác nhận tình trạng: " + (wb.status === "left" ? "đã nghỉ việc" : "còn làm việc"));
  if (wa.at && !wb.at && !a.left === !b.left) events.push("Hoàn tác xác nhận tình trạng làm việc");
  const ca = a.confirmed || {}, cb = b.confirmed || {};
  if ((cb.at || 0) > (ca.at || 0)) events.push("Xác nhận thông tin nhân viên là đúng");
  else if (ca.at && !cb.at && !changes.length) events.push("Bỏ trạng thái đã xác nhận thông tin");
  return { changes, events };
}

// Dòng audit MỚI được thêm vào hồ sơ trong lần lưu này (cho biết ai làm, qua kênh nào)
function newAudit(a, b) {
  const la = (a && a.audit) || [], lb = (b && b.audit) || [];
  const last = la.length ? la[la.length - 1].at || 0 : 0;
  const fresh = lb.filter((x) => x && (x.at || 0) > last);
  return fresh.length ? fresh[fresh.length - 1] : null;
}

function whoOf(au) {
  const ctx = actor() || {};
  if (au && (au.by || au.byName)) return { by: clip(au.by, 120), byName: clip(au.byName || au.by, 120), role: ctx.role || "" };
  if (ctx.by || ctx.byName) return { by: clip(ctx.by, 120), byName: clip(ctx.byName || ctx.by, 120), role: ctx.role || "" };
  return { by: "system", byName: "Hệ thống", role: "system" };
}

async function writeOne(code, entry) {
  const ts = entry.at || Date.now();
  const key = PREFIX + keyOf(code) + "/" + String(ts).padStart(14, "0") + "-" + crypto.randomBytes(4).toString("hex") + ".json";
  await store.put(key, Object.assign({ at: ts }, entry));
}
async function writeMany(list) {
  for (let i = 0; i < list.length; i += 25) await Promise.all(list.slice(i, i + 25).map((x) => writeOne(x.code, x.entry).catch(() => null)));
}

// Gọi từ quiz.saveCandidates: so danh sách cũ / mới và ghi lịch sử cho từng người có thay đổi
async function record(prev, next) {
  try {
    if (!Array.isArray(prev) || !Array.isArray(next)) return;
    const A = new Map(), B = new Map(), now = Date.now(), out = [];
    prev.forEach((c) => { if (c && c.code) A.set(nc(c.code), c); });
    next.forEach((c) => { if (c && c.code) B.set(nc(c.code), c); });
    const renamedFrom = new Set();
    B.forEach((b, k) => {
      let a = A.get(k);
      const au = newAudit(a, b);
      // Đổi mã NV: bản cũ nằm dưới mã cũ -> ghi vào lịch sử của mã MỚI, kèm mã cũ để đọc nối được lịch sử trước đó
      if (!a && au && au.changes && au.changes.code && A.has(nc(au.changes.code.from))) { a = A.get(nc(au.changes.code.from)); renamedFrom.add(nc(au.changes.code.from)); }
      const who = whoOf(au), via = au && au.changes && au.changes.admin ? clip(au.changes.admin.to, 120) : "";
      if (!a) { out.push({ code: k, entry: Object.assign({ at: now, kind: "create", name: clip(b.name, 100), events: ["Thêm vào danh sách nhân sự"], changes: [] }, who, via ? { via } : {}) }); return; }
      const d = diff(a, b);
      if (!d.changes.length && !d.events.length) return;
      const e = Object.assign({ at: now, kind: "edit", name: clip(b.name, 100), changes: d.changes, events: d.events }, who, via ? { via } : {});
      const codeCh = d.changes.find((x) => x.f === "code"); if (codeCh) e.prevCode = codeCh.from;
      out.push({ code: k, entry: e });
    });
    A.forEach((a, k) => {
      if (B.has(k) || renamedFrom.has(k)) return;
      out.push({ code: k, entry: Object.assign({ at: now, kind: "delete", name: clip(a.name, 100), events: ["Xoá khỏi danh sách nhân sự"], changes: [] }, whoOf(null)) });
    });
    if (out.length) await writeMany(out);
  } catch (e) { /* bỏ qua */ }
}

// Thao tác không đổi hồ sơ nhưng đổi kết quả của người đó (ẩn / xoá bài, cho làm lại...)
async function action(code, label, details, who) {
  try {
    if (!code) return;
    const w = who && (who.by || who.byName) ? { by: clip(who.by, 120), byName: clip(who.byName || who.by, 120), role: who.role || "" } : whoOf(null);
    const d = {}; Object.keys(details || {}).forEach((k) => { const v = details[k]; if (v != null && v !== "") d[k] = clip(v, 120); });
    await writeOne(code, Object.assign({ at: Date.now(), kind: "action", events: [clip(label, 160)], changes: [], details: d }, w));
  } catch (e) { /* bỏ qua */ }
}

// Đọc lịch sử của một mã (mới nhất trước); tự nối thêm lịch sử dưới các mã cũ nếu người này từng đổi mã
async function read(code, max) {
  const lim = Math.min(Math.max(+max || 300, 1), 1000), seen = new Set(), out = [];
  let codes = [nc(code)];
  for (let hop = 0; hop < 5 && codes.length; hop++) {
    const nextCodes = [];
    for (const c of codes) {
      if (!c || seen.has(c)) continue; seen.add(c);
      const names = (await store.list(PREFIX + keyOf(c) + "/")).sort().reverse().slice(0, lim);
      for (let i = 0; i < names.length; i += 25) {
        const part = await Promise.all(names.slice(i, i + 25).map((n) => store.get(n).catch(() => null)));
        part.forEach((x) => { if (x) { out.push(x); if (x.prevCode) nextCodes.push(nc(x.prevCode)); } });
      }
    }
    codes = nextCodes;
  }
  return out.sort((a, b) => (b.at || 0) - (a.at || 0)).slice(0, lim);
}

module.exports = { run, bind, actor, record, action, read, diff };
