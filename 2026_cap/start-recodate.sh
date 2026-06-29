#!/bin/bash
cd "$(dirname "$0")"

if [ ! -f "backend/.venv-local/bin/python" ]; then
  echo "⚠️ 가상환경이 없습니다. 자동 설치를 진행합니다..."
  python3 -m venv backend/.venv-local
  backend/.venv-local/bin/pip install -r backend/requirements.txt
fi

echo "🚀 RecoDate 백엔드 및 프론트엔드 서버를 시작합니다..."
nohup backend/.venv-local/bin/python -m uvicorn app.main:app --app-dir backend --host 0.0.0.0 --port 8010 > backend.log 2>&1 &
nohup python3 -m http.server 5174 --bind 0.0.0.0 --directory frontend > frontend.log 2>&1 &

sleep 2
open "http://localhost:5174/"

echo "✅ RecoDate가 백그라운드에서 실행되었으며 브라우저가 열렸습니다!"
echo "🛑 종료하려면 ./stop-recodate.sh 를 실행하세요."
