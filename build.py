"""Builds index.html (for GitHub Pages) and a single-file copy with everything inlined."""
import pathlib, sys
root = pathlib.Path(__file__).parent
FONTS = '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans+Arabic:wght@400;500;600&family=Readex+Pro:wght@500;600;700&display=swap">'
BODY = '''<header class="top"><div class="top-in">
<div class="brand">سحابة <span>AZ-104</span></div>
<nav id="nav" aria-label="الأقسام">
<a href="#home">الرئيسية</a><a href="#objectives">المحاور</a><a href="#practice">تدريب</a><a href="#cards">بطاقات</a><a href="#exam">امتحان</a><a href="#labs">مشاريع</a><a href="#bank">البنك</a><a href="#log">السجل</a><a href="#data">بياناتي</a>
</nav><button class="theme" id="theme" type="button">المظهر: تلقائي</button></div></header>
<main id="app"></main>'''
TITLE = '<title>سحابة Study Lab</title>'
css = (root / 'assets/style.css').read_text(encoding='utf-8')
DATA = ['data/az-104.js', 'data/az-104-b.js', 'data/az-104-c.js', 'data/labs.js', 'data/labs-b.js']
data = '\n'.join((root / f).read_text(encoding='utf-8') for f in DATA)
TAGS = '\n'.join(f'<script src="{f}"></script>' for f in DATA)
js = (root / 'assets/app.js').read_text(encoding='utf-8')

(root / 'index.html').write_text(f'''<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
{TITLE}
{FONTS}
<link rel="stylesheet" href="assets/style.css">
</head>
<body>
{BODY}
{TAGS}
<script src="assets/app.js"></script>
</body>
</html>
''', encoding='utf-8')

out = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else root / 'single.html'
out.write_text(f'{TITLE}\n{FONTS}\n<style>\n{css}</style>\n{BODY}\n<script>\n{data}\n</script>\n<script>\n{js}\n</script>\n', encoding='utf-8')
print('built', out)
