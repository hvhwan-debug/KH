# Thu thập mọi câu được đọc to ở các màn đăng nhập (kiemtra/index.html + lỗi máy chủ của các API đăng nhập).
# Dùng chung bởi dev/gen-voice.py. Chuẩn hoá phải GIỐNG HỆT hàm vgNorm() trong kiemtra/index.html.
import re, json, os, glob
ROOT = os.path.join(os.path.dirname(__file__), '..')
def norm(t):
    t = re.sub(r'^[\s⚠✓!]+', '', t).replace('…', '.')
    return re.sub(r'\s+', ' ', t).strip()
def lits(s):  # chuỗi '...' trong JS
    return [m.group(1).replace("\\'", "'") for m in re.finditer(r"'((?:[^'\\\n]|\\.)*)'", s)]
def collect():
    h = open(os.path.join(ROOT, 'kiemtra/index.html'), encoding='utf-8').read()
    out = []
    # 1) guide('...') và guide(... + '...')
    for m in re.finditer(r"guide\('((?:[^'\\\n]|\\.)*)'\s*[,)]", h): out.append(m.group(1))  # chỉ câu cố định; câu ghép thêm ở mục 3
    # 2) thông báo ở các màn đăng nhập
    for m in re.finditer(r"msg\('(checkMsg|photoMsg|startMsg)',(.*?)\);", h):
        out += [l for l in lits(m.group(2)) if len(l) > 12 and l not in ('warn', 'err', 'ok')]
    # 3) bảng lỗi khuôn mặt + câu nhắc thử thách + câu nhắc khi chờ
    fm = re.search(r"var FACE_MSG = \{(.*?)\};", h, re.S); out += lits(fm.group(1))
    lv = dict(re.findall(r"(\w+):'([^']+)'", re.search(r"var LV_VOICE = \{(.*?)\};", h).group(1)))
    for v in lv.values(): out += [v, 'Bắt đầu thử thách. ' + v, v + '. Hãy quay chậm hơn và giữ khuôn mặt trong khung.']
    rw = re.search(r"function aiReadyWatch\(\)\{(.*?)\n\}", h, re.S).group(1)
    out += [m for m in re.findall(r"hint = '([^']+)'", rw)]
    for p in ('Đăng nhập bằng khuôn mặt. ', 'Xác thực khuôn mặt. '): out.append(p + 'Đang mở camera, nếu trình duyệt hỏi, hãy bấm Cho phép.')
    # 4) lỗi trả về từ API của các bước đăng nhập / vào bài
    for f in [os.path.join(ROOT, 'api', n, 'index.js') for n in ('kt-check', 'kt-facelogin', 'kt-info', 'kt-live', 'kt-start', 'kt-consent')]:
        s = open(f, encoding='utf-8').read()
        out += re.findall(r'error:\s*"([^"]{12,})"', s)
    # 5) câu dự phòng cho nội dung có tên riêng / không đoán trước được
    out += ['Quay nhẹ hơn để camera còn thấy khuôn mặt.', 'Đưa khuôn mặt vào giữa khung.']  # câu trong biểu thức ba ngôi
    out += ['Xin chào. Đăng nhập thành công.', 'Vui lòng xem thông báo trên màn hình.']
    seen, res = set(), []
    for t in map(norm, out):
        ok = t and t not in seen and len(t.split()) >= 3 and not t.startswith('.') and not re.search(r'\$\{|\+|→|\\\\', t)
        if ok: seen.add(t); res.append(t)
    return res
if __name__ == '__main__':
    r = collect(); print(len(r)); print('\n'.join(r))
