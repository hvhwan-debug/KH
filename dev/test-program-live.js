// Kiểm thử thông tin "sống" trong email mời: sửa chương trình -> ảnh trong thư đã gửi đổi theo. Cần máy chủ chạy thử MỚI KHỞI ĐỘNG:
//   ADMIN_EMAILS=boss@livotec.vn node dev/server.js     rồi    node dev/test-program-live.js
const BASE = "http://localhost:7071", H = { "Content-Type": "application/json", "X-Requested-With": "livotec" };
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? "PASS " : "FAIL ") + m); };
const call = async (m, p, body, ck) => { const r = await fetch(BASE + p, { method: m, headers: Object.assign({}, H, ck ? { cookie: ck } : {}), body: body ? JSON.stringify(body) : undefined }); let j = {}; try { j = await r.json(); } catch (e) {} return { s: r.status, j, sc: r.headers.get("set-cookie") }; };
const box = async () => (await (await fetch(BASE + "/__mailbox")).json());
const img = async (u) => { const r = await fetch(u.replace(/^https?:\/\/[^/]+/, BASE)); const b = Buffer.from(await r.arrayBuffer()); return { s: r.status, b, cc: r.headers.get("cache-control"), ct: r.headers.get("content-type") }; };
(async () => {
  let r = await call("POST", "/api/auth/request", { email: "boss@livotec.vn", password: "matkhau123", name: "Nguyễn Văn Sếp", phone: "0901234567" });
  if (r.j.needsOtp) { const otp = (await box()).filter((x) => x.to === "boss@livotec.vn").pop().subject.match(/(\d{6})/)[1]; r = await call("POST", "/api/auth/request", { email: "boss@livotec.vn", password: "matkhau123", name: "Nguyễn Văn Sếp", phone: "0901234567", otp }); }
  const A = r.sc.split(";")[0];
  await call("POST", "/api/kt-admin", { op: "addCandidates", rows: [{ code: "T030000526", name: "Phạm Mạc Duy", email: "duy@livotec.vn" }, { code: "T030000475", name: "Đào Xuân Bách", email: "bach@livotec.vn" }] }, A);
  const prog = { title: "Hướng dẫn sử dụng hệ thống", desc: "Test hệ thống", when: "ngày 22/12/2026", where: "Online", contact: "Đào tạo Kinh doanh GT", phone: "0846 993993", capacity: 10 };
  r = await call("POST", "/api/kt-program", { op: "save", program: prog }, A); const id = r.j.program.id; ok(r.j.program.live === true, "mặc định: thông tin trong thư tự cập nhật");
  await call("POST", "/api/kt-program", { op: "send", id, codes: ["T030000526"] }, A);
  const m = (await box()).filter((x) => x.to === "duy@livotec.vn").pop();
  const urls = [...m.html.matchAll(/src="([^"]*\/api\/program-img\?[^"]+)"/g)].map((x) => x[1].replace(/&amp;/g, "&"));
  ok(urls.length === 2 && /k=hero/.test(urls[0]) && /k=info/.test(urls[1]), "thư dùng 2 ảnh lấy trực tiếp từ máy chủ (đầu thư + thẻ thông tin)");
  ok(!(m.attachments || []).some((a) => a.cid === "pg-hero" || a.cid === "pg-info"), "không gắn cố định ảnh đầu thư / thẻ thông tin vào thư");
  ok(/alt="Thời gian: ngày 22\/12\/2026 · Hình thức: Online/.test(m.html), "chữ thay thế khi ứng dụng mail chặn ảnh");
  let a1 = await img(urls[1]); ok(a1.s === 200 && a1.ct === "image/png" && /no-store/.test(a1.cc), "ảnh thẻ thông tin: 200, không lưu đệm");
  let h1 = await img(urls[0]); ok(h1.s === 200 && h1.ct === "image/jpeg", "ảnh đầu thư: 200");
  // sửa trên hệ thống -> ảnh đổi theo
  const cur = (await call("GET", "/api/kt-program?op=detail&id=" + id, null, A)).j.program;
  await call("POST", "/api/kt-program", { op: "save", program: Object.assign({}, cur, { when: "Ngày 29/12/2026 | Buổi chiều", title: "Hướng dẫn sử dụng hệ thống KH" }) }, A);
  let a2 = await img(urls[1]), h2 = await img(urls[0]);
  ok(!a1.b.equals(a2.b) && a2.b.length > 1000, "đổi thời gian -> thẻ thông tin trong thư đã gửi đổi theo");
  ok(!h1.b.equals(h2.b), "đổi tên chương trình -> ảnh đầu thư đổi theo");
  // có người đăng ký -> số chỗ còn lại đổi
  const t = decodeURIComponent(m.html.match(/dangky\.html\?t=([^"&<]+)/)[1]); await call("POST", "/api/program-join", { t, op: "join" });
  let a3 = await img(urls[1]); ok(!a3.b.equals(a2.b), "có người đăng ký -> số chỗ còn lại cập nhật");
  await call("POST", "/api/kt-program", { op: "setStatus", id, status: "closed" }, A);
  let a4 = await img(urls[1]); ok(!a4.b.equals(a3.b) && a4.b.length > a3.b.length, "đóng đăng ký -> thẻ hiện thêm dải ĐÃ ĐÓNG ĐĂNG KÝ");
  require("fs").writeFileSync("/tmp/live_closed.png", a4.b); require("fs").writeFileSync("/tmp/live_html.html", m.html);
  let bad = await img(urls[1].replace(/s=[^&]+/, "s=AAAAAAAAAAAAAAAAAAAAAA")); ok(bad.s === 404, "sai chữ ký -> 404 (không dò được chương trình khác)");
  let other = await img(urls[1].replace(/p=[^&]+/, "p=pkhac")); ok(other.s === 404, "đổi mã chương trình trong đường dẫn -> 404");
  // tắt tự cập nhật -> ảnh gắn cố định
  r = await call("POST", "/api/kt-program", { op: "save", program: Object.assign({}, prog, { title: "Lớp gửi cố định", live: false }) }, A); const id2 = r.j.program.id;
  await call("POST", "/api/kt-program", { op: "send", id: id2, codes: ["T030000475"] }, A);
  const m2 = (await box()).filter((x) => x.to === "bach@livotec.vn").pop();
  ok(!/program-img/.test(m2.html) && (m2.attachments || []).some((x) => x.cid === "pg-hero") && (m2.attachments || []).some((x) => x.cid === "pg-info") && /cid:pg-info/.test(m2.html), "tắt tự cập nhật -> ảnh gắn cố định vào thư (cid)");
  // xoá chương trình -> thư cũ hiện 'không còn tổ chức'
  await call("POST", "/api/kt-program", { op: "delete", id }, A);
  let g = await img(urls[1]); ok(g.s === 200 && g.ct === "image/png", "xoá chương trình -> thư đã gửi hiện thông báo không còn tổ chức");
  console.log(pass + " đạt, " + fail + " lỗi"); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
