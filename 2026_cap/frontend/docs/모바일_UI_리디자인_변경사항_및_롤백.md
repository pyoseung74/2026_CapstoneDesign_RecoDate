# RecoDate 모바일 UI 리디자인 변경사항 및 롤백 가이드

작성일: 2026-06-12

## 작업 목표

- 모바일 화면만 제공된 시안 톤으로 고도화한다.
- 데스크톱 화면, 백엔드 API, 저장소 구조, 추천 알고리즘은 변경하지 않는다.
- 기존 버튼, 기능, 모달, 이벤트 흐름은 유지한다.
- 사용자가 "이전으로 되돌려줘"라고 요청하면 작업 직전 상태로 복원할 수 있게 한다.

## 백업 위치

작업 전 상태는 아래 경로에 보관했다.

- `frontend/_backup_before_mobile_redesign/index.html`
- `frontend/_backup_before_mobile_redesign/styles.css`
- `frontend/_backup_before_mobile_redesign/app.js`
- `backups/mobile-redesign-before-20260612-215835/`

`styles.mobile-redesign.css`는 이번 작업에서 새로 추가한 파일이라 작업 전 백업본에는 없다.

## 변경 파일

### `frontend/index.html`

- 기존 `styles.css` 뒤에 모바일 전용 디자인 파일을 추가했다.
- 로드 순서가 `styles.css` 다음이므로 기존 스타일을 보존한 상태에서 모바일 화면만 덮어쓴다.

```html
<link rel="stylesheet" href="./styles.css?v=friend-course-share-1" />
<link rel="stylesheet" href="./styles.mobile-redesign.css?v=mobile-redesign-1" />
```

### `frontend/styles.mobile-redesign.css`

- 새로 추가한 모바일 전용 스타일 파일이다.
- `@media (max-width: 768px)` 안에서만 주요 리디자인이 적용된다.
- 데스크톱에서는 기존 `styles.css`가 그대로 우선 동작한다.
- 주요 반영 범위:
  - 앱 전체 모바일 폭, 여백, 카드, 버튼, 입력창, 라운드, 그림자 정리
  - 하단 탭바를 모바일 앱 형태로 고정
  - 로그인, 회원가입, 홈, 지역 선택, 추천 조건, 추천 결과, 장소 상세, 코스 흐름, 내 코스, 커뮤니티, 댓글, TripTI, 마이페이지 화면 톤 정리
  - 추천 결과 카드가 모바일에서 한 장씩 또렷하게 보이도록 카드 폭과 내부 정보 구조 정리
  - 코스 장소 목록의 점 3개 메뉴를 모바일 드롭다운처럼 보이게 정리
  - 장소 상세의 RecoDate 리뷰 별점을 한 도형 안에 묶인 형태로 보이게 조정

### `frontend/app.js`

- 추천 결과 카드 안 장소별 점 3개 메뉴가 모바일에서 안정적으로 열리고 닫히도록 보조 동작만 추가했다.
- 메뉴 밖을 누르면 열린 장소 메뉴가 닫힌다.
- 기존 정보, 변경, 삭제 버튼과 연결된 기능은 그대로 유지한다.

## 모바일 패키징 반영

`mobile/scripts/prepare-web.mjs`는 `frontend` 폴더 전체를 `mobile/web`으로 복사한다.
복사 후 `docs`, `_backup_before_mobile_redesign`, 로컬 로그 파일은 패키징 대상에서 제외한다.

따라서 아래 명령을 실행하면 이번 모바일 UI 리디자인도 Capacitor 패키징 대상에 반영된다.

```powershell
npm.cmd run mobile:prepare
```

이 작업은 서버 배포가 아니다. 네이버 클라우드 서버에는 자동 배포하지 않는다.

## 롤백 방법

사용자가 "이전으로 되돌려줘"라고 요청하면 아래 순서로 복원한다.

1. 백업 파일을 원래 위치로 복사한다.

```powershell
Copy-Item -LiteralPath "frontend\_backup_before_mobile_redesign\index.html" -Destination "frontend\index.html" -Force
Copy-Item -LiteralPath "frontend\_backup_before_mobile_redesign\styles.css" -Destination "frontend\styles.css" -Force
Copy-Item -LiteralPath "frontend\_backup_before_mobile_redesign\app.js" -Destination "frontend\app.js" -Force
```

2. 이번 작업에서 새로 추가한 모바일 디자인 파일을 제거한다.

```powershell
Remove-Item -LiteralPath "frontend\styles.mobile-redesign.css" -Force
```

3. 모바일 패키징 자산도 되돌려야 하면 다시 복사한다.

```powershell
npm.cmd run mobile:prepare
```

## 확인 포인트

- 모바일 화면에서 하단 탭바가 고정되어 보이는지 확인한다.
- 데스크톱 폭에서는 기존 레이아웃이 유지되는지 확인한다.
- 추천 결과 카드에서 장소 목록, 점 3개 메뉴, 정보/변경/삭제 버튼이 작동하는지 확인한다.
- 코스 흐름 보기 버튼과 하단 시트가 기존 기능 그대로 열리는지 확인한다.
- 장소 상세의 리뷰 별점 UI가 한 박스 안에 묶여 보이는지 확인한다.
