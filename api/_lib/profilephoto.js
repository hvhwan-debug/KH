// Chọn ảnh đại diện cho một nhân viên từ các ảnh xác thực làm bài đã có — theo tiêu chí KỸ THUẬT
// (rõ mặt, đủ sáng, đúng 1 người), tái dùng kết quả kiểm tra khuôn mặt đã có sẵn ở mỗi bài làm
// (api/_lib/facecheck.js). KHÔNG đánh giá theo thẩm mỹ/ngoại hình.
const quiz = require("./quiz");

// Xếp hạng độ tin cậy của trạng thái đã kiểm tra: 'ok' (máy chủ xác nhận rõ mặt) tốt nhất,
// rồi đến 'unclear' (có mặt nhưng chưa thật rõ), rồi 'client_ok' (chỉ máy thí sinh xác nhận),
// thấp nhất là 'unverified'. Các trạng thái bị từ chối (noface/multi/spoof) không được xếp vào đây.
const RANK = { ok: 3, unclear: 2, client_ok: 1, unverified: 0 };

function scoreOf(a) {
  const fc = a.faceCheck || {};
  const rank = RANK[fc.status] != null ? RANK[fc.status] : -1;
  const clientScore = fc.client && Number.isFinite(fc.client.score) ? fc.client.score : 0;
  return { rank, clientScore, at: a.submittedAt || 0 };
}

function pickBest(attempts, skipMismatch) {
  const withPhoto = attempts.filter((a) => a && a.photo && !(skipMismatch && a.faceId && a.faceId.s === "mismatch"));
  if (!withPhoto.length) return null;
  withPhoto.sort((a, b) => {
    const sa = scoreOf(a), sb = scoreOf(b);
    return sb.rank - sa.rank || sb.clientScore - sa.clientScore || sb.at - sa.at;
  });
  return withPhoto[0];
}

// Trả về { photo, attemptId, period, at } của ảnh rõ nhất, hoặc null nếu chưa có ảnh nào dùng được.
async function bestPhotoFor(code) {
  const norm = quiz.normCode(code);
  if (!norm) return null;
  const idx = await quiz.getIndex();
  const rows = idx.filter((x) => x.status === "submitted" && quiz.normCode(x.code) === norm);
  if (!rows.length) return null;
  const best = pickBest(await quiz.loadAttempts(rows), false);
  return best ? { photo: best.photo, attemptId: best.id, period: best.period || "", at: best.submittedAt || 0 } : null;
}

// ---- ẢNH THU NHỎ cho danh sách theo dõi (admin): một lượt nhiều mã, ảnh vuông 96px ~ vài KB, không gửi ảnh gốc ----
const THUMB_TTL = 10 * 60 * 1000, THUMB_PX = 96, MAX_ROWS_PER_CODE = 6;
const _cache = new Map(); // mã (chữ thường) -> { t, img, attempt }
async function makeThumb(dataUrl, px) {
  const lib = require("@napi-rs/canvas"), size = px || THUMB_PX;
  const im = await lib.loadImage(dataUrl);
  const w = im.width, h = im.height, s = Math.min(w, h), sx = (w - s) / 2, sy = h > w ? (h - s) * 0.2 : (h - s) / 2; // ảnh dọc: lấy vùng phía trên (có mặt)
  const cv = lib.createCanvas(size, size), c = cv.getContext("2d");
  c.drawImage(im, sx, sy, s, s, 0, 0, size, size);
  return "data:image/jpeg;base64," + cv.toBuffer("image/jpeg", 72).toString("base64");
}
// codes: danh sách mã NV (như hiển thị). Trả về { [mã gốc]: { img, attempt:{id,code,name,period} } } chỉ gồm những mã CÓ ảnh dùng được.
async function thumbsFor(codes) {
  const want = {}; (codes || []).forEach((c) => { const k = quiz.normCode(c); if (k) (want[k] = want[k] || []).push(String(c)); });
  const keys = Object.keys(want), res = {}, now = Date.now(), todo = [];
  for (const k of keys) {
    const hit = _cache.get(k);
    if (hit && now - hit.t < THUMB_TTL) { if (hit.img) want[k].forEach((c) => { res[c] = { img: hit.img, attempt: hit.attempt }; }); } else todo.push(k);
  }
  if (todo.length) {
    const idx = await quiz.getIndexAll(), by = {};
    idx.forEach((r) => { if (r.status === "submitted") { const k = quiz.normCode(r.code); if (todo.indexOf(k) >= 0) (by[k] = by[k] || []).push(r); } });
    let i = 0;
    const worker = async () => {
      while (i < todo.length) {
        const k = todo[i++];
        let ent = { t: Date.now(), img: "", attempt: null };
        try {
          const rows = (by[k] || []).filter((r) => !(r.faceId && r.faceId.s === "mismatch")).sort((a, b) => (b.submittedAt || 0) - (a.submittedAt || 0)).slice(0, MAX_ROWS_PER_CODE);
          if (rows.length) {
            const best = pickBest(await quiz.loadAttempts(rows), true);
            if (best) { ent.img = await makeThumb(best.photo); ent.attempt = { id: best.id, code: best.code, name: best.name, period: best.period || "" }; }
          }
        } catch (e) { ent.img = ""; }
        _cache.set(k, ent);
        if (ent.img) want[k].forEach((c) => { res[c] = { img: ent.img, attempt: ent.attempt }; });
      }
    };
    await Promise.all([worker(), worker(), worker(), worker(), worker(), worker()]);
  }
  return res;
}

module.exports = { bestPhotoFor, thumbsFor, makeThumb };
