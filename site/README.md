# 캣점프 할로윈 유령 사격장 · GitHub Pages 소스

PLAY TEST 10 / 밸런스 DB v6 · 2026-10-06

최신 기획을 반영한 플레이 가능한 HTML/CSS/JavaScript 전체 소스와 이미지입니다.
별도 빌드, npm 설치, 서버 API, 로그인 없이 GitHub Pages에서 실행됩니다.

## GitHub Pages에 올리기

1. ZIP 압축을 풉니다.
2. 원하는 GitHub 저장소를 엽니다. 예: https://github.com/topkide/halloween2026
3. `Add file → Upload files`에서 압축을 푼 **내용물 전체**를 업로드하고 커밋합니다.
   - ZIP 파일 자체를 올리지 마세요.
   - 저장소 최상위에 `index.html`, `app.mjs`, `assets` 폴더 등이 보여야 합니다.
   - 바깥 폴더가 하나 더 생기지 않도록 내용물을 업로드하세요.
   - 숨김 파일 `.nojekyll`도 포함합니다. 빠졌다면 `Add file → Create new file`로 `.nojekyll`을 만들면 됩니다.
4. `Settings → Pages`를 엽니다.
5. `Build and deployment`에서 `Source: Deploy from a branch`, `Branch: main`, 폴더 `/(root)`를 선택하고 `Save`를 누릅니다.
   - main이 아닌 다른 브랜치에 올렸다면 그 브랜치를 선택합니다.
6. 배포가 완료되면 Pages에 표시되는 주소로 접속하고 그 링크를 공유합니다.

위 예시 저장소 이름을 그대로 사용할 경우 기본 주소는 다음과 같습니다.
https://topkide.github.io/halloween2026/
이 소스 전달만으로 해당 주소에 배포되는 것은 아닙니다. 위 업로드/설정 후 사용할 수 있습니다.

GitHub Free는 공개 저장소에서 Pages를 사용할 수 있습니다. 저장소가 비공개라면 사용하는 요금제의 Pages 지원 여부를 확인하세요.
공식 안내: https://docs.github.com/ko/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site

## 실행과 테스트

- 시작 버튼으로 플레이합니다.
- `아이템 준비`에서 광고 보상을 모의하여 손전등과 부적을 각각 1개 준비합니다.
- 게임 중 아이템 버튼 또는 키보드 `1`(손전등), `2`(부적)를 사용합니다.
- 게임 종료 후 광고 이어하기를 한 번 테스트할 수 있습니다.
- 실제 광고는 연결되어 있지 않습니다.

로컬에서 시험하려면 이 폴더에서 아래 명령을 실행한 뒤 http://localhost:8000/ 를 엽니다(Python 설치 필요).

```sh
python -m http.server 8000
```

JavaScript 모듈을 사용하므로 `index.html`을 더블클릭하는 file:// 방식은 지원하지 않습니다.

## 밸런스 수정과 보관

- 게임의 `밸런스`에서 시간대별 소환/체류/점수/페널티, 보스, 아이템, 이어하기, 컬렉션 확률을 수정합니다.
- 적용은 다음 판부터입니다.
- `DB 파일 저장`으로 JSON을 받고 다른 주소/브라우저에서 `DB 파일 불러오기`로 적용합니다.
- `balance-default-v6.json`은 이번 소스의 기본 수치입니다.
- 브라우저에서 적용한 밸런스는 그 브라우저에만 저장됩니다. 모두에게 같은 기본값을 제공하려면 `balance-config.mjs`의 `DEFAULT_CONFIG`를 수정하고 다시 업로드하세요.
- 아이템과 컬렉션도 각 브라우저에 저장됩니다. 기존 프로토타입 주소의 데이터는 GitHub Pages로 자동 이전되지 않습니다.

## 파일 안내

- `index.html`: 게임 화면
- `style.css`: 화면 및 연출 스타일
- `app.mjs`: 화면 연결, 입력, 저장, 결과창
- `game-core.mjs`: 게임 규칙
- `balance-config.mjs`: 기본 수치, 시간대별 테이블, 검증
- `balance-editor.mjs`: 밸런스 편집 및 DB 가져오기/내보내기
- `assets/`: 이미지 전체
- `balance-default-v6.json`: 기본 밸런스 DB
- `GAME_RULES.md`: 현재 구현 규칙과 임시 수치 설명
- `tests/`: 로직 및 화면 참조 검증

선택 검증 명령(Node.js/Python 설치 필요):

```sh
node --test tests/game-core.test.mjs
python tests/check-ui.py
```
