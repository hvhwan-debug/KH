// Nhật ký TRUY CẬP KẾT QUẢ: ai đã xem điểm, ai đã xem lại đề / bài làm, ai đã xem ảnh xác nhận của một bài.
// Khác nhật ký thao tác (auditlog, chia theo ngày): sổ này gom một chỗ để tra theo từng bài làm và theo người xem.
// - kind:  "score" xem điểm (trang xác thực kết quả) · "paper" xem lại đề/bài làm · "photo" xem ảnh xác nhận
// - role:  "public" người mở liên kết/QR/mã KT (không đăng nhập) · "candidate" chính thí sinh (đã đối chiếu khuôn mặt)
//          "manager" quản lí · "admin" quản trị viên
// - Mở lại cùng một bài trong 10 phút (cùng người, cùng IP, cùng loại) chỉ tăng số lần, không thêm dòng mới.
// - Chỉ giữ MAX dòng gần nhất. Lỗi ghi sổ không bao giờ làm hỏng thao tác chính.
const store = require("./store");
const device = require("./device");

const KEY = "kt/access-log.json";
const MAX = 8000;
const MERGE_MS = 10 * 60 * 1000;
const clip = (s, n) => String(s == null ? "" : s).replace(/[\r\n\u0000-\u001f]+/g, " ").trim().slice(0, n);

async function write(req, e) {
  try {
    const d = req ? device.capture(req, null, "view") : {};
    const row = {
      at: Date.now(), kind: e.kind, role: e.role, ok: e.ok !== false,
      id: clip(e.attempt && e.attempt.id, 60), code: clip(e.attempt && e.attempt.code, 40), name: clip(e.attempt && e.attempt.name, 80), period: clip(e.attempt && e.attempt.period, 60),
      by: clip(e.by, 120).toLowerCase(), byName: clip(e.byName, 80), via: clip(e.via, 60), note: clip(e.note, 160),
      ip: d.ip || "", dev: [d.type, d.os, d.browser].filter(Boolean).join(" · ").slice(0, 80), n: 1
    };
    await store.update(KEY, (cur) => {
      const list = Array.isArray(cur) ? cur : [];
      for (let i = list.length - 1; i >= 0 && i >= list.length - 200; i--) {
        const x = list[i];
        if (row.at - x.at > MERGE_MS) break;
        if (x.id === row.id && x.kind === row.kind && x.by === row.by && x.ip === row.ip && x.ok === row.ok && x.role === row.role) {
          x.n = (x.n || 1) + 1; x.at = row.at; return list;
        }
      }
      list.push(row);
      return list.length > MAX ? list.slice(-MAX) : list;
    });
  } catch (err) { /* không chặn luồng chính */ }
}

async function read() { return (await store.get(KEY)) || []; }

module.exports = { write, read };
