// Kiểm thử "vé đăng nhập bằng khuôn mặt": đã đăng nhập bằng khuôn mặt thì bắt đầu làm bài không phải quét mặt lần hai.
// Chạy: node dev/test-facepass.js
process.env.STORAGE_MODE = "memory"; process.env.MAIL_MODE = "memory"; process.env.FACE_IDENTITY = "off";
process.env.SESSION_SECRET = "dev-session-secret-dev-session-secret-1234"; process.env.ALLOWED_EMAIL_DOMAINS = "x.vn";
const quiz = require("../api/_lib/quiz");
const fp = require("../api/_lib/facepass");
const H = { "x-requested-with": "livotec" };
const fn = { check: require("../api/kt-check"), start: require("../api/kt-start") };
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? "PASS " : "FAIL ") + m); };
async function call(name, body) {
  const ctx = { log: Object.assign(() => {}, { error: console.error, warn: () => {} }), res: null };
  await fn[name](ctx, { method: "POST", headers: H, body, query: {} });
  return { s: ctx.res.status, j: ctx.res.body };
}
const PHOTO = "data:image/jpeg;base64," + Buffer.from("anh-dang-nhap").toString("base64");
const OTHER = "data:image/jpeg;base64," + Buffer.from("anh-khac").toString("base64");
(async () => {
  const qs = []; for (let i = 0; i < 12; i++) qs.push({ id: "q" + i, text: "Câu " + i, category: "Gia dụng", options: ["A", "B", "C", "D"], correctIndex: 0, active: true });
  await quiz.saveQuestions(qs);
  await quiz.saveCandidates([{ code: "NV1", name: "A", email: "a@x.vn", segment: "both", phone: "0912345678", province: "Hà Nội", region: "bac" }, { code: "NV2", name: "B", email: "b@x.vn", segment: "both", phone: "0912345679", province: "Hà Nội", region: "bac" }]);
  await quiz.saveSettings({ examTitle: "T", questionCount: 5, bothGiaDungCount: 2, secondsPerQuestion: 30, sharedUniform: true });
  ok((await quiz.upsertExam({ id: "de-a", title: "Đề A", questionCount: 5, sharedUniform: true })).ok, "tạo đề A (mặc định bật bỏ quét lần hai)");
  ok((await quiz.upsertExam({ id: "de-b", title: "Đề B", questionCount: 5, sharedUniform: true, faceLoginSkip: false })).ok, "tạo đề B (tắt)");
  for (const id of ["de-a", "de-b"]) { const q2 = qs.map((q) => Object.assign({}, q, { id: id + q.id, period: id })); await quiz.saveQuestions((await quiz.getQuestions()).concat(q2)); }

  ok((await quiz.getExamSettings("de-a")).faceLoginSkip === true, "cài đặt đề A: faceLoginSkip = true");
  ok((await quiz.getExamSettings("de-b")).faceLoginSkip === false, "cài đặt đề B: faceLoginSkip = false");
  let r = await call("check", { code: "NV1", email: "a@x.vn", examId: "de-a" });
  ok(r.s === 200 && r.j.exam.faceLoginSkip === true, "kt-check trả faceLoginSkip cho giao diện");

  const tok = fp.issue("NV1", PHOTO, { distance: 0.31, second: 0.6, ai: true });
  ok(fp.verify(tok, "nv1", PHOTO).ok, "vé hợp lệ với đúng mã + đúng ảnh");
  ok(fp.verify(tok, "NV2", PHOTO).reason === "code", "vé không dùng được cho mã khác");
  ok(fp.verify(tok, "NV1", OTHER).reason === "photo", "vé không dùng được với ảnh khác");
  ok(fp.verify(tok.slice(0, -2) + "xx", "NV1", PHOTO).reason === "invalid", "vé bị sửa -> không hợp lệ");

  r = await call("start", { code: "NV2", email: "b@x.vn", examId: "de-a", photo: PHOTO, facePass: tok });
  ok(r.s === 409 && r.j.facePassRejected, "người khác dùng vé của NV1 -> từ chối, phải quét mặt");
  r = await call("start", { code: "NV1", email: "a@x.vn", examId: "de-b", photo: PHOTO, facePass: tok });
  ok(r.s === 409 && r.j.facePassRejected, "đề B tắt tuỳ chọn -> phải quét mặt lại");
  r = await call("start", { code: "NV1", email: "a@x.vn", examId: "de-a", photo: PHOTO, facePass: tok });
  ok(r.s === 200 && r.j.attemptId, "đề A + vé hợp lệ -> vào bài ngay, không quét lần hai");
  const att = await quiz.getAttempt(r.j.attemptId);
  ok(att && att.photo === PHOTO && att.faceCheck.by === "faceLogin" && att.faceCheck.status === "ok", "ảnh lúc đăng nhập được lưu làm ảnh xác nhận, ghi nhận 'đã xác minh khi đăng nhập'");
  process.env.FACE_PASS = "off";
  ok(fp.issue("NV1", PHOTO) === "" && !fp.verify(tok, "NV1", PHOTO).ok, "FACE_PASS=off tắt toàn hệ thống");
  console.log("\n" + pass + " đạt, " + fail + " lỗi"); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
