// Đổi mã đời máy (vd "SM-A525F", "RMX3085") thành tên dễ hiểu (vd "Samsung Galaxy A52").
// Chỉ ghi tên cụ thể khi chắc chắn; không nhận ra đời máy thì vẫn ghi hãng + mã để không đoán sai.

// Samsung: phần số đầu của mã (bỏ đuôi vùng như F, B, E, DS, /DS)
const SAMSUNG = {
  S901: "Galaxy S22", S906: "Galaxy S22+", S908: "Galaxy S22 Ultra",
  S911: "Galaxy S23", S916: "Galaxy S23+", S918: "Galaxy S23 Ultra", S711: "Galaxy S23 FE",
  S921: "Galaxy S24", S926: "Galaxy S24+", S928: "Galaxy S24 Ultra", S721: "Galaxy S24 FE",
  S931: "Galaxy S25", S936: "Galaxy S25+", S938: "Galaxy S25 Ultra", S937: "Galaxy S25 Edge",
  G991: "Galaxy S21", G996: "Galaxy S21+", G998: "Galaxy S21 Ultra", G990: "Galaxy S21 FE",
  G981: "Galaxy S20", G986: "Galaxy S20+", G988: "Galaxy S20 Ultra", G780: "Galaxy S20 FE", G781: "Galaxy S20 FE",
  G970: "Galaxy S10e", G973: "Galaxy S10", G975: "Galaxy S10+", G960: "Galaxy S9", G965: "Galaxy S9+",
  N970: "Galaxy Note10", N975: "Galaxy Note10+", N770: "Galaxy Note10 Lite",
  N980: "Galaxy Note20", N981: "Galaxy Note20", N985: "Galaxy Note20 Ultra", N986: "Galaxy Note20 Ultra",
  F700: "Galaxy Z Flip", F707: "Galaxy Z Flip 5G", F711: "Galaxy Z Flip3", F721: "Galaxy Z Flip4", F731: "Galaxy Z Flip5", F741: "Galaxy Z Flip6",
  F916: "Galaxy Z Fold2", F926: "Galaxy Z Fold3", F936: "Galaxy Z Fold4", F946: "Galaxy Z Fold5", F956: "Galaxy Z Fold6",
  A025: "Galaxy A02s", A037: "Galaxy A03s", A057: "Galaxy A05s", A107: "Galaxy A10s", A207: "Galaxy A20s", A217: "Galaxy A21s",
  A515: "Galaxy A51", A715: "Galaxy A71"
};
function samsung(code) {
  const c = code.toUpperCase().replace(/^SAMSUNG[\s-]*/, "");
  const m = c.match(/^SM-([A-Z])(\d{3})/);
  if (!m) return "";
  const k = m[1] + m[2];
  if (SAMSUNG[k]) return "Samsung " + SAMSUNG[k];
  // Dòng A và M: SM-A525 → A52, SM-M336 → M33 (số thứ 3 là 6 thường là bản 5G)
  if (m[1] === "A" || m[1] === "M") return "Samsung Galaxy " + m[1] + m[2].slice(0, 2) + (m[2][2] === "6" ? " 5G" : "");
  if (m[1] === "X" || m[1] === "T" || m[1] === "P") return "Samsung Galaxy Tab (" + c.replace(/^SM-/, "") + ")";
  return "Samsung " + c;
}

// iPhone không gửi đời máy, chỉ đoán được nhóm máy theo cỡ màn hình (đơn vị điểm, không phụ thuộc xoay ngang)
const IPHONE = {
  "320x568": "iPhone SE (2016) / 5s",
  "375x667": "iPhone 6/7/8 / SE (2020, 2022)",
  "414x736": "iPhone 6/7/8 Plus",
  "375x812": "iPhone X / XS / 11 Pro / 12 mini / 13 mini",
  "414x896": "iPhone XR / XS Max / 11 / 11 Pro Max",
  "390x844": "iPhone 12 / 12 Pro / 13 / 13 Pro / 14",
  "428x926": "iPhone 12 Pro Max / 13 Pro Max / 14 Plus",
  "393x852": "iPhone 14 Pro / 15 / 15 Pro / 16",
  "430x932": "iPhone 14 Pro Max / 15 Plus / 15 Pro Max / 16 Plus",
  "402x874": "iPhone 16 Pro / 17 / 17 Pro",
  "440x956": "iPhone 16 Pro Max / 17 Pro Max",
  "420x912": "iPhone Air"
};
function iphone(screen) {
  const m = String(screen || "").match(/^(\d+)x(\d+)$/);
  if (!m) return "";
  const a = +m[1], b = +m[2], k = Math.min(a, b) + "x" + Math.max(a, b);
  return IPHONE[k] || "";
}

function modelName(model, screen) {
  const raw = String(model || "").trim();
  if (!raw) return "";
  if (raw === "iPhone") { const g = iphone(screen); return g ? g + " (đoán theo màn hình)" : "iPhone"; }
  if (raw === "iPad") return "iPad";
  const u = raw.toUpperCase();
  if (/^(SAMSUNG[\s-]*)?SM-[A-Z]\d{3}/.test(u)) return samsung(raw);
  if (/^CPH\d{4}$/.test(u)) return "OPPO " + raw;
  if (/^RMX\d{4}$/.test(u)) return "realme " + raw;
  if (/^V\d{4}[A-Z]?$/.test(u) || /^VIVO\s/i.test(raw)) return /^vivo/i.test(raw) ? raw : "vivo " + raw;
  if (/^\d{4,5}[A-Z0-9]{3,7}$/.test(u)) return "Xiaomi/Redmi " + raw; // mã số kiểu 23021RAA2Y
  if (/^(M\d{4}[A-Z]\d{1,2}[A-Z]{0,3})$/.test(u)) return "Xiaomi " + raw;    // mã kiểu M2101K6G
  if (/^PIXEL/i.test(raw)) return "Google " + raw;
  if (/^(TECNO|INFINIX|NOKIA|MOTO|HUAWEI|HONOR|ONEPLUS|REDMI|POCO|XIAOMI|OPPO|REALME|ASUS|SONY|LG)/.test(u)) return raw;
  return raw;
}

// Nhãn cũ đã lưu dạng "Điện thoại · SM-A525F · Android 13 · Chrome 120": đổi riêng phần đời máy
function prettyLabel(label, screen) {
  if (!label) return label;
  return String(label).split(" · ").map((p, i) => i === 1 ? (modelName(p, screen) || p) : p).join(" · ");
}

module.exports = { modelName, prettyLabel };
