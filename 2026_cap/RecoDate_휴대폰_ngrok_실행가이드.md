# RecoDate 휴대폰 실행 가이드

이 문서는 노트북에서 RecoDate 서버를 켜고, 갤럭시 휴대폰에서 ngrok 주소로 접속하는 방법을 정리한 가이드입니다.

## 핵심 주소

현재 ngrok 공개 접속 주소:

```text
https://commode-maroon-exfoliate.ngrok-free.dev/web/
```

갤럭시에서는 크롬 또는 삼성 인터넷을 열고 위 주소를 그대로 입력하면 됩니다.

처음 접속할 때 ngrok 경고 화면이 나오면 `Visit Site`를 눌러 들어가면 됩니다.

## 가장 쉬운 실행 순서

### 1. RecoDate 서버 켜기

프로젝트 폴더에서 아래 파일을 더블클릭합니다.

```text
start-recodate.bat
```

이 파일은 RecoDate 백엔드와 프론트를 켭니다.

창이 2개 정도 열릴 수 있습니다. 발표나 테스트가 끝날 때까지 닫지 마세요.

### 2. ngrok 터널 켜기

프로젝트 폴더에서 아래 파일을 더블클릭합니다.

```text
start-recodate-ngrok.bat
```

그러면 ngrok 창이 열리고 `Forwarding` 또는 `https://...ngrok-free.dev` 주소가 표시됩니다.

주소 뒤에 반드시 `/web/`를 붙여서 접속합니다.

예:

```text
https://commode-maroon-exfoliate.ngrok-free.dev/web/
```

### 3. 휴대폰에서 접속하기

갤럭시에서 크롬 또는 삼성 인터넷을 엽니다.

주소창에 아래 주소를 입력합니다.

```text
https://commode-maroon-exfoliate.ngrok-free.dev/web/
```

이 방식은 같은 와이파이가 아니어도 접속할 수 있습니다.

단, 노트북과 ngrok 창은 계속 켜져 있어야 합니다.

## 지금 열린 ngrok 도움말 창에서는?

ngrok 프로그램만 그냥 실행하면 도움말 화면이 나옵니다.

그 화면은 앱이 실행된 상태가 아닙니다.

그 창에서 직접 실행하려면 아래 명령어를 입력합니다.

```powershell
ngrok http 8010
```

하지만 가장 편한 방법은 이 명령어를 직접 입력하지 않고, 프로젝트 폴더의 아래 파일을 더블클릭하는 것입니다.

```text
start-recodate-ngrok.bat
```

## 다시 켤 때마다 해야 하는 일

1. `start-recodate.bat` 실행
2. `start-recodate-ngrok.bat` 실행
3. ngrok 창에 나온 `https://...ngrok-free.dev` 주소 확인
4. 주소 뒤에 `/web/` 붙여서 휴대폰에서 접속

## 주의사항

- 노트북이 꺼지면 접속이 안 됩니다.
- `start-recodate.bat` 창을 닫으면 서버가 꺼질 수 있습니다.
- `start-recodate-ngrok.bat` 창을 닫으면 외부 접속 주소가 꺼집니다.
- 무료 ngrok 주소는 다시 실행할 때 바뀔 수 있습니다.
- 주소가 바뀌면 새 주소 뒤에 `/web/`를 붙여서 접속해야 합니다.
- ngrok 경고 페이지가 나오면 `Visit Site`를 누르면 됩니다.

## 종료 방법

테스트가 끝나면 아래 파일을 실행합니다.

```text
stop-recodate.bat
```

그리고 ngrok 창도 닫으면 됩니다.

## 문제가 생겼을 때

### 휴대폰에서 접속이 안 될 때

아래를 확인합니다.

- 노트북에서 `start-recodate.bat`이 실행 중인지 확인
- 노트북에서 `start-recodate-ngrok.bat`이 실행 중인지 확인
- 주소 뒤에 `/web/`를 붙였는지 확인
- ngrok 주소가 새로 바뀌지 않았는지 확인

### PC에서는 되는데 휴대폰에서 안 될 때

ngrok 주소를 다시 확인합니다.

휴대폰에는 `localhost`나 `127.0.0.1` 주소를 입력하면 안 됩니다.

휴대폰에서는 반드시 아래처럼 ngrok 주소를 사용해야 합니다.

```text
https://...ngrok-free.dev/web/
```

