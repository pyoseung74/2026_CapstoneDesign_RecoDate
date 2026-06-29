// ============================================================
// 이 파일은 RecoDate MVP 프론트엔드 동작을 담당한다.
// 백엔드 API로 시작 장소 검색과 추천 코스 생성을 요청하고,
// 사용자가 코스를 선택했을 때만 실제 경로 계산 API를 호출한다.
// 선택한 코스는 TMAP JavaScript 지도 SDK로 실제 지도 위에 표시한다.
// ============================================================

const urlParams = new URLSearchParams(window.location.search);
if (urlParams.get("reset") === "1") {
  window.localStorage.removeItem("recodate_api_base_url");
}
const apiParam = urlParams.get("api");
if (apiParam) {
  window.localStorage.setItem("recodate_api_base_url", apiParam.replace(/\/$/, ""));
}
const currentHost = window.location.hostname;
const isNgrokHost = /(^|\.)ngrok(-free)?\.(app|dev)$/.test(currentHost);
const isLocalHost = !currentHost || ["localhost", "127.0.0.1", "::1"].includes(currentHost);
const apiHost = currentHost && !isLocalHost
  ? currentHost
  : "127.0.0.1";
const storedApiBaseUrl = window.localStorage.getItem("recodate_api_base_url");
const API_BASE_URL = window.RECODATE_API_BASE_URL
  || (apiParam ? apiParam.replace(/\/$/, "") : "")
  || (!isLocalHost ? window.location.origin : "")
  || storedApiBaseUrl
  || `http://${apiHost}:8010`;
const AUTH_TOKEN_KEY = "recodate_auth_token";
const AUTH_REMEMBER_KEY = "recodate_auth_remember";
const BOOKMARKS_KEY = "recodate_bookmarked_places";
const SAVED_COURSES_KEY = "recodate_saved_courses";
const RECENT_PLACES_KEY = "recodate_recent_places";
const BROWSE_CACHE_KEY = "recodate_browse_place_cache_v8_admin_strict";
const TRIPTI_RESULT_KEY = "recodate_tripti_result";
const AUTH_LAST_ACTIVITY_KEY = "recodate_auth_last_activity";
const AUTH_IDLE_TIMEOUT_MS = 20 * 60 * 1000;
const kakaoTokenParam = urlParams.get("kakao_token");
const kakaoSignupParam = urlParams.get("kakao_signup");
const kakaoSignupEmailParam = urlParams.get("kakao_email");
const kakaoSignupNicknameParam = urlParams.get("kakao_nickname");
const authErrorParam = urlParams.get("auth_error");
if (kakaoTokenParam) {
  sessionStorage.setItem(AUTH_TOKEN_KEY, kakaoTokenParam);
  window.history.replaceState({}, document.title, window.location.pathname);
}
const BROWSE_PAGE_SIZE = 12;
const BROWSE_TOP_LIMIT = 100;
const BROWSE_REGION_TOP_LIMIT = 50;
const BROWSE_CLIENT_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const MAP_EXPLORE_CATEGORY_META = {
  food: { label: "음식점", icon: "F", className: "food" },
  cafe: { label: "카페", icon: "C", className: "cafe" },
  bar: { label: "술집", icon: "B", className: "bar" },
  tourist: { label: "관광지", icon: "T", className: "tourist" },
  activity: { label: "액티비티", icon: "A", className: "activity" },
  culture: { label: "공연/관람", icon: "P", className: "culture" },
  stay: { label: "숙박", icon: "S", className: "lodging" },
  shopping: { label: "쇼핑", icon: "H", className: "shopping" },
  other: { label: "기타", icon: "E", className: "other" },
};
const REGION_CENTERS = {
  national: { id: "national_center", name: "대한민국", lat: 36.5000, lon: 127.8000, label: "대한민국", recommendable: false },
  seoul: { id: "seoul_center", name: "서울 중심", lat: 37.5665, lon: 126.9780, label: "서울 전체" },
  gyeonggi: { id: "gyeonggi_center", name: "경기 중심", lat: 37.4138, lon: 127.5183, label: "경기", recommendable: false },
  busan: { id: "busan_center", name: "부산 중심", lat: 35.1796, lon: 129.0756, label: "부산" },
  jeju: { id: "jeju_center", name: "제주 중심", lat: 33.4996, lon: 126.5312, label: "제주" },
  daejeon: { id: "daejeon_center", name: "대전 중심", lat: 36.3504, lon: 127.3845, label: "대전" },
  jeonju: { id: "jeonju_center", name: "전주 중심", lat: 35.8242, lon: 127.1480, label: "전주" },
  gyeongju: { id: "gyeongju_center", name: "경주 중심", lat: 35.8562, lon: 129.2247, label: "경주" },
  yeosu: { id: "yeosu_center", name: "여수 중심", lat: 34.7604, lon: 127.6622, label: "여수" },
  gangneung: { id: "gangneung_center", name: "강릉 중심", lat: 37.7519, lon: 128.8761, label: "강릉" },
  incheon: { id: "incheon_center", name: "인천 중심", lat: 37.4563, lon: 126.7052, label: "인천" },
  gangwon: { id: "gangwon_center", name: "강원 중심", lat: 37.8228, lon: 128.1555, label: "강원", recommendable: false },
  gyeongsang: { id: "gyeongsang_center", name: "경상 중심", lat: 35.8714, lon: 128.6014, label: "경상", recommendable: false },
  jeolla: { id: "jeolla_center", name: "전라 중심", lat: 35.1595, lon: 126.8526, label: "전라", recommendable: false },
  chungcheong: { id: "chungcheong_center", name: "충청 중심", lat: 36.6357, lon: 127.4913, label: "충청", recommendable: false },
  seoul_gangnam: { id: "seoul_gangnam_center", name: "강남구 중심", lat: 37.5172, lon: 127.0473, label: "서울 강남구" },
  seoul_gangdong: { id: "seoul_gangdong_center", name: "강동구 중심", lat: 37.5301, lon: 127.1238, label: "서울 강동구" },
  seoul_gangbuk: { id: "seoul_gangbuk_center", name: "강북구 중심", lat: 37.6396, lon: 127.0257, label: "서울 강북구" },
  seoul_gangseo: { id: "seoul_gangseo_center", name: "강서구 중심", lat: 37.5509, lon: 126.8495, label: "서울 강서구" },
  seoul_gwanak: { id: "seoul_gwanak_center", name: "관악구 중심", lat: 37.4784, lon: 126.9516, label: "서울 관악구" },
  seoul_gwangjin: { id: "seoul_gwangjin_center", name: "광진구 중심", lat: 37.5384, lon: 127.0823, label: "서울 광진구" },
  seoul_guro: { id: "seoul_guro_center", name: "구로구 중심", lat: 37.4955, lon: 126.8877, label: "서울 구로구" },
  seoul_geumcheon: { id: "seoul_geumcheon_center", name: "금천구 중심", lat: 37.4569, lon: 126.8955, label: "서울 금천구" },
  seoul_nowon: { id: "seoul_nowon_center", name: "노원구 중심", lat: 37.6542, lon: 127.0568, label: "서울 노원구" },
  seoul_dobong: { id: "seoul_dobong_center", name: "도봉구 중심", lat: 37.6688, lon: 127.0471, label: "서울 도봉구" },
  seoul_dongdaemun: { id: "seoul_dongdaemun_center", name: "동대문구 중심", lat: 37.5744, lon: 127.0396, label: "서울 동대문구" },
  seoul_dongjak: { id: "seoul_dongjak_center", name: "동작구 중심", lat: 37.5124, lon: 126.9393, label: "서울 동작구" },
  seoul_mapo: { id: "seoul_mapo_center", name: "마포구 중심", lat: 37.5663, lon: 126.9019, label: "서울 마포구" },
  seoul_seodaemun: { id: "seoul_seodaemun_center", name: "서대문구 중심", lat: 37.5791, lon: 126.9368, label: "서울 서대문구" },
  seoul_seocho: { id: "seoul_seocho_center", name: "서초구 중심", lat: 37.4837, lon: 127.0324, label: "서울 서초구" },
  seoul_seongdong: { id: "seoul_seongdong_center", name: "성동구 중심", lat: 37.5634, lon: 127.0369, label: "서울 성동구" },
  seoul_seongbuk: { id: "seoul_seongbuk_center", name: "성북구 중심", lat: 37.5894, lon: 127.0167, label: "서울 성북구" },
  seoul_songpa: { id: "seoul_songpa_center", name: "송파구 중심", lat: 37.5145, lon: 127.1059, label: "서울 송파구" },
  seoul_yangcheon: { id: "seoul_yangcheon_center", name: "양천구 중심", lat: 37.5169, lon: 126.8664, label: "서울 양천구" },
  seoul_yeongdeungpo: { id: "seoul_yeongdeungpo_center", name: "영등포구 중심", lat: 37.5264, lon: 126.8962, label: "서울 영등포구" },
  seoul_yongsan: { id: "seoul_yongsan_center", name: "용산구 중심", lat: 37.5326, lon: 126.9905, label: "서울 용산구" },
  seoul_eunpyeong: { id: "seoul_eunpyeong_center", name: "은평구 중심", lat: 37.6176, lon: 126.9227, label: "서울 은평구" },
  seoul_jongno: { id: "seoul_jongno_center", name: "종로구 중심", lat: 37.5735, lon: 126.9788, label: "서울 종로구" },
  seoul_jung: { id: "seoul_jung_center", name: "중구 중심", lat: 37.5636, lon: 126.9976, label: "서울 중구" },
  seoul_jungnang: { id: "seoul_jungnang_center", name: "중랑구 중심", lat: 37.6063, lon: 127.0927, label: "서울 중랑구" },
  gyeonggi_suwon: { id: "gyeonggi_suwon_center", name: "수원시 중심", lat: 37.2636, lon: 127.0286, label: "경기 수원시" },
  gyeonggi_seongnam: { id: "gyeonggi_seongnam_center", name: "성남시 중심", lat: 37.4200, lon: 127.1265, label: "경기 성남시" },
  gyeonggi_goyang: { id: "gyeonggi_goyang_center", name: "고양시 중심", lat: 37.6584, lon: 126.8320, label: "경기 고양시" },
  gyeonggi_yongin: { id: "gyeonggi_yongin_center", name: "용인시 중심", lat: 37.2411, lon: 127.1776, label: "경기 용인시" },
  gyeonggi_bucheon: { id: "gyeonggi_bucheon_center", name: "부천시 중심", lat: 37.5035, lon: 126.7660, label: "경기 부천시" },
  gyeonggi_ansan: { id: "gyeonggi_ansan_center", name: "안산시 중심", lat: 37.3219, lon: 126.8309, label: "경기 안산시" },
  gyeonggi_anyang: { id: "gyeonggi_anyang_center", name: "안양시 중심", lat: 37.3943, lon: 126.9568, label: "경기 안양시" },
  gyeonggi_namyangju: { id: "gyeonggi_namyangju_center", name: "남양주시 중심", lat: 37.6360, lon: 127.2165, label: "경기 남양주시" },
  gyeonggi_hwaseong: { id: "gyeonggi_hwaseong_center", name: "화성시 중심", lat: 37.1995, lon: 126.8312, label: "경기 화성시" },
  gyeonggi_pyeongtaek: { id: "gyeonggi_pyeongtaek_center", name: "평택시 중심", lat: 36.9921, lon: 127.1127, label: "경기 평택시" },
  gyeonggi_uijeongbu: { id: "gyeonggi_uijeongbu_center", name: "의정부시 중심", lat: 37.7381, lon: 127.0338, label: "경기 의정부시" },
  gyeonggi_siheung: { id: "gyeonggi_siheung_center", name: "시흥시 중심", lat: 37.3802, lon: 126.8029, label: "경기 시흥시" },
  gyeonggi_paju: { id: "gyeonggi_paju_center", name: "파주시 중심", lat: 37.7599, lon: 126.7802, label: "경기 파주시" },
  gyeonggi_gimpo: { id: "gyeonggi_gimpo_center", name: "김포시 중심", lat: 37.6153, lon: 126.7157, label: "경기 김포시" },
  gyeonggi_gwangmyeong: { id: "gyeonggi_gwangmyeong_center", name: "광명시 중심", lat: 37.4784, lon: 126.8645, label: "경기 광명시" },
  gyeonggi_gwangju: { id: "gyeonggi_gwangju_center", name: "광주시 중심", lat: 37.4294, lon: 127.2550, label: "경기 광주시" },
  gyeonggi_gunpo: { id: "gyeonggi_gunpo_center", name: "군포시 중심", lat: 37.3617, lon: 126.9352, label: "경기 군포시" },
  gyeonggi_osan: { id: "gyeonggi_osan_center", name: "오산시 중심", lat: 37.1498, lon: 127.0772, label: "경기 오산시" },
  gyeonggi_icheon: { id: "gyeonggi_icheon_center", name: "이천시 중심", lat: 37.2723, lon: 127.4350, label: "경기 이천시" },
  gyeonggi_anseong: { id: "gyeonggi_anseong_center", name: "안성시 중심", lat: 37.0080, lon: 127.2797, label: "경기 안성시" },
  gyeonggi_uiwang: { id: "gyeonggi_uiwang_center", name: "의왕시 중심", lat: 37.3447, lon: 126.9683, label: "경기 의왕시" },
  gyeonggi_hanam: { id: "gyeonggi_hanam_center", name: "하남시 중심", lat: 37.5393, lon: 127.2149, label: "경기 하남시" },
  gyeonggi_pocheon: { id: "gyeonggi_pocheon_center", name: "포천시 중심", lat: 37.8949, lon: 127.2003, label: "경기 포천시" },
  gyeonggi_dongducheon: { id: "gyeonggi_dongducheon_center", name: "동두천시 중심", lat: 37.9036, lon: 127.0606, label: "경기 동두천시" },
  gyeonggi_gwacheon: { id: "gyeonggi_gwacheon_center", name: "과천시 중심", lat: 37.4292, lon: 126.9876, label: "경기 과천시" },
  gyeonggi_yeoju: { id: "gyeonggi_yeoju_center", name: "여주시 중심", lat: 37.2982, lon: 127.6371, label: "경기 여주시" },
  gyeonggi_yangpyeong: { id: "gyeonggi_yangpyeong_center", name: "양평군 중심", lat: 37.4918, lon: 127.4876, label: "경기 양평군" },
  gyeonggi_gapyeong: { id: "gyeonggi_gapyeong_center", name: "가평군 중심", lat: 37.8315, lon: 127.5099, label: "경기 가평군" },
  gyeonggi_yeoncheon: { id: "gyeonggi_yeoncheon_center", name: "연천군 중심", lat: 38.0964, lon: 127.0749, label: "경기 연천군" },
  gyeonggi_yangju: { id: "gyeonggi_yangju_center", name: "양주시 중심", lat: 37.7853, lon: 127.0458, label: "경기 양주시" },
  gyeonggi_guri: { id: "gyeonggi_guri_center", name: "구리시 중심", lat: 37.5943, lon: 127.1296, label: "경기 구리시" },
};
const SEOUL_REGION_KEYS = [
  "seoul_gangnam", "seoul_gangdong", "seoul_gangbuk", "seoul_gangseo", "seoul_gwanak",
  "seoul_gwangjin", "seoul_guro", "seoul_geumcheon", "seoul_nowon", "seoul_dobong",
  "seoul_dongdaemun", "seoul_dongjak", "seoul_mapo", "seoul_seodaemun", "seoul_seocho",
  "seoul_seongdong", "seoul_seongbuk", "seoul_songpa", "seoul_yangcheon", "seoul_yeongdeungpo",
  "seoul_yongsan", "seoul_eunpyeong", "seoul_jongno", "seoul_jung", "seoul_jungnang",
];
const GYEONGGI_REGION_KEYS = [
  "gyeonggi_suwon", "gyeonggi_seongnam", "gyeonggi_goyang", "gyeonggi_yongin", "gyeonggi_bucheon",
  "gyeonggi_ansan", "gyeonggi_anyang", "gyeonggi_namyangju", "gyeonggi_hwaseong", "gyeonggi_pyeongtaek",
  "gyeonggi_uijeongbu", "gyeonggi_siheung", "gyeonggi_paju", "gyeonggi_gimpo", "gyeonggi_gwangmyeong",
  "gyeonggi_gwangju", "gyeonggi_gunpo", "gyeonggi_osan", "gyeonggi_icheon", "gyeonggi_anseong",
  "gyeonggi_uiwang", "gyeonggi_hanam", "gyeonggi_pocheon", "gyeonggi_dongducheon", "gyeonggi_gwacheon",
  "gyeonggi_yeoju", "gyeonggi_yangpyeong", "gyeonggi_gapyeong", "gyeonggi_yeoncheon", "gyeonggi_yangju",
  "gyeonggi_guri",
];
function registerRegionItems(prefix, provinceLabel, names, center) {
  const spread = Math.max(0.035, Math.min(0.12, names.length * 0.003));
  return names.map((name, index) => {
    const key = `${prefix}_${String(index + 1).padStart(2, "0")}`;
    const col = index % 5;
    const row = Math.floor(index / 5);
    REGION_CENTERS[key] = {
      id: `${key}_center`,
      name: `${name} 중심`,
      lat: Number((center.lat + (row - 2) * spread * 0.42).toFixed(6)),
      lon: Number((center.lon + (col - 2) * spread * 0.62).toFixed(6)),
      label: `${provinceLabel} ${name}`,
    };
    return key;
  });
}

const BUSAN_REGION_KEYS = registerRegionItems("busan", "부산", ["중구", "서구", "동구", "영도구", "부산진구", "동래구", "남구", "북구", "해운대구", "사하구", "금정구", "강서구", "연제구", "수영구", "사상구", "기장군"], REGION_CENTERS.busan);
const DAEGU_REGION_KEYS = registerRegionItems("daegu", "대구", ["중구", "동구", "서구", "남구", "북구", "수성구", "달서구", "달성군", "군위군"], { lat: 35.8714, lon: 128.6014 });
const INCHEON_REGION_KEYS = registerRegionItems("incheon", "인천", ["중구", "동구", "미추홀구", "연수구", "남동구", "부평구", "계양구", "서구", "강화군", "옹진군"], REGION_CENTERS.incheon);
const GWANGJU_REGION_KEYS = registerRegionItems("gwangju", "광주", ["동구", "서구", "남구", "북구", "광산구"], { lat: 35.1595, lon: 126.8526 });
const DAEJEON_REGION_KEYS = registerRegionItems("daejeon", "대전", ["동구", "중구", "서구", "유성구", "대덕구"], REGION_CENTERS.daejeon);
const ULSAN_REGION_KEYS = registerRegionItems("ulsan", "울산", ["중구", "남구", "동구", "북구", "울주군"], { lat: 35.5384, lon: 129.3114 });
const SEJONG_REGION_KEYS = ["sejong"];
const GANGWON_REGION_KEYS = registerRegionItems("gangwon", "강원", ["춘천시", "원주시", "강릉시", "동해시", "태백시", "속초시", "삼척시", "홍천군", "횡성군", "영월군", "평창군", "정선군", "철원군", "화천군", "양구군", "인제군", "고성군", "양양군"], REGION_CENTERS.gangwon);
const CHUNGBUK_REGION_KEYS = registerRegionItems("chungbuk", "충북", ["청주시", "충주시", "제천시", "보은군", "옥천군", "영동군", "증평군", "진천군", "괴산군", "음성군", "단양군"], { lat: 36.6357, lon: 127.4913 });
const CHUNGNAM_REGION_KEYS = registerRegionItems("chungnam", "충남", ["천안시", "공주시", "보령시", "아산시", "서산시", "논산시", "계룡시", "당진시", "금산군", "부여군", "서천군", "청양군", "홍성군", "예산군", "태안군"], { lat: 36.6588, lon: 126.6728 });
const JEONBUK_REGION_KEYS = registerRegionItems("jeonbuk", "전북", ["전주시", "군산시", "익산시", "정읍시", "남원시", "김제시", "완주군", "진안군", "무주군", "장수군", "임실군", "순창군", "고창군", "부안군"], REGION_CENTERS.jeonju);
const JEONNAM_REGION_KEYS = registerRegionItems("jeonnam", "전남", ["목포시", "여수시", "순천시", "나주시", "광양시", "담양군", "곡성군", "구례군", "고흥군", "보성군", "화순군", "장흥군", "강진군", "해남군", "영암군", "무안군", "함평군", "영광군", "장성군", "완도군", "진도군", "신안군"], { lat: 34.8161, lon: 126.4629 });
const GYEONGBUK_REGION_KEYS = registerRegionItems("gyeongbuk", "경북", ["포항시", "경주시", "김천시", "안동시", "구미시", "영주시", "영천시", "상주시", "문경시", "경산시", "의성군", "청송군", "영양군", "영덕군", "청도군", "고령군", "성주군", "칠곡군", "예천군", "봉화군", "울진군", "울릉군"], REGION_CENTERS.gyeongju);
const GYEONGNAM_REGION_KEYS = registerRegionItems("gyeongnam", "경남", ["창원시", "진주시", "통영시", "사천시", "김해시", "밀양시", "거제시", "양산시", "의령군", "함안군", "창녕군", "고성군", "남해군", "하동군", "산청군", "함양군", "거창군", "합천군"], { lat: 35.2383, lon: 128.6924 });
const JEJU_REGION_KEYS = registerRegionItems("jeju", "제주", ["제주시", "서귀포시"], REGION_CENTERS.jeju);

REGION_CENTERS.daegu = { id: "daegu_center", name: "대구 중심", lat: 35.8714, lon: 128.6014, label: "대구" };
REGION_CENTERS.gwangju = { id: "gwangju_center", name: "광주 중심", lat: 35.1595, lon: 126.8526, label: "광주" };
REGION_CENTERS.ulsan = { id: "ulsan_center", name: "울산 중심", lat: 35.5384, lon: 129.3114, label: "울산" };
REGION_CENTERS.sejong = { id: "sejong_center", name: "세종 중심", lat: 36.4800, lon: 127.2890, label: "세종" };
REGION_CENTERS.chungcheong = { ...REGION_CENTERS.chungcheong, label: "충청도 전체", recommendable: true };
REGION_CENTERS.jeolla = { ...REGION_CENTERS.jeolla, label: "전라도 전체", recommendable: true };
REGION_CENTERS.gyeongsang = { ...REGION_CENTERS.gyeongsang, label: "경상도 전체", recommendable: true };

const REGION_GROUPS = [
  { key: "seoul", label: "서울", whole: "seoul", regions: SEOUL_REGION_KEYS },
  { key: "busan", label: "부산", whole: "busan", regions: BUSAN_REGION_KEYS },
  { key: "daegu", label: "대구", whole: "daegu", regions: DAEGU_REGION_KEYS },
  { key: "incheon", label: "인천", whole: "incheon", regions: INCHEON_REGION_KEYS },
  { key: "gwangju", label: "광주", whole: "gwangju", regions: GWANGJU_REGION_KEYS },
  { key: "daejeon", label: "대전", whole: "daejeon", regions: DAEJEON_REGION_KEYS },
  { key: "ulsan", label: "울산", whole: "ulsan", regions: ULSAN_REGION_KEYS },
  { key: "sejong", label: "세종", whole: "sejong", regions: SEJONG_REGION_KEYS },
  { key: "gyeonggi", label: "경기", whole: null, regions: GYEONGGI_REGION_KEYS },
  { key: "gangwon", label: "강원", whole: null, regions: GANGWON_REGION_KEYS },
  { key: "chungbuk", label: "충북", whole: null, regions: CHUNGBUK_REGION_KEYS },
  { key: "chungnam", label: "충남", whole: null, regions: CHUNGNAM_REGION_KEYS },
  { key: "jeonbuk", label: "전북", whole: null, regions: JEONBUK_REGION_KEYS },
  { key: "jeonnam", label: "전남", whole: null, regions: JEONNAM_REGION_KEYS },
  { key: "gyeongbuk", label: "경북", whole: null, regions: GYEONGBUK_REGION_KEYS },
  { key: "gyeongnam", label: "경남", whole: null, regions: GYEONGNAM_REGION_KEYS },
  { key: "jeju", label: "제주", whole: null, regions: JEJU_REGION_KEYS },
];
const ADMIN_PROVINCE_CENTER_OVERRIDES = {
  "28": { lat: 37.4563, lon: 126.7052 },
};
const RANDOM_RECOMMEND_REGION_KEYS = ["seoul", "busan", "jeju", "daejeon", "jeonju", "gyeongju"];

let selectedStartPlace = null;

let currentCourses = [];
let lastRecommendationData = null;
let courseOrderEditMode = false;
let selectedRequiredPlaces = [];
let selectedAccommodation = null;
let selectedCourseId = null;
let tmapSdkPromise = null;
let leafletSdkPromise = null;
let tmapMap = null;
let tmapMarkers = [];
let tmapPolyline = null;
let startPlaceTmapMap = null;
let startPlaceTmapMarkers = [];
let mapExploreTmapMap = null;
let mapExploreTmapMarkers = [];
let mapExploreLeafletMap = null;
let mapExploreLeafletMarkers = [];
let mapExploreInitialized = false;
let mapExploreDefaultLoaded = false;
let mapExploreDefaultLoading = false;
let mapExploreSheetDragging = false;
let mapExploreAutoLoadSuppressUntil = 0;
const placePhotoCache = new Map();
const GANGNEUNG_CENTER = { lat: 37.751853, lon: 128.876057 };
let pendingRecommendationAccess = false;
let pendingPreviewCourseId = null;
let pendingPreviewSaveCourseId = null;
let pendingBrowseRecommendationPlace = null;
let selectedBrowseRegion = "national";
let pendingBrowseProvinceKey = "";
let regionPickerMode = "recommend";
let activeRegionGroupKey = "seoul";
let activeDistrictKey = "";
let activeMultiDistrictKeys = new Set();
let activeMultiDongKeys = new Set();
let adminRegionCatalog = null;
let bookmarkedPlaces = loadBookmarks();
let selectedBookmarkKeys = new Set();
let savedCourses = loadSavedCourses();
let pendingQuickRecommendation = null;
let currentUser = null;
let currentBrowsePlaces = [];
let currentBrowseCategory = "";
let currentBrowseNextOffset = 0;
let currentBrowseHasMore = false;
let currentBrowseLoading = false;
let activeBrowseDetailPlace = null;
let mapExploreState = {
  keyword: "",
  center: { id: "map_explore_seoul", name: "서울", lat: 37.5665, lon: 126.9780, address: "서울특별시" },
  radiusKm: 2.5,
  categories: [],
  places: [],
  loading: false,
};
let placeReviewImages = [];
let visibleCourseIndex = 0;
let triptiRetaking = false;
let triptiPreferredPlaceCategories = [];
let courseCarouselWheelLocked = false;
let courseCarouselSuppressClick = false;
let courseCarouselEntryDirection = 0;
let browseOpeningHoursObserver = null;
let browseReviewSortTimer = null;
const replacementHistoryBySlot = new Map();
let currentPortalView = "home";
let currentRecommendationStep = "conditions";
let portalViewHistory = [];
let nativeAppControlsBound = false;
let nativeAppControlsRetryTimer = null;
let nativeAppControlsRetryCount = 0;
let placeReorderScrollY = 0;
let placeReorderScrollLocked = false;
let notifUnreadCount = 0;

const form = document.getElementById("recommendForm");
const placeKeyword = document.getElementById("placeKeyword");
const searchPlaceButton = document.getElementById("searchPlaceButton");
const placeResults = document.getElementById("placeResults");
const requiredPlaceKeyword = document.getElementById("requiredPlaceKeyword");
const searchRequiredPlaceButton = document.getElementById("searchRequiredPlaceButton");
const requiredPlaceResults = document.getElementById("requiredPlaceResults");
const accommodationKeyword = document.getElementById("accommodationKeyword");
const searchAccommodationButton = document.getElementById("searchAccommodationButton");
const accommodationResults = document.getElementById("accommodationResults");
const detailOptions = document.getElementById("detailOptions");
const overnight = document.getElementById("overnight");
const startTime = document.getElementById("startTime");
const startTimeAnyButton = document.getElementById("startTimeAnyButton");
const foodCategory = document.getElementById("foodCategory");
const lunchFoodField = document.getElementById("lunchFoodField");
const dinnerFoodField = document.getElementById("dinnerFoodField");
const dinnerFoodCategory = document.getElementById("dinnerFoodCategory");
const radiusKm = document.getElementById("radiusKm");
const radiusValue = document.getElementById("radiusValue");
const waypointCount = document.getElementById("waypointCount");
const includeFoodOption = document.getElementById("includeFoodOption");
const includeFood = document.getElementById("includeFood");
const courseList = document.getElementById("courseList");
const resultSummary = document.getElementById("resultSummary");
const routeSummary = document.getElementById("routeSummary");
const editConditionsButton = document.getElementById("editConditionsButton");
const backToResultsButton = document.getElementById("backToResultsButton");
const saveFlowCourseButton = document.getElementById("saveFlowCourseButton");
const homeView = document.getElementById("homeView");
const triptiView = document.getElementById("triptiView");
const mapExploreView = document.getElementById("mapExploreView");
const browseView = document.getElementById("browseView");
const communityView = document.getElementById("communityView");
const bookmarksView = document.getElementById("bookmarksView");
const myCoursesView = document.getElementById("myCoursesView");
const profileView = document.getElementById("profileView");
const loginView = document.getElementById("loginView");
const recommendationView = document.getElementById("recommendationView");
const chatHubView = document.getElementById("chatHubView");
const loginNavButton = document.getElementById("loginNavButton");
const profileNavButton = document.getElementById("profileNavButton");
const logoutNavButton = document.getElementById("logoutNavButton");
const authMessage = document.getElementById("authMessage");
const portalHeader = document.getElementById("portalHeader");
const browseTitle = document.getElementById("browseTitle");
const browsePlaceList = document.getElementById("browsePlaceList");
const mapExploreForm = document.getElementById("mapExploreForm");
const mapExploreKeyword = document.getElementById("mapExploreKeyword");
const mapExploreStatus = document.getElementById("mapExploreStatus");
const mapExploreResults = document.getElementById("mapExploreResults");
const mapExploreMapCanvas = document.getElementById("mapExploreMapCanvas");
const mapExploreSheet = document.getElementById("mapExploreSheet");
const mapExploreSheetHandle = document.getElementById("mapExploreSheetHandle");
const regionCategorySection = document.getElementById("regionCategorySection");
const regionCategoryTitle = document.getElementById("regionCategoryTitle");
const bookmarkTray = document.getElementById("bookmarkTray");
const bookmarkList = document.getElementById("bookmarkList");
const bookmarkSummary = document.getElementById("bookmarkSummary");
const recommendBookmarksButton = document.getElementById("recommendBookmarksButton");
const recommendSavedBookmarksButton = document.getElementById("recommendSavedBookmarksButton");
const savedBookmarkList = document.getElementById("savedBookmarkList");
const previousCourseButton = document.getElementById("previousCourseButton");
const nextCourseButton = document.getElementById("nextCourseButton");
const courseCarouselStatus = document.getElementById("courseCarouselStatus");
const clearStartPlaceButton = document.getElementById("clearStartPlaceButton");
const recommendRegion = document.getElementById("recommendRegion");
const openRecommendRegionModalButton = document.getElementById("openRecommendRegionModalButton");
const regionPickerModal = document.getElementById("regionPickerModal");
const regionPickerTitle = document.getElementById("regionPickerTitle");
const closeRegionPickerButton = document.getElementById("closeRegionPickerButton");
const regionProvinceList = document.getElementById("regionProvinceList");
const regionDistrictList = document.getElementById("regionDistrictList");
const regionWholeButton = document.getElementById("regionWholeButton");
const previewCourseDetail = document.getElementById("previewCourseDetail");
const savedCourseList = document.getElementById("savedCourseList");
const savedCourseFloatingButton = document.getElementById("savedCourseFloatingButton");
const savedCourseFloatingCount = document.getElementById("savedCourseFloatingCount");
const recentPlaceList = document.getElementById("recentPlaceList");
const quickConditionModal = document.getElementById("quickConditionModal");
const quickConditionDescription = document.getElementById("quickConditionDescription");
const startPlaceModal = document.getElementById("startPlaceModal");
const closeStartPlaceModalButton = document.getElementById("closeStartPlaceModalButton");
const startPlaceModalKeyword = document.getElementById("startPlaceModalKeyword");
const startPlaceModalSearchButton = document.getElementById("startPlaceModalSearchButton");
const startPlaceModalResults = document.getElementById("startPlaceModalResults");
const browsePlaceDetailModal = document.getElementById("browsePlaceDetailModal");
const closeBrowsePlaceDetailButton = document.getElementById("closeBrowsePlaceDetailButton");
const browsePlaceDetailTitle = document.getElementById("browsePlaceDetailTitle");
const browsePlaceDetailSummary = document.getElementById("browsePlaceDetailSummary");
const browsePlaceDetailBody = document.getElementById("browsePlaceDetailBody");
const startPlaceCandidateMap = document.getElementById("startPlaceCandidateMap");
const triptiForm = document.getElementById("triptiForm");
const triptiProgressText = document.getElementById("triptiProgressText");
const triptiProgressBar = document.getElementById("triptiProgressBar");
const triptiResultCard = document.getElementById("triptiResultCard");
const applyTriptiPreference = document.getElementById("applyTriptiPreference");
const onlyOpenNow = document.getElementById("onlyOpenNow");
const triptiApplyOption = document.getElementById("triptiApplyOption");
const triptiApplyHint = document.getElementById("triptiApplyHint");
const includeLunch = document.getElementById("includeLunch");
const includeCafe = document.getElementById("includeCafe");
const includeDinner = document.getElementById("includeDinner");
const includeBar = document.getElementById("includeBar");
const includeNearbyAdminRegionsOption = document.getElementById("includeNearbyAdminRegionsOption");
const includeNearbyAdminRegions = document.getElementById("includeNearbyAdminRegions");
const PREVIEW_COURSES = {
  anmok: {
    title: "해변 데이트",
    subtitle: "바다와 커피를 천천히 즐기는 코스",
    places: ["지역 맛집", "해변 산책", "감성 카페", "야경 스팟"],
    note: "선택한 도시의 바다, 강변, 호수권에서 가볍게 즐기기 좋은 데이트입니다.",
  },
  culture: {
    title: "천천히 즐기는 문화 코스",
    subtitle: "실내 관람과 산책을 섞은 코스",
    places: ["지역 맛집", "역세권 카페", "박물관 또는 전시관", "공원 산책"],
    note: "날씨가 좋지 않은 날에도 비교적 편하게 즐길 수 있습니다.",
  },
  night: {
    title: "저녁까지 이어지는 하루",
    subtitle: "숙박 여행자를 위한 여유로운 코스",
    places: ["액티비티", "저녁 식사", "야경 산책", "숙소"],
    note: "숙소를 설정하면 실제 추천에서는 마지막 목적지까지 이어집니다.",
  },
};
const TRIPTI_QUESTIONS = [
  {
    "q": "여행 후 “잘 다녀왔다”고 느끼는 기준은?",
    "a": "몸과 마음이 편안해졌을 때",
    "b": "여러 장소를 보고 많은 추억을 만들었을 때",
    "axis": [
      "R",
      "T"
    ]
  },
  {
    "q": "여행 중간에 1~2시간 정도 쉬는 시간이 생기면?",
    "a": "좋다. 쉬는 시간이 있어야 여행이 편하다",
    "b": "아깝다. 그 시간에 한 곳이라도 더 가고 싶다",
    "axis": [
      "L",
      "B"
    ]
  },
  {
    "q": "인기 맛집에 가고 싶을 때 나는?",
    "a": "미리 예약하거나 웨이팅 시간을 확인한다",
    "b": "가보고 사람이 많으면 다른 곳을 찾는다",
    "axis": [
      "P",
      "F"
    ]
  },
  {
    "q": "여행 만족도를 더 크게 좌우하는 것은?",
    "a": "돈과 시간이 아깝지 않았다는 느낌",
    "b": "사진과 분위기가 오래 기억에 남는 느낌",
    "axis": [
      "U",
      "S"
    ]
  },
  {
    "q": "여행지에서 더 만족스러운 발견은?",
    "a": "“여기 요즘 유명한 곳인데 와봤다” 싶은 장소",
    "b": "“여긴 잘 안 알려졌는데 진짜 괜찮다” 싶은 장소",
    "axis": [
      "H",
      "O"
    ]
  },
  {
    "q": "여행에서 더 힘들게 느껴지는 것은?",
    "a": "쉬는 시간이 부족해서 피곤하게 돌아오는 것",
    "b": "유명한 장소를 못 보고 그냥 돌아오는 것",
    "axis": [
      "R",
      "T"
    ]
  },
  {
    "q": "이동 시간이 길어도 여러 곳을 갈 수 있다면?",
    "a": "굳이 그렇게까지 움직이고 싶지는 않다",
    "b": "볼 게 많다면 이동 시간이 길어도 괜찮다",
    "axis": [
      "L",
      "B"
    ]
  },
  {
    "q": "여행 전에 정보를 찾아보는 방식은?",
    "a": "영업시간, 휴무일, 후기, 위치까지 미리 확인한다",
    "b": "대표적인 장소만 대충 보고 자세한 건 현장에서 본다",
    "axis": [
      "P",
      "F"
    ]
  },
  {
    "q": "여행 코스에서 더 싫은 상황은?",
    "a": "이동 동선이 꼬여서 시간과 체력을 낭비하는 것",
    "b": "장소들이 평범해서 기억에 남는 느낌이 없는 것",
    "axis": [
      "U",
      "S"
    ]
  },
  {
    "q": "둘 중 더 끌리는 여행 코스는?",
    "a": "유명 카페, 인기 맛집, 대표 관광지를 도는 코스",
    "b": "동네 시장, 골목 식당, 현지 분위기를 느끼는 코스",
    "axis": [
      "H",
      "O"
    ]
  },
  {
    "q": "더 마음에 드는 여행 일정은?",
    "a": "숙소, 카페, 산책 정도로 조용히 보내고 싶다",
    "b": "근처 관광지나 볼거리를 찾아서 다녀오고 싶다",
    "axis": [
      "R",
      "T"
    ]
  },
  {
    "q": "여행 중 갑자기 시간이 남는다면?",
    "a": "근처에서 천천히 쉬거나 한 장소에 오래 머문다",
    "b": "바로 다음에 갈 장소를 찾아서 움직인다",
    "axis": [
      "L",
      "B"
    ]
  },
  {
    "q": "여행 코스를 짤 때 더 가까운 쪽은?",
    "a": "시간 순서대로 이동 동선을 정리해두는 편이다",
    "b": "가고 싶은 곳만 저장해두고 순서는 그때 정한다",
    "axis": [
      "P",
      "F"
    ]
  },
  {
    "q": "맛집을 고를 때 더 끌리는 곳은?",
    "a": "맛이 검증되고 웨이팅이 적고 가격이 괜찮은 곳",
    "b": "분위기가 좋고 특별한 추억이 남을 것 같은 곳",
    "axis": [
      "U",
      "S"
    ]
  },
  {
    "q": "새로운 지역에 갔을 때 더 가보고 싶은 곳은?",
    "a": "SNS에서 많이 보이는 유명 카페나 맛집",
    "b": "현지인들이 자주 가는 숨은 식당이나 카페",
    "axis": [
      "H",
      "O"
    ]
  }
];
const TRIPTI_AXES = [
  {
    "left": "R",
    "right": "T",
    "leftLabel": "휴양",
    "rightLabel": "관광",
    "total": 3
  },
  {
    "left": "L",
    "right": "B",
    "leftLabel": "느긋",
    "rightLabel": "부지런",
    "total": 3
  },
  {
    "left": "P",
    "right": "F",
    "leftLabel": "계획",
    "rightLabel": "즉흥",
    "total": 3
  },
  {
    "left": "U",
    "right": "S",
    "leftLabel": "실용",
    "rightLabel": "감성",
    "total": 3
  },
  {
    "left": "H",
    "right": "O",
    "leftLabel": "핫플",
    "rightLabel": "로컬",
    "total": 3
  }
];
const TRIPTI_RESULTS = {
  "R-L-P-U-H": {
    "name": "실속 핫플 휴양러",
    "desc": "조용히 쉬는 여행을 좋아하지만, 유명하고 검증된 장소를 선호하는 유형이다. 숙소, 카페, 맛집을 미리 찾아보고 효율적인 동선으로 여유롭게 즐긴다.",
    "course": "유명 오션뷰 카페 → 위치 좋은 숙소 → 예약 맛집 → 가까운 산책 코스"
  },
  "R-L-P-U-O": {
    "name": "실속 로컬 휴양러",
    "desc": "여유롭게 쉬는 여행을 좋아하며, 유명한 장소보다 편하고 실속 있는 로컬 장소를 선호한다. 현지인 맛집, 조용한 카페, 동네 산책길에서 만족감을 느낀다.",
    "course": "현지인 식당 → 조용한 동네 카페 → 숙소 휴식 → 근처 산책길"
  },
  "R-L-P-S-H": {
    "name": "감성 핫플 휴양러",
    "desc": "휴식과 감성을 모두 중요하게 생각하는 유형이다. 예쁜 숙소, 유명 카페, 노을 명소처럼 사진과 추억이 남는 장소를 미리 계획해서 여유롭게 즐긴다.",
    "course": "감성 숙소 → 유명 브런치 카페 → 노을 명소 → 야경 산책"
  },
  "R-L-P-S-O": {
    "name": "감성 로컬 휴양러",
    "desc": "조용하고 여유로운 여행을 좋아하며, 사람 많은 핫플보다 숨은 감성 장소를 선호한다. 골목 카페, 독립서점, 로컬 식당처럼 분위기 있는 공간에 끌린다.",
    "course": "골목 카페 → 독립서점 → 로컬 식당 → 조용한 산책길"
  },
  "R-L-F-U-H": {
    "name": "즉흥 실속 핫플 휴양러",
    "desc": "큰 계획 없이 쉬러 떠나는 것을 좋아하지만, 장소를 고를 때는 유명하고 검증된 곳을 선호한다. 후기 좋은 핫플을 현장에서 찾아가며 부담 없는 여행을 즐긴다.",
    "course": "근처 인기 카페 → 후기 좋은 식당 → 숙소 휴식 → 가까운 유명 전망대"
  },
  "R-L-F-U-O": {
    "name": "즉흥 실속 로컬 휴양러",
    "desc": "느긋하고 자유로운 휴양을 좋아하며, 현장에서 편하고 가까운 로컬 장소를 고르는 유형이다. 그날의 컨디션과 거리, 가격, 편의성을 중요하게 생각한다.",
    "course": "근처 로컬 식당 → 조용한 카페 → 숙소 휴식 → 동네 산책"
  },
  "R-L-F-S-H": {
    "name": "자유 감성 핫플 휴양러",
    "desc": "여행은 쉬러 가는 것이지만, 감성적인 핫플은 놓치고 싶지 않은 유형이다. 계획은 느슨하게 잡고, 그날 기분에 따라 예쁜 카페나 유명 포토존을 찾아간다.",
    "course": "SNS 인기 카페 → 감성 소품샵 → 숙소 휴식 → 야경 포토존"
  },
  "R-L-F-S-O": {
    "name": "자유 감성 로컬 휴양러",
    "desc": "정해진 일정 없이 여유롭게 움직이며, 숨은 감성 공간을 발견하는 것을 좋아한다. 유명 관광지보다 조용한 골목과 작은 카페에서 여행의 매력을 느낀다.",
    "course": "골목 산책 → 우연히 발견한 카페 → 로컬 식당 → 한적한 공원"
  },
  "R-B-P-U-H": {
    "name": "알찬 실속 핫플 휴양러",
    "desc": "휴양형이지만 하루를 너무 비워두는 것은 아쉬워한다. 유명한 장소를 효율적으로 배치해서 쉬는 시간과 볼거리를 균형 있게 챙긴다.",
    "course": "유명 브런치 카페 → 인기 스파 → 예약 맛집 → 핫플 야경"
  },
  "R-B-P-U-O": {
    "name": "알찬 실속 로컬 휴양러",
    "desc": "쉬는 여행을 좋아하지만 시간을 알차게 쓰고 싶어 한다. 유명한 곳보다는 동선 좋은 로컬 맛집과 조용한 장소를 계획적으로 방문한다.",
    "course": "현지인 맛집 → 전통시장 → 조용한 카페 → 숙소 휴식"
  },
  "R-B-P-S-H": {
    "name": "감성 핫플 휴양 플래너",
    "desc": "휴양과 감성을 모두 중요하게 생각하면서도 여행 일정을 꼼꼼하게 짜는 유형이다. 유명한 감성 숙소, 카페, 포토존을 계획적으로 연결해 만족도 높은 코스를 만든다.",
    "course": "감성 숙소 → 유명 카페 → 포토존 → 분위기 좋은 저녁 식당"
  },
  "R-B-P-S-O": {
    "name": "로컬 감성 휴양 플래너",
    "desc": "조용한 휴양과 로컬 감성을 좋아하지만, 일정은 미리 정리해두는 유형이다. 숨은 카페, 동네 맛집, 한적한 산책길을 알차게 묶어 여행한다.",
    "course": "동네 빵집 → 작은 전시 공간 → 로컬 식당 → 강변 산책"
  },
  "R-B-F-U-H": {
    "name": "즉흥 실속 핫플러",
    "desc": "휴양을 원하지만 즉흥적으로 유명 장소를 찾아다니는 유형이다. 계획을 빡빡하게 짜지는 않지만, 선택할 때는 후기와 접근성을 중요하게 본다.",
    "course": "근처 인기 맛집 → 유명 카페 → 숙소 휴식 → 가까운 포토존"
  },
  "R-B-F-U-O": {
    "name": "즉흥 로컬 실속러",
    "desc": "쉬는 여행을 좋아하면서도 가만히 있기보다는 근처 로컬 장소를 찾아다니는 유형이다. 즉흥적이지만 무리한 이동이나 비효율적인 선택은 피하려고 한다.",
    "course": "근처 시장 → 로컬 맛집 → 조용한 카페 → 숙소 휴식"
  },
  "R-B-F-S-H": {
    "name": "감성 핫플 자유러",
    "desc": "감성적인 핫플을 좋아하고, 그날 기분에 따라 알차게 움직이는 유형이다. 쉬는 여행을 원하면서도 예쁜 장소가 보이면 바로 가보고 싶어 한다.",
    "course": "SNS 카페 → 감성 거리 → 유명 디저트 가게 → 야경 명소"
  },
  "R-B-F-S-O": {
    "name": "로컬 감성 방랑러",
    "desc": "휴양을 좋아하지만 한곳에만 있기보다는 동네 곳곳을 자유롭게 돌아다니는 유형이다. 숨은 카페, 골목길, 로컬 식당처럼 우연히 발견하는 감성에 끌린다.",
    "course": "골목 산책 → 작은 카페 → 동네 식당 → 한적한 전망대"
  },
  "T-L-P-U-H": {
    "name": "실속 핫플 관광러",
    "desc": "관광을 좋아하지만 너무 무리한 일정은 싫어한다. 유명한 명소와 맛집을 미리 정리하고, 효율적인 동선으로 여유 있게 즐기는 유형이다.",
    "course": "대표 명소 → 유명 맛집 → 인기 카페 → 숙소 근처 산책"
  },
  "T-L-P-U-O": {
    "name": "실속 로컬 관광러",
    "desc": "관광을 좋아하지만 유명한 곳만 따라다니기보다 현지 느낌을 효율적으로 경험하고 싶어 한다. 로컬 맛집, 시장, 동네 명소를 여유 있게 방문한다.",
    "course": "로컬 시장 → 현지인 식당 → 동네 명소 → 조용한 카페"
  },
  "T-L-P-S-H": {
    "name": "감성 핫플 관광러",
    "desc": "유명 관광지와 감성적인 장소를 좋아하지만, 너무 바쁜 일정은 부담스러워한다. 미리 계획한 코스를 따라 예쁜 명소와 인기 장소를 여유롭게 즐긴다.",
    "course": "랜드마크 → 감성 카페 → 유명 포토존 → 분위기 좋은 식당"
  },
  "T-L-P-S-O": {
    "name": "감성 로컬 관광러",
    "desc": "관광을 좋아하지만 북적이는 핫플보다 지역 특유의 분위기를 느낄 수 있는 곳을 선호한다. 조용한 골목, 작은 전시, 로컬 카페처럼 감성 있는 장소를 계획적으로 즐긴다.",
    "course": "동네 전시 공간 → 골목길 산책 → 로컬 카페 → 지역 맛집"
  },
  "T-L-F-U-H": {
    "name": "즉흥 실속 핫플 관광러",
    "desc": "관광을 좋아하지만 계획은 느슨하게 세우는 유형이다. 현장에서 검색해서 유명하고 후기 좋은 장소를 고르며, 너무 무리하지 않는 선에서 여행을 즐긴다.",
    "course": "근처 인기 명소 → 후기 좋은 맛집 → 유명 카페 → 가까운 전망대"
  },
  "T-L-F-U-O": {
    "name": "즉흥 실속 로컬 관광러",
    "desc": "여유롭게 관광하면서 현지 분위기를 즉흥적으로 즐기는 유형이다. 유명한 관광지보다 근처의 로컬 식당, 시장, 골목을 찾아다니며 실속 있는 선택을 좋아한다.",
    "course": "동네 시장 → 현지인 식당 → 작은 카페 → 주변 산책"
  },
  "T-L-F-S-H": {
    "name": "감성 핫플 탐방러",
    "desc": "유명한 장소와 감성적인 분위기를 좋아하고, 그날 기분에 따라 움직이는 유형이다. 너무 빡빡한 계획보다는 마음에 드는 핫플을 여유롭게 즐기는 것을 선호한다.",
    "course": "유명 포토존 → 감성 카페 → 인기 디저트 가게 → 야경 명소"
  },
  "T-L-F-S-O": {
    "name": "감성 로컬 탐방러",
    "desc": "관광을 좋아하지만, 유명한 곳보다 지역의 숨은 분위기를 발견하는 데 더 끌린다. 즉흥적으로 골목을 걷다가 마음에 드는 카페나 식당을 찾는 것을 좋아한다.",
    "course": "오래된 골목길 → 로컬 카페 → 작은 전시 → 현지 식당"
  },
  "T-B-P-U-H": {
    "name": "완벽 실속 핫플러",
    "desc": "대표적인 명소와 인기 장소를 효율적으로 정복하는 유형이다. 여행 전부터 동선, 예약, 후기, 시간을 꼼꼼히 확인하고 하루를 알차게 채운다.",
    "course": "랜드마크 → 유명 맛집 → 인기 카페 → 체험 장소 → 야경 명소"
  },
  "T-B-P-U-O": {
    "name": "완벽 로컬 탐험가",
    "desc": "부지런하게 움직이며 지역의 진짜 매력을 계획적으로 찾아다니는 유형이다. 현지인 맛집, 시장, 동네 명소를 효율적으로 묶어 알찬 여행을 만든다.",
    "course": "전통시장 → 로컬 맛집 → 지역 전시 → 동네 카페 → 전망대"
  },
  "T-B-P-S-H": {
    "name": "감성 핫플 정복러",
    "desc": "가장 화려하고 인기 있는 여행 코스를 좋아하는 유형이다. 유명 관광지, 감성 카페, 포토존, 맛집을 미리 계획해서 하루 안에 알차게 즐긴다.",
    "course": "대표 관광지 → SNS 맛집 → 감성 카페 → 포토존 → 야경 핫플"
  },
  "T-B-P-S-O": {
    "name": "감성 로컬 설계자",
    "desc": "관광도 좋아하고 부지런히 움직이지만, 흔한 핫플보다 지역의 감성을 담은 장소를 선호한다. 미리 조사한 숨은 명소와 로컬 공간을 촘촘하게 여행한다.",
    "course": "로컬 골목 → 지역 전시 → 현지 맛집 → 작은 카페 → 노을 명소"
  },
  "T-B-F-U-H": {
    "name": "돌격 실속 핫플러",
    "desc": "계획 없이도 인기 장소를 빠르게 찾아다니는 유형이다. 즉흥적으로 움직이지만 유명하고 후기 좋은 장소를 선호해서 실패 확률을 줄인다.",
    "course": "근처 인기 명소 → 리뷰 좋은 맛집 → 유명 카페 → 액티비티 장소"
  },
  "T-B-F-U-O": {
    "name": "돌격 로컬 실속러",
    "desc": "즉흥적으로 많이 움직이며 현지 느낌이 나는 장소를 찾아다니는 유형이다. 계획은 적지만 판단은 현실적이라 거리, 가격, 후기 등을 빠르게 따져본다.",
    "course": "근처 시장 → 로컬 맛집 → 동네 명소 → 즉흥 카페 → 산책길"
  },
  "T-B-F-S-H": {
    "name": "즉흥 핫플 모험가",
    "desc": "요즘 뜨는 장소와 감성적인 경험을 좋아하고, 즉흥적으로 부지런히 움직이는 유형이다. 계획보다 끌림을 중요하게 생각하며, 여행지에서 에너지를 많이 얻는다.",
    "course": "SNS 핫플 → 인기 디저트 → 포토존 → 체험 공간 → 야경 명소"
  },
  "T-B-F-S-O": {
    "name": "로컬 감성 모험가",
    "desc": "정해진 계획 없이 지역 곳곳을 부지런히 탐험하는 유형이다. 유명한 장소보다 현지의 분위기, 골목, 사람 냄새 나는 공간에서 특별한 추억을 만든다.",
    "course": "골목 탐방 → 현지인 맛집 → 작은 카페 → 시장 구경 → 숨은 전망대"
  }
};

function init() {
  initRegionSelector();
  initPortal();
  initMap();
  bindEvents();
  bindIdleSessionWatcher();
  syncModeOptions();
  renderSelectedStartPlace();
  renderBookmarks();
  renderSavedCourses();
  renderTriptiQuiz();
}

function initRegionSelector() {
  if (!recommendRegion) return;
  loadAdminRegionCatalog();
  rebuildRecommendRegionOptions();
  recommendRegion.value = getDefaultRecommendationRegionKey();
  updateRecommendRegionButton();
  syncNearbyAdminRegionOption();
  renderRegionPicker();
}

async function loadAdminRegionCatalog() {
  try {
    const response = await fetch("./assets/korea_admin_regions.json?v=20260401-incheon-1");
    if (!response.ok) throw new Error(`지역 데이터 로딩 실패: ${response.status}`);
    const data = await response.json();
    adminRegionCatalog = data;
    hydrateAdminRegionCatalog(data);
    rebuildRecommendRegionOptions();
    if (!recommendRegion.value || recommendRegion.value === "seoul") {
      recommendRegion.value = getDefaultRecommendationRegionKey();
    }
    if (selectedStartPlace) syncRecommendationRegionFromStartPlace(selectedStartPlace);
    updateRecommendRegionButton();
    syncNearbyAdminRegionOption();
    renderRegionPicker();
  } catch (error) {
    console.warn(error);
  }
}

function getDefaultRecommendationRegionKey() {
  return REGION_CENTERS.sido_11 ? "sido_11" : (REGION_CENTERS.seoul ? "seoul" : recommendRegion.querySelector("option")?.value || "");
}

function rebuildRecommendRegionOptions() {
  const recommendableRegions = Object.entries(REGION_CENTERS)
    .filter(([, region]) => region.recommendable !== false)
    .sort(([, a], [, b]) => a.label.localeCompare(b.label, "ko"));
  recommendRegion.innerHTML = recommendableRegions
    .map(([key, region]) => `<option value="${key}">${escapeHtml(region.label)}</option>`)
    .join("");
}

function hydrateAdminRegionCatalog(data) {
  if (!Array.isArray(data?.provinces)) return;
  data.provinces.forEach((province) => {
    const provinceKey = `sido_${province.key}`;
    const provinceCenter = ADMIN_PROVINCE_CENTER_OVERRIDES[province.key] || province.center;
    REGION_CENTERS[provinceKey] = {
      id: `${provinceKey}_center`,
      name: `${province.name} 중심`,
      lat: provinceCenter.lat,
      lon: provinceCenter.lon,
      label: `${province.name} 전체`,
      recommendable: province.selectableWhole !== false,
    };
    province.districts.forEach((district) => {
      const districtKey = `sgg_${district.key}`;
      REGION_CENTERS[districtKey] = {
        id: `${districtKey}_center`,
        name: `${district.label} 중심`,
        lat: district.center.lat,
        lon: district.center.lon,
        label: `${district.label} 전체`,
      };
      district.dongs.forEach((dong) => {
        const dongKey = `emd_${dong.key}`;
        REGION_CENTERS[dongKey] = {
          id: `${dongKey}_center`,
          name: `${dong.label} 중심`,
          lat: dong.center.lat,
          lon: dong.center.lon,
          label: dong.label,
        };
      });
    });
    getAdminCityEntries(province)
      .filter((entry) => entry.type === "city" && entry.districts.length > 1)
      .forEach((city) => {
        const districtRegions = city.districts
          .map((district) => REGION_CENTERS[`sgg_${district.key}`])
          .filter(Boolean);
        REGION_CENTERS[city.regionKey] = {
          id: `${city.regionKey}_center`,
          name: `${city.label} 중심`,
          lat: averageNumbers(districtRegions.map((region) => region.lat)),
          lon: averageNumbers(districtRegions.map((region) => region.lon)),
          label: `${city.label} 전체`,
        };
      });
  });
}

function isNativeRuntime() {
  return window.location.protocol === "capacitor:" || Boolean(window.Capacitor?.isNativePlatform?.());
}

function getNativeAppPlugin() {
  return window.Capacitor?.Plugins?.App || window.Capacitor?.App || null;
}

async function setupNativeStatusBar() {
  if (!isNativeRuntime()) return;
  document.body.classList.add("native-app");
  const statusBar = window.Capacitor?.Plugins?.StatusBar;
  if (!statusBar) {
    document.body.classList.add("statusbar-safe-offset");
    return;
  }

  try {
    await statusBar.setOverlaysWebView({ overlay: false });
    await statusBar.setBackgroundColor?.({ color: "#fff7fa" });
    await statusBar.setStyle?.({ style: "DARK" });
    document.body.classList.remove("statusbar-safe-offset");
  } catch (error) {
    console.warn("StatusBar setup failed", error);
    document.body.classList.add("statusbar-safe-offset");
  }
}

function closeTopOverlayForNativeBack() {
  const chatModal = document.getElementById("chatModal");
  if (chatModal && !chatModal.hidden) {
    const chatPhotoMenu = document.getElementById("chatPhotoMenu");
    const chatCoursePicker = document.getElementById("chatCoursePicker");
    if (chatPhotoMenu && !chatPhotoMenu.hidden) {
      chatPhotoMenu.hidden = true;
      return true;
    }
    if (chatCoursePicker && !chatCoursePicker.hidden) {
      chatCoursePicker.hidden = true;
      return true;
    }
  }

  if (startPlaceModal && !startPlaceModal.hidden) {
    closeStartPlaceModal();
    return true;
  }
  if (browsePlaceDetailModal && !browsePlaceDetailModal.hidden) {
    closeBrowsePlaceDetailModal();
    return true;
  }
  if (regionPickerModal && !regionPickerModal.hidden) {
    closeRegionPicker();
    return true;
  }
  if (quickConditionModal && !quickConditionModal.hidden) {
    closeQuickConditionModal();
    return true;
  }

  const overlayClosers = [
    ["reportModal", closeReportModal],
    ["avatarCropModal", closeAvatarCropModal],
    ["policyModal", closePolicyModal],
    ["postMoreSheet", closePostMoreSheet],
    ["notificationsModal", closeNotificationsModal],
    ["chatModal", closeChatModal],
    ["blockedUsersModal", closeBlockedUsersModal],
    ["likedPostsModal", closeLikedPostsModal],
    ["profileAccountModal", closeProfileAccountModal],
    ["friendCourseShareModal", closeFriendCourseShareModal],
    ["communityFriendsModal", closeCommunityFriendsModal],
    ["userProfileModal", closeUserProfileModal],
    ["communityShareModal", closeCommunityShareModal],
    ["communityComposeModal", closeCommunityComposeModal],
  ];

  const commentsSheet = document.getElementById("communityCommentsSheet");
  if (commentsSheet && !commentsSheet.hidden) {
    closeCommunityCommentsSheet();
    return true;
  }

  for (const [id, close] of overlayClosers) {
    const element = document.getElementById(id);
    if (element && !element.hidden) {
      close();
      return true;
    }
  }
  return false;
}

function showPreviousPortalViewOrHome() {
  let previousView = portalViewHistory.pop();
  while (previousView && previousView === getVisiblePortalViewName()) {
    previousView = portalViewHistory.pop();
  }
  showPortalView(previousView || "home", { replace: true });
}

function handleNativeBackButton() {
  if (closeTopOverlayForNativeBack()) return;

  if (!recommendationView.hidden) {
    if (currentRecommendationStep === "flow") {
      showRecommendationStep("results");
      return;
    }
    if (currentRecommendationStep === "results") {
      showRecommendationStep("conditions");
      return;
    }
    showPreviousPortalViewOrHome();
    return;
  }

  const viewName = getVisiblePortalViewName();
  if (!["home", "login"].includes(viewName)) {
    showPreviousPortalViewOrHome();
    return;
  }
  // 홈/로그인에서 뒤로가기를 눌러도 앱이 바로 종료되지 않게 막는다.
}

function setupNativeAppControls() {
  if (nativeAppControlsBound || !isNativeRuntime()) return;
  setupNativeStatusBar();
  const appPlugin = getNativeAppPlugin();
  if (!appPlugin?.addListener) {
    if (!nativeAppControlsRetryTimer && nativeAppControlsRetryCount < 20) {
      nativeAppControlsRetryCount += 1;
      nativeAppControlsRetryTimer = window.setTimeout(() => {
        nativeAppControlsRetryTimer = null;
        setupNativeAppControls();
      }, 250);
    }
    return;
  }
  nativeAppControlsBound = true;
  nativeAppControlsRetryCount = 0;
  appPlugin.addListener("backButton", handleNativeBackButton);
}

function initPortal() {
  setupNativeAppControls();
  document.querySelectorAll("[data-show-view]").forEach((button) => {
    button.addEventListener("click", () => {
      if (button.dataset.showView === "home" && !recommendationView.hidden) resetRecommendationState();
      if (button.dataset.showView === "recommendation") resetRecommendationState();
      showPortalView(button.dataset.showView);
    });
  });
  document.getElementById("openRecoDateButton").addEventListener("click", () => {
    resetRecommendationState();
    showPortalView("recommendation");
  });
  document.querySelectorAll("[data-category]").forEach((button) => {
    button.addEventListener("click", () => {
      openBrowseView(button.dataset.category);
    });
  });
  document.querySelectorAll("[data-region]").forEach((button) => {
    button.addEventListener("click", () => selectBrowseRegion(button.dataset.region));
  });
  document.querySelectorAll("[data-preview-course]").forEach((button) => {
    button.addEventListener("click", () => renderPreviewCourse(button.dataset.previewCourse));
  });
  document.getElementById("showSignupButton").addEventListener("click", () => toggleAuthCard("signupCard"));
  // 약관·정책 [보기] 모달 + 전체 동의 토글
  document.querySelectorAll("[data-policy]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      openPolicyModal(button.dataset.policy);
    });
  });
  document.querySelector("[data-close-policy]")?.addEventListener("click", closePolicyModal);
  document.getElementById("policyModal")?.addEventListener("click", (event) => {
    if (event.target === event.currentTarget) closePolicyModal();
  });
  document.getElementById("agreeAll")?.addEventListener("change", (event) => {
    ["agreeTerms", "agreePrivacy", "agreeLocation", "agreeContent", "agreeAge"].forEach((id) => {
      const box = document.getElementById(id);
      if (box) box.checked = event.target.checked;
    });
  });
  document.getElementById("showResetPasswordButton")?.addEventListener("click", () => toggleAuthCard("resetPasswordCard"));
  document.getElementById("resetPasswordForm")?.addEventListener("submit", resetPassword);
  document.getElementById("loginForm").addEventListener("submit", loginUser);
  document.getElementById("signupForm").addEventListener("submit", signupUser);
  document.querySelectorAll("[data-toggle-password]").forEach((button) => {
    button.addEventListener("click", () => togglePasswordVisibility(button));
  });
  logoutNavButton?.addEventListener("click", logoutUser);
  openRecommendRegionModalButton?.addEventListener("click", () => openRegionPicker("recommend"));
  closeRegionPickerButton?.addEventListener("click", closeRegionPicker);
  regionPickerModal?.addEventListener("click", (event) => {
    if (event.target === regionPickerModal) closeRegionPicker();
  });
  regionWholeButton?.addEventListener("click", () => {
    if (regionWholeButton.dataset.regionKey) selectRegionPickerSelection(regionWholeButton.dataset.regionKey);
  });
  recommendBookmarksButton.addEventListener("click", recommendBookmarkedPlaces);
  recommendSavedBookmarksButton.addEventListener("click", recommendBookmarkedPlaces);
  previousCourseButton.addEventListener("click", () => moveVisibleCourse(-1));
  nextCourseButton.addEventListener("click", () => moveVisibleCourse(1));
  bindCourseCarouselGestures();
  document.getElementById("cancelQuickConditionButton").addEventListener("click", closeQuickConditionModal);
  document.getElementById("confirmQuickConditionButton").addEventListener("click", confirmQuickRecommendation);
  document.getElementById("quickOvernight").addEventListener("change", syncQuickDinnerBarOption);
  normalizeLegacyAuthStorage();
  if (authErrorParam) {
    authMessage.textContent = `로그인 실패: ${authErrorParam}`;
  }
  initPwaInstall();
  restoreAuthSession();
}

function selectBrowseRegion(region) {
  if (region === "national") {
    selectedBrowseRegion = "national";
    pendingBrowseProvinceKey = "";
    updateBrowseRegionButtons();
    regionCategoryTitle.textContent = "대한민국에서 무엇을 찾을까요?";
    regionCategorySection.hidden = false;
    regionCategorySection.scrollIntoView({ behavior: "smooth", block: "nearest" });
    return;
  }
  pendingBrowseProvinceKey = region.replace(/^sido_/, "");
  regionCategorySection.hidden = true;
  openRegionPicker("browse", pendingBrowseProvinceKey);
}

function updateBrowseRegionButtons() {
  const selectedContext = findAdminRegionContext(selectedBrowseRegion);
  const selectedHomeRegion = getHomeRegionKeyForProvince(selectedContext.province?.key || pendingBrowseProvinceKey);
  document.querySelectorAll("[data-region]").forEach((button) => {
    const key = button.dataset.region;
    const isSelected = key === selectedBrowseRegion
      || key === pendingBrowseProvinceKey
      || key === selectedHomeRegion
      || key === `sido_${pendingBrowseProvinceKey}`
      || (selectedBrowseRegion === "national" && key === "national");
    button.classList.toggle("selected", isSelected);
  });
}

function getHomeRegionKeyForProvince(provinceKey) {
  const key = String(provinceKey || "").replace(/^sido_/, "");
  if (["43", "44"].includes(key)) return "chungcheong";
  if (["52", "46"].includes(key)) return "jeolla";
  if (["47", "48"].includes(key)) return "gyeongsang";
  return key ? `sido_${key}` : "";
}

function selectBrowseDetailedRegion(regionKey) {
  const region = getRegionSelectionMeta(regionKey);
  if (!region) return;
  selectedBrowseRegion = regionKey;
  const context = findAdminRegionContext(regionKey);
  pendingBrowseProvinceKey = context.province?.key || pendingBrowseProvinceKey || "";
  updateBrowseRegionButtons();
  regionCategoryTitle.textContent = `${region.label}에서 무엇을 찾을까요?`;
  regionCategorySection.hidden = false;
  regionCategorySection.scrollIntoView({ behavior: "smooth", block: "nearest" });
  closeRegionPicker();
}

function openRegionPicker(mode = "recommend", preferredProvinceKey = "") {
  if (!regionPickerModal) return;
  regionPickerMode = mode;
  regionPickerTitle.textContent = mode === "browse" ? "둘러볼 지역 선택" : "지역 선택";
  activeMultiDistrictKeys = new Set();
  activeMultiDongKeys = new Set();
  if (adminRegionCatalog) {
    const selectedKey = mode === "browse" ? selectedBrowseRegion : recommendRegion.value;
    const context = findAdminRegionContext(selectedKey);
    activeRegionGroupKey = preferredProvinceKey || context.province?.key || adminRegionCatalog.provinces?.[0]?.key || "11";
    if (context.multi?.length) {
      const isDongMulti = context.multi.every((item) => item.dong && item.district?.key === context.multi[0]?.district?.key);
      if (isDongMulti) {
        activeDistrictKey = context.multi[0].district.key;
        activeMultiDongKeys = new Set(parseRegionKeyList(selectedKey));
      } else {
        activeDistrictKey = getAdminCityRegionKey(context.multi[0].district?.key);
        activeMultiDistrictKeys = new Set(parseRegionKeyList(selectedKey));
      }
    } else if (context.city) {
      activeDistrictKey = context.city.regionKey;
    } else if (context.dong) {
      activeDistrictKey = context.district?.key || "";
      activeMultiDongKeys = new Set([selectedKey]);
    } else {
      activeDistrictKey = context.province?.key === activeRegionGroupKey ? (context.district?.key || "") : "";
    }
  } else {
    const selectedGroup = REGION_GROUPS.find((group) => group.whole === recommendRegion.value || group.regions.includes(recommendRegion.value));
    activeRegionGroupKey = selectedGroup?.key || "seoul";
    activeDistrictKey = "";
  }
  renderRegionPicker();
  regionPickerModal.hidden = false;
}

function closeRegionPicker() {
  if (regionPickerModal) regionPickerModal.hidden = true;
  regionPickerMode = "recommend";
  if (regionPickerTitle) regionPickerTitle.textContent = "지역 선택";
}

function selectRegionPickerSelection(regionKey) {
  if (regionPickerMode === "browse") {
    selectBrowseDetailedRegion(regionKey);
    return;
  }
  selectRecommendationRegion(regionKey);
}

function renderRegionPicker() {
  if (!regionProvinceList || !regionDistrictList || !regionWholeButton) return;
  if (adminRegionCatalog) {
    renderAdminRegionPicker();
    return;
  }
  const activeGroup = REGION_GROUPS.find((group) => group.key === activeRegionGroupKey) || REGION_GROUPS[0];
  regionProvinceList.innerHTML = REGION_GROUPS
    .map((group) => `
      <button class="${group.key === activeGroup.key ? "selected" : ""}" type="button" data-region-group="${escapeHtml(group.key)}">
        ${escapeHtml(group.label)}
      </button>
    `)
    .join("");
  const canSelectWhole = Boolean(activeGroup.whole && REGION_CENTERS[activeGroup.whole]?.recommendable !== false);
  regionWholeButton.hidden = !canSelectWhole;
  if (canSelectWhole) {
    regionWholeButton.textContent = `${activeGroup.label} 전체로 추천받기`;
    regionWholeButton.dataset.regionKey = activeGroup.whole;
    const selectedKey = regionPickerMode === "browse" ? selectedBrowseRegion : recommendRegion.value;
    regionWholeButton.classList.toggle("selected", selectedKey === activeGroup.whole);
  } else {
    regionWholeButton.dataset.regionKey = "";
    regionWholeButton.classList.remove("selected");
  }
  regionDistrictList.innerHTML = activeGroup.regions.length
    ? activeGroup.regions
      .map((key) => {
        const region = REGION_CENTERS[key];
        if (!region) return "";
        return `
            <button class="${(regionPickerMode === "browse" ? selectedBrowseRegion : recommendRegion.value) === key ? "selected" : ""}" type="button" data-recommend-region="${escapeHtml(key)}">
              ${escapeHtml(region.label.replace(`${activeGroup.label} `, ""))}
            </button>
          `;
      })
      .join("")
    : `<p class="region-picker-empty">${escapeHtml(activeGroup.label)}는 선택 가능한 상세 지역을 준비 중입니다.</p>`;
  regionProvinceList.querySelectorAll("[data-region-group]").forEach((button) => {
    button.addEventListener("click", () => {
      activeRegionGroupKey = button.dataset.regionGroup;
      renderRegionPicker();
    });
  });
  regionDistrictList.querySelectorAll("[data-recommend-region]").forEach((button) => {
    button.addEventListener("click", () => selectRegionPickerSelection(button.dataset.recommendRegion));
  });
}

function findAdminRegionContext(regionKey) {
  if (!adminRegionCatalog) return {};
  const keyList = parseRegionKeyList(regionKey);
  if (keyList.length > 1) {
    const contexts = keyList.map((key) => findAdminRegionContext(key)).filter((context) => context.province);
    return {
      province: contexts[0]?.province,
      multi: contexts,
    };
  }
  for (const province of adminRegionCatalog.provinces || []) {
    if (regionKey === `sido_${province.key}`) return { province };
    for (const city of getAdminCityEntries(province).filter((entry) => entry.type === "city")) {
      if (regionKey === city.regionKey) return { province, city };
    }
    for (const district of province.districts || []) {
      if (regionKey === `sgg_${district.key}`) return { province, district };
      for (const dong of district.dongs || []) {
        if (regionKey === `emd_${dong.key}`) return { province, district, dong };
      }
    }
  }
  return {};
}

function parseRegionKeyList(regionKey) {
  return String(regionKey || "")
    .split(",")
    .map((key) => key.trim())
    .filter(Boolean);
}

function parseCityDistrictName(name) {
  const rawName = String(name || "");
  if (!rawName.endsWith("구")) return null;
  const cityEnd = rawName.lastIndexOf("시");
  if (cityEnd <= 0 || cityEnd >= rawName.length - 1) return null;
  return {
    cityName: rawName.slice(0, cityEnd + 1),
    districtName: rawName.slice(cityEnd + 1),
  };
}

function getAdminCityRegionKey(districtKey) {
  return `city_${String(districtKey || "").slice(0, 4)}`;
}

function getAdminCityEntries(province) {
  const entries = [];
  const cityMap = new Map();
  (province?.districts || []).forEach((district) => {
    const cityParts = parseCityDistrictName(district.name);
    if (!cityParts) {
      entries.push({ type: "district", key: district.key, district });
      return;
    }
    const cityKey = getAdminCityRegionKey(district.key);
    let city = cityMap.get(cityKey);
    if (!city) {
      city = {
        type: "city",
        key: cityKey,
        regionKey: cityKey,
        name: cityParts.cityName,
        label: `${province.name} ${cityParts.cityName}`,
        districts: [],
      };
      cityMap.set(cityKey, city);
      entries.push(city);
    }
    city.districts.push({ ...district, shortName: cityParts.districtName });
  });
  return entries;
}

function getRegionSelectionMeta(regionKey) {
  const keyList = parseRegionKeyList(regionKey);
  if (keyList.length > 1) {
    const regions = keyList.map((key) => REGION_CENTERS[key]).filter(Boolean);
    const contexts = keyList.map((key) => findAdminRegionContext(key)).filter((context) => context.province);
    if (regions.length) {
      const sameProvince = contexts.every((context) => context.province?.key === contexts[0]?.province?.key);
      const sameDistrict = contexts.every((context) => context.district?.key === contexts[0]?.district?.key);
      const sameCity = contexts.every((context) => {
        const firstCity = parseCityDistrictName(contexts[0]?.district?.name)?.cityName || "";
        return firstCity && parseCityDistrictName(context.district?.name)?.cityName === firstCity;
      });
      const allDongs = contexts.length === keyList.length && contexts.every((context) => context.dong);
      let label = `${regions[0].label.replace(/\s*전체$/, "")} 외 ${regions.length - 1}곳`;
      if (allDongs && sameDistrict) {
        label = `${contexts[0].district.label || `${contexts[0].province.name} ${contexts[0].district.name}`} ${regions.length}개 읍면동`;
      } else if (allDongs && sameProvince) {
        label = `${contexts[0].province.name} ${regions.length}개 읍면동`;
      } else if (sameProvince && sameCity) {
        const provinceName = contexts[0].province.name;
        const cityName = parseCityDistrictName(contexts[0].district.name).cityName;
        label = `${provinceName} ${cityName} ${regions.length}개 구`;
      }
      return {
        id: `multi_${keyList.join("_")}_center`,
        name: `${label} 중심`,
        label,
        lat: averageNumbers(regions.map((region) => region.lat)),
        lon: averageNumbers(regions.map((region) => region.lon)),
      };
    }
  }
  return REGION_CENTERS[regionKey] || null;
}

function averageNumbers(values) {
  const numbers = values.map(Number).filter(Number.isFinite);
  if (!numbers.length) return 0;
  return numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
}

function getDistanceMeters(lat1, lon1, lat2, lon2) {
  const aLat = Number(lat1);
  const aLon = Number(lon1);
  const bLat = Number(lat2);
  const bLon = Number(lon2);
  if (![aLat, aLon, bLat, bLon].every(Number.isFinite)) return Number.POSITIVE_INFINITY;
  const toRad = (value) => (value * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const startLat = toRad(aLat);
  const endLat = toRad(bLat);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(startLat) * Math.cos(endLat) * Math.sin(dLon / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function findNearestAdminContextForPlace(place) {
  if (!adminRegionCatalog || !place) return null;
  let nearest = null;
  const placeLat = Number(place.lat);
  const placeLon = Number(place.lon);
  if (!Number.isFinite(placeLat) || !Number.isFinite(placeLon)) return null;
  for (const province of adminRegionCatalog.provinces || []) {
    for (const district of province.districts || []) {
      const dongCandidates = Array.isArray(district.dongs) && district.dongs.length
        ? district.dongs
        : [{ key: "", center: district.center }];
      for (const dong of dongCandidates) {
        const center = dong.center || district.center;
        const distance = getDistanceMeters(placeLat, placeLon, center?.lat, center?.lon);
        if (!nearest || distance < nearest.distance) {
          nearest = { province, district, dong: dong.key ? dong : null, distance };
        }
      }
    }
  }
  return nearest;
}

function getAutoRegionKeyForStartPlace(place) {
  const context = findNearestAdminContextForPlace(place);
  if (!context?.district) return "";
  const cityKey = getAdminCityRegionKey(context.district.key);
  if (parseCityDistrictName(context.district.name) && REGION_CENTERS[cityKey]) {
    return cityKey;
  }
  const districtKey = `sgg_${context.district.key}`;
  return REGION_CENTERS[districtKey] ? districtKey : "";
}

function syncRecommendationRegionFromStartPlace(place) {
  const regionKey = getAutoRegionKeyForStartPlace(place);
  if (!regionKey) return;
  selectRecommendationRegion(regionKey, { keepBrowseRegion: true });
}

function ensureRecommendRegionOption(regionKey) {
  if (!recommendRegion || !regionKey) return;
  if ([...recommendRegion.options].some((option) => option.value === regionKey)) return;
  const meta = getRegionSelectionMeta(regionKey);
  if (!meta) return;
  const option = document.createElement("option");
  option.value = regionKey;
  option.textContent = meta.label;
  recommendRegion.appendChild(option);
}

function isDongRecommendationRegion() {
  const context = findAdminRegionContext(recommendRegion.value);
  return Boolean(context.dong || context.multi?.every((item) => item.dong));
}

function syncNearbyAdminRegionOption() {
  if (!includeNearbyAdminRegionsOption || !includeNearbyAdminRegions) return;
  const wasHidden = includeNearbyAdminRegionsOption.hidden;
  const isDong = isDongRecommendationRegion();
  includeNearbyAdminRegionsOption.hidden = !isDong;
  includeNearbyAdminRegions.disabled = !isDong;
  if (isDong && wasHidden) includeNearbyAdminRegions.checked = true;
  if (!isDong) includeNearbyAdminRegions.checked = false;
}

function getAdminRegionPickerGroups(provinces) {
  const mergedGroups = [
    { key: "chungcheong", name: "충청도", provinceKeys: ["43", "44"], wholeRegionKey: "chungcheong" },
    { key: "jeolla", name: "전라도", provinceKeys: ["52", "46"], wholeRegionKey: "jeolla" },
    { key: "gyeongsang", name: "경상도", provinceKeys: ["47", "48"], wholeRegionKey: "gyeongsang" },
  ];
  const mergedProvinceKeys = new Set(mergedGroups.flatMap((group) => group.provinceKeys));
  const groups = [];
  provinces.forEach((province) => {
    const mergedGroup = mergedGroups.find((group) => group.provinceKeys.includes(province.key));
    if (mergedGroup) {
      if (!groups.some((group) => group.key === mergedGroup.key)) groups.push(mergedGroup);
      return;
    }
    if (!mergedProvinceKeys.has(province.key)) {
      groups.push({
        key: province.key,
        name: province.name,
        provinceKeys: [province.key],
        wholeRegionKey: province.selectableWhole ? `sido_${province.key}` : "",
      });
    }
  });
  return groups;
}

function renderAdminRegionPicker() {
  const provinces = adminRegionCatalog?.provinces || [];
  const groups = getAdminRegionPickerGroups(provinces);
  const activeGroup = groups.find((group) => group.key === activeRegionGroupKey || group.provinceKeys.includes(activeRegionGroupKey)) || groups[0];
  if (!activeGroup) return;
  activeRegionGroupKey = activeGroup.key;
  const activeProvinces = activeGroup.provinceKeys
    .map((key) => provinces.find((province) => province.key === key))
    .filter(Boolean);
  const selectedKey = regionPickerMode === "browse" ? selectedBrowseRegion : recommendRegion.value;
  const activeCity = activeProvinces
    .flatMap((province) => getAdminCityEntries(province).filter((entry) => entry.type === "city"))
    .find((city) => city.regionKey === activeDistrictKey);
  const activeDistrict = activeCity ? null : activeProvinces
    .flatMap((province) => province.districts || [])
    .find((district) => district.key === activeDistrictKey);
  const activeDistrictParentCity = activeDistrict
    ? activeProvinces
      .flatMap((province) => getAdminCityEntries(province).filter((entry) => entry.type === "city"))
      .find((city) => city.districts.some((district) => district.key === activeDistrict.key))
    : null;

  regionProvinceList.innerHTML = groups
    .map((group) => `
      <button class="${group.key === activeGroup.key ? "selected" : ""}" type="button" data-region-province="${escapeHtml(group.key)}">
        ${escapeHtml(group.name)}
      </button>
    `)
    .join("");

  if (activeCity) {
    const cityDistrictKeys = activeCity.districts.map((district) => `sgg_${district.key}`);
    const activeSelectedKeys = [...activeMultiDistrictKeys].filter((key) => cityDistrictKeys.includes(key));
    regionWholeButton.hidden = false;
    regionWholeButton.textContent = `${activeCity.name} 전체로 추천받기`;
    regionWholeButton.dataset.regionKey = activeCity.regionKey;
    regionWholeButton.classList.toggle("selected", selectedKey === activeCity.regionKey);
    regionDistrictList.innerHTML = `
      <button class="region-back-button" type="button" data-region-district-back>← ${escapeHtml(activeGroup.name)} 시·군 목록</button>
      <p class="region-picker-empty region-picker-guide">${escapeHtml(activeCity.name)} 안에서 구는 여러 개 선택할 수 있어요.</p>
      ${activeCity.districts
        .map((district) => {
          const districtKey = `sgg_${district.key}`;
          const isSelected = activeMultiDistrictKeys.has(districtKey);
          return `
            <div class="region-district-choice ${isSelected ? "selected" : ""}">
              <button class="region-district-toggle" type="button" data-region-toggle-district="${escapeHtml(districtKey)}" aria-pressed="${isSelected ? "true" : "false"}">
                <span>${escapeHtml(district.shortName || district.name)}</span>
                <small>${escapeHtml(`${district.dongs?.length || 0}개 읍면동`)}</small>
              </button>
              <button class="region-district-open" type="button" data-region-open-district="${escapeHtml(district.key)}">읍면동 선택 ›</button>
            </div>
          `;
        })
        .join("")}
      <button class="region-apply-button" type="button" data-region-apply-districts ${activeSelectedKeys.length ? "" : "disabled"}>
        ${escapeHtml(activeSelectedKeys.length ? `선택한 ${activeSelectedKeys.length}개 구로 ${regionPickerMode === "browse" ? "둘러보기" : "추천받기"}` : "구를 선택해주세요")}
      </button>
    `;
  } else if (activeDistrict) {
    const activeDongKeys = (activeDistrict.dongs || []).map((dong) => `emd_${dong.key}`);
    const activeSelectedDongKeys = [...activeMultiDongKeys].filter((key) => activeDongKeys.includes(key));
    regionWholeButton.hidden = false;
    regionWholeButton.textContent = `${activeDistrict.name} 전체로 추천받기`;
    regionWholeButton.dataset.regionKey = `sgg_${activeDistrict.key}`;
    regionWholeButton.classList.toggle("selected", selectedKey === `sgg_${activeDistrict.key}`);
    regionDistrictList.innerHTML = `
      <button class="region-back-button" type="button" data-region-district-back ${activeDistrictParentCity ? `data-region-city-back="${escapeHtml(activeDistrictParentCity.regionKey)}"` : ""}>← ${escapeHtml(activeDistrictParentCity ? `${activeDistrictParentCity.name} 구 목록` : `${activeGroup.name} 시군구 목록`)}</button>
      <p class="region-picker-empty region-picker-guide">${escapeHtml(activeDistrict.name)} 안에서 읍·면·동은 여러 개 선택할 수 있어요.</p>
      ${(activeDistrict.dongs || [])
        .map((dong) => {
          const dongKey = `emd_${dong.key}`;
          const isSelected = activeMultiDongKeys.has(dongKey);
          return `
            <button class="${isSelected ? "selected" : ""}" type="button" data-region-toggle-dong="${escapeHtml(dongKey)}" aria-pressed="${isSelected ? "true" : "false"}">
              ${escapeHtml(dong.name)}
            </button>
          `;
        })
        .join("")}
      <button class="region-apply-button" type="button" data-region-apply-dongs ${activeSelectedDongKeys.length ? "" : "disabled"}>
        ${escapeHtml(activeSelectedDongKeys.length ? `선택한 ${activeSelectedDongKeys.length}개 읍면동으로 ${regionPickerMode === "browse" ? "둘러보기" : "추천받기"}` : "읍면동을 선택해주세요")}
      </button>
    `;
  } else {
    regionWholeButton.hidden = !activeGroup.wholeRegionKey;
    if (activeGroup.wholeRegionKey) {
      regionWholeButton.textContent = `${activeGroup.name} 전체로 추천받기`;
      regionWholeButton.dataset.regionKey = activeGroup.wholeRegionKey;
      regionWholeButton.classList.toggle("selected", selectedKey === activeGroup.wholeRegionKey);
    } else {
      regionWholeButton.dataset.regionKey = "";
      regionWholeButton.classList.remove("selected");
    }
    regionDistrictList.innerHTML = activeProvinces
      .flatMap((province) => getAdminCityEntries(province).map((entry) => ({ ...entry, province })))
      .map((entry) => {
        if (entry.type === "city") {
          const isSelected = selectedKey === entry.regionKey;
          const selectedCount = parseRegionKeyList(selectedKey)
            .filter((key) => entry.districts.some((district) => key === `sgg_${district.key}`))
            .length;
          return `
            <button class="${isSelected || selectedCount ? "selected" : ""}" type="button" data-region-city="${escapeHtml(entry.regionKey)}">
              <span>${escapeHtml(activeProvinces.length > 1 ? entry.label : entry.name)}</span>
              <small>${escapeHtml(selectedCount ? `${selectedCount}개 구 선택됨` : `${entry.districts.length}개 구`)}</small>
            </button>
          `;
        }
        const district = entry.district;
        return `
          <button class="${selectedKey === `sgg_${district.key}` ? "selected" : ""}" type="button" data-region-district="${escapeHtml(district.key)}">
            <span>${escapeHtml(activeProvinces.length > 1 ? district.label : district.name)}</span>
            <small>${escapeHtml(`${district.dongs?.length || 0}개 읍면동`)}</small>
          </button>
        `;
      })
      .join("");
  }

  regionProvinceList.querySelectorAll("[data-region-province]").forEach((button) => {
    button.addEventListener("click", () => {
      activeRegionGroupKey = button.dataset.regionProvince;
      activeDistrictKey = "";
      activeMultiDistrictKeys = new Set();
      activeMultiDongKeys = new Set();
      renderRegionPicker();
    });
  });
  regionDistrictList.querySelector("[data-region-district-back]")?.addEventListener("click", (event) => {
    activeDistrictKey = event.currentTarget.dataset.regionCityBack || "";
    activeMultiDistrictKeys = new Set();
    activeMultiDongKeys = new Set();
    if (activeDistrictKey) {
      const nextCity = activeProvinces
        .flatMap((province) => getAdminCityEntries(province))
        .find((entry) => entry.regionKey === activeDistrictKey);
      const cityDistrictKeys = nextCity?.districts.map((district) => `sgg_${district.key}`) || [];
      activeMultiDistrictKeys = new Set(parseRegionKeyList(selectedKey).filter((key) => cityDistrictKeys.includes(key)));
    }
    renderRegionPicker();
  });
  regionDistrictList.querySelectorAll("[data-region-city]").forEach((button) => {
    button.addEventListener("click", () => {
      activeDistrictKey = button.dataset.regionCity;
      activeMultiDongKeys = new Set();
      const activeCityDistrictKeys = activeProvinces
        .flatMap((province) => getAdminCityEntries(province))
        .find((entry) => entry.regionKey === activeDistrictKey)
        ?.districts.map((district) => `sgg_${district.key}`) || [];
      activeMultiDistrictKeys = new Set(parseRegionKeyList(selectedKey).filter((key) => activeCityDistrictKeys.includes(key)));
      renderRegionPicker();
    });
  });
  regionDistrictList.querySelectorAll("[data-region-district]").forEach((button) => {
    button.addEventListener("click", () => {
      activeDistrictKey = button.dataset.regionDistrict;
      activeMultiDistrictKeys = new Set();
      const districtDongKeys = activeProvinces
        .flatMap((province) => province.districts || [])
        .find((district) => district.key === activeDistrictKey)
        ?.dongs.map((dong) => `emd_${dong.key}`) || [];
      activeMultiDongKeys = new Set(parseRegionKeyList(selectedKey).filter((key) => districtDongKeys.includes(key)));
      renderRegionPicker();
    });
  });
  regionDistrictList.querySelectorAll("[data-region-open-district]").forEach((button) => {
    button.addEventListener("click", () => {
      activeDistrictKey = button.dataset.regionOpenDistrict;
      const districtDongKeys = activeProvinces
        .flatMap((province) => province.districts || [])
        .find((district) => district.key === activeDistrictKey)
        ?.dongs.map((dong) => `emd_${dong.key}`) || [];
      activeMultiDongKeys = new Set(parseRegionKeyList(selectedKey).filter((key) => districtDongKeys.includes(key)));
      renderRegionPicker();
    });
  });
  regionDistrictList.querySelectorAll("[data-region-toggle-district]").forEach((button) => {
    button.addEventListener("click", () => {
      const districtKey = button.dataset.regionToggleDistrict;
      if (activeMultiDistrictKeys.has(districtKey)) {
        activeMultiDistrictKeys.delete(districtKey);
      } else {
        activeMultiDistrictKeys.add(districtKey);
      }
      renderRegionPicker();
    });
  });
  regionDistrictList.querySelectorAll("[data-region-toggle-dong]").forEach((button) => {
    button.addEventListener("click", () => {
      const dongKey = button.dataset.regionToggleDong;
      if (activeMultiDongKeys.has(dongKey)) {
        activeMultiDongKeys.delete(dongKey);
      } else {
        activeMultiDongKeys.add(dongKey);
      }
      renderRegionPicker();
    });
  });
  regionDistrictList.querySelector("[data-region-apply-districts]")?.addEventListener("click", () => {
    const orderedKeys = activeCity
      ? activeCity.districts
        .map((district) => `sgg_${district.key}`)
        .filter((key) => activeMultiDistrictKeys.has(key))
      : [...activeMultiDistrictKeys];
    if (orderedKeys.length) selectRegionPickerSelection(orderedKeys.join(","));
  });
  regionDistrictList.querySelector("[data-region-apply-dongs]")?.addEventListener("click", () => {
    const orderedKeys = activeDistrict
      ? (activeDistrict.dongs || [])
        .map((dong) => `emd_${dong.key}`)
        .filter((key) => activeMultiDongKeys.has(key))
      : [...activeMultiDongKeys];
    if (orderedKeys.length) selectRegionPickerSelection(orderedKeys.join(","));
  });
  regionDistrictList.querySelectorAll("[data-recommend-region]").forEach((button) => {
    button.addEventListener("click", () => selectRegionPickerSelection(button.dataset.recommendRegion));
  });
}

function selectRecommendationRegion(regionKey, options = {}) {
  const region = getRegionSelectionMeta(regionKey);
  if (!region || region.recommendable === false) return;
  ensureRecommendRegionOption(regionKey);
  recommendRegion.value = regionKey;
  updateRecommendRegionButton();
  syncNearbyAdminRegionOption();
  if (!options.keepBrowseRegion) {
    const browseRegion = ["seoul", "busan", "daejeon", "jeonju", "gyeongju"].includes(regionKey)
      ? regionKey
      : selectedBrowseRegion;
    if (REGION_CENTERS[browseRegion]) selectedBrowseRegion = browseRegion;
  }
  if (!selectedStartPlace) renderSelectedStartPlace();
  renderMapForPlaces([getRecommendationStartPlace()]);
  closeRegionPicker();
}

function updateRecommendRegionButton() {
  if (!openRecommendRegionModalButton || !recommendRegion) return;
  const region = getRegionSelectionMeta(recommendRegion.value) || REGION_CENTERS.seoul;
  openRecommendRegionModalButton.textContent = region.label;
}

function scrollAppToTop() {
  const scrollingElement = document.scrollingElement || document.documentElement;
  scrollingElement.scrollTo?.({ top: 0, left: 0, behavior: "auto" });
  window.scrollTo({ top: 0, left: 0, behavior: "auto" });
}

function settleAppAtTop() {
  scrollAppToTop();
  window.requestAnimationFrame(() => {
    scrollAppToTop();
    window.requestAnimationFrame(scrollAppToTop);
  });
}

function setPlaceReorderScrollLock(locked) {
  if (locked === placeReorderScrollLocked) return;
  placeReorderScrollLocked = locked;
  document.documentElement.classList.toggle("place-reorder-active", locked);
  document.body.classList.toggle("place-reorder-active", locked);

  if (locked) {
    placeReorderScrollY = window.scrollY || document.documentElement.scrollTop || 0;
    document.body.style.position = "fixed";
    document.body.style.top = `-${placeReorderScrollY}px`;
    document.body.style.left = "0";
    document.body.style.right = "0";
    document.body.style.width = "100%";
    return;
  }

  document.body.style.position = "";
  document.body.style.top = "";
  document.body.style.left = "";
  document.body.style.right = "";
  document.body.style.width = "";
  window.scrollTo({ top: placeReorderScrollY, left: 0, behavior: "auto" });
}

function getVisiblePortalViewName() {
  if (!homeView.hidden) return "home";
  if (!triptiView.hidden) return "tripti";
  if (mapExploreView && !mapExploreView.hidden) return "mapExplore";
  if (!browseView.hidden) return "browse";
  if (!communityView.hidden) return "community";
  if (!bookmarksView.hidden) return "bookmarks";
  if (!myCoursesView.hidden) return "myCourses";
  if (!profileView.hidden) return "profile";
  if (!loginView.hidden) return "login";
  if (!recommendationView.hidden) return "recommendation";
  if (chatHubView && !chatHubView.hidden) return "chatHub";
  return currentPortalView || "home";
}

// 하단탭(데스크톱 상단 nav 포함)의 활성 표시(핑크)를 현재 보고 있는 화면과 동기화한다.
// 클릭한 버튼이 아니라 '지금 있는 화면' 기준으로 칠해야 한다. 전용 탭이 없는
// browse(둘러보기)는 홈에서 들어가므로 홈 탭으로 묶어 표시한다.
function syncPortalNavActive(name) {
  const target = ["browse", "mapExplore"].includes(name) ? "home" : name;
  document.querySelectorAll(".portal-nav [data-show-view]").forEach((button) => {
    const isActive = button.dataset.showView === target;
    button.classList.toggle("active", isActive);
    if (isActive) {
      button.setAttribute("aria-current", "page");
    } else {
      button.removeAttribute("aria-current");
    }
  });
}

function showPortalView(name, options = {}) {
  // 장소 드래그 중 화면이 바뀌면 스크롤 잠금이 남을 수 있으므로 화면 전환 시 항상 해제한다.
  setPlaceReorderScrollLock(false);
  const previousView = getVisiblePortalViewName();
  if (name !== "tripti") triptiRetaking = false;
  if (name === "recommendation" && !getAuthToken()) {
    pendingRecommendationAccess = true;
    authMessage.textContent = "RecoDate 코스 추천은 로그인 후 이용할 수 있습니다.";
    name = "login";
  }
  if (name === "profile" && !getAuthToken()) name = "login";
  if (name === "community" && !getAuthToken()) {
    authMessage.textContent = "커뮤니티는 로그인 후 이용할 수 있습니다.";
    name = "login";
  }
  if (name === "chatHub" && !getAuthToken()) {
    authMessage.textContent = "채팅은 로그인 후 이용할 수 있습니다.";
    name = "login";
  }
  homeView.hidden = name !== "home";
  triptiView.hidden = name !== "tripti";
  if (mapExploreView) mapExploreView.hidden = name !== "mapExplore";
  browseView.hidden = name !== "browse";
  communityView.hidden = name !== "community";
  bookmarksView.hidden = name !== "bookmarks";
  myCoursesView.hidden = name !== "myCourses";
  profileView.hidden = name !== "profile";
  loginView.hidden = name !== "login";
  recommendationView.hidden = name !== "recommendation";
  if (chatHubView) chatHubView.hidden = name !== "chatHub";
  portalHeader.hidden = name === "login";
  savedCourseFloatingButton.hidden = name === "login";
  if (name === "recommendation") showRecommendationStep("conditions");
  if (name === "recommendation") syncTriptiApplyOption();
  if (name === "bookmarks") renderSavedBookmarks();
  if (name === "myCourses") renderSavedCourses();
  if (name === "profile") renderProfile();
  if (name === "tripti") renderTriptiQuiz();
  if (name === "community") loadCommunityFeed();
  if (name === "home") loadHomeCommunityFeed();
  if (name === "mapExplore") initMapExploreView();
  if (name === "chatHub") loadChatHub();
  if (!options.replace && previousView && previousView !== name) {
    portalViewHistory.push(previousView);
    if (portalViewHistory.length > 40) portalViewHistory = portalViewHistory.slice(-40);
  }
  currentPortalView = name;
  syncPortalNavActive(name);
  // 새로고침 시 화면 복원용(탭 단위). 로그인 화면은 저장하지 않는다.
  if (name !== "login") {
    try {
      sessionStorage.setItem("recodate_last_view", name);
    } catch (_error) {
      /* 시크릿 모드 등 저장 불가 환경은 무시 */
    }
  }
  settleAppAtTop();
}

function resetRecommendationState() {
  form.reset();
  if (recommendRegion) {
    recommendRegion.value = getDefaultRecommendationRegionKey();
    updateRecommendRegionButton();
    syncNearbyAdminRegionOption();
  }
  selectedStartPlace = null;
  selectedRequiredPlaces = [];
  selectedAccommodation = null;
  currentCourses = [];
  lastRecommendationData = null;
  selectedCourseId = null;
  visibleCourseIndex = 0;
  replacementHistoryBySlot.clear();
  placeKeyword.value = "";
  requiredPlaceKeyword.value = "";
  accommodationKeyword.value = "";
  startTimeAnyButton.setAttribute("aria-pressed", "false");
  startTimeAnyButton.classList.remove("selected");
  startTimeAnyButton.textContent = "무관";
  startTime.disabled = false;
  if (applyTriptiPreference) applyTriptiPreference.checked = false;
  if (onlyOpenNow) onlyOpenNow.checked = false;
  triptiPreferredPlaceCategories = [];
  renderSelectedStartPlace();
  renderSelectedRequiredPlace();
  renderSelectedAccommodation();
  syncModeOptions();
}

function showRecommendationStep(step) {
  // 단계 전환 시에도 드래그 스크롤 잠금이 남지 않도록 해제한다.
  setPlaceReorderScrollLock(false);
  currentRecommendationStep = step;
  const controlsPanel = recommendationView.querySelector(".controls-panel");
  const resultsPanel = recommendationView.querySelector(".results-panel");
  const mapPanel = recommendationView.querySelector(".map-panel");
  controlsPanel.hidden = step !== "conditions";
  resultsPanel.hidden = step !== "results";
  mapPanel.hidden = step !== "flow";
  if (step !== "flow") mapPanel.classList.remove("route-map-compact");
  window.requestAnimationFrame(updateRouteMapCompactState);
  settleAppAtTop();
}

function bindCourseCarouselGestures() {
  courseCarouselWheelLocked = false;
  let pointerId = null;
  let startX = 0;
  let startY = 0;
  let currentX = 0;
  let dragging = false;

  const interactiveSelector = [
    "button",
    "a",
    "input",
    "select",
    "textarea",
    ".drag-handle",
    ".course-replacement-editor",
    ".course-add-editor",
  ].join(",");

  function getCard() {
    return courseList.querySelector(".course-card");
  }

  function resetCard(card) {
    if (!card) return;
    card.classList.remove("course-card-swiping");
    card.style.removeProperty("--course-swipe-x");
    card.style.removeProperty("--course-swipe-rotate");
    card.style.removeProperty("--course-swipe-opacity");
  }

  function finishSwipe(event, cancelled = false) {
    if (pointerId === null || event.pointerId !== pointerId) return;
    const card = getCard();
    const deltaX = currentX - startX;
    const threshold = Math.min(110, Math.max(64, courseList.clientWidth * 0.12));
    const direction = deltaX < 0 ? 1 : -1;
    const canMove = direction > 0
      ? visibleCourseIndex < currentCourses.length - 1
      : visibleCourseIndex > 0;

    courseList.releasePointerCapture?.(pointerId);
    pointerId = null;

    if (!cancelled && dragging && Math.abs(deltaX) >= threshold && canMove) {
      courseCarouselSuppressClick = true;
      // 모바일에서는 스와이프 후 click 이벤트가 오지 않아 플래그가 남고,
      // 다음 실제 버튼 클릭(예: 코스 흐름 보기)이 무시되는 문제가 있어 잠시 후 자동 해제한다.
      window.setTimeout(() => {
        courseCarouselSuppressClick = false;
      }, 400);
      card?.classList.add(direction > 0 ? "course-card-exit-left" : "course-card-exit-right");
      window.setTimeout(() => {
        resetCard(card);
        moveVisibleCourse(direction, { animateEntry: true });
      }, 180);
    } else {
      resetCard(card);
      if (dragging) {
        card?.classList.add("course-card-snap-back");
        window.setTimeout(() => card?.classList.remove("course-card-snap-back"), 220);
      }
    }
    dragging = false;
  }

  courseList.addEventListener("pointerdown", (event) => {
    if (currentCourses.length < 2 || event.button > 0) return;
    if (event.target.closest(interactiveSelector)) return;
    const card = getCard();
    if (!card || !card.contains(event.target)) return;
    pointerId = event.pointerId;
    startX = event.clientX;
    startY = event.clientY;
    currentX = startX;
    dragging = false;
    courseList.setPointerCapture?.(pointerId);
  });

  courseList.addEventListener("pointermove", (event) => {
    if (pointerId === null || event.pointerId !== pointerId) return;
    const deltaX = event.clientX - startX;
    const deltaY = event.clientY - startY;
    currentX = event.clientX;
    if (!dragging && Math.abs(deltaX) < 7) return;
    if (!dragging && Math.abs(deltaY) > Math.abs(deltaX)) {
      courseList.releasePointerCapture?.(pointerId);
      pointerId = null;
      return;
    }
    dragging = true;
    event.preventDefault();
    const card = getCard();
    const atStart = visibleCourseIndex === 0 && deltaX > 0;
    const atEnd = visibleCourseIndex === currentCourses.length - 1 && deltaX < 0;
    const resistedX = atStart || atEnd ? deltaX * 0.28 : deltaX;
    card?.classList.add("course-card-swiping");
    card?.style.setProperty("--course-swipe-x", `${resistedX}px`);
    card?.style.setProperty("--course-swipe-rotate", `${Math.max(-2.2, Math.min(2.2, resistedX / 180))}deg`);
    card?.style.setProperty("--course-swipe-opacity", String(Math.max(0.68, 1 - Math.abs(resistedX) / 900)));
  });

  courseList.addEventListener("pointerup", (event) => finishSwipe(event));
  courseList.addEventListener("pointercancel", (event) => finishSwipe(event, true));
  courseList.addEventListener("click", (event) => {
    if (!courseCarouselSuppressClick) return;
    event.preventDefault();
    event.stopPropagation();
    courseCarouselSuppressClick = false;
  }, true);
  courseList.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft") moveVisibleCourse(-1, { animateEntry: true });
    if (event.key === "ArrowRight") moveVisibleCourse(1, { animateEntry: true });
  });
}

function readQuickRecommendationOptions() {
  const quickOvernight = document.getElementById("quickOvernight").checked;
  return {
    transport: getCheckedValue("quickTransport"),
    overnight: quickOvernight,
    include_food: document.getElementById("quickLunch").checked,
    include_cafe: document.getElementById("quickCafe").checked,
    include_dinner: document.getElementById("quickDinner").checked,
    include_bar: quickOvernight && document.getElementById("quickBar").checked,
  };
}

function resetQuickConditionOptions() {
  document.querySelector('input[name="quickTransport"][value="walk"]').checked = true;
  document.getElementById("quickOvernight").checked = false;
  document.getElementById("quickLunch").checked = true;
  document.getElementById("quickCafe").checked = true;
  document.getElementById("quickDinner").checked = false;
  document.getElementById("quickBar").checked = false;
  document.getElementById("quickBar").disabled = true;
}

function syncQuickDinnerBarOption() {
  const quickOvernight = document.getElementById("quickOvernight").checked;
  document.getElementById("quickBar").disabled = !quickOvernight;
  if (quickOvernight) {
    document.getElementById("quickDinner").checked = true;
  } else {
    document.getElementById("quickBar").checked = false;
  }
}

function requestQuickRecommendation(type, payload) {
  pendingQuickRecommendation = { type, payload };
  if (!getAuthToken()) {
    pendingRecommendationAccess = true;
    showPortalView("recommendation");
    return;
  }
  quickConditionDescription.textContent = type === "bookmarks"
    ? "찜한 장소를 중심으로 이동수단과 식사 조건을 골라주세요."
    : "이 흐름을 바탕으로 이동수단과 식사 조건을 골라주세요.";
  resetQuickConditionOptions();
  quickConditionModal.hidden = false;
}

function closeQuickConditionModal() {
  quickConditionModal.hidden = true;
  pendingQuickRecommendation = null;
}

async function confirmQuickRecommendation() {
  const pending = pendingQuickRecommendation;
  if (!pending) return;
  const options = readQuickRecommendationOptions();
  quickConditionModal.hidden = true;
  pendingQuickRecommendation = null;
  if (pending.type === "preview") {
    await loadPreviewRecommendation(pending.payload.courseId, options);
    return;
  }
  if (pending.type === "previewSave") {
    await savePreviewRecommendation(pending.payload.courseId, options);
    return;
  }
  await createRecommendationsFromPlaces(pending.payload.places, {
    ...options,
    regionKey: pending.payload.regionKey,
    anchorPlace: pending.payload.anchorPlace,
  });
}

async function loadPreviewRecommendation(courseId, options = {}) {
  if (!getAuthToken()) {
    pendingPreviewCourseId = courseId;
    showPortalView("recommendation");
    return;
  }
  showPortalView("recommendation");
  showRecommendationStep("results");
  resultSummary.textContent = "미리보기 흐름으로 단일 코스를 만드는 중입니다.";
  courseList.innerHTML = "";
  try {
    const query = new URLSearchParams({
      transport: options.transport || "transit",
      overnight: String(options.overnight ?? false),
      include_food: String(options.include_food ?? true),
      include_cafe: String(options.include_cafe ?? true),
      include_dinner: String(options.include_dinner ?? false),
      include_bar: String((options.overnight ?? false) && (options.include_bar ?? false)),
    });
    const course = await requestJson(`/api/courses/preview/${encodeURIComponent(courseId)}?${query}`);
    currentCourses = [course];
    replacementHistoryBySlot.clear();
    lastRecommendationData = { candidate_counts: { route_api_calls: 0 } };
    selectedCourseId = null;
    renderCourses(currentCourses, lastRecommendationData);
    showRecommendationStep("results");
  } catch (error) {
    resultSummary.textContent = `미리보기 코스 생성 실패: ${readApiError(error.message)}`;
  }
}

function getSelectedMapExploreCategories() {
  const values = Array.from(document.querySelectorAll('input[name="mapExploreCategory"]:checked'))
    .map((input) => input.value)
    .filter((value) => MAP_EXPLORE_CATEGORY_META[value]);
  return values.length ? values : Object.keys(MAP_EXPLORE_CATEGORY_META);
}

function initMapExploreView() {
  collapseMapExploreSheet();
  if (!mapExploreInitialized) {
    mapExploreInitialized = true;
    renderMapExploreMap({ center: mapExploreState.center, places: [], showCenterPin: false });
    if (mapExploreStatus) {
      mapExploreStatus.textContent = "지도를 움직이면 현재 화면의 장소가 자동으로 표시돼요. 검색하면 그 장소 주변으로 이동합니다.";
    }
    loadDefaultMapExplorePlaces();
  } else if (mapExploreTmapMap?.setCenter && mapExploreState.center) {
    suppressMapExploreAutoLoad();
    mapExploreTmapMap.setCenter(new Tmapv2.LatLng(mapExploreState.center.lat, mapExploreState.center.lon));
  } else if (mapExploreLeafletMap?.setView && mapExploreState.center) {
    suppressMapExploreAutoLoad();
    mapExploreLeafletMap.setView([Number(mapExploreState.center.lat), Number(mapExploreState.center.lon)], mapExploreLeafletMap.getZoom?.() || 13);
  }
}

async function loadDefaultMapExplorePlaces() {
  if (mapExploreDefaultLoaded || mapExploreDefaultLoading || !mapExploreStatus) return;
  mapExploreDefaultLoading = true;
  mapExploreStatus.textContent = "서울 주변 장소 핀을 지도에 표시하는 중입니다...";
  try {
    const selectedCategories = getSelectedMapExploreCategories();
    const query = new URLSearchParams({
      categories: selectedCategories.join(","),
      radius_km: String(mapExploreState.radiusKm || 2.5),
      count: "20",
      lat: String(mapExploreState.center?.lat || REGION_CENTERS.seoul.lat),
      lon: String(mapExploreState.center?.lon || REGION_CENTERS.seoul.lon),
    });
    const data = await requestJson(`/api/places/map-browse?${query.toString()}`, { timeoutMs: 15000 });
    const flatPlaces = (data.categories || []).flatMap((category) => category.places || []);
    mapExploreState = {
      keyword: "",
      center: {
        ...(data.center || mapExploreState.center),
        name: "서울",
        address: "서울특별시",
      },
      radiusKm: Number(data.radius_km) || mapExploreState.radiusKm || 2.5,
      categories: data.categories || [],
      places: flatPlaces.length ? flatPlaces : data.places || [],
      loading: false,
    };
    mapExploreDefaultLoaded = true;
    renderMapExploreResults();
    collapseMapExploreSheet();
  } catch (_error) {
    mapExploreStatus.textContent = "서울 지도를 먼저 보여드리고 있어요. 설정을 올려 원하는 장소를 검색해보세요.";
    renderMapExploreMap({ center: mapExploreState.center, places: [], showCenterPin: false });
  } finally {
    mapExploreDefaultLoading = false;
  }
}

function setMapExploreSheetExpanded(expanded) {
  if (!mapExploreSheet) return;
  mapExploreSheet.dataset.state = expanded ? "expanded" : "collapsed";
  updateMapExploreSheetToggleUi();
}

function updateMapExploreSheetToggleUi() {
  const btn = document.getElementById("mapExploreFilterToggle");
  if (!btn) return;
  const expanded = mapExploreSheet?.dataset.state === "expanded";
  const strong = btn.querySelector("strong");
  const small = btn.querySelector("small");
  if (strong) strong.textContent = expanded ? "▾ 접기" : "🔍 장소 검색 · 카테고리 필터";
  if (small) {
    small.textContent = expanded
      ? "탭하면 닫혀요"
      : "탭하면 펼쳐져요 — 가고 싶은 장소를 검색해 보세요";
  }
}

function collapseMapExploreSheet() {
  setMapExploreSheetExpanded(false);
}

function expandMapExploreSheet() {
  setMapExploreSheetExpanded(true);
}

function bindMapExploreSheetDrag() {
  if (!mapExploreSheetHandle || mapExploreSheetHandle.dataset.bound === "true") return;
  mapExploreSheetHandle.dataset.bound = "true";
  let startY = 0;
  mapExploreSheetHandle.addEventListener("pointerdown", (event) => {
    mapExploreSheetDragging = true;
    startY = event.clientY;
  });
  // 탭(거의 안 움직임)이면 토글, 위로 끌면 펼침, 아래로 끌면 접힘 — 확실히 동작하게.
  mapExploreSheetHandle.addEventListener("pointerup", (event) => {
    if (!mapExploreSheetDragging) return;
    mapExploreSheetDragging = false;
    const diff = event.clientY - startY;
    if (diff < -24) setMapExploreSheetExpanded(true);
    else if (diff > 24) setMapExploreSheetExpanded(false);
    else setMapExploreSheetExpanded(mapExploreSheet?.dataset.state !== "expanded");
  });
  mapExploreSheetHandle.addEventListener("pointercancel", () => {
    mapExploreSheetDragging = false;
  });
}

function clearMapExploreMarkers() {
  mapExploreTmapMarkers.forEach((marker) => {
    if (marker?.setMap) marker.setMap(null);
  });
  mapExploreTmapMarkers = [];
  if (mapExploreLeafletMap) {
    mapExploreLeafletMarkers.forEach((marker) => {
      mapExploreLeafletMap.removeLayer(marker);
    });
  }
  mapExploreLeafletMarkers = [];
}

async function renderMapExploreMap({ center, places = [], showCenterPin = true, recenter = true }) {
  if (!mapExploreMapCanvas || !center) return;
  const safePlaces = (places || []).filter((place) => Number.isFinite(Number(place.lat)) && Number.isFinite(Number(place.lon)));
  try {
    await loadTmapSdk();
    if (!mapExploreTmapMap) {
      suppressMapExploreAutoLoad();
      mapExploreMapCanvas.innerHTML = "";
      mapExploreTmapMap = new Tmapv2.Map("mapExploreMapCanvas", {
        center: new Tmapv2.LatLng(center.lat, center.lon),
        width: "100%",
        height: "100%",
        zoom: safePlaces.length ? 14 : 12,
        zoomControl: true,
        scrollwheel: true,
      });
      bindMapExploreMoveEvents();
    } else if (recenter) {
      // 키워드 검색은 그 장소로 이동, 지도 자동 갱신(recenter=false)은 현재 보던 위치를 유지한다.
      suppressMapExploreAutoLoad();
      mapExploreTmapMap.setCenter(new Tmapv2.LatLng(center.lat, center.lon));
      mapExploreTmapMap.setZoom(safePlaces.length ? 14 : 12);
    }
    clearMapExploreMarkers();
    if (showCenterPin) {
      mapExploreTmapMarkers.push(createMapExploreMarker(center, -1, "center"));
    }
    safePlaces.forEach((place, index) => {
      mapExploreTmapMarkers.push(createMapExploreMarker(place, index, place.map_category || "default"));
    });
  } catch (_error) {
    try {
      await renderMapExploreLeafletMap({ center, places: safePlaces, showCenterPin, recenter });
    } catch (_fallbackError) {
      renderMapExploreStaticFallback(center, safePlaces, showCenterPin);
    }
  }
}

async function renderMapExploreLeafletMap({ center, places = [], showCenterPin = true, recenter = true }) {
  await loadLeafletSdk();
  const zoom = places.length ? 14 : 12;
  if (!mapExploreLeafletMap) {
    suppressMapExploreAutoLoad();
    mapExploreMapCanvas.innerHTML = "";
    mapExploreLeafletMap = L.map(mapExploreMapCanvas, {
      center: [Number(center.lat), Number(center.lon)],
      zoom,
      zoomControl: true,
      attributionControl: true,
      tap: true,
    });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap",
    }).addTo(mapExploreLeafletMap);
    bindMapExploreMoveEvents();
  } else if (recenter) {
    suppressMapExploreAutoLoad();
    mapExploreLeafletMap.setView([Number(center.lat), Number(center.lon)], zoom);
  }
  window.setTimeout(() => mapExploreLeafletMap?.invalidateSize?.(), 60);
  clearMapExploreMarkers();
  if (showCenterPin) {
    mapExploreLeafletMarkers.push(createMapExploreLeafletMarker(center, -1, "center"));
  }
  places.forEach((place, index) => {
    mapExploreLeafletMarkers.push(createMapExploreLeafletMarker(place, index, place.map_category || "default"));
  });
}

function createMapExploreLeafletMarker(place, index, categoryKey) {
  const isCenter = categoryKey === "center";
  const meta = isCenter
    ? { icon: "★", className: "center" }
    : MAP_EXPLORE_CATEGORY_META[categoryKey] || { icon: String(index + 1), className: "default" };
  const size = isCenter ? 44 : 34;
  const icon = L.divIcon({
    className: "map-explore-leaflet-icon",
    html: `<button class="map-explore-sdk-pin is-${escapeHtml(meta.className)}" type="button" aria-label="${escapeHtml(place.name || "지도 핀")}"><span>${escapeHtml(meta.icon)}</span></button>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
  const marker = L.marker([Number(place.lat), Number(place.lon)], {
    icon,
    title: place.name || "",
    keyboard: true,
  }).addTo(mapExploreLeafletMap);
  if (!isCenter) {
    marker.bindTooltip(place.name || "장소", { direction: "top", offset: [0, -12], opacity: 0.95 });
    marker.on("click", () => {
      const placeFromState = mapExploreState.places.find((item) => item.id === place.id && item.name === place.name) || place;
      recordRecentPlace(placeFromState);
      openBrowsePlaceDetail(placeFromState);
    });
  } else {
    marker.bindTooltip(place.name || "검색 장소", { direction: "top", offset: [0, -14], opacity: 0.95 });
  }
  return marker;
}

function createMapExploreMarker(place, index, categoryKey) {
  const meta = categoryKey === "center"
    ? { icon: "★", className: "center" }
    : MAP_EXPLORE_CATEGORY_META[categoryKey] || { icon: String(index + 1), className: "default" };
  const markerOptions = {
    position: new Tmapv2.LatLng(Number(place.lat), Number(place.lon)),
    map: mapExploreTmapMap,
    title: place.name || "",
    iconHTML: `<button class="map-explore-sdk-pin is-${meta.className}" type="button"><span>${escapeHtml(meta.icon)}</span></button>`,
  };
  if (Tmapv2.Size) markerOptions.iconSize = new Tmapv2.Size(categoryKey === "center" ? 44 : 34, categoryKey === "center" ? 44 : 34);
  const marker = new Tmapv2.Marker(markerOptions);
  if (marker.setIconHTML) marker.setIconHTML(markerOptions.iconHTML);
  if (categoryKey !== "center" && Tmapv2.Event?.addListener) {
    Tmapv2.Event.addListener(marker, "click", () => {
      const placeFromState = mapExploreState.places.find((item) => item.id === place.id && item.name === place.name) || place;
      recordRecentPlace(placeFromState);
      openBrowsePlaceDetail(placeFromState);
    });
  }
  return marker;
}

function renderMapExploreStaticFallback(center, places, showCenterPin) {
  const mapUrl = `${API_BASE_URL}/api/maps/static?lat=${encodeURIComponent(center.lat)}&lon=${encodeURIComponent(center.lon)}&zoom=${places.length ? 14 : 12}`;
  const staticPins = [
    showCenterPin ? `<button class="map-explore-pin is-center" style="left:50%;top:50%" type="button"><span>★</span></button>` : "",
    ...places.map((place, index) => {
      const point = projectMapExplorePoint(place, center, mapExploreState.radiusKm);
      const meta = MAP_EXPLORE_CATEGORY_META[place.map_category] || { icon: String(index + 1), className: "default" };
      return `<button class="map-explore-pin is-${escapeHtml(meta.className)}" style="left:${point.x}%;top:${point.y}%" type="button" data-map-place-index="${index}"><span>${escapeHtml(meta.icon)}</span></button>`;
    }),
  ].join("");
  mapExploreMapCanvas.innerHTML = `
    <div class="map-explore-map is-static">
      <img src="${mapUrl}" alt="${escapeHtml(`${center.name || "서울"} 주변 지도`)}" />
      <div class="map-explore-pins">${staticPins}</div>
    </div>
  `;
  mapExploreMapCanvas.querySelectorAll("[data-map-place-index]").forEach((button) => {
    button.addEventListener("click", () => {
      const place = places[Number(button.dataset.mapPlaceIndex)];
      if (place) {
        recordRecentPlace(place);
        openBrowsePlaceDetail(place);
      }
    });
  });
}

async function searchMapExplore(event) {
  event?.preventDefault();
  if (!mapExploreKeyword || !mapExploreStatus || !mapExploreResults) return;
  const keyword = mapExploreKeyword.value.trim();
  if (!keyword) {
    mapExploreStatus.textContent = "검색할 장소명을 입력해 주세요.";
    mapExploreKeyword.focus();
    return;
  }
  const selectedCategories = getSelectedMapExploreCategories();
  mapExploreState = {
    ...mapExploreState,
    keyword,
    categories: selectedCategories,
    loading: true,
  };
  mapExploreStatus.textContent = "주변 장소를 지도에 표시하는 중입니다...";
  mapExploreResults.innerHTML = '<p class="browse-loading">주변 장소를 불러오는 중...</p>';
  try {
    const query = new URLSearchParams({
      keyword,
      categories: selectedCategories.join(","),
      radius_km: String(mapExploreState.radiusKm || 2.5),
      count: "20",
    });
    const data = await requestJson(`/api/places/map-browse?${query.toString()}`, { timeoutMs: 15000 });
    const flatPlaces = (data.categories || []).flatMap((category) => category.places || []);
    mapExploreState = {
      keyword,
      center: data.center || null,
      radiusKm: Number(data.radius_km) || 2.5,
      categories: data.categories || [],
      places: flatPlaces.length ? flatPlaces : data.places || [],
      loading: false,
    };
    renderMapExploreResults();
  } catch (error) {
    mapExploreState.loading = false;
    mapExploreStatus.textContent = "주변 장소를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.";
    mapExploreResults.innerHTML = "";
  }
}

// ----- 지도 이동 시 자동으로 그 지역 장소 로드 -----
let mapExploreLastLoadCenter = null;
let mapExploreLastLoadRadiusKm = null;
let mapExploreMoveTimer = null;
let mapExploreAreaLoading = false;

function suppressMapExploreAutoLoad(durationMs = 900) {
  mapExploreAutoLoadSuppressUntil = Date.now() + durationMs;
}

function getMapExploreMapCenter() {
  try {
    if (mapExploreLeafletMap?.getCenter) {
      const c = mapExploreLeafletMap.getCenter();
      return { lat: c.lat, lon: c.lng };
    }
    if (mapExploreTmapMap?.getCenter) {
      const c = mapExploreTmapMap.getCenter();
      return { lat: c.lat(), lon: c.lng() };
    }
  } catch (_error) {
    /* 지도 미준비 */
  }
  return null;
}

function getMapExploreViewRadiusKm() {
  try {
    if (mapExploreLeafletMap?.getBounds) {
      const bounds = mapExploreLeafletMap.getBounds();
      const distM = mapExploreLeafletMap.distance(bounds.getCenter(), bounds.getNorthEast());
      return Math.max(0.6, Math.min(distM / 1000, 10));
    }
    if (mapExploreTmapMap?.getZoom) {
      const zoom = mapExploreTmapMap.getZoom();
      const approx = { 18: 0.6, 17: 1, 16: 1.6, 15: 2.5, 14: 4, 13: 7, 12: 10, 11: 10 };
      return approx[zoom] || 3;
    }
  } catch (_error) {
    /* 무시 */
  }
  return mapExploreState.radiusKm || 2.5;
}

function mapExploreDistanceM(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

function bindMapExploreMoveEvents() {
  const onMove = () => scheduleMapExploreAreaLoad();
  if (mapExploreLeafletMap && !mapExploreLeafletMap.__moveBound) {
    mapExploreLeafletMap.__moveBound = true;
    mapExploreLeafletMap.on("moveend", onMove);
  }
  const tmap = window.Tmapv2;
  if (mapExploreTmapMap && tmap?.Event?.addListener && !mapExploreTmapMap.__moveBound) {
    mapExploreTmapMap.__moveBound = true;
    tmap.Event.addListener(mapExploreTmapMap, "dragend", onMove);
    tmap.Event.addListener(mapExploreTmapMap, "zoom_changed", onMove);
  }
}

function scheduleMapExploreAreaLoad({ force = false } = {}) {
  if (Date.now() < mapExploreAutoLoadSuppressUntil) return;
  if (mapExploreAreaLoading || mapExploreDefaultLoading || mapExploreState.loading) return;
  if (!mapExploreView || mapExploreView.hidden) return;
  const center = getMapExploreMapCenter();
  if (!center) return;
  const radiusKm = getMapExploreViewRadiusKm();
  if (!force && mapExploreLastLoadCenter) {
    const moved = mapExploreDistanceM(center.lat, center.lon, mapExploreLastLoadCenter.lat, mapExploreLastLoadCenter.lon);
    const movedEnough = moved > Math.max(280, radiusKm * 1000 * 0.18);
    const radiusChanged = mapExploreLastLoadRadiusKm
      ? Math.abs(radiusKm - mapExploreLastLoadRadiusKm) / Math.max(mapExploreLastLoadRadiusKm, 0.5) > 0.22
      : false;
    if (!movedEnough && !radiusChanged) return;
  }
  window.clearTimeout(mapExploreMoveTimer);
  mapExploreMoveTimer = window.setTimeout(() => {
    loadMapExploreArea({ auto: true });
  }, force ? 0 : 800);
}

async function loadMapExploreArea({ auto = false } = {}) {
  const center = getMapExploreMapCenter();
  if (!center || !mapExploreStatus) return;
  if (mapExploreAreaLoading) return;
  const radiusKm = getMapExploreViewRadiusKm();
  const selectedCategories = getSelectedMapExploreCategories();
  mapExploreAreaLoading = true;
  mapExploreState.loading = true;
  mapExploreStatus.textContent = auto
    ? "현재 지도 화면의 장소를 자동으로 업데이트하는 중입니다..."
    : "지금 보고 있는 지역의 장소를 불러오는 중입니다...";
  try {
    const query = new URLSearchParams({
      categories: selectedCategories.join(","),
      radius_km: radiusKm.toFixed(1),
      count: "20",
      lat: String(center.lat),
      lon: String(center.lon),
    });
    const data = await requestJson(`/api/places/map-browse?${query.toString()}`, { timeoutMs: 15000 });
    const flatPlaces = (data.categories || []).flatMap((c) => c.places || []);
    mapExploreState = {
      keyword: "",
      center: data.center || { ...center, name: "이 지역", map_category: "area" },
      radiusKm: Number(data.radius_km) || radiusKm,
      categories: data.categories || [],
      places: flatPlaces.length ? flatPlaces : data.places || [],
      loading: false,
    };
    renderMapExploreResults({ recenter: false, showCenterPin: false });
  } catch (_error) {
    mapExploreStatus.textContent = "이 지역 장소를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.";
  } finally {
    mapExploreAreaLoading = false;
    mapExploreState.loading = false;
  }
}

function projectMapExplorePoint(place, center, radiusKm) {
  const lat = Number(place?.lat);
  const lon = Number(place?.lon);
  const centerLat = Number(center?.lat);
  const centerLon = Number(center?.lon);
  if (![lat, lon, centerLat, centerLon].every(Number.isFinite)) return { x: 50, y: 50 };
  const latSpan = Math.max(Number(radiusKm) || 2.5, 0.5) / 111;
  const lonSpan = latSpan / Math.max(Math.cos((centerLat * Math.PI) / 180), 0.25);
  const x = 50 + ((lon - centerLon) / lonSpan) * 42;
  const y = 50 - ((lat - centerLat) / latSpan) * 42;
  return {
    x: Math.min(94, Math.max(6, x)),
    y: Math.min(94, Math.max(6, y)),
  };
}

function renderMapExploreResults(options = {}) {
  if (!mapExploreStatus || !mapExploreResults) return;
  const { center, places, categories } = mapExploreState;
  // 좌표 기반 지도 자동 갱신이면 별 핀·지도 재중심 없이 마커만 갱신한다.
  const isArea = center?.map_category === "area";
  const recenter = options.recenter ?? !isArea;
  const showCenterPin = options.showCenterPin ?? !isArea;
  if (!center) {
    mapExploreStatus.textContent = "검색 결과를 찾지 못했습니다. 다른 장소명으로 다시 검색해 주세요.";
    mapExploreResults.innerHTML = "";
    return;
  }
  const flatPlaces = (categories || []).flatMap((category) => category.places || []);
  const visiblePlaces = flatPlaces.length ? flatPlaces : places;
  const categorySummary = (categories || [])
    .map((category) => `${category.label} ${category.places?.length || 0}`)
    .join(" · ");
  mapExploreStatus.textContent = isArea
    ? `지금 보고 있는 지역에서 ${visiblePlaces.length}곳을 찾았어요.${categorySummary ? ` (${categorySummary})` : ""}`
    : `${center.name} 주변 ${visiblePlaces.length}곳을 찾았습니다.${categorySummary ? ` (${categorySummary})` : ""}`;
  renderMapExploreMap({ center, places: visiblePlaces, showCenterPin, recenter });

  const groupedCards = (categories || [])
    .map((category) => {
      const cards = (category.places || [])
        .map((place) => {
          const globalIndex = visiblePlaces.findIndex((item) => item.id === place.id && item.name === place.name);
          const distance = Number(place.distance_m);
          const distanceText = Number.isFinite(distance) ? (distance >= 1000 ? `${(distance / 1000).toFixed(1)}km` : `${Math.round(distance)}m`) : "";
          return `
            <button class="map-explore-place-card" type="button" data-map-place-index="${globalIndex}">
              <span class="map-explore-card-badge">${escapeHtml(category.label)}</span>
              <strong>${escapeHtml(place.name)}</strong>
              <small>${escapeHtml([distanceText, place.category || place.source_category, place.address].filter(Boolean).join(" · "))}</small>
            </button>
          `;
        })
        .join("");
      return `
        <section class="map-explore-group">
          <h2>${escapeHtml(category.label)}</h2>
          ${cards || '<p class="browse-loading">이 필터의 주변 장소를 찾지 못했습니다.</p>'}
        </section>
      `;
    })
    .join("");

  mapExploreResults.innerHTML = `
    <section class="map-explore-center-card">
        <span>${isArea ? "지금 보는 지역" : "검색 장소"}</span>
        <strong>${escapeHtml(isArea ? "이 지역의 장소" : center.name)}</strong>
        <small>${escapeHtml(isArea ? "지도를 움직이면 현재 보이는 지역의 장소가 자동으로 갱신돼요." : (center.address || "선택한 장소를 중심으로 주변 장소를 표시합니다."))}</small>
    </section>
    <section class="map-explore-list">${groupedCards}</section>
  `;

  mapExploreResults.querySelectorAll("[data-map-place-index]").forEach((button) => {
    button.addEventListener("click", () => {
      const index = Number(button.dataset.mapPlaceIndex);
      const place = visiblePlaces[index];
      if (place) {
        recordRecentPlace(place);
        openBrowsePlaceDetail(place);
      }
    });
  });
  // 방금 로드한 지도 중심/반경을 기억해 작은 흔들림에는 자동 재호출하지 않는다.
  if (center) mapExploreLastLoadCenter = { lat: Number(center.lat), lon: Number(center.lon) };
  mapExploreLastLoadRadiusKm = mapExploreState.radiusKm || getMapExploreViewRadiusKm();
}

async function openBrowseView(category) {
  showPortalView("browse");
  currentBrowseCategory = category;
  currentBrowsePlaces = [];
  currentBrowseNextOffset = 0;
  currentBrowseHasMore = false;
  const regionLabel = getRegionSelectionMeta(selectedBrowseRegion)?.label || "전국";
  const browseTopLimit = getBrowseTopLimit();
  // 지역 라벨이 "...전체"로 끝나면(시도/시군구 전체 선택) 카테고리 "전체"와 겹쳐 "전체 전체"가 되므로 라벨의 끝 "전체"를 떼고
  // 카테고리를 붙인다. (예: "서울 강남구 전체" + "전체" → "서울 강남구 전체", + "음식점" → "서울 강남구 음식점")
  const titleRegion = selectedBrowseRegion === "national" ? "대한민국" : regionLabel.replace(/\s*전체$/, "");
  browseTitle.textContent = `${titleRegion} ${category} Top ${browseTopLimit}`;
  const cachedBrowse = loadBrowseClientCache(category, selectedBrowseRegion);
  if (cachedBrowse?.places?.length) {
    currentBrowsePlaces = cachedBrowse.places.slice(0, browseTopLimit);
    currentBrowseNextOffset = Number(cachedBrowse.next_offset ?? cachedBrowse.places.length);
    currentBrowseHasMore = Boolean(cachedBrowse.has_more) && currentBrowsePlaces.length < browseTopLimit;
    renderBrowsePlaces(currentBrowsePlaces, { refreshing: true });
  } else {
    browsePlaceList.innerHTML = "<p class=\"browse-loading\">장소를 불러오는 중입니다.</p>";
  }
  await loadBrowsePage(0);
}

async function loadBrowsePage(offset = 0) {
  if (currentBrowseLoading) return;
  const browseTopLimit = getBrowseTopLimit();
  if (offset >= browseTopLimit) {
    currentBrowseHasMore = false;
    renderBrowsePlaces(currentBrowsePlaces);
    return;
  }
  currentBrowseLoading = true;
  try {
    const region = getRegionSelectionMeta(selectedBrowseRegion) || REGION_CENTERS.national;
    const queryParams = {
      category: currentBrowseCategory,
      region: selectedBrowseRegion,
      region_key: selectedBrowseRegion,
      area_label: region.label || "전국",
      count: String(Math.min(BROWSE_PAGE_SIZE, browseTopLimit - offset)),
      offset: String(offset),
    };
    if (selectedBrowseRegion !== "national") {
      queryParams.lat = String(region.lat || REGION_CENTERS.seoul.lat);
      queryParams.lon = String(region.lon || REGION_CENTERS.seoul.lon);
    }
    const query = new URLSearchParams({
      ...queryParams,
    });
    const data = await requestJson(`/api/places/browse?${query}`, { timeoutMs: 15000 });
    currentBrowsePlaces = (offset === 0 ? data.places || [] : [...currentBrowsePlaces, ...(data.places || [])])
      .slice(0, browseTopLimit);
    currentBrowseNextOffset = Number(data.next_offset ?? currentBrowsePlaces.length);
    currentBrowseHasMore = Boolean(data.has_more) && currentBrowsePlaces.length < browseTopLimit;
    if (offset === 0) saveBrowseClientCache(currentBrowseCategory, selectedBrowseRegion, data);
    renderBrowsePlaces(currentBrowsePlaces);
  } catch (error) {
    if (!currentBrowsePlaces.length) {
      browsePlaceList.innerHTML = `<p class="browse-loading">장소 목록을 불러오지 못했습니다: ${escapeHtml(error.message)}</p>`;
    }
  } finally {
    currentBrowseLoading = false;
  }
}

async function savePreviewRecommendation(courseId, options = {}) {
  if (!getAuthToken()) {
    pendingPreviewSaveCourseId = courseId;
    pendingRecommendationAccess = false;
    showPortalView("login");
    return;
  }
  showPortalView("recommendation");
  showRecommendationStep("results");
  resultSummary.textContent = "미리보기 코스를 저장하는 중입니다.";
  try {
    const query = new URLSearchParams({
      transport: options.transport || "transit",
      overnight: String(options.overnight ?? false),
      include_food: String(options.include_food ?? true),
      include_cafe: String(options.include_cafe ?? true),
      include_dinner: String(options.include_dinner ?? false),
      include_bar: String((options.overnight ?? false) && (options.include_bar ?? false)),
    });
    const course = await requestJson(`/api/courses/preview/${encodeURIComponent(courseId)}?${query}`);
    saveCourse(course);
  } catch (error) {
    resultSummary.textContent = `미리보기 코스 저장 실패: ${readApiError(error.message)}`;
  }
}

function getBrowseClientCacheStore() {
  try {
    return JSON.parse(localStorage.getItem(BROWSE_CACHE_KEY) || "{}");
  } catch (_error) {
    return {};
  }
}

function browseClientCacheKey(category, region) {
  return `${region || "all"}::${category || ""}`;
}

function getBrowseTopLimit(region = selectedBrowseRegion) {
  return region === "national" ? BROWSE_TOP_LIMIT : BROWSE_REGION_TOP_LIMIT;
}

function loadBrowseClientCache(category, region) {
  const cached = getBrowseClientCacheStore()[browseClientCacheKey(category, region)];
  if (!cached || !Array.isArray(cached.places)) return null;
  if (Date.now() - Number(cached.fetched_at || 0) > BROWSE_CLIENT_CACHE_TTL_MS) return null;
  return cached;
}

function saveBrowseClientCache(category, region, data) {
  try {
    const store = getBrowseClientCacheStore();
    store[browseClientCacheKey(category, region)] = {
      fetched_at: Date.now(),
      places: (data.places || []).slice(0, getBrowseTopLimit(region)),
      next_offset: data.next_offset,
      has_more: Boolean(data.has_more) && (data.places || []).length < getBrowseTopLimit(region),
    };
    localStorage.setItem(BROWSE_CACHE_KEY, JSON.stringify(store));
  } catch (_error) {
    // Cache is only a speed boost; ignore storage failures.
  }
}

function persistCurrentBrowseCache() {
  if (!currentBrowseCategory || !currentBrowsePlaces.length) return;
  saveBrowseClientCache(currentBrowseCategory, selectedBrowseRegion, {
    places: currentBrowsePlaces,
    next_offset: currentBrowseNextOffset,
    has_more: currentBrowseHasMore,
  });
}

function renderBrowsePlaces(places, options = {}) {
  if (!places.length) {
    const canWidenRegion = false;
    browsePlaceList.innerHTML = `
      <div class="browse-empty-state">
        <p class="browse-loading">\uD45C\uC2DC\uD560 \uC7A5\uC18C\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.</p>
        ${canWidenRegion ? '<button class="secondary-button compact-button" type="button" data-browse-all-region>선택 도시로 다시 보기</button>' : ""}
      </div>
    `;
    browsePlaceList.querySelector("[data-browse-all-region]")?.addEventListener("click", () => {
      selectedBrowseRegion = "seoul";
      recommendRegion.value = "seoul";
      updateRecommendRegionButton();
      document.querySelectorAll("[data-region]").forEach((button) => {
        button.classList.toggle("selected", button.dataset.region === "seoul");
      });
      openBrowseView(currentBrowseCategory);
    });
    return;
  }
  const refreshNotice = options.refreshing
    ? '<p class="browse-refreshing">저장된 장소를 먼저 보여드리고, 최신 리뷰순으로 업데이트 중입니다.</p>'
    : "";
  browsePlaceList.innerHTML = refreshNotice + places
    .map(
      (place, index) => {
        const bookmarked = isBookmarked(place);
        const bookmarkLabel = bookmarked ? `${place.name} 찜 취소` : `${place.name} 찜하기`;
        return `
        <article class="browse-place-card" data-browse-place-index="${index}" role="button" tabindex="0">
          <div class="browse-place-main">
            <div class="browse-place-media" aria-hidden="true">
              <small class="browse-place-rank">${String(index + 1).padStart(2, "0")}</small>
              ${renderBrowseCardPhoto(place)}
            </div>
            <div class="browse-place-content">
              <h3>${escapeHtml(place.name)}</h3>
              <p>${escapeHtml(translatePlaceCategory(place.source_category || place.category || "추천 장소"))}</p>
              <div class="browse-place-badges">
                ${renderNaverReviewRankBadge(place)}
                <span data-browse-review-count>${renderBrowseReviewCount(place)}</span>
                <span data-browse-opening-status>${renderPlaceOpeningStatus(place, { showUnknown: true })}</span>
              </div>
            </div>
            <div class="browse-place-actions">
              <button class="browse-bookmark-button${bookmarked ? " selected" : ""}" type="button" data-bookmark-place aria-label="${escapeHtml(bookmarkLabel)}" title="${bookmarked ? "찜 취소" : "찜하기"}">${bookmarked ? "♥" : "♡"}</button>
              <a class="browse-naver-search-button" href="${buildNaverPlaceSearchUrl(place.name)}" target="_blank" rel="noopener noreferrer" data-naver-place-search aria-label="${escapeHtml(`${place.name} 네이버 검색`)}" title="네이버에서 검색">
                <span aria-hidden="true">&#128269;</span>
              </a>
            </div>
          </div>
        </article>
      `;
      },
    )
    .join("") + (currentBrowseHasMore
      ? `<button class="browse-load-more-button" type="button" data-load-more-places>더 보기</button>`
      : "");
  browsePlaceList.querySelectorAll("[data-browse-place-index]").forEach((card) => {
    const place = places[Number(card.dataset.browsePlaceIndex)];
    card.addEventListener("click", () => {
      recordRecentPlace(place);
      openBrowsePlaceDetail(place);
    });
    card.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      recordRecentPlace(place);
      openBrowsePlaceDetail(place);
    });
    card.querySelector("[data-naver-place-search]").addEventListener("click", (event) => event.stopPropagation());
    card.querySelectorAll("[data-google-maps-link]").forEach((link) => {
      link.addEventListener("click", (event) => event.stopPropagation());
    });
    card.querySelector("[data-bookmark-place]").addEventListener("click", (event) => {
      event.stopPropagation();
      toggleBookmark(place);
      recordRecentPlace(place);
      renderBrowsePlaces(places);
    });
  });
  browsePlaceList.querySelector("[data-load-more-places]")?.addEventListener("click", () => {
    const button = browsePlaceList.querySelector("[data-load-more-places]");
    button.disabled = true;
    button.classList.add("loading");
    button.innerHTML = '<span class="load-more-spinner" aria-hidden="true"></span><span>로딩 중</span>';
    loadBrowsePage(currentBrowseNextOffset);
  });
  observeBrowseOpeningStatuses(places);
  enrichMissingBrowsePhotos(places).catch(() => { });
}

function observeBrowseOpeningStatuses(places) {
  browseOpeningHoursObserver?.disconnect();
  browseOpeningHoursObserver = null;
  const cards = browsePlaceList.querySelectorAll("[data-browse-place-index]");
  if (!cards.length) return;

  const hydrateCard = async (card) => {
    const place = places[Number(card.dataset.browsePlaceIndex)];
    const statusBox = card.querySelector("[data-browse-opening-status]");
    const reviewBox = card.querySelector("[data-browse-review-count]");
    if (!place || !statusBox || place.open_now !== undefined) return;
    statusBox.innerHTML = '<span class="opening-status is-unknown opening-status-loading">영업시간 확인 중</span>';
    try {
      const previousReviewCount = Number(place.google_review_count) || 0;
      await getPlacePhotoMetadata(place);
      if (!card.isConnected) return;
      if (reviewBox) reviewBox.innerHTML = renderBrowseReviewCount(place);
      statusBox.innerHTML = renderPlaceOpeningStatus(place, { showUnknown: true });
      reviewBox?.querySelectorAll("[data-google-maps-link]").forEach((link) => {
        link.addEventListener("click", (event) => event.stopPropagation());
      });
      persistCurrentBrowseCache();
      if ((Number(place.google_review_count) || 0) !== previousReviewCount) {
        scheduleBrowseReviewSort();
      }
    } catch (_error) {
      if (card.isConnected) {
        statusBox.innerHTML = '<span class="opening-status is-unknown">상세에서 영업시간 확인</span>';
      }
    }
  };

  if (!("IntersectionObserver" in window)) {
    cards.forEach((card) => hydrateCard(card));
    return;
  }

  browseOpeningHoursObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      observer.unobserve(entry.target);
      hydrateCard(entry.target);
    });
  }, { rootMargin: "350px 0px" });
  cards.forEach((card) => browseOpeningHoursObserver.observe(card));
}

function scheduleBrowseReviewSort() {
  window.clearTimeout(browseReviewSortTimer);
  browseReviewSortTimer = window.setTimeout(() => {
    const before = currentBrowsePlaces.map((place) => place.id || `${place.name}|${place.lat}|${place.lon}`).join("::");
    currentBrowsePlaces.sort((left, right) => (
      (Number(right.google_review_count) || 0) - (Number(left.google_review_count) || 0)
      || (Number(left.naver_popularity_rank) || 999) - (Number(right.naver_popularity_rank) || 999)
      || (Number(right.google_rating) || 0) - (Number(left.google_rating) || 0)
      || String(left.name || "").localeCompare(String(right.name || ""), "ko")
    ));
    const after = currentBrowsePlaces.map((place) => place.id || `${place.name}|${place.lat}|${place.lon}`).join("::");
    if (before === after) return;
    renderBrowsePlaces(currentBrowsePlaces);
    persistCurrentBrowseCache();
  }, 300);
}

function renderBrowseReviewCount(place) {
  if (!Number(place.google_review_count)) return "";
  return `<a class="google-review-badge" href="${escapeHtml(place.google_maps_uri || "#")}" target="_blank" rel="noopener noreferrer" data-google-maps-link>리뷰 ${Number(place.google_review_count).toLocaleString("ko-KR")}개</a>`;
}

function getBrowseCardPhotoUrl(place) {
  if (place?.naver_image_thumbnail) return place.naver_image_thumbnail;
  if (place?.photo_url) return place.photo_url;
  if (place?.google_photo_name) return buildGooglePhotoUrl(place.google_photo_name, 360, 260);
  return "";
}

function renderBrowseCardPhoto(place) {
  const photoUrl = getBrowseCardPhotoUrl(place);
  return `
    <span class="browse-place-photo-frame${photoUrl ? " has-photo" : ""}" data-browse-card-photo-slot>
      ${photoUrl
      ? `<img class="browse-place-photo" src="${escapeHtml(photoUrl)}" alt="${escapeHtml(`${place.name} 장소 사진`)}" loading="lazy" />`
      : '<span class="browse-place-photo-placeholder" aria-hidden="true">Photo</span>'}
    </span>
  `;
}

function closeBrowsePlaceDetailModal() {
  if (!browsePlaceDetailModal) return;
  browsePlaceDetailModal.hidden = true;
  browsePlaceDetailBody.innerHTML = "";
  activeBrowseDetailPlace = null;
  placeReviewImages = [];
}

function renderBrowseDetailPhotoPlaceholder(message = "사진을 불러오는 중입니다.") {
  return `<div class="browse-detail-photo-placeholder">${escapeHtml(message)}</div>`;
}

function renderBrowseDetailPhoto(place) {
  const naverPhoto = place.naver_image_link || place.naver_image_thumbnail;
  const naverFallbackPhoto = place.naver_image_thumbnail || "";
  const tourPhoto = place.photo_url;
  const googlePhoto = place.google_photo_name ? buildGooglePhotoUrl(place.google_photo_name, 900, 620) : "";
  const photoUrl = naverPhoto || tourPhoto || googlePhoto;
  if (!photoUrl) return renderBrowseDetailPhotoPlaceholder("사진을 불러오는 중입니다.");

  const credit = naverPhoto
    ? buildNaverImageCredit(place)
    : tourPhoto
      ? `${escapeHtml(place.photo_source || "한국관광공사 포토코리아")}${place.photo_credit ? ` · ${escapeHtml(place.photo_credit)}` : ""}`
      : place.google_photo_attribution_name
        ? `Google Maps · <a href="${escapeHtml(place.google_photo_attribution_uri || place.google_maps_uri || "#")}" target="_blank" rel="noopener noreferrer" data-google-maps-link>${escapeHtml(place.google_photo_attribution_name)}</a>`
        : "Google Maps";

  return `
    <img src="${escapeHtml(photoUrl)}" alt="${escapeHtml(`${place.name} 장소 사진`)}" loading="eager" data-detail-photo-fallback="${escapeHtml(naverFallbackPhoto)}" />
    <span class="browse-photo-credit">${credit}</span>
  `;
}

function collectPlacePhotoItems(place) {
  const items = [];
  const seen = new Set();
  const add = (url, sourceHtml, fallbackUrl = "") => {
    if (!url || seen.has(url)) return;
    seen.add(url);
    items.push({ url, sourceHtml, fallbackUrl });
  };
  (place.google_photos || []).forEach((photo) => {
    add(
      buildGooglePhotoUrl(photo.name, 960, 640),
      photo.attribution_name
        ? `Google Maps · <a href="${escapeHtml(photo.attribution_uri || place.google_maps_uri || "#")}" target="_blank" rel="noopener noreferrer" data-google-maps-link>${escapeHtml(photo.attribution_name)}</a>`
        : "Google Maps",
    );
  });
  if (place.google_photo_name) {
    add(
      buildGooglePhotoUrl(place.google_photo_name, 960, 640),
      place.google_photo_attribution_name
        ? `Google Maps · <a href="${escapeHtml(place.google_photo_attribution_uri || place.google_maps_uri || "#")}" target="_blank" rel="noopener noreferrer" data-google-maps-link>${escapeHtml(place.google_photo_attribution_name)}</a>`
        : "Google Maps",
    );
  }
  if (place.photo_url) {
    add(
      place.photo_url,
      `${escapeHtml(place.photo_source || "한국관광공사")}${place.photo_credit ? ` · ${escapeHtml(place.photo_credit)}` : ""}`,
    );
  }
  (place.naver_images || []).forEach((photo) => {
    add(photo.naver_image_thumbnail || photo.naver_image_link, buildNaverImageCredit({ ...place, ...photo }), photo.naver_image_thumbnail || "");
  });
  if (place.naver_image_thumbnail || place.naver_image_link) {
    add(place.naver_image_thumbnail || place.naver_image_link, buildNaverImageCredit(place), place.naver_image_thumbnail || "");
  }
  return items.slice(0, 6);
}

function renderBrowseDetailPhoto(place) {
  const photos = collectPlacePhotoItems(place);
  if (!photos.length) return renderBrowseDetailPhotoPlaceholder("?ъ쭊??遺덈윭?ㅻ뒗 以묒엯?덈떎.");
  return `
    <div class="browse-detail-photo-gallery count-${photos.length}">
      ${photos.map((photo, index) => `
        <figure class="browse-detail-photo-item">
          <img src="${escapeHtml(photo.url)}" alt="${escapeHtml(`${place.name} 장소 사진 ${index + 1}`)}" loading="${index === 0 ? "eager" : "lazy"}" data-detail-photo-fallback="${escapeHtml(photo.fallbackUrl || "")}" />
          ${index === 0 ? `<figcaption class="browse-photo-credit">${photo.sourceHtml || "사진"}</figcaption>` : ""}
        </figure>
      `).join("")}
    </div>
  `;
}

function formatPlaceDistance(meters) {
  const value = Number(meters);
  if (!Number.isFinite(value) || value <= 0) return "";
  return value >= 1000 ? `${(value / 1000).toFixed(1)}km` : `${Math.round(value)}m`;
}

function renderPlaceDetailInfo(place, loading = false) {
  const subway = place.nearby_subway_station || null;
  const subwayText = subway?.name
    ? `${subway.name}${formatPlaceDistance(subway.distance_m) ? ` · ${formatPlaceDistance(subway.distance_m)}` : ""}`
    : (loading ? "근처 지하철역 확인 중" : "근처 지하철역 정보 없음");
  const phone = place.phone || place.national_phone_number || place.international_phone_number || "";
  const rows = [
    { label: "상세 주소", value: place.address || (loading ? "주소 확인 중" : "주소 정보 없음") },
    { label: "근처 지하철역", value: subwayText, link: subway?.google_maps_uri || "" },
    { label: "전화번호", value: phone || (loading ? "전화번호 확인 중" : "전화번호 정보 없음"), href: phone ? `tel:${String(phone).replace(/[^\d+]/g, "")}` : "" },
  ];
  return `
    <section class="browse-detail-info" data-browse-detail-info>
      ${rows.map((row) => `
        <div class="browse-detail-info-row">
          <span>${escapeHtml(row.label)}</span>
          ${row.href
      ? `<a href="${escapeHtml(row.href)}">${escapeHtml(row.value)}</a>`
      : row.link
        ? `<a href="${escapeHtml(row.link)}" target="_blank" rel="noopener noreferrer" data-google-maps-link>${escapeHtml(row.value)}</a>`
        : `<b>${escapeHtml(row.value)}</b>`}
        </div>
      `).join("")}
    </section>
  `;
}

async function loadBrowseDetailInfo(place) {
  const infoBox = browsePlaceDetailBody.querySelector("[data-browse-detail-info]");
  if (!infoBox) return;
  try {
    await getPlacePhotoMetadata(place, { includeDetails: true });
    if (!infoBox.isConnected) return;
    infoBox.outerHTML = renderPlaceDetailInfo(place, false);
    const photoBox = browsePlaceDetailBody.querySelector("[data-browse-detail-photo]");
    if (photoBox?.isConnected && collectPlacePhotoItems(place).length) {
      photoBox.innerHTML = renderBrowseDetailPhoto(place);
      armBrowseDetailPhotoFallback(photoBox);
    }
    browsePlaceDetailBody.querySelectorAll("[data-google-maps-link]").forEach((link) => {
      link.addEventListener("click", (event) => event.stopPropagation());
    });
    persistCurrentBrowseCache();
  } catch (_error) {
    if (infoBox.isConnected) infoBox.outerHTML = renderPlaceDetailInfo(place, false);
  }
}

function armBrowseDetailPhotoFallback(photoBox) {
  const detailImage = photoBox?.querySelector("img[data-detail-photo-fallback]");
  if (!detailImage) return;
  detailImage.addEventListener("error", () => {
    const fallbackUrl = detailImage.dataset.detailPhotoFallback;
    if (!fallbackUrl || detailImage.dataset.fallbackApplied === "true") return;
    detailImage.dataset.fallbackApplied = "true";
    detailImage.src = fallbackUrl;
  });
}

async function loadBrowseDetailPhoto(place) {
  const photoBox = browsePlaceDetailBody.querySelector("[data-browse-detail-photo]");
  if (!photoBox) return;
  try {
    photoBox.innerHTML = renderBrowseDetailPhotoPlaceholder("네이버에서 장소 사진을 찾는 중입니다.");
    const naverPhoto = await getNaverImageMetadata(place);
    if (!naverPhoto?.naver_image_thumbnail && !place.photo_url && !place.google_photo_name) {
      await getPlacePhotoMetadata(place);
    }
    if (!photoBox.isConnected) return;
    const hasPhoto = collectPlacePhotoItems(place).length > 0;
    photoBox.innerHTML = hasPhoto ? renderBrowseDetailPhoto(place) : renderBrowseDetailPhotoPlaceholder("사진을 찾지 못했습니다.");
    armBrowseDetailPhotoFallback(photoBox);
    photoBox.querySelectorAll("[data-google-maps-link]").forEach((link) => {
      link.addEventListener("click", (event) => event.stopPropagation());
    });
    persistCurrentBrowseCache();
  } catch (_error) {
    if (photoBox.isConnected) photoBox.innerHTML = renderBrowseDetailPhotoPlaceholder("사진을 불러오지 못했습니다.");
  }
}

function openBrowsePlaceDetail(place, options = {}) {
  if (!place || !browsePlaceDetailModal) return;
  activeBrowseDetailPlace = place;
  const allowRecommendation = options.allowRecommendation !== false;
  const category = translatePlaceCategory(place.source_category || place.category || "장소");
  const bookmarked = isBookmarked(place);
  const reviewText = place.google_review_count
    ? `리뷰 ${Number(place.google_review_count).toLocaleString("ko-KR")}개`
    : "리뷰 정보 준비 중";
  const lat = Number(place.lat) || GANGNEUNG_CENTER.lat;
  const lon = Number(place.lon) || GANGNEUNG_CENTER.lon;
  const mapUrl = `${API_BASE_URL}/api/maps/static?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}&zoom=15`;

  browsePlaceDetailTitle.textContent = place.name;
  browsePlaceDetailSummary.textContent = `${category} · ${reviewText}`;
  browsePlaceDetailBody.innerHTML = `
    <div class="browse-detail-visuals">
      <div class="browse-detail-map">
        <img src="${mapUrl}" alt="${escapeHtml(`${place.name} TMAP 지도`)}" />
        <div class="browse-detail-map-pin" aria-label="${escapeHtml(`${place.name} 위치`)}">
          <b></b>
          <span>${escapeHtml(place.name)}</span>
        </div>
      </div>
      <div class="browse-detail-photo" data-browse-detail-photo>
        ${renderBrowseDetailPhotoPlaceholder("네이버에서 장소 사진을 찾는 중입니다.")}
      </div>
    </div>
    <div class="browse-detail-meta">
      <span>${escapeHtml(category)}</span>
      ${renderNaverReviewRankBadge(place)}
      ${place.google_review_count ? `<a class="google-review-badge" href="${escapeHtml(place.google_maps_uri || "#")}" target="_blank" rel="noopener noreferrer" data-google-maps-link>${escapeHtml(reviewText)}</a>` : ""}
    </div>
    <p class="browse-detail-description">
      ${escapeHtml(`${place.name}은(는) ${category}로 분류되는 장소입니다.${place.address ? ` 위치: ${place.address}` : ""}`)}
    </p>
    ${renderPlaceDetailInfo(place, true)}
    <section class="browse-detail-hours" data-browse-detail-hours>
      ${renderPlaceOpeningHours(place)}
    </section>
    <div class="browse-detail-actions">
      <button class="browse-detail-bookmark-button icon-bookmark-button${bookmarked ? " selected" : ""}" type="button" data-browse-detail-bookmark aria-label="${bookmarked ? "찜 취소" : "찜하기"}" title="${bookmarked ? "찜 취소" : "찜하기"}">${bookmarked ? "♥" : "♡"}</button>
      <a class="browse-detail-search-button" href="${buildNaverPlaceSearchUrl(place.name)}" target="_blank" rel="noopener noreferrer" data-google-maps-link>네이버 검색</a>
      ${allowRecommendation ? '<button class="browse-detail-recommend-button" type="button" data-browse-detail-recommend>이 장소로 코스 추천받기</button>' : ""}
    </div>
  `;
  browsePlaceDetailModal.hidden = false;
  browsePlaceDetailBody.insertAdjacentHTML("beforeend", renderPlaceReviewPanel());
  loadBrowseDetailPhoto(place);
  loadBrowseDetailInfo(place);
  loadBrowseDetailOpeningHours(place);
  bindPlaceReviewForm(place);
  loadPlaceReviews(place);

  browsePlaceDetailBody.querySelector("[data-browse-detail-bookmark]")?.addEventListener("click", () => {
    toggleBookmark(place);
    recordRecentPlace(place);
    openBrowsePlaceDetail(place, options);
    renderBrowsePlaces(currentBrowsePlaces);
  });
  browsePlaceDetailBody.querySelector("[data-browse-detail-recommend]")?.addEventListener("click", () => {
    closeBrowsePlaceDetailModal();
    recordRecentPlace(place);
    recommendFromBrowsePlace(place);
  });
  browsePlaceDetailBody.querySelectorAll("[data-google-maps-link]").forEach((link) => {
    link.addEventListener("click", (event) => event.stopPropagation());
  });
}

function renderPlaceReviewPanel() {
  return `
    <section class="place-review-panel" data-place-review-panel>
      <div class="place-review-head">
        <div>
          <strong>RecoDate 리뷰</strong>
          <small>우리 앱 사용자들이 남긴 장소 후기입니다.</small>
        </div>
        <span data-place-review-summary>불러오는 중...</span>
      </div>
      <form class="place-review-form" data-place-review-form>
        <div class="place-review-stars" role="radiogroup" aria-label="별점 선택">
          ${[1, 2, 3, 4, 5].map((rating) => `<button type="button" data-place-review-star="${rating}" aria-label="${rating}점">☆</button>`).join("")}
        </div>
        <textarea data-place-review-content maxlength="500" rows="3" placeholder="이 장소에서 좋았던 점을 남겨주세요."></textarea>
        <div class="place-review-photo-tools">
          <button class="secondary-button compact-button" type="button" data-place-review-pick-photo>사진 추가</button>
          <small>최대 4장까지 첨부할 수 있어요.</small>
          <input type="file" accept="image/*" multiple hidden data-place-review-photo-input />
        </div>
        <div class="place-review-photo-preview" data-place-review-photo-preview></div>
        <label class="place-review-share">
          <input type="checkbox" data-place-review-share />
          <span>커뮤니티 피드에도 올리기</span>
        </label>
        <div class="place-review-form-actions">
          <span data-place-review-message></span>
          <button class="primary-button compact-button" type="submit">리뷰 등록</button>
        </div>
      </form>
      <div class="place-review-list" data-place-review-list>
        <p class="browse-loading">리뷰를 불러오는 중입니다.</p>
      </div>
    </section>
  `;
}

function placeReviewPayload(place) {
  return {
    place_id: String(place.id || ""),
    place_name: String(place.name || ""),
    place_category: String(place.source_category || place.category || ""),
    address: String(place.address || ""),
    lat: Number.isFinite(Number(place.lat)) ? Number(place.lat) : null,
    lon: Number.isFinite(Number(place.lon)) ? Number(place.lon) : null,
  };
}

function placeReviewQuery(place) {
  const payload = placeReviewPayload(place);
  const params = new URLSearchParams({
    place_id: payload.place_id,
    place_name: payload.place_name,
  });
  if (payload.lat !== null) params.set("lat", String(payload.lat));
  if (payload.lon !== null) params.set("lon", String(payload.lon));
  return params.toString();
}

function paintPlaceReviewStars(panel, rating = 0) {
  panel.querySelectorAll("[data-place-review-star]").forEach((button) => {
    const value = Number(button.dataset.placeReviewStar);
    button.classList.toggle("selected", value <= rating);
    button.textContent = value <= rating ? "★" : "☆";
  });
}

function bindPlaceReviewForm(place) {
  const panel = browsePlaceDetailBody.querySelector("[data-place-review-panel]");
  const form = panel?.querySelector("[data-place-review-form]");
  if (!panel || !form) return;
  placeReviewImages = [];
  panel.dataset.selectedRating = "5";
  paintPlaceReviewStars(panel, 5);
  panel.querySelectorAll("[data-place-review-star]").forEach((button) => {
    button.addEventListener("click", () => {
      panel.dataset.selectedRating = button.dataset.placeReviewStar;
      paintPlaceReviewStars(panel, Number(panel.dataset.selectedRating));
    });
  });
  panel.querySelector("[data-place-review-pick-photo]")?.addEventListener("click", () => {
    panel.querySelector("[data-place-review-photo-input]")?.click();
  });
  panel.querySelector("[data-place-review-photo-input]")?.addEventListener("change", handlePlaceReviewImageSelection);
  form.addEventListener("submit", (event) => submitPlaceReview(event, place));
}

async function handlePlaceReviewImageSelection(event) {
  const files = Array.from(event.target.files || []);
  event.target.value = "";
  const panel = browsePlaceDetailBody.querySelector("[data-place-review-panel]");
  const message = panel?.querySelector("[data-place-review-message]");
  if (!files.length) return;
  try {
    const dataUrls = await Promise.all(files.map(resizeImageToDataUrl));
    placeReviewImages = [...placeReviewImages, ...dataUrls].slice(0, 4);
    if (message) message.textContent = "";
    renderPlaceReviewImagePreview();
  } catch (error) {
    if (message) message.textContent = readApiError(error.message || error);
  }
}

function renderPlaceReviewImagePreview() {
  const preview = browsePlaceDetailBody.querySelector("[data-place-review-photo-preview]");
  if (!preview) return;
  preview.innerHTML = placeReviewImages
    .map((src, index) => `
      <span class="place-review-photo-thumb">
        <img src="${src}" alt="리뷰 첨부 사진 미리보기" />
        <button type="button" data-place-review-remove-photo="${index}" aria-label="사진 제거">&times;</button>
      </span>
    `)
    .join("");
  preview.querySelectorAll("[data-place-review-remove-photo]").forEach((button) => {
    button.addEventListener("click", () => {
      placeReviewImages.splice(Number(button.dataset.placeReviewRemovePhoto), 1);
      renderPlaceReviewImagePreview();
    });
  });
}

async function loadPlaceReviews(place) {
  const panel = browsePlaceDetailBody.querySelector("[data-place-review-panel]");
  const list = panel?.querySelector("[data-place-review-list]");
  const summary = panel?.querySelector("[data-place-review-summary]");
  if (!panel || !list || !summary) return;
  try {
    const data = await requestJson(`/api/places/reviews?${placeReviewQuery(place)}`);
    if (activeBrowseDetailPlace !== place || !panel.isConnected) return;
    renderPlaceReviews(place, data);
  } catch (error) {
    if (!panel.isConnected) return;
    summary.textContent = "리뷰를 불러오지 못했어요";
    list.innerHTML = `<p class="browse-loading">${escapeHtml(readApiError(error.message))}</p>`;
  }
}

function renderPlaceReviews(place, data) {
  const panel = browsePlaceDetailBody.querySelector("[data-place-review-panel]");
  if (!panel) return;
  const summary = panel.querySelector("[data-place-review-summary]");
  const list = panel.querySelector("[data-place-review-list]");
  const textarea = panel.querySelector("[data-place-review-content]");
  const submitButton = panel.querySelector(".place-review-form-actions button");
  const message = panel.querySelector("[data-place-review-message]");
  const count = Number(data?.summary?.review_count || 0);
  const average = Number(data?.summary?.average_rating || 0);
  summary.textContent = count ? `★ ${average.toFixed(1)} · ${count.toLocaleString("ko-KR")}개` : "아직 리뷰 없음";
  if (data?.my_review) {
    panel.dataset.selectedRating = String(data.my_review.rating);
    paintPlaceReviewStars(panel, Number(data.my_review.rating));
    if (textarea) textarea.value = data.my_review.content || "";
    if (submitButton) submitButton.textContent = "리뷰 수정";
    if (message) message.textContent = "이미 남긴 리뷰를 수정할 수 있어요.";
  } else {
    if (submitButton) submitButton.textContent = "리뷰 등록";
    if (message) message.textContent = "";
  }
  const reviews = data?.reviews || [];
  if (!reviews.length) {
    list.innerHTML = '<p class="browse-loading">아직 이 장소에 작성된 RecoDate 리뷰가 없어요.</p>';
    return;
  }
  list.innerHTML = reviews.map((review) => `
    <article class="place-review-item">
      <div>
        <b>${escapeHtml(review.author_nickname)} <small>· ${formatCommunityTime(review.updated_at || review.created_at)}</small></b>
        <span>${"★".repeat(Number(review.rating) || 0)}${"☆".repeat(Math.max(0, 5 - (Number(review.rating) || 0)))}</span>
      </div>
      <p>${escapeHtml(review.content)}</p>
      ${(review.images || []).length
      ? `<div class="place-review-images count-${review.images.length}">${review.images
        .map((name) => `<img src="${API_BASE_URL}/api/community/images/${encodeURIComponent(name)}" alt="리뷰 사진" loading="lazy" />`)
        .join("")}</div>`
      : ""}
      ${review.is_mine ? `<button type="button" data-place-review-delete="${review.id}">내 리뷰 삭제</button>` : ""}
    </article>
  `).join("");
  list.querySelectorAll("[data-place-review-delete]").forEach((button) => {
    button.addEventListener("click", () => deletePlaceReview(place, Number(button.dataset.placeReviewDelete)));
  });
}

async function submitPlaceReview(event, place) {
  event.preventDefault();
  const panel = browsePlaceDetailBody.querySelector("[data-place-review-panel]");
  const textarea = panel?.querySelector("[data-place-review-content]");
  const message = panel?.querySelector("[data-place-review-message]");
  const submitButton = panel?.querySelector(".place-review-form-actions button");
  if (!panel || !textarea || !message || !submitButton) return;
  const content = textarea.value.trim();
  if (!content) {
    message.textContent = "리뷰 내용을 입력해 주세요.";
    return;
  }
  const shareToFeed = panel.querySelector("[data-place-review-share]")?.checked || false;
  submitButton.disabled = true;
  message.textContent = "저장 중...";
  try {
    const data = await requestJson("/api/places/reviews", {
      method: "POST",
      body: JSON.stringify({
        ...placeReviewPayload(place),
        rating: Number(panel.dataset.selectedRating || 5),
        content,
        share_to_feed: shareToFeed,
        ...(placeReviewImages.length ? { images: placeReviewImages } : {}),
      }),
    });
    if (activeBrowseDetailPlace === place) {
      placeReviewImages = [];
      renderPlaceReviewImagePreview();
      renderPlaceReviews(place, data);
      message.textContent = shareToFeed
        ? "리뷰가 저장되고 커뮤니티 피드에도 올라갔어요."
        : "리뷰가 저장됐어요.";
      loadCommunityFeed();
      loadHomeCommunityFeed();
      if (!profileView.hidden) loadProfileFeed("mine");
    }
  } catch (error) {
    message.textContent = readApiError(error.message);
  } finally {
    submitButton.disabled = false;
  }
}

async function deletePlaceReview(place, reviewId) {
  const panel = browsePlaceDetailBody.querySelector("[data-place-review-panel]");
  const message = panel?.querySelector("[data-place-review-message]");
  if (!reviewId) return;
  if (message) message.textContent = "삭제 중...";
  try {
    const data = await requestJson(`/api/places/reviews/${reviewId}`, { method: "DELETE" });
    if (activeBrowseDetailPlace === place) {
      const textarea = panel?.querySelector("[data-place-review-content]");
      if (textarea) textarea.value = "";
      panel.dataset.selectedRating = "5";
      paintPlaceReviewStars(panel, 5);
      renderPlaceReviews(place, data);
      if (message) message.textContent = "리뷰가 삭제됐어요.";
    }
  } catch (error) {
    if (message) message.textContent = readApiError(error.message);
  }
}

function renderPlaceOpeningHours(place) {
  const hours = Array.isArray(place.opening_hours) ? place.opening_hours : [];
  const openNow = resolvePlaceOpenNow(place);
  const status = openNow === true ? "영업 중" : openNow === false ? "영업 종료" : "운영 상태 확인 중";
  const statusClass = openNow === true ? "is-open" : openNow === false ? "is-closed" : "is-unknown";
  return `
    <div class="browse-detail-hours-heading">
      <strong>운영시간</strong>
      <span class="opening-status ${statusClass}">${status}</span>
    </div>
    ${hours.length
      ? `<ul>${hours.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`
      : '<p>운영시간 정보를 불러오는 중입니다.</p>'}
  `;
}

async function loadBrowseDetailOpeningHours(place) {
  const hoursBox = browsePlaceDetailBody.querySelector("[data-browse-detail-hours]");
  if (!hoursBox) return;
  try {
    await getPlacePhotoMetadata(place);
    if (!hoursBox.isConnected) return;
    if ((!Array.isArray(place.opening_hours) || !place.opening_hours.length) && place.open_now === undefined) {
      hoursBox.innerHTML = `
        <div class="browse-detail-hours-heading"><strong>운영시간</strong></div>
        <p>등록된 운영시간이 없습니다. 방문 전 네이버 검색으로 확인해주세요.</p>
      `;
      return;
    }
    hoursBox.innerHTML = renderPlaceOpeningHours(place);
    persistCurrentBrowseCache();
  } catch (_error) {
    if (!hoursBox.isConnected) return;
    hoursBox.innerHTML = `
      <div class="browse-detail-hours-heading"><strong>운영시간</strong></div>
      <p>등록된 운영시간이 없습니다. 방문 전 네이버 검색으로 확인해주세요.</p>
    `;
  }
}

function getPhotoCacheKey(place) {
  return `${place.name || ""}|${Number(place.lat || 0).toFixed(5)}|${Number(place.lon || 0).toFixed(5)}`;
}

function buildGooglePhotoUrl(photoName, width = 720, height = 480) {
  return `${API_BASE_URL}/api/places/google-photo?name=${encodeURIComponent(photoName)}&width=${width}&height=${height}`;
}

async function getNaverImageMetadata(place) {
  if (place.naver_image_thumbnail) return place;
  const key = `naver|${getPhotoCacheKey(place)}`;
  if (placePhotoCache.has(key)) return placePhotoCache.get(key);
  const query = new URLSearchParams({ name: place.name, display: "6" });
  const promise = requestJson(`/api/places/naver-image?${query}`)
    .then((photo) => {
      if (photo?.naver_image_thumbnail) Object.assign(place, photo);
      return photo || {};
    })
    .catch(() => ({}));
  placePhotoCache.set(key, promise);
  return promise;
}

function buildNaverImageCredit(place) {
  if (!place.naver_image_thumbnail) return "";
  const link = place.naver_image_link || buildNaverPlaceSearchUrl(place.name);
  return `네이버 이미지 · <a href="${escapeHtml(link)}" target="_blank" rel="noopener noreferrer" data-google-maps-link>출처</a>`;
}

async function getPlacePhotoMetadata(place, options = {}) {
  const includeDetails = Boolean(options.includeDetails);
  if (!includeDetails && place.google_photo_name && Array.isArray(place.opening_hours) && place.opening_hours.length && place.open_now !== undefined) return place;
  if (includeDetails && place.nearby_subway_station !== undefined && (place.address || place.phone)) return place;
  const key = `${includeDetails ? "details|" : "basic|"}${getPhotoCacheKey(place)}`;
  if (placePhotoCache.has(key)) {
    const cachedMetadata = await placePhotoCache.get(key);
    if (cachedMetadata && Object.keys(cachedMetadata).length) Object.assign(place, cachedMetadata);
    return cachedMetadata;
  }
  const query = new URLSearchParams({
    name: place.name,
    lat: String(place.lat),
    lon: String(place.lon),
    include_details: String(includeDetails),
  });
  const promise = requestJson(`/api/places/google-photo-search?${query}`)
    .then((metadata) => {
      if (metadata && Object.keys(metadata).length) Object.assign(place, metadata);
      return metadata || {};
    })
    .catch(() => ({}));
  placePhotoCache.set(key, promise);
  return promise;
}

async function resolvePlacePhoto(place, options = {}) {
  const width = options.width || 720;
  const height = options.height || 480;
  const naverPhoto = await getNaverImageMetadata(place);
  if (naverPhoto?.naver_image_thumbnail || place.naver_image_thumbnail) {
    return {
      url: place.naver_image_link || place.naver_image_thumbnail,
      fallbackUrl: place.naver_image_thumbnail,
      source: "네이버 이미지",
      sourceHtml: buildNaverImageCredit(place),
    };
  }
  if (place.photo_url) {
    return {
      url: place.photo_url,
      source: place.photo_source || "한국관광공사",
      sourceHtml: `${escapeHtml(place.photo_source || "한국관광공사")}${place.photo_credit ? ` · ${escapeHtml(place.photo_credit)}` : ""}`,
    };
  }
  const googlePhoto = await getPlacePhotoMetadata(place);
  if (googlePhoto?.google_photo_name || place.google_photo_name) {
    return {
      url: buildGooglePhotoUrl(place.google_photo_name, width, height),
      source: "Google Maps",
      sourceHtml: place.google_photo_attribution_name
        ? `Google Maps · <a href="${escapeHtml(place.google_photo_attribution_uri || place.google_maps_uri || "#")}" target="_blank" rel="noopener noreferrer" data-google-maps-link>${escapeHtml(place.google_photo_attribution_name)}</a>`
        : "Google Maps",
    };
  }
  return null;
}

async function applyNaverBrowsePhotoFallback(place, card, existingImage = null) {
  if (!card?.isConnected) return false;
  const photo = await getNaverImageMetadata(place);
  if (!photo?.naver_image_thumbnail || !card.isConnected) return false;
  const slot = card.querySelector("[data-browse-card-photo-slot]");
  const image = existingImage || document.createElement("img");
  image.className = "browse-place-photo";
  image.src = photo.naver_image_thumbnail;
  image.alt = `${place.name} 장소 사진`;
  image.loading = "eager";
  image.dataset.photoFallback = "naver";
  if (!existingImage) {
    if (slot) {
      slot.innerHTML = "";
      slot.appendChild(image);
      slot.classList.add("has-photo");
    } else {
      card.prepend(image);
    }
  }
  const creditHost = card.querySelector(".browse-place-content") || card;
  let credit = card.querySelector("[data-photo-credit]");
  if (!credit) {
    credit = document.createElement("span");
    credit.className = "browse-photo-credit";
    credit.dataset.photoCredit = "true";
    creditHost.appendChild(credit);
  }
  credit.innerHTML = buildNaverImageCredit(place);
  credit.querySelectorAll("[data-google-maps-link]").forEach((link) => {
    link.addEventListener("click", (event) => event.stopPropagation());
  });
  persistCurrentBrowseCache();
  return true;
}

function armBrowsePhotoFallback(place, card, image) {
  if (!image) return;
  let fallbackStarted = false;
  const useFallback = () => {
    if (fallbackStarted || !card.isConnected || image.dataset.photoFallback === "naver") return;
    fallbackStarted = true;
    applyNaverBrowsePhotoFallback(place, card, image).catch(() => {
      image.hidden = true;
    });
  };
  image.addEventListener("error", useFallback, { once: true });
  window.setTimeout(() => {
    if (!image.complete || image.naturalWidth === 0) useFallback();
  }, 1100);
}

async function enrichMissingBrowsePhotos(visiblePlaces, allPlaces = visiblePlaces) {
  const missingPlaces = visiblePlaces.filter((place) => !place.naver_image_thumbnail && !place.photo_url);
  const queue = [...missingPlaces];
  const workers = Array.from({ length: Math.min(6, queue.length) }, async () => {
    while (queue.length) {
      const place = queue.shift();
      try {
        const card = browsePlaceList.querySelector(`[data-browse-place-index="${allPlaces.indexOf(place)}"]`);
        if (!card) return;
        const slot = card.querySelector("[data-browse-card-photo-slot]");
        const naverPhotoApplied = await applyNaverBrowsePhotoFallback(place, card);
        if (naverPhotoApplied) continue;
        const photo = await getPlacePhotoMetadata(place);
        if (!photo.google_photo_name) return;
        if (!card) return;
        const photoUrl = buildGooglePhotoUrl(place.google_photo_name, 720, 480);
        const image = document.createElement("img");
        image.className = "browse-place-photo";
        image.src = photoUrl;
        image.alt = `${place.name} 장소 사진`;
        image.loading = "lazy";
        image.dataset.browseCardPhoto = "true";
        if (slot) {
          slot.innerHTML = "";
          slot.appendChild(image);
          slot.classList.add("has-photo");
        } else {
          card.prepend(image);
        }
        armBrowsePhotoFallback(place, card, image);
        const credit = document.createElement("span");
        credit.className = "browse-photo-credit";
        credit.dataset.photoCredit = "true";
        credit.innerHTML = place.google_photo_attribution_name
          ? `Google Maps · <a href="${escapeHtml(place.google_photo_attribution_uri || place.google_maps_uri || "#")}" target="_blank" rel="noopener noreferrer" data-google-maps-link>${escapeHtml(place.google_photo_attribution_name)}</a>`
          : "Google Maps";
        (card.querySelector(".browse-place-content") || card).appendChild(credit);
        credit.querySelectorAll("[data-google-maps-link]").forEach((link) => {
          link.addEventListener("click", (event) => event.stopPropagation());
        });
        persistCurrentBrowseCache();
      } catch (_error) {
        // Keep the card usable when Google has no suitable photo.
      }
    }
  });
  await Promise.all(workers);
}

function loadBookmarks() {
  try {
    return JSON.parse(localStorage.getItem(BOOKMARKS_KEY) || "[]");
  } catch (_error) {
    return [];
  }
}

function bookmarkKey(place) {
  return String(place.id || place.name || "").trim();
}

function isBookmarked(place) {
  const key = bookmarkKey(place);
  return bookmarkedPlaces.some((item) => bookmarkKey(item) === key);
}

function toggleBookmark(place) {
  const normalized = normalizeBrowseRequiredPlace(place);
  const key = bookmarkKey(normalized);
  if (isBookmarked(normalized)) {
    bookmarkedPlaces = bookmarkedPlaces.filter((item) => bookmarkKey(item) !== key);
    selectedBookmarkKeys.delete(key);
  } else {
    bookmarkedPlaces = [...bookmarkedPlaces, normalized];
  }
  localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(bookmarkedPlaces));
  renderBookmarks();
  renderSavedBookmarks();
}

function renderBookmarks() {
  bookmarkTray.hidden = bookmarkedPlaces.length === 0;
  syncSelectedBookmarkKeys();
  const selectedPlaces = getSelectedBookmarkedPlaces();
  bookmarkSummary.textContent = `${selectedPlaces.length}/${bookmarkedPlaces.length}개 선택`;
  bookmarkList.innerHTML = bookmarkedPlaces
    .map((place) => {
      const key = bookmarkKey(place);
      return `
        <label class="bookmark-chip selectable-bookmark-chip">
          <input type="checkbox" data-select-bookmark="${escapeHtml(key)}" ${selectedBookmarkKeys.has(key) ? "checked" : ""} />
          <span>${escapeHtml(place.name)}</span>
          <button type="button" data-remove-bookmark="${escapeHtml(key)}" aria-label="${escapeHtml(`${place.name} 삭제`)}">×</button>
        </label>
      `;
    })
    .join("");
  recommendBookmarksButton.disabled = selectedPlaces.length === 0;
  recommendBookmarksButton.textContent = "선택한 장소로 코스 추천받기";
  bookmarkList.querySelectorAll("[data-select-bookmark]").forEach((input) => {
    input.addEventListener("change", () => {
      toggleBookmarkSelection(input.dataset.selectBookmark, input.checked);
    });
  });
  bookmarkList.querySelectorAll("[data-remove-bookmark]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      bookmarkedPlaces = bookmarkedPlaces.filter((place) => bookmarkKey(place) !== button.dataset.removeBookmark);
      selectedBookmarkKeys.delete(button.dataset.removeBookmark);
      localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(bookmarkedPlaces));
      renderBookmarks();
      renderSavedBookmarks();
    });
  });
}

function renderSavedBookmarks() {
  syncSelectedBookmarkKeys();
  const selectedPlaces = getSelectedBookmarkedPlaces();
  recommendSavedBookmarksButton.disabled = selectedPlaces.length === 0;
  recommendSavedBookmarksButton.textContent = selectedPlaces.length
    ? `선택한 장소 ${selectedPlaces.length}개로 코스 추천받기`
    : "장소를 선택해 주세요";
  if (!bookmarkedPlaces.length) {
    savedBookmarkList.innerHTML = '<p class="browse-loading">아직 찜한 장소가 없습니다.</p>';
    return;
  }
  savedBookmarkList.innerHTML = bookmarkedPlaces
    .map(
      (place) => `
        <article class="browse-place-card saved-bookmark-card${selectedBookmarkKeys.has(bookmarkKey(place)) ? " selected" : ""}">
          <label class="saved-bookmark-select">
            <input type="checkbox" data-select-saved-bookmark="${escapeHtml(bookmarkKey(place))}" ${selectedBookmarkKeys.has(bookmarkKey(place)) ? "checked" : ""} />
            <span>추천에 포함</span>
          </label>
          <button class="saved-bookmark-remove" type="button" data-remove-saved-bookmark="${escapeHtml(bookmarkKey(place))}">삭제</button>
          <h3>${escapeHtml(place.name)}</h3>
          <p>${escapeHtml(translatePlaceCategory(place.middleBizName || place.source_category || place.category || "저장한 장소"))}</p>
          <a class="saved-bookmark-search" href="${buildNaverPlaceSearchUrl(place.name)}" target="_blank" rel="noopener noreferrer">검색</a>
        </article>
      `,
    )
    .join("");
  savedBookmarkList.querySelectorAll("[data-select-saved-bookmark]").forEach((input) => {
    input.addEventListener("change", () => {
      toggleBookmarkSelection(input.dataset.selectSavedBookmark, input.checked);
    });
  });
  savedBookmarkList.querySelectorAll("[data-remove-saved-bookmark]").forEach((button) => {
    button.addEventListener("click", () => {
      bookmarkedPlaces = bookmarkedPlaces.filter((place) => bookmarkKey(place) !== button.dataset.removeSavedBookmark);
      selectedBookmarkKeys.delete(button.dataset.removeSavedBookmark);
      localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(bookmarkedPlaces));
      renderBookmarks();
      renderSavedBookmarks();
    });
  });
}

function syncSelectedBookmarkKeys() {
  const existingKeys = new Set(bookmarkedPlaces.map(bookmarkKey));
  selectedBookmarkKeys = new Set([...selectedBookmarkKeys].filter((key) => existingKeys.has(key)));
}

function toggleBookmarkSelection(key, selected) {
  if (selected) {
    selectedBookmarkKeys.add(key);
  } else {
    selectedBookmarkKeys.delete(key);
  }
  renderBookmarks();
  renderSavedBookmarks();
}

function getSelectedBookmarkedPlaces() {
  syncSelectedBookmarkKeys();
  return bookmarkedPlaces.filter((place) => selectedBookmarkKeys.has(bookmarkKey(place)));
}

async function recommendBookmarkedPlaces() {
  const selectedPlaces = getSelectedBookmarkedPlaces();
  if (!selectedPlaces.length) return;
  selectedRequiredPlaces = [...selectedPlaces];
  renderSelectedRequiredPlace();
  requestQuickRecommendation("bookmarks", { places: [...selectedPlaces] });
}

async function createRecommendationsFromPlaces(requiredPlaces, options = {}) {
  showPortalView("recommendation");
  showRecommendationStep("results");
  courseList.innerHTML = "";
  resultSummary.textContent = `선택한 장소를 중심으로 코스를 만드는 중입니다.`;
  // anchorPlace가 있으면(장소 상세에서 "이 장소로 코스 추천받기") 선택 장소를 시작점이 아니라
  // 필수 경유지로 코스에 포함시키고, 검색 중심(start)은 그 지역 중심 또는 선택 장소 좌표의
  // 가상 시작점으로 잡는다. 그래야 식당·카페가 어색하게 1번(시작)으로 박히지 않는다.
  let startPlace = getRecommendationStartPlace();
  const placesAsRequired = requiredPlaces;
  if (options.anchorPlace) {
    const anchor = options.anchorPlace;
    const region = options.regionKey ? getRegionSelectionMeta(options.regionKey) : null;
    const regionLabel = region?.label ? region.label.replace(/\s*전체$/, "") : "";
    startPlace = {
      id: `${options.regionKey || anchor.id || "anchor"}_center_start`,
      name: regionLabel ? `${regionLabel} 중심` : `${anchor.name} 주변`,
      lat: Number.isFinite(Number(region?.lat)) ? Number(region.lat) : anchor.lat,
      lon: Number.isFinite(Number(region?.lon)) ? Number(region.lon) : anchor.lon,
    };
    // 지역 중심이 선택 장소에서 너무 멀면(7km 초과) 선택 장소 좌표를 중심으로 사용해
    // 후보 검색 반경 안에 선택 장소 주변이 들어오게 한다.
    const dLatM = (Number(startPlace.lat) - Number(anchor.lat)) * 111320;
    const dLonM = (Number(startPlace.lon) - Number(anchor.lon)) * 111320 * Math.cos((Number(anchor.lat) * Math.PI) / 180);
    const centerDistanceM = Math.sqrt(dLatM * dLatM + dLonM * dLonM);
    if (!Number.isFinite(centerDistanceM) || centerDistanceM > 7000) {
      startPlace.lat = anchor.lat;
      startPlace.lon = anchor.lon;
      startPlace.name = regionLabel ? `${regionLabel} 중심` : `${anchor.name} 주변`;
    }
  }
  try {
    const requestBody = {
      start_place: startPlace,
      required_places: placesAsRequired,
      accommodation_place: null,
      overnight: options.overnight ?? false,
      start_time: null,
      transport: options.transport || "transit",
      mode: "quick",
      include_food: options.include_food ?? true,
      include_cafe: options.include_cafe ?? true,
      include_dinner: options.include_dinner ?? false,
      include_bar: (options.overnight ?? false) && (options.include_bar ?? false),
    };
    if (options.regionKey) {
      requestBody.region_key = options.regionKey;
      requestBody.include_nearby_admin_regions = true;
    }
    const data = await requestJson("/api/recommendations", {
      method: "POST",
      body: JSON.stringify(requestBody),
    });
    currentCourses = data.courses || [];
    visibleCourseIndex = 0;
    courseOrderEditMode = false;
    replacementHistoryBySlot.clear();
    lastRecommendationData = data;
    selectedCourseId = null;
    renderCourses(currentCourses, data);
  } catch (error) {
    resultSummary.textContent = `찜한 장소 코스 생성 실패: ${readApiError(error.message)}`;
  }
}

function buildNaverPlaceSearchUrl(placeName) {
  const normalizedName = String(placeName || "").trim();
  const activeRegionKey = selectedBrowseRegion || recommendRegion?.value || "seoul";
  const activeRegionLabel = REGION_CENTERS[activeRegionKey]?.label || "서울";
  const knownRegionLabels = Object.values(REGION_CENTERS).map((region) => region.label);
  const query = knownRegionLabels.some((label) => normalizedName.includes(label))
    ? normalizedName
    : `${activeRegionLabel} ${normalizedName}`;
  return `https://map.naver.com/p/search/${encodeURIComponent(query)}`;
}

function renderNaverReviewRankBadge(place) {
  const rank = Number(place?.naver_popularity_rank);
  if (!Number.isFinite(rank) || rank <= 0) return "";
  return `<span class="naver-review-rank-badge">네이버 리뷰순 ${rank}위</span>`;
}

function translatePlaceCategory(category = "") {
  const value = String(category).toLowerCase();
  const labels = [
    [["steak_house", "steak", "\uc2a4\ud14c\uc774\ud06c", "\uc591\uc2dd"], "\uc591\uc2dd"],
    [["bakery", "\ubca0\uc774\ucee4\ub9ac", "\ube75"], "\uce74\ud398"],
    [["fast_food", "hamburger", "burger", "chicken", "pizza", "\ud328\uc2a4\ud2b8\ud478\ub4dc", "\uce58\ud0a8", "\ub2ed\uac15\uc815", "\ud53c\uc790"], "\ud328\uc2a4\ud2b8\ud478\ub4dc"],
    [["meal_takeaway", "takeout", "\ud3ec\uc7a5", "\uc300\uad6d\uc218", "\uc778\ub3c4\uc74c\uc2dd", "\ubca0\ud2b8\ub0a8", "\ud0dc\uad6d", "\ubd84\uc2dd"], "\uae30\ud0c0"],
    [["seafood", "\ud574\uc0b0\ubb3c", "\ud68c"], "\ud55c\uc2dd"],
    [["korean", "\ud55c\uc2dd"], "\ud55c\uc2dd"],
    [["chinese", "\uc911\uc2dd"], "\uc911\uc2dd"],
    [["japanese", "\uc77c\uc2dd"], "\uc77c\uc2dd"],
    [["restaurant", "\uc74c\uc2dd\uc810"], "\uc74c\uc2dd\uc810"],
    [["cafe", "coffee", "\uce74\ud398"], "\uce74\ud398"],
    [["bar", "pub", "\uc220\uc9d1", "\ud638\ud504"], "\uc220\uc9d1"],
    [["aquarium", "\uc218\uc871\uad00", "\uc544\ucfe0\uc544\ub9ac\uc6c0"], "\uc218\uc871\uad00"],
    [["movie_theater", "movie", "cinema", "\uc601\ud654\uad00"], "\uc601\ud654\uad00"],
    [["bowling_alley", "bowling", "\ubcfc\ub9c1"], "\ubcfc\ub9c1\uc7a5"],
    [["museum", "art_museum", "history_museum", "\ubba4\uc9c0\uc5c4", "\ubc15\ubb3c\uad00"], "\ubc15\ubb3c\uad00"],
    [["art_gallery", "gallery", "\ubbf8\uc220\uad00", "\uc804\uc2dc"], "\uc804\uc2dc \uacf5\uac04"],
    [["cultural_center", "\ubb38\ud654\uc13c\ud130"], "\ubb38\ud654\uc13c\ud130"],
    [["amusement_park", "\ud14c\ub9c8\ud30c\ud06c", "\ub180\uc774\uacf5\uc6d0"], "\uc57c\uc678 \ub180\uc774\uc2dc\uc124"],
    [["tourist_attraction", "landmark", "historical_landmark", "cultural_landmark", "\uad00\uad11\uc9c0"], "\uad00\uad11\uc9c0"],
    [["observation_deck", "viewpoint", "\uc804\ub9dd\ub300"], "\uc804\ub9dd/\uccb4\ud5d8"],
    [["bridge", "\ub2e4\ub9ac"], "\ub2e4\ub9ac/\uc0b0\ucc45"],
    [["market", "\uc2dc\uc7a5"], "\uc2dc\uc7a5"],
    [["zoo", "\ub3d9\ubb3c\uc6d0"], "\ub3d9\ubb3c\uc6d0"],
    [["nature_preserve", "\uc2b5\uc9c0"], "\uc790\uc5f0/\uc2b5\uc9c0"],
    [["park", "\uacf5\uc6d0"], "\uacf5\uc6d0"],
    [["beach", "\ud574\ubcc0", "\ud574\uc218\uc695\uc7a5"], "\ud574\ubcc0"],
  ];
  return labels.find(([keywords]) => keywords.some((keyword) => value.includes(keyword)))?.[1] || category || "장소";
}

function normalizeBrowseRequiredPlace(place) {
  return {
    id: place.id || place.name,
    name: place.name,
    lat: place.lat,
    lon: place.lon,
    upperBizName: place.upperBizName || "",
    middleBizName: place.middleBizName || place.source_category || place.category || "",
    lowerBizName: place.lowerBizName || "",
    detailBizName: place.detailBizName || "",
    naver_popular: Boolean(place.naver_popular),
    naver_popularity_rank: place.naver_popularity_rank || null,
  };
}

async function recommendFromBrowsePlace(place) {
  if (!place) return;
  const requiredPlace = normalizeBrowseRequiredPlace(place);
  selectedRequiredPlaces = [requiredPlace];
  renderSelectedRequiredPlace();
  // 선택한 장소는 시작점이 아니라 코스에 포함되는 필수 경유지로 넣는다.
  // 검색 중심은 선택 장소의 좌표(anchor)로 잡아 같은 지역에서 코스가 만들어지게 하고,
  // 둘러보던 지역(region_key)도 함께 보내 행정구역 필터를 유지한다.
  requestQuickRecommendation("browse", {
    places: [requiredPlace],
    regionKey: selectedBrowseRegion,
    anchorPlace: requiredPlace,
  });
}

function getBrowseRecommendationStartPlace(requiredPlace) {
  return {
    id: `${requiredPlace.id || requiredPlace.name || "browse"}_locked_start`,
    name: requiredPlace.name || "\uc120\ud0dd \uc7a5\uc18c",
    lat: requiredPlace.lat,
    lon: requiredPlace.lon,
    upperBizName: requiredPlace.upperBizName || "",
    middleBizName: requiredPlace.middleBizName || requiredPlace.category || "\ucd9c\ubc1c",
    lowerBizName: requiredPlace.lowerBizName || "",
    detailBizName: requiredPlace.detailBizName || "",
  };
}

async function createBrowsePlaceRecommendation(requiredPlace) {
  showPortalView("recommendation");
  showRecommendationStep("results");
  courseList.innerHTML = "";
  resultSummary.textContent = `${requiredPlace.name}을(를) 포함한 코스를 만드는 중입니다.`;
  try {
    const data = await requestJson("/api/recommendations", {
      method: "POST",
      body: JSON.stringify({
        start_place: getBrowseRecommendationStartPlace(requiredPlace),
        required_places: [],
        accommodation_place: null,
        overnight: false,
        start_time: null,
        transport: "transit",
        mode: "quick",
        region_key: selectedBrowseRegion,
        include_nearby_admin_regions: false,
      }),
    });
    currentCourses = data.courses || [];
    visibleCourseIndex = 0;
    replacementHistoryBySlot.clear();
    lastRecommendationData = data;
    selectedCourseId = null;
    renderCourses(currentCourses, data);
    showRecommendationStep("results");
  } catch (error) {
    resultSummary.textContent = `선택한 장소 코스 생성 실패: ${readApiError(error.message)}`;
  }
}

function renderPreviewCourse(courseId) {
  const course = PREVIEW_COURSES[courseId];
  if (!course) return;
  previewCourseDetail.hidden = false;
  previewCourseDetail.innerHTML = `
    <div>
      <p class="home-kicker">Preview Course</p>
      <h3>${escapeHtml(course.title)}</h3>
      <p>${escapeHtml(course.subtitle)}</p>
    </div>
    <ol>${course.places.map((place) => `<li>${escapeHtml(place)}</li>`).join("")}</ol>
    <p>${escapeHtml(course.note)}</p>
    <div class="preview-course-actions">
      <button class="primary-button" type="button" data-preview-recodate>이 흐름으로 RecoDate 추천받기</button>
      <button class="secondary-button" type="button" data-preview-save-course>코스 저장</button>
    </div>
  `;
  previewCourseDetail.querySelector("[data-preview-recodate]").addEventListener("click", () => requestQuickRecommendation("preview", { courseId }));
  previewCourseDetail.querySelector("[data-preview-save-course]").addEventListener("click", () => savePreviewRecommendation(courseId));
  previewCourseDetail.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function renderTriptiQuiz() {
  if (!triptiForm) return;
  const savedResult = loadTriptiResult();
  if (savedResult?.answers?.length === TRIPTI_QUESTIONS.length && !triptiRetaking) {
    triptiForm.hidden = true;
    triptiProgressText.closest(".tripti-progress").hidden = true;
    renderTriptiResult(savedResult);
    return;
  }
  triptiForm.hidden = false;
  triptiProgressText.closest(".tripti-progress").hidden = false;
  triptiResultCard.hidden = true;
  triptiResultCard.innerHTML = "";
  triptiForm.innerHTML = TRIPTI_QUESTIONS.map((question, index) => `
    <fieldset class="tripti-question-card">
      <legend><span>${String(index + 1).padStart(2, "0")}</span>${escapeHtml(question.q)}</legend>
      <label>
        <input type="radio" name="tripti-${index}" value="A" />
        <b>A</b>
        <span>${escapeHtml(question.a)}</span>
      </label>
      <label>
        <input type="radio" name="tripti-${index}" value="B" />
        <b>B</b>
        <span>${escapeHtml(question.b)}</span>
      </label>
    </fieldset>
  `).join("") + `
    <div class="tripti-actions">
      <button class="primary-button" type="button" data-tripti-submit>결과 보기</button>
    </div>
  `;
  triptiForm.querySelectorAll("input[type='radio']").forEach((input) => {
    input.addEventListener("change", updateTriptiProgress);
  });
  triptiForm.querySelector("[data-tripti-submit]").addEventListener("click", showTriptiResult);
  updateTriptiProgress();
}

function updateTriptiProgress() {
  const answers = getTriptiAnswers();
  const answeredCount = answers.filter(Boolean).length;
  triptiProgressText.textContent = `${answeredCount} / ${TRIPTI_QUESTIONS.length}`;
  triptiProgressBar.style.width = `${(answeredCount / TRIPTI_QUESTIONS.length) * 100}%`;
}

function getTriptiAnswers() {
  return TRIPTI_QUESTIONS.map((_, index) => {
    return triptiForm.querySelector(`input[name="tripti-${index}"]:checked`)?.value || "";
  });
}

async function showTriptiResult() {
  const answers = getTriptiAnswers();
  if (answers.some((answer) => !answer)) {
    triptiResultCard.hidden = false;
    triptiResultCard.innerHTML = `
      <p class="home-kicker">TripTI</p>
      <h2>아직 답하지 않은 질문이 있어요</h2>
      <p>15개 질문을 모두 선택하면 여행 취향 결과를 바로 보여드릴게요.</p>
    `;
    triptiResultCard.scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }
  const result = calculateTriptiResult(answers);
  await saveTriptiResult(result);
  triptiRetaking = false;
  triptiForm.hidden = true;
  triptiProgressText.closest(".tripti-progress").hidden = true;
  renderTriptiResult(result);
}

function calculateTriptiResult(answers) {
  const scores = Object.fromEntries(TRIPTI_AXES.flatMap((axis) => [[axis.left, 0], [axis.right, 0]]));
  answers.forEach((answer, index) => {
    const [left, right] = TRIPTI_QUESTIONS[index].axis;
    scores[answer === "A" ? left : right] += 1;
  });
  const code = TRIPTI_AXES.map((axis) => scores[axis.left] >= scores[axis.right] ? axis.left : axis.right).join("-");
  const meta = TRIPTI_RESULTS[code] || TRIPTI_RESULTS["R-L-P-U-H"];
  return { code, ...meta, scores, answers, created_at: new Date().toISOString() };
}

// 타입 코드의 각 축을 핵심 키워드 칩으로 변환한다. (32개 타입 전부 일관되게 표시)
const TRIPTI_AXIS_KEYWORDS = {
  R: "힐링·휴식",
  T: "관광·탐방",
  L: "여유로운 페이스",
  B: "알찬 일정",
  P: "계획형",
  F: "즉흥형",
  U: "실속·가성비",
  S: "감성·분위기",
  H: "유명 핫플",
  O: "숨은 로컬",
};

function renderTriptiKeywordChips(code) {
  const keywords = String(code || "")
    .split("-")
    .map((axis) => TRIPTI_AXIS_KEYWORDS[axis])
    .filter(Boolean);
  if (!keywords.length) return "";
  return `<div class="tripti-keyword-chips">${keywords
    .map((keyword) => `<span>#${escapeHtml(keyword)}</span>`)
    .join("")}</div>`;
}

// 설명을 문장 단위로 나눠 읽기 좋게 표시한다.
function renderTriptiDescription(desc) {
  const sentences = String(desc || "")
    .split("다. ")
    .map((part) => (part.endsWith("다.") ? part : `${part}다.`))
    .filter((part) => part.length > 2);
  return sentences.map((sentence) => `<p>${escapeHtml(sentence)}</p>`).join("");
}

function renderTriptiResult(result) {
  triptiResultCard.hidden = false;
  triptiResultCard.innerHTML = `
    <div class="tripti-result-layout">
      <div class="tripti-result-copy">
        <p class="home-kicker">TripTI Result</p>
        <span class="tripti-result-code">${escapeHtml(result.code)}</span>
        <h2 class="tripti-result-name">${escapeHtml(result.name)}</h2>
        ${renderTriptiKeywordChips(result.code)}
        <div class="tripti-result-desc">${renderTriptiDescription(result.desc)}</div>
      </div>
      ${renderTriptiIllustration(result)}
    </div>
    <div class="tripti-score-bars">
      ${TRIPTI_AXES.map((axis) => renderTriptiAxisBar(axis.leftLabel, axis.rightLabel, result.scores[axis.left] || 0, result.scores[axis.right] || 0, axis.total)).join("")}
    </div>
    <div class="tripti-course-suggestion">
      <strong>추천 흐름</strong>
      <p>${escapeHtml(result.course)}</p>
    </div>
    <div class="tripti-actions">
      <button class="secondary-button" type="button" data-tripti-reset-result>다시 하기</button>
      <button class="primary-button" type="button" data-tripti-apply>TripTI로 코스 추천받기</button>
    </div>
  `;
  triptiResultCard.querySelector("[data-tripti-reset-result]").addEventListener("click", resetTripti);
  triptiResultCard.querySelector("[data-tripti-apply]").addEventListener("click", () => applyTriptiToRecommendation(result));
  triptiResultCard.scrollIntoView({ behavior: "smooth", block: "center" });
}

function renderTriptiAxisBar(leftLabel, rightLabel, leftScore, rightScore, total) {
  const leftPercent = Math.round((leftScore / total) * 100);
  const rightPercent = 100 - leftPercent;
  return `
    <div class="tripti-axis-bar">
      <div class="tripti-axis-labels">
        <span>${escapeHtml(leftLabel)}</span>
        <b>${leftPercent}%</b>
        <em>${escapeHtml(rightLabel)}</em>
        <b>${rightPercent}%</b>
      </div>
      <div class="tripti-bar-track" aria-label="${escapeHtml(`${leftLabel} ${leftPercent}%, ${rightLabel} ${rightPercent}%`)}">
        <span class="tripti-bar-left" style="width: ${leftPercent}%"></span>
        <span class="tripti-bar-right" style="width: ${rightPercent}%"></span>
      </div>
    </div>
  `;
}

function renderTriptiIllustration(result) {
  const [restType, paceType, planType, moodType, placeType] = String(result.code || "").split("-");
  const isHealing = restType === "R";
  const isActive = paceType === "B" || restType === "T";
  const isSpontaneous = planType === "F";
  const isExperience = moodType === "S" || placeType === "H";
  const badge = isActive ? "BUSY" : "SLOW";
  const prop = isExperience ? "&#9733;" : "&#9825;";
  const accent = isSpontaneous ? "#ffb84d" : "#22b8c7";
  const ground = isHealing ? "#e8fbfd" : "#fff0f4";
  return `
    <div class="tripti-illustration" aria-label="${escapeHtml(result.name)} TripTI character">
      <svg viewBox="0 0 360 260" role="img">
        <rect x="24" y="36" width="312" height="190" rx="36" fill="${ground}" />
        <circle cx="284" cy="70" r="30" fill="#ffe59a" />
        <path d="M54 184 C90 146 120 148 152 178 C184 210 222 154 306 192" fill="none" stroke="${accent}" stroke-width="12" stroke-linecap="round" />
        <g class="tripti-character">
          <circle cx="162" cy="96" r="28" fill="#ffd6b3" />
          <path d="M132 93 C140 58 183 58 194 92 C176 80 151 82 132 93Z" fill="#1f333b" />
          <rect x="126" y="124" width="74" height="72" rx="24" fill="#ffffff" />
          <path d="M132 146 H196" stroke="#22b8c7" stroke-width="10" stroke-linecap="round" />
          <path d="M144 196 L128 224 M184 196 L204 224" stroke="#1f333b" stroke-width="10" stroke-linecap="round" />
          <path d="M126 140 C100 150 92 170 84 190" stroke="#1f333b" stroke-width="10" stroke-linecap="round" fill="none" />
          <path d="M200 142 C224 148 236 166 248 184" stroke="#1f333b" stroke-width="10" stroke-linecap="round" fill="none" />
          <rect x="210" y="162" width="42" height="58" rx="12" fill="#ff6f91" />
          <path d="M222 162 V150 H240 V162" stroke="#1f333b" stroke-width="6" fill="none" stroke-linecap="round" />
        </g>
        <g>
          <rect x="48" y="56" width="88" height="34" rx="17" fill="#ffffff" />
          <text x="92" y="79" text-anchor="middle" font-size="15" font-weight="800" fill="#1292a3">${badge}</text>
        </g>
        <text x="286" y="142" text-anchor="middle" font-size="46" fill="#ff6f91">${prop}</text>
        <path d="M58 214 H304" stroke="#bdebf0" stroke-width="10" stroke-linecap="round" />
      </svg>
    </div>
  `;
}

function resetTripti() {
  triptiRetaking = true;
  triptiForm.hidden = false;
  triptiProgressText.closest(".tripti-progress").hidden = false;
  triptiResultCard.hidden = true;
  triptiResultCard.innerHTML = "";
  renderTriptiQuiz();
  settleAppAtTop();
}

function normalizeTriptiResult(result) {
  if (!result?.code || !TRIPTI_RESULTS[result.code]) return null;
  return { ...TRIPTI_RESULTS[result.code], ...result };
}

function loadTriptiResult() {
  const accountResult = normalizeTriptiResult(currentUser?.tripti_result);
  if (accountResult) return accountResult;
  try {
    return normalizeTriptiResult(JSON.parse(localStorage.getItem(triptiResultStorageKey()) || "null"));
  } catch (_error) {
    return null;
  }
}

function triptiResultStorageKey() {
  return currentUser?.id ? `${TRIPTI_RESULT_KEY}_${currentUser.id}` : `${TRIPTI_RESULT_KEY}_guest`;
}

async function saveTriptiResult(result) {
  if (currentUser) {
    currentUser.tripti_result = result;
    try {
      const data = await requestJson("/api/auth/tripti-result", {
        method: "POST",
        body: JSON.stringify({ result }),
      });
      currentUser.tripti_result = data.result || result;
      return currentUser.tripti_result;
    } catch (_error) {
      return result;
    }
  }
  localStorage.setItem(triptiResultStorageKey(), JSON.stringify(result));
  return result;
}

function syncTriptiApplyOption() {
  if (!applyTriptiPreference) return;
  const result = loadTriptiResult();
  const hasResult = Boolean(result?.code);
  applyTriptiPreference.disabled = !hasResult;
  triptiApplyOption.classList.toggle("disabled", !hasResult);
  if (!hasResult) applyTriptiPreference.checked = false;
  triptiApplyHint.textContent = hasResult
    ? `${result.code} ${result.name} 결과를 추천 조건에 반영할 수 있어요.`
    : "TripTI 결과를 받은 뒤 선택할 수 있어요.";
}

function handleTriptiApplyToggle() {
  if (!applyTriptiPreference.checked) {
    triptiPreferredPlaceCategories = [];
    return;
  }
  const result = loadTriptiResult();
  if (!result?.code) {
    applyTriptiPreference.checked = false;
    triptiPreferredPlaceCategories = [];
    syncTriptiApplyOption();
    return;
  }
  applyTriptiResultToConditions(result);
  resultSummary.textContent = `TripTI ${result.code} ${result.name} 유형에 맞춰 추천 조건을 반영했어요.`;
}

function resolveTriptiPreferredCategories(code = "") {
  const [restType, paceType, _planType, moodType, placeType] = String(code).split("-");
  const categories = [];
  const add = (...items) => categories.push(...items);

  if (restType === "R") add("마무리/산책", "카페", "문화/전시");
  if (restType === "T") add("문화/전시", "야외 액티비티", "실내 액티비티");
  if (paceType === "L") add("카페", "마무리/산책", "문화/전시");
  if (paceType === "B") add("야외 액티비티", "실내 액티비티", "문화/전시");
  if (moodType === "U") add("카페", "마무리/산책", "문화/전시");
  if (moodType === "S") add("문화/전시", "마무리/산책", "카페");
  if (placeType === "H") add("문화/전시", "야외 액티비티", "실내 액티비티", "카페");
  if (placeType === "O") add("마무리/산책", "카페", "문화/전시");

  return [...new Set(categories)];
}

function applyTriptiResultToConditions(result) {
  const [restType, paceType] = String(result.code || "").split("-");
  const detailMode = getCheckedValue("mode") === "detail";

  if (detailMode) {
    waypointCount.value = restType === "T" || paceType === "B" ? "6" : "4";
  }

  syncModeOptions();
  triptiPreferredPlaceCategories = resolveTriptiPreferredCategories(result.code);
  const triptiRadius = restType === "T" || paceType === "B" ? 6 : 2;
  if (Number(radiusKm.max) < triptiRadius) radiusKm.max = String(triptiRadius);
  radiusKm.value = String(triptiRadius);
  radiusValue.textContent = `${radiusKm.value}km`;
  syncDinnerFoodOption();
}
function applyTriptiToRecommendation(result) {
  const previousTransport = getCheckedValue("transport");
  resetRecommendationState();
  document.querySelector(`input[name="transport"][value="${previousTransport}"]`).checked = true;
  applyTriptiResultToConditions(result);
  if (applyTriptiPreference) {
    applyTriptiPreference.checked = true;
    syncTriptiApplyOption();
  }
  resultSummary.textContent = `TripTI ${result.code} ${result.name} 유형에 맞춰 추천 조건을 채웠어요. 시작 장소와 지역만 확인한 뒤 코스를 만들어보세요.`;
  showPortalView("recommendation");
}

// ---------- PWA 설치 안내 ----------
// Android/Chrome은 beforeinstallprompt로 네이티브 설치 팝업을 띄우고,
// iOS Safari는 그 이벤트가 없으므로 "공유 → 홈 화면에 추가" 안내만 보여준다.
let pwaDeferredPrompt = null;

function isStandaloneApp() {
  return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
}

function initPwaInstall() {
  const banner = document.getElementById("pwaInstallBanner");
  const installButton = document.getElementById("pwaInstallButton");
  const closeButton = document.getElementById("pwaInstallClose");
  const hint = document.getElementById("pwaInstallHint");
  if (!banner) return;
  // 이미 설치해 standalone으로 실행 중이거나, 사용자가 최근 닫았으면 안 띄운다.
  if (isStandaloneApp()) return;
  const dismissedAt = Number(localStorage.getItem("recodate_pwa_dismissed") || 0);
  if (Date.now() - dismissedAt < 7 * 24 * 60 * 60 * 1000) return;

  closeButton?.addEventListener("click", () => {
    banner.hidden = true;
    localStorage.setItem("recodate_pwa_dismissed", String(Date.now()));
  });

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    pwaDeferredPrompt = event;
    installButton.hidden = false;
    hint.textContent = "홈 화면에 추가하면 앱처럼 빠르게 열려요.";
    banner.hidden = false;
  });

  installButton?.addEventListener("click", async () => {
    if (!pwaDeferredPrompt) return;
    pwaDeferredPrompt.prompt();
    const choice = await pwaDeferredPrompt.userChoice.catch(() => null);
    pwaDeferredPrompt = null;
    banner.hidden = true;
    if (choice?.outcome !== "accepted") {
      localStorage.setItem("recodate_pwa_dismissed", String(Date.now()));
    }
  });

  window.addEventListener("appinstalled", () => {
    banner.hidden = true;
  });

  // iOS Safari: beforeinstallprompt가 없으므로 직접 안내를 띄운다.
  const ua = window.navigator.userAgent;
  const isIos = /iphone|ipad|ipod/i.test(ua);
  const isIosSafari = isIos && /safari/i.test(ua) && !/crios|fxios/i.test(ua);
  if (isIosSafari) {
    installButton.hidden = true;
    hint.textContent = "공유 버튼 → '홈 화면에 추가'를 누르면 앱으로 설치돼요.";
    window.setTimeout(() => {
      banner.hidden = false;
    }, 2500);
  }
}

// 약관·정책 전문 모달 (policies.js의 RECODATE_POLICIES 사용)
function openPolicyModal(policyKey) {
  const policy = window.RECODATE_POLICIES?.[policyKey];
  if (!policy) return;
  document.getElementById("policyModalTitle").textContent = policy.title;
  document.getElementById("policyModalBody").textContent = policy.body;
  document.getElementById("policyModal").hidden = false;
}

function closePolicyModal() {
  document.getElementById("policyModal").hidden = true;
}

function toggleAuthCard(cardId) {
  document.querySelectorAll(".secondary-auth-card").forEach((card) => {
    card.hidden = card.id !== cardId || !card.hidden;
  });
  authMessage.textContent = "";
}

function togglePasswordVisibility(button) {
  const input = document.getElementById(button.dataset.togglePassword);
  if (!input) return;
  const shouldShow = input.type === "password";
  input.type = shouldShow ? "text" : "password";
  const label = shouldShow ? "비밀번호 숨기기" : "비밀번호 보기";
  button.setAttribute("aria-label", label);
  button.setAttribute("aria-pressed", String(shouldShow));
  button.title = label;
  button.classList.toggle("selected", shouldShow);
}

function normalizePhoneNumber(value) {
  return value.replace(/\D/g, "");
}

function isValidSignupPassword(value) {
  return value.length >= 8 && !/\s/.test(value) && /[^A-Za-z0-9가-힣]/.test(value);
}

function normalizeLegacyAuthStorage() {
  const token = localStorage.getItem(AUTH_TOKEN_KEY);
  if (token && localStorage.getItem(AUTH_REMEMBER_KEY) !== "1") {
    sessionStorage.setItem(AUTH_TOKEN_KEY, token);
    localStorage.removeItem(AUTH_TOKEN_KEY);
  }
}

function getAuthToken() {
  return sessionStorage.getItem(AUTH_TOKEN_KEY) || localStorage.getItem(AUTH_TOKEN_KEY);
}

function isPersistentLogin() {
  return localStorage.getItem(AUTH_REMEMBER_KEY) === "1" && Boolean(localStorage.getItem(AUTH_TOKEN_KEY));
}

function markAuthActivity() {
  if (!sessionStorage.getItem(AUTH_TOKEN_KEY) || isPersistentLogin()) return;
  sessionStorage.setItem(AUTH_LAST_ACTIVITY_KEY, String(Date.now()));
}

function expireIdleSession() {
  sessionStorage.removeItem(AUTH_TOKEN_KEY);
  sessionStorage.removeItem(AUTH_LAST_ACTIVITY_KEY);
  updateAuthUi(null);
  authMessage.textContent = "\ub85c\uadf8\uc778 \uc720\uc9c0\ub97c \uc120\ud0dd\ud558\uc9c0 \uc54a\uc544 20\ubd84 \ubb34\ud65c\ub3d9\uc73c\ub85c \ub85c\uadf8\uc544\uc6c3\ub418\uc5c8\uc2b5\ub2c8\ub2e4.";
  showPortalView("login", { replace: true });
}

function checkIdleSession() {
  if (!sessionStorage.getItem(AUTH_TOKEN_KEY) || isPersistentLogin()) return false;
  const lastActivity = Number(sessionStorage.getItem(AUTH_LAST_ACTIVITY_KEY) || Date.now());
  if (Date.now() - lastActivity >= AUTH_IDLE_TIMEOUT_MS) {
    expireIdleSession();
    return true;
  }
  markAuthActivity();
  return false;
}

function bindIdleSessionWatcher() {
  ["click", "scroll", "keydown", "touchstart"].forEach((eventName) => {
    window.addEventListener(eventName, () => {
      checkIdleSession();
    }, { passive: true, capture: true });
  });
}

function setAuthToken(token, remember) {
  clearAuthToken();
  if (remember) {
    localStorage.setItem(AUTH_TOKEN_KEY, token);
    localStorage.setItem(AUTH_REMEMBER_KEY, "1");
    return;
  }
  sessionStorage.setItem(AUTH_TOKEN_KEY, token);
  markAuthActivity();
}

function clearAuthToken() {
  sessionStorage.removeItem(AUTH_TOKEN_KEY);
  sessionStorage.removeItem(AUTH_LAST_ACTIVITY_KEY);
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(AUTH_REMEMBER_KEY);
}

async function signupUser(event) {
  event.preventDefault();
  const phone = normalizePhoneNumber(document.getElementById("signupPhone").value);
  const password = document.getElementById("signupPassword").value;
  const passwordConfirm = document.getElementById("signupPasswordConfirm").value;
  if (phone.length < 9 || phone.length > 15) {
    authMessage.textContent = "회원가입 실패: 전화번호를 확인해 주세요.";
    return;
  }
  if (!isValidSignupPassword(password)) {
    authMessage.textContent = "회원가입 실패: 비밀번호는 8자 이상이며 특수문자를 1개 이상 포함해야 합니다.";
    return;
  }
  if (password !== passwordConfirm) {
    authMessage.textContent = "회원가입 실패: 비밀번호 확인이 일치하지 않습니다.";
    return;
  }
  const requiredAgreements = ["agreeTerms", "agreePrivacy", "agreeLocation", "agreeContent", "agreeAge"];
  if (!requiredAgreements.every((id) => document.getElementById(id).checked)) {
    authMessage.textContent = "회원가입 실패: 필수 동의 항목(약관·개인정보·위치·콘텐츠 활용·만 14세)에 모두 동의해 주세요.";
    return;
  }
  try {
    await requestJson("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({
        email: document.getElementById("signupEmail").value.trim(),
        phone,
        nickname: document.getElementById("signupNickname").value.trim(),
        password,
        password_confirm: passwordConfirm,
        agreed_terms: document.getElementById("agreeTerms").checked,
        agreed_privacy: document.getElementById("agreePrivacy").checked,
        agreed_location: document.getElementById("agreeLocation").checked,
        age_over_14: document.getElementById("agreeAge").checked,
        agreed_content_license: document.getElementById("agreeContent").checked,
      }),
    });
    authMessage.textContent = "회원가입이 완료되었습니다. 로그인해 주세요.";
    document.getElementById("signupCard").hidden = true;
    event.target.reset();
  } catch (error) {
    authMessage.textContent = `회원가입 실패: ${readApiError(error.message)}`;
  }
}

async function loginUser(event) {
  event.preventDefault();
  try {
    const data = await requestJson("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({
        email: document.getElementById("loginEmail").value.trim(),
        password: document.getElementById("loginPassword").value,
      }),
    });
    setAuthToken(data.token, document.getElementById("rememberLogin").checked);
    updateAuthUi(data.user);
    authMessage.textContent = "";
    const nextView = pendingRecommendationAccess ? "recommendation" : "home";
    const previewCourseId = pendingPreviewCourseId;
    const browseRecommendationPlace = pendingBrowseRecommendationPlace;
    const previewSaveCourseId = pendingPreviewSaveCourseId;
    const quickRecommendation = pendingQuickRecommendation;
    pendingRecommendationAccess = false;
    showPortalView(nextView);
    if (quickRecommendation) {
      requestQuickRecommendation(quickRecommendation.type, quickRecommendation.payload);
    } else if (previewSaveCourseId) {
      pendingPreviewSaveCourseId = null;
      await savePreviewRecommendation(previewSaveCourseId);
    } else if (previewCourseId) {
      pendingPreviewCourseId = null;
      await loadPreviewRecommendation(previewCourseId);
    } else if (browseRecommendationPlace) {
      pendingBrowseRecommendationPlace = null;
      await createBrowsePlaceRecommendation(browseRecommendationPlace);
    }
  } catch (error) {
    authMessage.textContent = `로그인 실패: ${readApiError(error.message)}`;
  }
}

function startKakaoLogin() {
  window.location.href = `${API_BASE_URL}/api/auth/kakao/start`;
}

function openKakaoSignupCard() {
  document.getElementById("kakaoSignupCard").hidden = false;
  document.getElementById("signupCard").hidden = true;
  const emailText = kakaoSignupEmailParam ? `카카오 계정: ${kakaoSignupEmailParam}` : "카카오 계정으로 가입을 계속합니다.";
  document.getElementById("kakaoSignupEmail").textContent = emailText;
  document.getElementById("kakaoSignupNickname").value = kakaoSignupNicknameParam || "";
  authMessage.textContent = "RecoDate에서 사용할 닉네임을 설정해 주세요.";
}

async function completeKakaoSignup(event) {
  event.preventDefault();
  if (!kakaoSignupParam) {
    authMessage.textContent = "카카오 가입 정보가 없습니다. 다시 시도해 주세요.";
    return;
  }
  const requiredAgreements = ["kakaoAgreeTerms", "kakaoAgreePrivacy", "kakaoAgreeLocation", "kakaoAgreeAge"];
  if (!requiredAgreements.every((id) => document.getElementById(id).checked)) {
    authMessage.textContent = "카카오 회원가입 실패: 필수 약관과 만 14세 이상 확인에 동의해 주세요.";
    return;
  }
  try {
    const data = await requestJson("/api/auth/kakao/complete", {
      method: "POST",
      body: JSON.stringify({
        pending_token: kakaoSignupParam,
        nickname: document.getElementById("kakaoSignupNickname").value.trim(),
        agreed_terms: document.getElementById("kakaoAgreeTerms").checked,
        agreed_privacy: document.getElementById("kakaoAgreePrivacy").checked,
        agreed_location: document.getElementById("kakaoAgreeLocation").checked,
        age_over_14: document.getElementById("kakaoAgreeAge").checked,
      }),
    });
    setAuthToken(data.token, true);
    updateAuthUi(data.user);
    authMessage.textContent = "";
    window.history.replaceState({}, document.title, window.location.pathname);
    showPortalView("home");
  } catch (error) {
    authMessage.textContent = `카카오 회원가입 실패: ${readApiError(error.message)}`;
  }
}

async function logoutUser() {
  const token = getAuthToken();
  if (token) {
    try {
      await requestJson("/api/auth/logout", { method: "POST", headers: { Authorization: `Bearer ${token}` } });
    } catch (_error) {
      // Local logout still clears an expired or invalid session.
    }
  }
  clearAuthToken();
  updateAuthUi(null);
  showPortalView("login");
}

async function restoreAuthSession() {
  const token = getAuthToken();
  if (!token) {
    updateAuthUi(null);
    showPortalView("login", { replace: true });
    return;
  }
  try {
    const data = await requestJson("/api/auth/me", { headers: { Authorization: `Bearer ${token}` } });
    updateAuthUi(data.user);
    markAuthActivity();
    // 새로고침해도 보던 화면을 유지한다. 추천 화면은 결과가 메모리에만 있어
    // 조건 설정 단계부터 열린다(자동 재추천는 하지 않음).
    const savedView = sessionStorage.getItem("recodate_last_view");
    const restorable = ["home", "tripti", "browse", "community", "bookmarks", "myCourses", "profile", "recommendation"];
    showPortalView(restorable.includes(savedView) ? savedView : "home", { replace: true });
  } catch (_error) {
    clearAuthToken();
    updateAuthUi(null);
    showPortalView("login", { replace: true });
  }
}

// 비밀번호 찾기: 이메일+전화번호가 가입 정보와 일치하면 새 비밀번호로 재설정한다.
async function resetPassword(event) {
  event.preventDefault();
  const newPassword = document.getElementById("resetNewPassword").value;
  const confirmPassword = document.getElementById("resetNewPasswordConfirm").value;
  if (!isValidSignupPassword(newPassword)) {
    authMessage.textContent = "새 비밀번호는 공백 없이 8자 이상, 특수문자를 포함해야 합니다.";
    return;
  }
  if (newPassword !== confirmPassword) {
    authMessage.textContent = "새 비밀번호 확인이 일치하지 않습니다.";
    return;
  }
  try {
    await requestJson("/api/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({
        email: document.getElementById("resetEmail").value.trim(),
        phone: document.getElementById("resetPhone").value.trim(),
        new_password: newPassword,
      }),
    });
    toggleAuthCard("resetPasswordCard");
    document.getElementById("resetPasswordForm").reset();
    authMessage.textContent = "비밀번호가 재설정됐어요. 새 비밀번호로 로그인해 주세요.";
  } catch (error) {
    authMessage.textContent = `비밀번호 재설정 실패: ${readApiError(error.message)}`;
  }
}

async function findLoginId(event) {
  event.preventDefault();
  try {
    const data = await requestJson("/api/auth/find-login-id", {
      method: "POST",
      body: JSON.stringify({ email: document.getElementById("findIdEmail").value.trim() }),
    });
    authMessage.textContent = `가입한 아이디는 ${data.login_id} 입니다.`;
  } catch (error) {
    authMessage.textContent = `아이디 찾기 실패: ${readApiError(error.message)}`;
  }
}

function updateAuthUi(user) {
  currentUser = user;
  loginNavButton.hidden = Boolean(user);
  profileNavButton.hidden = !user;
  if (user) profileNavButton.textContent = `${user.nickname}님`;
  // 홈 우측 상단 프로필 칩(아바타+닉네임 → 마이페이지). 로그인 시에만 표시.
  const homeChip = document.getElementById("homeProfileChip");
  if (homeChip) {
    if (user) {
      document.getElementById("homeProfileNickname").textContent = user.nickname;
      // 칩 아바타엔 닉네임 첫 글자만(사진 없을 때 옆 이름과 '정우 정우'처럼 겹쳐 보이는 것 방지).
      document.getElementById("homeProfileAvatar").innerHTML = avatarInnerHtml(user.id, user.nickname, 1);
      homeChip.hidden = false;
    } else {
      homeChip.hidden = true;
    }
  }
  triptiRetaking = false;
  if (applyTriptiPreference) {
    applyTriptiPreference.checked = false;
    triptiPreferredPlaceCategories = [];
    syncTriptiApplyOption();
  }
  renderTriptiQuiz();
  renderProfile();
  // 로그인 상태가 되면 이미 허용된 푸시 구독을 조용히 갱신한다(권한 요청은 안 함).
  if (user && typeof setupPushAfterLogin === "function") setupPushAfterLogin();
}

function recentPlacesStorageKey() {
  return `${RECENT_PLACES_KEY}_${currentUser?.id || "guest"}`;
}

function loadRecentPlaces() {
  try {
    return JSON.parse(localStorage.getItem(recentPlacesStorageKey()) || "[]");
  } catch (_error) {
    return [];
  }
}

function recordRecentPlace(place) {
  if (!place?.name) return;
  const normalized = normalizeBrowseRequiredPlace(place);
  const places = [
    normalized,
    ...loadRecentPlaces().filter((item) => bookmarkKey(item) !== bookmarkKey(normalized)),
  ].slice(0, 12);
  localStorage.setItem(recentPlacesStorageKey(), JSON.stringify(places));
  renderRecentPlaces();
}

function renderProfile() {
  document.getElementById("profileNickname").textContent = currentUser ? `${currentUser.nickname}님` : "로그인이 필요합니다";
  document.getElementById("profileNicknameInput").value = currentUser?.nickname || "";
  // 닉네임 수정 중에 저장/취소 없이 나갔다 돌아오면 수정 상태가 남아 있던 버그 → 항상 보기 상태로 리셋.
  toggleNicknameEditor(false);
  renderMyProfileAvatar();
  renderProfileAccountInfo();
  // 비로그인 상태에서 호출하면 401 → 토큰 정리 → updateAuthUi → renderProfile 무한 루프가
  // 되므로(updateAuthUi가 renderProfile을 부른다) 반드시 로그인일 때만 커뮤니티 데이터를 불러온다.
  if (getAuthToken()) {
    loadProfileCommunityStats();
    loadProfileFeed("mine");
    loadMyCoupleStatus();
  } else {
    const coupleCard = document.getElementById("profileCoupleCard");
    const partnerLine = document.getElementById("profilePartnerLine");
    if (coupleCard) coupleCard.hidden = true;
    if (partnerLine) partnerLine.hidden = true;
    const statsBox = document.getElementById("profileCommunityStats");
    const feedList = document.getElementById("profileFeedList");
    if (statsBox) statsBox.innerHTML = "";
    if (feedList) feedList.innerHTML = '<p class="browse-loading">로그인하면 커뮤니티 활동을 볼 수 있어요.</p>';
  }
}

function renderRecentPlaces() {
  if (!recentPlaceList) return;
  const places = loadRecentPlaces();
  if (!places.length) {
    recentPlaceList.innerHTML = '<p class="browse-loading">최근 본 장소가 아직 없습니다.</p>';
    return;
  }
  recentPlaceList.innerHTML = places.map((place) => `
    <article class="recent-place-card">
      <div>
        <h3>${escapeHtml(place.name)}</h3>
        <p>${escapeHtml(translatePlaceCategory(place.middleBizName || place.category || "장소"))}</p>
      </div>
      <a href="${buildNaverPlaceSearchUrl(place.name)}" target="_blank" rel="noopener noreferrer">검색</a>
    </article>
  `).join("");
}

function readApiError(message) {
  try {
    const parsed = JSON.parse(message);
    return formatApiErrorDetail(parsed.detail || parsed.message || message);
  } catch (_error) {
    return formatApiErrorDetail(message);
  }
}

function formatApiErrorDetail(detail) {
  const normalize = (value) => {
    const text = String(value || "").replace(/^Value error,\s*/i, "").trim();
    if (!text) return "";
    if (/Field required/i.test(text)) return "필수 항목을 모두 입력해 주세요.";
    if (/at least 8|minimum length|too_short|String should have at least/i.test(text)) {
      return "비밀번호는 8자리 이상으로 입력해 주세요.";
    }
    if (/pattern|special|특수문자/i.test(text)) return "비밀번호에는 특수문자를 포함해 주세요.";
    return text;
  };

  if (Array.isArray(detail)) {
    const messages = detail
      .map((item) => normalize(item?.msg || item?.message || item))
      .filter(Boolean);
    return [...new Set(messages)].slice(0, 2).join(" ") || "입력값을 확인해 주세요.";
  }
  if (detail && typeof detail === "object") {
    return normalize(detail.msg || detail.message || JSON.stringify(detail)) || "입력값을 확인해 주세요.";
  }
  return normalize(detail) || "요청 처리에 실패했습니다.";
}

// ============================================================
// 여행 날짜 선택 캘린더 (상세 설정)
// 선택값은 selectedTravelDate(YYYY-MM-DD)에 저장되고 추천 요청에
// travel_date로 함께 전송된다. (휴무/날씨 반영은 다음 단계)
// ============================================================
let selectedTravelDate = null;
let travelCalendarViewYear = null;
let travelCalendarViewMonth = null; // 0부터 시작(0=1월)

function toIsoDateString(year, month, day) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function formatTravelDateLabel(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  const weekday = ["일", "월", "화", "수", "목", "금", "토"][new Date(y, m - 1, d).getDay()];
  return `${y}년 ${m}월 ${d}일 (${weekday})`;
}

function getKstToday() {
  const kst = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
  return { year: kst.getFullYear(), month: kst.getMonth(), day: kst.getDate() };
}

function renderTravelDateCalendar() {
  const calendar = document.getElementById("travelDateCalendar");
  if (!calendar) return;
  const today = getKstToday();
  if (travelCalendarViewYear === null || travelCalendarViewMonth === null) {
    if (selectedTravelDate) {
      const [sy, sm] = selectedTravelDate.split("-").map(Number);
      travelCalendarViewYear = sy;
      travelCalendarViewMonth = sm - 1;
    } else {
      travelCalendarViewYear = today.year;
      travelCalendarViewMonth = today.month;
    }
  }
  const year = travelCalendarViewYear;
  const month = travelCalendarViewMonth;
  const firstWeekday = new Date(year, month, 1).getDay();
  const todayIso = toIsoDateString(today.year, today.month, today.day);

  // 스크린샷 형식대로 이전/다음 달 날짜를 포함한 6주(42칸) 그리드를 만든다.
  const cells = [];
  const gridStart = new Date(year, month, 1 - firstWeekday);
  for (let i = 0; i < 42; i += 1) {
    const cellDate = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i);
    const iso = toIsoDateString(cellDate.getFullYear(), cellDate.getMonth(), cellDate.getDate());
    const isOtherMonth = cellDate.getMonth() !== month;
    const isPast = iso < todayIso;
    const classes = ["travel-cal-day"];
    if (isOtherMonth) classes.push("is-other-month");
    if (iso === todayIso) classes.push("is-today");
    if (iso === selectedTravelDate) classes.push("is-selected");
    cells.push(
      `<button type="button" class="${classes.join(" ")}" data-cal-date="${iso}"${isPast ? " disabled" : ""}>${cellDate.getDate()}</button>`,
    );
  }

  calendar.innerHTML = `
    <div class="travel-cal-header">
      <strong>${year}년 ${month + 1}월</strong>
      <span class="travel-cal-nav">
        <button type="button" data-cal-prev aria-label="이전 달">▲</button>
        <button type="button" data-cal-next aria-label="다음 달">▼</button>
      </span>
    </div>
    <div class="travel-cal-weekdays">
      ${["일", "월", "화", "수", "목", "금", "토"].map((name) => `<span>${name}</span>`).join("")}
    </div>
    <div class="travel-cal-grid">${cells.join("")}</div>
    <div class="travel-cal-footer">
      <button type="button" data-cal-clear>선택 안 함</button>
    </div>
  `;
}

function updateTravelDateButtonLabel() {
  const button = document.getElementById("travelDateButton");
  if (!button) return;
  button.textContent = selectedTravelDate ? formatTravelDateLabel(selectedTravelDate) : "날짜 선택";
  button.classList.toggle("has-date", Boolean(selectedTravelDate));
  updateApplyWeatherAvailability();
}

// 날씨 반영 체크박스는 예보가 제공되는 날짜(오늘~7일 뒤)에만 켤 수 있다.
// 오늘~3일은 단기예보(시간대별), 4~7일은 중기예보(오전/오후)를 쓴다.
function updateApplyWeatherAvailability() {
  const checkbox = document.getElementById("applyWeather");
  const hint = document.getElementById("applyWeatherHint");
  if (!checkbox) return;
  let enabled = false;
  let hintText = "날짜를 선택하면 사용할 수 있어요";
  if (selectedTravelDate) {
    const today = getKstToday();
    const todayDate = new Date(today.year, today.month, today.day);
    const [y, m, d] = selectedTravelDate.split("-").map(Number);
    const offsetDays = Math.round((new Date(y, m - 1, d) - todayDate) / 86400000);
    if (offsetDays >= 0 && offsetDays <= 3) {
      enabled = true;
      hintText = "시간대별 예보(단기예보)를 반영해요";
    } else if (offsetDays >= 4 && offsetDays <= 7) {
      enabled = true;
      hintText = "오전·오후 예보(중기예보)를 반영해요";
    } else {
      hintText = "예보 제공 범위(7일)를 벗어난 날짜예요";
    }
  }
  checkbox.disabled = !enabled;
  if (!enabled) checkbox.checked = false;
  if (hint) hint.textContent = hintText;
}

function bindTravelDateField() {
  const button = document.getElementById("travelDateButton");
  const calendar = document.getElementById("travelDateCalendar");
  if (!button || !calendar) return;

  button.addEventListener("click", () => {
    const willOpen = calendar.hidden;
    if (willOpen) {
      travelCalendarViewYear = null;
      travelCalendarViewMonth = null;
      renderTravelDateCalendar();
    }
    calendar.hidden = !willOpen;
    button.setAttribute("aria-expanded", String(willOpen));
  });

  calendar.addEventListener("click", (event) => {
    const prev = event.target.closest("[data-cal-prev]");
    const next = event.target.closest("[data-cal-next]");
    const clear = event.target.closest("[data-cal-clear]");
    const dayButton = event.target.closest("[data-cal-date]");
    if (prev || next) {
      travelCalendarViewMonth += prev ? -1 : 1;
      if (travelCalendarViewMonth < 0) {
        travelCalendarViewMonth = 11;
        travelCalendarViewYear -= 1;
      } else if (travelCalendarViewMonth > 11) {
        travelCalendarViewMonth = 0;
        travelCalendarViewYear += 1;
      }
      renderTravelDateCalendar();
      return;
    }
    if (clear) {
      selectedTravelDate = null;
      updateTravelDateButtonLabel();
      calendar.hidden = true;
      button.setAttribute("aria-expanded", "false");
      return;
    }
    if (dayButton && !dayButton.disabled) {
      selectedTravelDate = dayButton.dataset.calDate;
      updateTravelDateButtonLabel();
      calendar.hidden = true;
      button.setAttribute("aria-expanded", "false");
    }
  });
}


// ============================================================
// 커뮤니티 (Phase 1: 코스 공유 피드)
// 피드 조회/좋아요/담기/삭제 + 공유 모달. 친구 탭은 Phase 2에서 채운다.
// ============================================================
let communityFeedScope = "all";
let communityFeedSort = "recent";
let communityShareCourse = null;
let pendingFriendShareCourse = null;

function getCommunityRegionLabel(course) {
  const regionMeta = REGION_CENTERS[recommendRegion?.value];
  if (regionMeta?.label) return String(regionMeta.label).replace(/\s*전체$/, "");
  const start = (course?.places || []).find((place) => place.category === "시작");
  return start?.name?.replace(/\s*중심$/, "") || "";
}

function formatCommunityTime(isoText) {
  const created = new Date(isoText);
  if (Number.isNaN(created.getTime())) return "";
  const diffMinutes = Math.floor((Date.now() - created.getTime()) / 60000);
  if (diffMinutes < 1) return "방금 전";
  if (diffMinutes < 60) return `${diffMinutes}분 전`;
  if (diffMinutes < 1440) return `${Math.floor(diffMinutes / 60)}시간 전`;
  if (diffMinutes < 10080) return `${Math.floor(diffMinutes / 1440)}일 전`;
  return created.toLocaleDateString("ko-KR", { month: "long", day: "numeric" });
}

const COMMUNITY_TRANSPORT_LABELS = { walk: "도보", transit: "대중교통", car: "자차" };

// 아바타 사진이 바뀐 걸 아는 사용자만 버전 토큰을 붙여 캐시를 무력화한다.
// (서버가 no-cache+ETag라 다른 사용자는 다음 렌더 때 자동 최신화되고, 토큰은 내 사진처럼
//  '방금 바뀐 걸 확실히 아는' 경우에 즉시 반영을 보장하는 용도다.)
const avatarVersions = {};

function avatarSrc(userId) {
  const base = `${API_BASE_URL}/api/community/users/${userId}/avatar`;
  const version = avatarVersions[userId];
  return version ? `${base}?v=${version}` : base;
}

// 아바타 공통 렌더: 프로필 사진이 있으면 이니셜 위에 사진을 덮고, 없으면(404) 이니셜만 남는다.
// 피드·댓글·채팅·친구·알림 등 모든 community-avatar가 이 헬퍼를 쓴다.
function avatarInnerHtml(userId, nickname, initialLen = 2) {
  const initials = escapeHtml(String(nickname || "?").slice(0, initialLen));
  if (!userId) return initials;
  return `${initials}<img class="avatar-photo" src="${avatarSrc(userId)}" alt="" loading="lazy" onerror="this.remove()" />`;
}

// 특정 사용자의 아바타를 앱 전체에서 즉시 새로고침한다(내 프로필 사진 변경 직후 호출).
// 이미 떠 있는 .community-avatar들을 다시 그려, 사진이 없던 자리(이니셜만)에도 새 사진이 들어가게 한다.
function refreshAvatarFor(userId, nickname) {
  if (!userId) return;
  avatarVersions[userId] = Date.now();
  const html = avatarInnerHtml(userId, nickname);
  // data 속성으로 작성자를 알 수 있는 아바타들을 갱신
  document
    .querySelectorAll(`[data-post-author="${userId}"], [data-comment-profile="${userId}"]`)
    .forEach((node) => {
      node.innerHTML = html;
    });
  // 그 외 이미 그려진 내 아바타 이미지들은 src만 새 버전으로 바꿔 강제 재요청
  document.querySelectorAll("img.avatar-photo").forEach((img) => {
    if (img.getAttribute("src")?.includes(`/users/${userId}/avatar`)) {
      img.setAttribute("src", avatarSrc(userId));
    }
  });
}

// 사진이 처음 생긴 자리(이니셜만 있던 곳)까지 반영되도록, 아바타가 많은 화면을 다시 그린다.
function refreshVisibleCommunitySurfaces() {
  try {
    if (typeof loadCommunityFeed === "function") loadCommunityFeed();
    if (typeof loadHomeCommunityFeed === "function") loadHomeCommunityFeed();
  } catch (_error) {
    /* 새로고침 실패해도 아바타는 다음 렌더 때 갱신된다 */
  }
}

async function loadCommunityFeed() {
  const list = document.getElementById("communityFeedList");
  if (!list) return;
  list.innerHTML = '<p class="browse-loading">코스를 불러오는 중입니다...</p>';
  try {
    const data = await requestJson(`/api/community/posts?scope=${communityFeedScope}&sort=${communityFeedSort}`);
    renderCommunityFeedInto(list, data.posts || []);
  } catch (error) {
    list.innerHTML = `<p class="browse-loading">피드를 불러오지 못했어요. (${escapeHtml(error.message)})</p>`;
  }
}

// 홈 화면(Explore Korea 아래)에도 같은 피드를 보여준다.
async function loadHomeCommunityFeed() {
  const list = document.getElementById("homeCommunityFeed");
  if (!list) return;
  if (!getAuthToken()) {
    list.innerHTML = '<p class="browse-loading">로그인하면 다른 커플들의 코스와 이야기를 볼 수 있어요.</p>';
    return;
  }
  try {
    const data = await requestJson("/api/community/posts?scope=all&sort=recent");
    renderCommunityFeedInto(list, (data.posts || []).slice(0, 5));
  } catch (_error) {
    list.innerHTML = '<p class="browse-loading">피드를 불러오지 못했어요.</p>';
  }
}

async function loadProfileFeed(scope) {
  const list = document.getElementById("profileFeedList");
  if (!list || !getAuthToken()) return;
  list.innerHTML = '<p class="browse-loading">불러오는 중...</p>';
  try {
    const data = await requestJson(`/api/community/posts?scope=${scope}&sort=recent`);
    renderCommunityFeedInto(list, data.posts || [], {
      emptyText: scope === "mine" ? "아직 올린 피드가 없어요." : "아직 좋아요 누른 피드가 없어요.",
    });
  } catch (error) {
    list.innerHTML = `<p class="browse-loading">${escapeHtml(error.message)}</p>`;
  }
}

async function loadProfileCommunityStats() {
  const box = document.getElementById("profileCommunityStats");
  if (!box || !getAuthToken()) return;
  try {
    const stats = await requestJson("/api/community/my-stats");
    box.innerHTML = `
      <button class="profile-stat profile-stat-clickable" type="button" id="profileFollowerStat" title="팔로워 보기"><b>${stats.follower_count}</b><small>팔로워 ›</small></button>
      <button class="profile-stat profile-stat-clickable" type="button" id="profileFollowingStat" title="팔로잉 보기"><b>${stats.following_count}</b><small>팔로잉 ›</small></button>
      <div class="profile-stat"><b>${stats.received_like_count}</b><small>받은 ♥</small></div>
    `;
    document.getElementById("profileFollowerStat")?.addEventListener("click", () => openFollowListModal("followers", null, "팔로워"));
    document.getElementById("profileFollowingStat")?.addEventListener("click", () => openFollowListModal("following", null, "팔로잉"));
  } catch (_error) {
    box.innerHTML = "";
  }
}

function renderCommunityFeedInto(list, posts, options = {}) {
  if (!posts.length) {
    list.innerHTML = `<p class="browse-loading">${escapeHtml(options.emptyText || '아직 공유된 코스가 없어요. 추천 결과에서 "커뮤니티 공유"로 첫 코스를 올려보세요!')}</p>`;
    return;
  }
  list.innerHTML = posts
    .map((post) => {
      const transportLabel = COMMUNITY_TRANSPORT_LABELS[post.transport] || post.transport;
      const isCourse = post.post_type !== "text";
      const stops = isCourse ? (post.course.places || []).filter((place) => place.category !== "시작") : [];
      const visibleStops = stops.slice(0, 3);
      const restCount = stops.length - visibleStops.length;
      const imageMarkup = (post.images || []).length
        ? `<div class="community-post-images count-${post.images.length}">${post.images
          .map((name) => `<img src="${API_BASE_URL}/api/community/images/${encodeURIComponent(name)}" alt="게시물 사진" loading="lazy" />`)
          .join("")}</div>`
        : "";
      const metaLine = [
        isCourse ? post.region_label : "",
        isCourse ? transportLabel : "",
        post.author_tripti || "",
      ].filter(Boolean).join(" · ");
      // 커플 게시물이면 두 프로필(정우❤️연화)로, 아니면 작성자 1명(+연애중이면 하트).
      const isCouplePost = !!post.couple_partner;
      const avatarMarkup = isCouplePost
        ? `<span class="couple-post-avatars">
            <span class="community-avatar threads-avatar couple-av couple-av-front" data-post-author="${post.author_id}" role="button" tabindex="0" aria-label="${escapeHtml(post.author_nickname)} 프로필 보기">${avatarInnerHtml(post.author_id, post.author_nickname)}</span>
            <span class="community-avatar threads-avatar couple-av couple-av-back" data-post-author="${post.couple_partner.user_id}" role="button" tabindex="0" aria-label="${escapeHtml(post.couple_partner.nickname)} 프로필 보기">${avatarInnerHtml(post.couple_partner.user_id, post.couple_partner.nickname)}</span>
          </span>`
        : `<span class="community-avatar threads-avatar" data-post-author="${post.author_id}" role="button" tabindex="0" aria-label="${escapeHtml(post.author_nickname)} 프로필 보기">${avatarInnerHtml(post.author_id, post.author_nickname)}</span>`;
      const nickMarkup = isCouplePost
        ? `<b class="threads-nick couple-post-nick"><span data-post-author="${post.author_id}" role="button" tabindex="0">${escapeHtml(post.author_nickname)}</span> ❤️ <span data-post-author="${post.couple_partner.user_id}" role="button" tabindex="0">${escapeHtml(post.couple_partner.nickname)}</span></b>`
        : `<b class="threads-nick" data-post-author="${post.author_id}" role="button" tabindex="0">${escapeHtml(post.author_nickname)}${coupleHeart(!!post.author_has_partner)}</b>`;
      return `
        <article class="community-post-card threads-post${isCourse ? " is-course" : ""}" data-post-id="${post.id}"${isCourse ? ' role="button" tabindex="0" title="코스 상세 보기"' : ""}>
          ${avatarMarkup}
          <div class="threads-body">
            <div class="threads-top">
              ${nickMarkup}
              <small class="threads-time">${formatCommunityTime(post.created_at)}</small>
              ${post.visibility === "friends" ? '<span class="community-friends-badge">친구 공개</span>' : ""}
              <button class="threads-more" type="button" data-post-more="${post.id}" aria-label="게시물 메뉴">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.9"/><circle cx="12" cy="12" r="1.9"/><circle cx="19" cy="12" r="1.9"/></svg>
              </button>
            </div>
            ${metaLine ? `<small class="threads-meta">${escapeHtml(metaLine)}</small>` : ""}
            ${isCourse ? `<h3 class="community-post-title">${escapeHtml(post.title)}</h3>` : ""}
            ${post.comment ? `<p class="community-post-comment">${escapeHtml(post.comment)}</p>` : ""}
            ${imageMarkup}
            ${isCourse
          ? `<ol class="community-post-stops">
                  ${visibleStops.map((place, index) => `<li><span class="community-stop-dot">${index + 1}</span>${escapeHtml(place.name)} <small>${escapeHtml(place.category || "")}</small></li>`).join("")}
                  ${restCount > 0 ? `<li class="community-post-more">외 ${restCount}곳</li>` : ""}
                </ol>
                <p class="community-course-open-hint">카드를 누르면 코스 상세를 볼 수 있어요</p>`
          : ""}
            <div class="threads-actions">
              <button class="threads-action${post.liked_by_me ? " liked" : ""}" type="button" data-community-like="${post.id}" aria-label="좋아요">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.8 4.6c-1.7-1.7-4.5-1.6-6.1.2L12 7.5 9.3 4.8C7.7 3 4.9 2.9 3.2 4.6 1.3 6.5 1.4 9.6 3.4 11.5L12 20l8.6-8.5c2-1.9 2.1-5 .2-6.9Z"/></svg>
                <b>${post.like_count}</b>
              </button>
              <button class="threads-action" type="button" data-community-comments="${post.id}" aria-label="댓글">
                <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 11.5a8.38 8.38 0 0 1-9 8.4 8.5 8.5 0 0 1-3.4-.7L3 21l1.8-5.6a8.38 8.38 0 0 1-.8-3.9 8.5 8.5 0 0 1 8.5-8.5 8.38 8.38 0 0 1 8.5 8.5z"/></svg>
                <b>${post.comment_count ?? 0}</b>
              </button>
              ${isCourse
          ? `<button class="threads-action" type="button" data-community-save="${post.id}" aria-label="내 코스로 담기">
                    <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
                    <b>담기</b>
                  </button>`
          : ""}
            </div>
          </div>
        </article>
      `;
    })
    .join("");

  list.querySelectorAll("[data-post-author]").forEach((element) => {
    element.addEventListener("click", (event) => {
      event.stopPropagation();
      openUserProfileModal(Number(element.dataset.postAuthor));
    });
  });
  list.querySelectorAll("[data-post-more]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const post = posts.find((item) => String(item.id) === button.dataset.postMore);
      if (post) openPostMoreSheet(post);
    });
  });
  list.querySelectorAll(".community-post-card.is-course").forEach((card) => {
    card.addEventListener("click", (event) => {
      if (event.target.closest("button, a, [data-post-author]")) return;
      const post = posts.find((item) => String(item.id) === card.dataset.postId);
      if (post) openCommunityCourse(post);
    });
  });
  list.querySelectorAll("[data-community-like]").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        const result = await requestJson(`/api/community/posts/${button.dataset.communityLike}/like`, { method: "POST" });
        button.classList.toggle("liked", result.liked);
        button.querySelector("b").textContent = String(result.like_count);
      } catch (error) {
        alert(error.message);
      }
    });
  });
  list.querySelectorAll("[data-community-save]").forEach((button) => {
    button.addEventListener("click", () => {
      const post = posts.find((item) => String(item.id) === button.dataset.communitySave);
      if (!post) return;
      const course = { ...post.course, title: post.title, course_id: `community_${post.id}` };
      saveCourse(course);
      const label = button.querySelector("b");
      if (label) label.textContent = "담았어요!";
      button.disabled = true;
    });
  });
  list.querySelectorAll("[data-community-delete]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (!confirm("이 게시물을 삭제할까요?")) return;
      try {
        await requestJson(`/api/community/posts/${button.dataset.communityDelete}`, { method: "DELETE" });
        loadCommunityFeed();
        loadHomeCommunityFeed();
        if (!profileView.hidden) loadProfileFeed("mine");
      } catch (error) {
        alert(error.message);
      }
    });
  });
  list.querySelectorAll("[data-community-comments]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const post = posts.find((item) => String(item.id) === button.dataset.communityComments);
      openCommunityCommentsSheet(Number(button.dataset.communityComments), post, button);
    });
  });
  list.querySelectorAll("[data-community-report]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const post = posts.find((item) => String(item.id) === button.dataset.communityReport);
      openReportModal("post", Number(button.dataset.communityReport), `${post?.author_nickname || ""}님의 게시물`);
    });
  });
}

// ============================================================
// 커뮤니티 Phase 4 — 댓글 · 신고 · 차단
// ============================================================
function formatCommentTime(isoText) {
  return formatCommunityTime(isoText);
}

let activeCommentsPostId = null;
let activeCommentsCountButton = null;
let activeCommentsPost = null;
let activeCommentMentionUsers = new Map();

function commentAvatarText(nickname) {
  const text = String(nickname || "나").trim();
  return text.slice(0, 2) || "나";
}

function updateCommunityCommentCount(postId, count) {
  document.querySelectorAll(`[data-community-comments="${postId}"] b`).forEach((badge) => {
    badge.textContent = String(count);
  });
  if (activeCommentsCountButton?.dataset.communityComments === String(postId)) {
    activeCommentsCountButton.querySelector("b").textContent = String(count);
  }
}

function renderMyProfileAvatar() {
  const image = document.getElementById("profileAvatarImage");
  const initial = document.getElementById("profileAvatarInitial");
  const avatarUrl = currentUser?.profile_image || "";
  if (!image || !initial) return;
  if (avatarUrl) {
    image.src = avatarUrl;
    image.hidden = false;
    initial.hidden = true;
  } else {
    image.removeAttribute("src");
    image.hidden = true;
    initial.hidden = false;
    initial.textContent = (currentUser?.nickname || "?").slice(0, 2);
  }
}

function toggleNicknameEditor(open) {
  const view = document.getElementById("profileNicknameView");
  const form = document.getElementById("profileNicknameForm");
  const input = document.getElementById("profileNicknameInput");
  const message = document.getElementById("profileEditMessage");
  if (!view || !form) return;
  view.hidden = open;
  form.hidden = !open;
  if (message) message.textContent = "";
  if (open) {
    input.value = currentUser?.nickname || "";
    window.setTimeout(() => input.focus(), 0);
  }
}

async function saveProfileNickname(event) {
  event.preventDefault();
  const input = document.getElementById("profileNicknameInput");
  const message = document.getElementById("profileEditMessage");
  const nickname = input.value.trim();
  if (nickname.length < 2) {
    message.textContent = "닉네임은 2자 이상 입력해 주세요.";
    return;
  }
  try {
    const data = await requestJson("/api/auth/profile", {
      method: "PATCH",
      body: JSON.stringify({ nickname }),
    });
    updateAuthUi(data.user);
    toggleNicknameEditor(false);
    message.textContent = "닉네임을 변경했어요.";
  } catch (error) {
    message.textContent = readApiError(error.message);
  }
}

function resizeProfileImageToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const image = new Image();
      image.onload = () => {
        const maxSize = 720;
        const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.86));
      };
      image.onerror = () => reject(new Error("이미지를 읽을 수 없어요."));
      image.src = reader.result;
    };
    reader.onerror = () => reject(new Error("이미지를 읽을 수 없어요."));
    reader.readAsDataURL(file);
  });
}

async function handleProfileAvatarSelection(event) {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;
  const message = document.getElementById("profileEditMessage");
  try {
    const dataUrl = await resizeProfileImageToDataUrl(file);
    // 바로 저장하지 않고 보일 범위(크롭)를 먼저 정하게 한다 — 사진 뭉개짐 방지.
    openAvatarCropModal(dataUrl);
  } catch (error) {
    message.textContent = readApiError(error.message || error);
  }
}

// ---------- 프로필 사진 크롭(보일 범위 설정) ----------
// 원형 마스크가 덮인 정사각 영역 위에서 이미지를 끌어 옮기고 슬라이더로 확대한 뒤,
// 영역에 보이는 부분만 정사각(512px)으로 잘라 저장한다.
let cropImageNatural = { w: 0, h: 0 };
let cropScale = 1; // 화면 px / 원본 px
let cropMinScale = 1; // 영역을 꽉 채우는 최소 배율
let cropX = 0; // 이미지 좌상단의 영역 내 위치(px, 항상 0 이하)
let cropY = 0;
let cropDragPoint = null;

function openAvatarCropModal(dataUrl) {
  const modal = document.getElementById("avatarCropModal");
  const image = document.getElementById("avatarCropImage");
  modal.hidden = false; // 영역 크기를 잴 수 있게 먼저 연다
  image.onload = () => {
    cropImageNatural = { w: image.naturalWidth, h: image.naturalHeight };
    const areaSize = document.getElementById("avatarCropArea").clientWidth;
    cropMinScale = areaSize / Math.min(cropImageNatural.w, cropImageNatural.h);
    cropScale = cropMinScale;
    document.getElementById("avatarCropZoom").value = "100";
    cropX = (areaSize - cropImageNatural.w * cropScale) / 2;
    cropY = (areaSize - cropImageNatural.h * cropScale) / 2;
    applyCropTransform();
  };
  image.src = dataUrl;
}

function applyCropTransform() {
  const areaSize = document.getElementById("avatarCropArea").clientWidth;
  const width = cropImageNatural.w * cropScale;
  const height = cropImageNatural.h * cropScale;
  cropX = Math.min(0, Math.max(areaSize - width, cropX));
  cropY = Math.min(0, Math.max(areaSize - height, cropY));
  const image = document.getElementById("avatarCropImage");
  image.style.width = `${width}px`;
  image.style.height = `${height}px`;
  image.style.transform = `translate(${cropX}px, ${cropY}px)`;
}

function closeAvatarCropModal() {
  document.getElementById("avatarCropModal").hidden = true;
  document.getElementById("avatarCropImage").removeAttribute("src");
  cropDragPoint = null;
}

async function confirmAvatarCrop() {
  const image = document.getElementById("avatarCropImage");
  if (!image.src) return;
  const areaSize = document.getElementById("avatarCropArea").clientWidth;
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  // 영역에 보이는 부분을 원본 좌표로 환산해 정사각으로 자른다.
  const sx = -cropX / cropScale;
  const sy = -cropY / cropScale;
  const sw = areaSize / cropScale;
  canvas.getContext("2d").drawImage(image, sx, sy, sw, sw, 0, 0, size, size);
  const dataUrl = canvas.toDataURL("image/jpeg", 0.86);
  closeAvatarCropModal();
  await saveProfileAvatar(dataUrl);
}

async function saveProfileAvatar(profileImage) {
  const message = document.getElementById("profileEditMessage");
  try {
    message.textContent = "프로필 사진을 저장하는 중...";
    const data = await requestJson("/api/auth/profile", {
      method: "PATCH",
      body: JSON.stringify({ profile_image: profileImage }),
    });
    updateAuthUi(data.user);
    // 바뀐 사진을 앱 전체(피드·댓글·채팅·마이페이지 등)에 즉시 반영한다.
    refreshAvatarFor(data.user?.id || currentUser?.id, data.user?.nickname || currentUser?.nickname);
    refreshVisibleCommunitySurfaces();
    message.textContent = "프로필 사진을 변경했어요.";
  } catch (error) {
    message.textContent = readApiError(error.message || error);
  }
}

function bindAvatarCropEvents() {
  const area = document.getElementById("avatarCropArea");
  if (!area) return;
  area.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    cropDragPoint = { x: event.clientX, y: event.clientY };
    area.setPointerCapture(event.pointerId);
  });
  area.addEventListener("pointermove", (event) => {
    if (!cropDragPoint) return;
    cropX += event.clientX - cropDragPoint.x;
    cropY += event.clientY - cropDragPoint.y;
    cropDragPoint = { x: event.clientX, y: event.clientY };
    applyCropTransform();
  });
  const stopDrag = () => {
    cropDragPoint = null;
  };
  area.addEventListener("pointerup", stopDrag);
  area.addEventListener("pointercancel", stopDrag);
  document.getElementById("avatarCropZoom")?.addEventListener("input", (event) => {
    const areaSize = area.clientWidth;
    const newScale = cropMinScale * (Number(event.target.value) / 100);
    // 영역 중앙 기준으로 확대/축소해 보던 지점이 유지되게 한다.
    const centerX = (areaSize / 2 - cropX) / cropScale;
    const centerY = (areaSize / 2 - cropY) / cropScale;
    cropScale = newScale;
    cropX = areaSize / 2 - centerX * cropScale;
    cropY = areaSize / 2 - centerY * cropScale;
    applyCropTransform();
  });
  document.getElementById("avatarCropCancel")?.addEventListener("click", closeAvatarCropModal);
  document.querySelector("[data-close-avatar-crop]")?.addEventListener("click", closeAvatarCropModal);
  document.getElementById("avatarCropConfirm")?.addEventListener("click", confirmAvatarCrop);
}

async function openLikedPostsModal() {
  const modal = document.getElementById("likedPostsModal");
  const list = document.getElementById("likedPostsList");
  if (!modal || !list) return;
  modal.hidden = false;
  list.innerHTML = '<p class="browse-loading">불러오는 중...</p>';
  try {
    const data = await requestJson("/api/community/posts?scope=liked&sort=recent");
    renderCommunityFeedInto(list, data.posts || [], { emptyText: "아직 좋아요 누른 피드가 없어요." });
  } catch (error) {
    list.innerHTML = `<p class="browse-loading">${escapeHtml(readApiError(error.message))}</p>`;
  }
}

function closeLikedPostsModal() {
  document.getElementById("likedPostsModal").hidden = true;
}

function renderProfileAccountInfo() {
  const loginId = document.getElementById("profileAccountLoginId");
  const email = document.getElementById("profileAccountEmail");
  const phone = document.getElementById("profileAccountPhone");
  if (loginId) loginId.textContent = currentUser?.login_id || "-";
  if (email) email.textContent = currentUser?.email || "-";
  if (phone) phone.textContent = currentUser?.phone || "등록된 전화번호 없음";
}

function openProfileAccountModal() {
  const modal = document.getElementById("profileAccountModal");
  if (!modal) return;
  renderProfileAccountInfo();
  modal.hidden = false;
}

function closeProfileAccountModal() {
  const modal = document.getElementById("profileAccountModal");
  if (modal) modal.hidden = true;
}

function openCommunityCommentsSheet(postId, post = null, countButton = null) {
  activeCommentsPostId = postId;
  activeCommentsPost = post || null;
  activeCommentsCountButton = countButton;
  const sheet = document.getElementById("communityCommentsSheet");
  const list = document.getElementById("commentsSheetList");
  const input = document.getElementById("commentsSheetInput");
  const avatar = document.getElementById("commentsSheetAvatar");
  if (!sheet || !list || !input) return;
  avatar.innerHTML = avatarInnerHtml(currentUser?.id, currentUser?.nickname);
  input.value = "";
  input.placeholder = `${post?.author_nickname ? `${post.author_nickname}님에게 ` : ""}댓글 추가`;
  list.innerHTML = '<p class="browse-loading">댓글을 불러오는 중...</p>';
  sheet.hidden = false;
  document.body.classList.add("comments-sheet-open");
  window.setTimeout(() => input.focus({ preventScroll: true }), 120);
  loadCommentsSheet();
}

function closeCommunityCommentsSheet() {
  const sheet = document.getElementById("communityCommentsSheet");
  if (sheet) {
    sheet.hidden = true;
    const card = sheet.querySelector(".comments-sheet");
    if (card) card.style.transform = "";
  }
  document.body.classList.remove("comments-sheet-open");
  activeCommentsPostId = null;
  activeCommentsCountButton = null;
  activeCommentsPost = null;
  activeCommentMentionUsers = new Map();
}

// 댓글 시트를 그립/헤더에서 아래로 끌어내리면 닫힌다(인스타그램 방식).
// 댓글 목록 스크롤과 충돌하지 않게 그립·헤더 영역에서 시작한 터치만 드래그로 본다.
function bindCommentsSheetDrag() {
  const backdrop = document.getElementById("communityCommentsSheet");
  const sheet = backdrop?.querySelector(".comments-sheet");
  if (!sheet) return;
  let startY = null;
  let delta = 0;
  sheet.addEventListener(
    "touchstart",
    (event) => {
      if (!event.target.closest(".comments-sheet-grip, .comments-sheet-head")) return;
      startY = event.touches[0].clientY;
      delta = 0;
      sheet.style.transition = "none";
    },
    { passive: true },
  );
  sheet.addEventListener(
    "touchmove",
    (event) => {
      if (startY === null) return;
      delta = Math.max(0, event.touches[0].clientY - startY);
      sheet.style.transform = delta ? `translateY(${delta}px)` : "";
      if (delta > 0) event.preventDefault();
    },
    { passive: false },
  );
  const finishDrag = () => {
    if (startY === null) return;
    sheet.style.transition = "";
    const shouldClose = delta > 110;
    sheet.style.transform = "";
    startY = null;
    delta = 0;
    if (shouldClose) closeCommunityCommentsSheet();
  };
  sheet.addEventListener("touchend", finishDrag);
  sheet.addEventListener("touchcancel", finishDrag);
}

async function loadCommentsSheet() {
  if (!activeCommentsPostId) return;
  const list = document.getElementById("commentsSheetList");
  list.innerHTML = '<p class="browse-loading">댓글을 불러오는 중...</p>';
  try {
    const data = await requestJson(`/api/community/posts/${activeCommentsPostId}/comments`);
    renderCommentsSheet(data.comments || []);
  } catch (error) {
    list.innerHTML = `<p class="browse-loading">${escapeHtml(readApiError(error.message))}</p>`;
  }
}

function renderCommentsSheet(comments) {
  const list = document.getElementById("commentsSheetList");
  updateCommunityCommentCount(activeCommentsPostId, comments.length);
  activeCommentMentionUsers = buildCommentMentionUsers(comments);
  if (!comments.length) {
    list.innerHTML = `
      <div class="comments-sheet-empty">
        <b>아직 댓글이 없어요</b>
        <span>이 코스에 첫 반응을 남겨보세요.</span>
      </div>
    `;
    return;
  }
  list.innerHTML = comments
    .map(
      (comment) => `
        <article class="comments-sheet-comment-row">
          <button class="community-avatar comment-avatar comments-sheet-comment-avatar" type="button" data-comment-profile="${comment.author_id}" aria-label="${escapeHtml(comment.author_nickname)} 프로필 보기">${avatarInnerHtml(comment.author_id, comment.author_nickname)}</button>
          <div class="comments-sheet-comment-body">
            <p>
              <button class="comments-sheet-author" type="button" data-comment-profile="${comment.author_id}">${escapeHtml(comment.author_nickname)}</button>
              <small>${formatCommentTime(comment.created_at)}</small>
            </p>
            <div class="comments-sheet-comment-text">${renderCommentTextWithMentions(comment.content)}</div>
            <div class="comments-sheet-comment-actions">
              <button type="button" data-comment-reply="${escapeHtml(comment.author_nickname)}" data-comment-reply-id="${comment.author_id}">답글 달기</button>
              ${comment.can_delete ? `<button type="button" data-comment-delete="${comment.id}">삭제</button>` : ""}
              ${!comment.is_mine ? `<button type="button" data-comment-report="${comment.id}" data-comment-author="${escapeHtml(comment.author_nickname)}">신고</button>` : ""}
            </div>
          </div>
          <button class="comments-sheet-heart" type="button" aria-label="댓글 좋아요" aria-pressed="false" data-comment-heart>
            <svg viewBox="0 0 24 24" width="23" height="23" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.8 4.6c-1.7-1.7-4.5-1.6-6.1.2L12 7.5 9.3 4.8C7.7 3 4.9 2.9 3.2 4.6 1.3 6.5 1.4 9.6 3.4 11.5L12 20l8.6-8.5c2-1.9 2.1-5 .2-6.9Z"/></svg>
          </button>
        </article>
      `,
    )
    .join("");
  bindCommentsSheetRows();
}

function normalizeMentionName(name) {
  return String(name || "").trim().replace(/^@+/, "").toLowerCase();
}

function buildCommentMentionUsers(comments) {
  const users = new Map();
  if (activeCommentsPost?.author_nickname && activeCommentsPost?.author_id) {
    users.set(normalizeMentionName(activeCommentsPost.author_nickname), {
      user_id: activeCommentsPost.author_id,
      nickname: activeCommentsPost.author_nickname,
    });
  }
  comments.forEach((comment) => {
    if (comment.author_nickname && comment.author_id) {
      users.set(normalizeMentionName(comment.author_nickname), {
        user_id: comment.author_id,
        nickname: comment.author_nickname,
      });
    }
  });
  return users;
}

function renderCommentTextWithMentions(text) {
  const value = String(text || "");
  const mentionPattern = /@([A-Za-z0-9._가-힣ㄱ-ㅎㅏ-ㅣ]+)/g;
  let result = "";
  let cursor = 0;
  for (const match of value.matchAll(mentionPattern)) {
    const index = match.index ?? 0;
    const mention = match[1];
    result += escapeHtml(value.slice(cursor, index));
    result += `<button class="comments-sheet-mention" type="button" data-comment-mention="${escapeHtml(mention)}">@${escapeHtml(mention)}</button>`;
    cursor = index + match[0].length;
  }
  result += escapeHtml(value.slice(cursor));
  return result;
}

async function openMentionProfile(nickname) {
  const normalized = normalizeMentionName(nickname);
  const knownUser = activeCommentMentionUsers.get(normalized);
  if (knownUser?.user_id) {
    closeCommunityCommentsSheet();
    openUserProfileModal(Number(knownUser.user_id));
    return;
  }
  try {
    const data = await requestJson(`/api/community/users/search?q=${encodeURIComponent(nickname)}`);
    const users = data.users || [];
    const exactUser = users.find((user) => normalizeMentionName(user.nickname) === normalized) || users[0];
    if (!exactUser?.user_id) {
      alert(`${nickname} 사용자를 찾지 못했어요.`);
      return;
    }
    closeCommunityCommentsSheet();
    openUserProfileModal(Number(exactUser.user_id));
  } catch (error) {
    alert(readApiError(error.message));
  }
}

function bindCommentsSheetRows() {
  const list = document.getElementById("commentsSheetList");
  list.querySelectorAll("[data-comment-profile]").forEach((item) => {
    item.addEventListener("click", () => {
      const userId = Number(item.dataset.commentProfile);
      closeCommunityCommentsSheet();
      openUserProfileModal(userId);
    });
  });
  list.querySelectorAll("[data-comment-reply]").forEach((button) => {
    button.addEventListener("click", () => {
      const input = document.getElementById("commentsSheetInput");
      activeCommentMentionUsers.set(normalizeMentionName(button.dataset.commentReply), {
        user_id: Number(button.dataset.commentReplyId),
        nickname: button.dataset.commentReply,
      });
      input.value = `@${button.dataset.commentReply} `;
      input.focus();
    });
  });
  list.querySelectorAll("[data-comment-mention]").forEach((button) => {
    button.addEventListener("click", () => openMentionProfile(button.dataset.commentMention));
  });
  list.querySelectorAll("[data-comment-heart]").forEach((button) => {
    button.addEventListener("click", () => {
      const pressed = button.getAttribute("aria-pressed") === "true";
      button.setAttribute("aria-pressed", String(!pressed));
      button.classList.toggle("liked", !pressed);
    });
  });
  list.querySelectorAll("[data-comment-delete]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (!confirm("이 댓글을 삭제할까요?")) return;
      try {
        await requestJson(`/api/community/comments/${button.dataset.commentDelete}`, { method: "DELETE" });
        loadCommentsSheet();
      } catch (error) {
        alert(readApiError(error.message));
      }
    });
  });
  list.querySelectorAll("[data-comment-report]").forEach((button) => {
    button.addEventListener("click", () => {
      closeCommunityCommentsSheet();
      openReportModal("comment", Number(button.dataset.commentReport), `${button.dataset.commentAuthor}님의 댓글`);
    });
  });
}

async function submitCommentsSheet(event) {
  event.preventDefault();
  if (!activeCommentsPostId) return;
  const input = document.getElementById("commentsSheetInput");
  const submitButton = document.getElementById("commentsSheetSubmit");
  const content = input.value.trim();
  if (!content) return;
  submitButton.disabled = true;
  try {
    await requestJson(`/api/community/posts/${activeCommentsPostId}/comments`, {
      method: "POST",
      body: JSON.stringify({ content }),
    });
    input.value = "";
    await loadCommentsSheet();
    document.getElementById("commentsSheetList")?.scrollTo({ top: 999999, behavior: "smooth" });
  } catch (error) {
    alert(readApiError(error.message));
  } finally {
    submitButton.disabled = false;
    input.focus();
  }
}

function insertCommentEmoji(emoji) {
  const input = document.getElementById("commentsSheetInput");
  if (!input) return;
  const start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? input.value.length;
  input.value = `${input.value.slice(0, start)}${emoji}${input.value.slice(end)}`;
  const cursor = start + emoji.length;
  input.focus();
  input.setSelectionRange(cursor, cursor);
}

async function loadCommentsInto(box, postId, countButton) {
  box.innerHTML = '<p class="browse-loading">댓글을 불러오는 중...</p>';
  try {
    const data = await requestJson(`/api/community/posts/${postId}/comments`);
    renderCommentsBox(box, postId, data.comments || [], countButton);
  } catch (error) {
    box.innerHTML = `<p class="browse-loading">${escapeHtml(readApiError(error.message))}</p>`;
  }
}

function renderCommentsBox(box, postId, comments, countButton) {
  if (countButton) countButton.querySelector("b").textContent = String(comments.length);
  const rows = comments
    .map(
      (comment) => `
        <div class="community-comment-row">
          <span class="community-avatar comment-avatar" data-comment-profile="${comment.author_id}" role="button" tabindex="0">${avatarInnerHtml(comment.author_id, comment.author_nickname)}</span>
          <div class="comment-body">
            <b>${escapeHtml(comment.author_nickname)} <small>· ${formatCommentTime(comment.created_at)}</small></b>
            <p>${escapeHtml(comment.content)}</p>
          </div>
          <span class="comment-actions">
            ${comment.can_delete ? `<button type="button" data-comment-delete="${comment.id}">삭제</button>` : ""}
            ${!comment.is_mine ? `<button type="button" data-comment-report="${comment.id}" data-comment-author="${escapeHtml(comment.author_nickname)}">신고</button>` : ""}
          </span>
        </div>
      `,
    )
    .join("");
  box.innerHTML = `
    <div class="community-comment-list">${rows || '<p class="comment-empty">첫 댓글을 남겨보세요!</p>'}</div>
    <div class="community-comment-input">
      <input type="text" maxlength="300" placeholder="댓글 달기..." />
      <button class="primary-button compact-button" type="button">등록</button>
    </div>
  `;
  const input = box.querySelector(".community-comment-input input");
  const submit = async () => {
    const content = input.value.trim();
    if (!content) return;
    try {
      await requestJson(`/api/community/posts/${postId}/comments`, {
        method: "POST",
        body: JSON.stringify({ content }),
      });
      loadCommentsInto(box, postId, countButton);
    } catch (error) {
      alert(readApiError(error.message));
    }
  };
  box.querySelector(".community-comment-input button").addEventListener("click", submit);
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      submit();
    }
  });
  box.querySelectorAll("[data-comment-delete]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (!confirm("이 댓글을 삭제할까요?")) return;
      try {
        await requestJson(`/api/community/comments/${button.dataset.commentDelete}`, { method: "DELETE" });
        loadCommentsInto(box, postId, countButton);
      } catch (error) {
        alert(readApiError(error.message));
      }
    });
  });
  box.querySelectorAll("[data-comment-report]").forEach((button) => {
    button.addEventListener("click", () => {
      openReportModal("comment", Number(button.dataset.commentReport), `${button.dataset.commentAuthor}님의 댓글`);
    });
  });
  box.querySelectorAll("[data-comment-profile]").forEach((avatar) => {
    avatar.addEventListener("click", () => openUserProfileModal(Number(avatar.dataset.commentProfile)));
  });
}

// ---------- 게시물 ⋯ 메뉴 (Threads식 바텀시트) ----------
// 내 글이면 [삭제], 남의 글이면 [차단, 신고하기]만 — 기능에 있는 항목만 노출한다.
function openPostMoreSheet(post) {
  const sheet = document.getElementById("postMoreSheet");
  const actions = document.getElementById("postMoreActions");
  const rows = [];
  if (post.is_mine) {
    rows.push(`
      <button type="button" class="post-more-row is-danger" data-more-delete>
        삭제
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
      </button>
    `);
  } else {
    rows.push(`
      <button type="button" class="post-more-row" data-more-block>
        차단
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="m5.5 5.5 13 13"/></svg>
      </button>
      <button type="button" class="post-more-row is-danger" data-more-report>
        신고하기
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 8v4"/><path d="M12 16h.01"/></svg>
      </button>
    `);
  }
  actions.innerHTML = rows.join("");
  actions.querySelector("[data-more-delete]")?.addEventListener("click", async () => {
    closePostMoreSheet();
    if (!confirm("이 게시물을 삭제할까요?")) return;
    try {
      await requestJson(`/api/community/posts/${post.id}`, { method: "DELETE" });
      loadCommunityFeed();
      loadHomeCommunityFeed();
      if (!profileView.hidden) loadProfileFeed("mine");
    } catch (error) {
      alert(readApiError(error.message));
    }
  });
  actions.querySelector("[data-more-block]")?.addEventListener("click", async () => {
    closePostMoreSheet();
    await blockUser(post.author_id, post.author_nickname);
  });
  actions.querySelector("[data-more-report]")?.addEventListener("click", () => {
    closePostMoreSheet();
    openReportModal("post", post.id, `${post.author_nickname}님의 게시물`);
  });
  sheet.hidden = false;
}

function closePostMoreSheet() {
  document.getElementById("postMoreSheet").hidden = true;
}

// ---------- 알림 (홈 우측 상단 종 아이콘) ----------
const NOTIF_TEXTS = {
  like: "님이 회원님의 게시물을 좋아해요 ♥",
  comment: "님이 회원님의 게시물에 댓글을 남겼어요",
  message: "님이 메시지를 보냈어요",
  follow: "님이 회원님을 팔로우해요",
  friend_request: "님이 회원님을 팔로우해요",
  friend_accept: "님과 맞팔로우가 되었어요",
  couple_request: "님이 연인을 신청했어요 💌",
  couple_accept: "님이 연인 신청을 수락했어요 💑",
  couple_breakup: "님과 헤어졌어요",
};

function updateNotificationDot() {
  const dot = document.getElementById("homeNotifDot");
  if (dot) dot.hidden = !(notifUnreadCount > 0);
}

async function refreshNotificationDot() {
  if (!getAuthToken()) {
    notifUnreadCount = 0;
    updateNotificationDot();
    return;
  }
  try {
    const data = await requestJson("/api/community/notifications/unread");
    notifUnreadCount = data.count || 0;
    updateNotificationDot();
  } catch (_error) {
    /* 알림 점은 보조 정보라 실패해도 조용히 넘어간다 */
  }
}

async function openNotificationsModal() {
  if (!getAuthToken()) {
    showPortalView("login");
    return;
  }
  const modal = document.getElementById("notificationsModal");
  const list = document.getElementById("notificationsList");
  modal.hidden = false;
  updatePushEnableButton();
  list.innerHTML = '<p class="browse-loading">불러오는 중...</p>';
  try {
    const data = await requestJson("/api/community/notifications");
    const items = data.notifications || [];
    // 열어봤으면 모두 읽음 처리하고 종의 빨간 점을 끈다.
    if (data.unread_count > 0) {
      requestJson("/api/community/notifications/read", { method: "POST" }).catch(() => { });
    }
    notifUnreadCount = 0;
    updateNotificationDot();
    if (!items.length) {
      list.innerHTML = '<p class="browse-loading">아직 알림이 없어요. 친구들과 코스를 공유해 보세요!</p>';
      return;
    }
    list.innerHTML = items
      .map(
        (item) => `
        <button class="notif-row${item.read ? "" : " is-unread"}" type="button"
          data-notif-type="${item.type}" data-notif-actor="${item.actor_id}"
          data-notif-actor-name="${escapeHtml(item.actor_nickname)}" data-notif-post="${item.post_id ?? ""}">
          <span class="community-avatar">${avatarInnerHtml(item.actor_id, item.actor_nickname)}</span>
          <span class="notif-text"><b>${escapeHtml(item.actor_nickname)}</b>${NOTIF_TEXTS[item.type] || "님의 새 소식이 있어요"} <small>${formatCommunityTime(item.created_at)}</small></span>
          ${item.read ? "" : '<span class="notif-unread-dot"></span>'}
        </button>
      `,
      )
      .join("");
    list.querySelectorAll(".notif-row").forEach((row) => {
      row.addEventListener("click", () => {
        const type = row.dataset.notifType;
        closeNotificationsModal();
        if (type === "message") {
          openChatModal(row.dataset.notifActor, row.dataset.notifActorName);
        } else if (
          type === "follow" || type === "friend_request" || type === "friend_accept" ||
          type === "couple_request" || type === "couple_accept" || type === "couple_breakup"
        ) {
          openUserProfileModal(Number(row.dataset.notifActor));
        } else if (type === "comment" && row.dataset.notifPost) {
          showPortalView("community");
          openCommunityCommentsSheet(Number(row.dataset.notifPost));
        } else {
          showPortalView("community");
        }
      });
    });
  } catch (error) {
    list.innerHTML = `<p class="browse-loading">${escapeHtml(readApiError(error.message))}</p>`;
  }
}

function closeNotificationsModal() {
  document.getElementById("notificationsModal").hidden = true;
}

// ====================== 채팅 탭(통합 목록 + 친구) + 단체 채팅방 ======================
let activeChatHubSeg = "chats";

function loadChatHub() {
  switchChatHubSeg(activeChatHubSeg);
}

function switchChatHubSeg(seg) {
  if (seg !== "chats" && seg !== "friends") seg = "chats";
  activeChatHubSeg = seg;
  document.querySelectorAll("[data-chathub-seg]").forEach((button) => {
    button.classList.toggle("active", button.dataset.chathubSeg === seg);
  });
  const chatsPanel = document.getElementById("chatHubChats");
  const friendsPanel = document.getElementById("chatHubFriends");
  if (chatsPanel) chatsPanel.hidden = seg !== "chats";
  if (friendsPanel) friendsPanel.hidden = seg !== "friends";
  if (seg === "chats") loadChatList();
  else loadChatHubFriends();
}

async function loadChatList() {
  const box = document.getElementById("chatListContainer");
  if (!box || !getAuthToken()) return;
  try {
    const data = await requestJson("/api/community/chats");
    const chats = data.chats || [];
    if (!chats.length) {
      box.innerHTML = '<p class="browse-loading">아직 채팅이 없어요. 친구 탭에서 대화를 시작하거나 ＋로 단체방을 만들어 보세요!</p>';
      return;
    }
    box.innerHTML = chats.map(renderChatListRow).join("");
    box.querySelectorAll("[data-chat-direct]").forEach((row) => {
      row.addEventListener("click", () => openChatModal(row.dataset.chatDirect, row.dataset.chatName));
    });
    box.querySelectorAll("[data-chat-room]").forEach((row) => {
      row.addEventListener("click", () => openRoomChat(Number(row.dataset.chatRoom), row.dataset.chatName));
    });
  } catch (error) {
    box.innerHTML = `<p class="browse-loading">${escapeHtml(readApiError(error.message))}</p>`;
  }
}

const ROOM_ICON_SVG =
  '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>';

function renderChatListRow(chat) {
  const unread = chat.unread_count > 0
    ? `<span class="chat-list-unread">${chat.unread_count > 99 ? "99+" : chat.unread_count}</span>`
    : "";
  const time = chat.last_message_at ? formatCommunityTime(chat.last_message_at) : "";
  const last = escapeHtml(chat.last_message || "대화를 시작해 보세요");
  if (chat.type === "room") {
    return `
      <button class="chat-list-row" type="button" data-chat-room="${chat.room_id}" data-chat-name="${escapeHtml(chat.name)}">
        <span class="community-avatar chat-list-avatar room-avatar" aria-hidden="true">${ROOM_ICON_SVG}</span>
        <span class="chat-list-info">
          <b>${escapeHtml(chat.name)} <small class="chat-list-count">${chat.member_count}</small></b>
          <small class="chat-list-last">${last}</small>
        </span>
        <span class="chat-list-meta"><small>${time}</small>${unread}</span>
      </button>
    `;
  }
  return `
    <button class="chat-list-row" type="button" data-chat-direct="${chat.partner_id}" data-chat-name="${escapeHtml(chat.name)}">
      <span class="community-avatar chat-list-avatar">${avatarInnerHtml(chat.partner_id, chat.name)}</span>
      <span class="chat-list-info">
        <b>${escapeHtml(chat.name)}</b>
        <small class="chat-list-last">${last}</small>
      </span>
      <span class="chat-list-meta"><small>${time}</small>${unread}</span>
    </button>
  `;
}

async function loadChatHubFriends() {
  const list = document.getElementById("chatHubFriendList");
  if (!list || !getAuthToken()) return;
  list.innerHTML = '<p class="browse-loading">불러오는 중...</p>';
  try {
    const data = await requestJson("/api/community/following");
    const users = data.users || [];
    if (!users.length) {
      list.innerHTML = '<p class="browse-loading">아직 팔로우한 친구가 없어요. 커뮤니티에서 친구를 찾아 팔로우해 보세요!</p>';
      return;
    }
    list.innerHTML = users.map((user) => renderFriendUserRow(user, followRowActions(user))).join("");
    bindFollowActionButtons(list, loadChatHubFriends);
    bindFriendChatButtons(list);
    bindProfileRowClicks(list);
  } catch (error) {
    list.innerHTML = `<p class="browse-loading">${escapeHtml(readApiError(error.message))}</p>`;
  }
}

// ----- 단체 채팅방 만들기(친구 다중 선택) -----
let createRoomSelected = new Set();

async function openCreateRoomModal() {
  if (!getAuthToken()) {
    showPortalView("login");
    return;
  }
  createRoomSelected = new Set();
  document.getElementById("createRoomName").value = "";
  updateCreateRoomCount();
  const list = document.getElementById("createRoomFriendList");
  list.innerHTML = '<p class="browse-loading">불러오는 중...</p>';
  document.getElementById("createRoomModal").hidden = false;
  try {
    const data = await requestJson("/api/community/following");
    const friends = (data.users || []).filter((user) => user.mutual);
    if (!friends.length) {
      list.innerHTML = '<p class="browse-loading">맞팔로우(서로 팔로우)한 친구가 있어야 단체방을 만들 수 있어요.</p>';
      return;
    }
    list.innerHTML = friends
      .map(
        (user) => `
      <button class="create-room-friend" type="button" data-room-friend="${user.user_id}">
        <span class="community-avatar">${avatarInnerHtml(user.user_id, user.nickname)}</span>
        <b>${escapeHtml(user.nickname)}</b>
        <span class="create-room-check" aria-hidden="true">✓</span>
      </button>`,
      )
      .join("");
    list.querySelectorAll("[data-room-friend]").forEach((button) => {
      button.addEventListener("click", () => {
        const id = Number(button.dataset.roomFriend);
        if (createRoomSelected.has(id)) {
          createRoomSelected.delete(id);
          button.classList.remove("selected");
        } else {
          createRoomSelected.add(id);
          button.classList.add("selected");
        }
        updateCreateRoomCount();
      });
    });
  } catch (error) {
    list.innerHTML = `<p class="browse-loading">${escapeHtml(readApiError(error.message))}</p>`;
  }
}

function updateCreateRoomCount() {
  const el = document.getElementById("createRoomCount");
  if (el) el.textContent = `${createRoomSelected.size}명 선택`;
}

function closeCreateRoomModal() {
  document.getElementById("createRoomModal").hidden = true;
}

async function submitCreateRoom() {
  if (createRoomSelected.size < 2) {
    alert("단체 채팅방은 친구를 2명 이상 선택해야 해요.");
    return;
  }
  const button = document.getElementById("createRoomConfirm");
  button.disabled = true;
  try {
    const room = await requestJson("/api/community/chat-rooms", {
      method: "POST",
      body: JSON.stringify({
        member_ids: Array.from(createRoomSelected),
        name: document.getElementById("createRoomName").value.trim(),
      }),
    });
    closeCreateRoomModal();
    switchChatHubSeg("chats");
    openRoomChat(room.room_id, room.name);
  } catch (error) {
    alert(readApiError(error.message));
  } finally {
    button.disabled = false;
  }
}

// ----- 단체 채팅방 대화창 -----
let roomChatId = null;
let roomChatName = "";
let roomChatLastMessageId = 0;
let roomChatLastDateKey = "";
let roomChatAttachedCourse = null;
let roomChatAttachedImages = [];
let roomChatPollTimer = null;
let roomChatFetchInFlight = false;

async function openRoomChat(roomId, name) {
  if (!getAuthToken()) {
    showPortalView("login");
    return;
  }
  roomChatId = Number(roomId);
  roomChatName = name || "";
  roomChatLastMessageId = 0;
  roomChatLastDateKey = "";
  roomChatAttachedCourse = null;
  roomChatAttachedImages = [];
  document.getElementById("roomChatName").textContent = roomChatName;
  document.getElementById("roomChatMembers").textContent = "";
  document.getElementById("roomChatMessages").innerHTML = '<p class="browse-loading">불러오는 중...</p>';
  document.getElementById("roomChatCoursePicker").hidden = true;
  document.getElementById("roomChatPhotoMenu").hidden = true;
  document.getElementById("roomChatCameraInput").value = "";
  document.getElementById("roomChatGalleryInput").value = "";
  document.getElementById("roomChatInput").value = "";
  updateRoomChatAttachedPreview();
  document.getElementById("roomChatModal").hidden = false;
  await fetchRoomMessages({ initial: true });
  if (roomChatPollTimer) clearInterval(roomChatPollTimer);
  roomChatPollTimer = setInterval(fetchRoomMessages, 3000);
}

function closeRoomChat() {
  if (roomChatPollTimer) {
    clearInterval(roomChatPollTimer);
    roomChatPollTimer = null;
  }
  roomChatId = null;
  roomChatAttachedCourse = null;
  roomChatAttachedImages = [];
  document.getElementById("roomChatModal").hidden = true;
  refreshChatTabBadge();
}

async function fetchRoomMessages(options = {}) {
  if (roomChatId === null || roomChatFetchInFlight) return;
  roomChatFetchInFlight = true;
  try {
    const data = await requestJson(
      `/api/community/chat-rooms/${roomChatId}/messages?after_id=${roomChatLastMessageId}`,
    );
    if (data.room) {
      roomChatName = data.room.name;
      document.getElementById("roomChatName").textContent = data.room.name;
      document.getElementById("roomChatMembers").textContent =
        `${data.room.member_count}명 · ` + (data.room.members || []).map((m) => m.nickname).join(", ");
    }
    appendRoomMessages(data.messages || []);
  } catch (error) {
    if (options.initial) {
      document.getElementById("roomChatMessages").innerHTML =
        `<p class="browse-loading">${escapeHtml(readApiError(error.message))}</p>`;
    }
  } finally {
    roomChatFetchInFlight = false;
  }
}

function roomImagesMarkup(message) {
  if (!(message.images || []).length) return "";
  return `<div class="chat-bubble-images count-${message.images.length}">${message.images
    .map(
      (name) =>
        `<img src="${API_BASE_URL}/api/community/images/${encodeURIComponent(name)}" alt="보낸 사진" loading="lazy" />`,
    )
    .join("")}</div>`;
}

function appendRoomMessages(messages) {
  const box = document.getElementById("roomChatMessages");
  const fresh = messages.filter((message) => message.id > roomChatLastMessageId);
  if (!fresh.length) return;
  if (box.querySelector(".browse-loading")) box.innerHTML = "";
  let html = "";
  fresh.forEach((message) => {
    const dateKey = chatDateKey(message.created_at);
    if (dateKey && dateKey !== roomChatLastDateKey) {
      html += `<div class="chat-date-divider"><span>${escapeHtml(chatDateLabel(message.created_at))}</span></div>`;
      roomChatLastDateKey = dateKey;
    }
    const inner = `
      ${message.course ? chatCourseCardMarkup(message) : ""}
      ${roomImagesMarkup(message)}
      ${message.content ? `<p>${escapeHtml(message.content)}</p>` : ""}`;
    if (message.is_mine) {
      html += `
        <div class="chat-bubble-row mine">
          <div class="chat-bubble" data-room-bubble-id="${message.id}">${inner}</div>
          <span class="chat-meta"><small class="chat-time">${formatChatTime(message.created_at)}</small></span>
        </div>`;
    } else {
      html += `
        <div class="chat-bubble-row theirs room-bubble-row">
          <button class="community-avatar room-msg-avatar" type="button" data-room-msg-profile="${message.sender_id}" aria-label="${escapeHtml(message.sender_nickname)} 프로필 보기">${avatarInnerHtml(message.sender_id, message.sender_nickname)}</button>
          <div class="room-msg-body">
            <small class="room-msg-sender">${escapeHtml(message.sender_nickname)}</small>
            <div class="room-msg-bubble-line">
              <div class="chat-bubble" data-room-bubble-id="${message.id}">${inner}</div>
              <span class="chat-meta"><small class="chat-time">${formatChatTime(message.created_at)}</small></span>
            </div>
          </div>
        </div>`;
    }
  });
  box.insertAdjacentHTML("beforeend", html);
  fresh.forEach((message) => {
    if (message.course) {
      box
        .querySelector(`[data-room-bubble-id="${message.id}"] [data-chat-course="${message.id}"]`)
        ?.addEventListener("click", () => openChatCourse(message));
    }
  });
  box.querySelectorAll("[data-room-msg-profile]").forEach((button) => {
    button.addEventListener("click", () => openUserProfileModal(Number(button.dataset.roomMsgProfile)));
  });
  roomChatLastMessageId = fresh[fresh.length - 1].id;
  box.scrollTop = box.scrollHeight;
}

async function sendRoomMessage() {
  if (roomChatId === null) return;
  const input = document.getElementById("roomChatInput");
  const content = input.value.trim();
  if (!content && !roomChatAttachedCourse && !roomChatAttachedImages.length) return;
  const button = document.getElementById("roomChatSendButton");
  button.disabled = true;
  try {
    const message = await requestJson(`/api/community/chat-rooms/${roomChatId}/messages`, {
      method: "POST",
      body: JSON.stringify({ content, course: roomChatAttachedCourse, images: roomChatAttachedImages }),
    });
    input.value = "";
    roomChatAttachedCourse = null;
    roomChatAttachedImages = [];
    updateRoomChatAttachedPreview();
    appendRoomMessages([message]);
  } catch (error) {
    alert(readApiError(error.message));
  } finally {
    button.disabled = false;
    input.focus();
  }
}

function toggleRoomChatPhotoMenu() {
  const menu = document.getElementById("roomChatPhotoMenu");
  document.getElementById("roomChatCoursePicker").hidden = true;
  menu.hidden = !menu.hidden;
}

async function handleRoomChatImageSelection(event) {
  const files = Array.from(event.target.files || []);
  event.target.value = "";
  if (!files.length) return;
  try {
    const dataUrls = await Promise.all(files.map(resizeImageToDataUrl));
    roomChatAttachedImages = [...roomChatAttachedImages, ...dataUrls].slice(0, 4);
    updateRoomChatAttachedPreview();
  } catch (error) {
    alert(error.message);
  }
}

function toggleRoomChatCoursePicker() {
  const picker = document.getElementById("roomChatCoursePicker");
  document.getElementById("roomChatPhotoMenu").hidden = true;
  if (!picker.hidden) {
    picker.hidden = true;
    return;
  }
  if (!savedCourses.length) {
    alert("저장된 코스가 없어요. 추천 결과에서 코스를 먼저 저장해 보세요!");
    return;
  }
  picker.innerHTML =
    '<p class="friend-section-label">내 코스 첨부</p>' +
    savedCourses
      .slice(0, 10)
      .map((course, index) => {
        const names = (course.places || [])
          .filter((place) => place.category !== "시작")
          .slice(0, 3)
          .map((place) => escapeHtml(place.name))
          .join(" → ");
        return `<button type="button" class="chat-course-option" data-room-chat-pick="${index}"><b>${escapeHtml(course.title || "내 코스")}</b><small>${names}</small></button>`;
      })
      .join("");
  picker.hidden = false;
  picker.querySelectorAll("[data-room-chat-pick]").forEach((button) => {
    button.addEventListener("click", () => {
      roomChatAttachedCourse = savedCourses[Number(button.dataset.roomChatPick)];
      picker.hidden = true;
      updateRoomChatAttachedPreview();
      document.getElementById("roomChatInput").focus();
    });
  });
}

function updateRoomChatAttachedPreview() {
  const preview = document.getElementById("roomChatAttachedPreview");
  if (!roomChatAttachedCourse && !roomChatAttachedImages.length) {
    preview.hidden = true;
    preview.innerHTML = "";
    return;
  }
  const parts = [];
  if (roomChatAttachedCourse) {
    parts.push(
      `<span class="chat-attach-chip">코스: <b>${escapeHtml(roomChatAttachedCourse.title || "내 코스")}</b><button type="button" data-room-clear-course aria-label="코스 첨부 해제">&times;</button></span>`,
    );
  }
  roomChatAttachedImages.forEach((src, index) => {
    parts.push(
      `<span class="chat-attach-thumb"><img src="${src}" alt="첨부 사진 미리보기" /><button type="button" data-room-clear-image="${index}" aria-label="사진 첨부 해제">&times;</button></span>`,
    );
  });
  preview.innerHTML = parts.join("");
  preview.hidden = false;
  preview.querySelector("[data-room-clear-course]")?.addEventListener("click", () => {
    roomChatAttachedCourse = null;
    updateRoomChatAttachedPreview();
  });
  preview.querySelectorAll("[data-room-clear-image]").forEach((button) => {
    button.addEventListener("click", () => {
      roomChatAttachedImages.splice(Number(button.dataset.roomClearImage), 1);
      updateRoomChatAttachedPreview();
    });
  });
}

// 채팅 하단탭의 안읽음 배지(1:1 + 단체방 합계)
async function refreshChatTabBadge() {
  const navButton = document.getElementById("chatHubNavButton");
  if (!navButton) return;
  if (!getAuthToken()) {
    navButton.classList.remove("has-unread");
    return;
  }
  try {
    const data = await requestJson("/api/community/chats/total-unread");
    navButton.classList.toggle("has-unread", (data.total || 0) > 0);
  } catch (_error) {
    /* 배지는 보조 정보라 실패해도 조용히 넘어간다 */
  }
}

// ---------- 휴대폰 푸시 알림 (PWA 웹푸시 / 네이티브 FCM) ----------
// 두 경로를 함께 지원한다.
//  · 네이티브 앱(Capacitor)   → @capacitor/push-notifications(FCM 토큰)
//  · 브라우저/홈화면 PWA       → 서비스워커 + PushManager(VAPID 웹푸시)
let nativePushBound = false;
let pushMessageBound = false;

function isWebPushSupported() {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

function getNativePushPlugin() {
  return window.Capacitor?.Plugins?.PushNotifications || null;
}

// base64url(VAPID 공개키) → Uint8Array(applicationServerKey)
function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

// 이 기기에서 알림을 허용/거부했는지 기억한다(한번 정하면 안내창을 다시 띄우지 않음).
const PUSH_CHOICE_KEY = "recodate_push_choice"; // "granted" | "denied"
let lastNativePushToken = "";

function getPushChoice() {
  return localStorage.getItem(PUSH_CHOICE_KEY);
}
function setPushChoice(value) {
  localStorage.setItem(PUSH_CHOICE_KEY, value);
}

// 지금 푸시가 켜진 상태인지
function isPushOn() {
  if (isNativeRuntime()) return getPushChoice() === "granted";
  if (!isWebPushSupported()) return false;
  return Notification.permission === "granted" && getPushChoice() !== "denied";
}

// 로그인 직후/앱 시작 시 호출.
//  · 이미 허용한 사람 → 조용히 (재)구독
//  · 거부한 사람 → 아무것도 안 함(다시 묻지 않음)
//  · 아직 한번도 안 정한 사람 → 허용/허용안함 안내창을 띄움(실제 권한 요청은 "허용"을 누른 그 순간)
async function setupPushAfterLogin() {
  bindPushMessageListener();
  if (!getAuthToken()) return;
  try {
    const choice = getPushChoice();
    if (isNativeRuntime()) {
      const Push = getNativePushPlugin();
      if (Push) {
        const permission = await Push.checkPermissions();
        if (permission.receive === "granted") {
          setPushChoice("granted");
          await setupNativePush(false);
        } else if (permission.receive !== "denied" && !choice) {
          showPushOptInDialog();
        }
      }
    } else if (isWebPushSupported()) {
      if (Notification.permission === "granted") {
        if (choice !== "denied") {
          setPushChoice("granted");
          await subscribeWebPush();
        }
      } else if (Notification.permission !== "denied" && !choice) {
        showPushOptInDialog();
      }
    }
  } catch (_error) {
    /* 푸시는 부가기능이라 실패해도 조용히 넘어간다 */
  }
  updatePushEnableButton();
}

async function subscribeWebPush() {
  if (!isWebPushSupported()) return false;
  const registration = await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    const { public_key: publicKey } = await requestJson("/api/push/vapid-public-key");
    if (!publicKey) return false; // 서버에 VAPID 미설정 → 웹푸시 비활성
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
  }
  const json = subscription.toJSON();
  await requestJson("/api/push/subscribe", {
    method: "POST",
    body: JSON.stringify({
      channel: "webpush",
      endpoint: json.endpoint,
      p256dh: json.keys?.p256dh || "",
      auth: json.keys?.auth || "",
      platform: "web",
    }),
  });
  return true;
}

async function setupNativePush(requestIfNeeded) {
  const Push = getNativePushPlugin();
  if (!Push) return false;
  if (!nativePushBound) {
    nativePushBound = true;
    // FCM 토큰 발급 → 서버에 등록
    Push.addListener("registration", (token) => {
      lastNativePushToken = token.value;
      requestJson("/api/push/subscribe", {
        method: "POST",
        body: JSON.stringify({ channel: "fcm", token: token.value, platform: "android" }),
      }).catch(() => { });
    });
    Push.addListener("registrationError", () => { });
    // 알림 탭 → 해당 화면으로 이동
    Push.addListener("pushNotificationActionPerformed", (action) => {
      handlePushNavigation(action?.notification?.data || {});
    });
  }
  let permission = await Push.checkPermissions();
  if (permission.receive !== "granted") {
    if (!requestIfNeeded && permission.receive === "denied") return false;
    permission = await Push.requestPermissions();
  }
  if (permission.receive !== "granted") return false;
  await Push.register();
  return true;
}

// 켜기: (필요하면)권한 요청 + 구독. 성공하면 true.
async function turnPushOn() {
  if (isNativeRuntime()) return setupNativePush(true);
  if (!isWebPushSupported()) return false;
  let permission = Notification.permission;
  if (permission === "default") permission = await Notification.requestPermission();
  if (permission !== "granted") return false;
  return subscribeWebPush();
}

// 끄기: 구독 해제 + 서버에서 토큰 제거
async function turnPushOff() {
  try {
    if (isNativeRuntime()) {
      if (lastNativePushToken) {
        await requestJson("/api/push/unsubscribe", {
          method: "POST",
          body: JSON.stringify({ token: lastNativePushToken }),
        }).catch(() => { });
      }
    } else if (isWebPushSupported()) {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await requestJson("/api/push/unsubscribe", {
          method: "POST",
          body: JSON.stringify({ endpoint: subscription.toJSON().endpoint }),
        }).catch(() => { });
        await subscription.unsubscribe();
      }
    }
  } catch (_error) {
    /* 끄기는 실패해도 조용히 넘어간다 */
  }
}

// 로그인 시 한 번 뜨는 "알림 허용 / 허용 안 함" 안내창
function showPushOptInDialog() {
  const modal = document.getElementById("pushOptInModal");
  if (!modal || !modal.hidden || !getAuthToken()) return;
  // 알림 모달이 떠 있으면 방해하지 않는다.
  if (!document.getElementById("notificationsModal")?.hidden) return;
  modal.hidden = false;
}

async function handlePushOptInAllow() {
  const modal = document.getElementById("pushOptInModal");
  if (modal) modal.hidden = true;
  setPushChoice("granted");
  const ok = await turnPushOn();
  if (!ok) setPushChoice("denied"); // 시스템 단계에서 막으면 거부로 기록(다시 안 물어봄)
  updatePushEnableButton();
}

function handlePushOptInDeny() {
  const modal = document.getElementById("pushOptInModal");
  if (modal) modal.hidden = true;
  setPushChoice("denied");
  updatePushEnableButton();
}

// 알림 종 안의 켜기/끄기 버튼(상태에 따라 라벨·동작이 바뀜)
async function handlePushToggleClick() {
  if (!getAuthToken()) {
    showPortalView("login");
    return;
  }
  const button = document.getElementById("enablePushButton");
  const action = button?.dataset.pushAction;
  if (action === "blocked") {
    alert("브라우저/휴대폰 설정에서 RecoDate 알림을 허용해 주세요.");
    return;
  }
  if (button) button.disabled = true;
  try {
    if (action === "off") {
      setPushChoice("denied");
      await turnPushOff();
      alert("휴대폰 알림을 껐어요. 다시 켜려면 알림 종에서 켤 수 있어요.");
    } else {
      setPushChoice("granted");
      const ok = await turnPushOn();
      if (ok) {
        alert("휴대폰 알림을 켰어요 🔔 좋아요·댓글·채팅·팔로우 알림을 받을 수 있어요.");
      } else {
        setPushChoice("denied");
        alert("알림 권한이 꺼져 있어요. 브라우저/휴대폰 설정에서 RecoDate 알림을 허용해 주세요.");
      }
    }
  } catch (_error) {
    alert("알림 설정에 실패했어요. 다시 시도해 주세요.");
  } finally {
    if (button) button.disabled = false;
    updatePushEnableButton();
  }
}

// 알림 종 버튼의 라벨/동작 갱신(켜짐=끄기 버튼, 꺼짐=켜기 버튼)
function updatePushEnableButton() {
  const button = document.getElementById("enablePushButton");
  if (!button) return;
  const supported = isNativeRuntime() || isWebPushSupported();
  if (!getAuthToken() || !supported) {
    button.hidden = true;
    return;
  }
  button.hidden = false;
  if (!isNativeRuntime() && Notification.permission === "denied") {
    button.textContent = "🔕 브라우저에서 알림이 차단됨";
    button.dataset.pushAction = "blocked";
    button.classList.add("is-off");
    return;
  }
  if (isPushOn()) {
    button.textContent = "🔔 휴대폰 알림 끄기";
    button.dataset.pushAction = "off";
    button.classList.add("is-off");
  } else {
    button.textContent = "🔔 휴대폰으로 알림 받기";
    button.dataset.pushAction = "on";
    button.classList.remove("is-off");
  }
}

// 푸시 탭 → 인앱 화면 이동(인앱 알림 클릭과 동일한 규칙)
function handlePushNavigation(data) {
  if (!data || !getAuthToken()) return;
  const type = data.type;
  const actorId = data.actor_id;
  closeNotificationsModal();
  if (type === "room_message" && data.room_id) {
    showPortalView("chatHub");
    openRoomChat(Number(data.room_id), "");
  } else if (type === "message" && actorId) {
    openChatModal(String(actorId), data.actor || "");
  } else if (
    (type === "follow" || type === "friend_request" || type === "friend_accept" ||
      type === "couple_request" || type === "couple_accept" || type === "couple_breakup") && actorId
  ) {
    openUserProfileModal(Number(actorId));
  } else if (type === "comment" && data.post_id) {
    showPortalView("community");
    openCommunityCommentsSheet(Number(data.post_id));
  } else {
    showPortalView("community");
  }
}

// 서비스워커(웹푸시)가 알림 탭을 전달하면 화면 이동
function bindPushMessageListener() {
  if (pushMessageBound || !("serviceWorker" in navigator)) return;
  pushMessageBound = true;
  navigator.serviceWorker.addEventListener("message", (event) => {
    if (event.data?.source === "recodate-push") handlePushNavigation(event.data.data || {});
  });
}

// ---------- 신고 ----------
let reportTarget = null;

function openReportModal(targetType, targetId, label) {
  reportTarget = { type: targetType, id: targetId };
  document.getElementById("reportTargetLabel").textContent = label || "";
  document.getElementById("reportMessage").hidden = true;
  const checked = document.querySelector('input[name="reportReason"]');
  if (checked) checked.checked = true;
  document.getElementById("reportModal").hidden = false;
}

function closeReportModal() {
  document.getElementById("reportModal").hidden = true;
  reportTarget = null;
}

async function submitReport() {
  if (!reportTarget) return;
  const reason = document.querySelector('input[name="reportReason"]:checked')?.value || "기타";
  const message = document.getElementById("reportMessage");
  const submitButton = document.getElementById("reportSubmit");
  submitButton.disabled = true;
  try {
    await requestJson("/api/community/reports", {
      method: "POST",
      body: JSON.stringify({ target_type: reportTarget.type, target_id: reportTarget.id, reason }),
    });
    closeReportModal();
    alert("신고가 접수되었어요. 확인 후 조치할게요.");
  } catch (error) {
    message.textContent = readApiError(error.message);
    message.hidden = false;
  } finally {
    submitButton.disabled = false;
  }
}

// ---------- 차단 ----------
async function blockUser(userId, nickname) {
  if (!confirm(`${nickname}님을 차단할까요?\n차단하면 서로의 글이 보이지 않고 친구 관계도 해제돼요.`)) return false;
  try {
    await requestJson("/api/community/blocks", { method: "POST", body: JSON.stringify({ user_id: userId }) });
    alert(`${nickname}님을 차단했어요. 마이페이지 > 차단한 사용자 관리에서 해제할 수 있어요.`);
    loadCommunityFeed();
    loadHomeCommunityFeed();
    loadCommunityFriendsTab();
    refreshChatUnreadBadges();
    return true;
  } catch (error) {
    alert(readApiError(error.message));
    return false;
  }
}

async function openBlockedUsersModal() {
  const modal = document.getElementById("blockedUsersModal");
  const list = document.getElementById("blockedUsersList");
  modal.hidden = false;
  list.innerHTML = '<p class="browse-loading">불러오는 중...</p>';
  try {
    const data = await requestJson("/api/community/blocks");
    const blocked = data.blocked || [];
    if (!blocked.length) {
      list.innerHTML = '<p class="browse-loading">차단한 사용자가 없어요.</p>';
      return;
    }
    list.innerHTML = blocked
      .map(
        (user) => `
        <div class="community-friend-row">
          <span class="community-avatar">${avatarInnerHtml(user.user_id, user.nickname)}</span>
          <div class="community-friend-info"><b>${escapeHtml(user.nickname)}</b></div>
          <button class="secondary-button compact-button" type="button" data-unblock="${user.user_id}">차단 해제</button>
        </div>
      `,
      )
      .join("");
    list.querySelectorAll("[data-unblock]").forEach((button) => {
      button.addEventListener("click", async () => {
        try {
          await requestJson(`/api/community/blocks/${button.dataset.unblock}`, { method: "DELETE" });
          openBlockedUsersModal();
          loadCommunityFeed();
          loadHomeCommunityFeed();
        } catch (error) {
          alert(readApiError(error.message));
        }
      });
    });
  } catch (error) {
    list.innerHTML = `<p class="browse-loading">${escapeHtml(readApiError(error.message))}</p>`;
  }
}

function closeBlockedUsersModal() {
  document.getElementById("blockedUsersModal").hidden = true;
}

// 피드의 코스 게시물 클릭 → 저장 코스 열람과 같은 방식으로 코스 상세(타임라인·지도·길안내)를 연다.
function openCommunityCourse(post) {
  const course = { ...post.course, title: post.title || post.course.title, course_id: `community_${post.id}` };
  currentCourses = [course];
  visibleCourseIndex = 0;
  courseOrderEditMode = false;
  replacementHistoryBySlot.clear();
  lastRecommendationData = { candidate_counts: { route_api_calls: 0 }, community_post: true };
  selectedCourseId = null;
  showPortalView("recommendation");
  renderCourses(currentCourses, lastRecommendationData);
  resultSummary.textContent = `${post.author_nickname}님이 공유한 코스예요. 카드를 눌러 지도와 길찾기를 볼 수 있어요.`;
  showRecommendationStep("results");
}

// ---------- 글·사진 작성 ----------
let communityComposeImages = [];

function resizeImageToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const image = new Image();
      image.onload = () => {
        const maxSize = 1280;
        const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(image.width * scale);
        canvas.height = Math.round(image.height * scale);
        canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.85));
      };
      image.onerror = () => reject(new Error("이미지를 읽을 수 없어요."));
      image.src = reader.result;
    };
    reader.onerror = () => reject(new Error("이미지를 읽을 수 없어요."));
    reader.readAsDataURL(file);
  });
}

// 카메라 촬영/갤러리 선택 어느 쪽이든 기존 첨부에 누적(최대 4장)하고, 미리보기에서 한 장씩 뺄 수 있다.
async function handleComposeImageSelection(event) {
  const files = Array.from(event.target.files || []);
  event.target.value = "";
  const message = document.getElementById("communityComposeMessage");
  message.hidden = true;
  if (!files.length) return;
  try {
    const dataUrls = await Promise.all(files.map(resizeImageToDataUrl));
    communityComposeImages = [...communityComposeImages, ...dataUrls].slice(0, 4);
  } catch (error) {
    message.textContent = error.message;
    message.hidden = false;
  }
  renderComposeImagePreview();
}

function renderComposeImagePreview() {
  const preview = document.getElementById("communityComposePreview");
  preview.innerHTML = communityComposeImages
    .map(
      (src, index) => `
        <span class="compose-preview-thumb">
          <img src="${src}" alt="첨부 사진 미리보기" />
          <button type="button" data-compose-remove-image="${index}" aria-label="사진 제거">&times;</button>
        </span>
      `,
    )
    .join("");
  preview.querySelectorAll("[data-compose-remove-image]").forEach((button) => {
    button.addEventListener("click", () => {
      communityComposeImages.splice(Number(button.dataset.composeRemoveImage), 1);
      renderComposeImagePreview();
    });
  });
}


// 마이페이지 '친구' 숫자를 누르면 여는 친구 목록 모달.
// 행의 말풍선은 Phase 3(DM)에서 채팅창으로 연결되며, 지금은 안내만 띄운다.

// ============================================================
// 커뮤니티 — 팔로우/팔로잉 (인스타식: 일방향 팔로우, 맞팔이면 채팅)
// ============================================================
function renderFollowButton(user) {
  if (user.is_self) return "";
  if (user.i_follow) {
    return `<button class="secondary-button compact-button follow-state-button is-following" type="button" data-unfollow="${user.user_id}">팔로잉</button>`;
  }
  if (user.follows_me) {
    return `<button class="primary-button compact-button" type="button" data-follow="${user.user_id}">맞팔로우</button>`;
  }
  return `<button class="primary-button compact-button" type="button" data-follow="${user.user_id}">팔로우</button>`;
}

const FRIEND_CHAT_SVG = '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 11.5a8.38 8.38 0 0 1-9 8.4 8.5 8.5 0 0 1-3.4-.7L3 21l1.8-5.6a8.38 8.38 0 0 1-.8-3.9 8.5 8.5 0 0 1 8.5-8.5 8.38 8.38 0 0 1 8.5 8.5z"/></svg>';

// 행 액션: 팔로우 버튼 + (맞팔이면 채팅 버튼)
function followRowActions(user) {
  if (user.is_self) return "";
  const chat = user.mutual
    ? `<button class="community-chat-button" type="button" data-friend-chat="${user.user_id}" data-friend-nickname="${escapeHtml(user.nickname)}" aria-label="${escapeHtml(user.nickname)}님과 채팅">${FRIEND_CHAT_SVG}</button>`
    : "";
  return renderFollowButton(user) + chat;
}

function bindFollowActionButtons(container, refresh) {
  container.querySelectorAll("[data-follow]").forEach((button) => {
    button.addEventListener("click", async (event) => {
      event.stopPropagation();
      button.disabled = true;
      try {
        await requestJson("/api/community/follow", {
          method: "POST",
          body: JSON.stringify({ user_id: Number(button.dataset.follow) }),
        });
        refresh();
      } catch (error) {
        alert(readApiError(error.message));
        button.disabled = false;
      }
    });
  });
  container.querySelectorAll("[data-unfollow]").forEach((button) => {
    button.addEventListener("click", async (event) => {
      event.stopPropagation();
      button.disabled = true;
      try {
        await requestJson(`/api/community/follow/${button.dataset.unfollow}`, { method: "DELETE" });
        refresh();
      } catch (error) {
        alert(readApiError(error.message));
        button.disabled = false;
      }
    });
  });
}

// 행의 채팅 버튼(맞팔) → 채팅 모달. 친구 목록 모달이 열려 있으면 닫고 연다.
function bindFriendChatButtons(container) {
  container.querySelectorAll("[data-friend-chat]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      if (!document.getElementById("communityFriendsModal").hidden) closeCommunityFriendsModal();
      openChatModal(button.dataset.friendChat, button.dataset.friendNickname);
    });
  });
}

function renderFriendUserRow(user, actionsMarkup) {
  const tripti = normalizeTriptiResult(user.tripti_result);
  return `
    <div class="community-friend-row friend-user-row" data-profile-user="${user.user_id}" role="button" tabindex="0">
      <span class="community-avatar">${avatarInnerHtml(user.user_id, user.nickname)}</span>
      <div class="community-friend-info">
        <b>${escapeHtml(user.nickname)}${coupleHeart(!!user.partner)}</b>
        ${tripti ? `<small>TripTI ${escapeHtml(tripti.code)} · ${escapeHtml(tripti.name)}</small>` : (user.tripti ? `<small>${escapeHtml(user.tripti)}</small>` : "")}
      </div>
      ${actionsMarkup}
    </div>
  `;
}

function bindProfileRowClicks(container) {
  container.querySelectorAll("[data-profile-user]").forEach((row) => {
    row.addEventListener("click", (event) => {
      if (event.target.closest("button")) return;
      openUserProfileModal(Number(row.dataset.profileUser));
    });
  });
}

async function searchCommunityUsers() {
  const input = document.getElementById("friendSearchInput");
  const box = document.getElementById("friendSearchResults");
  const query = input.value.trim();
  if (!query) {
    box.innerHTML = "";
    return;
  }
  box.innerHTML = '<p class="browse-loading">검색 중...</p>';
  try {
    const data = await requestJson(`/api/community/users/search?q=${encodeURIComponent(query)}`);
    const users = data.users || [];
    if (!users.length) {
      box.innerHTML = '<p class="browse-loading">검색 결과가 없어요.</p>';
      return;
    }
    box.innerHTML = `<p class="friend-section-label">검색 결과</p>` +
      users.map((user) => renderFriendUserRow(user, followRowActions(user))).join("");
    bindFollowActionButtons(box, () => {
      searchCommunityUsers();
      loadCommunityFriendsTab();
    });
    bindFriendChatButtons(box);
    bindProfileRowClicks(box);
  } catch (error) {
    box.innerHTML = `<p class="browse-loading">${escapeHtml(readApiError(error.message))}</p>`;
  }
}

let activeFollowSubtab = "following";

async function loadCommunityFriendsTab() {
  if (!getAuthToken()) return;
  const list = document.getElementById("communityFriendTabList");
  list.innerHTML = '<p class="browse-loading">불러오는 중...</p>';
  try {
    const [followingData, followersData] = await Promise.all([
      requestJson("/api/community/following"),
      requestJson("/api/community/followers"),
    ]);
    const following = followingData.users || [];
    const followers = followersData.users || [];
    document.getElementById("followingCount").textContent = String(following.length);
    document.getElementById("followerCount").textContent = String(followers.length);
    // 친구 = 맞팔로우(서로 팔로우). 팔로잉 목록에서 mutual인 사람만 추린다.
    const friends = following.filter((user) => user.mutual);
    const friendCountEl = document.getElementById("friendCount");
    if (friendCountEl) friendCountEl.textContent = String(friends.length);
    loadRecommendedFriends(); // 친구 목록 아래 '추천 친구'(친구의 친구) 섹션
    const users =
      activeFollowSubtab === "followers"
        ? followers
        : activeFollowSubtab === "friends"
          ? friends
          : following;
    if (!users.length) {
      const emptyText =
        activeFollowSubtab === "followers"
          ? "아직 나를 팔로우한 사람이 없어요."
          : activeFollowSubtab === "friends"
            ? "아직 맞팔로우(서로 팔로우)한 친구가 없어요."
            : "아직 팔로우한 사람이 없어요. 위에서 닉네임으로 찾아 팔로우해 보세요!";
      list.innerHTML = `<p class="browse-loading">${emptyText}</p>`;
      return;
    }
    list.innerHTML = users.map((user) => renderFriendUserRow(user, followRowActions(user))).join("");
    bindFollowActionButtons(list, loadCommunityFriendsTab);
    bindFriendChatButtons(list);
    bindProfileRowClicks(list);
    updateFriendRowBadges();
    refreshChatUnreadBadges();
  } catch (error) {
    list.innerHTML = `<p class="browse-loading">${escapeHtml(readApiError(error.message))}</p>`;
  }
}

// 추천 친구(친구의 친구) — 커뮤니티 '팔로우' 탭의 친구 목록 아래에 표시.
function renderRecommendRow(user) {
  const first = (user.recommend_via && user.recommend_via[0]) || "친구";
  const reason = user.recommend_count > 1
    ? `${escapeHtml(first)}님 외 ${user.recommend_count - 1}명이 팔로우`
    : `${escapeHtml(first)}님이 팔로우`;
  return `
    <div class="community-friend-row friend-user-row" data-profile-user="${user.user_id}" role="button" tabindex="0">
      <span class="community-avatar">${avatarInnerHtml(user.user_id, user.nickname)}</span>
      <div class="community-friend-info">
        <b>${escapeHtml(user.nickname)}${coupleHeart(!!user.partner)}</b>
        <small class="recommend-reason">${reason}</small>
      </div>
      ${followRowActions(user)}
    </div>
  `;
}

async function loadRecommendedFriends() {
  const wrap = document.getElementById("communityRecommendSection");
  const list = document.getElementById("communityRecommendList");
  if (!wrap || !list || !getAuthToken()) return;
  try {
    const data = await requestJson("/api/community/recommend-friends");
    const users = data.users || [];
    if (!users.length) {
      wrap.hidden = true;
      return;
    }
    list.innerHTML = users.map(renderRecommendRow).join("");
    bindFollowActionButtons(list, loadCommunityFriendsTab);
    bindFriendChatButtons(list);
    bindProfileRowClicks(list);
    wrap.hidden = false;
  } catch (_error) {
    wrap.hidden = true;
  }
}

async function openUserProfileModal(userId) {
  const modal = document.getElementById("userProfileModal");
  modal.hidden = false;
  document.getElementById("userProfileNickname").textContent = "불러오는 중...";
  document.getElementById("userProfileTripti").textContent = "";
  document.getElementById("userProfileAvatar").textContent = "";
  document.getElementById("userProfileStats").innerHTML = "";
  document.getElementById("userProfileActions").innerHTML = "";
  document.getElementById("userProfileTriptiDetail")?.remove();
  document.getElementById("userProfilePosts").innerHTML = '<p class="browse-loading">불러오는 중...</p>';
  try {
    const profile = await requestJson(`/api/community/users/${userId}/profile`);
    const tripti = normalizeTriptiResult(profile.tripti_result);
    // 닉네임 옆 하트(연애 중이면) + 닉네임 아래 ❤️파트너
    document.getElementById("userProfileNickname").innerHTML = `${escapeHtml(profile.nickname)}${coupleHeart(!!profile.partner)}`;
    const partnerEl = document.getElementById("userProfilePartner");
    if (partnerEl) {
      if (profile.partner) {
        partnerEl.innerHTML = `❤️ ${escapeHtml(profile.partner.nickname)}`;
        partnerEl.hidden = false;
      } else {
        partnerEl.hidden = true;
      }
    }
    document.getElementById("userProfileTripti").textContent = tripti
      ? `TripTI ${tripti.code} · ${tripti.name}`
      : (profile.tripti || "TripTI 결과 없음");
    document.getElementById("userProfileAvatar").innerHTML = avatarInnerHtml(profile.user_id, profile.nickname);
    const statsBox = document.getElementById("userProfileStats");
    statsBox.innerHTML = `
      <button class="profile-stat profile-stat-clickable" type="button" data-profile-followers="${profile.user_id}"><b>${profile.stats.follower_count}</b><small>팔로워</small></button>
      <button class="profile-stat profile-stat-clickable" type="button" data-profile-following="${profile.user_id}"><b>${profile.stats.following_count}</b><small>팔로잉</small></button>
      <div class="profile-stat"><b>${profile.stats.received_like_count}</b><small>받은 ♥</small></div>
    `;
    statsBox.querySelector("[data-profile-followers]")?.addEventListener("click", () =>
      openFollowListModal("followers", profile.user_id, `${profile.nickname}님의 팔로워`));
    statsBox.querySelector("[data-profile-following]")?.addEventListener("click", () =>
      openFollowListModal("following", profile.user_id, `${profile.nickname}님의 팔로잉`));
    // 서로 아는 친구(나와 맞팔인 사람 중 이 사람을 팔로우하는 수)
    const mutualEl = document.getElementById("userProfileMutual");
    if (mutualEl) {
      const mc = profile.mutual_connections;
      if (!profile.is_self && mc && mc.count > 0) {
        const extra = mc.count > mc.names.length ? ` 외 ${mc.count - mc.names.length}명` : "";
        const namesText = mc.names.length ? ` · ${mc.names.map(escapeHtml).join(", ")}${extra}` : "";
        mutualEl.innerHTML = `서로 아는 친구 <b>${mc.count}명</b><small>${namesText}</small>`;
        mutualEl.hidden = false;
      } else {
        mutualEl.hidden = true;
        mutualEl.innerHTML = "";
      }
    }
    const actions = document.getElementById("userProfileActions");
    if (profile.is_self) {
      actions.innerHTML = "";
    } else if (profile.blocked_by_me) {
      actions.innerHTML = `<button class="secondary-button" type="button" data-profile-unblock="${profile.user_id}">차단 해제</button>`;
    } else {
      const followBtn = profile.i_follow
        ? `<button class="secondary-button follow-state-button is-following" type="button" data-unfollow="${profile.user_id}">팔로잉</button>`
        : (profile.follows_me
          ? `<button class="primary-button" type="button" data-follow="${profile.user_id}">맞팔로우</button>`
          : `<button class="primary-button" type="button" data-follow="${profile.user_id}">팔로우</button>`);
      const chatBtn = profile.mutual ? `<button class="primary-button" type="button" data-profile-chat>채팅하기</button>` : "";
      let coupleBtn = "";
      if (profile.couple_state === "partners") {
        coupleBtn = `<button class="couple-state-button is-couple" type="button" data-couple-breakup><span class="couple-btn-heart">♥</span> 연인 · 헤어지기</button>`;
      } else if (profile.couple_state === "request_received") {
        coupleBtn = `<button class="couple-request-button" type="button" data-couple-accept-profile="${profile.user_id}"><span class="couple-btn-heart">♥</span> 연인 수락</button>`;
      } else if (profile.couple_state === "request_sent") {
        coupleBtn = `<button class="secondary-button couple-state-button" type="button" data-couple-cancel-profile="${profile.user_id}">연인 요청됨 · 취소</button>`;
      } else if (profile.mutual) {
        coupleBtn = `<button class="couple-request-button" type="button" data-couple-request-profile="${profile.user_id}"><span class="couple-btn-heart">♥</span> 연인 맺기</button>`;
      }
      actions.innerHTML = chatBtn + followBtn + coupleBtn;
    }
    // 본인이 아니면 신고·차단(차단 상태가 아닐 때) 보조 액션을 작게 덧붙인다.
    if (!profile.is_self) {
      actions.insertAdjacentHTML(
        "beforeend",
        `<div class="profile-moderation">
          ${profile.blocked_by_me ? "" : `<button type="button" data-profile-block="${profile.user_id}">차단</button>`}
          <button type="button" data-profile-report="${profile.user_id}">신고</button>
        </div>`,
      );
      actions.querySelector("[data-profile-block]")?.addEventListener("click", async () => {
        if (await blockUser(profile.user_id, profile.nickname)) closeUserProfileModal();
      });
      actions.querySelector("[data-profile-report]")?.addEventListener("click", () => {
        openReportModal("user", profile.user_id, `${profile.nickname}님`);
      });
      actions.querySelector("[data-profile-unblock]")?.addEventListener("click", async () => {
        try {
          await requestJson(`/api/community/blocks/${profile.user_id}`, { method: "DELETE" });
          openUserProfileModal(userId);
          loadCommunityFeed();
          loadHomeCommunityFeed();
        } catch (error) {
          alert(readApiError(error.message));
        }
      });
    }
    bindFollowActionButtons(actions, () => {
      openUserProfileModal(userId);
      loadCommunityFeed();
      loadHomeCommunityFeed();
      loadCommunityFriendsTab();
    });
    actions.querySelector("[data-profile-chat]")?.addEventListener("click", () => {
      closeUserProfileModal();
      openChatModal(profile.user_id, profile.nickname);
    });
    actions.querySelector("[data-couple-request-profile]")?.addEventListener("click", () =>
      requestCouple(profile.user_id, profile.nickname));
    actions.querySelector("[data-couple-cancel-profile]")?.addEventListener("click", () =>
      cancelCoupleRequest(profile.user_id));
    actions.querySelector("[data-couple-accept-profile]")?.addEventListener("click", async () => {
      await respondCouple(profile.user_id, true);
      openUserProfileModal(userId);
    });
    actions.querySelector("[data-couple-breakup]")?.addEventListener("click", async () => {
      await breakupCouple();
      openUserProfileModal(userId);
    });
    renderCommunityFeedInto(document.getElementById("userProfilePosts"), profile.posts || [], {
      emptyText: "아직 공유한 피드가 없어요.",
    });
    renderFriendTriptiDetail(profile, tripti);
  } catch (error) {
    document.getElementById("userProfileNickname").textContent = "프로필을 불러오지 못했어요";
    document.getElementById("userProfilePosts").innerHTML = `<p class="browse-loading">${escapeHtml(readApiError(error.message))}</p>`;
  }
}

function renderFriendTriptiDetail(profile, tripti) {
  const statsBox = document.getElementById("userProfileStats");
  if (!statsBox) return;
  document.getElementById("userProfileTriptiDetail")?.remove();
  const card = document.createElement("section");
  card.id = "userProfileTriptiDetail";
  card.className = "user-profile-tripti-detail";
  if (!tripti) {
    card.innerHTML = `
      <strong>친구 TripTI 유형</strong>
      <p>${escapeHtml(profile.nickname)}님은 아직 TripTI 결과가 없어요.</p>
    `;
  } else {
    card.innerHTML = `
      <div>
        <small>친구 TripTI 유형</small>
        <b>${escapeHtml(tripti.code)} · ${escapeHtml(tripti.name)}</b>
      </div>
      ${renderTriptiKeywordChips(tripti.code)}
      <div class="tripti-result-desc">${renderTriptiDescription(tripti.desc)}</div>
    `;
  }
  statsBox.insertAdjacentElement("afterend", card);
}

function closeUserProfileModal() {
  document.getElementById("userProfileModal").hidden = true;
}

// ====================== 연인(커플) 맺기 ======================
// 연인이 있는 사용자(누구든) 이름 옆 작은 하트
function coupleHeart(hasPartner) {
  return hasPartner ? '<span class="couple-heart" title="연애 중" aria-label="연애 중">♥</span>' : "";
}

let myCoupleStatus = null;
let coupleAnniEditing = false; // 기념일 수정 모드(날짜선택+저장 노출) 여부

async function loadMyCoupleStatus() {
  const card = document.getElementById("profileCoupleCard");
  const partnerLine = document.getElementById("profilePartnerLine");
  if (!getAuthToken()) {
    if (card) card.hidden = true;
    if (partnerLine) partnerLine.hidden = true;
    return;
  }
  try {
    myCoupleStatus = await requestJson("/api/community/couple");
    coupleAnniEditing = false; // 새로 불러올 때는 항상 보기 모드
    renderMyCoupleCard(myCoupleStatus);
  } catch (_error) {
    if (card) card.hidden = true;
  }
}

function renderMyCoupleCard(status) {
  const card = document.getElementById("profileCoupleCard");
  const partnerLine = document.getElementById("profilePartnerLine");
  const nickEl = document.getElementById("profileNickname");
  if (!card) return;
  // 닉네임 옆 하트 + 아래 ❤️파트너
  if (nickEl && currentUser && document.getElementById("profileNicknameForm")?.hidden !== false) {
    nickEl.innerHTML = `${escapeHtml(currentUser.nickname)}님${coupleHeart(!!status.partner)}`;
  }
  // 이름 아래 '❤️파트너' 줄은 바로 밑 커플 카드(💑 나 ❤️ 파트너)와 정보가 겹쳐 표시하지 않는다.
  if (partnerLine) partnerLine.hidden = true;
  let html = "";
  (status.incoming_requests || []).forEach((r) => {
    html += `
      <div class="couple-request-row">
        <b>❤️ ${escapeHtml(r.nickname)}님이 연인을 신청했어요</b>
        <div class="couple-request-actions">
          <button class="primary-button compact-button" type="button" data-couple-accept="${r.user_id}">수락</button>
          <button class="secondary-button compact-button" type="button" data-couple-reject="${r.user_id}">거절</button>
        </div>
      </div>`;
  });
  if (status.partner) {
    const dday = status.days_together;
    const anni = status.anniversary_date || "";
    // 기념일이 있고 수정 모드가 아니면: 만난 지 N일 + 작은 '수정' 버튼만.
    // 수정 모드(또는 기념일 미설정)면: 날짜선택 + 저장 버튼.
    const editing = coupleAnniEditing || !anni;
    let middle;
    if (editing) {
      // 수정 모드에서만 날짜선택·저장·헤어지기가 보인다.
      middle = `
        <div class="couple-anni-edit">
          <input type="date" id="coupleAnniversaryInput" class="couple-anni-input" value="${escapeHtml(anni)}" />
          <button class="secondary-button compact-button" type="button" id="coupleAnniversarySave">기념일 저장</button>
          ${anni ? `<button class="couple-anni-cancel" type="button" id="coupleAnniversaryCancel">취소</button>` : ""}
        </div>
        <div class="couple-edit-actions">
          <button class="couple-breakup-button" type="button" id="coupleBreakupButton">헤어지기</button>
        </div>`;
    } else {
      middle = `
        <div class="couple-dday">만난 지 <b>${dday}</b>일 <small>(${escapeHtml(anni)}~)</small>
          <button class="couple-anni-editbtn" type="button" id="coupleAnniEdit" aria-label="기념일 수정">
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>수정
          </button>
        </div>`;
    }
    html += `
      <div class="couple-card-main">
        <div class="couple-card-head">💑 <b>${escapeHtml(currentUser?.nickname || "나")}</b> ❤️ <b>${escapeHtml(status.partner.nickname)}</b></div>
        ${middle}
      </div>`;
  }
  card.innerHTML = html;
  card.hidden = !html;
  card.querySelectorAll("[data-couple-accept]").forEach((b) =>
    b.addEventListener("click", () => respondCouple(Number(b.dataset.coupleAccept), true)));
  card.querySelectorAll("[data-couple-reject]").forEach((b) =>
    b.addEventListener("click", () => respondCouple(Number(b.dataset.coupleReject), false)));
  document.getElementById("coupleAnniEdit")?.addEventListener("click", () => {
    coupleAnniEditing = true;
    renderMyCoupleCard(myCoupleStatus);
  });
  document.getElementById("coupleAnniversaryCancel")?.addEventListener("click", () => {
    coupleAnniEditing = false;
    renderMyCoupleCard(myCoupleStatus);
  });
  document.getElementById("coupleAnniversarySave")?.addEventListener("click", saveAnniversary);
  document.getElementById("coupleBreakupButton")?.addEventListener("click", breakupCouple);
}

async function respondCouple(requesterId, accept) {
  try {
    await requestJson("/api/community/couple/respond", {
      method: "POST",
      body: JSON.stringify({ requester_id: requesterId, accept }),
    });
    await loadMyCoupleStatus();
    refreshNotificationDot();
    if (accept) alert("연인이 되었어요! 💑 프로필에서 기념일을 설정해 보세요.");
  } catch (error) {
    alert(readApiError(error.message));
  }
}

async function saveAnniversary() {
  const value = document.getElementById("coupleAnniversaryInput")?.value || "";
  try {
    myCoupleStatus = await requestJson("/api/community/couple/anniversary", {
      method: "PATCH",
      body: JSON.stringify({ anniversary_date: value }),
    });
    coupleAnniEditing = false; // 저장하면 보기 모드로(날짜선택·저장 버튼 숨김)
    renderMyCoupleCard(myCoupleStatus);
  } catch (error) {
    alert(readApiError(error.message));
  }
}

async function breakupCouple() {
  if (!confirm("정말 헤어질까요? 디데이와 커플 표시가 사라져요.")) return;
  try {
    await requestJson("/api/community/couple", { method: "DELETE" });
    await loadMyCoupleStatus();
  } catch (error) {
    alert(readApiError(error.message));
  }
}

async function requestCouple(userId, nickname) {
  if (!confirm(`${nickname}님에게 연인 맺기를 신청할까요?`)) return;
  try {
    await requestJson("/api/community/couple/request", { method: "POST", body: JSON.stringify({ user_id: userId }) });
    openUserProfileModal(userId);
  } catch (error) {
    alert(readApiError(error.message));
  }
}

async function cancelCoupleRequest(userId) {
  try {
    await requestJson("/api/community/couple/cancel", { method: "POST", body: JSON.stringify({ user_id: userId }) });
    openUserProfileModal(userId);
  } catch (error) {
    alert(readApiError(error.message));
  }
}

// 팔로워/팔로잉 목록 모달. mode: "followers" | "following", targetId 미지정 시 본인.
async function openFollowListModal(mode, targetId, title) {
  const modal = document.getElementById("communityFriendsModal");
  const list = document.getElementById("communityFriendsList");
  document.getElementById("communityFriendsTitle").textContent = title || (mode === "followers" ? "팔로워" : "팔로잉");
  modal.hidden = false;
  list.innerHTML = '<p class="browse-loading">불러오는 중...</p>';
  try {
    const path = mode === "followers" ? "/api/community/followers" : "/api/community/following";
    const query = targetId ? `?target_id=${targetId}` : "";
    const data = await requestJson(path + query);
    const users = data.users || [];
    if (!users.length) {
      list.innerHTML = `<p class="browse-loading">${mode === "followers" ? "아직 팔로워가 없어요." : "아직 팔로우한 사람이 없어요."}</p>`;
      return;
    }
    list.innerHTML = users.map((user) => renderFriendUserRow(user, followRowActions(user))).join("");
    bindFollowActionButtons(list, () => openFollowListModal(mode, targetId, title));
    bindFriendChatButtons(list);
    bindProfileRowClicks(list);
    updateFriendRowBadges();
  } catch (error) {
    list.innerHTML = `<p class="browse-loading">${escapeHtml(readApiError(error.message))}</p>`;
  }
}

function closeCommunityFriendsModal() {
  document.getElementById("communityFriendsModal").hidden = true;
}

function courseShareSummary(course) {
  return (course?.places || [])
    .filter((place) => place.category !== "시작")
    .map((place) => place.name)
    .slice(0, 4)
    .join(" → ");
}

async function openFriendCourseShareModal(course) {
  if (!getAuthToken()) {
    showPortalView("login");
    return;
  }
  pendingFriendShareCourse = course;
  const modal = document.getElementById("friendCourseShareModal");
  const list = document.getElementById("friendCourseShareList");
  const message = document.getElementById("friendCourseShareMessage");
  document.getElementById("friendCourseShareName").textContent = courseShareSummary(course);
  message.hidden = true;
  list.innerHTML = '<p class="browse-loading">맞팔로우 목록을 불러오는 중...</p>';
  modal.hidden = false;
  try {
    // 채팅으로 코스를 보내려면 맞팔로우여야 하므로 맞팔 사용자만 보여준다.
    const data = await requestJson("/api/community/following");
    const friends = (data.users || []).filter((user) => user.mutual);
    if (!friends.length) {
      list.innerHTML = '<p class="browse-loading">맞팔로우한 사람이 없어요. 서로 팔로우하면 채팅으로 코스를 보낼 수 있어요.</p>';
      return;
    }
    list.innerHTML = friends
      .map(
        (friend) => `
        <button class="friend-course-share-row" type="button" data-share-course-friend="${friend.user_id}" data-friend-nickname="${escapeHtml(friend.nickname)}">
          <span class="community-avatar">${avatarInnerHtml(friend.user_id, friend.nickname)}</span>
          <span class="community-friend-info">
            <b>${escapeHtml(friend.nickname)}</b>
            ${friend.tripti ? `<small>${escapeHtml(friend.tripti)}</small>` : "<small>채팅으로 코스 보내기</small>"}
          </span>
          <span class="friend-course-share-send">보내기</span>
        </button>
      `,
      )
      .join("");
    list.querySelectorAll("[data-share-course-friend]").forEach((button) => {
      button.addEventListener("click", async () => {
        await sendCourseToFriend(Number(button.dataset.shareCourseFriend), button.dataset.friendNickname || "");
      });
    });
  } catch (error) {
    list.innerHTML = `<p class="browse-loading">${escapeHtml(readApiError(error.message))}</p>`;
  }
}

function closeFriendCourseShareModal() {
  document.getElementById("friendCourseShareModal").hidden = true;
  pendingFriendShareCourse = null;
}

async function sendCourseToFriend(friendId, nickname) {
  if (!pendingFriendShareCourse) return;
  const message = document.getElementById("friendCourseShareMessage");
  const buttons = document.querySelectorAll("[data-share-course-friend]");
  buttons.forEach((button) => { button.disabled = true; });
  message.textContent = "채팅으로 보내는 중...";
  message.hidden = false;
  try {
    await requestJson(`/api/community/chats/${friendId}/messages`, {
      method: "POST",
      body: JSON.stringify({
        content: "이 코스 어때?",
        course: pendingFriendShareCourse,
      }),
    });
    closeFriendCourseShareModal();
    await openChatModal(friendId, nickname);
  } catch (error) {
    message.textContent = readApiError(error.message);
    buttons.forEach((button) => { button.disabled = false; });
  }
}

// ============================================================
// 커뮤니티 Phase 3 — DM (친구끼리 채팅)
// 모달이 열려 있는 동안 3초 폴링으로 새 메시지를 증분(after_id) 수신하고,
// 코스 카드 첨부와 안읽음 배지(하단탭·친구 행)를 지원한다.
// ============================================================
let chatFriendId = null;
let chatFriendNickname = "";
let chatLastMessageId = 0;
let chatPollTimer = null;
let chatFetchInFlight = false;
let chatAttachedCourse = null;
let chatAttachedImages = [];
let chatReplyTarget = null;
let chatTypingLastSent = 0;
let chatLastDateKey = "";
let chatUnreadByUser = {};

function formatChatTime(isoText) {
  const date = new Date(isoText);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("ko-KR", { hour: "numeric", minute: "2-digit" });
}

function chatDateKey(isoText) {
  const date = new Date(isoText);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function chatDateLabel(isoText) {
  const date = new Date(isoText);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric", weekday: "long" });
}

// 상대가 읽은 메시지(id <= peerLastReadId)의 하트를 지운다.
function updateChatReadMarks(peerLastReadId) {
  if (!peerLastReadId) return;
  document.querySelectorAll("#chatMessages [data-read-mark]").forEach((mark) => {
    if (Number(mark.dataset.readMark) <= peerLastReadId) mark.remove();
  });
}

function chatCourseCardMarkup(message) {
  const stops = (message.course.places || []).filter((place) => place.category !== "시작");
  const names = stops.slice(0, 3).map((place) => escapeHtml(place.name)).join(" → ");
  const rest = stops.length > 3 ? ` 외 ${stops.length - 3}곳` : "";
  return `
    <button class="chat-course-card" type="button" data-chat-course="${message.id}">
      <b>${escapeHtml(message.course.title || "공유한 코스")}</b>
      <small>${names}${rest}</small>
      <span>코스 보기 ›</span>
    </button>
  `;
}

// 채팅으로 받은 코스 카드를 누르면 피드의 코스 게시물과 같은 방식으로 코스 상세를 연다.
function openChatCourse(message) {
  const friendNickname = chatFriendNickname;
  closeChatModal();
  const course = { ...message.course, course_id: `chat_${message.id}` };
  currentCourses = [course];
  visibleCourseIndex = 0;
  replacementHistoryBySlot.clear();
  lastRecommendationData = { candidate_counts: { route_api_calls: 0 }, community_post: true };
  selectedCourseId = null;
  showPortalView("recommendation");
  renderCourses(currentCourses, lastRecommendationData);
  resultSummary.textContent = message.is_mine
    ? "채팅으로 공유한 코스예요. 카드를 눌러 지도와 길찾기를 볼 수 있어요."
    : `${friendNickname}님이 채팅으로 공유한 코스예요. 카드를 눌러 지도와 길찾기를 볼 수 있어요.`;
  showRecommendationStep("results");
}

function appendChatMessages(messages) {
  const box = document.getElementById("chatMessages");
  // 같은 메시지가 전송 직후 응답과 폴링으로 두 번 들어와도 한 번만 그린다.
  const fresh = messages.filter((message) => message.id > chatLastMessageId);
  if (!fresh.length) return;
  if (box.querySelector(".browse-loading")) box.innerHTML = "";
  // 타이핑 표시가 떠 있으면 새 메시지가 그 아래로 들어가지 않게 잠시 빼 둔다.
  const typingIndicator = document.getElementById("chatTypingIndicator");
  typingIndicator?.remove();
  let html = "";
  fresh.forEach((message) => {
    // 날짜가 바뀌면 카카오톡처럼 가운데 날짜 구분선을 넣는다.
    const dateKey = chatDateKey(message.created_at);
    if (dateKey && dateKey !== chatLastDateKey) {
      html += `<div class="chat-date-divider"><span>${escapeHtml(chatDateLabel(message.created_at))}</span></div>`;
      chatLastDateKey = dateKey;
    }
    html += `
      <div class="chat-bubble-row ${message.is_mine ? "mine" : "theirs"}">
        <div class="chat-bubble" data-bubble-id="${message.id}">
          ${message.reply
        ? `<span class="chat-reply-quote"><b>${escapeHtml(message.reply.sender_nickname)}에게 답장</b><small>${escapeHtml(message.reply.preview || "")}</small></span>`
        : ""}
          ${message.course ? chatCourseCardMarkup(message) : ""}
          ${(message.images || []).length
        ? `<div class="chat-bubble-images count-${message.images.length}">${message.images
          .map((name) => `<img src="${API_BASE_URL}/api/community/images/${encodeURIComponent(name)}" alt="보낸 사진" loading="lazy" />`)
          .join("")}</div>`
        : ""}
          ${message.content ? `<p>${escapeHtml(message.content)}</p>` : ""}
        </div>
        <span class="chat-meta">
          ${message.is_mine && !message.read ? `<span class="chat-read-mark" data-read-mark="${message.id}" title="아직 읽지 않음">♥</span>` : ""}
          <small class="chat-time">${formatChatTime(message.created_at)}</small>
        </span>
      </div>
    `;
  });
  box.insertAdjacentHTML("beforeend", html);
  if (typingIndicator) box.appendChild(typingIndicator);
  fresh.forEach((message) => {
    const bubble = box.querySelector(`[data-bubble-id="${message.id}"]`);
    if (message.course) {
      bubble?.querySelector(`[data-chat-course="${message.id}"]`)?.addEventListener("click", () => openChatCourse(message));
    }
    // 말풍선을 탭하면 그 메시지에 답장(코스 카드는 코스 열기가 우선)
    bubble?.addEventListener("click", (event) => {
      if (event.target.closest("[data-chat-course]")) return;
      setChatReplyTarget(message);
    });
  });
  chatLastMessageId = fresh[fresh.length - 1].id;
  box.scrollTop = box.scrollHeight;
}

function chatMessagePreviewText(message) {
  if (message.content) return String(message.content).slice(0, 60);
  if (message.course) return "코스 공유";
  if ((message.images || []).length) return "사진";
  return "";
}

function setChatReplyTarget(message) {
  chatReplyTarget = {
    id: message.id,
    nickname: message.is_mine ? "나" : chatFriendNickname,
    preview: chatMessagePreviewText(message),
  };
  updateChatReplyPreview();
  document.getElementById("chatInput").focus();
}

function updateChatReplyPreview() {
  const bar = document.getElementById("chatReplyPreview");
  if (!chatReplyTarget) {
    bar.hidden = true;
    bar.innerHTML = "";
    return;
  }
  bar.innerHTML = `
    <span class="chat-reply-info"><b>${escapeHtml(chatReplyTarget.nickname)}에게 답장</b><small>${escapeHtml(chatReplyTarget.preview)}</small></span>
    <button type="button" id="chatReplyCancel" aria-label="답장 취소">&times;</button>
  `;
  bar.hidden = false;
  document.getElementById("chatReplyCancel").addEventListener("click", () => {
    chatReplyTarget = null;
    updateChatReplyPreview();
  });
}

// 상대방 입력 중 표시(점 3개 바운스). 폴링 응답의 peer_typing으로 켜고 끈다.
function setChatTypingIndicator(active) {
  const box = document.getElementById("chatMessages");
  let indicator = document.getElementById("chatTypingIndicator");
  if (!active) {
    indicator?.remove();
    return;
  }
  const isNew = !indicator;
  if (!indicator) {
    indicator = document.createElement("div");
    indicator.id = "chatTypingIndicator";
    indicator.className = "chat-bubble-row theirs chat-typing-row";
    indicator.innerHTML = '<div class="chat-bubble chat-typing-bubble" aria-label="상대방이 입력 중"><span></span><span></span><span></span></div>';
  }
  box.appendChild(indicator);
  if (isNew) box.scrollTop = box.scrollHeight;
}

// 내가 입력 중이라는 신호를 2초에 한 번만 서버에 보낸다.
function signalChatTyping() {
  if (chatFriendId === null || !document.getElementById("chatInput").value) return;
  const now = Date.now();
  if (now - chatTypingLastSent < 2000) return;
  chatTypingLastSent = now;
  requestJson(`/api/community/chats/${chatFriendId}/typing`, { method: "POST" }).catch(() => { });
}

async function fetchChatMessages(options = {}) {
  if (chatFriendId === null || chatFetchInFlight) return;
  chatFetchInFlight = true;
  try {
    const data = await requestJson(`/api/community/chats/${chatFriendId}/messages?after_id=${chatLastMessageId}`);
    const messages = data.messages || [];
    if (options.initial && !messages.length) {
      document.getElementById("chatMessages").innerHTML =
        '<p class="browse-loading">아직 주고받은 메시지가 없어요. 첫 메시지를 보내보세요!</p>';
    } else {
      appendChatMessages(messages);
    }
    updateChatReadMarks(data.peer_last_read_id || 0);
    setChatTypingIndicator(Boolean(data.peer_typing));
  } catch (error) {
    if (options.initial) {
      document.getElementById("chatMessages").innerHTML =
        `<p class="browse-loading">${escapeHtml(readApiError(error.message))}</p>`;
    }
  } finally {
    chatFetchInFlight = false;
  }
}

async function openChatModal(friendId, nickname) {
  if (!getAuthToken()) {
    showPortalView("login");
    return;
  }
  chatFriendId = Number(friendId);
  chatFriendNickname = nickname || "";
  chatLastMessageId = 0;
  chatLastDateKey = "";
  chatAttachedCourse = null;
  chatAttachedImages = [];
  chatReplyTarget = null;
  updateChatReplyPreview();
  document.getElementById("chatFriendNickname").textContent = chatFriendNickname;
  document.getElementById("chatFriendAvatar").innerHTML = avatarInnerHtml(chatFriendId, chatFriendNickname);
  document.getElementById("chatMessages").innerHTML = '<p class="browse-loading">불러오는 중...</p>';
  document.getElementById("chatCoursePicker").hidden = true;
  document.getElementById("chatPhotoMenu").hidden = true;
  document.getElementById("chatCameraInput").value = "";
  document.getElementById("chatGalleryInput").value = "";
  document.getElementById("chatInput").value = "";
  updateChatAttachedPreview();
  document.getElementById("chatModal").hidden = false;
  await fetchChatMessages({ initial: true });
  if (chatPollTimer) clearInterval(chatPollTimer);
  chatPollTimer = setInterval(fetchChatMessages, 3000);
}

function closeChatModal() {
  if (chatPollTimer) {
    clearInterval(chatPollTimer);
    chatPollTimer = null;
  }
  chatFriendId = null;
  chatAttachedCourse = null;
  chatAttachedImages = [];
  chatReplyTarget = null;
  updateChatReplyPreview();
  document.getElementById("chatTypingIndicator")?.remove();
  document.getElementById("chatModal").hidden = true;
  // 채팅을 읽었으니 안읽음 배지를 다시 계산한다.
  refreshChatUnreadBadges();
  refreshChatTabBadge();
  // 채팅 탭의 목록이 떠 있으면 마지막 메시지·안읽음을 갱신한다.
  if (chatHubView && !chatHubView.hidden && activeChatHubSeg === "chats") loadChatList();
}

async function sendChatMessage() {
  if (chatFriendId === null) return;
  const input = document.getElementById("chatInput");
  const content = input.value.trim();
  if (!content && !chatAttachedCourse && !chatAttachedImages.length) return;
  const sendButton = document.getElementById("chatSendButton");
  sendButton.disabled = true;
  try {
    const message = await requestJson(`/api/community/chats/${chatFriendId}/messages`, {
      method: "POST",
      body: JSON.stringify({
        content,
        course: chatAttachedCourse,
        images: chatAttachedImages,
        reply_to_id: chatReplyTarget?.id ?? null,
      }),
    });
    input.value = "";
    chatAttachedCourse = null;
    chatAttachedImages = [];
    chatReplyTarget = null;
    updateChatAttachedPreview();
    updateChatReplyPreview();
    appendChatMessages([message]);
  } catch (error) {
    alert(readApiError(error.message));
  } finally {
    sendButton.disabled = false;
    input.focus();
  }
}

// 카메라 버튼 → 사진 찍기/사진 보내기 선택 메뉴 (각각 capture 인풋/갤러리 인풋을 연다)
function toggleChatPhotoMenu() {
  const menu = document.getElementById("chatPhotoMenu");
  document.getElementById("chatCoursePicker").hidden = true;
  menu.hidden = !menu.hidden;
}

async function handleChatImageSelection(event) {
  const files = Array.from(event.target.files || []);
  event.target.value = "";
  if (!files.length) return;
  try {
    const dataUrls = await Promise.all(files.map(resizeImageToDataUrl));
    chatAttachedImages = [...chatAttachedImages, ...dataUrls].slice(0, 4);
    updateChatAttachedPreview();
  } catch (error) {
    alert(error.message);
  }
}

function toggleChatCoursePicker() {
  const picker = document.getElementById("chatCoursePicker");
  document.getElementById("chatPhotoMenu").hidden = true;
  if (!picker.hidden) {
    picker.hidden = true;
    return;
  }
  if (!savedCourses.length) {
    alert("저장된 코스가 없어요. 추천 결과에서 코스를 먼저 저장해 보세요!");
    return;
  }
  picker.innerHTML =
    '<p class="friend-section-label">내 코스 첨부</p>' +
    savedCourses
      .slice(0, 10)
      .map((course, index) => {
        const names = (course.places || [])
          .filter((place) => place.category !== "시작")
          .slice(0, 3)
          .map((place) => escapeHtml(place.name))
          .join(" → ");
        return `
          <button type="button" class="chat-course-option" data-chat-pick="${index}">
            <b>${escapeHtml(course.title || "내 코스")}</b>
            <small>${names}</small>
          </button>
        `;
      })
      .join("");
  picker.querySelectorAll("[data-chat-pick]").forEach((button) => {
    button.addEventListener("click", () => {
      chatAttachedCourse = savedCourses[Number(button.dataset.chatPick)];
      picker.hidden = true;
      updateChatAttachedPreview();
      document.getElementById("chatInput").focus();
    });
  });
  picker.hidden = false;
}

function updateChatAttachedPreview() {
  const preview = document.getElementById("chatAttachedPreview");
  if (!chatAttachedCourse && !chatAttachedImages.length) {
    preview.hidden = true;
    preview.innerHTML = "";
    return;
  }
  const parts = [];
  if (chatAttachedCourse) {
    parts.push(`
      <span class="chat-attach-chip">코스: <b>${escapeHtml(chatAttachedCourse.title || "내 코스")}</b>
        <button type="button" data-chat-clear-course aria-label="코스 첨부 해제">&times;</button>
      </span>
    `);
  }
  chatAttachedImages.forEach((src, index) => {
    parts.push(`
      <span class="chat-attach-thumb">
        <img src="${src}" alt="첨부 사진 미리보기" />
        <button type="button" data-chat-clear-image="${index}" aria-label="사진 첨부 해제">&times;</button>
      </span>
    `);
  });
  preview.innerHTML = parts.join("");
  preview.hidden = false;
  preview.querySelector("[data-chat-clear-course]")?.addEventListener("click", () => {
    chatAttachedCourse = null;
    updateChatAttachedPreview();
  });
  preview.querySelectorAll("[data-chat-clear-image]").forEach((button) => {
    button.addEventListener("click", () => {
      chatAttachedImages.splice(Number(button.dataset.chatClearImage), 1);
      updateChatAttachedPreview();
    });
  });
}

// ---------- 안읽음 배지 ----------
async function refreshChatUnreadBadges() {
  if (!getAuthToken()) return;
  try {
    const data = await requestJson("/api/community/chats/unread");
    chatUnreadByUser = data.by_user || {};
    updateChatNavBadge(data.total || 0);
    updateFriendRowBadges();
  } catch (_error) {
    /* 배지는 보조 정보라 실패해도 조용히 넘어간다 */
  }
}

function updateChatNavBadge(total) {
  document.querySelectorAll('.portal-nav [data-show-view="community"]').forEach((button) => {
    let badge = button.querySelector(".chat-nav-badge");
    if (!total) {
      badge?.remove();
      return;
    }
    if (!badge) {
      badge = document.createElement("span");
      badge.className = "chat-nav-badge";
      button.appendChild(badge);
    }
    badge.textContent = total > 9 ? "9+" : String(total);
  });
}

function updateFriendRowBadges() {
  document.querySelectorAll("[data-friend-chat]").forEach((button) => {
    const count = Number(chatUnreadByUser[button.dataset.friendChat] || 0);
    let badge = button.querySelector(".chat-row-badge");
    if (!count) {
      badge?.remove();
      return;
    }
    if (!badge) {
      badge = document.createElement("span");
      badge.className = "chat-row-badge";
      button.appendChild(badge);
    }
    badge.textContent = count > 9 ? "9+" : String(count);
  });
}

function openCommunityComposeModal() {
  if (!getAuthToken()) {
    showPortalView("login");
    return;
  }
  communityComposeImages = [];
  document.getElementById("communityComposeText").value = "";
  document.getElementById("communityComposeImages").value = "";
  document.getElementById("communityComposeCamera").value = "";
  document.getElementById("communityComposePreview").innerHTML = "";
  document.getElementById("communityComposeMessage").hidden = true;
  document.getElementById("communityComposeModal").hidden = false;
  // 커플로 올리기: 연인이 있을 때만 노출
  const coupleRow = document.getElementById("composeCoupleRow");
  const coupleCheck = document.getElementById("composeAsCouple");
  if (coupleRow && coupleCheck) {
    coupleCheck.checked = false;
    coupleRow.hidden = true;
    (async () => {
      try {
        const status = myCoupleStatus || (await requestJson("/api/community/couple"));
        myCoupleStatus = status;
        if (status.partner) {
          document.getElementById("composeCoupleHint").textContent = `❤️ ${status.partner.nickname}`;
          coupleRow.hidden = false;
        }
      } catch (_error) {
        /* 커플 상태 못 불러오면 그냥 숨김 */
      }
    })();
  }
}

function closeCommunityComposeModal() {
  document.getElementById("communityComposeModal").hidden = true;
}

async function submitCommunityCompose() {
  const text = document.getElementById("communityComposeText").value.trim();
  const message = document.getElementById("communityComposeMessage");
  if (!text && !communityComposeImages.length) {
    message.textContent = "내용이나 사진을 입력해 주세요.";
    message.hidden = false;
    return;
  }
  const visibility = document.querySelector('input[name="communityComposeVisibility"]:checked')?.value || "public";
  const asCouple = document.getElementById("composeAsCouple")?.checked || false;
  const submitButton = document.getElementById("communityComposeSubmit");
  submitButton.disabled = true;
  try {
    await requestJson("/api/community/posts", {
      method: "POST",
      body: JSON.stringify({ post_type: "text", comment: text, visibility, images: communityComposeImages, as_couple: asCouple }),
    });
    closeCommunityComposeModal();
    loadCommunityFeed();
    loadHomeCommunityFeed();
  } catch (error) {
    message.textContent = error.message;
    message.hidden = false;
  } finally {
    submitButton.disabled = false;
  }
}

function openCommunityShareModal(course) {
  if (!getAuthToken()) {
    showPortalView("login");
    return;
  }
  communityShareCourse = course;
  const modal = document.getElementById("communityShareModal");
  document.getElementById("communityShareCourseName").textContent =
    (course.places || []).filter((place) => place.category !== "시작").map((place) => place.name).slice(0, 4).join(" → ");
  document.getElementById("communityShareTitleInput").value = course.title || "";
  document.getElementById("communityShareComment").value = "";
  const message = document.getElementById("communityShareMessage");
  message.hidden = true;
  modal.hidden = false;
}

function closeCommunityShareModal() {
  document.getElementById("communityShareModal").hidden = true;
  communityShareCourse = null;
}

async function submitCommunityShare() {
  if (!communityShareCourse) return;
  const title = document.getElementById("communityShareTitleInput").value.trim();
  const message = document.getElementById("communityShareMessage");
  if (!title) {
    message.textContent = "제목을 입력해 주세요.";
    message.hidden = false;
    return;
  }
  const visibility = document.querySelector('input[name="communityShareVisibility"]:checked')?.value || "public";
  const submitButton = document.getElementById("communityShareSubmit");
  submitButton.disabled = true;
  try {
    await requestJson("/api/community/posts", {
      method: "POST",
      body: JSON.stringify({
        title,
        comment: document.getElementById("communityShareComment").value.trim(),
        region_label: getCommunityRegionLabel(communityShareCourse),
        transport: communityShareCourse.transport || "walk",
        visibility,
        course: communityShareCourse,
      }),
    });
    closeCommunityShareModal();
    showPortalView("community");
  } catch (error) {
    message.textContent = error.message;
    message.hidden = false;
  } finally {
    submitButton.disabled = false;
  }
}

function bindCommunityEvents() {
  document.querySelectorAll("[data-community-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll("[data-community-tab]").forEach((item) => item.classList.toggle("active", item === button));
      const isFeed = button.dataset.communityTab === "feed";
      document.getElementById("communityFeedPanel").hidden = !isFeed;
      document.getElementById("communityFriendsPanel").hidden = isFeed;
      if (!isFeed) loadCommunityFriendsTab();
    });
  });
  document.getElementById("friendSearchButton")?.addEventListener("click", searchCommunityUsers);
  document.getElementById("friendSearchInput")?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      searchCommunityUsers();
    }
  });
  document.querySelector("[data-close-user-profile]")?.addEventListener("click", closeUserProfileModal);
  document.getElementById("userProfileModal")?.addEventListener("click", (event) => {
    if (event.target === event.currentTarget) closeUserProfileModal();
  });
  document.querySelectorAll("[data-follow-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      activeFollowSubtab = button.dataset.followTab;
      document.querySelectorAll("[data-follow-tab]").forEach((item) => item.classList.toggle("active", item === button));
      loadCommunityFriendsTab();
    });
  });
  document.querySelectorAll("[data-feed-scope]").forEach((button) => {
    button.addEventListener("click", () => {
      communityFeedScope = button.dataset.feedScope;
      document.querySelectorAll("[data-feed-scope]").forEach((item) => item.classList.toggle("active", item === button));
      loadCommunityFeed();
    });
  });
  document.querySelectorAll("[data-feed-sort]").forEach((button) => {
    button.addEventListener("click", () => {
      communityFeedSort = button.dataset.feedSort;
      document.querySelectorAll("[data-feed-sort]").forEach((item) => item.classList.toggle("active", item === button));
      loadCommunityFeed();
    });
  });
  document.getElementById("chatSendButton")?.addEventListener("click", sendChatMessage);
  document.getElementById("chatInput")?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      sendChatMessage();
    }
  });
  document.getElementById("chatInput")?.addEventListener("input", signalChatTyping);
  document.getElementById("chatAttachButton")?.addEventListener("click", toggleChatCoursePicker);
  document.getElementById("chatCameraButton")?.addEventListener("click", toggleChatPhotoMenu);
  document.getElementById("chatTakePhotoButton")?.addEventListener("click", () => {
    document.getElementById("chatPhotoMenu").hidden = true;
    document.getElementById("chatCameraInput").click();
  });
  document.getElementById("chatPickPhotoButton")?.addEventListener("click", () => {
    document.getElementById("chatPhotoMenu").hidden = true;
    document.getElementById("chatGalleryInput").click();
  });
  document.getElementById("chatCameraInput")?.addEventListener("change", handleChatImageSelection);
  document.getElementById("chatGalleryInput")?.addEventListener("change", handleChatImageSelection);
  document.getElementById("composeCameraButton")?.addEventListener("click", () => document.getElementById("communityComposeCamera").click());
  document.getElementById("composeGalleryButton")?.addEventListener("click", () => document.getElementById("communityComposeImages").click());
  document.getElementById("communityComposeCamera")?.addEventListener("change", handleComposeImageSelection);
  document.querySelector("[data-close-chat]")?.addEventListener("click", closeChatModal);
  document.getElementById("chatModal")?.addEventListener("click", (event) => {
    if (event.target === event.currentTarget) closeChatModal();
  });
  // 채팅 상단의 원형 아바타를 누르면 채팅을 닫고 그 친구의 프로필을 연다
  // (아바타만 클릭 대상 — 프로필 모달이 DOM 순서상 채팅 모달 아래라 닫고 여는 방식).
  document.getElementById("chatFriendAvatar")?.addEventListener("click", () => {
    if (chatFriendId === null) return;
    const friendId = chatFriendId;
    closeChatModal();
    openUserProfileModal(friendId);
  });
  // ----- 채팅 탭(세그먼트·단체방·그룹 채팅) 바인딩 -----
  document.querySelectorAll("[data-chathub-seg]").forEach((button) => {
    button.addEventListener("click", () => switchChatHubSeg(button.dataset.chathubSeg));
  });
  document.getElementById("createRoomButton")?.addEventListener("click", openCreateRoomModal);
  document.getElementById("createRoomConfirm")?.addEventListener("click", submitCreateRoom);
  document.getElementById("createRoomCancel")?.addEventListener("click", closeCreateRoomModal);
  document.querySelector("[data-close-create-room]")?.addEventListener("click", closeCreateRoomModal);
  document.getElementById("createRoomModal")?.addEventListener("click", (event) => {
    if (event.target === event.currentTarget) closeCreateRoomModal();
  });
  document.getElementById("roomChatSendButton")?.addEventListener("click", sendRoomMessage);
  document.getElementById("roomChatInput")?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      sendRoomMessage();
    }
  });
  document.getElementById("roomChatAttachButton")?.addEventListener("click", toggleRoomChatCoursePicker);
  document.getElementById("roomChatCameraButton")?.addEventListener("click", toggleRoomChatPhotoMenu);
  document.getElementById("roomChatTakePhotoButton")?.addEventListener("click", () => {
    document.getElementById("roomChatPhotoMenu").hidden = true;
    document.getElementById("roomChatCameraInput").click();
  });
  document.getElementById("roomChatPickPhotoButton")?.addEventListener("click", () => {
    document.getElementById("roomChatPhotoMenu").hidden = true;
    document.getElementById("roomChatGalleryInput").click();
  });
  document.getElementById("roomChatCameraInput")?.addEventListener("change", handleRoomChatImageSelection);
  document.getElementById("roomChatGalleryInput")?.addEventListener("change", handleRoomChatImageSelection);
  document.querySelector("[data-close-room-chat]")?.addEventListener("click", closeRoomChat);
  document.getElementById("roomChatModal")?.addEventListener("click", (event) => {
    if (event.target === event.currentTarget) closeRoomChat();
  });

  // 안읽음 배지·알림 점: 시작 시 1회 + 20초 주기(채팅 모달이 열려 있으면 모달 폴링이 읽음 처리하므로 건너뜀)
  refreshChatUnreadBadges();
  refreshNotificationDot();
  refreshChatTabBadge();
  setupPushAfterLogin();
  setInterval(() => {
    if (!getAuthToken()) return;
    if (document.getElementById("chatModal")?.hidden) refreshChatUnreadBadges();
    if (document.getElementById("notificationsModal")?.hidden) refreshNotificationDot();
    if (document.getElementById("roomChatModal")?.hidden) refreshChatTabBadge();
  }, 20000);
  document.getElementById("homeNotifButton")?.addEventListener("click", openNotificationsModal);
  document.getElementById("homeProfileChip")?.addEventListener("click", () => showPortalView("profile"));
  document.getElementById("enablePushButton")?.addEventListener("click", handlePushToggleClick);
  document.getElementById("pushOptInAllow")?.addEventListener("click", handlePushOptInAllow);
  document.getElementById("pushOptInDeny")?.addEventListener("click", handlePushOptInDeny);
  document.querySelector("[data-close-notifications]")?.addEventListener("click", closeNotificationsModal);
  document.getElementById("notificationsModal")?.addEventListener("click", (event) => {
    if (event.target === event.currentTarget) closeNotificationsModal();
  });
  document.getElementById("reportCancel")?.addEventListener("click", closeReportModal);
  document.querySelector("[data-close-report]")?.addEventListener("click", closeReportModal);
  document.getElementById("reportSubmit")?.addEventListener("click", submitReport);
  document.getElementById("reportModal")?.addEventListener("click", (event) => {
    if (event.target === event.currentTarget) closeReportModal();
  });
  document.querySelector("[data-close-post-more]")?.addEventListener("click", closePostMoreSheet);
  document.getElementById("postMoreSheet")?.addEventListener("click", (event) => {
    if (event.target === event.currentTarget) closePostMoreSheet();
  });
  document.getElementById("manageBlockedButton")?.addEventListener("click", openBlockedUsersModal);
  document.getElementById("editNicknameButton")?.addEventListener("click", () => toggleNicknameEditor(true));
  document.getElementById("cancelNicknameEditButton")?.addEventListener("click", () => toggleNicknameEditor(false));
  document.getElementById("profileNicknameForm")?.addEventListener("submit", saveProfileNickname);
  document.getElementById("profileAvatarButton")?.addEventListener("click", () => document.getElementById("profileAvatarInput")?.click());
  document.getElementById("profileAvatarInput")?.addEventListener("change", handleProfileAvatarSelection);
  bindAvatarCropEvents();
  document.getElementById("profileMoreButton")?.addEventListener("click", openProfileAccountModal);
  document.querySelector("[data-close-profile-account]")?.addEventListener("click", closeProfileAccountModal);
  document.getElementById("profileAccountModal")?.addEventListener("click", (event) => {
    if (event.target === event.currentTarget) closeProfileAccountModal();
  });
  document.getElementById("profileAccountLogoutButton")?.addEventListener("click", () => {
    closeProfileAccountModal();
    logoutUser();
  });
  document.getElementById("profileLikedPostsButton")?.addEventListener("click", openLikedPostsModal);
  document.querySelector("[data-close-liked-posts]")?.addEventListener("click", closeLikedPostsModal);
  document.getElementById("likedPostsModal")?.addEventListener("click", (event) => {
    if (event.target === event.currentTarget) closeLikedPostsModal();
  });
  document.querySelector("[data-close-blocked]")?.addEventListener("click", closeBlockedUsersModal);
  document.getElementById("blockedUsersModal")?.addEventListener("click", (event) => {
    if (event.target === event.currentTarget) closeBlockedUsersModal();
  });
  document.querySelector("[data-close-community-friends]")?.addEventListener("click", closeCommunityFriendsModal);
  document.getElementById("communityFriendsModal")?.addEventListener("click", (event) => {
    if (event.target === event.currentTarget) closeCommunityFriendsModal();
  });
  document.getElementById("friendCourseShareCancel")?.addEventListener("click", closeFriendCourseShareModal);
  document.querySelector("[data-close-friend-course-share]")?.addEventListener("click", closeFriendCourseShareModal);
  document.getElementById("friendCourseShareModal")?.addEventListener("click", (event) => {
    if (event.target === event.currentTarget) closeFriendCourseShareModal();
  });
  document.querySelectorAll("[data-close-comments-sheet]").forEach((button) => {
    button.addEventListener("click", closeCommunityCommentsSheet);
  });
  document.getElementById("communityCommentsSheet")?.addEventListener("click", (event) => {
    if (event.target === event.currentTarget) closeCommunityCommentsSheet();
  });
  // 배경 탭 닫기 보강: 키보드가 열려 있으면 click이 유실될 수 있어 pointerdown 시점에 닫는다.
  document.getElementById("communityCommentsSheet")?.addEventListener("pointerdown", (event) => {
    if (event.target === event.currentTarget) closeCommunityCommentsSheet();
  });
  bindCommentsSheetDrag();
  document.getElementById("commentsSheetForm")?.addEventListener("submit", submitCommentsSheet);
  document.querySelectorAll("[data-comment-emoji]").forEach((button) => {
    button.addEventListener("click", () => insertCommentEmoji(button.dataset.commentEmoji));
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !document.getElementById("communityCommentsSheet")?.hidden) {
      closeCommunityCommentsSheet();
    }
  });
  document.getElementById("communityShareCancel")?.addEventListener("click", closeCommunityShareModal);
  document.querySelector("[data-close-community-share]")?.addEventListener("click", closeCommunityShareModal);
  document.getElementById("communityShareSubmit")?.addEventListener("click", submitCommunityShare);
  document.getElementById("communityShareModal")?.addEventListener("click", (event) => {
    if (event.target === event.currentTarget) closeCommunityShareModal();
  });
  document.getElementById("communityComposeButton")?.addEventListener("click", openCommunityComposeModal);
  document.getElementById("communityComposeCancel")?.addEventListener("click", closeCommunityComposeModal);
  document.querySelector("[data-close-community-compose]")?.addEventListener("click", closeCommunityComposeModal);
  document.getElementById("communityComposeSubmit")?.addEventListener("click", submitCommunityCompose);
  document.getElementById("communityComposeImages")?.addEventListener("change", handleComposeImageSelection);
  document.getElementById("communityComposeModal")?.addEventListener("click", (event) => {
    if (event.target === event.currentTarget) closeCommunityComposeModal();
  });
}

function bindEvents() {
  bindTravelDateField();
  bindCommunityEvents();
  bindMapExploreSheetDrag();
  mapExploreForm?.addEventListener("submit", searchMapExplore);
  // '🔍 장소 검색·필터' CTA → 시트를 펼치고 검색창에 바로 포커스(검색 발견성 개선).
  document.getElementById("mapExploreFilterToggle")?.addEventListener("click", () => {
    const willExpand = mapExploreSheet?.dataset.state !== "expanded";
    setMapExploreSheetExpanded(willExpand);
    if (willExpand) window.setTimeout(() => mapExploreKeyword?.focus(), 240);
  });
  document.querySelectorAll('input[name="mapExploreCategory"]').forEach((input) => {
    input.addEventListener("change", () => {
      if (mapExploreState.loading) return;
      if (mapExploreKeyword?.value.trim() && mapExploreState.center) {
        searchMapExplore();
        return;
      }
      scheduleMapExploreAreaLoad({ force: true });
    });
  });
  // 드래그 도중 요소가 교체되거나 포인터가 유실되면 스크롤 잠금이 영구히 남아
  // 모든 화면에서 스크롤이 안 되는 문제가 생기므로, 포인터 종료 시 항상 잠금을 정리한다.
  // (버블 단계라 각 드래그 핸들러의 정상 처리 이후에 실행되어 기능에 영향 없음)
  document.addEventListener("pointerup", () => {
    window.setTimeout(() => setPlaceReorderScrollLock(false), 0);
  });
  document.addEventListener("pointercancel", () => {
    window.setTimeout(() => setPlaceReorderScrollLock(false), 0);
  });
  document.addEventListener("click", (event) => {
    if (event.target.closest("[data-course-place-index]")) return;
    closeCoursePlaceActionMenus();
  });
  searchPlaceButton.addEventListener("click", searchPlaces);
  placeKeyword.addEventListener("click", openStartPlaceModal);
  placeKeyword.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    openStartPlaceModal();
  });
  closeStartPlaceModalButton.addEventListener("click", closeStartPlaceModal);
  startPlaceModal.addEventListener("click", (event) => {
    if (event.target === startPlaceModal) closeStartPlaceModal();
  });
  closeBrowsePlaceDetailButton.addEventListener("click", closeBrowsePlaceDetailModal);
  browsePlaceDetailModal.addEventListener("click", (event) => {
    if (event.target === browsePlaceDetailModal) closeBrowsePlaceDetailModal();
  });
  startPlaceModalSearchButton.addEventListener("click", searchStartPlacesInModal);
  startPlaceModalKeyword.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    searchStartPlacesInModal();
  });
  searchRequiredPlaceButton.addEventListener("click", searchRequiredPlaces);
  searchAccommodationButton.addEventListener("click", searchAccommodations);
  form.addEventListener("submit", createRecommendations);
  editConditionsButton.addEventListener("click", () => showRecommendationStep("conditions"));
  backToResultsButton.addEventListener("click", () => showRecommendationStep("results"));
  saveFlowCourseButton.addEventListener("click", saveSelectedFlowCourse);
  window.addEventListener("scroll", updateRouteMapCompactState, { passive: true });
  window.addEventListener("resize", updateRouteMapCompactState);

  document.querySelectorAll('input[name="mode"]').forEach((input) => {
    input.addEventListener("change", () => {
      syncModeOptions();
      if (applyTriptiPreference.checked) handleTriptiApplyToggle();
    });
  });

  document.querySelectorAll('input[name="transport"]').forEach((input) => {
    input.addEventListener("change", () => {
      syncRadiusByTransport();
      if (applyTriptiPreference.checked) handleTriptiApplyToggle();
    });
  });

  radiusKm.addEventListener("input", () => {
    radiusValue.textContent = `${radiusKm.value}km`;
  });
  waypointCount.addEventListener("change", syncWaypointFoodOption);
  includeFood.addEventListener("change", syncWaypointFoodOption);
  includeLunch.addEventListener("change", syncMealFoodFields);
  includeDinner.addEventListener("change", syncMealFoodFields);
  startTimeAnyButton.addEventListener("click", toggleStartTimeAny);
  overnight.addEventListener("change", syncDinnerFoodOption);
  clearStartPlaceButton.addEventListener("click", clearStartPlace);
  recommendRegion.addEventListener("change", () => {
    updateRecommendRegionButton();
    syncNearbyAdminRegionOption();
    if (!selectedStartPlace) renderSelectedStartPlace();
  });
  applyTriptiPreference.addEventListener("change", handleTriptiApplyToggle);
}

function syncModeOptions() {
  const mode = getCheckedValue("mode");
  detailOptions.hidden = mode !== "detail";
  if (mode !== "detail") {
    resetDetailOptions();
  }
  syncRadiusByTransport();
  syncWaypointFoodOption();
  syncMealFoodFields();
  syncDinnerFoodOption();
  syncNearbyAdminRegionOption();
}

function updateRouteMapCompactState() {
  const mapPanel = recommendationView.querySelector(".map-panel");
  if (!mapPanel || mapPanel.hidden) return;
  mapPanel.classList.remove("route-map-compact");
}

function resetDetailOptions() {
  selectedRequiredPlaces = [];
  selectedAccommodation = null;
  requiredPlaceKeyword.value = "";
  accommodationKeyword.value = "";
  requiredPlaceResults.innerHTML = "";
  accommodationResults.innerHTML = "";
  overnight.checked = false;
  includeLunch.checked = true;
  includeCafe.checked = true;
  includeDinner.checked = false;
  includeBar.checked = false;
  includeBar.disabled = false;
  if (includeNearbyAdminRegions) includeNearbyAdminRegions.checked = true;
  includeFood.checked = true;
  foodCategory.selectedIndex = 0;
  dinnerFoodCategory.selectedIndex = 0;
  waypointCount.value = "5";
  radiusKm.value = getCheckedValue("transport") === "walk" ? "2" : "5";
  radiusValue.textContent = `${radiusKm.value}km`;
  startTime.value = "12:00";
  startTime.disabled = false;
  startTimeAnyButton.setAttribute("aria-pressed", "false");
  startTimeAnyButton.classList.remove("selected");
  startTimeAnyButton.textContent = "무관";
  renderSelectedRequiredPlace();
  renderSelectedAccommodation();
}

function syncWaypointFoodOption() {
  const canChoose = getCheckedValue("mode") === "detail" && includeLunch.checked && Number(waypointCount.value) <= 3;
  includeFoodOption.hidden = !canChoose;
  foodCategory.disabled = canChoose && !includeFood.checked;
}

function syncMealFoodFields() {
  if (lunchFoodField) lunchFoodField.hidden = !includeLunch.checked;
  if (dinnerFoodField) dinnerFoodField.hidden = !includeDinner.checked;
  syncWaypointFoodOption();
}

function toggleStartTimeAny() {
  const isAny = startTimeAnyButton.getAttribute("aria-pressed") !== "true";
  startTimeAnyButton.setAttribute("aria-pressed", String(isAny));
  startTimeAnyButton.classList.toggle("selected", isAny);
  startTimeAnyButton.textContent = isAny ? "유관" : "무관";
  startTime.disabled = isAny;
}

function syncDinnerFoodOption() {
  if (overnight.checked) {
    includeDinner.checked = true;
  }
  syncMealFoodFields();
}

function clearStartPlace() {
  selectedStartPlace = null;
  placeKeyword.value = "";
  renderSelectedStartPlace();
  renderMapForPlaces([getRecommendationStartPlace()]);
}

function getRandomRecommendationRegionCenter() {
  const key = RANDOM_RECOMMEND_REGION_KEYS[Math.floor(Math.random() * RANDOM_RECOMMEND_REGION_KEYS.length)];
  const region = REGION_CENTERS[key] || REGION_CENTERS.seoul;
  return {
    id: `${region.id}_random_start`,
    name: `${region.label} 랜덤 기준`,
    lat: region.lat,
    lon: region.lon,
    label: region.label,
  };
}

function getRecommendationStartPlace() {
  if (selectedStartPlace) return selectedStartPlace;
  return getRegionSelectionMeta(recommendRegion.value) || getRandomRecommendationRegionCenter();
}

function initMap() {
  renderMapForPlaces([getRecommendationStartPlace()]);
}

function syncRadiusByTransport() {
  const transport = getCheckedValue("transport");
  const mode = getCheckedValue("mode");

  if (transport === "walk") {
    radiusKm.max = 3;
    if (mode === "quick") {
      radiusKm.value = 2;
    } else if (Number(radiusKm.value) > 3) {
      radiusKm.value = 3;
    }
  } else if (transport === "car") {
    radiusKm.max = 20;
    if (mode === "quick") {
      radiusKm.value = 5;
    } else if (Number(radiusKm.value) < 5) {
      radiusKm.value = 5;
    }
  } else {
    radiusKm.max = 12;
    if (mode === "quick") {
      radiusKm.value = 5;
    } else if (Number(radiusKm.value) < 5) {
      radiusKm.value = 5;
    }
  }

  radiusValue.textContent = `${radiusKm.value}km`;
}

async function searchPlaces() {
  openStartPlaceModal();
}

function openStartPlaceModal() {
  startPlaceModal.hidden = false;
  startPlaceModalKeyword.value = placeKeyword.value.trim();
  if (startPlaceModalKeyword.value) {
    searchStartPlacesInModal();
  } else {
    startPlaceModalResults.innerHTML = "<small>장소명을 검색해 주세요.</small>";
    renderStartPlaceDefaultMap();
  }
  setTimeout(() => startPlaceModalKeyword.focus(), 50);
}

function closeStartPlaceModal() {
  startPlaceModal.hidden = true;
  clearStartPlaceTmapLayers();
}

async function searchStartPlacesInModal() {
  const keyword = startPlaceModalKeyword.value.trim();
  if (!keyword) {
    startPlaceModalResults.innerHTML = "<small>검색어를 입력해 주세요.</small>";
    renderStartPlaceDefaultMap();
    return;
  }

  startPlaceModalResults.innerHTML = "<small>장소를 검색하는 중입니다...</small>";
  renderStartPlaceDefaultMap();

  try {
    const data = await requestJson(`/api/places/search?keyword=${encodeURIComponent(keyword)}&count=7`);
    renderStartPlaceModalResults(data.places || []);
  } catch (error) {
    startPlaceModalResults.innerHTML = `<small>장소 검색 실패: ${escapeHtml(error.message)}</small>`;
    renderStartPlaceDefaultMap();
  }
}

function renderStartPlaceModalResults(places) {
  if (!places.length) {
    startPlaceModalResults.innerHTML = "<small>\uac80\uc0c9 \uacb0\uacfc\uac00 \uc5c6\uc2b5\ub2c8\ub2e4.</small>";
    renderStartPlaceDefaultMap();
    return;
  }

  renderStartPlaceCandidateMap(places);
  startPlaceModalResults.innerHTML = places.map((place, index) => `
    <article class="start-place-candidate" data-start-place-index="${index}" role="button" tabindex="0">
      <span class="start-place-candidate-photo" data-start-place-photo-index="${index}">
        <b>${index + 1}</b>
      </span>
      <span class="start-place-candidate-copy">
        <strong>${escapeHtml(place.name)}</strong>
        <small>${escapeHtml([place.address || "", translatePlaceCategory(place.middleBizName || place.source_category || place.category || "")].filter(Boolean).join(" · "))}</small>
      </span>
      <a class="candidate-naver-button" href="${buildNaverPlaceSearchUrl(place.name)}" target="_blank" rel="noopener noreferrer" data-candidate-naver-search aria-label="${escapeHtml(`${place.name} \ub124\uc774\ubc84 \uac80\uc0c9`)}" title="\ub124\uc774\ubc84\uc5d0\uc11c \uac80\uc0c9">\ub124\uc774\ubc84</a>
    </article>
  `).join("");
  startPlaceModalResults.querySelectorAll("[data-start-place-index]").forEach((card) => {
    const select = () => selectStartPlaceFromModal(places[Number(card.dataset.startPlaceIndex)]);
    card.addEventListener("click", select);
    card.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      select();
    });
  });
  startPlaceModalResults.querySelectorAll("[data-candidate-naver-search]").forEach((link) => {
    link.addEventListener("click", (event) => event.stopPropagation());
  });
  enrichStartPlaceCandidatePhotos(places);
}
async function renderStartPlaceDefaultMap() {
  clearStartPlaceTmapLayers();
  startPlaceCandidateMap.innerHTML = '<div id="startPlaceTmapMap" class="start-place-tmap-map"></div>';
  const defaultCenter = getRecommendationStartPlace();
  try {
    await loadTmapSdk();
    startPlaceTmapMap = new Tmapv2.Map("startPlaceTmapMap", {
      center: new Tmapv2.LatLng(defaultCenter.lat, defaultCenter.lon),
      width: "100%",
      height: "100%",
      zoom: 12,
      zoomControl: true,
      scrollwheel: true,
    });
  } catch (_error) {
    const imageUrl = `${API_BASE_URL}/api/maps/static?lat=${defaultCenter.lat}&lon=${defaultCenter.lon}&zoom=12`;
    startPlaceCandidateMap.innerHTML = `<div class="tmap-static-frame start-place-static-frame"><img src="${imageUrl}" alt="TMAP image" /></div>`;
  }
}
async function renderStartPlaceCandidateMap(places) {
  const validPlaces = places.filter((place) => Number.isFinite(Number(place.lat)) && Number.isFinite(Number(place.lon)));
  if (!validPlaces.length) {
    await renderStartPlaceDefaultMap();
    return;
  }

  const center = getCenterPoint(validPlaces);
  clearStartPlaceTmapLayers();
  startPlaceCandidateMap.innerHTML = '<div id="startPlaceTmapMap" class="start-place-tmap-map"></div>';

  try {
    await loadTmapSdk();
    startPlaceTmapMap = new Tmapv2.Map("startPlaceTmapMap", {
      center: new Tmapv2.LatLng(center.lat, center.lon),
      width: "100%",
      height: "100%",
      zoom: validPlaces.length >= 4 ? 13 : 15,
      zoomControl: true,
      scrollwheel: true,
    });
    startPlaceTmapMarkers = validPlaces.map((place, index) => createStartPlaceTmapMarker(place, index, places));
  } catch (_error) {
    renderStartPlaceStaticTmapFallback(validPlaces, places, center);
  }
}

function createStartPlaceTmapMarker(place, index, allPlaces) {
  const markerOptions = {
    position: new Tmapv2.LatLng(Number(place.lat), Number(place.lon)),
    map: startPlaceTmapMap,
    title: `${index + 1}. ${place.name}`,
    iconHTML: `<div class="tmap-marker-number start-place-marker-number">${index + 1}</div>`,
  };
  if (Tmapv2.Size) markerOptions.iconSize = new Tmapv2.Size(38, 38);
  const marker = new Tmapv2.Marker(markerOptions);
  if (marker.setIconHTML) marker.setIconHTML(`<div class="tmap-marker-number start-place-marker-number">${index + 1}</div>`);
  if (marker.addListener) marker.addListener("click", () => selectStartPlaceFromModal(allPlaces[index]));
  if (Tmapv2.Event?.addListener) Tmapv2.Event.addListener(marker, "click", () => selectStartPlaceFromModal(allPlaces[index]));
  return marker;
}

function clearStartPlaceTmapLayers(destroyMap = true) {
  startPlaceTmapMarkers.forEach((marker) => {
    if (marker?.setMap) marker.setMap(null);
  });
  if (destroyMap && startPlaceTmapMap?.destroy) startPlaceTmapMap.destroy();
  startPlaceTmapMarkers = [];
  if (destroyMap) startPlaceTmapMap = null;
}

function renderStartPlaceStaticTmapFallback(validPlaces, allPlaces, center) {
  const points = normalizePlacesToOverlayPoints(validPlaces);
  const imageUrl = `${API_BASE_URL}/api/maps/static?lat=${center.lat}&lon=${center.lon}&zoom=${validPlaces.length >= 4 ? 13 : 15}`;
  startPlaceCandidateMap.innerHTML = `
    <div class="tmap-static-frame start-place-static-frame">
      <img src="${imageUrl}" alt="Candidate places TMAP image" data-tmap-static-image />
      <svg class="tmap-static-overlay" viewBox="0 0 1000 1000" aria-label="Candidate places">
        ${points.map((point) => renderStaticMapPoint(point)).join("")}
      </svg>
    </div>
  `;
  armStaticTmapImageFallback(startPlaceCandidateMap.querySelector("[data-tmap-static-image]"));
  startPlaceCandidateMap.querySelectorAll(".tmap-static-point").forEach((marker, index) => {
    marker.addEventListener("click", () => selectStartPlaceFromModal(allPlaces[index]));
  });
}

async function enrichStartPlaceCandidatePhotos(places) {
  const queue = places.slice(0, 7).map((place, index) => ({ place, index }));
  const workers = Array.from({ length: Math.min(3, queue.length) }, async () => {
    while (queue.length) {
      const item = queue.shift();
      const slot = startPlaceModalResults.querySelector(`[data-start-place-photo-index="${item.index}"]`);
      if (!slot) continue;
      try {
        const photo = await resolvePlacePhoto(item.place, { width: 180, height: 180 });
        if (!photo?.url || !slot.isConnected) continue;
        const image = document.createElement("img");
        image.src = photo.url;
        image.alt = `${item.place.name} place photo`;
        image.loading = "lazy";
        if (photo.fallbackUrl) {
          image.addEventListener("error", () => {
            if (image.dataset.fallbackApplied === "true") return;
            image.dataset.fallbackApplied = "true";
            image.src = photo.fallbackUrl;
          }, { once: true });
        }
        slot.prepend(image);
      } catch (_error) {
        // Keep numbered placeholder when a candidate has no photo.
      }
    }
  });
  await Promise.all(workers);
}
function selectStartPlaceFromModal(place) {
  selectedStartPlace = {
    id: place.id || place.name,
    name: place.name,
    lat: place.lat,
    lon: place.lon,
  };
  placeKeyword.value = place.name;
  syncRecommendationRegionFromStartPlace(selectedStartPlace);
  renderSelectedStartPlace();
  renderMapForPlaces([selectedStartPlace]);
  closeStartPlaceModal();
}

async function searchRequiredPlaces() {
  const keyword = requiredPlaceKeyword.value.trim();
  if (!keyword) return;

  setRequiredPlaceResultsMessage("검색 중...");
  try {
    const data = await requestJson(`/api/places/search?keyword=${encodeURIComponent(keyword)}&count=5`);
    renderRequiredPlaceResults(data.places || []);
  } catch (error) {
    setRequiredPlaceResultsMessage(`장소 검색 실패: ${error.message}`);
  }
}

async function searchAccommodations() {
  const keyword = accommodationKeyword.value.trim();
  if (!keyword) return;

  setAccommodationResultsMessage("검색 중...");
  try {
    const data = await requestJson(`/api/places/search?keyword=${encodeURIComponent(keyword)}&count=5`);
    renderAccommodationResults(data.places || []);
  } catch (error) {
    setAccommodationResultsMessage(`숙소 검색 실패: ${error.message}`);
  }
}

function renderPlaceResults(places) {
  if (!places.length) {
    setPlaceResultsMessage("검색 결과가 없습니다.");
    return;
  }

  placeResults.innerHTML = "";
  places.forEach((place) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "place-option";
    button.innerHTML = `
      <strong>${escapeHtml(place.name)}</strong>
      <small>${escapeHtml(place.address || "")} · ${escapeHtml(place.middleBizName || "")}</small>
    `;
    button.addEventListener("click", () => {
      selectedStartPlace = {
        id: place.id || place.name,
        name: place.name,
        lat: place.lat,
        lon: place.lon,
      };
      syncRecommendationRegionFromStartPlace(selectedStartPlace);
      renderSelectedStartPlace();
      renderMapForPlaces([selectedStartPlace]);
    });
    placeResults.appendChild(button);
  });
}

function renderSelectedStartPlace() {
  if (!selectedStartPlace) {
    const regionLabel = getRegionSelectionMeta(recommendRegion.value)?.label || "선택 도시";
    const guideText = `${regionLabel} 중심으로 추천할게요.`;
    placeResults.innerHTML = `<div class="place-option selected start-place-state"><span class="start-place-state-icon">♡</span><div><strong>출발지는 자유롭게</strong><small>${escapeHtml(guideText)}</small></div></div>`;
    return;
  }
  placeResults.innerHTML = `
    <button type="button" class="place-option selected start-place-state">
      <span class="start-place-state-icon">♥</span>
      <div><small>출발 장소</small><strong>${escapeHtml(selectedStartPlace.name)}</strong></div>
    </button>
  `;
}

function renderRequiredPlaceResults(places) {
  if (!places.length) {
    setRequiredPlaceResultsMessage("검색 결과가 없습니다.");
    return;
  }
  requiredPlaceResults.innerHTML = "";
  places.forEach((place) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "place-option";
    button.innerHTML = `
      <strong>${escapeHtml(place.name)}</strong>
      <small>${escapeHtml(place.address || "")} · ${escapeHtml(place.middleBizName || "")}</small>
    `;
    button.addEventListener("click", () => {
      const selectedPlace = {
        id: place.id || place.name,
        name: place.name,
        lat: place.lat,
        lon: place.lon,
        upperBizName: place.upperBizName || "",
        middleBizName: place.middleBizName || "",
        lowerBizName: place.lowerBizName || "",
        detailBizName: place.detailBizName || "",
      };
      if (!selectedRequiredPlaces.some((place) => String(place.id) === String(selectedPlace.id))) {
        selectedRequiredPlaces.push(selectedPlace);
      }
      requiredPlaceKeyword.value = "";
      renderSelectedRequiredPlace();
    });
    requiredPlaceResults.appendChild(button);
  });
}

function renderSelectedRequiredPlace() {
  if (!selectedRequiredPlaces.length) {
    requiredPlaceResults.innerHTML = "";
    return;
  }
  requiredPlaceResults.innerHTML = selectedRequiredPlaces
    .map(
      (place, index) => `
        <div class="place-option selected">
          <div class="place-option-actions">
            <div>
              <strong>필수 방문 ${index + 1}: ${escapeHtml(place.name)}</strong>
              <small>모든 추천 코스에 포함됩니다.</small>
            </div>
            <button class="clear-place-button" type="button" data-required-place-index="${index}">삭제</button>
          </div>
        </div>
      `,
    )
    .join("");
  requiredPlaceResults.querySelectorAll("[data-required-place-index]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedRequiredPlaces.splice(Number(button.dataset.requiredPlaceIndex), 1);
      renderSelectedRequiredPlace();
    });
  });
}

function renderAccommodationResults(places) {
  if (!places.length) {
    setAccommodationResultsMessage("검색 결과가 없습니다.");
    return;
  }
  accommodationResults.innerHTML = "";
  places.forEach((place) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "place-option";
    button.innerHTML = `
      <strong>${escapeHtml(place.name)}</strong>
      <small>${escapeHtml(place.address || "")} · ${escapeHtml(place.middleBizName || "")}</small>
    `;
    button.addEventListener("click", () => {
      selectedAccommodation = {
        id: place.id || place.name,
        name: place.name,
        lat: place.lat,
        lon: place.lon,
        upperBizName: place.upperBizName || "",
        middleBizName: place.middleBizName || "",
        lowerBizName: place.lowerBizName || "",
        detailBizName: place.detailBizName || "",
      };
      overnight.checked = true;
      syncDinnerFoodOption();
      renderSelectedAccommodation();
    });
    accommodationResults.appendChild(button);
  });
}

function renderSelectedAccommodation() {
  if (!selectedAccommodation) {
    accommodationResults.innerHTML = "";
    return;
  }
  accommodationResults.innerHTML = `
    <div class="place-option selected">
      <div class="place-option-actions">
        <div>
          <strong>최종 숙소: ${escapeHtml(selectedAccommodation.name)}</strong>
          <small>데이트 코스가 끝난 뒤 숙소로 이동합니다.</small>
        </div>
        <button id="clearAccommodationButton" class="clear-place-button" type="button">해제</button>
      </div>
    </div>
  `;
  document.getElementById("clearAccommodationButton").addEventListener("click", () => {
    selectedAccommodation = null;
    accommodationKeyword.value = "";
    renderSelectedAccommodation();
  });
}

function setPlaceResultsMessage(message) {
  placeResults.innerHTML = `<div class="place-option"><small>${escapeHtml(message)}</small></div>`;
}

function setRequiredPlaceResultsMessage(message) {
  requiredPlaceResults.innerHTML = `<div class="place-option"><small>${escapeHtml(message)}</small></div>`;
}

function setAccommodationResultsMessage(message) {
  accommodationResults.innerHTML = `<div class="place-option"><small>${escapeHtml(message)}</small></div>`;
}

async function createRecommendations(event) {
  event.preventDefault();
  const submitButton = form.querySelector(".primary-button");
  submitButton.disabled = true;
  submitButton.textContent = "\ucd94\ucc9c \uc0dd\uc131 \uc911...";
  courseList.innerHTML = "";
  resultSummary.textContent = "\uc8fc\ubcc0 \uc7a5\uc18c\ub97c \uac80\uc0c9\ud558\uace0 \uc608\uc0c1 \uac70\ub9ac\ub85c \ucf54\uc2a4\ub97c \uc870\ud569\ud558\ub294 \uc911\uc785\ub2c8\ub2e4.";

  const mode = getCheckedValue("mode");
  const transport = getCheckedValue("transport");
  const isDetail = mode === "detail";
  const body = {
    start_place: getRecommendationStartPlace(),
    required_places: isDetail ? selectedRequiredPlaces : [],
    accommodation_place: isDetail ? selectedAccommodation : null,
    overnight: isDetail ? overnight.checked : false,
    start_time: isDetail && !startTime.disabled ? startTime.value : null,
    travel_date: isDetail ? selectedTravelDate : null,
    apply_weather: Boolean(
      isDetail && selectedTravelDate && document.getElementById("applyWeather")?.checked,
    ),
    transport,
    mode,
    include_food: isDetail ? includeLunch.checked : true,
    include_cafe: isDetail ? includeCafe.checked : true,
    include_dinner: isDetail ? includeDinner.checked : false,
    include_bar: isDetail ? includeBar.checked : false,
    exclude_franchise_food: Boolean(
      isDetail && document.getElementById("excludeFranchiseFood")?.checked,
    ),
    only_open_now: Boolean(onlyOpenNow?.checked),
    region_key: recommendRegion.value,
    include_nearby_admin_regions: Boolean(includeNearbyAdminRegions?.checked),
    preferred_place_categories: applyTriptiPreference?.checked ? triptiPreferredPlaceCategories : [],
  };

  if (isDetail) {
    body.radius_km = Number(radiusKm.value);
    body.waypoint_count = Number(waypointCount.value);
    body.include_food = includeLunch.checked && (Number(waypointCount.value) > 3 || includeFood.checked);
    body.food_categories = body.include_food ? [foodCategory.value] : null;
    body.dinner_food_categories = includeDinner.checked ? [dinnerFoodCategory.value] : null;
  }

  try {
    let data = await requestJson("/api/recommendations", {
      method: "POST",
      body: JSON.stringify(body),
    });
    // "현재 운영 중인 장소만" 조건 때문에 0건이 나오면(심야 등) 그 조건만 빼고
    // 한 번 더 시도한다 — 사용자에게는 오류가 아니라 안내로 보여준다.
    let openNowRelaxed = false;
    if (!(data.courses || []).length && body.only_open_now) {
      data = await requestJson("/api/recommendations", {
        method: "POST",
        body: JSON.stringify({ ...body, only_open_now: false }),
      });
      openNowRelaxed = true;
    }
    currentCourses = data.courses || [];
    visibleCourseIndex = 0;
    replacementHistoryBySlot.clear();
    lastRecommendationData = data;
    selectedCourseId = null;
    renderCourses(currentCourses, data);
    if (openNowRelaxed && currentCourses.length) {
      resultSummary.textContent = `지금 영업 중인 장소가 부족해서, 운영시간 조건을 빼고 ${currentCourses.length}개 코스를 추천했어요.`;
    }
    showRecommendationStep("results");
  } catch (error) {
    resultSummary.textContent = `\ucd94\ucc9c \uc0dd\uc131 \uc2e4\ud328: ${error.message}`;
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "\ucd94\ucc9c \ucf54\uc2a4 \ub9cc\ub4e4\uae30";
  }
}
function renderCourses(courses, data) {
  if (!courses.length) {
    resultSummary.textContent = "추천 가능한 코스를 찾지 못했습니다. 반경을 넓히거나 조건을 바꿔보세요.";
    courseCarouselStatus.textContent = "0 / 0";
    previousCourseButton.disabled = true;
    nextCourseButton.disabled = true;
    return;
  }

  visibleCourseIndex = Math.min(visibleCourseIndex, courses.length - 1);
  const weatherInfo = data?.weather;
  if (weatherInfo?.applied && weatherInfo.summary) {
    const [, month, day] = String(weatherInfo.date || "").split("-").map(Number);
    const dateLabel = month && day ? `${month}/${day} ` : "";
    resultSummary.textContent = `추천 코스 ${courses.length}개 · ☂ ${dateLabel}${weatherInfo.summary}`;
  } else if (weatherInfo && !weatherInfo.applied && weatherInfo.requested) {
    resultSummary.textContent = `추천 코스 ${courses.length}개 · 날씨 정보를 불러오지 못해 기본 추천으로 구성했어요`;
  } else {
    resultSummary.textContent = `추천 코스 ${courses.length}개`;
  }
  courseList.innerHTML = "";

  const course = courses[visibleCourseIndex];
  const card = document.createElement("article");
  card.className = "course-card";
  if (courseCarouselEntryDirection) {
    card.classList.add(courseCarouselEntryDirection > 0 ? "course-card-enter-right" : "course-card-enter-left");
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => card.classList.add("course-card-enter-active"));
    });
    window.setTimeout(() => {
      card.classList.remove("course-card-enter-right", "course-card-enter-left", "course-card-enter-active");
    }, 280);
    courseCarouselEntryDirection = 0;
  }
  card.dataset.courseId = course.course_id;
  card.innerHTML = `
    <div class="course-photo-strip">
      ${course.places.slice(1, 4).map((place, index) => `<div class="course-photo-slot course-photo-slot-${index + 1}" data-course-photo-index="${index + 1}"><span>${escapeHtml(place.name)}</span></div>`).join("")}
    </div>
    <div class="course-card-body">
    <h3>${escapeHtml(course.title)}</h3>
    <div class="course-meta">
      <span>${formatKm(course.route.total_distance_m)}</span>
      <span>1인 예산 약 ${formatWon(course.estimated_budget_won)}</span>
      <span>점수 ${course.score}</span>
    </div>
    <div class="course-replacement-editor" data-replacement-editor="${escapeHtml(course.course_id)}" hidden></div>
    <div class="course-edit-actions">
      <button class="secondary-button compact-button" type="button" data-share-course>공유</button>
      <button class="secondary-button compact-button" type="button" data-friend-share-course>친구에게 공유</button>
    </div>
    <div class="course-add-editor" data-add-place-editor hidden></div>
    <ol class="place-chain">
      ${course.places.map((place, index) => renderCoursePlaceItem(course, place, index)).join("")}
    </ol>
    <div class="course-replacement-editor" data-replacement-editor="${escapeHtml(course.course_id)}" hidden></div>
    <div class="course-edit-actions">
      <button class="primary-button compact-button" type="button" data-view-course-flow>코스 흐름 보기</button>
      <button class="secondary-button compact-button${courseOrderEditMode ? " is-active" : ""}" type="button" data-toggle-course-order-edit aria-pressed="${courseOrderEditMode ? "true" : "false"}">
        ${courseOrderEditMode ? "순서 편집 완료" : "순서 편집"}
      </button>
      <button class="secondary-button compact-button" type="button" data-open-add-place>+ 일정 추가</button>
      <button class="secondary-button compact-button" type="button" data-save-course>결과 저장하기</button>
      <button class="secondary-button compact-button" type="button" data-community-share>커뮤니티 공유</button>
    </div>
    <div class="course-add-editor" data-add-place-editor hidden></div>
    </div>
  `;
  card.querySelector("[data-view-course-flow]").addEventListener("click", (event) => {
    event.stopPropagation();
    selectCourse(course.course_id);
  });
  card.querySelector("[data-toggle-course-order-edit]").addEventListener("click", (event) => {
    event.stopPropagation();
    courseOrderEditMode = !courseOrderEditMode;
    renderCourses(currentCourses, lastRecommendationData || { candidate_counts: {} });
  });
  card.querySelectorAll("[data-place-info-index]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const place = course.places[Number(button.dataset.placeInfoIndex)];
      recordRecentPlace(place);
      openBrowsePlaceDetail(place, { allowRecommendation: false });
    });
  });
  card.querySelectorAll("[data-place-actions-toggle]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const item = button.closest("[data-course-place-index]");
      const wasOpen = Boolean(item?.classList.contains("mobile-actions-open"));
      card.querySelectorAll(".mobile-actions-open").forEach((openItem) => {
        if (openItem !== item) {
          openItem.classList.remove("mobile-actions-open");
          openItem.querySelector("[data-place-actions-toggle]")?.setAttribute("aria-expanded", "false");
        }
      });
      const isOpen = item ? !wasOpen : false;
      item?.classList.toggle("mobile-actions-open", isOpen);
      button.setAttribute("aria-expanded", String(isOpen));
      button.setAttribute("aria-label", isOpen ? "장소 메뉴 닫기" : "장소 메뉴 열기");
    });
  });
  card.querySelectorAll("[data-replace-place-index]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      openCourseReplacementEditor(course.course_id, Number(button.dataset.replacePlaceIndex));
    });
  });
  card.querySelectorAll("[data-google-maps-link]").forEach((link) => {
    link.addEventListener("click", (event) => event.stopPropagation());
  });
  card.querySelectorAll("[data-delete-place-index]").forEach((button) => {
    button.addEventListener("click", async (event) => {
      event.stopPropagation();
      await deleteCoursePlace(course.course_id, Number(button.dataset.deletePlaceIndex));
    });
  });
  if (courseOrderEditMode) bindCoursePlaceDragAndDrop(course, card);
  card.querySelector("[data-open-add-place]").addEventListener("click", (event) => {
    event.stopPropagation();
    openCourseAddEditor(course.course_id, card);
  });
  card.querySelector("[data-save-course]").addEventListener("click", (event) => {
    event.stopPropagation();
    saveCourse(course);
  });
  card.querySelector("[data-share-course]").addEventListener("click", async (event) => {
    event.stopPropagation();
    await shareCourse(course);
  });
  card.querySelector("[data-friend-share-course]").addEventListener("click", (event) => {
    event.stopPropagation();
    openFriendCourseShareModal(course);
  });
  card.querySelector("[data-community-share]").addEventListener("click", (event) => {
    event.stopPropagation();
    openCommunityShareModal(course);
  });
  courseList.appendChild(card);
  enrichCourseCardPhotos(course, card);

  courseCarouselStatus.textContent = `${visibleCourseIndex + 1} / ${courses.length}`;
  previousCourseButton.disabled = visibleCourseIndex === 0;
  nextCourseButton.disabled = visibleCourseIndex === courses.length - 1;
  renderMapForPlaces(course.places);
}

async function enrichCourseCardPhotos(course, card) {
  const photoPlaces = course.places.slice(1, 4);
  await Promise.all(photoPlaces.map(async (place, index) => {
    const slot = card.querySelector(`[data-course-photo-index="${index + 1}"]`);
    if (!slot) return;
    try {
      const photo = await resolvePlacePhoto(place, { width: 640, height: 420 });
      if (!photo?.url || !card.isConnected) return;
      const image = document.createElement("img");
      image.src = photo.url;
      image.alt = `${place.name} 장소 사진`;
      image.loading = "lazy";
      if (photo.fallbackUrl) {
        image.addEventListener("error", () => {
          if (image.dataset.fallbackApplied === "true") return;
          image.dataset.fallbackApplied = "true";
          image.src = photo.fallbackUrl;
        }, { once: true });
      }
      slot.prepend(image);
      if (photo.sourceHtml) {
        const credit = document.createElement("a");
        credit.className = "course-photo-credit";
        credit.href = place.naver_image_link || place.google_photo_attribution_uri || place.google_maps_uri || "#";
        credit.target = "_blank";
        credit.rel = "noopener noreferrer";
        credit.textContent = photo.source || "사진";
        credit.addEventListener("click", (event) => event.stopPropagation());
        slot.appendChild(credit);
      }
    } catch (_error) {
      // Keep the pastel placeholder when a place has no suitable photo.
    }
  }));
}

function moveVisibleCourse(direction, options = {}) {
  const nextIndex = visibleCourseIndex + direction;
  if (nextIndex < 0 || nextIndex >= currentCourses.length) return;
  courseCarouselEntryDirection = options.animateEntry ? direction : 0;
  visibleCourseIndex = nextIndex;
  renderCourses(currentCourses, lastRecommendationData || { candidate_counts: {} });
}

function closeCoursePlaceActionMenus() {
  document.querySelectorAll(".mobile-actions-open").forEach((item) => {
    item.classList.remove("mobile-actions-open");
    item.querySelector("[data-place-actions-toggle]")?.setAttribute("aria-expanded", "false");
    item.querySelector("[data-place-actions-toggle]")?.setAttribute("aria-label", "장소 메뉴 열기");
  });
}

function renderCoursePlaceItem(course, place, index) {
  // 필수 지정 장소(locked)도 결과 화면에서는 사용자가 직접 바꿀 수 있어야 하므로
  // 시작 장소(1번)만 고정하고 나머지는 항상 변경·삭제를 연다.
  const canModify = index > 0;
  const canReplace = canModify;
  const canDrag = courseOrderEditMode && canModify;
  const openingStatus = renderPlaceOpeningStatus(place);
  return `
    <li class="${canDrag ? "draggable-course-place" : "locked-course-place"}${courseOrderEditMode ? " course-order-editing" : ""}" data-course-place-index="${index}">
      ${canDrag ? '<span class="drag-handle" aria-hidden="true" title="끌어서 순서 변경">⋮⋮</span>' : ""}
      <span>${escapeHtml(place.name)} <small>${escapeHtml(place.category)}</small>${renderNaverReviewRankBadge(place)}${place.google_review_count ? ` <a class="google-review-badge" href="${escapeHtml(place.google_maps_uri || "#")}" target="_blank" rel="noopener noreferrer" data-google-maps-link>리뷰 ${Number(place.google_review_count).toLocaleString("ko-KR")}개</a>` : ""}${openingStatus}</span>
      <button class="place-mobile-menu-button" type="button" data-place-actions-toggle="${index}" aria-label="${escapeHtml(`${place.name} 메뉴 열기`)}"><svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><circle cx="12" cy="5" r="1.9"/><circle cx="12" cy="12" r="1.9"/><circle cx="12" cy="19" r="1.9"/></svg></button>
      <span class="place-edit-buttons">
        <button class="replace-place-button place-info-button" type="button" data-place-info-index="${index}">정보</button>
        ${canReplace ? `<button class="replace-place-button" type="button" data-replace-place-index="${index}">변경</button>` : ""}
        ${canModify ? `<button class="replace-place-button" type="button" data-delete-place-index="${index}">삭제</button>` : ""}
      </span>
    </li>
  `;
}

// "오전 10:00" / "오후 10:30" 같은 한국어 시각 토큰을 자정 기준 분으로 변환한다.
function parseKoreanClockToken(token) {
  const match = String(token).match(/(오전|오후)\s*(\d{1,2}):(\d{2})/);
  if (!match) return null;
  let hour = parseInt(match[2], 10);
  const minute = parseInt(match[3], 10);
  if (match[1] === "오전") {
    if (hour === 12) hour = 0;
  } else if (hour !== 12) {
    hour += 12;
  }
  return hour * 60 + minute;
}

// "월요일: 오전 10:00 ~ 오후 10:30" 한 줄을 파싱한다.
// 반환: { closed, allDay, ranges:[{start,end}] } (end는 자정 넘김 시 1440 초과 가능) 또는 null(해석 불가)
function parseKoreanHoursLine(line) {
  if (!line || typeof line !== "string") return null;
  const colonIndex = line.indexOf(":");
  const body = (colonIndex >= 0 ? line.slice(colonIndex + 1) : line).trim();
  if (!body) return null;
  if (/(휴무|휴업|닫힘|영업\s*안|closed)/i.test(body)) return { closed: true, allDay: false, ranges: [] };
  if (/24\s*시간|항상\s*영업/.test(body)) return { closed: false, allDay: true, ranges: [] };
  const ranges = [];
  body.split(",").forEach((segment) => {
    const tokens = segment.match(/(오전|오후)\s*\d{1,2}:\d{2}/g);
    if (!tokens || tokens.length < 2) return;
    const start = parseKoreanClockToken(tokens[0]);
    let end = parseKoreanClockToken(tokens[1]);
    if (start === null || end === null) return;
    if (end <= start) end += 1440; // 자정을 넘기는 영업(예: 18:00~02:00)
    ranges.push({ start, end });
  });
  if (!ranges.length) return null;
  return { closed: false, allDay: false, ranges };
}

// 표시되는 운영시간 표 + 현재 한국 시각으로 실시간 영업 여부를 계산한다.
// open_now(과거 캐시된 boolean)와 달리 항상 현재 시각·표시된 시간표와 일치한다.
// 반환: true(영업중) / false(영업종료) / undefined(시간표로 판단 불가)
function computePlaceOpenNow(place) {
  const hours = Array.isArray(place && place.opening_hours) ? place.opening_hours : [];
  if (!hours.length) return undefined;
  const weekdayNames = ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"];
  const kstNow = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
  if (Number.isNaN(kstNow.getTime())) return undefined;
  const minutes = kstNow.getHours() * 60 + kstNow.getMinutes();
  const todayName = weekdayNames[kstNow.getDay()];
  const yesterdayName = weekdayNames[(kstNow.getDay() + 6) % 7];
  const findLine = (name) => hours.find((item) => typeof item === "string" && item.trim().startsWith(name));
  const inRanges = (ranges, value) => ranges.some((range) => value >= range.start && value < range.end);

  const today = parseKoreanHoursLine(findLine(todayName));
  if (today) {
    if (today.allDay) return true;
    if (!today.closed && inRanges(today.ranges, minutes)) return true;
  }
  // 전날 영업이 자정을 넘겨 오늘 새벽까지 이어지는 경우
  const yesterday = parseKoreanHoursLine(findLine(yesterdayName));
  if (yesterday && !yesterday.closed && !yesterday.allDay && inRanges(yesterday.ranges, minutes + 1440)) return true;
  // 오늘 줄을 해석할 수 있었는데 어떤 영업시간에도 안 걸리면 종료로 판단
  if (today && (today.allDay || today.closed || today.ranges.length)) return false;
  return undefined;
}

// 캐시된 open_now 대신 가능하면 실시간 계산값을 우선 사용한다.
function resolvePlaceOpenNow(place) {
  const computed = computePlaceOpenNow(place);
  if (computed !== undefined) return computed;
  return place ? place.open_now : undefined;
}

function renderPlaceOpeningStatus(place, options = {}) {
  const openNow = resolvePlaceOpenNow(place);
  if (openNow === null || openNow === undefined) {
    return options.showUnknown
      ? ' <span class="opening-status is-unknown">상세에서 영업시간 확인</span>'
      : "";
  }
  const today = new Intl.DateTimeFormat("ko-KR", { weekday: "long" }).format(new Date());
  const todayHours = (place.opening_hours || []).find((item) => String(item).startsWith(today));
  const label = openNow ? "영업 중" : "영업 종료";
  const title = todayHours ? ` title="${escapeHtml(todayHours)}"` : "";
  return ` <span class="opening-status ${openNow ? "is-open" : "is-closed"}"${title}>${label}</span>`;
}

function bindCoursePlaceDragAndDrop(course, card) {
  const chain = card.querySelector(".place-chain");
  let draggedIndex = null;
  let insertionIndex = null;
  let pointerActive = false;
  let longPressTimer = null;
  let activePointerId = null;
  let activeDragItem = null;
  let pointerStartX = 0;
  let pointerStartY = 0;
  const isMobileDrag = window.matchMedia("(max-width: 760px)").matches;
  // 길게 누르면 장소가 들리는 방식. 너무 길면 안 눌린 줄 알고, 짧으면 스크롤과 충돌해 0.6초로 한다.
  const mobileHoldMs = 600;
  const mobileMoveTolerancePx = 14;

  function clearDragState() {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
    chain.querySelectorAll(".dragging, .drop-before, .drop-after").forEach((item) => {
      item.classList.remove("dragging", "drop-before", "drop-after");
    });
    draggedIndex = null;
    insertionIndex = null;
    pointerActive = false;
    activePointerId = null;
    activeDragItem = null;
    setPlaceReorderScrollLock(false);
  }

  function activateDrag(item, pointerId) {
    if (draggedIndex === null) return;
    pointerActive = true;
    activePointerId = pointerId;
    activeDragItem = item;
    item.classList.add("dragging");
    if (isMobileDrag) {
      setPlaceReorderScrollLock(true);
      navigator.vibrate?.(30); // 들렸다는 햅틱 피드백
    }
    item.setPointerCapture?.(pointerId);
  }

  chain.querySelectorAll("[data-course-place-index]").forEach((item) => {
    const placeIndex = Number(item.dataset.coursePlaceIndex);
    if (!item.classList.contains("draggable-course-place")) return;

    item.addEventListener("pointerdown", (event) => {
      if (event.target.closest("button, a")) return;
      draggedIndex = placeIndex;
      insertionIndex = placeIndex;
      pointerActive = false;
      activePointerId = event.pointerId;
      activeDragItem = item;
      pointerStartX = event.clientX;
      pointerStartY = event.clientY;
      if (isMobileDrag) {
        longPressTimer = window.setTimeout(() => {
          activateDrag(item, event.pointerId);
          markCourseDropPosition(chain, event.clientX, event.clientY, (nextIndex) => {
            insertionIndex = nextIndex;
          });
        }, mobileHoldMs);
      } else {
        item.setPointerCapture?.(event.pointerId);
      }
    });

    item.addEventListener("pointermove", (event) => {
      if (draggedIndex !== placeIndex) return;
      if (isMobileDrag && !pointerActive) {
        // 길게 누르기 완료 전에 손가락이 충분히 움직이면 스크롤 의도로 보고 드래그를 포기한다.
        if (
          Math.abs(event.clientX - pointerStartX) > mobileMoveTolerancePx ||
          Math.abs(event.clientY - pointerStartY) > mobileMoveTolerancePx
        ) {
          clearDragState();
        }
        return;
      }
      if (!pointerActive && Math.abs(event.clientY - pointerStartY) < 5) return;
      if (!pointerActive) activateDrag(item, event.pointerId);
      event.preventDefault();
      markCourseDropPosition(chain, event.clientX, event.clientY, (nextIndex) => {
        insertionIndex = nextIndex;
      });
    });

    // 들린(드래그 중) 상태에서는 터치 스크롤을 직접 차단하고,
    // 길게 누르기 대기 중에 손가락이 움직이면(스크롤 의도) 타이머를 취소한다.
    // 스크롤이 시작되면 pointermove/pointercancel이 오지 않는 브라우저가 있어
    // 끊기지 않고 오는 touch 이벤트로 취소를 보강해야 "스쳤는데 들림"이 안 생긴다.
    item.addEventListener(
      "touchmove",
      (event) => {
        if (draggedIndex !== placeIndex) return;
        if (pointerActive) {
          event.preventDefault();
          return;
        }
        const touch = event.touches[0];
        if (
          touch &&
          (Math.abs(touch.clientX - pointerStartX) > mobileMoveTolerancePx ||
            Math.abs(touch.clientY - pointerStartY) > mobileMoveTolerancePx)
        ) {
          clearDragState();
        }
      },
      { passive: false },
    );

    // 손가락을 뗐는데 pointerup이 오지 않는 경우 대비 — 대기 중 타이머만 정리한다.
    item.addEventListener("touchend", () => {
      if (draggedIndex === placeIndex && !pointerActive) clearDragState();
    });

    item.addEventListener("pointerup", async (event) => {
      if (draggedIndex !== placeIndex) return;
      item.releasePointerCapture?.(event.pointerId);
      const sourceIndex = draggedIndex;
      const destinationIndex = insertionIndex;
      const shouldReorder = pointerActive && destinationIndex !== null;
      clearDragState();
      if (shouldReorder) await reorderCoursePlace(course.course_id, sourceIndex, destinationIndex);
    });

    item.addEventListener("pointercancel", () => {
      if (draggedIndex === placeIndex) clearDragState();
    });
  });

}

function markCourseDropPosition(chain, clientX, clientY, setInsertionIndex) {
  const target = document.elementFromPoint(clientX, clientY)?.closest("[data-course-place-index]");
  if (!target || !chain.contains(target)) return;
  const targetIndex = Number(target.dataset.coursePlaceIndex);
  const rect = target.getBoundingClientRect();
  const after = clientY > rect.top + rect.height / 2;
  setInsertionIndex(targetIndex + (after ? 1 : 0));
  chain.querySelectorAll(".drop-before, .drop-after").forEach((place) => {
    place.classList.remove("drop-before", "drop-after");
  });
  target.classList.add(after ? "drop-after" : "drop-before");
}

function openCourseReplacementEditor(courseId, placeIndex) {
  const course = currentCourses.find((item) => item.course_id === courseId);
  const place = course?.places[placeIndex];
  const editor = document.querySelector(`[data-replacement-editor="${courseId}"]`);
  if (!course || !place || !editor) return;

  editor.hidden = false;
  editor.innerHTML = `
    <strong>${escapeHtml(place.name)} 대신 갈 장소 검색</strong>
    <button class="auto-replace-button" type="button" data-auto-replacement>비슷한 장소 자동 추천</button>
    <div class="search-row">
      <input type="text" data-replacement-keyword placeholder="예: 아쿠아리움, 미술관, 감성 카페" autocomplete="off" />
      <button type="button" data-search-replacement>검색</button>
    </div>
    <div class="replacement-results direct-replacement-results" data-replacement-results></div>
    <div class="nearby-replacement-block">
      <strong>가까운 유사 장소</strong>
      <small>현재 장소에서 가까운 순서입니다. 원하는 장소를 바로 선택하세요.</small>
      <div class="replacement-results" data-nearby-replacement-results><small>가까운 장소를 찾는 중...</small></div>
    </div>
  `;
  editor.addEventListener("click", (event) => event.stopPropagation());
  editor.querySelector("[data-auto-replacement]").addEventListener("click", async () => {
    await autoReplaceCoursePlace(courseId, placeIndex, editor);
  });
  editor.querySelector("[data-search-replacement]").addEventListener("click", async () => {
    const keyword = editor.querySelector("[data-replacement-keyword]").value.trim();
    if (!keyword) return;
    const results = editor.querySelector("[data-replacement-results]");
    results.innerHTML = "<small>검색 중...</small>";
    try {
      const data = await requestJson(`/api/places/search?keyword=${encodeURIComponent(keyword)}&count=5`);
      renderCourseReplacementResults(results, courseId, placeIndex, data.places || []);
    } catch (error) {
      results.innerHTML = `<small>장소 검색 실패: ${escapeHtml(error.message)}</small>`;
    }
  });
  loadNearbyReplacementPlaces(courseId, placeIndex, editor);
}

async function loadNearbyReplacementPlaces(courseId, placeIndex, editor) {
  const course = currentCourses.find((item) => item.course_id === courseId);
  const place = course?.places[placeIndex];
  const results = editor.querySelector("[data-nearby-replacement-results]");
  if (!course || !place || !results) return;

  try {
    const params = new URLSearchParams({
      lat: place.lat,
      lon: place.lon,
      category: place.category || "",
      source_category: place.source_category || "",
      exclude_name: place.name,
      count: "8",
    });
    const data = await requestJson(`/api/places/replacements?${params.toString()}`);
    renderCourseReplacementResults(results, courseId, placeIndex, data.nearby_places || []);
  } catch (error) {
    results.innerHTML = `<small>가까운 장소 조회 실패: ${escapeHtml(error.message)}</small>`;
  }
}

async function autoReplaceCoursePlace(courseId, placeIndex, editor) {
  const course = currentCourses.find((item) => item.course_id === courseId);
  const place = course?.places[placeIndex];
  const button = editor.querySelector("[data-auto-replacement]");
  const results = editor.querySelector("[data-replacement-results]");
  if (!course || !place || !button || !results) return;

  button.disabled = true;
  button.textContent = "자동 추천 중...";
  results.innerHTML = "<small>현재 장소와 비슷한 주변 장소를 찾고 있습니다.</small>";
  try {
    const params = new URLSearchParams({
      lat: place.lat,
      lon: place.lon,
      category: place.category || "",
      source_category: place.source_category || "",
      exclude_name: place.name,
      count: "10",
    });
    const data = await requestJson(`/api/places/replacements?${params.toString()}`);
    const usedNames = new Set(course.places.map((item) => item.name.replaceAll(" ", "").toLowerCase()));
    const slotKey = `${courseId}:${placeIndex}`;
    const replacementHistory = replacementHistoryBySlot.get(slotKey) || new Set();
    const replacement = (data.places || []).find(
      (item) => {
        const normalizedName = String(item.name || "").replaceAll(" ", "").toLowerCase();
        return !usedNames.has(normalizedName) && !replacementHistory.has(normalizedName);
      },
    );
    if (!replacement) {
      results.innerHTML = "<small>겹치지 않는 비슷한 장소를 찾지 못했습니다. 직접 검색해 주세요.</small>";
      return;
    }
    await replaceCoursePlace(courseId, placeIndex, replacement);
  } catch (error) {
    results.innerHTML = `<small>자동 추천 실패: ${escapeHtml(error.message)}</small>`;
  } finally {
    button.disabled = false;
    button.textContent = "비슷한 장소 자동 추천";
  }
}

function renderCourseReplacementResults(container, courseId, placeIndex, places) {
  if (!places.length) {
    container.innerHTML = "<small>검색 결과가 없습니다.</small>";
    return;
  }
  container.innerHTML = "";
  places.forEach((place) => {
    const row = document.createElement("div");
    row.className = "replacement-option-row";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "replacement-option";
    const distanceLabel = Number.isFinite(Number(place.distance_m)) ? `${formatKm(Number(place.distance_m))}` : "";
    const reviewLabel = Number.isFinite(Number(place.google_review_count))
      ? `리뷰 ${Number(place.google_review_count).toLocaleString("ko-KR")}개`
      : "리뷰 정보 없음";
    const naverRankLabel = Number.isFinite(Number(place.naver_popularity_rank))
      ? `네이버 리뷰순 ${Number(place.naver_popularity_rank)}위`
      : "";
    const detailLabel = [
      translatePlaceCategory(place.middleBizName || place.source_category || place.category),
      naverRankLabel,
      reviewLabel,
      distanceLabel,
      place.address || "",
    ].filter(Boolean).join(" · ");
    button.innerHTML = `<strong>${escapeHtml(place.name)}</strong><small>${escapeHtml(detailLabel)}</small>`;
    button.addEventListener("click", async (event) => {
      event.stopPropagation();
      await replaceCoursePlace(courseId, placeIndex, place);
    });
    const searchLink = document.createElement("a");
    searchLink.className = "replacement-naver-search-button";
    searchLink.href = buildNaverPlaceSearchUrl(place.name);
    searchLink.target = "_blank";
    searchLink.rel = "noopener noreferrer";
    searchLink.title = "네이버에서 검색";
    searchLink.setAttribute("aria-label", `${place.name} 네이버 검색`);
    searchLink.textContent = "검색";
    searchLink.addEventListener("click", (event) => event.stopPropagation());
    row.appendChild(button);
    row.appendChild(searchLink);
    container.appendChild(row);
  });
}

async function replaceCoursePlace(courseId, placeIndex, replacement) {
  const courseIndex = currentCourses.findIndex((item) => item.course_id === courseId);
  const course = currentCourses[courseIndex];
  const original = course?.places[placeIndex];
  if (!course || !original) return;
  const slotKey = `${courseId}:${placeIndex}`;
  const replacementHistory = replacementHistoryBySlot.get(slotKey) || new Set();
  replacementHistory.add(String(original.name || "").replaceAll(" ", "").toLowerCase());
  replacementHistory.add(String(replacement.name || "").replaceAll(" ", "").toLowerCase());
  replacementHistoryBySlot.set(slotKey, replacementHistory);

  course.places[placeIndex] = {
    ...original,
    id: replacement.id || replacement.name,
    name: replacement.name,
    lat: replacement.lat,
    lon: replacement.lon,
    source_category: replacement.middleBizName || original.source_category || "",
  };
  try {
    const updatedCourse = await requestJson("/api/courses/recalculate", {
      method: "POST",
      body: JSON.stringify({
        course_id: course.course_id,
        transport: course.transport,
        places: course.places,
      }),
    });
    currentCourses[courseIndex] = updatedCourse;
    selectedCourseId = null;
    renderCourses(currentCourses, lastRecommendationData || { candidate_counts: {} });
    resultSummary.textContent = `${original.name} → ${replacement.name} 변경 완료 · 변경된 추천 결과를 확인하세요.`;
    showRecommendationStep("results");
  } catch (error) {
    course.places[placeIndex] = original;
    resultSummary.textContent = `장소 변경 실패: ${error.message}`;
    showRecommendationStep("results");
  }
}

async function recalculateEditedCourse(courseIndex, previousPlaces, successMessage) {
  const course = currentCourses[courseIndex];
  try {
    currentCourses[courseIndex] = await requestJson("/api/courses/recalculate", {
      method: "POST",
      body: JSON.stringify({
        course_id: course.course_id,
        transport: course.transport,
        places: course.places,
      }),
    });
    selectedCourseId = null;
    renderCourses(currentCourses, lastRecommendationData || { candidate_counts: {} });
    resultSummary.textContent = successMessage;
    showRecommendationStep("results");
  } catch (error) {
    course.places = previousPlaces;
    resultSummary.textContent = `코스 수정 실패: ${readApiError(error.message)}`;
    renderCourses(currentCourses, lastRecommendationData || { candidate_counts: {} });
  }
}

async function deleteCoursePlace(courseId, placeIndex) {
  const courseIndex = currentCourses.findIndex((item) => item.course_id === courseId);
  const course = currentCourses[courseIndex];
  if (!course || placeIndex <= 0 || course.places[placeIndex]?.locked || course.places.length <= 2) return;
  const previousPlaces = [...course.places];
  const [removed] = course.places.splice(placeIndex, 1);
  await recalculateEditedCourse(courseIndex, previousPlaces, `${removed.name} 삭제 완료`);
}

async function reorderCoursePlace(courseId, sourceIndex, insertionIndex) {
  const courseIndex = currentCourses.findIndex((item) => item.course_id === courseId);
  const course = currentCourses[courseIndex];
  if (!course || sourceIndex <= 0 || course.places[sourceIndex]?.locked) return;
  const lockedLastIndex = course.places.at(-1)?.locked ? course.places.length - 1 : course.places.length;
  const boundedInsertionIndex = Math.max(1, Math.min(insertionIndex, lockedLastIndex));
  const targetIndex = boundedInsertionIndex > sourceIndex ? boundedInsertionIndex - 1 : boundedInsertionIndex;
  if (targetIndex === sourceIndex) return;
  const previousPlaces = [...course.places];
  const [moved] = course.places.splice(sourceIndex, 1);
  course.places.splice(targetIndex, 0, moved);
  await recalculateEditedCourse(courseIndex, previousPlaces, "일정 순서를 바꿨어요.");
}

async function reorderFlowCoursePlace(courseId, sourceIndex, insertionIndex) {
  const courseIndex = currentCourses.findIndex((item) => item.course_id === courseId);
  const course = currentCourses[courseIndex];
  if (!course || sourceIndex <= 0 || course.places[sourceIndex]?.locked) return;
  const lockedLastIndex = course.places.at(-1)?.locked ? course.places.length - 1 : course.places.length;
  const boundedInsertionIndex = Math.max(1, Math.min(insertionIndex, lockedLastIndex));
  const targetIndex = boundedInsertionIndex > sourceIndex ? boundedInsertionIndex - 1 : boundedInsertionIndex;
  if (targetIndex === sourceIndex) return;

  const previousPlaces = [...course.places];
  const [moved] = course.places.splice(sourceIndex, 1);
  course.places.splice(targetIndex, 0, moved);
  routeSummary.textContent = "\uc21c\uc11c\ub97c \ubcc0\uacbd\ud588\uc5b4\uc694. \uc2e4\uc81c \uacbd\ub85c\ub97c \ub2e4\uc2dc \uacc4\uc0b0\ud558\uace0 \uc788\uc2b5\ub2c8\ub2e4.";

  try {
    currentCourses[courseIndex] = await requestJson("/api/courses/recalculate", {
      method: "POST",
      body: JSON.stringify({
        course_id: course.course_id,
        transport: course.transport,
        places: course.places,
      }),
    });
    selectedCourseId = courseId;
    await selectCourse(courseId);
  } catch (error) {
    course.places = previousPlaces;
    routeSummary.textContent = `\uc21c\uc11c \ubcc0\uacbd \uc2e4\ud328: ${readApiError(error.message)}`;
    await selectCourse(courseId);
  }
}
function openCourseAddEditor(courseId, card) {
  const editor = card.querySelector("[data-add-place-editor]");
  if (!editor) return;
  editor.hidden = false;
  editor.innerHTML = `
    <strong>새 일정 추가</strong>
    <div class="search-row">
      <select data-add-place-category>
        <option>음식점</option><option>카페</option><option>야외 액티비티</option>
        <option>실내 액티비티</option><option>문화/전시</option><option>마무리/산책</option><option>술집</option>
      </select>
      <input type="text" data-add-place-keyword placeholder="장소명 검색" autocomplete="off" />
      <button type="button" data-search-add-place>검색</button>
    </div>
    <div class="replacement-results" data-add-place-results></div>
  `;
  editor.addEventListener("click", (event) => event.stopPropagation());
  editor.querySelector("[data-search-add-place]").addEventListener("click", async () => {
    const keyword = editor.querySelector("[data-add-place-keyword]").value.trim();
    const category = editor.querySelector("[data-add-place-category]").value;
    const results = editor.querySelector("[data-add-place-results]");
    if (!keyword) return;
    results.innerHTML = "<small>검색 중...</small>";
    try {
      const data = await requestJson(`/api/places/search?keyword=${encodeURIComponent(keyword)}&count=5`);
      results.innerHTML = "";
      (data.places || []).forEach((place) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "replacement-option";
        button.innerHTML = `<span><strong>${escapeHtml(place.name)}</strong><small>${escapeHtml(translatePlaceCategory(place.middleBizName || place.category))}</small></span><b class="add-place-action-label">추가</b>`;
        button.addEventListener("click", async () => {
          await appendCoursePlace(courseId, { ...place, category, replaceable: true, locked: false });
        });
        results.appendChild(button);
      });
    } catch (error) {
      results.innerHTML = `<small>검색 실패: ${escapeHtml(readApiError(error.message))}</small>`;
    }
  });
}

async function appendCoursePlace(courseId, place) {
  const courseIndex = currentCourses.findIndex((item) => item.course_id === courseId);
  const course = currentCourses[courseIndex];
  if (!course) return;
  const previousPlaces = [...course.places];
  const lockedLast = course.places.at(-1)?.locked;
  course.places.splice(lockedLast ? course.places.length - 1 : course.places.length, 0, place);
  await recalculateEditedCourse(courseIndex, previousPlaces, `${place.name} 일정을 추가했어요.`);
}

function loadSavedCourses() {
  try {
    return JSON.parse(localStorage.getItem(SAVED_COURSES_KEY) || "[]");
  } catch (_error) {
    return [];
  }
}

function saveCourse(course) {
  const saved = { ...course, course_id: course.course_id || `saved_${Date.now()}`, saved_at: new Date().toISOString() };
  savedCourses = [saved, ...savedCourses.filter((item) => item.course_id !== course.course_id)].slice(0, 30);
  localStorage.setItem(SAVED_COURSES_KEY, JSON.stringify(savedCourses));
  renderSavedCourses();
  showPortalView("myCourses");
}

function saveSelectedFlowCourse() {
  const course = currentCourses.find((item) => item.course_id === selectedCourseId);
  if (!course) {
    routeSummary.textContent = "저장할 코스를 먼저 선택해 주세요.";
    return;
  }
  saveCourse(course);
}

function renderSavedCourses() {
  if (!savedCourseList) return;
  savedCourseFloatingCount.textContent = String(savedCourses.length);
  if (!savedCourses.length) {
    savedCourseList.innerHTML = '<p class="browse-loading">저장한 코스가 아직 없습니다.</p>';
    return;
  }
  savedCourseList.innerHTML = savedCourses.map((course, index) => `
    <article class="saved-course-card" role="button" tabindex="0" data-open-saved-course="${index}">
      <div class="saved-course-photo-strip">
        ${course.places.slice(0, 3).map((place, idx) => `<div class="saved-photo-slot slot-${idx + 1}"><span>${escapeHtml(place.name)}</span></div>`).join("")}
      </div>
      <div class="saved-course-body">
        <div class="saved-course-header">
          <div>
            <p class="home-kicker">My RecoDate Course</p>
            <h3>${escapeHtml(course.title)}</h3>
          </div>
          <span class="saved-view-detail-btn">상세 보기 ➔</span>
        </div>
        <div class="saved-course-meta">
          <span class="meta-badge">🚗 ${formatKm(course.route.total_distance_m)}</span>
          <span class="meta-badge">💰 1인 약 ${formatWon(course.estimated_budget_won)}</span>
          <span class="meta-badge">📍 장소 ${course.places.length}곳</span>
        </div>
        <div class="saved-places-stepper">
          ${course.places.map((place, pIdx) => `
            <div class="stepper-chip">
              <span class="stepper-num">${pIdx + 1}</span>
              <span class="stepper-name">${escapeHtml(place.name)}</span>
            </div>
            ${pIdx < course.places.length - 1 ? '<span class="stepper-arrow">➔</span>' : ''}
          `).join("")}
        </div>
        <div class="saved-course-actions">
          <button class="secondary-button compact-button" type="button" data-share-saved-course="${index}">📤 공유</button>
          <button class="secondary-button compact-button" type="button" data-friend-share-saved="${index}">👥 친구 공유</button>
          <button class="secondary-button compact-button" type="button" data-community-share-saved="${index}">🌐 커뮤니티</button>
          <button class="saved-delete-button" type="button" data-delete-saved-course="${index}" title="삭제">🗑️ 삭제</button>
        </div>
      </div>
    </article>
  `).join("");
  savedCourseList.querySelectorAll("[data-open-saved-course]").forEach((card) => {
    card.addEventListener("click", () => openSavedCourse(Number(card.dataset.openSavedCourse)));
    card.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      openSavedCourse(Number(card.dataset.openSavedCourse));
    });
  });
  savedCourseList.querySelectorAll("[data-share-saved-course]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      shareCourse(savedCourses[Number(button.dataset.shareSavedCourse)]);
    });
  });
  savedCourseList.querySelectorAll("[data-friend-share-saved]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      openFriendCourseShareModal(savedCourses[Number(button.dataset.friendShareSaved)]);
    });
  });
  savedCourseList.querySelectorAll("[data-community-share-saved]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      openCommunityShareModal(savedCourses[Number(button.dataset.communityShareSaved)]);
    });
  });
  savedCourseList.querySelectorAll("[data-delete-saved-course]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      savedCourses.splice(Number(button.dataset.deleteSavedCourse), 1);
      localStorage.setItem(SAVED_COURSES_KEY, JSON.stringify(savedCourses));
      renderSavedCourses();
    });
  });
}

function openSavedCourse(index) {
  const course = savedCourses[index];
  if (!course) return;
  currentCourses = [course];
  visibleCourseIndex = 0;
  replacementHistoryBySlot.clear();
  lastRecommendationData = { candidate_counts: { route_api_calls: 0 }, saved_course: true };
  selectedCourseId = null;
  showPortalView("recommendation");
  renderCourses(currentCourses, lastRecommendationData);
  resultSummary.textContent = "저장한 코스를 다시 열었어요. 코스를 누르면 지도와 길찾기를 볼 수 있습니다.";
  showRecommendationStep("results");
}

async function shareCourse(course) {
  const text = `[RecoDate] ${course.title}\n${course.places.map((place, index) => `${index + 1}. ${place.name}`).join("\n")}`;
  if (navigator.share) {
    await navigator.share({ title: `RecoDate - ${course.title}`, text });
    return;
  }
  await navigator.clipboard.writeText(text);
  resultSummary.textContent = "공유할 코스를 클립보드에 복사했어요.";
}

async function selectCourse(courseId) {
  const course = currentCourses.find((item) => item.course_id === courseId);
  if (!course) return;

  selectedCourseId = courseId;
  showRecommendationStep("flow");
  document.querySelectorAll(".course-card").forEach((card) => {
    card.classList.toggle("selected", card.dataset.courseId === courseId);
  });

  renderMapForPlaces(course.places);
  routeSummary.textContent = "선택한 코스의 실제 경로를 계산 중입니다.";

  try {
    const route = await requestJson("/api/routes/selected-course", {
      method: "POST",
      body: JSON.stringify({
        transport: course.transport,
        places: course.places.map((place) => ({
          id: place.id,
          name: place.name,
          lat: place.lat,
          lon: place.lon,
        })),
      }),
    });

    const fallbackMessage = route.transit_fallback_used ? " · 대중교통 예상값 포함" : "";
    const modeMessage = summarizeRouteModes(route.legs || []);
    routeSummary.textContent = `실제 경로 ${formatKm(route.total_distance_m)}${modeMessage}${fallbackMessage}`;
    renderTmapInteractiveMap(course.places, route.path || [], course.transport, route.legs || [], route).catch(() => {
      renderTmapStaticMap(course.places, course.transport, route.legs || [], route);
    });
  } catch (error) {
    routeSummary.textContent = `실제 경로 계산 실패: ${error.message}`;
  }
}

function renderRouteDetailSheet(content) {
  return `
    <div class="route-detail-scroll" data-route-detail-sheet>
      <button class="route-detail-grip" type="button" data-route-detail-grip aria-expanded="false" aria-label="코스 상세 내용 열기">
        <span aria-hidden="true"></span>
        <b>상세 코스 보기</b>
      </button>
      <div class="route-detail-content">
        ${content}
      </div>
    </div>
  `;
}

function bindRouteDetailSheet() {
  const sheet = document.querySelector("#map [data-route-detail-sheet]");
  const grip = sheet?.querySelector("[data-route-detail-grip]");
  if (!sheet || !grip) return;

  let dragState = null;
  let suppressNextClick = false;
  const getCollapsedHeight = () => (window.matchMedia("(max-width: 760px)").matches ? 220 : 238);
  const getExpandedHeight = () => Math.max(getCollapsedHeight() + 120, window.innerHeight - (window.matchMedia("(max-width: 760px)").matches ? 86 : 116));
  const setSheetHeight = (height) => {
    const minHeight = getCollapsedHeight();
    const maxHeight = getExpandedHeight();
    const nextHeight = Math.min(maxHeight, Math.max(minHeight, height));
    sheet.style.setProperty("--route-detail-height", `${Math.round(nextHeight)}px`);
    return nextHeight;
  };
  const setExpanded = (expanded) => {
    sheet.classList.toggle("expanded", expanded);
    sheet.classList.toggle("sheet-overlay", expanded);
    grip.setAttribute("aria-expanded", String(expanded));
    setSheetHeight(expanded ? getExpandedHeight() : getCollapsedHeight());
  };

  grip.addEventListener("click", () => {
    if (suppressNextClick) {
      suppressNextClick = false;
      return;
    }
    setExpanded(!sheet.classList.contains("expanded"));
  });
  grip.addEventListener("pointerdown", (event) => {
    dragState = {
      startY: event.clientY,
      startHeight: sheet.getBoundingClientRect().height,
      moved: false,
    };
    sheet.classList.add("dragging", "sheet-overlay");
    setSheetHeight(dragState.startHeight);
    grip.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  });
  grip.addEventListener("pointermove", (event) => {
    if (!dragState) return;
    const deltaY = dragState.startY - event.clientY;
    if (Math.abs(deltaY) > 4) dragState.moved = true;
    const nextHeight = setSheetHeight(dragState.startHeight + deltaY);
    const shouldExpand = nextHeight > getCollapsedHeight() + (getExpandedHeight() - getCollapsedHeight()) * 0.35;
    sheet.classList.toggle("expanded", shouldExpand);
    grip.setAttribute("aria-expanded", String(shouldExpand));
    event.preventDefault();
  });
  grip.addEventListener("pointerup", (event) => {
    if (!dragState) return;
    const deltaY = dragState.startY - event.clientY;
    const shouldExpand = deltaY > 24 || (dragState.moved && sheet.getBoundingClientRect().height > getCollapsedHeight() + 80);
    if (dragState.moved) {
      setExpanded(shouldExpand);
      suppressNextClick = true;
    } else if (!sheet.classList.contains("expanded")) {
      sheet.classList.remove("sheet-overlay");
    }
    dragState = null;
    sheet.classList.remove("dragging");
    grip.releasePointerCapture?.(event.pointerId);
  });
  grip.addEventListener("pointercancel", () => {
    dragState = null;
    sheet.classList.remove("dragging");
    setExpanded(sheet.classList.contains("expanded"));
  });
}

function renderMapForPlaces(places) {
  const safePlaces = places.filter((place) => Number.isFinite(place.lat) && Number.isFinite(place.lon));
  if (!safePlaces.length) {
    document.getElementById("map").innerHTML = `<div class="course-flow-empty">표시할 장소가 없습니다.</div>`;
    return;
  }

  const points = normalizePlacesToFlowPoints(safePlaces);
  const linePoints = points.map((point) => `${point.x},${point.y}`).join(" ");
  const dashed = selectedCourseId ? "" : 'stroke-dasharray="8 8"';
  const stepCards = safePlaces.map(renderFlowStepCard).join("");

  document.getElementById("map").innerHTML = `
    <div class="course-flow-board">
      <div class="route-map-sticky">
        <svg class="course-flow-map" viewBox="0 0 1000 360" role="img" aria-label="추천 코스 흐름도">
        <defs>
          <linearGradient id="flowLine" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stop-color="#ef476f" />
            <stop offset="100%" stop-color="#2563eb" />
          </linearGradient>
        </defs>
        <rect width="1000" height="360" rx="28" class="flow-stage" />
        <path d="M86 278 C220 112 336 112 468 214 C620 332 744 244 914 82" class="flow-shadow" />
        ${points.length >= 2 ? `<polyline points="${linePoints}" class="flow-route" ${dashed} />` : ""}
        ${points.map(renderFlowPoint).join("")}
        </svg>
      </div>
      ${renderRouteDetailSheet(`
        <div class="course-flow-kicker">COURSE FLOW</div>
        <div class="course-flow-steps">${stepCards}</div>
      `)}
    </div>
  `;
  enrichFlowStepPhotos(safePlaces);
  bindRouteDetailSheet();
  bindFlowPlaceDragAndDrop();
}

function normalizePlacesToFlowPoints(places) {
  return places.map((place, index) => ({
    ...place,
    index,
    x: places.length === 1 ? 500 : 90 + (index / (places.length - 1)) * 820,
    y: index % 2 === 0 ? 235 : 115,
  }));
}

function renderFlowPoint(point) {
  const labelY = point.y < 150 ? point.y - 42 : point.y + 62;
  return `
    <g class="flow-point">
      <circle cx="${point.x}" cy="${point.y}" r="28" />
      <text x="${point.x}" y="${point.y + 8}" class="flow-point-number">${point.index + 1}</text>
      <text x="${point.x}" y="${labelY}" class="flow-point-label">${escapeSvg(shortenText(point.name, 12))}</text>
    </g>
  `;
}

function renderFlowStepCard(place, index) {
  const canEdit = index > 0 && !place.locked;
  const bookmarked = isBookmarked(place);
  return `
    <article class="flow-step-card ${canEdit ? "draggable-flow-place" : "locked-flow-place"}" data-flow-place-index="${index}">
      <span class="flow-step-number">${index + 1}</span>
      <span class="flow-step-photo" data-flow-photo-index="${index}"></span>
      <div class="flow-step-copy">
        <strong>${escapeHtml(place.name)}</strong>
        <small>${escapeHtml(place.category || "Place")}</small>
        <span class="flow-step-badges">
          ${renderNaverReviewRankBadge(place)}
          ${place.google_review_count ? `<a class="google-review-badge" href="${escapeHtml(place.google_maps_uri || "#")}" target="_blank" rel="noopener noreferrer" data-google-maps-link>리뷰 ${Number(place.google_review_count).toLocaleString("ko-KR")}개</a>` : ""}
          <span data-flow-opening-status>${renderPlaceOpeningStatus(place, { showUnknown: true })}</span>
        </span>
      </div>
      <div class="flow-step-actions">
        <button class="flow-action-button flow-info-button" type="button" data-flow-place-info="${index}">정보</button>
        <button class="flow-action-button flow-bookmark-button icon-bookmark-button${bookmarked ? " selected" : ""}" type="button" data-flow-place-bookmark="${index}" aria-pressed="${bookmarked}" aria-label="${bookmarked ? `${escapeHtml(place.name)} 찜 취소` : `${escapeHtml(place.name)} 찜하기`}" title="${bookmarked ? "찜 취소" : "찜하기"}">${bookmarked ? "♥" : "♡"}</button>
        <a class="flow-naver-button" href="${buildNaverPlaceSearchUrl(place.name)}" target="_blank" rel="noopener noreferrer" data-flow-naver-search aria-label="${escapeHtml(`${place.name} 네이버 검색`)}" title="네이버에서 검색">네이버</a>
      </div>
    </article>
  `;
}
async function enrichFlowStepPhotos(places) {
  const queue = places.map((place, index) => ({ place, index }));
  const workers = Array.from({ length: Math.min(4, queue.length) }, async () => {
    while (queue.length) {
      const item = queue.shift();
      const slot = document.querySelector(`[data-flow-photo-index="${item.index}"]`);
      if (!slot) continue;
      try {
        await getPlacePhotoMetadata(item.place);
        if (!slot.isConnected) continue;
        const card = slot.closest("[data-flow-place-index]");
        const statusBox = card?.querySelector("[data-flow-opening-status]");
        if (statusBox) statusBox.innerHTML = renderPlaceOpeningStatus(item.place, { showUnknown: true });
        const photo = await resolvePlacePhoto(item.place, { width: 180, height: 180 });
        if (!photo?.url || !slot.isConnected) continue;
        const image = document.createElement("img");
        image.src = photo.url;
        image.alt = `${item.place.name} place photo`;
        image.loading = "lazy";
        if (photo.fallbackUrl) {
          image.addEventListener("error", () => {
            if (image.dataset.fallbackApplied === "true") return;
            image.dataset.fallbackApplied = "true";
            image.src = photo.fallbackUrl;
          }, { once: true });
        }
        slot.prepend(image);
      } catch (_error) {
        // Keep numbered placeholder when a flow place has no photo.
      }
    }
  });
  await Promise.all(workers);
}
function bindFlowPlaceDragAndDrop() {
  const course = currentCourses.find((item) => item.course_id === selectedCourseId);
  const chain = document.querySelector("#map .course-flow-steps");
  if (!course || !chain) return;

  chain.querySelectorAll("[data-flow-naver-search]").forEach((link) => {
    link.addEventListener("click", (event) => event.stopPropagation());
  });
  chain.querySelectorAll("[data-flow-place-info]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const place = course.places[Number(button.dataset.flowPlaceInfo)];
      recordRecentPlace(place);
      openBrowsePlaceDetail(place, { allowRecommendation: false });
    });
  });
  chain.querySelectorAll("[data-flow-place-bookmark]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const place = course.places[Number(button.dataset.flowPlaceBookmark)];
      toggleBookmark(place);
      const bookmarked = isBookmarked(place);
      button.classList.toggle("selected", bookmarked);
      button.setAttribute("aria-pressed", String(bookmarked));
      button.setAttribute("aria-label", bookmarked ? `${place.name} 찜 취소` : `${place.name} 찜하기`);
      button.title = bookmarked ? "찜 취소" : "찜하기";
      button.textContent = bookmarked ? "♥" : "♡";
    });
  });

  let draggedIndex = null;
  let insertionIndex = null;
  let pointerActive = false;
  let longPressTimer = null;
  let pointerStartX = 0;
  let pointerStartY = 0;
  const isMobileDrag = window.matchMedia("(max-width: 760px)").matches;
  // 코스 카드와 동일한 길게 누르기 방식: 0.6초 누르면 들리고, 그 전에 움직이면 스크롤로 처리한다.
  const mobileHoldMs = 600;
  const mobileMoveTolerancePx = 14;

  function clearDragState() {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
    chain.querySelectorAll(".dragging, .drop-before, .drop-after").forEach((item) => {
      item.classList.remove("dragging", "drop-before", "drop-after");
    });
    draggedIndex = null;
    insertionIndex = null;
    pointerActive = false;
    setPlaceReorderScrollLock(false);
  }

  function activateDrag(item, pointerId) {
    if (draggedIndex === null) return;
    pointerActive = true;
    item.classList.add("dragging");
    if (isMobileDrag) {
      setPlaceReorderScrollLock(true);
      navigator.vibrate?.(30);
    }
    item.setPointerCapture?.(pointerId);
  }

  chain.querySelectorAll("[data-flow-place-index]").forEach((item) => {
    const placeIndex = Number(item.dataset.flowPlaceIndex);
    if (!item.classList.contains("draggable-flow-place")) return;

    item.addEventListener("pointerdown", (event) => {
      if (event.target.closest("button, a")) return;
      draggedIndex = placeIndex;
      insertionIndex = placeIndex;
      pointerActive = false;
      pointerStartX = event.clientX;
      pointerStartY = event.clientY;
      if (isMobileDrag) {
        longPressTimer = window.setTimeout(() => {
          activateDrag(item, event.pointerId);
          markFlowDropPosition(chain, event.clientX, event.clientY, (nextIndex) => {
            insertionIndex = nextIndex;
          });
        }, mobileHoldMs);
      } else {
        item.setPointerCapture?.(event.pointerId);
      }
    });

    item.addEventListener("pointermove", (event) => {
      if (draggedIndex !== placeIndex) return;
      if (isMobileDrag && !pointerActive) {
        if (
          Math.abs(event.clientX - pointerStartX) > mobileMoveTolerancePx ||
          Math.abs(event.clientY - pointerStartY) > mobileMoveTolerancePx
        ) {
          clearDragState();
        }
        return;
      }
      if (!pointerActive && Math.abs(event.clientY - pointerStartY) < 5) return;
      if (!pointerActive) activateDrag(item, event.pointerId);
      event.preventDefault();
      markFlowDropPosition(chain, event.clientX, event.clientY, (nextIndex) => {
        insertionIndex = nextIndex;
      });
    });

    // 들린 상태에선 터치 스크롤 차단, 대기 중 이동/터치 종료 시 타이머 취소(스쳤는데 들림 방지).
    item.addEventListener(
      "touchmove",
      (event) => {
        if (draggedIndex !== placeIndex) return;
        if (pointerActive) {
          event.preventDefault();
          return;
        }
        const touch = event.touches[0];
        if (
          touch &&
          (Math.abs(touch.clientX - pointerStartX) > mobileMoveTolerancePx ||
            Math.abs(touch.clientY - pointerStartY) > mobileMoveTolerancePx)
        ) {
          clearDragState();
        }
      },
      { passive: false },
    );

    item.addEventListener("touchend", () => {
      if (draggedIndex === placeIndex && !pointerActive) clearDragState();
    });

    item.addEventListener("pointerup", async (event) => {
      if (draggedIndex !== placeIndex) return;
      item.releasePointerCapture?.(event.pointerId);
      const sourceIndex = draggedIndex;
      const destinationIndex = insertionIndex;
      const shouldReorder = pointerActive && destinationIndex !== null;
      clearDragState();
      if (shouldReorder) await reorderFlowCoursePlace(course.course_id, sourceIndex, destinationIndex);
    });

    item.addEventListener("pointercancel", () => {
      if (draggedIndex === placeIndex) clearDragState();
    });
  });
}

function markFlowDropPosition(chain, clientX, clientY, setInsertionIndex) {
  const target = document.elementFromPoint(clientX, clientY)?.closest("[data-flow-place-index]");
  if (!target || !chain.contains(target)) return;
  const targetIndex = Number(target.dataset.flowPlaceIndex);
  const rect = target.getBoundingClientRect();
  const after = clientY > rect.top + rect.height / 2;
  setInsertionIndex(targetIndex + (after ? 1 : 0));
  chain.querySelectorAll(".drop-before, .drop-after").forEach((place) => {
    place.classList.remove("drop-before", "drop-after");
  });
  target.classList.add(after ? "drop-after" : "drop-before");
}
async function renderTmapInteractiveMap(places, routePath = [], transport = "car", routeLegs = [], route = {}) {
  if (window.Capacitor || window.location.protocol === "capacitor:") {
    throw new Error("모바일 앱에서는 정적 TMAP 경로를 우선 사용합니다.");
  }
  const safePlaces = places.filter((place) => Number.isFinite(place.lat) && Number.isFinite(place.lon));
  if (!safePlaces.length) return;

  const center = getCenterPoint(safePlaces);
  document.getElementById("map").innerHTML = `
    <div class="tmap-sdk-board">
      <div class="route-map-sticky">
        <div id="tmapSdkMap" class="tmap-sdk-map"></div>
      </div>
      ${renderRouteDetailSheet(`
        ${renderRouteSummaryStats(route, safePlaces)}
        ${renderExternalNavigationActions(safePlaces, transport)}
        ${renderTaxiSummary(route)}
        ${renderTransitGuidance(routeLegs)}
        <div class="course-flow-steps">${safePlaces.map(renderFlowStepCard).join("")}</div>
      `)}
    </div>
  `;
  enrichFlowStepPhotos(safePlaces);
  bindRouteDetailSheet();
  bindFlowPlaceDragAndDrop();

  await loadTmapSdk();
  clearTmapLayers();

  tmapMap = new Tmapv2.Map("tmapSdkMap", {
    center: new Tmapv2.LatLng(center.lat, center.lon),
    width: "100%",
    height: "100%",
    zoom: 15,
    zoomControl: true,
    scrollwheel: true,
  });

  const routeLinePath = buildTmapPath(routePath, safePlaces);
  const placePath = safePlaces.map((place) => new Tmapv2.LatLng(place.lat, place.lon));
  tmapMarkers = safePlaces.map((place, index) => createTmapMarker(place, index));

  if (routeLinePath.length >= 2) {
    tmapPolyline = new Tmapv2.Polyline({
      path: routeLinePath,
      strokeColor: "#ef476f",
      strokeWeight: 6,
      map: tmapMap,
    });
  }

  fitTmapBounds(placePath, center);
}

function buildTmapPath(routePath, places) {
  const source = Array.isArray(routePath) && routePath.length >= 2 ? routePath : places;
  return source
    .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lon))
    .map((point) => new Tmapv2.LatLng(point.lat, point.lon));
}

function loadTmapSdk() {
  if (window.Tmapv2) return Promise.resolve();
  if (tmapSdkPromise) return tmapSdkPromise;

  tmapSdkPromise = requestJson("/api/config/tmap-sdk").then((config) => {
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = `https://apis.openapi.sk.com/tmap/jsv2?version=1&appKey=${encodeURIComponent(config.appKey)}`;
      script.async = true;
      script.onload = () => {
        if (window.Tmapv2?.Map) {
          resolve();
          return;
        }
        loadTmapCoreScript().then(resolve).catch(reject);
      };
      script.onerror = () => reject(new Error("TMAP SDK 스크립트 로드에 실패했습니다."));
      document.head.appendChild(script);
    });
  });

  return tmapSdkPromise;
}

function loadLeafletSdk() {
  if (window.L?.map) return Promise.resolve();
  if (leafletSdkPromise) return leafletSdkPromise;

  leafletSdkPromise = new Promise((resolve, reject) => {
    if (!document.querySelector('link[data-leaflet-map-explore="true"]')) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      link.dataset.leafletMapExplore = "true";
      document.head.appendChild(link);
    }
    const script = document.createElement("script");
    script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    script.async = true;
    script.onload = () => {
      if (window.L?.map) {
        resolve();
      } else {
        reject(new Error("Leaflet 지도 SDK를 찾지 못했습니다."));
      }
    };
    script.onerror = () => reject(new Error("Leaflet 지도 SDK 로드에 실패했습니다."));
    document.head.appendChild(script);
  });

  return leafletSdkPromise;
}

function loadTmapCoreScript() {
  if (window.Tmapv2?.Map) return Promise.resolve();
  const scriptLocation = window.Tmapv2?._getScriptLocation?.();
  if (!scriptLocation) {
    return Promise.reject(new Error("TMAP SDK 실제 스크립트 위치를 찾지 못했습니다."));
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `${scriptLocation}tmapjs2.min.js?version=20231206`;
    script.async = true;
    script.onload = () => {
      if (window.Tmapv2?.Map) {
        resolve();
      } else {
        reject(new Error("TMAP SDK 실제 스크립트 로드 후 Map 객체를 찾지 못했습니다."));
      }
    };
    script.onerror = () => reject(new Error("TMAP SDK 실제 스크립트 로드에 실패했습니다."));
    document.head.appendChild(script);
  });
}

function clearTmapLayers() {
  tmapMarkers.forEach((marker) => {
    if (marker?.setMap) marker.setMap(null);
  });
  if (tmapPolyline?.setMap) {
    tmapPolyline.setMap(null);
  }
  if (tmapMap?.destroy) {
    tmapMap.destroy();
  }
  tmapMarkers = [];
  tmapPolyline = null;
  tmapMap = null;
}

function createTmapMarker(place, index) {
  const markerOptions = {
    position: new Tmapv2.LatLng(place.lat, place.lon),
    map: tmapMap,
    title: `${index + 1}. ${place.name}`,
    iconHTML: `<div class="tmap-marker-number">${index + 1}</div>`,
  };

  if (Tmapv2.Size) {
    markerOptions.iconSize = new Tmapv2.Size(34, 34);
  }

  const marker = new Tmapv2.Marker(markerOptions);

  if (marker.setIconHTML) {
    marker.setIconHTML(`<div class="tmap-marker-number">${index + 1}</div>`);
  }

  return marker;
}

function fitTmapBounds(path, center) {
  const zoom = path.length >= 4 ? 13 : 15;
  tmapMap.setCenter(new Tmapv2.LatLng(center.lat, center.lon));
  tmapMap.setZoom(zoom);
}

function renderTmapStaticMap(places, transport = "car", routeLegs = [], route = {}) {
  const safePlaces = places.filter((place) => Number.isFinite(place.lat) && Number.isFinite(place.lon));
  if (!safePlaces.length) return;

  const center = getCenterPoint(safePlaces);
  const routeOverlaySource = Array.isArray(route.path) && route.path.length >= 2
    ? route.path.filter((point) => Number.isFinite(Number(point.lat)) && Number.isFinite(Number(point.lon)))
    : safePlaces;
  const overlayBounds = [...safePlaces, ...routeOverlaySource];
  const points = normalizeCoordinatesToOverlayPoints(safePlaces, overlayBounds);
  const routePoints = normalizeCoordinatesToOverlayPoints(routeOverlaySource, overlayBounds);
  const imageUrl = `${API_BASE_URL}/api/maps/static?lat=${center.lat}&lon=${center.lon}&zoom=15`;

  document.getElementById("map").innerHTML = `
    <div class="tmap-static-board">
      <div class="route-map-sticky">
        <div class="tmap-static-frame">
          <img src="${imageUrl}" alt="선택한 코스 주변 TMAP 지도 이미지" data-tmap-static-image />
          <svg class="tmap-static-overlay" viewBox="0 0 1000 1000" aria-label="선택한 코스 장소 표시">
            ${routePoints.length >= 2 ? `<polyline points="${routePoints.map((point) => `${point.x},${point.y}`).join(" ")}" class="tmap-static-route" />` : ""}
            ${points.map(renderStaticMapPoint).join("")}
          </svg>
        </div>
      </div>
      ${renderRouteDetailSheet(`
        ${renderRouteSummaryStats(route, safePlaces)}
        ${renderExternalNavigationActions(safePlaces, transport)}
        ${renderTaxiSummary(route)}
        ${renderTransitGuidance(routeLegs)}
        <div class="course-flow-steps">${safePlaces.map(renderFlowStepCard).join("")}</div>
      `)}
    </div>
  `;
  armStaticTmapImageFallback(document.querySelector("#map [data-tmap-static-image]"));
  enrichFlowStepPhotos(safePlaces);
  bindRouteDetailSheet();
  bindFlowPlaceDragAndDrop();
}

function armStaticTmapImageFallback(image) {
  if (!image) return;
  const showFallback = () => {
    image.hidden = true;
    image.closest(".tmap-static-frame")?.classList.add("tmap-static-frame-fallback");
  };
  image.addEventListener("error", showFallback, { once: true });
  window.setTimeout(() => {
    if (!image.complete || image.naturalWidth === 0) showFallback();
  }, 1400);
}

function formatDurationLabel(totalSec) {
  const min = Math.max(0, Math.round((Number(totalSec) || 0) / 60));
  if (min >= 60) {
    const hours = Math.floor(min / 60);
    const mins = min % 60;
    return mins ? `약 ${hours}시간 ${mins}분` : `약 ${hours}시간`;
  }
  return `약 ${min}분`;
}

function formatMinutesShort(totalMin) {
  const min = Math.max(0, Math.round(Number(totalMin) || 0));
  if (min >= 60) {
    const hours = Math.floor(min / 60);
    const mins = min % 60;
    if (mins === 0) return `${hours}시간`;
    if (mins === 30) return `${hours}.5시간`; // 모바일 요약 카드에서 줄바꿈 없이 보이도록 컴팩트 표기
    return `${hours}시간 ${mins}분`;
  }
  return `${min}분`;
}

// 데이트 전체 예상 소요 시간(분 범위)을 슬롯별 체류 시간 기준으로 계산한다.
// 사용자 합의: 오전 활동 1.5~2h, 점심/저녁 1h, 카페 0.5~1h, 오후 활동1 1~1.5h,
// 오후 활동2 1~2h, 마무리 1h — 각 슬롯 시간에 이동 시간이 포함된 것으로 본다.
function estimateCourseDurationRange(places, route) {
  const isActivity = (place) =>
    String(place.category || "").includes("액티비티") || place.category === "문화/전시";
  const stops = (places || []).filter(
    (place) => place.category !== "시작" && place.category !== "숙소",
  );
  if (!stops.length) return null;
  const firstFoodIndex = stops.findIndex((place) => place.category === "음식점");
  let afternoonActivityOrder = 0;
  let minMinutes = 0;
  let maxMinutes = 0;
  stops.forEach((place, index) => {
    let slotMin = 0;
    let slotMax = 0;
    if (place.category === "음식점") {
      slotMin = 60;
      slotMax = 60;
    } else if (place.category === "카페") {
      slotMin = 30;
      slotMax = 60;
    } else if (isActivity(place)) {
      if (firstFoodIndex >= 0 && index < firstFoodIndex) {
        slotMin = 90; // 점심 전 = 오전 활동
        slotMax = 120;
      } else if (afternoonActivityOrder === 0) {
        slotMin = 60; // 오후 활동 1
        slotMax = 90;
        afternoonActivityOrder += 1;
      } else {
        slotMin = 60; // 오후 활동 2 이후
        slotMax = 120;
        afternoonActivityOrder += 1;
      }
    } else if (String(place.category || "").includes("마무리")) {
      slotMin = 60;
      slotMax = 60;
    } else if (place.category === "술집") {
      slotMin = 60;
      slotMax = 90;
    } else {
      slotMin = 30;
      slotMax = 60;
    }
    minMinutes += slotMin;
    maxMinutes += slotMax;
  });
  // 순 이동 시간이 비정상적으로 긴 코스(자차 장거리 등)는 하한을 이동 시간 이상으로 보정한다.
  const travelMinutes = Math.round((Number(route?.total_time_sec) || 0) / 60);
  if (travelMinutes > minMinutes) {
    minMinutes = travelMinutes;
    maxMinutes = Math.max(maxMinutes, travelMinutes + 60);
  }
  return { minMinutes, maxMinutes };
}

// 코스 흐름 상단 요약(총 거리/예상 시간/예상 교통비) — A안 시안의 메트릭 카드
function renderRouteSummaryStats(route, places = []) {
  if (!route || !Number.isFinite(Number(route.total_distance_m))) return "";
  const fare = Number(route.transportation_budget_won) > 0 ? `${Number(route.transportation_budget_won).toLocaleString("ko-KR")}원` : "0원";
  const duration = estimateCourseDurationRange(places, route);
  const durationLabel = duration
    ? `약 ${formatMinutesShort(duration.minMinutes)}~${formatMinutesShort(duration.maxMinutes)}`
    : formatDurationLabel(route.total_time_sec);
  const durationHint = duration ? "예상 시간 · 이동 포함" : "예상 시간 · 이동";
  return `
    <div class="route-summary-stats">
      <div class="rss-item"><small>총 거리</small><b>${formatKm(route.total_distance_m)}</b></div>
      <div class="rss-item"><small>${durationHint}</small><b>${durationLabel}</b></div>
      <div class="rss-item"><small>예상 교통비</small><b>${fare}</b></div>
    </div>
  `;
}

function renderExternalNavigationActions(places, transport) {
  const naverDirectionsUrl = buildNaverDirectionsUrl(places, transport);
  if (!naverDirectionsUrl) return "";
  const isTransit = transport === "transit";

  return `
    <div class="external-navigation-actions">
      <div>
        <strong>선택한 코스 길안내</strong>
        <span>${isTransit ? "전체 코스를 먼저 확인하고, 필요한 경우 아래 구간별 길찾기를 이용하세요." : "실제 이동은 네이버 지도에서 바로 확인할 수 있습니다."}</span>
      </div>
      <a class="naver-directions-button" href="${naverDirectionsUrl}" target="_blank" rel="noopener noreferrer">
        전체 코스 길안내
      </a>
      ${isTransit ? renderTransitNaverLinks(places) : ""}
    </div>
  `;
}

function renderTransitNaverLinks(places) {
  const links = places.slice(0, -1).map((place, index) => {
    const nextPlace = places[index + 1];
    const url = buildNaverDirectionsUrl([place, nextPlace], "transit");
    return `<a class="transit-naver-link" href="${url}" target="_blank" rel="noopener noreferrer">${index + 1}. ${escapeHtml(place.name)} → ${escapeHtml(nextPlace.name)}</a>`;
  });
  return `<div class="transit-naver-links"><strong>대중교통 구간별 길찾기</strong>${links.join("")}</div>`;
}

function renderTransitGuidance(routeLegs) {
  const transitInstructions = routeLegs.flatMap((leg) => leg.instructions || []);
  if (!transitInstructions.length) return "";

  return `
    <section class="transit-guidance">
      <div class="transit-guidance-title">
        <strong>상세 이동 안내</strong>
        <span>대중교통 구간의 승차와 하차 위치를 확인하세요.</span>
      </div>
      <ol>
        ${transitInstructions.map(renderTransitInstruction).join("")}
      </ol>
      ${routeLegs.filter((leg) => Number(leg.taxi_fare_estimate_won)).map(renderTaxiLegOption).join("")}
    </section>
  `;
}

function renderTaxiSummary(route) {
  if (!Number(route.taxi_return_estimate_won)) return "";

  const roundTripLabel = route.taxi_round_trip_recommended
    ? "귀환 포함 택시 이용 가능 범위"
    : "귀환 포함 택시비 확인 필요";

  return `
    <section class="taxi-summary">
      <div>
        <strong>택시 필요 구간</strong>
        <span>일반 중형택시 낮 시간 거리 기준 근사 예상액입니다.</span>
      </div>
      <div class="taxi-summary-prices">
        <span>선택 구간 ${formatWon(route.taxi_option_total_won || 0)}</span>
        <span>마지막 장소 → 출발지 귀환 ${formatWon(route.taxi_return_estimate_won)}</span>
        <b>${roundTripLabel}: ${formatWon(route.taxi_round_trip_estimate_won)}</b>
      </div>
    </section>
  `;
}

function renderTransitInstruction(instruction) {
  const modeLabels = {
    walk: "도보",
    bus: "버스",
    transfer: "환승",
    subway: "지하철",
    transit: "대중교통",
    taxi: "택시",
  };
  const label = modeLabels[instruction.mode] || "이동";
  const title = formatTransitInstructionTitle(instruction, label);
  const meta = [
    Number(instruction.time_sec) ? formatMinutes(instruction.time_sec) : "",
    Number(instruction.distance_m) ? formatKm(instruction.distance_m) : "",
  ].filter(Boolean).join(" · ");
  const stationMeta = formatTransitStationMeta(instruction);
  const routeMeta = [
    instruction.route ? `노선: ${instruction.route}` : "",
    Number(instruction.station_count) ? `${instruction.station_count}개 정거장` : "",
    Number(instruction.fare_won) ? `요금 ${formatWon(instruction.fare_won)}` : "",
  ].filter(Boolean).join(" · ");

  return `
    <li>
      <span class="transit-mode transit-mode-${escapeHtml(instruction.mode)}">${label}</span>
      <div>
        <strong>${escapeHtml(title)}</strong>
        ${stationMeta ? `<small>${escapeHtml(stationMeta)}</small>` : ""}
        ${routeMeta ? `<small>${escapeHtml(routeMeta)}</small>` : ""}
        ${meta ? `<small>${escapeHtml(meta)}</small>` : ""}
      </div>
    </li>
  `;
}

function formatTransitInstructionTitle(instruction, label) {
  const from = instruction.boarding_station || instruction.from || "";
  const to = instruction.alighting_station || instruction.to || "";
  const route = instruction.route ? `${instruction.route} ` : "";
  if (instruction.mode === "walk") {
    if (from && to) return `${from}에서 ${to}까지 도보 이동`;
    if (to) return `${to}까지 도보 이동`;
    return instruction.description || "도보 이동";
  }
  if (instruction.mode === "bus" || instruction.mode === "subway") {
    const vehicle = instruction.mode === "subway" ? "지하철" : "버스";
    if (from && to) return `${from}에서 ${route}${vehicle} 탑승 → ${to} 하차`;
    return instruction.description || `${route}${vehicle} 이동`;
  }
  return instruction.description || `${label} 이동`;
}

function formatTransitStationMeta(instruction) {
  const from = instruction.boarding_station || instruction.from || "";
  const to = instruction.alighting_station || instruction.to || "";
  if (instruction.mode === "walk") {
    return [from ? `출발: ${from}` : "", to ? `도착: ${to}` : ""].filter(Boolean).join(" / ");
  }
  return [from ? `승차: ${from}` : "", to ? `하차: ${to}` : ""].filter(Boolean).join(" / ");
}

function renderTaxiLegOption(leg) {
  return `
    <p class="taxi-option">
      ${escapeHtml(leg.from)} → ${escapeHtml(leg.to)}:
      택시 예상 ${formatWon(leg.taxi_fare_estimate_won)} · ${escapeHtml(leg.taxi_reason || "택시 이동 필요")}
    </p>
  `;
}

function buildNaverDirectionsUrl(places, transport) {
  const validPlaces = places.filter((place) => Number.isFinite(place.lat) && Number.isFinite(place.lon));
  if (validPlaces.length < 2) return "";

  const start = validPlaces[0];
  const destination = validPlaces[validPlaces.length - 1];
  const viaPlaces = validPlaces.slice(1, -1);
  const routeMode = transport === "car" ? "car" : transport;
  const startSegment = buildNaverPlaceSegment(start);
  const destinationSegment = buildNaverPlaceSegment(destination);
  const viaSegment = viaPlaces.length ? viaPlaces.map(buildNaverPlaceSegment).join(":") : "-";

  return `https://map.naver.com/p/directions/${startSegment}/${destinationSegment}/${viaSegment}/${routeMode}`;
}

function buildNaverPlaceSegment(place) {
  const lon = Number(place.lon).toFixed(7);
  const lat = Number(place.lat).toFixed(7);
  const name = encodeURIComponent(place.name || "장소");
  return `${lon},${lat},${name},,`;
}

function getCenterPoint(places) {
  const lat = places.reduce((sum, place) => sum + place.lat, 0) / places.length;
  const lon = places.reduce((sum, place) => sum + place.lon, 0) / places.length;
  return { lat, lon };
}

function normalizePlacesToOverlayPoints(places) {
  return normalizeCoordinatesToOverlayPoints(places, places);
}

function normalizeCoordinatesToOverlayPoints(points, boundsSource = points) {
  const safePoints = points.filter((point) => Number.isFinite(Number(point.lat)) && Number.isFinite(Number(point.lon)));
  const safeBounds = boundsSource.filter((point) => Number.isFinite(Number(point.lat)) && Number.isFinite(Number(point.lon)));
  const minLat = Math.min(...safeBounds.map((place) => Number(place.lat)));
  const maxLat = Math.max(...safeBounds.map((place) => Number(place.lat)));
  const minLon = Math.min(...safeBounds.map((place) => Number(place.lon)));
  const maxLon = Math.max(...safeBounds.map((place) => Number(place.lon)));
  const latRange = Math.max(maxLat - minLat, 0.001);
  const lonRange = Math.max(maxLon - minLon, 0.001);

  return safePoints.map((place, index) => ({
    ...place,
    index,
    x: 120 + ((Number(place.lon) - minLon) / lonRange) * 760,
    y: 820 - ((Number(place.lat) - minLat) / latRange) * 640,
  }));
}

function renderStaticMapPoint(point) {
  return `
    <g class="tmap-static-point">
      <circle cx="${point.x}" cy="${point.y}" r="38" />
      <text x="${point.x}" y="${point.y + 13}">${point.index + 1}</text>
    </g>
  `;
}

async function requestJson(path, options = {}) {
  if (!path.startsWith("/api/auth/") && checkIdleSession()) {
    throw new Error("20\ubd84 \ubb34\ud65c\ub3d9\uc73c\ub85c \ub85c\uadf8\uc544\uc6c3\ub418\uc5c8\uc2b5\ub2c8\ub2e4.");
  }
  const token = getAuthToken();
  const { timeoutMs, ...fetchOptions } = options;
  const controller = timeoutMs ? new AbortController() : null;
  const timeoutId = controller
    ? window.setTimeout(() => controller.abort(), Number(timeoutMs))
    : null;
  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      headers: {
        "Content-Type": "application/json",
        "ngrok-skip-browser-warning": "true",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(fetchOptions.headers || {}),
      },
      ...fetchOptions,
      ...(controller ? { signal: controller.signal } : {}),
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error("장소 정보를 불러오는 데 시간이 오래 걸리고 있어요. 잠시 후 다시 시도해 주세요.");
    }
    throw error;
  } finally {
    if (timeoutId) window.clearTimeout(timeoutId);
  }

  if (!response.ok) {
    const text = await response.text();
    if (response.status === 401 && path.startsWith("/api/") && !path.startsWith("/api/auth/")) {
      clearAuthToken();
      updateAuthUi(null);
      pendingRecommendationAccess = true;
      authMessage.textContent = "로그인이 필요하거나 로그인 정보가 만료되었습니다. 다시 로그인해 주세요.";
      showPortalView("login");
    }
    throw new Error(text || response.statusText);
  }

  return response.json();
}

function getCheckedValue(name) {
  return document.querySelector(`input[name="${name}"]:checked`).value;
}

function formatKm(meters) {
  return `${(meters / 1000).toFixed(2)}km`;
}

function formatMinutes(seconds) {
  return `${Math.round(seconds / 60)}분`;
}

function formatWon(amount) {
  return `${Math.round(Number(amount) || 0).toLocaleString("ko-KR")}원`;
}

function formatCourseSummary(course) {
  const placeNames = course.places
    .filter((place) => place.order !== 1)
    .map((place) => place.name)
    .join(" → ");
  return `${placeNames}, 약 ${formatKm(course.route.total_distance_m)}, ${formatMinutes(course.route.total_time_sec)}, 1인 예산 약 ${formatWon(course.estimated_budget_won)}`;
}

function summarizeRouteModes(legs) {
  const counts = legs.filter((leg) => leg.distance_m > 0 || leg.time_sec > 0).reduce((result, leg) => {
    const mode = leg.mode || "";
    result[mode] = (result[mode] || 0) + 1;
    return result;
  }, {});
  const labels = [
    ["walk", "도보"],
    ["transit", "대중교통"],
    ["taxi", "택시"],
    ["car", "자차"],
  ];
  const summary = labels
    .filter(([mode]) => counts[mode])
    .map(([mode, label]) => `${label} ${counts[mode]}구간`)
    .join(" · ");
  return summary ? ` · ${summary}` : "";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeSvg(value) {
  return escapeHtml(value);
}

function shortenText(value, maxLength) {
  const text = String(value ?? "");
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

init();
