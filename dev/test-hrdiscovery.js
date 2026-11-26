// Rà soát dữ liệu nhân sự: đếm đúng, đánh dấu đủ mẫu / ít mẫu / thiếu, phát hiện trùng, KHÔNG tự điền.  node dev/test-hrdiscovery.js
process.env.STORAGE_MODE = "memory"; process.env.SESSION_SECRET = "dev-session-secret-dev-session-secret-1234";
const D = require("../api/_lib/hrdiscovery");
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? "PASS " : "FAIL ") + m); };
const now = Date.parse("2026-11-26T00:00:00Z");
const cands = [], index = [];
for (let i = 1; i <= 40; i++) {
  const c = { code: "NV" + i, name: "Người " + i, email: "nv" + i + "@x.vn", title: i % 2 ? "PC" : "SR", segment: "both", region: "bac", manager: "QL" };
  if (i <= 35) c.profile = { namSinh: 1980 + (i % 20), trinhDo: "Đại học", vaoCongTy: "2020-0" + (1 + (i % 9)) + "-01", chucDanhGoc: "Nhân viên" };
  if (i <= 12) c.profile = { namSinh: 1990 };            // 12 người chỉ có năm sinh
  cands.push(c);
  if (i <= 33) index.push({ code: "NV" + i, status: "submitted", pct: 50 + i, period: "k1", flags: { blur: i % 4 } });
}
cands.push({ code: "NV5", name: "Trùng mã", email: "nv5@x.vn" });                 // trùng mã + email
cands.push({ code: "NV99", name: "Đã nghỉ", email: "a@x.vn", left: true });
cands.push({ code: "NV98", name: "Sai email", email: "khong-hop-le", profile: { namSinh: 1930 } });
index.push({ code: "MA-LA", status: "submitted", pct: 70, period: "k1" });         // có điểm nhưng mã không còn trong danh sách
index.push({ code: "NV1", status: "submitted", pct: 99, period: "k2" });            // người này làm 2 kỳ: lấy điểm cao nhất, đếm 1 người
const sales = [{ month: "2026-10", rows: [{ code: "NV1", target: 100, actual: 90 }, { code: "NV2", target: 100, actual: 50 }, { code: "NV3", target: 0, actual: 5 }] }];
const r = D.build({ cands, index, sales, programs: 3, hoclieu: 5, now });
const f = (k) => r.fields.find((x) => x.key === k);
ok(r.population.total === 43 && r.population.left === 1 && r.population.active === 42, "dân số: 43 dòng, 1 đã nghỉ, 42 đang làm việc");
ok(f("email").filled === 42 && f("profile.namSinh").filled === 36, "tỉ lệ điền: email 42, năm sinh 36");
ok(f("profile.namSinh").pct === Math.round(1000 * 36 / 42) / 10, "phần trăm tính trên số người ĐANG làm việc");
ok(f("phone").filled === 0 && f("phone").pct === 0, "trường không có ai điền: 0, không tự điền");
const a = (n) => r.analyses.find((x) => x.name.indexOf(n) === 0);
ok(a("Cơ cấu nhân sự theo chức danh").status === "ok", "đủ mẫu (>= 30) -> ok");
ok(a("Cơ cấu theo trình độ").n === 23 && a("Cơ cấu theo trình độ").status === "low", "23 người có trình độ -> 'ít mẫu' (chỉ mô tả)");
ok(a("Độ tuổi × điểm").n === 33 && a("Độ tuổi × điểm").status === "ok", "độ tuổi × điểm: 33 người vừa có năm sinh vừa có điểm -> đủ mẫu");
ok(a("Điểm kiểm tra × % hoàn thành chỉ tiêu").n === 2 && a("Điểm kiểm tra × % hoàn thành chỉ tiêu").status === "no", "điểm × chỉ tiêu: chỉ 2 người khớp (NV3 chỉ tiêu 0 không tính) -> thiếu mẫu");
ok(a("Kinh nghiệm ngành hàng").n === 0 && a("Số giờ đào tạo").n === 0, "phân tích cần trường chưa có -> n = 0");
const q = (l) => (r.issues.find((x) => x.label.indexOf(l) === 0) || {}).n;
ok(q("Mã nhân viên bị trùng") === 1 && q("Email bị trùng") === 1, "phát hiện trùng mã và trùng email");
ok(q("Email sai định dạng") === 1 && q("Năm sinh ngoài khoảng") === 1, "phát hiện email sai và năm sinh bất thường (1930)");
ok(q("Có kết quả kiểm tra nhưng mã không còn") === 1, "phát hiện kết quả của mã không còn trong danh sách");
ok(r.sources.find((x) => x.name.indexOf("Kết quả kiểm tra") === 0).n === 34, "mỗi mã đếm một lần dù làm nhiều kỳ (NV1 làm 2 kỳ vẫn tính 1): 33 người + 1 mã lạ = 34");
ok(r.proposed.length === 9 && r.proposed.every((p) => p.state === "chưa có trường"), "đề xuất 9 trường bổ sung, đều ghi rõ 'chưa có trường' (không tự điền)");
ok(r.limits.some((x) => /Giới tính/.test(x)) && r.limits.some((x) => /30 người/.test(x)), "ghi rõ giới hạn: không lưu giới tính, ngưỡng 30 người");
console.log("\n" + pass + " pass, " + fail + " fail"); process.exit(fail ? 1 : 0);
