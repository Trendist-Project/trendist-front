"""토스 콘솔 이미지 규격 맞추기: python3 fit_images.py image image/upload
원본에서 crop(왼,위,오,아래 px)을 잘라 내고, 비율이 남으면 가장자리 픽셀을 늘려 채운다(fill이면 단색)."""
import sys, os
from PIL import Image

def pad_edge(im, W, H, valign='center', fill=None):
    w, h = im.size
    out = Image.new('RGB', (W, H))
    x0, y0 = (W - w) // 2, (0 if valign == 'top' else (H - h) // 2)
    out.paste(im, (x0, y0))
    if x0 > 0 and fill:  # 가장자리에 걸친 물체가 길게 늘어나면 단색으로 채운다
        out.paste(fill, (0, 0, W, H))
        out.paste(im, (x0, y0))
    elif x0 > 0:
        out.paste(im.crop((0, 0, 1, h)).resize((x0, h)), (0, y0))
        r = W - x0 - w
        out.paste(im.crop((w - 1, 0, w, h)).resize((r, h)), (x0 + w, y0))
    if y0 > 0:
        out.paste(out.crop((0, y0, W, y0 + 1)).resize((W, y0)), (0, 0))
    if H - y0 - h > 0:
        b = H - y0 - h
        out.paste(out.crop((0, y0 + h - 1, W, y0 + h)).resize((W, b)), (0, y0 + h))
    return out

def fit(src, dst, W, H, crop=(0, 0, 0, 0), mode='contain', valign='center', fill=None):
    im = Image.open(src).convert('RGB')
    w, h = im.size
    l, t, r, b = crop
    im = im.crop((l, t, w - r, h - b)); w, h = im.size
    s = (max if mode == 'cover' else min)(W / w, H / h)
    im = im.resize((round(w * s), round(h * s)), Image.LANCZOS)
    w, h = im.size
    if mode == 'cover':
        x, y = (w - W) // 2, (h - H) // 2
        im = im.crop((x, y, x + W, y + H))
    else:
        im = pad_edge(im, W, H, valign, fill)
    im.save(dst, optimize=True)
    print(os.path.basename(dst), im.size, f'scale {s:.3f}')

src, out = sys.argv[1], sys.argv[2]
os.makedirs(out, exist_ok=True)
j = lambda n: os.path.join(src, n)
o = lambda n: os.path.join(out, n)
fit(j('썸네일.png'), o('thumbnail_1932x828.png'), 1932, 828, mode='cover')
fit(j('가로형.png'), o('landscape_1504x741.png'), 1504, 741, valign='top')
fit(j('세로형1.png'), o('portrait1_636x1048.png'), 636, 1048, crop=(10, 0, 10, 0))
fit(j('세로형2.png'), o('portrait2_636x1048.png'), 636, 1048, crop=(6, 0, 2, 0), fill='#0b0f17')
fit(j('세로형3.png'), o('portrait3_636x1048.png'), 636, 1048, crop=(0, 0, 0, 32))
