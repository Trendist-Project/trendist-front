"""토스 콘솔 로고(600×600): python3 make_logo.py ../branding/logo/text_logo6.png image/upload/logo_600x600.png
흰 배경 원본(2048px)에서 흰색을 투명하게 빼고(가장자리는 흰색과 섞인 만큼 반투명), 약 4% 여백으로 맞춘다."""
import sys
from PIL import Image

src, dst = sys.argv[1], sys.argv[2]
im = Image.open(src).convert('RGB')
out = Image.new('RGBA', im.size)
px, op = im.load(), out.load()
w, h = im.size
for y in range(h):
    for x in range(w):
        r, g, b = px[x, y]
        a = 255 - min(r, g, b)  # 흰색에 가까울수록 투명
        a = min(255, a * 255 // 200) if a > 8 else 0
        if a == 0:
            op[x, y] = (0, 0, 0, 0)
            continue
        f = a / 255  # 흰색과 섞인 색을 원래 색으로 되돌린다
        un = lambda c: max(0, min(255, round((c - 255 * (1 - f)) / f)))
        op[x, y] = (un(r), un(g), un(b), a)
box = out.getchannel('A').point(lambda v: 255 if v > 10 else 0).getbbox()
logo = out.crop(box)
side = round(max(logo.size) / (1 - 2 * 0.04))
canvas = Image.new('RGBA', (side, side), (0, 0, 0, 0))
canvas.paste(logo, ((side - logo.width) // 2, (side - logo.height) // 2))
canvas.resize((600, 600), Image.LANCZOS).save(dst, optimize=True)
print(dst, 'from', box)
