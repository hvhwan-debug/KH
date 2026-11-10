// Cách xưng hô theo tên: "Anh" / "Chị"; không chắc thì giữ "Anh/Chị" (xưng sai còn tệ hơn xưng chung).
// Hệ thống KHÔNG lưu giới tính nhân viên, nên chỉ suy ra từ tên đệm và tên gọi quen thuộc trong tiếng Việt.
function honorific(fullName) {
  var set = function (s, w, o) { s.split(/\s+/).forEach(function (k) { if (k) o[k] = w; }); return o; };
  var MID_M = set("hữu đức quốc đình công trọng thế duy bá mạnh", 2, set("văn", 3, {}));          // tên đệm đặc trưng nam
  var MID_F = set("thu kim thùy thuỳ diễm bích mỹ", 3, set("thị", 3, {}));                         // tên đệm đặc trưng nữ
  var GIV_M = set("hùng dũng tuấn cường hải long nam phong sơn thắng trung quang vinh đạt huy kiên lâm bình thành toàn việt đông tùng hậu lộc phúc quân thịnh tiến đức hưng trường khoa khôi hiếu nghĩa nhân phát sang tài thiện thuận tín trí tuyên vũ vương duy dương đại đăng hào hiển lợi mạnh phước quốc thái thạch toản tuân vĩnh văn kỳ kiệt khải", 2, {});
  var GIV_F = set("hương lan linh hoa mai ngọc phương thảo trang thủy thuỷ hằng hạnh hiền nhung oanh quyên vân yến dung loan liên lệ ly my nga nguyệt nhi như phượng thu thúy thuý thư trâm trinh tuyết uyên yên chi châu diệp diễm duyên điệp hân huệ huyền kiều mỹ ngân nhàn quỳnh sen thơm tiên trà vy ánh bích cúc đào hường khuê lụa mận mơ nương phụng quế thắm thơ tố trúc", 2, {});
  var raw = String(fullName == null ? "" : fullName).normalize("NFC").toLowerCase().replace(/[^a-zà-ỹđ\s]/g, " ").replace(/\s+/g, " ").trim();
  var t = raw ? raw.split(" ") : [];
  if (t.length < 2) return "Anh/Chị";
  var last = t.length - 1, m = 0, f = 0;
  for (var i = 1; i <= last; i++) {                              // bỏ họ (từ đầu tiên)
    var k = t[i];
    if (i === last) { m += GIV_M[k] || 0; f += GIV_F[k] || 0; }   // tên gọi: tính đủ
    else { m += Math.max(MID_M[k] || 0, (GIV_M[k] || 0) * 0.25); f += Math.max(MID_F[k] || 0, (GIV_F[k] || 0) * 0.25); } // tên đệm
  }
  if (m - f >= 1.5) return "Anh";
  if (f - m >= 1.5) return "Chị";
  return "Anh/Chị";
}

module.exports = { honorific };
