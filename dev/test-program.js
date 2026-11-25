// Kiểm thử chương trình học (mời qua email, đăng ký bằng một nút). Cần máy chủ chạy thử MỚI KHỞI ĐỘNG:
//   ADMIN_EMAILS=boss@livotec.vn node dev/server.js     rồi    node dev/test-program.js
const BASE = "http://localhost:7071", H = { "Content-Type": "application/json", "X-Requested-With": "livotec" };
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? "PASS " : "FAIL ") + m); };
const call = async (m, p, body, cookie, noAjax) => { const h = Object.assign({}, noAjax ? { "Content-Type": "application/json" } : H, cookie ? { cookie } : {}); const r = await fetch(BASE + p, { method: m, headers: h, body: body ? JSON.stringify(body) : undefined }); let j = {}; try { j = await r.json(); } catch (e) {} return { s: r.status, j, sc: r.headers.get("set-cookie") }; };
const box = async () => (await (await fetch(BASE + "/__mailbox")).json());
const tok = (m) => decodeURIComponent((m.html.match(/dangky\.html\?t=([^"&<]+)/) || [])[1] || "");
(async () => {
  let r = await call("POST", "/api/auth/request", { email: "boss@livotec.vn", password: "matkhau123", name: "Nguyễn Văn Sếp", phone: "0901234567" });
  if (r.j.needsOtp) { const otp = (await box()).filter((x) => x.to === "boss@livotec.vn").pop().subject.match(/(\d{6})/)[1]; r = await call("POST", "/api/auth/request", { email: "boss@livotec.vn", password: "matkhau123", name: "Nguyễn Văn Sếp", phone: "0901234567", otp }); }
  const A = r.sc.split(";")[0];
  await call("POST", "/api/kt-admin", { op: "addCandidates", rows: [
    { code: "T030000475", name: "Đào Xuân Bách", email: "bach@livotec.vn", title: "Sales", manager: "Nguyễn Ngọc Hiếu" },
    { code: "T030000526", name: "Phạm Mạc Duy", email: "duy@livotec.vn", title: "Sales", manager: "Đoàn Văn Tân" },
    { code: "T030000535", name: "Huỳnh Thị Ngọc Tra", email: "tra@livotec.vn", title: "Sales", manager: "Đoàn Văn Tân" }] }, A);
  r = await call("GET", "/api/kt-program?op=list"); ok(r.s === 401, "chưa đăng nhập -> 401");
  r = await call("POST", "/api/kt-program", { op: "save", program: { title: "" } }, A); ok(r.s === 400, "thiếu tên -> 400");
  r = await call("POST", "/api/kt-program", { op: "save", program: { title: "Khoá kỹ năng tư vấn máy lọc nước", desc: "Thực hành xử lý từ chối và chốt đơn.", when: "8:30 – 11:30, thứ Bảy 06/12/2026", where: "Văn phòng Hà Nội", capacity: 2, contact: "Phòng Đào tạo · 0901 234 567" } }, A);
  ok(r.j.ok, "tạo chương trình (2 chỗ)"); const id = r.j.program.id;
  r = await call("POST", "/api/kt-program", { op: "send", id, codes: ["T030000475", "T030000526", "T030000535", "KHONGCO"] }, A);
  ok(r.j.ok && r.j.sent === 3 && r.j.failed.length === 1, "gửi 3 email, 1 mã không có trong danh sách");
  const mb = await box(), mB = mb.filter((x) => x.to === "bach@livotec.vn").pop(), mD = mb.filter((x) => x.to === "duy@livotec.vn").pop(), mT = mb.filter((x) => x.to === "tra@livotec.vn").pop();
  ok(mB && /^Thư mời đăng ký chương trình đào tạo dành cho Đào Xuân Bách: Khoá kỹ năng/.test(mB.subject) && /ĐĂNG KÝ THAM GIA NGAY/.test(mB.html) && /Chào Đào Xuân Bách,/.test(mB.html) && /trân trọng mời Đào Xuân Bách đăng ký tham gia <b[^>]*>Khoá kỹ năng/.test(mB.html) && !/tham gia chương trình <b[^>]*>Khoá/.test(mB.html) && /VÌ SAO NÊN THAM GIA\?/.test(mB.html) && (mB.attachments || []).some((a) => a.cid === "pg-hero") && (mB.attachments || []).every((a) => mB.html.indexOf("cid:" + a.cid) >= 0), "email có tiêu đề, nút Xác nhận tham gia; tên khó đoán giới tính thì chào bằng họ tên");
  ok(/Chào Chị Tra/.test(mT.html) && /dành cho Chị Tra:/.test(mT.subject), "chào và tiêu đề thư gọi đúng 'Chị Tra'");
  ok(/Chỉ còn 2 chỗ/.test(mT.html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ")) && /\(chỉ còn 2 chỗ\)$/.test(mT.subject) && !/đồng nghiệp đã đăng ký/.test(mT.html), "số chỗ thật (ít chỗ thì nhấn 'Chỉ còn'); chưa ai đăng ký thì không ghi 'đồng nghiệp đã đăng ký'");
  const tB = tok(mB), tD = tok(mD), tT = tok(mT);
  r = await call("GET", "/api/program-join?t=" + encodeURIComponent(tB)); ok(r.j.ok && r.j.state === "open" && r.j.name === "Đào Xuân Bách", "mở liên kết (GET) chỉ đọc, CHƯA đăng ký");
  r = await call("POST", "/api/program-join", { t: tB, op: "join" }, null, true); ok(r.s === 400 || r.s === 403, "POST thiếu header chống giả mạo bị từ chối");
  r = await call("POST", "/api/program-join", { t: tB, op: "join" }); ok(r.j.state === "registered" && !r.j.already && r.j.program.left === 1, "Bách đăng ký: thành công, còn 1 chỗ");
  r = await call("POST", "/api/program-join", { t: tB, op: "join" }); ok(r.j.state === "registered" && r.j.already, "bấm lại: báo đã đăng ký, không tính trùng");
  r = await call("POST", "/api/program-join", { t: tB.slice(0, -3) + "abc", op: "join" }); ok(r.s === 400, "mã bị sửa -> từ chối");
  r = await call("POST", "/api/program-join", { t: tD, op: "join" }); ok(r.j.state === "registered" && r.j.program.left === 0, "Duy đăng ký: hết chỗ");
  r = await call("POST", "/api/program-join", { t: tT, op: "join" }); ok(r.j.state === "full", "Tra đăng ký khi đủ chỗ -> báo đã đủ chỗ");
  r = await call("POST", "/api/program-join", { t: tD, op: "cancel" }); ok(r.j.cancelled && r.j.state === "open", "Duy huỷ -> mở lại 1 chỗ");
  r = await call("POST", "/api/program-join", { t: tT, op: "join" }); ok(r.j.state === "registered", "Tra đăng ký được sau khi có chỗ");
  // ---- kỳ vọng & tình huống (không bắt buộc) ----
  r = await call("GET", "/api/program-join?t=" + encodeURIComponent(tB)); ok(r.j.ask && r.j.ask.opts.length === 6 && r.j.answer === null, "người đã đăng ký thấy câu hỏi kỳ vọng (mặc định 6 lựa chọn)");
  r = await call("POST", "/api/program-join", { t: tD, op: "answer", expect: "abc" }); ok(r.s === 400, "chưa đăng ký (đã huỷ) thì không gửi chia sẻ được");
  r = await call("POST", "/api/program-join", { t: tB, op: "answer" }); ok(r.s === 400, "gửi rỗng -> nhắc chọn hoặc viết");
  r = await call("POST", "/api/program-join", { t: tB, op: "answer", opts: ["Kỹ năng chốt đơn", "Lựa chọn bịa"], expect: "Muốn chốt nhanh hơn", story: "Khách chê đắt hơn bên khác 1 triệu" });
  ok(r.j.ok && r.j.saved && JSON.stringify(r.j.answer.opts) === '["Kỹ năng chốt đơn"]' && r.j.answer.story.indexOf("1 triệu") > 0, "lưu chia sẻ (bỏ lựa chọn không có trong danh sách)");
  r = await call("POST", "/api/program-join", { t: tB, op: "answer", opts: ["Xử lý lời từ chối"], story: "Đã sửa" }); ok(r.j.answer.opts[0] === "Xử lý lời từ chối" && r.j.answer.story === "Đã sửa" && r.j.answer.expect === "", "gửi lại = cập nhật");
  r = await call("GET", "/api/kt-program?op=detail&id=" + id, null, A);
  ok(r.j.answers.T030000475 && r.j.answers.T030000475.story === "Đã sửa" && r.j.program.answered === 1, "quản trị thấy câu trả lời + số người đã chia sẻ");
  r = await call("POST", "/api/kt-program", { op: "save", program: { title: "Lớp không hỏi", ask: false } }, A); const id2 = r.j.program.id;
  r = await call("POST", "/api/kt-program", { op: "send", id: id2, codes: ["T030000475"] }, A);
  const t2 = tok((await box()).filter((x) => x.to === "bach@livotec.vn").pop()); await call("POST", "/api/program-join", { t: t2, op: "join" });
  r = await call("POST", "/api/program-join", { t: t2, op: "answer", expect: "x" }); ok(r.s === 400, "chương trình tắt câu hỏi -> không nhận chia sẻ");
  r = await call("GET", "/api/program-join?t=" + encodeURIComponent(t2)); ok(r.j.ask === null, "tắt câu hỏi -> trang không hiện khung chia sẻ");
  await call("POST", "/api/kt-program", { op: "delete", id: id2 }, A);
  r = await call("GET", "/api/kt-program?op=detail&id=" + id, null, A);
  ok(Object.keys(r.j.regs).join() === "T030000475,T030000535" && r.j.cancels.T030000526 && Object.keys(r.j.invited).length === 3, "quản trị thấy đúng: 2 đăng ký, 1 huỷ, 3 đã mời");
  await call("POST", "/api/kt-program", { op: "setStatus", id, status: "closed" }, A);
  r = await call("POST", "/api/program-join", { t: tD, op: "join" }); ok(r.j.state === "closed", "đóng đăng ký -> không nhận thêm");
  r = await call("POST", "/api/program-join", { t: tB, op: "cancel" }); ok(r.j.locked && r.j.state === "registered", "đã đóng thì không tự huỷ được");
  await call("POST", "/api/kt-program", { op: "setStatus", id, status: "open" }, A);
  r = await call("POST", "/api/kt-program", { op: "save", program: Object.assign({}, (await call("GET", "/api/kt-program?op=detail&id=" + id, null, A)).j.program, { deadline: Date.now() - 1000 }) }, A);
  r = await call("POST", "/api/program-join", { t: tD, op: "join" }); ok(r.j.state === "expired", "quá hạn đăng ký -> báo hết hạn");
  await call("POST", "/api/kt-program", { op: "save", program: Object.assign({}, r.j.program, { id, title: "Khoá kỹ năng tư vấn máy lọc nước", deadline: 0, capacity: 5 }) }, A);
  r = await call("POST", "/api/kt-program", { op: "removeReg", id, code: "T030000535" }, A); ok(r.j.ok, "quản trị gỡ một người");
  r = await call("GET", "/api/kt-program?op=preview&id=" + id, null, A); ok(r.j.ok && /Nguyễn Văn An/.test(r.j.html) && /data:image\/jpeg;base64/.test(r.j.html) && !/cid:/.test(r.j.html) && /^Thư mời đăng ký/.test(r.j.subject), "xem trước email (ảnh nhúng sẵn + tiêu đề thư)");
  r = await call("GET", "/api/kt-program?op=list", null, A); ok(r.j.programs[0].regs === 1 && r.j.programs[0].invited === 3, "danh sách chương trình có số đếm");
  const day = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
  r = await call("GET", "/api/kt-admin?op=audit&day=" + day, null, A); ok((r.j.items || []).some((x) => x.label === "Gửi email mời tham gia chương trình học"), "nhật ký ghi thao tác gửi mời");
  console.log(pass + " đạt, " + fail + " lỗi");
  require("fs").writeFileSync("/tmp/pg.json", JSON.stringify({ A, id, tD, tT }));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
