// Kiểm thử trang xác nhận nhân sự (/kiemtra/xacnhan.html): quản lí bấm "Còn làm" / "Đã nghỉ" cho nhân viên của mình.  node dev/test-xacnhan.js
process.env.STORAGE_MODE = "memory"; process.env.MAIL_MODE = "memory";
process.env.SESSION_SECRET = "dev-session-secret-dev-session-secret-1234"; process.env.ALLOWED_EMAIL_DOMAINS = "x.vn";
process.env.ADMIN_EMAILS = "admin@x.vn";
const quiz = require("../api/_lib/quiz"), session = require("../api/_lib/session");
const F = { admin: require("../api/kt-admin"), viewer: require("../api/kt-viewer"), start: require("../api/kt-start") };
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? "PASS " : "FAIL ") + m); };
async function call(fn, method, query, body, as) {
  const ctx = { log: Object.assign(() => {}, { error: () => {} }), res: null };
  const headers = { "x-requested-with": "livotec" }; if (as) headers["x-sr-token"] = session.sessionValue(as);
  await F[fn](ctx, { method, headers, query: query || {}, body });
  return { s: ctx.res.status, j: ctx.res.body };
}
const V = (m, q, b, as) => call("viewer", m, q, b, as || "loan@x.vn"), A = (m, q, b) => call("admin", m, q, b, "admin@x.vn");
(async () => {
  await quiz.saveCandidates([
    { code: "NV1", name: "Nguyễn A", email: "a@x.vn", manager: "Lê Thị Thanh Loan", segment: "gia_dung" },
    { code: "NV2", name: "Trần B", email: "b@x.vn", manager: "Lê Thị Thanh Loan", segment: "gia_dung" },
    { code: "NV3", name: "Hoàng C", email: "c@x.vn", manager: "Phạm D", segment: "gia_dung" }]);
  await A("POST", {}, { op: "saveViewer", email: "loan@x.vn", name: "Lê Thị Thanh Loan", scopes: "Lê Thị Thanh Loan" });
  await A("POST", {}, { op: "saveViewer", email: "xem@x.vn", name: "Chỉ xem", scopes: "Lê Thị Thanh Loan", perms: { viewResults: true, editEmployees: false } });

  let r = await V("GET", { op: "workStatus" });
  ok(r.j.ok && r.j.employees.length === 2 && r.j.canEdit, "quản lí thấy đúng 2 nhân viên của mình, có quyền xác nhận");
  ok(r.j.employees.every((e) => !e.left && !e.work), "ban đầu chưa ai được xác nhận");
  r = await call("viewer", "GET", { op: "workStatus" }, null, null); ok(r.s === 401, "chưa đăng nhập: bị từ chối");
  r = await V("GET", { op: "workStatus" }, null, "la@x.vn"); ok(r.s === 403, "không phải quản lí: bị từ chối");

  r = await V("POST", {}, { op: "setEmployment", code: "NV1", left: false });
  ok(r.j.ok && r.j.employee.work.status === "active" && !r.j.employee.left, "bấm Còn làm: ghi nhận đang làm + người xác nhận");
  r = await V("POST", {}, { op: "setEmployment", code: "NV2", left: true });
  ok(r.j.ok && r.j.employee.left && r.j.employee.work.status === "left" && r.j.changed, "bấm Đã nghỉ: đánh dấu nghỉ việc");
  let c2 = (await quiz.getCandidates()).find((c) => c.code === "NV2");
  ok(c2.left === true && c2.leftAt > 0 && c2.audit.some((a) => a.by === "loan@x.vn"), "hồ sơ lưu đã nghỉ + nhật ký ghi người bấm");
  r = await call("start", "POST", {}, { code: "NV2", email: "b@x.vn" });
  ok(!r.j.ok || /nghỉ việc/.test(JSON.stringify(r.j)), "người đã nghỉ không vào thi được");

  r = await V("POST", {}, { op: "setEmployment", code: "NV2", clear: true });
  c2 = (await quiz.getCandidates()).find((c) => c.code === "NV2");
  ok(r.j.ok && !c2.left && !c2.work, "hoàn tác: trở về chưa xác nhận");

  r = await V("POST", {}, { op: "setEmployment", code: "NV3", left: true }); ok(r.s === 404, "không đánh dấu được nhân viên của quản lí khác");
  ok(!(await quiz.getCandidates()).find((c) => c.code === "NV3").left, "nhân viên quản lí khác không bị đổi");
  r = await V("POST", {}, { op: "setEmployment", code: "NV1" }); ok(r.s === 400, "thiếu trạng thái: bị từ chối");
  r = await V("POST", {}, { op: "setEmployment", code: "NV1", left: true }, "xem@x.vn"); ok(r.s === 403, "tài khoản chỉ xem không được bấm");
  r = await V("GET", { op: "workStatus" }, null, "xem@x.vn"); ok(r.j.ok && r.j.canEdit === false, "tài khoản chỉ xem: trang hiện chế độ chỉ xem");
  r = await A("GET", { op: "people" }); ok(r.j.ok, "trang quản trị vẫn đọc danh sách bình thường");

  console.log("\n" + pass + " đạt, " + fail + " lỗi"); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
