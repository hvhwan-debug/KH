// Thẻ kết quả "sống" trong email: ảnh vẽ lại từ dữ liệu mới nhất, có chữ ký, đổi khi bài được chấm lại.  node dev/test-result-img.js
process.env.STORAGE_MODE = "memory"; process.env.MAIL_MODE = "memory";
process.env.SESSION_SECRET = "dev-session-secret-dev-session-secret-1234"; process.env.APP_URL = "https://kh.io.vn";
const crypto = require("crypto");
const quiz = require("../api/_lib/quiz");
const handler = require("../api/result-img");
const { build } = require("../api/_lib/resultemail");
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? "PASS " : "FAIL ") + m); };
const call = async (q) => { const ctx = { log: Object.assign(() => {}, { error: () => {} }), res: null }; await handler(ctx, { method: "GET", headers: {}, query: q }); return ctx.res; };
(async () => {
  const now = Date.now();
  const at = { id: "att1", name: "Tổng Khánh Linh", code: "T1", email: "t@x.vn", total: 10, score: 4, wrong: 6, blank: 0, pct: 40, startedAt: now - 600000, submittedAt: now, period: "", status: "submitted" };
  await quiz.saveSettings({ examTitle: "Kiểm tra định kì", passEnabled: true, passScore: 60 });
  await quiz.putAttempt(at);
  const s = handler.sig("att1");
  let r = await call({ a: "att1", s });
  ok(r.status === 200 && r.isRaw && r.headers["Content-Type"] === "image/png" && r.body.slice(1, 4).toString() === "PNG", "chữ ký đúng: trả ảnh PNG");
  ok(/no-store/.test(r.headers["Cache-Control"]), "không cho lưu đệm: mỗi lần mở thư tải lại");
  const before = crypto.createHash("md5").update(r.body).digest("hex");
  at.score = 9; at.pct = 90; at.wrong = 1; await quiz.putAttempt(at);   // quản trị sửa đáp án và chấm lại
  r = await call({ a: "att1", s });
  ok(r.status === 200 && crypto.createHash("md5").update(r.body).digest("hex") !== before, "chấm lại (4/10 -> 9/10): ảnh đổi theo, thư cũ cũng đổi");
  r = await call({ a: "att1", s: "x".repeat(22) });
  ok(r.status === 404, "sai chữ ký: 404");
  r = await call({ a: "att2", s: handler.sig("att2") });
  ok(r.status === 404, "bài không tồn tại: 404");
  at.status = "in_progress"; await quiz.putAttempt(at);
  r = await call({ a: "att1", s });
  ok(r.status === 404, "bài chưa nộp: 404 (không lộ điểm dở dang)");
  at.status = "submitted"; await quiz.putAttempt(at);
  const live = "https://kh.io.vn/api/result-img?a=att1&s=" + s;
  const m1 = build(at, { examTitle: "Kiểm tra định kì", passEnabled: true, passScore: 60 }, null, { live });
  ok(m1.html.indexOf(live.replace(/&/g, "&amp;")) > 0 && m1.html.indexOf("Chúc mừng") < 0, "email dùng ảnh sống và không còn hộp nhận xét tĩnh");
  const m2 = build(at, { examTitle: "Kiểm tra định kì", passEnabled: true, passScore: 60 }, null, {});
  ok(m2.html.indexOf("result-img") < 0 && m2.html.indexOf("Chúc mừng") > 0, "không có live: giữ thẻ tĩnh như cũ");
  // số lần thoát khỏi màn hình khi làm bài
  at.flags = { blur: 0 }; await quiz.putAttempt(at); r = await call({ a: "att1", s }); const h0 = crypto.createHash("md5").update(r.body).digest("hex");
  at.flags = { blur: 4 }; await quiz.putAttempt(at); r = await call({ a: "att1", s }); const h4 = crypto.createHash("md5").update(r.body).digest("hex");
  ok(r.status === 200 && h0 !== h4, "ảnh sống đổi theo số lần thoát khỏi màn hình (0 -> 4 lần)");
  const m3 = build(Object.assign({}, at, { flags: { blur: 2 } }), { examTitle: "Kiểm tra định kì" }, null, {});
  ok(/Số lần thoát khỏi màn hình khi làm bài/.test(m3.html) && />2 lần</.test(m3.html) && /thoát khỏi màn hình khi làm bài: 2 lần/.test(m3.text), "thẻ tĩnh và bản chữ cũng ghi số lần thoát khỏi màn hình");
  const m4 = build(Object.assign({}, at, { flags: undefined }), { examTitle: "Kiểm tra định kì" }, null, {});
  ok(/>0 lần</.test(m4.html), "bài không có dữ liệu cờ: ghi 0 lần, không lỗi");
  // tổng thời gian rời khỏi màn hình (cộng từ nhật ký sự kiện)
  const evs = [{ k: "tab", t: now - 500000, ms: 28000 }, { k: "tab", t: now - 400000, ms: 54000 }, { k: "blur", t: now - 300000, ms: 22000 }, { k: "net", t: now - 200000, ms: 99000 }];
  const m5 = build(Object.assign({}, at, { flags: { blur: 3 }, events: evs }), { examTitle: "Kiểm tra định kì" }, null, {});
  ok(/Tổng thời gian rời khỏi màn hình:[^<]*<b[^>]*>1 phút 44 giây</.test(m5.html) && /tổng thời gian rời: 1 phút 44 giây/.test(m5.text), "tổng thời gian rời = tab + blur (28+54+22 = 104 giây), không tính mất mạng");
  const m6 = build(Object.assign({}, at, { flags: { blur: 0 }, events: evs }), { examTitle: "Kiểm tra định kì" }, null, {});
  ok(m6.html.indexOf("Tổng thời gian rời") < 0, "0 lần: không hiện dòng tổng thời gian");
  at.flags = { blur: 3 }; at.events = evs; await quiz.putAttempt(at); r = await call({ a: "att1", s }); const hAw = crypto.createHash("md5").update(r.body).digest("hex");
  at.events = []; await quiz.putAttempt(at); r = await call({ a: "att1", s }); const hNo = crypto.createHash("md5").update(r.body).digest("hex");
  ok(hAw !== hNo, "ảnh sống đổi theo tổng thời gian rời");
  console.log("\n" + pass + " pass, " + fail + " fail"); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
