// Tra cứu tên địa điểm từ toạ độ GPS (lat/lng), dùng Nominatim (OpenStreetMap, miễn phí, không cần API key).
// Chỉ người đã đăng nhập (admin/quản lí) mới gọi được - tránh để dịch vụ miễn phí bị dùng tràn lan bởi người lạ.
const { reply, guardConfigured, requireUserActive } = require("../_lib/http");

// Bộ nhớ đệm trong tiến trình: cùng một chỗ (làm tròn ~11 m) không gọi Nominatim lại, nhẹ cho dịch vụ miễn phí khi xuất Excel.
const CACHE = new Map(), CACHE_MAX = 5000;

module.exports = async function (context, req) {
  try {
    if (guardConfigured(context)) return;
    const u = await requireUserActive(context, req);
    if (!u) return;
    const lat = parseFloat(req.query && req.query.lat);
    const lng = parseFloat(req.query && req.query.lng);
    if (!isFinite(lat) || !isFinite(lng)) return reply(context, 400, { ok: false, error: "Thiếu toạ độ hợp lệ." });

    const key = lat.toFixed(4) + "," + lng.toFixed(4);
    if (CACHE.has(key)) return reply(context, 200, { ok: true, label: CACHE.get(key) });

    const url = "https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=" + encodeURIComponent(lat) +
      "&lon=" + encodeURIComponent(lng) + "&zoom=16&addressdetails=1&accept-language=vi";
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 6000);
    let r;
    try {
      r = await fetch(url, { signal: ac.signal, headers: { "User-Agent": "kh-livotec-kiemtra/1.0 (ung dung noi bo, lien he quan tri vien)" } });
    } finally {
      clearTimeout(t);
    }
    if (!r || !r.ok) return reply(context, 200, { ok: true, label: "" });
    const j = await r.json();
    const a = j.address || {};
    const parts = [
      a.suburb || a.village || a.hamlet || a.quarter,
      a.town || a.city_district || a.district,
      a.city || a.county,
      a.state
    ].filter(Boolean);
    const label = parts.length ? parts.join(", ") : (j.display_name || "");
    if (label) { if (CACHE.size >= CACHE_MAX) CACHE.delete(CACHE.keys().next().value); CACHE.set(key, label); }
    return reply(context, 200, { ok: true, label });
  } catch (e) {
    context.log.error("kt-geocode", e && e.message);
    return reply(context, 200, { ok: true, label: "" }); // lỗi tra cứu không làm hỏng giao diện, chỉ không hiện tên
  }
};
