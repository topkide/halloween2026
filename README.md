# 캣점프 할로윈 · 유령이 숨은 밤

짧게 나타난 유령의 위치를 기억한 뒤, 암전된 방에서 하얀 유령의 고정된 자리를 빠르게 연속 탭하는 모바일 세로형 픽셀 게임입니다. 빈자리를 쏘면 시간이 0.4초 줄고 콤보가 끊기지만 빠른 명중으로 만회할 수 있습니다. 뿔 유령 명중이나 시간 초과는 즉시 실패이며, 성공하면 다음 배치로 계속 이어집니다.

명중 파편·연기·안개는 시야만 잠깐 방해하며 모든 타격 이펙트는 터치를 통과시킵니다. 이펙트가 겹쳐도 기억한 자리를 계속 조준할 수 있습니다.

3×3에서 5회, 4×4에서 7회 진행하고 13번째부터 5×5를 유지합니다. 220ms 연속 명중으로 콤보를 이어갑니다. 첫 실패에는 판당 1회 광고 체험 이어하기를 제공하며, 결과에 잡은 유령·수집품·구슬 보상을 표시합니다. 희귀 컬렉션은 한 판에 최대 2개 획득하고 브라우저에 저장합니다.

처치 보상은 마리당 1코인부터 시작해 5배치마다 1코인씩 늘어납니다. 이어하기로 난이도가 내려가도 해당 판에 도달한 최고 단가와 모은 코인은 유지합니다.

**[바로 플레이](https://topkide.github.io/halloween2026/)** · [게임 규칙](site/GAME_RULES.md) · [소스 수정 안내](site/README.md)

## 소스 구조

```text
site/                       # GitHub Pages에 그대로 배포
├─ index.html               # 화면 구성
├─ style.css                # 픽셀 화면·타격·유령 연출
├─ app.mjs                  # 입력·진행·사운드·브라우저 저장
├─ game-core.mjs            # 배치·난이도·콤보 등 게임 규칙
├─ collections.mjs          # 수집품 9종 이름·ID
├─ balance-config.mjs       # 밸런스 읽기·검증·편집 항목
├─ balance-editor.mjs       # 웹 밸런스 편집·JSON 저장/불러오기
├─ balance-default.json     # 유일한 공통 기본 밸런스
├─ assets/                  # room.png · target.png · decoy.png
├─ tests/                   # 규칙·게임 진행 검증
├─ GAME_RULES.md
└─ README.md
.github/workflows/pages.yml # 기존 Pages 자동 배포
```

빌드나 별도 서버 API 없이 실행합니다. 이전 사격장 프로토타입은 Git 이력에 남아 있습니다.

## 실행과 확인

저장소 루트에서 실행합니다. Python과 Node.js가 필요합니다.

```sh
python -m http.server 8765 --directory site
```

[로컬 게임](http://localhost:8765/)을 열어 플레이합니다. ES 모듈과 JSON 로딩을 사용하므로 HTML을 파일로 직접 여는 방식은 지원하지 않습니다.

```sh
node --test site/tests/*.test.mjs
node site/tests/gameplay.test.cjs
python site/tests/check-ui.py
```

## 수정과 배포

1. 변경할 기능의 소스만 수정합니다. 수치만 조정할 때는 `site/balance-default.json`을 수정합니다.
2. 위 검증을 실행하고 모바일 크기에서 실제 플레이를 확인합니다.
3. 변경 파일을 커밋해 `main`에 푸시합니다.
4. **Actions → Deploy GitHub Pages**에서 배포 완료를 확인합니다.

기존 워크플로는 `main`의 `site/**` 또는 워크플로 파일 변경 시 `site/`를 자동 배포합니다. 루트 README만 수정하면 배포가 시작되지 않습니다. ZIP 전체 교체나 Pages 설정 변경은 필요하지 않습니다.

배포 전에 위 세 가지 검증을 자동 실행합니다. 검증에 실패하면 기존 배포를 유지합니다.

## 밸런스 적용 범위

웹의 밸런스 편집은 **현재 브라우저의 `localStorage`에 저장되며 다음 판에 적용**됩니다. JSON 저장/불러오기로 다른 브라우저에 옮길 수 있습니다.

모두에게 제공할 기본값은 **`site/balance-default.json` 한 곳만** 수정한 뒤 커밋·푸시합니다. 브라우저에 저장된 사용자 밸런스는 기본값보다 우선하므로, 새 공통 기본값을 시험하려면 밸런스 화면에서 기본값을 복원하고 적용하세요. 브라우저 편집만으로 저장소나 다른 플레이어의 설정이 바뀌지는 않습니다.
