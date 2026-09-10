# RecoDate

사용자의 조건과 실제 이동 동선을 고려하여 데이트 코스를 자동으로 생성하는 캡스톤디자인 프로젝트입니다.

단순히 장소를 추천하는 것이 아니라, 출발지와 이동수단을 기준으로 여러 장소를 하나의 코스로 구성하고 이동 거리와 시간을 함께 계산합니다.

## 주요 기능

* TMAP 기반 장소 검색
* 출발 장소 및 필수 방문 장소 설정
* 도보 / 자차 / 대중교통 선택
* 음식점, 카페, 액티비티, 산책 장소 등을 조합한 데이트 코스 생성
* 빠른 추천 3개 / 상세 추천 최대 5개 제공
* 음식 종류, 이동 반경, 숙박 여부 등 조건 반영
* 추천 장소 개별 변경 및 코스 재계산
* 실제 이동 거리 및 예상 시간 계산
* TMAP 지도 기반 추천 경로 표시
* 예상 교통비와 1인 기준 예상 비용 계산
* 회원가입 / 로그인 및 사용자 정보 관리

## 기술 구성

### Backend

* Python
* FastAPI
* SQLite
* TMAP API

### Frontend

* HTML
* CSS
* JavaScript
* TMAP JavaScript SDK

### Mobile

* Capacitor
* Android / iOS

## 프로젝트 구조

```text
2026_cap/
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── config.py
│   │   ├── schemas.py
│   │   └── services/
│   ├── data/
│   ├── scripts/
│   └── requirements.txt
│
├── frontend/
│   ├── index.html
│   ├── styles.css
│   └── app.js
│
├── android/
├── ios/
└── README.md
```

## 실행 방법

### Backend

```bash
cd 2026_cap/backend
pip install -r requirements.txt
python -m uvicorn app.main:app --reload --port 8010
```

API 문서:

```text
http://127.0.0.1:8010/docs
```

### Frontend

```bash
cd 2026_cap/frontend
python -m http.server 5174
```

접속:

```text
http://127.0.0.1:5174
```

## 추천 과정

```text
사용자 조건 입력
        ↓
후보 장소 탐색
        ↓
조건에 맞는 장소 조합
        ↓
이동 거리 및 시간 계산
        ↓
코스 구성
        ↓
추천 결과 및 지도 표시
```

## 프로젝트 정보

2026 강원대학교 캡스톤디자인

**AI 기반 데이트 코스 자동 생성 플랫폼 RecoDate**
