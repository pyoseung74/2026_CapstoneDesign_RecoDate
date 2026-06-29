import argparse
import json
import math
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parents[1]
PROJECT_ROOT = BACKEND_DIR.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.config import settings
from app.services.business_place_repository import BusinessPlaceRepository


API_URL = "https://apis.data.go.kr/B553077/api/open/sdsc2/storeListInUpjong"
DEFAULT_CATEGORY_CODES = ("G2", "I1", "I2", "L1", "M1", "N1", "P1", "Q1", "R1", "S2")
ALL_SUPPORTED_CATEGORY_CODES = DEFAULT_CATEGORY_CODES


CAFE_WORDS = {
    "카페",
    "커피",
    "다방",
    "찻집",
    "차전문",
    "티하우스",
    "디저트",
    "베이커리",
    "제과",
    "제빵",
    "도넛",
    "아이스크림",
    "빙수",
}

BAR_WORDS = {
    "주점",
    "호프",
    "포차",
    "바",
    "bar",
    "맥주",
    "소주",
    "와인",
    "칵테일",
    "이자카야",
    "유흥",
    "단란",
}

OUTDOOR_ACTIVITY_WORDS = {
    "골프",
    "낚시",
    "스키",
    "승마",
    "수상",
    "테마파크",
    "놀이공원",
    "유원지",
    "캠핑",
    "야영",
    "레저",
}

INDOOR_ACTIVITY_WORDS = {
    "노래",
    "pc",
    "피씨",
    "오락",
    "볼링",
    "당구",
    "방탈출",
    "vr",
    "스크린골프",
    "헬스",
    "요가",
    "필라테스",
    "댄스",
    "체육",
    "스포츠",
    "수영",
    "테니스",
    "탁구",
    "스쿼시",
    "라켓",
    "바둑",
    "장기",
    "체스",
    "비디오방",
}

CULTURE_WORDS = {
    "공연",
    "전시",
    "박물",
    "미술",
    "화랑",
    "극장",
    "영화",
    "문화",
    "서점",
    "연극",
    "관람",
    "뮤지엄",
    "갤러리",
    "사진관",
    "영상",
}

TOURIST_WORDS = {
    "관광",
    "기념품",
    "공예",
    "전통",
    "한복",
    "여행",
    "명소",
    "전망",
    "유적",
    "사찰",
    "문화재",
}

SHOPPING_WORDS = {
    "백화점",
    "아울렛",
    "소품",
    "잡화",
    "쇼핑",
    "상점",
    "매장",
    "마트",
    "편의점",
    "슈퍼마켓",
    "기념품",
    "문구",
    "회화용품",
    "서점",
    "의류",
    "패션",
    "가방",
    "신발",
    "액세서리",
    "귀금속",
    "화장품",
    "꽃집",
    "가구",
    "주방",
    "가정용품",
    "생활용품",
    "중고",
    "상품",
    "소매",
    "아트샵",
    "플리마켓",
    "시장",
}


def compact_text(*values):
    return " ".join(str(value or "").strip() for value in values if str(value or "").strip()).lower()


def contains_any(text, words):
    return any(word.lower() in text for word in words)


def classify_business(item):
    lcls_cd = (item.get("indsLclsCd") or "").strip()
    lcls_nm = (item.get("indsLclsNm") or "").strip()
    mcls_nm = (item.get("indsMclsNm") or "").strip()
    scls_nm = (item.get("indsSclsNm") or "").strip()
    name = (item.get("bizesNm") or "").strip()
    source_category = scls_nm or mcls_nm or lcls_nm
    searchable = compact_text(name, lcls_nm, mcls_nm, scls_nm)
    source_searchable = compact_text(source_category)

    if lcls_cd == "I2":
        if contains_any(searchable, BAR_WORDS):
            return "술집", source_category
        if contains_any(searchable, CAFE_WORDS):
            return "카페", source_category
        return "음식점", source_category

    if lcls_cd == "I1":
        return "숙박", source_category

    if lcls_cd == "R1":
        if contains_any(source_searchable, CULTURE_WORDS):
            return "공연/관람", source_category
        if contains_any(source_searchable, INDOOR_ACTIVITY_WORDS):
            return "액티비티", source_category
        if contains_any(source_searchable, OUTDOOR_ACTIVITY_WORDS):
            return "액티비티", source_category
        return "기타", source_category

    if lcls_cd == "G2":
        if contains_any(source_searchable, CAFE_WORDS):
            return "카페", source_category
        if contains_any(source_searchable, TOURIST_WORDS):
            return "관광지", source_category
        if contains_any(source_searchable, CULTURE_WORDS):
            return "공연/관람", source_category
        return "쇼핑", source_category

    if contains_any(source_searchable, TOURIST_WORDS):
        return "관광지", source_category
    if contains_any(source_searchable, CULTURE_WORDS):
        return "공연/관람", source_category
    if contains_any(source_searchable, OUTDOOR_ACTIVITY_WORDS | INDOOR_ACTIVITY_WORDS):
        return "액티비티", source_category
    if contains_any(source_searchable, SHOPPING_WORDS):
        return "쇼핑", source_category
    return "기타", source_category


def parse_float(value):
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def to_place(item, standard_ym):
    name = (item.get("bizesNm") or "").strip()
    business_id = (item.get("bizesId") or "").strip()
    lat = parse_float(item.get("lat"))
    lon = parse_float(item.get("lon"))
    if not business_id or not name or lat is None or lon is None:
        return None
    category, source_category = classify_business(item)
    return {
        "id": business_id,
        "name": name,
        "branch_name": (item.get("brchNm") or "").strip(),
        "category": category,
        "source_category": source_category,
        "business_lcls_cd": item.get("indsLclsCd") or "",
        "business_lcls_nm": item.get("indsLclsNm") or "",
        "business_mcls_cd": item.get("indsMclsCd") or "",
        "business_mcls_nm": item.get("indsMclsNm") or "",
        "business_scls_cd": item.get("indsSclsCd") or "",
        "business_scls_nm": item.get("indsSclsNm") or "",
        "sido_code": item.get("ctprvnCd") or "",
        "sido_name": item.get("ctprvnNm") or "",
        "sigungu_code": item.get("signguCd") or "",
        "sigungu_name": item.get("signguNm") or "",
        "admin_dong_code": item.get("adongCd") or "",
        "admin_dong_name": item.get("adongNm") or "",
        "legal_dong_code": item.get("ldongCd") or "",
        "legal_dong_name": item.get("ldongNm") or "",
        "address": item.get("lnoAdr") or "",
        "road_address": item.get("rdnmAdr") or "",
        "lat": lat,
        "lon": lon,
        "standard_ym": standard_ym,
    }


def request_page(service_key, category_code, page_no, page_size, retries=3):
    params = {
        "serviceKey": service_key,
        "divId": "indsLclsCd",
        "key": category_code,
        "numOfRows": str(page_size),
        "pageNo": str(page_no),
        "type": "json",
    }
    url = API_URL + "?" + urllib.parse.urlencode(params)
    last_error = None
    for attempt in range(1, retries + 1):
        try:
            with urllib.request.urlopen(url, timeout=45) as response:
                raw = response.read().decode("utf-8")
            data = json.loads(raw)
            header = data.get("header") or {}
            if header.get("resultCode") != "00":
                raise RuntimeError(f"{header.get('resultCode')} {header.get('resultMsg')}")
            body = data.get("body") or {}
            items = body.get("items") or []
            if isinstance(items, dict):
                items = [items]
            return header, body, items
        except Exception as exc:
            last_error = exc
            if attempt < retries:
                time.sleep(1.5 * attempt)
    raise RuntimeError(f"{category_code} page {page_no} request failed: {last_error}")


def parse_category_codes(value):
    raw = (value or "").strip()
    if not raw:
        return list(DEFAULT_CATEGORY_CODES)
    if raw.lower() == "all":
        return list(ALL_SUPPORTED_CATEGORY_CODES)
    return [item.strip().upper() for item in raw.split(",") if item.strip()]


def import_business_places(args):
    service_key = settings.business_store_service_key
    if not service_key:
        raise SystemExit("BUSINESS_STORE_SERVICE_KEY 또는 TAGO_SERVICE_KEY가 필요합니다.")

    repository = BusinessPlaceRepository(args.database)
    if args.replace:
        repository.clear()

    imported_at = datetime.now(timezone.utc).isoformat()
    category_codes = parse_category_codes(args.category_codes)
    page_size = max(1, min(int(args.page_size), 1000))
    total_saved = 0
    total_seen = 0

    for category_code in category_codes:
        header, body, _ = request_page(service_key, category_code, 1, 1)
        total_count = int(body.get("totalCount") or 0)
        standard_ym = header.get("stdrYm") or ""
        total_pages = int(math.ceil(total_count / page_size)) if total_count else 0
        if args.max_pages:
            total_pages = min(total_pages, int(args.max_pages))
        print(
            f"[{category_code}] total_count={total_count} pages={total_pages} "
            f"page_size={page_size} standard_ym={standard_ym}",
            flush=True,
        )
        for page_no in range(int(args.start_page), total_pages + 1):
            page_header, _, items = request_page(service_key, category_code, page_no, page_size)
            page_standard_ym = page_header.get("stdrYm") or standard_ym
            total_seen += len(items)
            places = [place for item in items if (place := to_place(item, page_standard_ym))]
            repository.insert_many(places, imported_at=imported_at)
            total_saved += len(places)
            if page_no == 1 or page_no % int(args.progress_every) == 0 or page_no == total_pages:
                print(
                    f"[{category_code}] page={page_no}/{total_pages} "
                    f"items={len(items)} saved={len(places)} total_saved={total_saved}",
                    flush=True,
                )
            if args.sleep_seconds:
                time.sleep(float(args.sleep_seconds))

    print(f"seen={total_seen} saved={total_saved} database={repository.database_path}", flush=True)


def main():
    parser = argparse.ArgumentParser(description="Import national small-business store places into RecoDate.")
    parser.add_argument("--database", default=str(BACKEND_DIR / "data" / "recodate_places.db"))
    parser.add_argument("--category-codes", default=",".join(DEFAULT_CATEGORY_CODES))
    parser.add_argument("--page-size", type=int, default=1000)
    parser.add_argument("--start-page", type=int, default=1)
    parser.add_argument("--max-pages", type=int, default=0)
    parser.add_argument("--replace", action="store_true")
    parser.add_argument("--sleep-seconds", type=float, default=0.03)
    parser.add_argument("--progress-every", type=int, default=25)
    args = parser.parse_args()
    import_business_places(args)


if __name__ == "__main__":
    main()
