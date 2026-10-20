// Kiểm thử tài khoản QUẢN LÍ (chỉ xem kết quả + chỉnh/xác nhận thông tin nhân viên của mình):  node dev/test-kiemtra-viewer.js
process.env.STORAGE_MODE = "memory"; process.env.MAIL_MODE = "memory";
process.env.SESSION_SECRET = "dev-session-secret-dev-session-secret-1234"; process.env.ALLOWED_EMAIL_DOMAINS = "x.vn";
process.env.ADMIN_EMAILS = "admin@x.vn";
const quiz = require("../api/_lib/quiz"), session = require("../api/_lib/session");
const F = { admin: require("../api/kt-admin"), viewer: require("../api/kt-viewer"), start: require("../api/kt-start"), answer: require("../api/kt-answer"), submit: require("../api/kt-submit"), check: require("../api/kt-check"), resend: require("../api/kt-resend") };
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? "PASS " : "FAIL ") + m); };
async function call(fn, method, query, body, as) {
  const ctx = { log: Object.assign(() => {}, { error: () => {} }), res: null };
  const headers = { "x-requested-with": "livotec" }; if (as) headers["x-sr-token"] = session.sessionValue(as);
  await F[fn](ctx, { method, headers, query: query || {}, body });
  return { s: ctx.res.status, j: ctx.res.body };
}
const V = (m, q, b, as) => call("viewer", m, q, b, as || "loan@x.vn"), A = (m, q, b) => call("admin", m, q, b, "admin@x.vn");
(async () => {
  const qs = []; for (let i = 0; i < 4; i++) qs.push({ id: "q" + i, text: "Câu " + i, category: "Gia dụng", options: ["Đúng", "B", "C", "D"], correctIndex: 0, active: true });
  await quiz.saveQuestions(qs);
  await quiz.saveCandidates([
    { code: "NV1", name: "Nguyễn A", email: "a@x.vn", manager: "Lê Thị Thanh Loan", segment: "gia_dung" },
    { code: "NV2", name: "Trần B", email: "b@x.vn", manager: "le thi thanh loan", segment: "gia_dung" },
    { code: "NV3", name: "Hoàng C", email: "c@x.vn", manager: "Phạm D", segment: "gia_dung" }]);
  await quiz.saveSettings({ examTitle: "T", questionCount: 3, bothGiaDungCount: 0, secondsPerQuestion: 30, allowRetake: false });

  // --- Quản trị viên cấp tài khoản ---
  let r = await A("POST", {}, { op: "saveViewer", email: "khong-hop-le", scopes: "X" }); ok(r.s === 400, "cấp quyền: email sai định dạng bị từ chối");
  r = await A("POST", {}, { op: "saveViewer", email: "nguoi@gmail.com", scopes: "Lê Thị Thanh Loan" }); ok(r.s === 400 && /chưa được phép/.test(r.j.error), "cấp quyền: email ngoài tên miền cho phép bị từ chối (vì sẽ không đăng nhập được)");
  r = await A("POST", {}, { op: "saveViewer", email: "loan@x.vn", scopes: "" }); ok(r.s === 400, "cấp quyền: thiếu tên quản lí bị từ chối");
  r = await call("admin", "POST", {}, { op: "saveViewer", email: "loan@x.vn", scopes: "Lê Thị Thanh Loan" }, "loan@x.vn"); ok(r.s === 403, "tài khoản quản lí KHÔNG thể tự cấp quyền (không phải quản trị viên)");
  r = await A("POST", {}, { op: "saveViewer", email: "Loan@x.vn", name: "Lê Thị Thanh Loan", scopes: "Lê Thị Thanh Loan" }); ok(r.j.ok && r.j.created && r.j.viewer.employees === 2, "quản trị cấp quyền cho quản lí Loan: phạm vi có 2 nhân viên (không phân biệt hoa/thường, dấu)");
  await A("POST", {}, { op: "saveViewer", email: "pham@x.vn", name: "Phạm D", scopes: ["Phạm D"] });
  r = await A("GET", { op: "viewers" }); ok(r.j.viewers.length === 2 && r.j.managers.indexOf("Phạm D") >= 0, "danh sách quản lí + gợi ý tên quản lí từ danh sách thí sinh");

  // --- Phân quyền ---
  r = await V("GET", { op: "me" }, null, "la@x.vn"); ok(r.s === 403, "tài khoản chưa được cấp quyền quản lí: bị từ chối");
  r = await call("viewer", "GET", { op: "me" }, null, null); ok(r.s === 401, "chưa đăng nhập: bị từ chối");
  r = await V("GET", { op: "me" }); ok(r.j.ok && r.j.viewer.name === "Lê Thị Thanh Loan", "quản lí xem được thông tin tài khoản của mình");

  // --- Chỉ thấy nhân viên của mình + kết quả ---
  const run = async (code, email, answerAll) => {
    const s = await call("start", "POST", {}, { code, email }); let st = s.j;
    if (answerAll) { while (!st.done) { st = (await call("answer", "POST", {}, { attemptId: s.j.attemptId, questionId: st.question.id, answerIndex: st.question.options.indexOf("Đúng") })).j; } await call("submit", "POST", {}, { attemptId: s.j.attemptId }); }
    return s.j.attemptId;
  };
  await run("NV1", "a@x.vn", true); await run("NV2", "b@x.vn", false); await run("NV3", "c@x.vn", true);
  r = await V("GET", { op: "employees" }); const E = r.j.employees; const byCode = Object.fromEntries(E.map((e) => [e.code, e]));
  ok(E.length === 2 && byCode.NV1 && byCode.NV2 && !byCode.NV3, "quản lí Loan chỉ thấy 2 nhân viên của mình, KHÔNG thấy nhân viên của quản lí khác");
  ok(byCode.NV1.status === "done" && byCode.NV1.result.score === 3 && byCode.NV1.result.pct === 100 && byCode.NV1.result.passed === null && /^KT-/.test(byCode.NV1.result.proof) && byCode.NV1.result.verify.indexOf(".") > 0, "thấy kết quả: điểm, %, mã minh chứng, mã xác thực QR; bài không ngưỡng => không Đạt/Chưa đạt");
  ok(byCode.NV2.status === "doing" && byCode.NV2.result === null, "nhân viên đang làm bài dở hiển thị trạng thái 'đang làm'");
  ok(!JSON.stringify(E).includes("Đúng") && !JSON.stringify(E).includes("Câu 0"), "quản lí KHÔNG thấy nội dung câu hỏi / đáp án");
  r = await V("GET", { op: "employees" }, null, "pham@x.vn"); ok(r.j.employees.length === 1 && r.j.employees[0].code === "NV3", "quản lí Phạm chỉ thấy NV3");
  r = await V("GET", { op: "employee", code: "NV3" }); ok(r.s === 404, "xem chi tiết nhân viên của người khác: 404");

  // --- Sửa / điều chỉnh thông tin ---
  r = await V("POST", {}, { op: "updateEmployee", code: "NV3", name: "Hack" }); ok(r.s === 404 && (await quiz.getCandidates())[2].name === "Hoàng C", "sửa nhân viên của quản lí khác: bị chặn, dữ liệu không đổi");
  r = await V("POST", {}, { op: "updateEmployee", code: "NV1", name: "  " }); ok(r.s === 400, "họ tên trống: từ chối");
  r = await V("POST", {}, { op: "updateEmployee", code: "NV1", email: "sai" }); ok(r.s === 400, "email sai định dạng: từ chối");
  r = await V("POST", {}, { op: "updateEmployee", code: "NV1", email: "B@x.vn" }); ok(r.s === 409 && /NV2/.test(r.j.error), "email trùng nhân viên khác: từ chối, nêu rõ mã trùng");
  r = await V("POST", {}, { op: "updateEmployee", code: "NV1", segment: "linh-tinh" }); ok(r.s === 400, "nhóm ngành lạ: từ chối");
  r = await V("POST", {}, { op: "confirmEmployee", code: "NV1" }); ok(r.j.ok && r.j.employee.confirmed && r.j.employee.confirmed.byName === "Lê Thị Thanh Loan", "xác nhận thông tin nhân viên: ghi người xác nhận và thời điểm");
  r = await V("POST", {}, { op: "updateEmployee", code: "NV1", name: "Nguyễn Văn A", segment: "ca_hai", manager: "Phạm D", code2: "x" });
  ok(r.j.ok && r.j.employee.name === "Nguyễn Văn A" && r.j.employee.segment === "both" && r.j.needReconfirm && r.j.employee.confirmed === null, "sửa thông tin: lưu thành công và xác nhận cũ bị huỷ (cần xác nhận lại)");
  ok(r.j.employee.manager === "Lê Thị Thanh Loan", "không thể chuyển nhân viên sang quản lí khác (trường quản lí bị bỏ qua)");
  r = await V("POST", {}, { op: "updateEmployee", code: "NV1", name: "Nguyễn Văn A" }); ok(r.j.ok && r.j.unchanged === true, "gửi lại thông tin giống cũ: không ghi gì");
  r = await V("GET", { op: "employee", code: "NV1" }); ok(r.j.history.length === 2 && r.j.history[0].kind === "edit" && r.j.history[0].changes.name.from === "Nguyễn A" && r.j.history[0].changes.name.to === "Nguyễn Văn A" && r.j.history[1].kind === "confirm", "lịch sử chỉnh sửa: ghi ai sửa, sửa gì (từ → thành), cả lần xác nhận");
  r = await V("POST", {}, { op: "confirmEmployee", code: "NV1" }); ok(r.j.employee.confirmed && r.j.employee.confirmed.at > 0, "xác nhận lại sau khi sửa");
  r = await V("POST", {}, { op: "confirmEmployee", code: "NV3" }); ok(r.s === 404, "xác nhận nhân viên của người khác: bị chặn");

  // --- Không được xoá ---
  const before = { c: (await quiz.getCandidates()).length, i: (await quiz.getIndex()).length };
  for (const op of ["deleteResult", "deleteEmployee", "deleteCandidate", "clearResults", "removeResult"]) { r = await V("POST", {}, { op, code: "NV1", id: "x" }); ok(r.s === 403, "quản lí thử '" + op + "': bị từ chối (403)"); }
  r = await call("admin", "POST", {}, { op: "deleteCandidate", code: "NV1" }, "loan@x.vn"); ok(r.s === 403, "quản lí cũng không gọi được lệnh xoá của quản trị viên");
  ok((await quiz.getCandidates()).length === before.c && (await quiz.getIndex()).length === before.i, "dữ liệu nhân viên và kết quả vẫn nguyên vẹn");

  // --- Đổi email: thí sinh dùng email mới, kết quả gửi về email mới ---
  r = await V("POST", {}, { op: "updateEmployee", code: "NV1", email: "moi@x.vn" }); ok(r.j.ok && r.j.employee.email === "moi@x.vn", "quản lí đổi email nhân viên");
  r = await call("check", "POST", {}, { code: "NV1", email: "a@x.vn" }); ok(r.s === 404, "email cũ không còn vào được bài kiểm tra");
  r = await call("check", "POST", {}, { code: "NV1", email: "moi@x.vn" }); ok(r.j.ok && r.j.alreadyDone, "email mới vào được và thấy kết quả cũ");
  const mb0 = (global.__mailbox || []).length; r = await call("resend", "POST", {}, { code: "NV1", email: "moi@x.vn" });
  ok(r.j.ok && (global.__mailbox || [])[mb0].to === "moi@x.vn", "gửi lại email kết quả: tới email MỚI của nhân viên");

  // --- Quản trị nhập danh sách: thông tin đổi thì huỷ xác nhận, giữ lịch sử ---
  await V("POST", {}, { op: "confirmEmployee", code: "NV1" });
  r = await A("POST", {}, { op: "addCandidates", rows: [{ code: "NV1", name: "Nguyễn Văn A", email: "moi@x.vn", manager: "Lê Thị Thanh Loan", segment: "ca_hai" }] });
  ok((await quiz.getCandidates())[0].confirmed, "quản trị nhập lại đúng thông tin cũ: xác nhận được giữ nguyên");
  r = await A("POST", {}, { op: "addCandidates", rows: [{ code: "NV1", name: "Nguyễn Văn Anh", email: "moi@x.vn", manager: "Lê Thị Thanh Loan", segment: "ca_hai" }] });
  { const c = (await quiz.getCandidates())[0]; ok(!c.confirmed && c.audit.length >= 4, "quản trị đổi thông tin qua danh sách: xác nhận bị huỷ, lịch sử được giữ"); }
  r = await A("POST", {}, { op: "deleteViewer", email: "pham@x.vn" }); r = await V("GET", { op: "employees" }, null, "pham@x.vn"); ok(r.s === 403, "thu hồi quyền quản lí: mất quyền ngay");
  console.log("\n" + pass + " đạt, " + fail + " lỗi"); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
