# RecoDate 푸시 알림 설정 가이드

휴대폰 푸시 알림(좋아요·댓글·채팅 미리보기·팔로우)을 켜기 위한 설정 안내입니다.

알림은 두 갈래로 나갑니다:

| 대상 사용자 | 방식 | 추가 설정 |
|---|---|---|
| **recodate.com / 홈 화면 설치 PWA** | 웹푸시(VAPID) | ✅ 이미 완료 (배포만 하면 동작) |
| **안드로이드 APK 다운로드 앱** | FCM | ⬇️ 아래 Firebase 설정 필요 |

> 이미 깔려 있는 APK는 **새 APK(푸시 기능 포함)로 다시 설치**해야 푸시를 받습니다.

---

## A. 웹푸시(PWA) — 이미 완료된 부분

- VAPID 키쌍을 생성해 `.env`에 넣어두었습니다 (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`).
- 사용자가 알림 종(🔔) → **"휴대폰으로 알림 받기"** 버튼을 누르면 브라우저 권한을 묻고 구독됩니다.
- 별도로 할 일 없습니다. **배포만 하면** PWA 사용자에게 푸시가 갑니다.

> ⚠️ VAPID 키는 비밀입니다. `.env`처럼 외부에 노출하지 마세요. 키를 바꾸면 기존 구독이 전부 무효가 됩니다(다시 구독 필요).

---

## B. FCM(안드로이드 APK) — 사장님이 해주실 단계

### B-1. Firebase 프로젝트 만들기 (무료)

1. https://console.firebase.google.com 접속 → 구글 계정 로그인
2. **프로젝트 추가** → 이름 예: `RecoDate` → 계속
3. Google 애널리틱스는 꺼도 됩니다(필수 아님) → **프로젝트 만들기**

### B-2. 안드로이드 앱 등록 + google-services.json 받기

1. 프로젝트 대시보드에서 **안드로이드 아이콘**(앱 추가) 클릭
2. **Android 패키지 이름**에 정확히 입력: `com.recodate.app`
   - (앱 닉네임/SHA-1은 비워도 됩니다)
3. **앱 등록** → **google-services.json 다운로드**
4. 받은 `google-services.json` 파일을 프로젝트의 다음 위치에 넣기:
   ```
   android/app/google-services.json
   ```
5. 나머지 SDK 안내 화면은 **그냥 다음/완료** 눌러 넘어가세요(아래 C에서 코드로 처리).

### B-3. 백엔드용 서비스 계정 키 받기 (서버가 FCM에 푸시 보낼 때 인증)

1. Firebase 콘솔 좌측 상단 **⚙️ 톱니바퀴 → 프로젝트 설정**
2. **서비스 계정** 탭 → **새 비공개 키 생성** → **키 생성**
3. JSON 파일이 다운로드됩니다(예: `recodate-xxxxx-firebase-adminsdk-xxxx.json`)
4. 이 파일을 **서버에만** 두고, 이름을 정해 업로드합니다(예: 서버 `/opt/recodate/firebase-service-account.json`).
   - ⚠️ 이 키는 **절대 외부 공개 금지**(서버 푸시 전권). git에도 올리지 마세요.

이 파일 안의 `project_id` 값(예: `recodate-12345`)을 메모해 두세요. B-5에서 씁니다.

### B-4. 백엔드 환경변수 설정 (서버)

서버의 `.env` **두 곳**에 추가합니다 (⚠️ RecoDate 서버는 `/opt/recodate/.env`와 그림자 `/opt/.env` 둘 다 읽음):

```
FCM_SERVICE_ACCOUNT_PATH=/opt/recodate/firebase-service-account.json
FCM_PROJECT_ID=recodate-12345        # B-3에서 본 project_id
```

그리고 서버에 푸시용 파이썬 패키지를 설치 후 재시작:

```bash
/opt/recodate/.venv/bin/pip install pywebpush google-auth
systemctl restart recodate
```

> `python -c "from app.services import push_service; print(push_service.status())"` 로
> `{'webpush': True, 'fcm': True}` 가 나오면 양쪽 다 켜진 것입니다.

### B-5. APK에 푸시 플러그인 넣어 다시 빌드

로컬(PC)에서:

```bash
npm install          # @capacitor/push-notifications 설치(package.json에 이미 추가됨)
npm run mobile:sync  # 웹 자산 + 플러그인을 android로 동기화
```

그다음 **android Gradle에 Google 서비스 플러그인**을 한 번만 추가합니다:

1. `android/build.gradle` 의 `dependencies { }` 안에 추가:
   ```gradle
   classpath 'com.google.gms:google-services:4.4.2'
   ```
2. `android/app/build.gradle` **맨 아래**에 추가:
   ```gradle
   apply plugin: 'com.google.gms.google-services'
   ```
3. `android/app/google-services.json` 이 들어있는지 확인(B-2에서 넣음).

그리고 Android Studio(또는 `cap open android`)에서 **APK 빌드** → 새 APK 배포 →
사용자는 **새 APK로 재설치**하면 첫 실행 + 로그인 후 알림 권한을 묻습니다.

### B-6. 동작 확인

1. 새 APK를 휴대폰에 설치 → 로그인 → 알림 권한 **허용**
2. 다른 계정으로 그 사용자에게 **좋아요/댓글/채팅/팔로우** 발생
3. 휴대폰 상단바에 알림이 뜨면 성공 (채팅은 본문 미리보기 포함)
4. 알림을 누르면 해당 채팅/프로필/게시물로 이동

---

## 참고: iOS는 나중에

iOS 푸시는 **Apple Developer Program(연 $99)** 가입 + APNs 인증키(.p8)가 필요합니다.
계정이 준비되면 Firebase에 iOS 앱 등록 + APNs 키 업로드 + `@capacitor/push-notifications`
iOS 빌드로 동일하게 확장할 수 있습니다(코드는 이미 양쪽 모두 대응).

## 문제가 생기면 확인할 것

- 푸시가 안 와요 → 서버 로그에서 `[push]` 줄 확인. `FCM 비활성` 이면 B-3/B-4 환경변수 누락.
- 웹푸시만 안 와요 → 브라우저 알림 권한이 차단인지, `.env` VAPID 키 3종이 다 있는지.
- 토큰이 만료되면 자동으로 정리됩니다(다음에 앱 열고 로그인하면 재등록).
