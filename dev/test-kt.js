// Kiểm thử luồng kiểm tra (kt-*): chạy  node dev/test-kt.js   (dùng bộ nhớ tạm, không đụng dữ liệu thật)
process.env.STORAGE_MODE = "memory"; process.env.MAIL_MODE = "memory"; process.env.COOKIE_INSECURE = "1";
process.env.SESSION_SECRET = "test-session-secret-test-session-secret-12";
process.env.ALLOWED_EMAIL_DOMAINS = "*"; process.env.ADMIN_EMAILS = "admin@x.vn";
const path = require("path"), assert = require("assert");
const { sessionValue } = require("../api/_lib/session");
const H = (n) => require(path.join("..", "api", n, "index.js"));
const fn = { check: H("kt-check"), start: H("kt-start"), answer: H("kt-answer"), submit: H("kt-submit"), admin: H("kt-admin") };
const adminCookie = "sr_session=" + sessionValue("admin@x.vn");

async function call(f, method, body, query, cookie) {
  const ctx = { log: Object.assign(() => {}, { error: console.error }), res: null };
  await f(ctx, { method, headers: { "x-requested-with": "livotec", cookie: cookie || "" }, body, query: query || {} });
  return Object.assign({ s: ctx.res.status }, ctx.res.body);
}
const admin = (b) => call(fn.admin, "POST", b, null, adminCookie);
const adminGet = (op, extra) => call(fn.admin, "GET", null, Object.assign({ op }, extra || {}), adminCookie);

(async () => {
  // Chuẩn bị: 12 câu Gia dụng + 12 câu Máy lọc nước + 3 câu Kiến thức khác
  const qs = [];
  for (let i = 0; i < 12; i++) qs.push({ text: "GD câu " + i, options: ["a", "b", "c", "d"], correctIndex: i % 4, category: "Gia dụng" });
  for (let i = 0; i < 12; i++) qs.push({ text: "ML câu " + i, options: ["a", "b", "c", "d"], correctIndex: 0, category: "Máy lọc nước" });
  for (let i = 0; i < 3; i++) qs.push({ text: "KT câu " + i, options: ["a", "b", "c"], correctIndex: 1, category: "Kiến thức khác" });
  let r = await admin({ op: "addQuestions", questions: qs.concat([{ text: "gd câu 0", options: ["a", "b"], correctIndex: 0 }, { text: "x", options: ["a", "a"], correctIndex: 0 }]) });
  assert.equal(r.added, 27); assert.equal(r.duplicates, 1); assert.equal(r.skipped, 1);

  r = await admin({ op: "saveSettings", examTitle: "Thử", questionCount: 5, bothGiaDungCount: 2, secondsPerQuestion: 20, passScore: 60, allowRetake: false, complianceEnabled: true, complianceHighMin: 9, complianceMidMin: 7, complianceLowMin: 6 });
  assert(r.ok, JSON.stringify(r));
  r = await admin({ op: "saveSettings", complianceHighMin: 5, complianceMidMin: 7, complianceLowMin: 6 });
  assert.equal(r.s, 400, "mốc điểm sai thứ tự phải bị từ chối");

  r = await admin({ op: "addCandidates", text: "NV1, An, an@x.vn, Quản lí A, ca_hai\nNV2, Bình, binh@x.vn, , gia_dung\nNV3, Hỏng, khong-email, , may_loc\nNV4; Dũng; dung@x.vn" });
  assert.equal(r.added, 3); assert.equal(r.errors.length, 1);

  // Đối chiếu sai
  assert.equal((await call(fn.check, "POST", { code: "nv1", email: "sai@x.vn" })).s, 404);
  r = await call(fn.check, "POST", { code: "nv1", email: "AN@x.vn" });
  assert.equal(r.state, "ready");

  // Bắt đầu + chọn đề theo nhóm ngành
  r = await call(fn.start, "POST", { code: "NV1", email: "an@x.vn" });
  assert(r.ok && !r.resumed && r.total === 5 && r.index === 0);
  assert(!("correct" in r.question) && !("correctIndex" in r.question), "không được lộ đáp án");
  const id = r.attemptId; const first = r.question.id;

  // Bắt đầu lần 2 phải làm tiếp đúng bài cũ (không đổi đề)
  let r2 = await call(fn.start, "POST", { code: "NV1", email: "an@x.vn" });
  assert(r2.resumed && r2.attemptId === id && r2.question.id === first);
  assert.equal((await call(fn.check, "POST", { code: "NV1", email: "an@x.vn" })).state, "resume");

  // Gửi sai questionId -> đồng bộ lại, không ghi nhầm
  r2 = await call(fn.answer, "POST", { attemptId: id, questionId: "khong-phai", answerIndex: 0 });
  assert(r2.synced && r2.question.id === first && r2.index === 0);

  // Nộp sớm khi chưa làm hết -> bị từ chối
  assert.equal((await call(fn.submit, "POST", { attemptId: id })).s, 409);

  // Làm 5 câu: lấy đáp án đúng từ attempt (qua store) để chấm thử 3/5
  const quiz = require("../api/_lib/quiz");
  const att = await quiz.getAttempt(id);
  const segCats = att.items.map((i) => i.category);
  assert.equal(segCats.filter((c) => c === "Gia dụng").length, 2, "ca_hai: đúng 2 câu Gia dụng cố định");
  let st = r;
  for (let i = 0; i < 5; i++) {
    const it = att.items[i];
    const ans = i < 3 ? it.correct : (it.correct + 1) % it.options.length;
    st = await call(fn.answer, "POST", { attemptId: id, questionId: st.question.id, answerIndex: ans });
    assert(st.ok);
  }
  assert(st.done);
  r = await call(fn.submit, "POST", { attemptId: id });
  assert(r.ok && r.score === 3 && r.total === 5 && r.pct === 60 && r.passed === true && r.compliancePoints === 10, JSON.stringify(r));
  assert.equal(global.__mailbox.length, 1, "phải gửi 1 email kết quả");
  // Nộp lại -> idempotent, không gửi email lần nữa
  r = await call(fn.submit, "POST", { attemptId: id }); assert(r.ok && r.score === 3);
  assert.equal(global.__mailbox.length, 1);

  // Không được làm lại
  assert.equal((await call(fn.start, "POST", { code: "NV1", email: "an@x.vn" })).s, 409);
  assert.equal((await call(fn.check, "POST", { code: "NV1", email: "an@x.vn" })).state, "done");

  // Nhóm 1 ngành chỉ lấy đúng danh mục
  r = await call(fn.start, "POST", { code: "NV2", email: "binh@x.vn" });
  const a2 = await quiz.getAttempt(r.attemptId);
  assert(a2.items.every((i) => i.category === "Gia dụng"));

  // Hết giờ theo máy chủ: lùi mốc thời gian của bài NV2 để mô phỏng bỏ đi quá lâu
  a2.qStartedAt -= 1000 * 60 * 60; a2.startedAt -= 1000 * 60 * 60; await quiz.putAttempt(a2);
  r = await call(fn.check, "POST", { code: "NV2", email: "binh@x.vn" });
  assert.equal(r.state, "done", "bỏ đi quá hạn thì bài tự chốt, không được đổi đề làm lại");
  const fin = await quiz.getAttempt(a2.id);
  assert.equal(fin.status, "submitted"); assert.equal(fin.score, 0);

  // Sửa câu hỏi sau khi thi không đổi kết quả đã chấm
  const bank = await quiz.getQuestions();
  bank.forEach((q) => { q.correctIndex = (q.correctIndex + 1) % q.options.length; }); await quiz.saveQuestions(bank);
  const d = await adminGet("result", { id });
  assert.equal(d.attempt.score, 3); assert.equal(d.detail.filter((x) => x.chosenIndex === x.correctIndex).length, 3);

  // Đóng bài -> thí sinh mới không vào được
  await admin({ op: "saveSettings", examTitle: "Thử", enabled: false, questionCount: 5, bothGiaDungCount: 2, secondsPerQuestion: 20, passScore: 60, complianceEnabled: true, complianceHighMin: 9, complianceMidMin: 7, complianceLowMin: 6 });
  assert.equal((await call(fn.start, "POST", { code: "NV4", email: "dung@x.vn" })).s, 403);
  await admin({ op: "saveSettings", examTitle: "Thử", enabled: true, questionCount: 5, bothGiaDungCount: 2, secondsPerQuestion: 20, passScore: 60, complianceEnabled: true, complianceHighMin: 9, complianceMidMin: 7, complianceLowMin: 6 });

  // Quản trị: kết quả, huỷ bài để làm lại, thống kê câu
  r = await adminGet("results"); assert.equal(r.results.filter((x) => x.status === "submitted").length, 2);
  r = await adminGet("itemstats"); assert(r.items.length > 0);
  assert((await admin({ op: "voidAttempt", id })).ok);
  assert.equal((await call(fn.check, "POST", { code: "NV1", email: "an@x.vn" })).state, "ready", "sau khi huỷ thì được làm lại");
  assert.equal((await call(fn.admin, "GET", null, { op: "questions" })).s, 401, "không đăng nhập không vào được quản trị");

  // Nộp đồng thời nhiều người: không mất bản ghi nào
  const cands = []; for (let i = 0; i < 25; i++) cands.push("C" + i + ", T" + i + ", t" + i + "@x.vn, , gia_dung");
  await admin({ op: "addCandidates", text: cands.join("\n") });
  await Promise.all(cands.map(async (_, i) => {
    let s = await call(fn.start, "POST", { code: "C" + i, email: "t" + i + "@x.vn" });
    while (!s.done && s.question) s = await call(fn.answer, "POST", { attemptId: s.attemptId || id, questionId: s.question.id, answerIndex: 0 }).then((x) => Object.assign({ attemptId: s.attemptId }, x));
    await call(fn.submit, "POST", { attemptId: s.attemptId });
  }));
  r = await adminGet("results");
  assert.equal(r.results.filter((x) => x.status === "submitted").length, 2 - 1 + 25, "25 bài nộp song song đều phải được ghi nhận");
  console.log("Tất cả kiểm thử đạt.");
})().catch((e) => { console.error("THẤT BẠI:", e.message); process.exit(1); });
