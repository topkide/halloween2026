# 밤의 현상금 사냥 · 소스 안내

| 파일 | 역할 |
| --- | --- |
| index.html | 점수·현상금·사냥터·탄약·설정 및 결과 화면 |
| style.css | 모바일 화면, 배경, 유령 관절 애니메이션, 사격 연출 |
| app.mjs | 입력, DOM 렌더링, 오디오, 일시정지, 광고 체험, 로컬 저장 |
| hunt-core.mjs | 시간·장전·랜덤 등장·현상금·점수·각 유령 이동 궤적 |
| ghost-art.mjs | 개별 관절을 가진 9종 SVG 아트 |
| tests/hunt-core.test.mjs | 보상, 장전, 실패, 일시정지, 랜덤 등장, 이동 및 예산 검증 |
| tests/check-ui.py | DOM ID, 모듈, 로컬 파일 참조 검사 |

공통 수치는 `hunt-core.mjs`의 DEFAULTS에 있습니다. 설정에서 변경한 수치는 이 브라우저의 다음 판에만 적용됩니다. 설정·최고 점수·최근 결과·사운드는 `catjump-bounty-hunt-v1` 키로 저장합니다. 이전 기억력 게임의 저장 데이터와 섞이지 않습니다.

## 렌더링 및 입력

살아 있는 유령은 최대 7마리, 동시 사격 효과는 최대 8개입니다. 개별 유령은 SVG의 몸통·팔·다리·꼬리를 CSS transform으로 움직이며, 이동 궤적은 단일 requestAnimationFrame에서 갱신합니다. 추가 이미지 다운로드 없이 벡터 아트가 표시됩니다. HUD는 80ms마다 업데이트하고, 동일한 텍스트는 다시 쓰지 않습니다. 효과는 750ms 내 제거됩니다.

영역 측정은 ResizeObserver 및 창 크기/스크롤 변경에서만 수행합니다. pointerdown은 즉시 발사하고 뒤따르는 click은 무시합니다. 키보드 활성화 click 및 Pointer Events 미지원 환경도 지원합니다. 유령이 사라진 구간에서는 입력을 받지 않습니다. 모바일에서는 게임 영역만 touch-action:none을 사용합니다.

일시정지에는 타이머·현상금 교체·장전·이동·관절 애니메이션이 함께 멈춥니다. 페이지가 숨겨질 때 자동 일시정지합니다. 광고 체험은 사냥을 멈춘 후 3초가 지나면 보상을 한 번 적용하며, 취소하면 보상 없이 복귀합니다.

## 확인 및 배포

저장소 루트에서:

```sh
node --test site/tests/*.test.mjs
python3 site/tests/check-ui.py
python3 -m http.server 8765 --directory site
```

GitHub Actions는 위 규칙 테스트와 UI 참조 검사를 통과해야 Pages에 배포합니다. 실제 브라우저에서는 시작, 터치 사격, 장전, 현상금 표시, 종료, 재도전, 일시정지, 설정, 광고 체험의 흐름을 확인합니다.
