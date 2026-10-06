# halloween2026

캣점프 할로윈 이벤트 게임 기획 프로토타입 저장소입니다.

## 바로 플레이

**https://topkide.github.io/halloween2026/**

| 게임 | 버전 | 설명 |
| --- | --- | --- |
| 유령 사격장 (Ghost Hunt) | PLAY TEST 10 · 밸런스 DB v6 | 유령을 잡고 폭탄 유령은 피하며, 보스·손전등·부적·이어하기로 버티는 터치 사격 게임. 결과에 따라 학교 물품 컬렉션을 획득 |

PC와 모바일 브라우저에서 모두 플레이할 수 있습니다. 현재 규칙과 수치 설명은 [`site/GAME_RULES.md`](site/GAME_RULES.md)에 있습니다.

밸런스, 아이템, 컬렉션은 브라우저 `localStorage`에 저장되므로 기기마다 따로 유지됩니다. 다른 기기·브라우저에서 같은 수치로 테스트하려면 **밸런스 → DB 파일 저장 / 불러오기**로 JSON 파일을 옮기세요.

## 폴더 구조

```
site/                       # 프로토타입 패키지 내용물 (GitHub Pages로 그대로 배포)
├─ index.html
├─ style.css
├─ app.mjs                  # 화면 연결, 입력, 저장, 결과창
├─ game-core.mjs            # 게임 규칙
├─ balance-config.mjs       # 기본 밸런스(DEFAULT_CONFIG), 시간대별 테이블, 검증
├─ balance-editor.mjs       # 밸런스 편집, DB 가져오기/내보내기
├─ balance-default-v6.json  # 기본 밸런스 DB (DEFAULT_CONFIG와 동일)
├─ GAME_RULES.md            # 구현 규칙과 수치 설명
├─ README.md                # 패키지 원본 안내문
├─ tests/                   # 로직·화면 참조 검증
└─ assets/                  # 이미지
.github/workflows/pages.yml # main에 푸시하면 site/를 Pages로 배포
```

빌드 단계는 없습니다. `site/` 폴더 내용이 그대로 웹사이트가 됩니다.

`site/README.md`에 있는 "저장소 최상위에 업로드 → Deploy from a branch" 안내는 이 저장소에는 해당하지 않습니다. 여기서는 `site/`를 GitHub Actions가 자동으로 배포합니다.

## 새 버전 올리기

1. 새 프로토타입 패키지(zip)의 **내용물 전체**로 `site/` 내용을 교체합니다. (`.openai/` 같은 호스팅 설정 폴더는 넣지 않습니다.)
2. `main` 브랜치에 커밋·푸시하면 GitHub Actions가 자동으로 다시 배포합니다. (1~2분 소요)
3. 배포 상태는 저장소의 **Actions → Deploy GitHub Pages**에서 확인할 수 있습니다.

## 기본 밸런스 바꾸기

모든 플레이어에게 같은 기본값을 주려면 밸런스 DB(JSON) 내용으로 아래 두 곳을 함께 맞춥니다.

- `site/balance-config.mjs`의 `DEFAULT_CONFIG`
- `site/balance-default-v6.json`

이미 밸런스를 저장한 브라우저는 그 값이 우선합니다. 새 기본값을 보려면 게임의 **밸런스 → 최신 기획 기본값 복원**을 누르세요.

## 로컬에서 실행과 테스트

ES 모듈(`.mjs`)을 사용하므로 `index.html`을 파일로 바로 열면 동작하지 않습니다. 간단한 정적 서버로 여세요.

```bash
cd site
python3 -m http.server 8000
# http://localhost:8000 접속

node --test tests/game-core.test.mjs   # 규칙 로직 테스트
python3 tests/check-ui.py              # 화면 요소·파일 참조 검사
```

## 최초 1회 설정 (저장소 관리자)

**Settings → Pages → Build and deployment → Source**를 **GitHub Actions**로 선택합니다. 이 저장소는 설정이 끝나 있으며, `main`에 푸시할 때마다 자동으로 배포됩니다.
