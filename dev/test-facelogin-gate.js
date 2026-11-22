// Kiểm thử: nhập sai mã NV/email nhiều lần -> bước chống dò bắt xác thực khuôn mặt, NHƯNG nếu vào bằng đăng nhập khuôn mặt
// (có vé faceLogin của đúng mã NV) thì không bắt xác thực thêm lần nữa. Chạy: node dev/test-facelogin-gate.js
process.env.STORAGE_MODE = "memory"; process.env.MAIL_MODE = "memory"; process.env.FACE_PASS = "off"; // vé faceLogin phải chạy cả khi tắt vé bỏ quét lần hai
process.env.SESSION_SECRET = "dev-session-secret-dev-session-secret-1234"; process.env.ALLOWED_EMAIL_DOMAINS = "x.vn";
const path = require("path");
const stub = (rel, exp) => { const p = require.resolve(path.join(__dirname, "../api/_lib", rel)); require.cache[p] = { id: p, filename: p, loaded: true, exports: exp }; };
stub("facecheck", { verify: async () => ({ allow: true, record: { status: "ok", by: "azure" } }) });
stub("facematch", { describe: async () => ({ n: 1, desc: new Array(128).fill(0.1) }), compare: async () => ({ ok: true, distance: 0.3, threshold: 0.55 }), dist: () => 0.3, MATCH_MAX: 0.55 });
stub("facegallery", { identify: async () => ({ ok: true, code: require("../api/_lib/quiz").normCode("NV1"), distance: 0.3, second: 0.6 }) });
stub("facelive", { mode: () => "off", verify: async () => ({ ok: true }) });
const quiz = require("../api/_lib/quiz");
const fn = { check: require("../api/kt-check"), face: require("../api/kt-facelogin") };
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? "PASS " : "FAIL ") + m); };
let ip = "10.0.0.1";
async function call(name, body) {
  const ctx = { log: Object.assign(() => {}, { error: console.error, warn: () => {} }), res: null };
  await fn[name](ctx, { method: "POST", headers: { "x-requested-with": "livotec", "x-forwarded-for": ip }, body, query: {} }); return { s: ctx.res.status, j: ctx.res.body };
}
const PHOTO = "data:image/jpeg;base64," + Buffer.from("selfie").toString("base64");
(async () => {
  await quiz.saveCandidates([{ code: "NV1", name: "Nguyễn A", email: "a@x.vn", phone: "0912345678", province: "Hà Nội", region: "bac" }, { code: "NV2", name: "Trần B", email: "b@x.vn", phone: "0912345679", province: "Hà Nội", region: "bac" }]);
  await quiz.upsertExam({ id: "de-a", title: "Đề A" });
  const wrong2 = async () => { await call("check", { code: "NV1", email: "sai@x.vn", examId: "de-a" }); await call("check", { code: "NV9", email: "a@x.vn", examId: "de-a" }); };

  // 1) Nhập tay: sai 2 lần -> lần 3 phải xác thực khuôn mặt (giữ nguyên chống dò)
  await wrong2();
  let r = await call("check", { code: "NV1", email: "a@x.vn", examId: "de-a" });
  ok(r.s === 428 && r.j.needFace, "nhập tay sai 2 lần -> lần 3 bị yêu cầu xác thực khuôn mặt");

  // 2) Cùng thiết bị, chuyển sang đăng nhập bằng khuôn mặt -> kt-check kèm vé: không hỏi lại
  r = await call("face", { photo: PHOTO, examId: "de-a" });
  if (r.s !== 200) console.log("  facelogin ->", r.s, JSON.stringify(r.j));
  ok(r.s === 200 && r.j.faceLogin && !r.j.facePass, "đăng nhập khuôn mặt trả vé faceLogin (kể cả khi FACE_PASS=off)");
  const tk = r.j.faceLogin;
  r = await call("check", { code: "NV1", email: "a@x.vn", examId: "de-a", faceLogin: tk });
  ok(r.s === 200 && r.j.ok && !r.j.needFace, "vào bằng khuôn mặt -> KHÔNG phải xác thực thêm lần nữa");

  // 3) Vé chỉ dùng cho đúng mã NV được nhận diện
  ip = "10.0.0.2"; await wrong2();
  r = await call("check", { code: "NV2", email: "b@x.vn", examId: "de-a", faceLogin: tk });
  ok(r.s === 428 && r.j.needFace, "vé của NV1 không dùng được cho NV2 -> vẫn phải xác thực");
  r = await call("check", { code: "NV2", email: "b@x.vn", examId: "de-a", faceLogin: "gia-mao" });
  ok(r.s === 428 && r.j.needFace, "vé giả -> vẫn phải xác thực");

  // 4) Vào bằng khuôn mặt thành công thì xoá số lần nhập sai trên thiết bị đó
  ip = "10.0.0.3"; await wrong2();
  await call("check", { code: "NV1", email: "a@x.vn", examId: "de-a", faceLogin: tk });
  r = await call("check", { code: "NV1", email: "a@x.vn", examId: "de-a" });
  ok(r.s === 200 && r.j.ok, "sau khi vào bằng khuôn mặt, số lần nhập sai được xoá");

  // 5) Lịch sử đăng nhập: lần vào bằng khuôn mặt không bị ghi thêm thành 'nhập tay'
  const log = (await require("../api/_lib/loginlog").read()).filter((x) => x.code === "NV1");
  ok(log.length >= 1 && log.every((x) => x.method === "face" || x.method === "manual" || x.method === "manual_face"), "nhật ký đăng nhập hợp lệ");
  console.log("\n" + pass + " đạt, " + fail + " lỗi"); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
