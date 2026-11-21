// THỬ THÁCH SỐNG: nhìn thẳng + quay trái + quay phải (thứ tự ngẫu nhiên do máy chủ cấp) để chặn ảnh tĩnh / ảnh trên màn hình điện thoại.
// Quy trình: (1) /api/kt-live cấp token ký (hết hạn 3 phút, dùng một lần) kèm thứ tự ngẫu nhiên;
//            (2) trình duyệt hướng dẫn, tự đo góc quay đầu bằng điểm mốc khuôn mặt và chỉ chụp khi người dùng thật sự quay;
//            (3) máy chủ ĐO LẠI góc quay trên từng ảnh bằng mô hình điểm mốc của riêng nó, kiểm tra cùng một người, và đánh dấu token đã dùng.
// Ảnh tĩnh không thể vừa nhìn thẳng vừa quay trái vừa quay phải. KHÔNG chặn được video quay sẵn / ảnh ghép chuyên nghiệp / deepfake.
// Quy ước góc (ảnh GỐC của camera, facematch.yawOf): âm = người dùng quay sang PHẢI của họ, dương = quay sang TRÁI.
// Chế độ (FACE_LIVENESS): "on" (mặc định) = không đạt thì từ chối · "soft" = chỉ ghi kết quả vào bài, không chặn · "off" = tắt.
const crypto = require("crypto");
const session = require("./session");
const store = require("./store");
const facematch = require("./facematch");

const TTL = 3 * 60 * 1000;
const NONCE_KEY = "kt/live-nonces.json";
const NONCE_KEEP_MS = 15 * 60 * 1000, NONCE_MAX = 3000;
// Ngưỡng phía máy chủ nới hơn trình duyệt (0.15 / 0.07) để không từ chối nhầm người đã làm đúng. Hiệu chỉnh trên ảnh thật:
// nhìn thẳng ≈ ±0.01, quay rõ ≈ 0.2–0.45.
const TURN_MIN = Number(process.env.FACE_LIVE_TURN_MIN) || 0.11;
const FRONT_MAX = Number(process.env.FACE_LIVE_FRONT_MAX) || 0.14;
// "Cùng một người" giữa các góc: cố ý rất nới (khuôn mặt nghiêng làm dấu vân lệch nhiều); chỉ bắt trường hợp đổi sang người khác hẳn.
const SAME_FT = Number(process.env.FACE_LIVE_SAME_MAX) || 0.75;
const SAME_LR = SAME_FT + 0.1;
const MAX_TURN = 160000, MAX_FRONT = 350000; // ảnh quay đầu nhỏ (~320px); ảnh nhìn thẳng cùng giới hạn với luồng làm bài hiện có

function mode() { const m = String(process.env.FACE_LIVENESS || "on").toLowerCase(); return m === "off" || m === "soft" ? m : "on"; }

function issue() {
  const seq = ["front", "left", "right"];
  for (let i = seq.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); const t = seq[i]; seq[i] = seq[j]; seq[j] = t; }
  const n = crypto.randomBytes(9).toString("base64url");
  return { token: session.sign({ k: "live", n, seq, exp: Date.now() + TTL }), seq };
}

// Đánh dấu token đã dùng; false nếu đã dùng rồi (phát lại)
async function useNonce(n) {
  let fresh = true; const now = Date.now();
  await store.update(NONCE_KEY, (cur) => {
    let list = Array.isArray(cur) ? cur : [];
    list = list.filter((x) => now - x.at < NONCE_KEEP_MS);
    if (list.some((x) => x.n === n)) { fresh = false; return list; }
    list.push({ n, at: now });
    return list.slice(-NONCE_MAX);
  });
  return fresh;
}

const fail = (code, message, extra) => Object.assign({ ok: false, code, message }, extra || {});
const isJpeg = (s, max) => typeof s === "string" && /^data:image\/jpe?g;base64,/i.test(s) && s.length <= max;

// live = { token, frames: [{ pose: "left"|"right", img }] }; frontPhoto = ảnh nhìn thẳng (chính là ảnh xác nhận); pre = kết quả describe của ảnh đó nếu đã có
async function verify(live, frontPhoto, pre) {
  const BAD = "Chưa xác minh được thử thách quay mặt. Hãy quét lại: nhìn thẳng, rồi quay mặt sang trái và sang phải theo hướng dẫn.";
  try {
    if (!live || typeof live !== "object") return fail("missing", "Cần hoàn thành thử thách nhìn thẳng, quay trái, quay phải trước khi tiếp tục.");
    const p = session.verify(live.token);
    if (!p || p.k !== "live" || !Array.isArray(p.seq)) return fail("token", "Phiên quét đã hết hạn. Hãy quét lại.");
    const frames = Array.isArray(live.frames) ? live.frames : [];
    const left = frames.find((f) => f && f.pose === "left"), right = frames.find((f) => f && f.pose === "right");
    if (frames.length !== 2 || !left || !right || !isJpeg(left.img, MAX_TURN) || !isJpeg(right.img, MAX_TURN) || !isJpeg(frontPhoto, MAX_FRONT)) return fail("frames", BAD);
    if (!(await useNonce(p.n))) return fail("replay", "Phiên quét này đã được dùng. Hãy quét lại.");

    const me = pre && pre.n != null ? pre : await facematch.describe(frontPhoto);
    const L = await facematch.describe(left.img), R = await facematch.describe(right.img);
    if (me.n !== 1 || L.n !== 1 || R.n !== 1) return fail("faces", "Mỗi ảnh phải có đúng một khuôn mặt rõ nét. " + BAD);
    const ev = { yaw: { front: me.yaw, left: L.yaw, right: R.yaw }, order: p.seq.join(">"), at: Date.now() };
    if (Math.abs(me.yaw) > FRONT_MAX) return fail("front", "Ảnh nhìn thẳng chưa thẳng. " + BAD, { evidence: Object.assign({ ok: false, code: "front" }, ev) });
    if (!(L.yaw >= TURN_MIN)) return fail("left", "Chưa thấy bạn quay mặt sang trái đủ rõ. " + BAD, { evidence: Object.assign({ ok: false, code: "left" }, ev) });
    if (!(R.yaw <= -TURN_MIN)) return fail("right", "Chưa thấy bạn quay mặt sang phải đủ rõ. " + BAD, { evidence: Object.assign({ ok: false, code: "right" }, ev) });
    const d = { fl: facematch.dist(me.desc, L.desc), fr: facematch.dist(me.desc, R.desc), lr: facematch.dist(L.desc, R.desc) };
    ev.d = { fl: Math.round(d.fl * 1000) / 1000, fr: Math.round(d.fr * 1000) / 1000, lr: Math.round(d.lr * 1000) / 1000 };
    if (d.fl > SAME_FT || d.fr > SAME_FT || d.lr > SAME_LR) return fail("identity", "Các ảnh trong thử thách không phải cùng một người. " + BAD, { evidence: Object.assign({ ok: false, code: "identity" }, ev) });
    return { ok: true, evidence: Object.assign({ ok: true }, ev) };
  } catch (e) {
    return fail("error", "Hệ thống chưa kiểm tra được thử thách quay mặt lúc này. Hãy thử lại.", { unavailable: true });
  }
}

module.exports = { mode, issue, verify, TURN_MIN, FRONT_MAX, SAME_FT };
