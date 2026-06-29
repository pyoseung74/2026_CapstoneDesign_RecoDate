# RecoDate 기능/API/데이터 저장 정리

작성 시점: 2026-06-12

이 문서는 현재 로컬 코드와 로컬 FastAPI 서버(`http://127.0.0.1:8010`) 기준으로 정리했다.

## 1. 이번에 추가한 장소 리뷰 기능

### 사용자 기능

- 사용자는 장소 상세 보기에서 `RecoDate 리뷰`를 볼 수 있다.
- 리뷰 요약은 앱 내부 리뷰 기준으로 `평균 별점`, `리뷰 개수`를 표시한다.
- 사용자는 별점 1~5점과 500자 이하 텍스트 리뷰를 남길 수 있다.
- 한 사용자는 한 장소에 리뷰 1개만 가진다.
- 같은 장소에 다시 등록하면 새 리뷰가 중복 생성되지 않고 기존 리뷰가 수정된다.
- 본인 리뷰는 삭제할 수 있다.
- 차단한 사용자 또는 나를 차단한 사용자의 리뷰는 목록과 평균/개수에서 제외된다.

### 추가 API

| Method | Path | 설명 |
|---|---|---|
| GET | `/api/places/reviews` | 장소별 RecoDate 리뷰 조회 |
| POST | `/api/places/reviews` | 장소 리뷰 작성/수정 |
| DELETE | `/api/places/reviews/{review_id}` | 내 장소 리뷰 삭제 |

### 저장 위치

장소 리뷰는 `backend/data/recodate_users.db` 안의 `place_reviews` 테이블에 저장된다.

`place_reviews` 컬럼:

- `id`: 리뷰 ID
- `place_key`: 장소 식별 키
- `place_id`: 프론트/추천 결과의 장소 ID
- `place_name`: 장소명
- `place_category`: 장소 카테고리
- `address`: 주소
- `lat`, `lon`: 좌표
- `user_id`: 작성자 ID
- `rating`: 별점 1~5
- `content`: 리뷰 본문
- `created_at`: 최초 작성 시각
- `updated_at`: 마지막 수정 시각

장소 식별 기준:

- `place_id`가 있으면 `id:{place_id}`를 사용한다.
- `place_id`가 없으면 `장소명 + 좌표`를 사용한다.
- 좌표도 없으면 정규화한 장소명을 사용한다.

## 2. 법적 체크포인트

짧게 말하면, 사용자가 직접 작성하는 앱 내부 리뷰 기능 자체는 일반적으로 가능하다. 다만 운영 전 아래 조건을 갖추는 것이 안전하다.

- 약관에 사용자 게시물/리뷰에 대한 서비스 내 이용 허락 범위를 명시해야 한다.
- “리뷰 데이터가 우리의 데이터 자산이 되는가?”에 대해서는 구분이 필요하다. 리뷰 DB, 통계, 별점 평균, 운영 데이터는 서비스의 데이터 자산으로 볼 수 있지만, 사용자가 작성한 원문 콘텐츠의 저작권까지 자동으로 회사에 넘어온다고 보면 위험하다. 약관으로 서비스 운영·노출·분석·홍보에 필요한 이용허락을 받아두는 방식이 안전하다.
- 개인정보가 포함될 수 있으므로 개인정보처리방침에 리뷰 작성, 작성자 닉네임 노출, 보관 기간, 삭제/탈퇴 처리 기준을 반영해야 한다.
- 리뷰 조작, 허위 후기, 보상성 리뷰를 표시 없이 노출하는 문제는 표시광고/전자상거래 규제 리스크가 있다. 신고/삭제/관리자 검수 정책이 필요하다.
- 외부 플랫폼 리뷰를 복사해오면 저작권/약관 문제가 생길 수 있다. 이번 기능은 Google/Naver 리뷰와 분리된 “RecoDate 앱 내부 작성 리뷰”라서 이 위험을 피하는 구조다.

참고 자료:

- 개인정보 보호법: https://www.law.go.kr/lsInfoP.do?lsId=011357
- 개인정보처리방침 작성/공개 예시: https://www.law.go.kr/LSW/privacyPolicy.do
- 전자상거래 등에서의 소비자보호 지침: https://www.law.go.kr/LSW/admRulInfoP.do?admRulSeq=2100000228532

## 3. 현재 배포/서버 반영 상태

### 로컬 개발 서버

- 현재 브라우저 URL: `http://127.0.0.1:5174/`
- 프론트는 `frontend/index.html`, `frontend/app.js`, `frontend/styles.css`를 사용한다.
- 백엔드 API 기본값은 로컬 웹에서 `http://127.0.0.1:8010`이다.
- 로컬 백엔드 `8010`은 재시작했고, `/openapi.json`에서 새 리뷰 API가 확인된다.

확인된 로컬 신규 API:

- `/api/places/reviews`
- `/api/places/reviews/{review_id}`

### 원격 서버

`frontend/runtime-config.js` 기준 네이티브 앱 번들 원격 API 주소는 `http://223.130.153.14`이다.

현재 확인 결과:

- `http://223.130.153.14/` → 404
- `http://223.130.153.14/openapi.json` → 404

즉, 이번 수정은 로컬 코드와 로컬 서버에는 반영되었지만 원격 서버에 자동 배포된 상태로 확인되지는 않았다. 원격 배포는 별도 서버 접속/업로드/서비스 재시작 절차가 필요하다.

## 4. 데이터베이스 구조

### `backend/data/recodate_users.db`

사용자 계정, 세션, 커뮤니티, 채팅, 차단, 신고, 장소 리뷰가 함께 저장된다. 커뮤니티 DB 파일이 완전히 별도로 있는 것은 아니고, 사용자 DB 파일 안에 커뮤니티 테이블들이 같이 있다.

테이블:

- `users`: 회원 기본 정보, 전화번호, 약관 동의, Kakao 연동, 프로필 이미지, TripTI 결과
- `sessions`: 로그인 세션 토큰
- `kakao_signup_pending`: 카카오 가입 대기 토큰
- `community_posts`: 커뮤니티 게시글
- `post_likes`: 게시글 좋아요
- `post_comments`: 게시글 댓글
- `friendships`: 친구 요청/수락 관계
- `chat_messages`: 친구 간 채팅 메시지
- `reports`: 게시글/댓글/사용자 신고
- `user_blocks`: 사용자 차단
- `place_reviews`: 장소별 RecoDate 앱 내부 리뷰

### `backend/data/recodate_places.db`

TourAPI 기반 장소 데이터가 저장된다.

- `tour_places`: 관광 장소, 카테고리, 주소, 좌표, 이미지 URL, 관광공사 content id

### `backend/data/recodate_place_photos.db`

장소 사진 캐시가 저장된다.

- `place_photos`: 정규화 장소명, 사진 URL, 제목, 위치, 출처, 캐시 시각

### `backend/data/recodate_prices.db`

장소별 가격/예산 계산용 데이터가 저장된다.

- `place_prices`: 장소명, 카테고리, 가격, 가격 라벨, 출처 URL
- `place_price_aliases`: 장소명 별칭과 가격 데이터 연결

### `backend/data/gangneung_bus.db`

강릉 버스 데이터가 저장된다.

- `bus_routes`: 노선
- `bus_stops`: 정류장
- `route_stops`: 노선별 정류장 순서

## 5. 브라우저/기기 로컬 저장 데이터

아래 데이터는 서버 DB가 아니라 브라우저 `localStorage` 또는 `sessionStorage`에 저장된다.

- `recodate_auth_token`: 로그인 토큰
- `recodate_auth_remember`: 로그인 유지 여부
- `recodate_auth_last_activity`: 비영구 로그인 20분 유휴 로그아웃 체크
- `recodate_bookmarked_places`: 찜한 장소
- `recodate_saved_courses`: 저장한 코스
- `recodate_recent_places_{user_id}`: 최근 본 장소
- `recodate_tripti_result_{user_id}`: TripTI 결과 로컬 캐시
- `recodate_browse_place_cache_v8_admin_strict`: 장소 둘러보기 캐시
- `recodate_api_base_url`: API 주소 수동 오버라이드

주의: 찜한 장소와 저장한 코스는 현재 서버 DB에 저장되지 않는다. 기기/브라우저가 바뀌면 동기화되지 않는다.

## 6. 전체 API 목록

### 기본/설정

| Method | Path | 설명 |
|---|---|---|
| GET | `/` | 서버 상태 확인 |
| GET | `/api/config/tmap-sdk` | TMAP JS SDK 키 조회 |

### 인증/회원

| Method | Path | 설명 |
|---|---|---|
| POST | `/api/auth/register` | 회원가입 |
| POST | `/api/auth/login` | 로그인 |
| POST | `/api/auth/logout` | 로그아웃 |
| GET | `/api/auth/me` | 현재 로그인 사용자 조회 |
| POST | `/api/auth/find-login-id` | 이메일로 아이디 찾기 |
| PATCH | `/api/auth/profile` | 닉네임/프로필 사진 수정 |
| GET | `/api/auth/kakao/start` | 카카오 로그인 시작 |
| GET | `/api/auth/kakao/callback` | 카카오 OAuth 콜백 |
| POST | `/api/auth/kakao/complete` | 카카오 신규 가입 완료 |

### TripTI

| Method | Path | 설명 |
|---|---|---|
| GET | `/api/auth/tripti-result` | TripTI 결과 조회 |
| POST | `/api/auth/tripti-result` | TripTI 결과 저장 |

### 장소/사진/지도

| Method | Path | 설명 |
|---|---|---|
| GET | `/api/places/search` | 시작 장소 검색 |
| GET | `/api/places/browse` | 지역/카테고리별 장소 둘러보기 |
| GET | `/api/places/replacements` | 비슷한 대체 장소 검색 |
| GET | `/api/places/google-photo-search` | Google 장소 사진 메타 검색 |
| GET | `/api/places/google-photo` | Google 장소 사진 프록시 |
| GET | `/api/places/naver-image` | Naver 이미지 검색 |
| GET | `/api/maps/static` | TMAP Static 지도 이미지 |
| GET | `/api/places/reviews` | RecoDate 장소 리뷰 조회 |
| POST | `/api/places/reviews` | RecoDate 장소 리뷰 작성/수정 |
| DELETE | `/api/places/reviews/{review_id}` | 내 RecoDate 장소 리뷰 삭제 |

### 코스 추천/경로

| Method | Path | 설명 |
|---|---|---|
| POST | `/api/recommendations` | 추천 코스 생성 |
| POST | `/api/routes/selected-course` | 선택한 코스 실제 경로 계산 |
| POST | `/api/courses/recalculate` | 수정한 추천 코스 다시 계산 |
| GET | `/api/courses/preview/{course_id}` | 홈 미리보기 코스 상세 |

추천 요청의 주요 기능:

- 도보/대중교통/자차 이동수단 반영
- 빠른 추천/상세 추천 모드
- 지역, 반경, 경유지 수, 음식/카페/저녁/술집 포함 여부
- 필수 방문 장소 여러 개
- 숙소/종료 장소
- 영업 중 필터
- 프랜차이즈 음식점 제외
- 날씨 예보 반영 옵션 `apply_weather`
- TripTI 선호 카테고리 반영

날씨 예보는 별도 저장 테이블이 없고, 추천 요청 시 `WeatherClient`를 통해 조회된 결과를 추천 응답의 `weather` 필드와 코스 구성에 반영하는 구조다.

### 커뮤니티 피드

| Method | Path | 설명 |
|---|---|---|
| GET | `/api/community/posts` | 피드 조회 |
| POST | `/api/community/posts` | 코스/글/사진 게시 |
| DELETE | `/api/community/posts/{post_id}` | 내 게시물 삭제 |
| POST | `/api/community/posts/{post_id}/like` | 좋아요 토글 |
| GET | `/api/community/posts/{post_id}/comments` | 댓글 목록 |
| POST | `/api/community/posts/{post_id}/comments` | 댓글 작성 |
| DELETE | `/api/community/comments/{comment_id}` | 댓글 삭제 |
| GET | `/api/community/images/{filename}` | 커뮤니티/채팅 이미지 파일 조회 |

커뮤니티 이미지 저장 위치:

- DB에는 파일명만 저장된다.
- 실제 파일은 `backend/data/uploads/comm_*.jpg|png|webp`에 저장된다.

### 친구/프로필/차단/신고

| Method | Path | 설명 |
|---|---|---|
| GET | `/api/community/friends` | 내 친구 목록 |
| POST | `/api/community/friends/request` | 친구 요청 |
| GET | `/api/community/friends/requests` | 받은 친구 요청 |
| POST | `/api/community/friends/respond` | 친구 요청 수락/거절 |
| DELETE | `/api/community/friends/{friend_id}` | 친구 끊기 |
| GET | `/api/community/users/search` | 닉네임 사용자 검색 |
| GET | `/api/community/users/{user_id}/profile` | 사용자 프로필 조회 |
| POST | `/api/community/reports` | 게시물/댓글/사용자 신고 |
| POST | `/api/community/blocks` | 사용자 차단 |
| GET | `/api/community/blocks` | 차단한 사용자 목록 |
| DELETE | `/api/community/blocks/{blocked_id}` | 차단 해제 |
| GET | `/api/community/my-stats` | 내 커뮤니티 통계 |

### 채팅

| Method | Path | 설명 |
|---|---|---|
| POST | `/api/community/chats/{friend_id}/messages` | 친구에게 메시지 보내기 |
| GET | `/api/community/chats/{friend_id}/messages` | 친구와의 메시지 조회 |
| GET | `/api/community/chats/unread` | 안 읽은 메시지 개수 |

채팅은 친구 관계인 사용자끼리만 가능하다.

## 7. 기능별 데이터 흐름

### 회원가입/로그인

- 회원가입 시 `users`에 계정 정보 저장
- 로그인 시 `sessions`에 토큰 저장
- 프론트는 토큰을 `sessionStorage` 또는 `localStorage`에 저장

### 프로필

- 닉네임과 프로필 이미지는 `users`에 저장
- 프로필 이미지는 현재 파일 업로드가 아니라 data URL 문자열로 `profile_image`에 저장

### 장소 둘러보기

- 장소 목록은 `RecommendationService`가 외부 API, TourAPI DB, Google/Naver 메타데이터를 조합해서 반환
- 일부 장소 목록 캐시는 브라우저 `localStorage`에 저장
- 외부 리뷰 수는 Google 메타데이터이며 우리 DB에 리뷰 원문을 저장하지 않는다

### 장소 리뷰

- 사용자가 장소 상세에서 리뷰 작성
- 프론트가 장소 ID/이름/카테고리/주소/좌표/별점/본문을 `/api/places/reviews`로 전송
- 백엔드가 `place_reviews`에 저장 또는 기존 리뷰 수정
- 상세 보기에서 조회 시 `place_reviews` 평균/개수/목록을 반환

### 코스 추천

- 추천 조건은 서버에 영구 저장하지 않는다.
- 추천 결과도 기본적으로 서버 DB에 저장하지 않는다.
- 사용자가 커뮤니티에 공유하면 `community_posts.course_json`에 코스 JSON이 저장된다.
- 사용자가 “내 코스”로 저장하면 현재는 브라우저 `localStorage`에 저장된다.

### 커뮤니티

- 게시글: `community_posts`
- 게시글 좋아요: `post_likes`
- 댓글: `post_comments`
- 이미지: `backend/data/uploads` + DB 파일명
- 신고: `reports`
- 차단: `user_blocks`

### 친구/채팅

- 친구 관계: `friendships`
- 채팅 메시지: `chat_messages`
- 채팅 첨부 이미지: `backend/data/uploads` + `chat_messages.images`

## 8. 지금 확인한 잔오류와 수정 내역

바로 수정한 항목:

- 장소 리뷰 기능 추가 후 로컬 서버가 이전 코드로 떠 있어 새 API가 안 보이던 상태를 확인했고, `8010` 백엔드를 재시작했다.
- 리뷰 목록에서는 차단 사용자를 숨기면서 평균/개수에는 포함될 수 있던 불일치 가능성을 수정했다.
- 모바일 웹 자산(`mobile/web`)을 `npm run mobile:prepare`로 동기화했다.

검증:

- `python -m compileall backend/app` 통과
- `node --check frontend/app.js` 통과
- `node --check mobile/web/app.js` 통과
- 장소 리뷰 Repository 저장/수정/삭제 테스트 통과
- 브라우저에서 장소 상세 모달에 `RecoDate 리뷰` 패널, 별점 5개, 등록 버튼, 빈 리뷰 상태 표시 확인
- 로컬 `/openapi.json`에서 새 리뷰 API 확인

## 9. 사용자 입장에서 불편할 수 있는 점

아래는 바로 수정하지 않고 제안으로 남긴다.

- 찜한 장소와 내 코스가 서버가 아니라 브라우저에 저장된다. 휴대폰/PC가 바뀌면 데이터가 이어지지 않는다.
- 프로필 이미지를 DB에 data URL로 저장하고 있어 사용자가 많아지면 DB가 빨리 커질 수 있다. 운영 단계에서는 파일 업로드 저장소로 분리하는 편이 좋다.
- 장소 리뷰 신고/관리자 삭제 API는 아직 없다. 리뷰 기능을 공개 운영하려면 리뷰 신고, 관리자 숨김, 금칙어/스팸 제한을 추가하는 것이 좋다.
- 원격 서버 `223.130.153.14`가 현재 404로 확인된다. 실제 배포 검증용 health check URL과 배포 절차를 문서화하는 것이 좋다.
- 장소 상세에서 외부 Google 리뷰와 RecoDate 리뷰가 같이 보인다. 사용자는 둘의 차이를 헷갈릴 수 있으므로 “외부 리뷰”와 “RecoDate 리뷰” 라벨을 더 선명하게 나누면 좋다.
- 장소 리뷰 작성 후 바로 평균 별점이 바뀌지만 장소 카드 목록에는 RecoDate 리뷰 요약이 아직 표시되지 않는다. 카드에도 작은 `RecoDate ★4.5` 배지를 붙이면 탐색성이 좋아진다.

## 10. 디자인 개선 제안

바로 수정하지 않은 제안:

- 장소 상세의 `RecoDate 리뷰` 섹션 상단에 “내 리뷰”와 “전체 리뷰”를 시각적으로 분리하면 수정/삭제 흐름이 더 명확해진다.
- 리뷰가 3개 이상 쌓이면 “더 보기” 접기 버튼을 두면 상세 모달이 너무 길어지는 문제를 줄일 수 있다.
- 별점 버튼은 현재 텍스트 별 문자 기반이다. 나중에 lucide/icon 기반으로 바꾸면 더 앱다운 느낌을 줄 수 있다.
- 장소 카드에 내부 리뷰 수가 생긴 장소만 작은 핑크 배지로 표시하면 RecoDate만의 데이터 자산이 눈에 더 잘 보인다.
