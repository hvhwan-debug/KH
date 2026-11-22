// NHẬT KÝ HÀNH VI TRONG LÚC LÀM BÀI (mỗi bài làm một danh sách, tối đa 400 sự kiện, chỉ để quản trị viên xem lại).
//   tab    Chuyển tab / rời trang          (trình duyệt gửi: thời điểm + thời lượng)
//   min    Thu nhỏ trình duyệt             (trình duyệt gửi: thời điểm + thời lượng; trình duyệt không luôn phân biệt được với chuyển tab)
//   blur   Chuyển sang cửa sổ / ứng dụng khác nhưng trang vẫn hiện (thời điểm + thời lượng)
//   fs     Thoát chế độ toàn màn hình      (trình duyệt gửi: thời điểm + thời lượng đến khi bật lại)
//   net    Mất kết nối                     (trình duyệt gửi: thời điểm + thời lượng)
//   reload Tải lại trang / mở lại bài      (MÁY CHỦ tự ghi khi vào lại bài trên cùng trình duyệt)
//   dev    Đăng nhập thiết bị khác         (MÁY CHỦ tự ghi khi vào lại bài từ trình duyệt / thiết bị khác; kèm tên thiết bị)
// Dữ liệu trình duyệt gửi chỉ là TÍN HIỆU tuân thủ, không phải bằng chứng gian lận; mọi giá trị đều được cắt gọt.
const KINDS = ["tab", "min", "blur", "fs", "net", "reload", "dev"];
const LABEL = { tab: "Chuyển tab", min: "Thu nhỏ trình duyệt", blur: "Chuyển sang cửa sổ khác", fs: "Thoát toàn màn hình", net: "Mất kết nối", reload: "Tải lại trang", dev: "Đăng nhập thiết bị khác" };
const MAX = 400, MAX_MS = 6 * 3600 * 1000;
const clip = (v, n) => String(v == null ? "" : v).replace(/[\u0000-\u001f\u007f<>"`]/g, "").trim().slice(0, n);

function push(attempt, ev, now) {
  if (!attempt || !ev || KINDS.indexOf(ev.k) < 0) return false;
  const t0 = (attempt.startedAt || 0) - 60000, t1 = (now || Date.now()) + 5000;
  const t = Number.isFinite(ev.t) ? Math.round(ev.t) : (now || Date.now());
  if (t < t0 || t > t1) return false;
  const e = { k: ev.k, t };
  if (Number.isFinite(ev.ms) && ev.ms > 0) e.ms = Math.min(MAX_MS, Math.round(ev.ms));
  if (ev.d) e.d = clip(ev.d, 80);
  const list = Array.isArray(attempt.events) ? attempt.events : [];
  if (list.some((x) => x.k === e.k && x.t === e.t)) return false; // gửi lại do mất mạng: bỏ trùng
  list.push(e); list.sort((a, b) => a.t - b.t);
  attempt.events = list.length > MAX ? list.slice(-MAX) : list;
  return true;
}
// Nhận một lô sự kiện do trình duyệt gửi (kèm câu trả lời / lúc nộp bài). Không nhận reload/dev từ trình duyệt.
function ingest(attempt, arr, now) {
  if (!Array.isArray(arr)) return 0;
  let n = 0;
  arr.slice(0, 60).forEach((x) => { if (x && typeof x === "object" && x.k !== "reload" && x.k !== "dev" && push(attempt, { k: x.k, t: x.t, ms: x.ms }, now)) n++; });
  return n;
}
// Tóm tắt theo loại: { tab: { n, ms }, ... }
function summary(attempt) {
  const out = {};
  (attempt && Array.isArray(attempt.events) ? attempt.events : []).forEach((e) => { const s = (out[e.k] = out[e.k] || { n: 0, ms: 0 }); s.n++; s.ms += e.ms || 0; });
  return out;
}
module.exports = { KINDS, LABEL, push, ingest, summary };
