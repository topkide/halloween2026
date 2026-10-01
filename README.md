# halloween2026

캣점프 할로윈 이벤트 게임 기획 프로토타입 저장소입니다.

## 바로 플레이

**https://topkide.github.io/halloween2026/**

| 게임 | 버전 | 설명 |
| --- | --- | --- |
| 유령 사격장 (Ghost Hunt) | PLAY TEST 09 | 유령을 조준해 잡고, 순간이동하는 보스를 쫓아 시간을 늘리는 터치 사격 게임 |

PC와 모바일 브라우저에서 모두 플레이할 수 있습니다. 밸런스 설정과 아이템 보유량은 브라우저 `localStorage`에 저장되므로 기기마다 따로 유지됩니다. 다른 기기·브라우저에서 같은 수치로 테스트하려면 **밸런스 설정 → DB 파일 저장 / 불러오기**로 JSON 파일을 옮기세요.

## 폴더 구조

```
site/                  # GitHub Pages로 그대로 배포되는 정적 파일
├─ index.html
├─ style.css
├─ app.mjs             # 화면·입력·사운드
├─ game-core.mjs       # 게임 규칙 로직
├─ balance-config.mjs  # 기본 밸런스 수치와 검증
├─ balance-editor.mjs  # 밸런스 설정 대화상자
└─ assets/             # 이미지
.github/workflows/pages.yml  # main에 푸시하면 site/를 Pages로 배포
```

빌드 단계는 없습니다. `site/` 폴더 내용이 그대로 웹사이트가 됩니다.

## 새 버전 올리기

1. 새 프로토타입 묶음(zip/tar)의 파일로 `site/` 내용을 교체합니다. (`.openai/` 같은 호스팅 설정 폴더는 넣지 않습니다.)
2. `main` 브랜치에 커밋·푸시하면 GitHub Actions가 자동으로 다시 배포합니다. (1~2분 소요)
3. 배포 상태는 저장소의 **Actions → Deploy GitHub Pages**에서 확인할 수 있습니다.

## 로컬에서 실행

ES 모듈(`.mjs`)을 사용하므로 `index.html`을 파일로 바로 열면 동작하지 않습니다. 간단한 정적 서버로 여세요.

```bash
cd site
python3 -m http.server 8000
# http://localhost:8000 접속
```

## 최초 1회 설정 (저장소 관리자)

**Settings → Pages → Build and deployment → Source**를 **GitHub Actions**로 선택합니다. 이후에는 `main`에 푸시할 때마다 자동으로 배포됩니다.
