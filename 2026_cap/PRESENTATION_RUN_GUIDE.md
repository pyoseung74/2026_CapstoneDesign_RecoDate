# RecoDate 발표 실행 가이드

## 발표 당일 가장 쉬운 방법

1. 프로젝트 폴더를 엽니다.
2. `start-recodate.bat`를 더블클릭합니다.
3. 검은색 또는 파란색 PowerShell 창 두 개를 닫지 않습니다.
4. 잠시 뒤 브라우저에서 `http://localhost:5174/`가 열립니다.
5. 발표가 끝나면 `stop-recodate.bat`를 더블클릭합니다.

인터넷이 불안정해도 로컬 안전망으로 기본 추천 기능은 작동합니다. 실제 지도 API와 외부 사진은 인터넷 연결 상태에 영향을 받을 수 있습니다.

## VS Code로 직접 실행하는 방법

1. VS Code를 설치하고 실행합니다.
2. 상단 메뉴에서 `File` > `Open Folder`를 누릅니다.
3. 아래 폴더를 선택합니다.

```text
C:\Users\parkd\OneDrive\바탕 화면\RecoDate MVP 구현_YG_차량 이어 붙이기
```

4. 상단 메뉴에서 `Terminal` > `New Terminal`을 누릅니다.
5. 첫 번째 터미널에 아래 명령어를 입력합니다.

```powershell
.\backend\.venv-local\Scripts\python.exe -m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8010
```

6. 터미널 오른쪽 위의 `+` 버튼을 눌러 두 번째 터미널을 엽니다.
7. 두 번째 터미널에 아래 명령어를 입력합니다.

```powershell
.\backend\.venv-local\Scripts\python.exe -m http.server 5174 --bind 127.0.0.1 --directory frontend
```

8. Chrome 또는 Edge 주소창에 아래 주소를 입력합니다.

```text
http://localhost:5174/
```

두 터미널은 사이트가 실행되는 동안 닫지 않습니다. 종료하려면 각 터미널을 선택하고 `Ctrl+C`를 누릅니다.

## 처음 한 번만 준비

현재 컴퓨터에는 실행 환경이 이미 준비되어 있습니다. 다른 컴퓨터로 프로젝트를 옮기거나 `.venv-local` 폴더가 없어졌을 때만 아래 명령을 사용합니다.

```powershell
cd "C:\Users\parkd\OneDrive\바탕 화면\RecoDate MVP 구현_YG_차량 이어 붙이기"
py -3.12 -m venv backend\.venv-local
.\backend\.venv-local\Scripts\Activate.ps1
pip install -r backend\requirements.txt
```

Python 3.12가 없다는 오류가 나오면 Python 공식 사이트에서 Python 3.12를 먼저 설치합니다.

## 자주 생기는 문제

### 사이트가 열리지 않을 때

`stop-recodate.bat`를 한 번 실행한 뒤 `start-recodate.bat`를 다시 실행합니다.

### 백엔드 창에 uvicorn 오류가 나올 때

`.venv-local` 환경이 없거나 패키지가 빠진 경우입니다. 위의 "처음 한 번만 준비" 절차를 실행합니다.

### 발표 전에 확인할 것

1. 로그인
2. 지역별 장소 탐색
3. 코스 추천 3개 생성
4. 장소 변경
5. 코스 저장과 내 코스 확인
6. 코스 흐름 지도 표시
7. 인터넷을 끊었을 때 기본 추천이 계속 작동하는지 확인

