// Kiểm thử: tra cứu lịch sử và xem lại đề CHỈ bằng khuôn mặt (không nhập mã NV + email). Bộ nhận diện được giả lập.
// Chạy: node dev/test-faceonly.js
process.env.STORAGE_MODE = "memory"; process.env.MAIL_MODE = "memory";
process.env.SESSION_SECRET = "dev-session-secret-dev-session-secret-1234"; process.env.ALLOWED_EMAIL_DOMAINS = "x.vn";
const path = require("path");
const stub = (rel, exp) => { const p = require.resolve(path.join(__dirname, "../api/_lib", rel)); require.cache[p] = { id: p, filename: p, loaded: true, exports: exp }; };
const FACE = { who: "NV1", same: true };
stub("facecheck", { verify: async () => ({ allow: true, record: { status: "ok", by: "azure" } }) });
stub("facematch", { describe: async () => ({ n: 1, desc: new Array(128).fill(0.1) }), compare: async () => FACE.same ? { ok: true, distance: 0.3, threshold: 0.55 } : { ok: false, code: "mismatch", distance: 0.7, threshold: 0.55, message: "Khuôn mặt không khớp." } });
stub("facegallery", { identify: async () => FACE.who ? { ok: true, code: FACE.who, distance: 0.3, second: 0.6 } : { ok: false, reason: "far", distance: 0.6 } });
stub("facelive", { mode: () => "on", verify: async (live) => live && live.token === "ok" ? { ok: true } : { ok: false, code: "missing", message: "Cần hoàn thành thử thách nhìn thẳng, quay trái, quay phải trước khi tiếp tục." } });
const quiz = require("../api/_lib/quiz");
const H = { "x-requested-with": "livotec" };
const fn = { hist: require("../api/kt-history"), paper: require("../api/kt-mypaper") };
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? "PASS " : "FAIL ") + m); };
async function call(name, body) { if (body && body.photo && !body.nolive && !body.live) body = Object.assign({ live: { token: "ok", frames: [] } }, body); const ctx = { log: Object.assign(() => {}, { error: console.error, warn: () => {} }), res: null }; await fn[name](ctx, { method: "POST", headers: H, body, query: {} }); return { s: ctx.res.status, j: ctx.res.body }; }
const PHOTO = "data:image/jpeg;base64," + Buffer.from("selfie").toString("base64");
(async () => {
  await quiz.saveCandidates([{ code: "NV1", name: "A", email: "a@x.vn", phone: "0912345678" }]);
  await quiz.upsertExam({ id: "de-a", title: "Đề A", closeAt: Date.now() - 1000, openAt: Date.now() - 100000 });
  const att = { id: "att1", code: "NV1", name: "A", email: "a@x.vn", period: "de-a", status: "submitted", submittedAt: Date.now() - 5000, startedAt: Date.now() - 9000, photo: PHOTO, score: 4, total: 5, pct: 80,
    paper: [{ n: 1, text: "Câu 1", options: ["A", "B"], chosen: 0, correct: 0, ok: true }] };
  await quiz.putAttempt(att);
  if (quiz.addToIndex) await quiz.addToIndex(att); else { const idx = await quiz.getIndex(); idx.push({ id: "att1", code: "NV1", name: "A", email: "a@x.vn", period: "de-a", status: "submitted", submittedAt: att.submittedAt, startedAt: att.startedAt, score: 4, total: 5, pct: 80 }); await quiz.saveIndex(idx); }

  let r = await call("hist", { photo: PHOTO });
  ok(r.s === 200 && r.j.ok && r.j.code === "NV1" && r.j.list.length === 1, "tra cứu lịch sử: chỉ quét mặt -> nhận ra NV1, trả danh sách bài");
  FACE.who = null;
  r = await call("hist", { photo: PHOTO });
  ok(r.s === 404 && r.j.notFound && !r.j.needCode, "tra cứu: không nhận diện được -> notFound, không mời nhập mã NV + email");
  r = await call("hist", { code: "NV1", email: "a@x.vn" });
  ok(r.s === 400 && !r.j.ok, "tra cứu: chỉ gửi mã NV + email (không có ảnh) -> từ chối");
  FACE.who = "NV1";
  r = await call("hist", { code: "NV2", email: "b@x.vn", photo: PHOTO });
  ok(r.s === 200 && r.j.ok && r.j.code === "NV1", "tra cứu: mã NV + email gửi kèm bị bỏ qua, chỉ khuôn mặt quyết định");

  const t = quiz.verifyToken("att1");
  r = await call("paper", { t, step: "check" });
  ok(r.s === 200 && r.j.ok, "xem lại đề: bước kiểm tra không cần mã NV + email");
  r = await call("paper", { t, photo: PHOTO });
  ok(r.s === 200 && r.j.ok && r.j.paper.length === 1, "xem lại đề: quét mặt khớp chủ bài -> xem được đề");
  FACE.same = false;
  r = await call("paper", { t, photo: PHOTO });
  ok(r.s === 403 && !r.j.paper, "xem lại đề: khuôn mặt KHÁC chủ bài -> từ chối");
  FACE.same = true;
  r = await call("paper", { t, code: "NV9", email: "z@x.vn", photo: PHOTO });
  ok(r.s === 403, "xem lại đề: nếu vẫn gửi mã NV + email sai -> từ chối");
  // Thử thách sống: thiếu thử thách (giơ ảnh tĩnh, không quay trái/phải) -> từ chối, KHÔNG trả danh sách / đề
  r = await call("hist", { photo: PHOTO, nolive: true });
  ok(r.s === 403 && r.j.liveFailed && !r.j.list, "tra cứu: không qua thử thách quay mặt -> từ chối");
  r = await call("paper", { t, photo: PHOTO, nolive: true });
  ok(r.s === 403 && r.j.liveFailed && !r.j.paper, "xem lại đề: không qua thử thách quay mặt -> từ chối");
  console.log("\n" + pass + " đạt, " + fail + " lỗi"); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
