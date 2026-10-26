# 안전한 부분 치환: 모든 치환이 성공할 때만 파일을 바꾼다
import sys, os
def ed(path, pairs):
    s = open(path, encoding='utf-8').read()
    for a, b in pairs:
        if a not in s: raise SystemExit(f'MISS {path}: {a[:80]}')
        s = s.replace(a, b, 1)
    tmp = path + '.tmp'
    open(tmp, 'w', encoding='utf-8').write(s)
    os.replace(tmp, path)
