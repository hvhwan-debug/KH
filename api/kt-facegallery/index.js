// Công cụ cho QUẢN TRỊ VIÊN (đang đăng nhập): xem / nạp / sửa dữ liệu khuôn mặt dùng để đối chiếu và đăng nhập bằng khuôn mặt.
//   GET  /api/kt-facegallery                          -> thống kê (số người, số dấu vân), chỉ xem
//   GET  /api/kt-facegallery?code=NV01                -> mã nhân viên đó đã có trong thư viện chưa
//   GET  /api/kt-facegallery?run=1                    -> chạy một lượt: (1) đối chiếu các bài đã nộp chưa được kiểm tra, (2) bổ sung thư viện từ bài cũ.
//                                                        Mỗi lượt có giới hạn thời gian (~30 giây); mở lại cho tới khi "left" = 0.
//   GET  /api/kt-facegallery?code=NV01&view=1         -> TRANG XEM: các ảnh đang dùng để đối chiếu mã đó, tình trạng khoá tra cứu, nút xử lý
//   POST {action:"exclude"|"include", code, id}       -> loại / dùng lại ảnh của một bài (ảnh không phải chủ tài khoản thì loại)
//   POST {action:"unlock", code}                      -> mở khoá "tra cứu lịch sử" của mã đó (bị khoá sau nhiều lần quét không khớp)
//   POST {action:"resetgallery", code}                -> xoá dấu vân của mã đó khỏi thư viện đăng nhập bằng khuôn mặt
// Ảnh khuôn mặt chỉ hiện trên trang xem này (quản trị viên đăng nhập) và mỗi lần xem được ghi vào sổ truy cập ảnh.
const _http = require("../_lib/http");
const { guardConfigured, requireAjax } = _http;
const { userFromReq } = require("../_lib/session");
const { isAdmin } = require("../_lib/config");

const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const vn = (ms) => (ms ? new Date(ms).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour12: false }) : "");
const IMG = /^data:image\/(jpeg|png);base64,[A-Za-z0-9+/=]+$/;
const LABEL = { match: "Khớp các lần trước", first: "Ảnh đầu tiên của mã này", mismatch: "Khác người", noface: "Không thấy mặt", nophoto: "Không có ảnh", error: "Lỗi đối chiếu" };

async function page(quiz, code, u, req) {
  const gal = require("../_lib/facegallery"), sa = require("../_lib/securityalert"), k = quiz.normCode(code);
  const rows = (await quiz.getIndexAll()).filter((r) => r.status === "submitted" && quiz.normCode(r.code) === k).sort((a, b) => (b.submittedAt || 0) - (a.submittedAt || 0)).slice(0, 9);
  const items = []; let used = 0;
  for (const r of rows) {
    let a = null; try { a = await quiz.getAttempt(r.id); } catch (e) { a = null; }
    const fid = (a && a.faceId) || r.faceId || null, bad = !!(fid && fid.s === "mismatch"), photo = a && typeof a.photo === "string" && IMG.test(a.photo) ? a.photo : "";
    const eligible = !bad && !!photo && used < 3; if (eligible) used++;
    items.push({ r, fid, bad, photo, rank: eligible ? used : 0 });
  }
  const g = await gal.stats(code), lk = await sa.lockState("hist:" + k), name = rows[0] ? rows[0].name : "";
  try { if (rows[0]) await require("../_lib/accesslog").write(req, { kind: "photo", role: "admin", attempt: rows[0], by: u.email, byName: u.name, via: "Trang ảnh đối chiếu khuôn mặt" }); } catch (e) { /* không chặn */ }
  const card = (x) => {
    const f = x.fid, label = f ? (LABEL[f.s] || f.s) + (f.manual ? " (quản trị viên đã loại)" : "") : "Chưa đối chiếu";
    return `<div class="c${x.bad ? " bad" : ""}${x.rank ? " use" : ""}">` + (x.photo ? `<img src="${x.photo}" alt="Ảnh bài ${esc(x.r.id)}">` : `<div class="noimg">Không có ảnh</div>`) +
      `<div class="m"><b>${esc(vn(x.r.submittedAt))}</b>` + (x.r.test ? ` <span class="t">Thử nghiệm</span>` : "") + (x.r.practice ? ` <span class="t">Thi thử</span>` : "") +
      `<div>${esc(label)}${f && f.d != null ? " · độ lệch " + esc(f.d) : ""}</div>` + (x.rank ? `<div class="u">ĐANG DÙNG ĐỂ ĐỐI CHIẾU (#${x.rank})</div>` : "") +
      `<button onclick="act('${x.bad && x.fid && x.fid.manual ? "include" : "exclude"}','${esc(x.r.id)}')">${x.bad && x.fid && x.fid.manual ? "Dùng lại ảnh này" : "Loại ảnh này (không phải chủ tài khoản)"}</button></div></div>`;
  };
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Ảnh đối chiếu khuôn mặt · ${esc(code)}</title><style>` +
    `body{font:15px/1.5 system-ui,'Segoe UI',Arial,sans-serif;margin:0;background:#EEF3F9;color:#0A2552}main{max-width:1000px;margin:0 auto;padding:24px 16px 48px}h1{margin:0 0 4px;font-size:22px}.sub{color:#4F6486;margin:0 0 16px}` +
    `.box{background:#fff;border:1px solid #D8E2F0;border-radius:14px;padding:14px 16px;margin-bottom:16px}.box p{margin:4px 0}.lock{color:#B3261E;font-weight:700}.ok{color:#17794A;font-weight:700}` +
    `.g{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:14px}.c{background:#fff;border:2px solid #D8E2F0;border-radius:14px;overflow:hidden}.c.use{border-color:#17794A}.c.bad{border-color:#E1A09B;opacity:.85}` +
    `.c img{display:block;width:100%;aspect-ratio:1;object-fit:cover;background:#000}.noimg{aspect-ratio:1;display:grid;place-items:center;background:#E6EAF0;color:#4F6486}.m{padding:10px 12px;font-size:13px}.m div{margin-top:3px}` +
    `.u{color:#17794A;font-weight:800}.t{background:#FFF2D6;color:#8A5A00;border-radius:99px;padding:1px 8px;font-size:11px;font-weight:700}button{margin-top:8px;border:1.5px solid #0A63C4;background:#fff;color:#0A63C4;border-radius:10px;padding:6px 10px;font:inherit;font-weight:700;cursor:pointer}` +
    `button.d{border-color:#B3261E;color:#B3261E}.bar{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}</style></head><body><main>` +
    `<h1>Ảnh đối chiếu khuôn mặt</h1><p class="sub">Mã <b>${esc(code)}</b>${name ? " · " + esc(name) : ""} · chỉ quản trị viên thấy trang này</p>` +
    `<div class="box"><p><b>Thư viện đăng nhập bằng khuôn mặt:</b> ${g.code ? (g.code.enrolled ? `<span class="ok">có ${g.code.n} dấu vân</span>` : `<span class="lock">chưa có dấu vân nào</span>`) : ""}</p>` +
    `<p><b>Tra cứu lịch sử làm bài:</b> ${lk.locked ? `<span class="lock">ĐANG BỊ KHOÁ đến ${esc(vn(lk.until))}</span>` : `<span class="ok">không bị khoá</span>`} (${lk.count || 0} lần đáng ngờ trong 24 giờ)</p>` +
    `<p>Hệ thống so khuôn mặt vừa quét với tối đa <b>3 ảnh gần nhất</b> không bị đánh dấu "khác người" (khung xanh bên dưới). Nếu trong đó có ảnh <b>không phải chủ tài khoản</b> (ví dụ ảnh thử bằng ảnh điện thoại), hãy loại ảnh đó.</p>` +
    `<div class="bar">` + (lk.locked ? `<button onclick="act('unlock')">Mở khoá tra cứu</button>` : "") + `<button class="d" onclick="if(confirm('Xoá dấu vân của mã này khỏi thư viện đăng nhập bằng khuôn mặt? Lần làm bài kế tiếp sẽ nạp lại.'))act('resetgallery')">Xoá thư viện khuôn mặt của mã này</button></div></div>` +
    (items.length ? `<div class="g">${items.map(card).join("")}</div>` : `<div class="box">Mã này chưa có bài làm nào được ghi nhận (chưa nộp bài), nên chưa có ảnh để đối chiếu.</div>`) +
    `<script>var CODE=${JSON.stringify(String(code)).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029")};async function act(a,id){try{var r=await fetch('/api/kt-facegallery',{method:'POST',headers:{'Content-Type':'application/json','X-Requested-With':'livotec'},credentials:'same-origin',body:JSON.stringify({action:a,code:CODE,id:id})});var j=await r.json();if(!j.ok){alert(j.error||'Không thực hiện được.');return;}location.reload();}catch(e){alert('Không kết nối được máy chủ.');}}</script></main></body></html>`;
}

module.exports = async function (context, req) {
  try {
    if (guardConfigured(context)) return;
    let u = null; try { u = userFromReq(req); } catch (e) { u = null; }
    if (!u || !u.email || !isAdmin(u.email)) return _http.reply(context, 403, { ok: false, error: "Chỉ quản trị viên đang đăng nhập mới dùng được." });
    const quiz = require("../_lib/quiz"), gal = require("../_lib/facegallery"), faceid = require("../_lib/faceid");
    const q = req.query || {};

    if (req.method === "POST") { // thao tác sửa dữ liệu: chỉ nhận từ trang quản trị (kèm tiêu đề X-Requested-With)
      if (!requireAjax(context, req)) return;
      const b = req.body || {}, act = String(b.action || ""), code = String(b.code || "").trim().slice(0, 50), k = quiz.normCode(code), id = String(b.id || "").trim().slice(0, 80);
      if (!k) return _http.reply(context, 400, { ok: false, error: "Thiếu mã nhân viên." });
      const audit = async (op, label, details) => { try { await require("../_lib/auditlog").write({ area: "admin", role: "admin", by: String(u.email).toLowerCase(), name: u.name || "", op, label, kind: "write", status: 200, ok: true, details, ip: require("../_lib/device").ipOf(req) }); } catch (e) { /* không chặn */ } };
      if (act === "unlock") { const had = await require("../_lib/securityalert").unlock("hist:" + k); await audit("faceUnlockHistory", "Mở khoá tra cứu lịch sử (khuôn mặt)", { code }); return _http.reply(context, 200, { ok: true, unlocked: had }); }
      if (act === "resetgallery") { const had = await gal.remove(k); await audit("faceResetGallery", "Xoá thư viện khuôn mặt của một mã", { code }); return _http.reply(context, 200, { ok: true, removed: had }); }
      if (act === "exclude" || act === "include") {
        if (!id) return _http.reply(context, 400, { ok: false, error: "Thiếu mã bài làm." });
        const a = await quiz.getAttempt(id);
        if (!a || quiz.normCode(a.code) !== k) return _http.reply(context, 404, { ok: false, error: "Không tìm thấy bài làm này của mã nhân viên đó." });
        const fid = act === "exclude" ? { s: "mismatch", manual: true, by: String(u.email).toLowerCase(), at: Date.now() } : null;
        if (fid) a.faceId = fid; else delete a.faceId;
        await quiz.putAttempt(a);
        await quiz.patchIndex({ [id]: { faceId: fid } }); // chỉ mục: có ảnh bị loại thì các nơi đối chiếu bỏ qua; dùng lại thì để lượt quét sau đối chiếu lại
        if (fid) await gal.dropSrc(k, id);
        await audit(act === "exclude" ? "faceExcludePhoto" : "faceIncludePhoto", act === "exclude" ? "Loại ảnh khỏi đối chiếu khuôn mặt" : "Dùng lại ảnh trong đối chiếu khuôn mặt", { code, attempt: id });
        return _http.reply(context, 200, { ok: true });
      }
      return _http.reply(context, 400, { ok: false, error: "Thao tác không hợp lệ." });
    }

    if (q.view === "1" && q.code) { // trang xem ảnh đối chiếu
      const html = await page(quiz, String(q.code).trim().slice(0, 50), u, req);
      context.res = { status: 200, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" }, body: html };
      return;
    }

    const out = { ok: true };
    if (q.run === "1") {
      out.scan = await faceid.scan({ ms: 15000 });       // { done, left, mismatch }: đối chiếu bài chưa kiểm tra (đồng thời đưa bài "match"/"first" vào thư viện)
      out.backfill = await gal.backfill({ ms: 15000 });   // { done, left }: bổ sung từ bài đã được đối chiếu trước đó
    }
    out.gallery = await gal.stats(q.code ? String(q.code).slice(0, 50) : "");
    return _http.reply(context, 200, out);
  } catch (e) {
    context.log.error("kt-facegallery", e && e.message);
    return _http.reply(context, 500, { ok: false, error: "Có lỗi xảy ra." });
  }
};
