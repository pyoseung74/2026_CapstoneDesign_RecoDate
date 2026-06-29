# RecoDate 데이터베이스 공유 및 복구 가이드

이 문서는 팀원이 로컬 개발 환경에서 RecoDate를 실행할 때 필요한 데이터베이스 파일과 공유 방식을 정리한다.

## DB 파일 역할

| 파일 | 용도 | Git 업로드 여부 |
| --- | --- | --- |
| `backend/data/recodate_users.db` | 실제 사용자, 세션, 커뮤니티, 친구, 채팅, 댓글, 리뷰 데이터 | 업로드 금지 |
| `backend/data/recodate_users.sample.db` | 개발용 빈 사용자 DB. 실제 데이터 없이 테이블 구조만 포함 | 업로드 |
| `backend/data/recodate_places.db` | 전국 장소 검색, Top 100, 지도 탐색, 코스 추천용 장소 DB | Git 본문 업로드 금지 |
| `backend/data/recodate_place_photos.db` | 장소 사진 캐시/메타 데이터 | 업로드 금지 |
| `backend/data/recodate_prices.db` | 가격 캐시/메타 데이터 | 업로드 금지 |
| `backend/data/gangneung_bus.db` | 지역 교통/버스 보조 데이터 | 업로드 금지 |
| `backend/data/franchise_brands.json` | 프랜차이즈 제외 필터용 브랜드 목록 | 업로드 |

## 사용자 DB 사용 방법

1. 저장소를 클론한다.
2. `backend/data/recodate_users.sample.db`를 `backend/data/recodate_users.db`로 복사한다.
3. 서버를 실행하면 해당 DB에 개발용 사용자, 커뮤니티, 리뷰 데이터가 새로 쌓인다.

PowerShell 예시:

```powershell
Copy-Item -LiteralPath backend\data\recodate_users.sample.db -Destination backend\data\recodate_users.db -Force
```

실제 운영/테스트 중 만들어진 `recodate_users.db`는 이메일, 세션 토큰, 댓글, 채팅, 리뷰 등 개인정보 또는 사용자 생성 콘텐츠를 포함할 수 있으므로 GitHub가 비공개 저장소여도 커밋하지 않는다.

## 장소 DB 공유 방법

`recodate_places.db`는 현재 전국 장소 데이터를 담는 대용량 DB다. 일반 Git 커밋에 포함하면 저장소가 무거워지고, 팀원이 매번 코드를 받을 때 불필요하게 큰 파일을 같이 받게 된다.

권장 방식은 아래 중 하나다.

1. GitHub Release asset
   - 파일명 예시: `recodate_places_2026-06-29.db.zip`
   - 릴리즈 설명에 적용 날짜, 데이터 출처, 생성 스크립트, SHA256 체크섬을 적는다.
   - 팀원은 릴리즈 파일을 내려받아 `backend/data/recodate_places.db`로 둔다.

2. 네이버 클라우드 Object Storage
   - 서버 배포와 같은 클라우드에 보관할 수 있어 운영/팀 공유에 가장 적합하다.
   - 버전별 경로 예시: `recodate/place-db/recodate_places_2026-06-29.db.zip`
   - 팀원에게 읽기 전용 다운로드 링크 또는 만료 시간 있는 presigned URL을 제공한다.

3. 내부 공유 드라이브
   - 빠르게 공유할 때는 OneDrive, Google Drive, Naver MYBOX 등으로 전달할 수 있다.
   - 단, 파일명에 날짜를 넣고 이전 버전을 보존한다.

## 장소 DB 배치 방법

팀원이 장소 DB를 받은 뒤 아래 위치에 둔다.

```text
backend/data/recodate_places.db
```

서버가 장소를 못 불러오면 먼저 이 파일이 존재하는지 확인한다.

PowerShell 확인:

```powershell
Test-Path backend\data\recodate_places.db
Get-Item backend\data\recodate_places.db | Select-Object Name,Length,LastWriteTime
```

## 체크섬 생성

대용량 DB는 전송 중 깨질 수 있으므로 공유할 때 SHA256 체크섬을 같이 제공한다.

```powershell
Get-FileHash backend\data\recodate_places.db -Algorithm SHA256
```

팀원이 받은 파일도 같은 명령으로 검사해 해시가 같은지 확인한다.

## 운영 DB 주의사항

- 실제 `recodate_users.db`는 Git에 올리지 않는다.
- 운영 서버의 사용자 DB를 공유해야 할 때는 개인정보 제거, 세션 삭제, 채팅/댓글/리뷰 비식별화 후 별도 파일로 만든다.
- `recodate_places.db`는 서비스 품질에 직접 영향을 주는 데이터 자산이므로 날짜별 버전과 생성 과정을 기록한다.
- `.env`, API 키, 네이버/ODsay/TMAP 키는 DB나 문서에 직접 넣지 않는다.
