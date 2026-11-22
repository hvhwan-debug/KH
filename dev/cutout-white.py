# Tách nền trắng của ảnh minh hoạ (giữ quầng sáng mờ, phần trắng bên trong vật thể vẫn đặc).
# Dùng: python3 dev/cutout-white.py vao.png ra.webp [rong cao] [cat x0,y0,x1,y1]
import sys, os
from PIL import Image
import numpy as np
from scipy import ndimage
src, dst = sys.argv[1], sys.argv[2]
size = tuple(map(int, sys.argv[3:5])) if len(sys.argv) > 4 else None
box = tuple(map(int, sys.argv[5].split(","))) if len(sys.argv) > 5 else None
a = np.array(Image.open(src).convert("RGB")).astype(float)
deficit = (255 - a).max(-1)
st = ndimage.generate_binary_structure(2, 1)
# THR: độ "khác trắng" tối thiểu để coi là vật thể đặc; CLOSE: số vòng nối các mảnh (ảnh có quầng mờ lớn thì tăng THR, giảm CLOSE)
THR, CLOSE = float(os.environ.get("THR", 70)), int(os.environ.get("CLOSE", 8))
obj = ndimage.binary_closing(deficit > THR, structure=st, iterations=CLOSE)
# MAXHOLE: chỉ lấp các "lỗ" trắng nhỏ hơn số điểm ảnh này (lòng quai cúp... để trong suốt); mặc định lấp hết (vòng trắng của bia ngắm)
MAXHOLE = float(os.environ.get("MAXHOLE", "inf"))
holes, n = ndimage.label(ndimage.binary_fill_holes(obj) & ~obj)
if n:
    sizes = ndimage.sum(np.ones_like(holes), holes, range(1, n + 1))
    obj = obj | np.isin(holes, [i + 1 for i, z in enumerate(sizes) if z < MAXHOLE])
obj = ndimage.binary_opening(obj, structure=st, iterations=2)
A = np.maximum(ndimage.gaussian_filter(obj.astype(float), 1.2), np.clip(deficit / 255 * 1.2, 0, 1))
col = np.clip(255 - (255 - a) / np.maximum(A[..., None], 1e-6), 0, 255)
o = Image.fromarray(np.dstack([col, A * 255]).astype("uint8"), "RGBA")
if box: o = o.crop(box)
if size: o = o.resize(size, Image.LANCZOS)
o.save(dst, quality=88, method=6) if dst.endswith(".webp") else o.save(dst)
