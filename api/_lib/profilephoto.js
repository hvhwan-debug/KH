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

// Trả về { photo, attemptId, period, at } của ảnh rõ nhất, hoặc null nếu chưa có ảnh nào dùng được.
async function bestPhotoFor(code) {
  const norm = quiz.normCode(code);
  if (!norm) return null;
  const idx = await quiz.getIndex();
  const rows = idx.filter((x) => x.status === "submitted" && quiz.normCode(x.code) === norm);
  if (!rows.length) return null;
  const attempts = await quiz.loadAttempts(rows);
  const withPhoto = attempts.filter((a) => a.photo);
  if (!withPhoto.length) return null;
  withPhoto.sort((a, b) => {
    const sa = scoreOf(a), sb = scoreOf(b);
    return sb.rank - sa.rank || sb.clientScore - sa.clientScore || sb.at - sa.at;
  });
  const best = withPhoto[0];
  return { photo: best.photo, attemptId: best.id, period: best.period || "", at: best.submittedAt || 0 };
}

module.exports = { bestPhotoFor };
