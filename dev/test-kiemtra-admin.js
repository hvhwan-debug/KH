// Kiểm thử chức năng "Xoá tất cả câu hỏi" của trang quản trị (chạy trong tiến trình, bộ nhớ tạm):  node dev/test-kiemtra-admin.js
process.env.STORAGE_MODE = "memory"; process.env.MAIL_MODE = "memory";
process.env.SESSION_SECRET = "dev-session-secret-dev-session-secret-1234"; process.env.ALLOWED_EMAIL_DOMAINS = "x.vn";
process.env.ADMIN_EMAILS = "admin@x.vn";
const quiz = require("../api/_lib/quiz"), session = require("../api/_lib/session");
const admin = require("../api/kt-admin"), start = require("../api/kt-start"), submit = require("../api/kt-submit");
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? "PASS " : "FAIL ") + m); };
const tok = (e) => session.sessionValue(e);
async function call(fn, method, query, body, email) {
  const ctx = { log: Object.assign(() => {}, { error: () => {} }), res: null };
  const headers = { "x-sr-token": tok(email || "admin@x.vn"), "x-requested-with": "livotec" };
  await fn(ctx, { method, headers, query: query || {}, body });
  return { s: ctx.res.status, j: ctx.res.body };
}
(async () => {
  const qs = []; for (let i = 0; i < 6; i++) qs.push({ id: "q" + i, text: "Câu " + i, category: "Gia dụng", options: ["Đúng", "B", "C", "D"], correctIndex: 0, active: true });
  await quiz.saveQuestions(qs);
  await quiz.saveCandidates([{ code: "NV1", name: "A", email: "a@x.vn", segment: "gia_dung" }]);
  await quiz.saveSettings({ examTitle: "T", questionCount: 4, bothGiaDungCount: 0, secondsPerQuestion: 30, passScore: 60, allowRetake: false });

  let r = await call(admin, "POST", {}, { op: "deleteAllQuestions", confirm: "XOA TAT CA", expected: 6 }, "nguoi-la@x.vn");
  ok(r.s === 403 && (await quiz.getQuestions()).length === 6, "không phải quản trị viên: bị từ chối, không xoá gì");

  r = await call(admin, "GET", { op: "deleteAllPreview" }); ok(r.j.ok && r.j.count === 6 && r.j.inProgress === 0 && r.j.backup === null, "xem trước: 6 câu, chưa có ai làm dở, chưa có sao lưu");

  // có thí sinh đang làm dở
  const sctx = { log: { error() {} }, res: null }; await start(sctx, { method: "POST", headers: { "x-requested-with": "livotec" }, body: { code: "NV1", email: "a@x.vn" } });
  const att = sctx.res.body.attemptId; ok(sctx.res.body.ok, "(chuẩn bị) thí sinh bắt đầu làm bài");
  r = await call(admin, "GET", { op: "deleteAllPreview" }); ok(r.j.inProgress === 1, "xem trước: cảnh báo có 1 thí sinh đang làm dở");

  r = await call(admin, "POST", {}, { op: "deleteAllQuestions", expected: 6 }); ok(r.s === 400 && (await quiz.getQuestions()).length === 6, "thiếu cụm xác nhận: không xoá");
  r = await call(admin, "POST", {}, { op: "deleteAllQuestions", confirm: "xoa", expected: 6 }); ok(r.s === 400 && (await quiz.getQuestions()).length === 6, "cụm xác nhận sai: không xoá");
  r = await call(admin, "POST", {}, { op: "deleteAllQuestions", confirm: "XOA TAT CA", expected: 5 }); ok(r.s === 409 && (await quiz.getQuestions()).length === 6, "số lượng không khớp (danh sách đã đổi): chặn, không xoá");

  r = await call(admin, "POST", {}, { op: "deleteAllQuestions", confirm: "XOA TAT CA", expected: 6 });
  ok(r.s === 200 && r.j.deleted === 6 && (await quiz.getQuestions()).length === 0, "xác nhận đúng: xoá sạch 6 câu");
  r = await call(admin, "GET", { op: "questionsBackup" }); ok(r.j.backup && r.j.backup.count === 6, "đã tự sao lưu 6 câu trước khi xoá");
  r = await call(admin, "POST", {}, { op: "deleteAllQuestions", confirm: "XOA TAT CA", expected: 0 }); ok(r.s === 400, "ngân hàng trống: báo trống, không ghi đè bản sao lưu");
  r = await call(admin, "GET", { op: "questionsBackup" }); ok(r.j.backup.count === 6, "bản sao lưu vẫn còn nguyên sau lần bấm thừa");

  // ảnh hưởng tới thí sinh
  const c2 = { log: { error() {} }, res: null }; await start(c2, { method: "POST", headers: { "x-requested-with": "livotec" }, body: { code: "NV1", email: "a@x.vn" } });
  ok(c2.res.body.ok && c2.res.body.done === true, "thí sinh đang làm dở: bài kết thúc ngay vì hết câu hỏi");
  const c3 = { log: { error() {} }, res: null }; await submit(c3, { method: "POST", headers: { "x-requested-with": "livotec" }, body: { attemptId: att } });
  ok(c3.res.body.ok && c3.res.body.score === 0, "bài đó được chấm 0 điểm, không gây lỗi hệ thống");
  const c4 = { log: { error() {} }, res: null };
  await quiz.saveCandidates([{ code: "NV7", name: "G", email: "g@x.vn", segment: "gia_dung" }]);
  await start(c4, { method: "POST", headers: { "x-requested-with": "livotec" }, body: { code: "NV7", email: "g@x.vn" } });
  ok(c4.res.status === 503, "thí sinh mới: được báo 'ngân hàng đề chưa có câu hỏi' khi đề trống");

  // khôi phục
  r = await call(admin, "POST", {}, { op: "restoreQuestions" }); ok(r.j.ok && r.j.restored === 6 && (await quiz.getQuestions()).length === 6, "khôi phục: thêm lại đủ 6 câu");
  r = await call(admin, "POST", {}, { op: "restoreQuestions" }); ok(r.j.ok && r.j.restored === 0 && (await quiz.getQuestions()).length === 6, "khôi phục lần nữa: không tạo câu trùng");
  await quiz.saveQuestions([{ id: "moi", text: "Câu mới", category: "", options: ["a", "b"], correctIndex: 0, active: true }]);
  r = await call(admin, "POST", {}, { op: "restoreQuestions" }); ok(r.j.restored === 6 && (await quiz.getQuestions()).length === 7, "khôi phục khi đã có câu mới: giữ câu mới, thêm lại 6 câu cũ");
  console.log("\n" + pass + " đạt, " + fail + " lỗi"); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
