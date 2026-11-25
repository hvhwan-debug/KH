// Kiểm thử thích/không thích học liệu + gắn học liệu vào bài kiểm tra. Cần máy chủ chạy thử MỚI KHỞI ĐỘNG:
//   ADMIN_EMAILS=boss@livotec.vn node dev/server.js     rồi    node dev/test-hoclieu-vote.js
const BASE = "http://localhost:7071", H = { "Content-Type": "application/json", "X-Requested-With": "livotec" };
process.env.SESSION_SECRET = "dev-session-secret-dev-session-secret-1234"; process.env.COOKIE_INSECURE = "1";
const CK = require("../api/_lib/candcookie");
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? "PASS " : "FAIL ") + m); };
const call = async (m, p, body, cookie) => { const r = await fetch(BASE + p, { method: m, headers: Object.assign({}, H, cookie ? { cookie } : {}), body: body ? JSON.stringify(body) : undefined }); const sc = r.headers.get("set-cookie"); let j = {}; try { j = await r.json(); } catch (e) {} return { s: r.status, j, sc }; };
const hlCk = (code, name) => CK.hlCookie(code, name).split(";")[0];
(async () => {
  let r = await call("POST", "/api/auth/request", { email: "boss@livotec.vn", password: "matkhau123", name: "Nguyễn Văn Sếp", phone: "0901234567" });
  if (r.j.needsOtp) { const mb = await (await fetch(BASE + "/__mailbox")).json(); const otp = mb.filter((x) => x.to === "boss@livotec.vn").pop().subject.match(/(\d{6})/)[1]; r = await call("POST", "/api/auth/request", { email: "boss@livotec.vn", password: "matkhau123", name: "Nguyễn Văn Sếp", phone: "0901234567", otp }); }
  const A = r.sc.split(";")[0];
  r = await call("POST", "/api/kt-admin", { op: "saveExam", exam: { id: "sp-maylo-t11", title: "Kiến thức máy lọc T11" } }, A); ok(r.j.ok, "tạo đề sp-maylo-t11");
  r = await call("POST", "/api/hoclieu-admin", { op: "saveItem", item: { title: "Catalog máy lọc GT miền Bắc", type: "pdf", cat: "sp", pages: 12, source: { kind: "link", url: "https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQ/view" }, exams: ["sp-maylo-t11", "sp-maylo-t11", "bad id!"] } }, A);
  ok(r.j.ok && JSON.stringify(r.j.item.exams) === '["sp-maylo-t11"]', "lưu học liệu gắn đề (loại trùng / mã sai)");
  const id = r.j.item.id;
  r = await call("POST", "/api/hoclieu-admin", { op: "saveItem", item: { title: "Video không gắn", type: "video", cat: "vd", source: { kind: "link", url: "https://youtu.be/dQw4w9WgXcQ" } } }, A); const id2 = r.j.item.id;
  r = await call("GET", "/api/kt-info?exam=sp-maylo-t11"); ok(r.j.exam.materials.length === 1 && r.j.exam.materials[0].id === id, "trang làm bài nhận đúng 1 tài liệu ôn tập");
  r = await call("GET", "/api/hoclieu"); let it = r.j.items.find((x) => x.id === id);
  ok(it.exams[0].title === "Kiến thức máy lọc T11" && it.up === 0 && it.mine === "", "danh sách học liệu có tên bài kiểm tra + đếm đánh giá");
  r = await call("POST", "/api/hoclieu", { op: "vote", id, v: "up" }); ok(r.s === 401, "chưa xác thực khuôn mặt -> không đánh giá được");
  const u1 = hlCk("T030000526", "Phạm Mạc Duy"), u2 = hlCk("T030000475", "Đào Xuân Bách"), u3 = hlCk("T030000441", "Nguyễn Thành Trung");
  r = await call("POST", "/api/hoclieu", { op: "vote", id, v: "up" }, u1); ok(r.j.ok && r.j.up === 1 && r.j.mine === "up", "NV1 thích");
  r = await call("POST", "/api/hoclieu", { op: "vote", id, v: "up" }, u1); ok(r.j.up === 1, "NV1 bấm thích lần nữa không cộng dồn");
  r = await call("POST", "/api/hoclieu", { op: "vote", id, v: "up" }, u2); ok(r.j.up === 2, "NV2 thích -> 2");
  r = await call("POST", "/api/hoclieu", { op: "vote", id, v: "down", reason: "old" }, u2); ok(r.j.up === 1 && r.j.down === 1 && r.j.mine === "down", "NV2 đổi sang không thích (kèm lí do)");
  r = await call("POST", "/api/hoclieu", { op: "vote", id, v: "down", reason: "hard" }, u3); ok(r.j.down === 2, "NV3 không thích");
  r = await call("POST", "/api/hoclieu", { op: "vote", id, v: "" }, u3); ok(r.j.down === 1 && r.j.mine === "", "NV3 bỏ đánh giá");
  r = await call("GET", "/api/hoclieu", null, u2); it = r.j.items.find((x) => x.id === id); ok(it.mine === "down" && it.up === 1 && it.down === 1, "học viên thấy lại lựa chọn của mình");
  r = await call("GET", "/api/hoclieu-admin?op=list", null, A); it = r.j.items.find((x) => x.id === id);
  ok(it.up === 1 && it.down === 1 && it.reasons.old === 1 && !it.reasons.hard && r.j.stats.up === 1, "quản trị thấy 👍1 👎1, lí do 'thông tin cũ' (lí do của người đã bỏ phiếu không tính)");
  r = await call("POST", "/api/hoclieu", { op: "vote", id: "khong-co", v: "up" }, u1); ok(r.s === 404, "học liệu không tồn tại -> 404");
  r = await call("POST", "/api/hoclieu-admin", { op: "saveItem", item: { id, title: "Catalog máy lọc GT miền Bắc", type: "pdf", cat: "sp", source: { kind: "link", url: "https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQ/view" }, exams: [] } }, A);
  r = await call("GET", "/api/kt-info?exam=sp-maylo-t11"); ok(r.j.exam.materials.length === 0, "bỏ gắn -> trang làm bài không còn tài liệu");
  r = await call("GET", "/api/hoclieu-admin?op=list", null, A); it = r.j.items.find((x) => x.id === id); ok(it.up === 1 && it.views === 0, "sửa học liệu không mất lượt đánh giá");
  // gắn lại để kiểm tra giao diện
  await call("POST", "/api/hoclieu-admin", { op: "saveItem", item: { id, title: "Catalog sản phẩm máy lọc kênh GT miền Bắc", desc: "Danh mục sản phẩm, thông số và điểm bán hàng chính.", type: "pdf", cat: "sp", pages: 12, source: { kind: "link", url: "https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQ/view" }, exams: ["sp-maylo-t11"] } }, A);
  console.log(pass + " đạt, " + fail + " lỗi"); 
})().catch((e) => { console.error(e); process.exit(1); });
