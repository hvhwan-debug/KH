# -*- coding: utf-8 -*-
"""Sinh khối CSS 'Ngành 1 (xanh Karofi)' từ chính CSS của index.html: mọi khai báo có màu teal Livotec
(hex/rgb/rgba, hue 160-195°) được xoay tông sang xanh dương, giữ nguyên độ bão hòa, độ sáng, độ trong suốt.
Chạy lại khi sửa CSS:  python3 dev/gen-ng1-theme.py   (ghi đè khối giữa hai dấu AUTO-NG1 trong index.html)."""
import re, colorsys, sys
P = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
BEGIN, END = '/* AUTO-NG1-BEGIN (dev/gen-ng1-theme.py) */', '/* AUTO-NG1-END */'
SHIFT = 32 / 360.0   # teal ~178° -> xanh Karofi ~210°

s = open(P, encoding='utf-8').read()
# bỏ khối cũ nếu có
s = re.sub(re.escape(BEGIN) + r'.*?' + re.escape(END) + r'\n?', '', s, flags=re.S)
a = s.index('<style>') + 7; b = s.index('</style>')
css = s[a:b]
css_nocomment = re.sub(r'/\*.*?\*/', '', css, flags=re.S)

def is_teal(r, g, bl):
    h, l, sat = colorsys.rgb_to_hls(r/255, g/255, bl/255)
    return 166 <= h*360 <= 192 and sat > 0.25
def rot(r, g, bl):
    h, l, sat = colorsys.rgb_to_hls(r/255, g/255, bl/255)
    r2, g2, b2 = colorsys.hls_to_rgb((h + SHIFT) % 1.0, l, sat)
    return round(r2*255), round(g2*255), round(b2*255)
def conv(m):
    t = m.group(0)
    if t.startswith('#'):
        h = t[1:]
        if len(h) == 3: h = ''.join(c*2 for c in h)
        r, g, bl = int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)
        if not is_teal(r, g, bl): return t
        r, g, bl = rot(r, g, bl); return '#%02X%02X%02X' % (r, g, bl)
    r, g, bl = int(m.group(1)), int(m.group(2)), int(m.group(3))
    if not is_teal(r, g, bl): return t
    r, g, bl = rot(r, g, bl); return t.replace('%s,%s,%s' % (m.group(1), m.group(2), m.group(3)), '%d,%d,%d' % (r, g, bl), 1) if False else re.sub(r'\(\s*\d+\s*,\s*\d+\s*,\s*\d+', '(%d,%d,%d' % (r, g, bl), t, 1)
COLOR = re.compile(r'#[0-9A-Fa-f]{6}\b|#[0-9A-Fa-f]{3}\b|rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)')
def has_teal(txt):
    return any(conv(m) != m.group(0) for m in COLOR.finditer(txt))

def split_top(txt, sep):
    out, depth, q, cur = [], 0, '', ''
    for ch in txt:
        if q:
            cur += ch
            if ch == q: q = ''
            continue
        if ch in '"\'': q = ch; cur += ch; continue
        if ch in '([': depth += 1
        elif ch in ')]': depth -= 1
        if ch == sep and depth == 0: out.append(cur); cur = ''
        else: cur += ch
    if cur.strip(): out.append(cur)
    return out

def parse(txt):
    items, i, n = [], 0, len(txt)
    while i < n:
        j, depth, q = i, 0, ''
        while j < n:
            ch = txt[j]
            if q:
                if ch == q: q = ''
            elif ch in '"\'': q = ch
            elif ch in '([': depth += 1
            elif ch in ')]': depth -= 1
            elif depth == 0 and ch in '{;': break
            j += 1
        head = txt[i:j].strip()
        if j >= n: break
        if txt[j] == ';': i = j + 1; continue
        # tìm dấu } khớp
        d, k, q = 1, j + 1, ''
        while k < n and d:
            ch = txt[k]
            if q:
                if ch == q: q = ''
            elif ch in '"\'': q = ch
            elif ch == '{': d += 1
            elif ch == '}': d -= 1
            k += 1
        body = txt[j+1:k-1]
        items.append((head, body)); i = k
    return items

def prefix_sel(sel):
    sel = sel.strip()
    if sel.startswith(':root'): return ':root[data-ng="1"]' + sel[5:]
    if sel == 'html': return ':root[data-ng="1"]'
    if sel.startswith('html '): return ':root[data-ng="1"] ' + sel[5:]
    return ':root[data-ng="1"] ' + sel

def gen(items):
    out = []
    for head, body in items:
        if head.startswith('@keyframes') or head.startswith('@font-face'): continue
        if head.startswith('@'):
            inner = gen(parse(body))
            if inner: out.append(head + '{' + ''.join(inner) + '}')
            continue
        decls = [d.strip() for d in split_top(body, ';') if d.strip()]
        keep = []
        for d in decls:
            if has_teal(d): keep.append(COLOR.sub(conv, d))
        if not keep: continue
        sels = ','.join(prefix_sel(x) for x in split_top(head, ','))
        out.append(sels + '{' + ';'.join(keep) + '}')
    return out

rules = gen(parse(css_nocomment))
block = BEGIN + '\n' + '\n'.join(rules) + '\n' + END + '\n'
marker = '/* ===== Ngành 1: tông xanh thương hiệu Karofi'
assert s.count(marker) == 1, 'không thấy mốc khối Ngành 1 thủ công'
s = s.replace(marker, block + marker)
open(P, 'w', encoding='utf-8').write(s)
print('đã sinh', len(rules), 'quy tắc,', len(block), 'ký tự')
