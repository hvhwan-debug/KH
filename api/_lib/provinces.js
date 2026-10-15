// Danh sách tỉnh / thành phố dùng chung (khớp với danh sách trong app nhân viên: index.html, PROVINCES).
// Nhập tỉnh bằng ô chọn; máy chủ cũng kiểm tra để tránh gõ sai chính tả.
const PROVINCES = ["An Giang", "Bà Rịa - Vũng Tàu", "Bạc Liêu", "Bắc Giang", "Bắc Kạn", "Bắc Ninh", "Bến Tre", "Bình Dương", "Bình Định", "Bình Phước", "Bình Thuận", "Cà Mau", "Cao Bằng", "Cần Thơ", "Đà Nẵng", "Đắk Lắk", "Đắk Nông", "Điện Biên", "Đồng Nai", "Đồng Tháp", "Gia Lai", "Hà Giang", "Hà Nam", "Hà Nội", "Hà Tĩnh", "Hải Dương", "Hải Phòng", "Hậu Giang", "Hòa Bình", "Thành phố Hồ Chí Minh", "Hưng Yên", "Khánh Hòa", "Kiên Giang", "Kon Tum", "Lai Châu", "Lâm Đồng", "Lạng Sơn", "Lào Cai", "Long An", "Nam Định", "Nghệ An", "Ninh Bình", "Ninh Thuận", "Phú Thọ", "Phú Yên", "Quảng Bình", "Quảng Nam", "Quảng Ngãi", "Quảng Ninh", "Quảng Trị", "Sóc Trăng", "Sơn La", "Tây Ninh", "Thái Bình", "Thái Nguyên", "Thanh Hóa", "Thừa Thiên Huế", "Tiền Giang", "Trà Vinh", "Tuyên Quang", "Vĩnh Long", "Vĩnh Phúc", "Yên Bái"];

// So khớp không phân biệt hoa thường, dấu, dấu gạch ngang ("Đăk Nong" vẫn nhận ra "Đắk Nông")
const fold = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/[–—-]/g, " ").replace(/\./g, " ").replace(/\s+/g, " ").trim();
const norm = (s) => fold(s).replace(/^(tp|thanh pho|tinh)\s+/, "").trim();
const ALIAS = { "hcm": "Thành phố Hồ Chí Minh", "tp hcm": "Thành phố Hồ Chí Minh", "sai gon": "Thành phố Hồ Chí Minh", "ho chi minh": "Thành phố Hồ Chí Minh", "hue": "Thừa Thiên Huế", "ba ria vung tau": "Bà Rịa - Vũng Tàu", "brvt": "Bà Rịa - Vũng Tàu" };
const INDEX = {}; PROVINCES.forEach((p) => { INDEX[norm(p)] = p; });

// Tên chuẩn của một tỉnh (hoặc "" nếu không nhận ra). Chấp nhận "TP. Hồ Chí Minh", "Tỉnh Đắk Nông", "tiền giang"...
function canonProvince(s) { const k = norm(s); return k ? (INDEX[k] || ALIAS[k] || ALIAS[fold(s)] || "") : ""; }
// Chuẩn hoá một danh sách: trả { list: [tên chuẩn, không trùng], bad: [giá trị không nhận ra] }
function canonList(arr) {
  const list = [], bad = [];
  (Array.isArray(arr) ? arr : typeof arr === "string" ? arr.split(/[,;\n]/) : []).map((x) => String(x || "").trim()).filter(Boolean).forEach((x) => {
    const c = canonProvince(x); if (!c) bad.push(x); else if (list.indexOf(c) < 0) list.push(c);
  });
  return { list, bad };
}
module.exports = { PROVINCES, canonProvince, canonList };
