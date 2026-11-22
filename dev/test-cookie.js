// Kiểm thử cookie trang thí sinh: đồng ý -> kt_bid; vào thành công -> kt_cand (2 giờ); vào lại bằng phiên; quên phiên;
// không đồng ý thì không ghi nhớ; cookie giả bị bỏ qua; phiên ghi nhớ không bị chặn bởi bước chống dò. Chạy: node dev/test-cookie.js
process.env.STORAGE_MODE = "memory"; process.env.MAIL_MODE = "memory";
process.env.SESSION_SECRET = "dev-session-secret-dev-session-secret-1234"; process.env.ALLOWED_EMAIL_DOMAINS = "x.vn";
const quiz = require("../api/_lib/quiz");
const fn = { check: require("../api/kt-check"), consent: require("../api/kt-consent") };
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? "PASS " : "FAIL ") + m); };
async function call(name, body, cookie, ip) {
  const ctx = { log: Object.assign(() => {}, { error: console.error, warn: () => {} }), res: null };
  const headers = { "x-requested-with": "livotec", "x-forwarded-for": ip || "10.1.1.1" }; if (cookie) headers.cookie = cookie;
  await fn[name](ctx, { method: "POST", headers, body, query: {} });
  return { s: ctx.res.status, j: ctx.res.body, set: (ctx.res.headers || {})["Set-Cookie"] || "" };
}
const val = (set) => set.split(";")[0];               // "kt_bid=xxx"
(async () => {
  await quiz.saveCandidates([{ code: "NV1", name: "Nguyễn A", email: "a@x.vn", phone: "0912345678", province: "Hà Nội", region: "bac" }]);
  await quiz.upsertExam({ id: "de-a", title: "Đề A" });

  let r = await call("consent", { accept: true });
  ok(r.s === 200 && /^kt_bid=[A-Za-z0-9_-]{20,}/.test(r.set) && /HttpOnly/.test(r.set) && /SameSite=Lax/.test(r.set), "đồng ý cookie -> đặt kt_bid (HttpOnly, SameSite=Lax)");
  const bid = val(r.set);
  r = await call("consent", { accept: true }, bid);
  ok(val(r.set) === bid, "đồng ý lại -> giữ nguyên mã trình duyệt cũ");

  r = await call("check", { code: "NV1", email: "a@x.vn", examId: "de-a" }, bid);
  ok(r.s === 200 && r.j.ok && /^kt_cand=/.test(r.set) && /Max-Age=7200/.test(r.set) && /HttpOnly/.test(r.set), "vào thành công + đã đồng ý -> ghi nhớ phiên kt_cand 2 giờ");
  const cand = val(r.set);
  ok(!/a@x\.vn|NV1/.test(decodeURIComponent(cand)) || /\./.test(cand), "phiên có chữ ký (không sửa tay được)");

  r = await call("check", { resume: true, examId: "de-a" }, bid + "; " + cand);
  ok(r.s === 200 && r.j.ok && r.j.candidate && r.j.candidate.code === "NV1", "tải lại trang -> vào lại ngay bằng phiên ghi nhớ");

  r = await call("check", { resume: true, examId: "de-a" }, bid + "; kt_cand=gia.mao.x");
  ok(r.s === 200 && !r.j.ok && r.j.noResume, "phiên giả -> không vào được (không tính là nhập sai)");

  r = await call("check", { resume: true, examId: "de-a" });
  ok(!r.j.ok && r.j.noResume, "không có phiên -> hiện màn nhập bình thường");

  r = await call("check", { forget: true }, bid + "; " + cand);
  ok(r.s === 200 && /^kt_cand=;/.test(r.set) && /Max-Age=0/.test(r.set), "'Không phải tôi?' -> xoá phiên ghi nhớ");

  r = await call("check", { code: "NV1", email: "a@x.vn", examId: "de-a" }, "", "10.2.2.2");
  ok(r.s === 200 && r.j.ok && !r.set, "chưa đồng ý cookie -> KHÔNG ghi nhớ phiên");

  r = await call("consent", { accept: false }, bid);
  ok(/^kt_bid=;/.test(r.set) && /Max-Age=0/.test(r.set), "từ chối cookie -> xoá kt_bid");

  // Phiên ghi nhớ hợp lệ không bị bước chống dò (nhập sai nhiều lần) chặn lại
  const ip = "10.3.3.3";
  await call("check", { code: "NV1", email: "sai@x.vn", examId: "de-a" }, "", ip); await call("check", { code: "NV9", email: "a@x.vn", examId: "de-a" }, "", ip);
  r = await call("check", { code: "NV1", email: "a@x.vn", examId: "de-a" }, "", ip);
  ok(r.s === 428 && r.j.needFace, "(đối chứng) nhập tay sai 2 lần -> lần 3 bị yêu cầu khuôn mặt");
  r = await call("check", { resume: true, examId: "de-a" }, bid + "; " + cand, ip);
  ok(r.s === 200 && r.j.ok, "vào lại bằng phiên ghi nhớ -> không bị hỏi khuôn mặt vì chống dò");

  const log = await require("../api/_lib/loginlog").read();
  ok(log.some((x) => x.code === "NV1" && x.bid && bid.indexOf(x.bid) > 0), "nhật ký đăng nhập ghi kèm mã trình duyệt");
  console.log("\n" + pass + " đạt, " + fail + " lỗi"); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
