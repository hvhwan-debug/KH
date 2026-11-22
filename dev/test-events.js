// Kiểm thử nhật ký hành vi khi làm bài: sự kiện trình duyệt gửi kèm câu trả lời / nộp bài; máy chủ tự ghi "tải lại trang"
// (vào lại cùng trình duyệt) và "đăng nhập thiết bị khác" (vào lại từ trình duyệt / thiết bị khác). Chạy: node dev/test-events.js
process.env.STORAGE_MODE = "memory"; process.env.MAIL_MODE = "memory"; process.env.FACE_IDENTITY = "off";
process.env.SESSION_SECRET = "dev-session-secret-dev-session-secret-1234"; process.env.ALLOWED_EMAIL_DOMAINS = "x.vn";
const quiz = require("../api/_lib/quiz"), fp = require("../api/_lib/facepass"), EVL = require("../api/_lib/events");
const fn = { start: require("../api/kt-start"), answer: require("../api/kt-answer"), submit: require("../api/kt-submit") };
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? "PASS " : "FAIL ") + m); };
const UA_PC = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const UA_PHONE = "Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36";
async function call(name, body, ua, cookie) {
  const ctx = { log: Object.assign(() => {}, { error: console.error, warn: () => {} }), res: null };
  const headers = { "x-requested-with": "livotec", "user-agent": ua || UA_PC, "x-forwarded-for": "10.9.9.9" }; if (cookie) headers.cookie = cookie;
  await fn[name](ctx, { method: "POST", headers, body, query: {} }); return { s: ctx.res.status, j: ctx.res.body };
}
const PHOTO = "data:image/jpeg;base64," + Buffer.from("anh-dang-nhap").toString("base64");
(async () => {
  const qs = []; for (let i = 0; i < 6; i++) qs.push({ id: "q" + i, text: "Câu " + i, category: "Gia dụng", options: ["A", "B", "C", "D"], correctIndex: 0, active: true, period: "de-a" });
  await quiz.saveQuestions(qs);
  await quiz.saveCandidates([{ code: "NV1", name: "A", email: "a@x.vn", segment: "both", phone: "0912345678", province: "Hà Nội", region: "bac" }]);
  await quiz.upsertExam({ id: "de-a", title: "Đề A", questionCount: 4, sharedUniform: true, secondsPerQuestion: 60 });
  const start = (ua, cookie) => call("start", { code: "NV1", email: "a@x.vn", examId: "de-a", photo: PHOTO, facePass: fp.issue("NV1", PHOTO, { distance: .3, second: .6, ai: true }) }, ua, cookie);
  const BID = "kt_bid=AAAAAAAAAAAAAAAAAAAAAA";
  let r = await start(UA_PC, BID);
  ok(r.s === 200 && r.j.attemptId && !r.j.resumed, "bắt đầu làm bài");
  const id = r.j.attemptId, t0 = Date.now() - 100000;
  let a = await quiz.getAttempt(id); a.startedAt = t0 - 1000; await quiz.putAttempt(a); const q0 = a.questionIds[0]; // giả như đã làm bài được gần 2 phút
  r = await call("answer", { attemptId: id, questionId: q0, answerIndex: 0, ev: [
    { k: "tab", t: t0 + 1000, ms: 4200 }, { k: "min", t: t0 + 9000, ms: 15000 }, { k: "fs", t: t0 + 30000, ms: 2500 }, { k: "net", t: t0 + 40000, ms: 8000 },
    { k: "reload", t: t0 + 41000 }, { k: "dev", t: t0 + 42000, d: "giả mạo" }, { k: "hack", t: t0 + 43000 }, { k: "tab", t: t0 - 3600000, ms: 1 } ] }, UA_PC, BID);
  a = await quiz.getAttempt(id);
  const kinds = (a.events || []).map((e) => e.k).join(",");
  ok(r.s === 200 && kinds === "tab,min,fs,net", "nhận chuyển tab / thu nhỏ / thoát toàn màn hình / mất kết nối kèm câu trả lời (" + kinds + ")");
  ok(!/reload|dev|hack/.test(kinds), "trình duyệt KHÔNG tự khai được 'tải lại' / 'thiết bị khác' / loại lạ; thời điểm vô lý bị bỏ");
  ok(a.events[1].ms === 15000 && a.events[0].t === t0 + 1000, "ghi đúng thời điểm và thời lượng");
  await call("answer", { attemptId: id, questionId: a.questionIds[1], answerIndex: 0, ev: [{ k: "tab", t: t0 + 1000, ms: 4200 }] }, UA_PC, BID);
  a = await quiz.getAttempt(id);
  ok(a.events.filter((e) => e.k === "tab").length === 1, "gửi lại do mất mạng -> không ghi trùng");

  r = await start(UA_PC, BID);
  a = await quiz.getAttempt(id);
  ok(r.j.resumed && a.events.some((e) => e.k === "reload"), "vào lại cùng trình duyệt -> máy chủ ghi 'Tải lại trang'");
  r = await start(UA_PHONE, "kt_bid=BBBBBBBBBBBBBBBBBBBBBB");
  a = await quiz.getAttempt(id);
  const dev = a.events.filter((e) => e.k === "dev");
  ok(dev.length === 1 && /Android|Samsung|điện thoại|Mobile|SM-A546E/i.test(dev[0].d || ""), "vào lại từ điện thoại khác -> 'Đăng nhập thiết bị khác' kèm thiết bị (" + (dev[0] && dev[0].d) + ")");
  r = await start(UA_PC, "kt_bid=CCCCCCCCCCCCCCCCCCCCCC");
  a = await quiz.getAttempt(id);
  ok(a.events.filter((e) => e.k === "dev").length === 2, "cùng loại máy nhưng trình duyệt khác (mã trình duyệt khác) -> cũng là thiết bị khác");

  r = await call("submit", { attemptId: id, ev: [{ k: "blur", t: Date.now() - 2000, ms: 1500 }] }, UA_PC, BID);
  a = await quiz.getAttempt(id);
  ok(r.s === 200 && a.status === "submitted" && a.events.some((e) => e.k === "blur"), "sự kiện cuối gửi kèm lúc nộp bài");
  const sm = EVL.summary(a);
  ok(sm.tab.n === 1 && sm.min.ms === 15000 && sm.reload.n === 1 && sm.dev.n === 2, "tóm tắt theo loại: số lần + tổng thời lượng");
  console.log("\n" + pass + " đạt, " + fail + " lỗi"); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
