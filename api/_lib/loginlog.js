// LỊCH SỬ ĐĂNG NHẬP của nhân viên/thí sinh: ai vào hệ thống, lúc nào, bằng cách nào, ở trang nào, máy nào.
// - method: "face"        chỉ quét khuôn mặt (nhận diện 1-N, không nhập mã NV + email)
//           "manual"      nhập mã NV + email
//           "manual_face" nhập mã NV + email và đã xác minh khuôn mặt khớp (tra cứu cũ / bị yêu cầu xác thực sau nhiều lần nhập sai)
// - page:   "exam" trang làm bài · "history" tra cứu lịch sử bài kiểm tra · "paper" xem lại đề
// - Cùng người + cùng cách + cùng trang + cùng IP trong 10 phút: gộp một dòng, tăng số lần. Chỉ giữ MAX dòng gần nhất.
// Ghi sổ lỗi không bao giờ làm hỏng thao tác chính. Không lưu ảnh.
const store = require("./store");
const device = require("./device");

const KEY = "kt/login-log.json";
const MAX = 20000;
const MERGE_MS = 10 * 60 * 1000;
const clip = (s, n) => String(s == null ? "" : s).replace(/[\r\n\u0000-\u001f]+/g, " ").trim().slice(0, n);
const METHODS = ["face", "manual", "manual_face"], PAGES = ["exam", "history", "paper"];

async function write(req, e) {
  try {
    const d = req ? device.capture(req, null, "login") : {};
    const row = {
      at: Date.now(), code: clip(e.code, 40).toUpperCase(), name: clip(e.name, 80), manager: clip(e.manager, 80),
      method: METHODS.indexOf(e.method) >= 0 ? e.method : "manual", page: PAGES.indexOf(e.page) >= 0 ? e.page : "exam",
      exam: clip(e.exam, 60), note: clip(e.note, 120), test: !!e.test,
      ip: d.ip || "", dev: [d.type, d.os, d.browser].filter(Boolean).join(" · ").slice(0, 80), n: 1
    };
    if (!row.code) return;
    await store.update(KEY, (cur) => {
      const list = Array.isArray(cur) ? cur : [];
      for (let i = list.length - 1; i >= 0 && i >= list.length - 300; i--) {
        const x = list[i];
        if (row.at - x.at > MERGE_MS) break;
        if (x.code === row.code && x.method === row.method && x.page === row.page && x.ip === row.ip && x.exam === row.exam) { x.n = (x.n || 1) + 1; x.at = row.at; return list; }
      }
      list.push(row);
      return list.length > MAX ? list.slice(-MAX) : list;
    });
  } catch (err) { /* không chặn luồng chính */ }
}

async function read() { return (await store.get(KEY)) || []; }

module.exports = { write, read, KEY };
