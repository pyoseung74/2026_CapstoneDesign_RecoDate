#!/bin/bash
echo "🛑 RecoDate 서버를 종료하는 중..."
lsof -ti :8010 | xargs kill -9 2>/dev/null
lsof -ti :5174 | xargs kill -9 2>/dev/null
echo "✨ RecoDate 서버(8010, 5174 포트)가 성공적으로 종료되었습니다."
