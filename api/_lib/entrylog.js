// Nhật ký LỖI & LẦN VÀO KHÔNG ĐƯỢC ở phía thí sinh: nhập sai mã/email, đề đóng/chưa mở, không thuộc đối tượng,
// ảnh/khuôn mặt bị từ chối, bị khoá vì thử quá nhiều, lỗi máy chủ, lỗi trên trình duyệt (camera, vị trí, mạng, lỗi JS)...
// - Ghi tự động mọi phản hồi ok:false của các API thí sinh (wrap), cộng với các sự kiện trình duyệt gửi lên (/api/kt-log).
// - Cùng IP + cùng nơi + cùng lý do + cùng mã nhập trong 10 phút -> gộp thành một dòng, tăng số lần.
// - Chỉ giữ MAX dòng gần nhất. Lỗi khi ghi sổ không bao giờ làm hỏng thao tác chính.
const store = require("./store");
const device = require("./device");

const KEY = "kt/entry-log.json";
const MAX = 8000;
const MERGE_MS = 10 * 60 * 1000;
const clip = (s, n) => String(s == null ? "" : s).replace(/[\r\n\u0000-\u001f]+/g, " ").trim().slice(0, n);

// Phân loại theo mã trạng thái + nội dung để quản trị viên lọc nhanh
function kindOf(status, body) {
  if (body && body.needFace) return "face";
  if (body && body.faceRejected) return "face";
  if (status === 429) return "locked";
  if (status >= 500) return "server";
  if (status === 404) return "notfound";
  if (status === 403) return "denied";
  if (status === 400 || status === 422 || status === 428) return "invalid";
  return "other";
}

async function write(req, e) {
  try {
    const d = req ? device.capture(req, null, "log") : {};
    const row = {
      at: Date.now(), area: clip(e.area, 20), kind: clip(e.kind, 20), status: e.status || 0,
      msg: clip(e.msg, 300), code: clip(e.code, 60), email: clip(e.email, 120).toLowerCase(), exam: clip(e.exam, 60),
      detail: clip(e.detail, 300), ip: d.ip || "", dev: [d.type, d.os, d.browser].filter(Boolean).join(" · ").slice(0, 80), n: 1
    };
    await store.update(KEY, (cur) => {
      const list = Array.isArray(cur) ? cur : [];
      for (let i = list.length - 1; i >= 0 && i >= list.length - 300; i--) {
        const x = list[i];
        if (row.at - x.at > MERGE_MS) break;
        if (x.ip === row.ip && x.area === row.area && x.kind === row.kind && x.msg === row.msg && x.code === row.code && x.email === row.email) {
          x.n = (x.n || 1) + 1; x.at = row.at; if (row.detail) x.detail = row.detail; return list;
        }
      }
      list.push(row);
      return list.length > MAX ? list.slice(-MAX) : list;
    });
  } catch (err) { /* không chặn luồng chính */ }
}

// Bọc hàm reply của một API: phản hồi nào ok:false (hoặc mã >= 400) thì ghi sổ, rồi trả lời như bình thường.
// skip(body, status) -> true để bỏ qua (ví dụ gợi ý email khi gõ dở).
function wrap(req, area, reply, skip) {
  return function (ctx, status, body) {
    const out = reply(ctx, status, body); // trả lời NGAY (đặt context.res đồng bộ), ghi sổ sau
    let p = Promise.resolve();
    try {
      if (body && body.ok === false && !(skip && skip(body, status, req))) {
        const b = (req && req.body) || {}, q = (req && req.query) || {};
        p = write(req, {
          area, kind: kindOf(status, body), status, msg: body.error || ("Mã lỗi " + status),
          code: b.code || q.code || "", email: b.email || "", exam: b.examId || q.exam || "",
          detail: [body.faceRejected ? "ảnh bị từ chối" : "", body.needFace && !b.selfie ? "yêu cầu chụp khuôn mặt" : "", body.needFace && b.selfie ? "đã gửi ảnh khuôn mặt" : "", req && req.query && req.query.c ? "tra mã " + req.query.c : ""].filter(Boolean).join(" · ")
        });
      }
    } catch (e) { /* bỏ qua */ }
    return p.then(() => out, () => out);
  };
}

async function read() { return (await store.get(KEY)) || []; }

module.exports = { write, wrap, read, kindOf };
