# Tạo file giọng đọc tiếng Việt cho mọi câu hướng dẫn ở các màn đăng nhập → kiemtra/voice/*.mp3 + index.json
# Dùng khi máy người dùng không có giọng tiếng Việt (vd. Chrome trên Windows) và để giọng đọc đồng nhất trên mọi thiết bị.
#   pip install piper-tts ; tải giọng vi_VN-vais1000-medium (Piper, CC BY 4.0) rồi:
#   VOICE_MODEL=/đường/dẫn/vi_VN-vais1000-medium.onnx python3 dev/gen-voice.py
# Chạy lại sau mỗi lần thêm/sửa câu hướng dẫn hoặc thông báo lỗi (chỉ tạo file cho câu mới, xoá file của câu không còn dùng).
import os, sys, json, hashlib, re, subprocess, wave, importlib.util
ROOT = os.path.join(os.path.dirname(__file__), '..')
spec = importlib.util.spec_from_file_location('vp', os.path.join(os.path.dirname(__file__), 'voice-phrases.py')); vp = importlib.util.module_from_spec(spec); spec.loader.exec_module(vp)
OUT = os.path.join(ROOT, 'kiemtra', 'voice')
MODEL = os.environ.get('VOICE_MODEL', '/tmp/vits-piper-vi_VN-vais1000-medium/vi_VN-vais1000-medium.onnx')
def speakable(t):  # chỉ sửa cách đọc, không đổi nội dung hiển thị
    t = re.sub(r'\bemail\b', 'i meo', t, flags=re.I); t = re.sub(r'\bZalo\b', 'Da lô', t); t = re.sub(r'\blink\b', 'liên kết', t)
    t = t.replace('/', ', ').replace('(', ', ').replace(')', ', ').replace(':', ',')
    t = re.sub(r'\b0(\d{9})\b', lambda m: ' '.join('0' + m.group(1)), t)
    return re.sub(r'\s*,\s*(,\s*)+', ', ', t).strip(' ,')
def fid(t): return hashlib.sha1(t.encode('utf-8')).hexdigest()[:12]
def main():
    from piper import PiperVoice
    from piper.config import SynthesisConfig
    voice = PiperVoice.load(MODEL); cfg = SynthesisConfig(length_scale=1.12, noise_scale=0.6, noise_w_scale=0.7)
    os.makedirs(OUT, exist_ok=True)
    phrases = vp.collect(); idx = {}
    for t in phrases:
        f = fid(t) + '.mp3'; idx[t] = f; path = os.path.join(OUT, f)
        if os.path.exists(path): continue
        wav = '/tmp/_v.wav'
        with wave.open(wav, 'wb') as w: voice.synthesize_wav(speakable(t), w, syn_config=cfg)
        subprocess.run(['lame', '--quiet', '-m', 'm', '-b', '40', '--resample', '22.05', wav, path], check=True)
        print('+', f, t)
    for f in os.listdir(OUT):
        if f.endswith('.mp3') and f not in idx.values(): os.remove(os.path.join(OUT, f)); print('-', f)
    json.dump(idx, open(os.path.join(OUT, 'index.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=0, sort_keys=True)
    print(len(idx), 'câu')
main()
