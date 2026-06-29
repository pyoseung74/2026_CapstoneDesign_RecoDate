# API 사용법

## 서버 실행

```powershell
cd "C:\Users\LEE\Desktop\school\4th year, 1st semester\AI 소프트웨어 캡스톤\프로젝트_YG\RecoDate MVP 구현_YG_차량 이어 붙이기\backend"
python -m uvicorn app.main:app --reload --port 8010
```

API 문서:

```text
http://127.0.0.1:8010/docs
```

## 시작 장소 검색

요청:

```http
GET /api/places/search?keyword=강릉역&count=10
```

응답에는 장소명, 좌표, TMAP 카테고리 정보가 포함된다.

## 빠른 추천 도보

요청:

```json
{
  "transport": "walk",
  "mode": "quick"
}
```

## 빠른 추천 자차

요청:

```json
{
  "transport": "car",
  "mode": "quick"
}
```

## 상세 설정 추천

요청:

```json
{
  "transport": "car",
  "mode": "detail",
  "radius_km": 5,
  "course_count": 5,
  "food_categories": ["한식"],
  "start_place": {
    "id": "gangneung_station",
    "name": "강릉역",
    "lat": 37.76516161,
    "lon": 128.90139644
  }
}
```

주의:

- `course_count`는 최대 5개이다.
- `mode`가 `quick`이면 `course_count`를 보내도 기본 3개로 처리한다.
- 추천 생성 API는 실제 TMAP 경로 API를 호출하지 않는다.
- 추천 결과의 거리와 시간은 좌표 기반 예상값이다.
- 실제 경로는 사용자가 코스를 선택한 뒤 별도 API로 계산한다.

~~`transport`가 `walk`이면 도보 경로 API를 사용한다.~~

~~`transport`가 `car`이면 자동차 다중경유지 API를 사용한다.~~

변경:
추천 생성 단계에서는 도보/자차 모두 실제 경로 API를 호출하지 않는다.
선택된 코스만 `POST /api/routes/selected-course`에서 실제 경로를 계산한다.

변경 이유:
추천 후보마다 경로 API를 호출하면 TMAP 경로안내 사용량이 빠르게 증가한다.
API 호출량을 줄이기 위해 추천 목록 생성과 실제 경로 계산을 분리한다.

## 선택한 코스 실제 경로 계산

요청:

```json
{
  "transport": "walk",
  "places": [
    {
      "id": "gangneung_station",
      "name": "강릉역",
      "lat": 37.76516161,
      "lon": 128.90139644
    },
    {
      "id": "10107144",
      "name": "은화식당",
      "lat": 37.76460611,
      "lon": 128.90103538
    },
    {
      "id": "cafe_001",
      "name": "프라이데이",
      "lat": 37.76402285,
      "lon": 128.90106318
    }
  ]
}
```

도보는 장소 사이를 구간별로 계산한다.
~~자차는 자동차 다중경유지 API로 한 번에 계산한다.~~

변경:
이 차량 이어 붙이기 버전에서는 자차도 장소 사이를 구간별로 계산한다.
장소가 5개이면 자동차 경로안내 API를 최대 4회 호출하고, 각 구간의 거리/시간/경로 좌표를 합쳐 반환한다.

변경 이유:
자동차 다중경유지 API는 일 사용 한도가 낮아 테스트 중 한도를 넘기기 쉽다.
구간별 자동차 경로안내는 호출 수는 늘지만 한도가 상대적으로 넉넉하고, 어느 구간에서 실패했는지 확인하기 쉽다.
