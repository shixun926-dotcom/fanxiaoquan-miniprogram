# -*- coding: utf-8 -*-
"""
tools/convert-dishes.py —— 菜品图「转格式 + 重命名」工具（Python，需 pillow）

把绘图兄弟按「菜名」交付的图片（.jfif / .jpg / .jpeg / .png 均可），按 UI/Foods.md
映射批量转换为 dish_001.png ~ dish_200.png（OSS dishes/ 上传用），并输出对照报告。

用法：
  python convert-dishes.py <图片目录> [--out 输出目录] [--square] [--dry]

  <图片目录>  绘图兄弟交付的图片目录（文件名 = 菜名，如 重庆老火锅.jfif）
  --out       输出目录（默认：<图片目录>/dishes-out）
  --square    是否垫白边补成正方形（居中，推荐用于展示统一）
  --dry       只预览不改写

输出：
  输出目录/          dish_001.png ~ dish_200.png（PNG，无压缩损失）
  输出目录/rename-report.csv   对照报告（编号 / 菜名 / 原文件 / 新文件 / 状态）
"""
import os, re, sys, csv, io

try:
    from PIL import Image
except ImportError:
    print('需要 pillow：pip install pillow'); sys.exit(1)

FOODS = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'Foods.md')
EXTS = ('.jfif', '.jpg', '.jpeg', '.png', '.JPG', '.JFIF', '.JPEG', '.PNG')

def parse_foods():
    src = io.open(FOODS, encoding='utf-8').read()
    mp = {}
    for m in re.finditer(r'\|\s*(\d+)\s*\|\s*([^|]+?)\s*\|\s*\S+\s*\|\s*dish_\d+\.png\s*\|', src):
        mp[m.group(2).replace('★', '').strip()] = int(m.group(1))
    if len(mp) != 200:
        print('❌ Foods.md 解析异常：应 200 道，实际 %d 道' % len(mp)); sys.exit(1)
    return mp

def main():
    args = sys.argv[1:]
    src_dir = next((a for a in args if not a.startswith('--')), None)
    out_dir = None
    square, dry = False, False
    for i, a in enumerate(args):
        if a == '--out' and i + 1 < len(args): out_dir = args[i + 1]
        if a == '--square': square = True
        if a == '--dry': dry = True
    if not src_dir or not os.path.isdir(src_dir):
        print('用法: python convert-dishes.py <图片目录> [--out 输出目录] [--square] [--dry]'); sys.exit(1)
    out_dir = out_dir or os.path.join(src_dir, 'dishes-out')
    os.makedirs(out_dir, exist_ok=True)

    mp = parse_foods()
    files = [f for f in os.listdir(src_dir) if f.lower().endswith(EXTS)]
    matched, unmatched = [], []
    for f in files:
        base = os.path.splitext(f)[0]
        no = mp.get(base)
        if no is not None: matched.append((no, base, f))
        else: unmatched.append(f)
    matched.sort()
    missing = [n for n in mp.values() if n not in [x[0] for x in matched]]

    report = [['编号', '菜名', '原文件名', '新文件名', '状态']]
    ok = 0
    for no, name, old in matched:
        neu = 'dish_%03d.png' % no
        if not dry:
            im = Image.open(os.path.join(src_dir, old)).convert('RGB')
            if square:
                w, h = im.size
                s = max(w, h)
                canvas = Image.new('RGB', (s, s), (255, 255, 255))
                canvas.paste(im, ((s - w) // 2, (s - h) // 2))
                im = canvas
            im.save(os.path.join(out_dir, neu), 'PNG')
        report.append([no, name, old, neu, 'OK']); ok += 1
    for n in missing:
        name = [k for k, v in mp.items() if v == n][0]
        report.append([n, name, '-', 'dish_%03d.png' % n, '缺失'])
    for f in unmatched:
        report.append(['-', '-', f, '-', '未匹配'])

    rp = os.path.join(out_dir, 'rename-report.csv')
    with io.open(rp, 'w', encoding='utf-8-sig', newline='') as fh:
        csv.writer(fh).writerows(report)

    print('匹配 %d / 200 | 缺失 %d | 未匹配 %d%s' % (ok, len(missing), len(unmatched), '（dry 预览）' if dry else ''))
    if missing: print('缺失菜品:', '、'.join('%d=%s' % (n, [k for k, v in mp.items() if v == n][0]) for n in missing))
    if unmatched: print('未匹配文件:', '、'.join(unmatched))
    if not dry:
        print('已输出:', out_dir, '（dish_001.png ~ dish_200.png）')
    print('对照报告:', rp)
    print('抽查：001=重庆老火锅 / 100=铜锣烧 / 200=锅盔')

if __name__ == '__main__':
    main()
