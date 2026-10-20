// Kiểm thử luồng làm bài (chạy trực tiếp các hàm API với bộ nhớ tạm, không cần máy chủ):  node dev/test-kiemtra.js
process.env.STORAGE_MODE = "memory"; process.env.MAIL_MODE = "memory";
process.env.SESSION_SECRET = "dev-session-secret-dev-session-secret-1234"; process.env.ALLOWED_EMAIL_DOMAINS = "x.vn";
const quiz = require("../api/_lib/quiz");
const H = { "x-requested-with": "livotec" };
const fn = { check: require("../api/kt-check"), start: require("../api/kt-start"), answer: require("../api/kt-answer"), submit: require("../api/kt-submit"), resend: require("../api/kt-resend"), verify: require("../api/kt-verify") };
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? "PASS " : "FAIL ") + m); };
async function call(name, body, headers) {
  const ctx = { log: Object.assign(() => {}, { error: console.error }), res: null };
  await fn[name](ctx, { method: "POST", headers: headers || H, body });
  return { s: ctx.res.status, j: ctx.res.body };
}
async function getV(t) { const ctx = { log: Object.assign(() => {}, { error: console.error }), res: null }; await fn.verify(ctx, { method: "GET", headers: {}, query: t == null ? {} : { t } }); return { s: ctx.res.status, j: ctx.res.body }; }
(async () => {
  const qs = [];
  for (let i = 0; i < 12; i++) qs.push({ id: "q" + i, text: "Câu hỏi " + i, category: i < 5 ? "Gia dụng" : "Máy lọc nước", options: ["Đúng", "Sai 1", "Sai 2", "Sai 3"], correctIndex: 0, active: true });
  await quiz.saveQuestions(qs);
  await quiz.saveCandidates([{ code: "NV1", name: "Nguyễn A", email: "a@x.vn", segment: "both" }]);
  await quiz.saveSettings({ examTitle: "Thi thử", questionCount: 5, bothGiaDungCount: 2, secondsPerQuestion: 30, passEnabled: true, passScore: 60, allowRetake: false, complianceEnabled: true, complianceHighMin: 9, complianceMidMin: 7, complianceLowMin: 6 });

  let r = await call("check", { code: "NV1", email: "a@x.vn" }, {}); ok(r.s === 400, "thiếu header chống CSRF bị từ chối");
  r = await call("check", { code: "NV1", email: "a@x.vn" });
  ok(r.s === 200 && r.j.exam.secondsPerQuestion === 30 && r.j.exam.passScore === 60 && !r.j.inProgress, "check đúng: trả thể lệ, chưa có bài dở");

  r = await call("start", { code: "NV1", email: "a@x.vn" });
  const att = r.j.attemptId;
  ok(r.s === 200 && r.j.index === 0 && r.j.total === 5 && r.j.question && !r.j.questions && r.j.resumed === false, "start: tạo đề, chỉ gửi MỘT câu, không lộ cả đề");
  ok(r.j.remainingMs > 29000 && r.j.remainingMs <= 30000, "start: thời gian còn lại ≈ 30s");
  const first = r.j.question;

  r = await call("start", { code: "nv1", email: "A@x.vn" });
  ok(r.j.resumed === true && r.j.attemptId === att && r.j.question.id === first.id && JSON.stringify(r.j.question.options) === JSON.stringify(first.options), "tải lại trang: làm tiếp đúng bài/câu cũ, KHÔNG tạo đề mới");
  r = await call("check", { code: "NV1", email: "a@x.vn" });
  ok(r.j.inProgress && r.j.inProgress.answered === 0 && r.j.inProgress.total === 5, "check: báo có bài đang dở");

  const correctIdx = async (qid, shown) => { const bank = (await quiz.getQuestions()).find((q) => q.id === qid); return shown.indexOf(bank.options[bank.correctIndex]); };
  let cur = first, step;
  r = await call("answer", { attemptId: att, questionId: cur.id, answerIndex: await correctIdx(cur.id, cur.options) });
  ok(r.j.ok && r.j.accepted && r.j.index === 1 && r.j.question.id !== cur.id, "answer: ghi nhận và trả câu kế tiếp");
  const second = r.j.question;
  r = await call("answer", { attemptId: att, questionId: cur.id, answerIndex: 0 });
  ok(r.j.ok && r.j.accepted === false && r.j.index === 1 && r.j.question.id === second.id, "gửi trùng câu cũ: bỏ qua, không hỏng bài (idempotent)");
  r = await call("answer", { attemptId: att, questionId: "khong-co", answerIndex: 0 }); ok(r.s === 400, "câu không thuộc bài: bị từ chối");

  // Giả lập thoát ra rất lâu: câu 2 quá hạn -> tự bỏ trống, nhảy sang câu 3 khi vào lại
  let a = await quiz.getAttempt(att); a.qStartedAt = Date.now() - (30 * 1000 + quiz.GRACE_MS + 500); await quiz.putAttempt(a);
  r = await call("start", { code: "NV1", email: "a@x.vn" });
  ok(r.j.resumed && r.j.index === 2 && r.j.remainingMs > 0 && r.j.remainingMs <= 30000, "vào lại sau khi quá hạn: câu bỏ lỡ tính trống, đồng hồ chạy tiếp");
  a = await quiz.getAttempt(att); ok(a.answers[second.id] && a.answers[second.id].answerIndex === -1 && a.answers[second.id].auto, "câu quá hạn được ghi là bỏ trống");

  // Trả lời muộn cho câu đã quá hạn: không nhận
  r = await call("answer", { attemptId: att, questionId: second.id, answerIndex: 0 });
  ok(r.j.accepted === false && r.j.index === 2, "trả lời câu đã quá hạn: không được nhận");

  cur = r.j.question;
  for (let i = 2; i < 5; i++) { r = await call("answer", { attemptId: att, questionId: cur.id, answerIndex: await correctIdx(cur.id, cur.options) }); if (!r.j.done) cur = r.j.question; }
  ok(r.j.done === true, "trả lời hết câu: done");
  r = await call("submit", { attemptId: att });
  ok(r.j.ok && r.j.total === 5 && r.j.score === 4 && r.j.pct === 80 && r.j.passed === true && r.j.mailOk === true && r.j.passScore === 60, "submit: chấm đúng 4/5 (1 câu bỏ lỡ), ĐẠT, đã gửi mail");
  ok(typeof r.j.durationSec === "number", "submit: có thời gian làm bài");
  ok(r.j.wrong === 0 && r.j.blank === 1 && r.j.score + r.j.wrong + r.j.blank === r.j.total, "submit: đếm đúng/sai/bỏ trống khớp tổng số câu");
  ok(/^KT-[A-Z0-9]{8}$/.test(r.j.proof) && r.j.startedAt > 0 && r.j.serverNow > 0, "submit: có mã minh chứng, giờ bắt đầu và giờ máy chủ");
  const proofCode1 = r.j.proof;
  const mb = global.__mailbox || []; ok(mb.length === 1 && mb[0].to === "a@x.vn", "chỉ gửi đúng 1 email kết quả");
  r = await call("submit", { attemptId: att }); ok(r.j.already === true && (global.__mailbox || []).length === 1, "nộp lần 2: idempotent, không gửi mail lần nữa");
  r = await call("answer", { attemptId: att, questionId: cur.id, answerIndex: 0 }); ok(r.j.done === true, "answer sau khi nộp: báo đã xong");
  r = await call("start", { code: "NV1", email: "a@x.vn" }); ok(r.s === 409, "đã nộp: không cho làm lại");
  r = await call("check", { code: "NV1", email: "a@x.vn" });
  ok(r.j.alreadyDone && r.j.result.score === 4 && r.j.result.mailOk === true && r.j.result.submittedAt > 0, "check sau khi nộp: trả kết quả cũ + trạng thái email");
  ok(r.j.result.proof === proofCode1 && r.j.result.blank === 1 && r.j.result.startedAt > 0 && r.j.serverNow > 0, "check sau khi nộp: mã minh chứng khớp lúc nộp + đủ số liệu");

  // Mã QR xác thực (xem kết quả công khai bằng mã có chữ ký)
  const att0 = await quiz.getAttempt(att);
  r = await call("check", { code: "NV1", email: "a@x.vn" }); const vtok = r.j.result.verify;
  ok(typeof vtok === "string" && vtok.indexOf(att0.id + ".") === 0, "kết quả trả về mã xác thực <mã bài>.<chữ ký>");
  let v = await getV(vtok);
  ok(v.s === 200 && v.j.result.name === "Nguyễn A" && v.j.result.code === "NV1" && v.j.result.score === 4 && v.j.result.passed === true && v.j.result.proof === proofCode1, "quét QR: ra đúng kết quả (tên, mã NV, điểm, mã minh chứng)");
  ok(!JSON.stringify(v.j).includes("a@x.vn") && !JSON.stringify(v.j).includes("Câu 1 ["), "trang xác thực KHÔNG lộ email và đáp án từng câu");
  v = await getV(vtok.slice(0, -1) + (vtok.slice(-1) === "a" ? "b" : "a")); ok(v.s === 404, "sửa chữ ký: không xác thực được");
  v = await getV("x" + vtok); ok(v.s === 404, "sửa mã bài làm: không xác thực được");
  v = await getV(att0.id); ok(v.s === 404, "chỉ có mã bài làm, thiếu chữ ký: bị từ chối (không đoán được từ mã minh chứng)");
  v = await getV(null); ok(v.s === 404, "thiếu mã: bị từ chối");

  // Bài KHÔNG có ngưỡng đạt: không hiện Đạt/Chưa đạt ở bất kỳ đâu (kể cả bài đã nộp trước đó)
  ok(quiz.passState(80, { passEnabled: true, passScore: 70 }) === true && quiz.passState(50, { passEnabled: true, passScore: 70 }) === false && quiz.passState(80, { passEnabled: false, passScore: 70 }) === null && quiz.passState(80, {}) === null && quiz.passState(80, { passEnabled: true, passScore: 0 }) === null, "passState: true/false khi bật ngưỡng, null khi tắt hoặc ngưỡng 0");
  r = await call("check", { code: "NV1", email: "a@x.vn" }); ok(r.j.result.passed === true && r.j.exam.passScore === 60, "đang bật ngưỡng 60%: bài 80% là ĐẠT");
  const st0 = await quiz.getSettings(); await quiz.saveSettings(Object.assign({}, st0, { passEnabled: false }));
  r = await call("check", { code: "NV1", email: "a@x.vn" }); ok(r.j.result.passed === null && r.j.result.passScore === 0 && r.j.exam.passScore === 0, "tắt ngưỡng: bài đã nộp trước đó trả passed=null, không có ngưỡng");
  v = await getV(vtok); ok(v.j.result.passed === null && v.j.result.passScore === 0, "trang xác thực QR: không có Đạt/Chưa đạt, không có ngưỡng");
  { const at = await quiz.getAttempt(att); at.mailLastAt = 0; at.mailSends = 0; await quiz.putAttempt(at); }
  const mbN = (global.__mailbox || []).length;
  r = await call("resend", { code: "NV1", email: "a@x.vn" }); const mNo = (global.__mailbox || [])[mbN];
  ok(r.s === 200 && mNo && !/CHƯA ĐẠT|ĐẠT/.test(mNo.text) && /Số câu đúng/.test(mNo.text), "email kết quả: bỏ ô 'ĐẠT / CHƯA ĐẠT', vẫn có số câu đúng");
  await quiz.saveSettings(st0);
  { const at = await quiz.getAttempt(att); at.mailLastAt = 0; at.mailSends = 0; await quiz.putAttempt(at); }

  // Gửi lại email xác nhận
  const mb0 = (global.__mailbox || []).length;
  r = await call("resend", { code: "NV1", email: "sai@x.vn" }); ok(r.s === 404 && (global.__mailbox || []).length === mb0, "gửi lại với thông tin sai: từ chối, không gửi mail");
  r = await call("resend", { code: "NV1", email: "a@x.vn" });
  ok(r.s === 200 && r.j.to === "a***@x.vn" && r.j.remaining === 4 && (global.__mailbox || []).length === mb0 + 1, "gửi lại lần 1: gửi mail, email được che, còn 4 lần");
  const rm = (global.__mailbox || [])[mb0]; ok(rm.to === "a@x.vn" && /Kết quả bài kiểm tra/.test(rm.subject) && rm.html.indexOf(proofCode1) >= 0 && /Câu 1 \[/.test(rm.text), "email gửi lại: đúng người nhận, có mã minh chứng và bản sao câu trả lời");
  r = await call("resend", { code: "NV1", email: "a@x.vn" });
  ok(r.s === 429 && r.j.retryAfterSec > 0 && (global.__mailbox || []).length === mb0 + 1, "bấm liên tục: bị giãn cách 60 giây, không gửi thêm");
  for (let i = 0; i < 4; i++) { const at = await quiz.getAttempt(att); at.mailLastAt = Date.now() - 61000; await quiz.putAttempt(at); r = await call("resend", { code: "NV1", email: "a@x.vn" }); }
  ok((global.__mailbox || []).length === mb0 + 5, "đủ 5 lần gửi lại đều thành công khi đã hết thời gian chờ");
  { const at = await quiz.getAttempt(att); at.mailLastAt = Date.now() - 61000; await quiz.putAttempt(at); }
  r = await call("resend", { code: "NV1", email: "a@x.vn" }); ok(r.s === 429 && r.j.limit === true && (global.__mailbox || []).length === mb0 + 5, "quá 5 lần: chặn, hướng dẫn liên hệ quản trị viên");
  await quiz.saveCandidates([{ code: "NV1", name: "Nguyễn A", email: "a@x.vn", segment: "both" }, { code: "NV2", name: "B", email: "b@x.vn", segment: "both" }]);
  r = await call("resend", { code: "NV2", email: "b@x.vn" }); ok(r.s === 404 && (global.__mailbox || []).length === mb0 + 5, "chưa nộp bài: không có gì để gửi lại");

  // Máy chủ chưa cấu hình SMTP: phải báo THẬT là chưa gửi được (không giả vờ đã gửi)
  { const old = { m: process.env.MAIL_MODE, h: process.env.SMTP_HOST }; process.env.MAIL_MODE = "smtp"; delete process.env.SMTP_HOST;
    const at = await quiz.getAttempt(att); at.mailSends = 0; at.mailLastAt = 0; await quiz.putAttempt(at);
    r = await call("resend", { code: "NV1", email: "a@x.vn" });
    ok(r.s === 502 && r.j.ok === false, "chưa cấu hình SMTP: gửi lại báo lỗi 502, không nói dối là đã gửi");
    ok((await quiz.getIndex())[0].mailOk === false, "trạng thái email trong bảng kết quả chuyển thành 'chưa gửi'");
    process.env.MAIL_MODE = old.m; if (old.h) process.env.SMTP_HOST = old.h; }

  // Giới hạn dò mã
  let last; for (let i = 0; i < 9; i++) last = await call("check", { code: "X" + i, email: "z@x.vn" });
  ok(last.s === 429, "thử sai quá nhiều lần: bị chặn tạm thời (429)");
  console.log("\n" + pass + " đạt, " + fail + " lỗi"); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
