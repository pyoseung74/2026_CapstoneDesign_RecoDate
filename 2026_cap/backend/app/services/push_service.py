# ============================================================
# RecoDate 푸시 알림 전송 서비스
# - 인앱 알림(_add_notification)이 쌓일 때마다 이 모듈의 enqueue()가 호출된다.
# - 실제 발송은 백그라운드 데몬 스레드 1개가 큐를 비우며 처리한다.
#   (네트워크 호출이라 요청/DB 트랜잭션을 막지 않기 위함. 전부 best-effort.)
# - 두 채널을 동시에 지원한다:
#     · webpush : PWA(브라우저) — VAPID 키쌍 필요(pywebpush)
#     · fcm     : 네이티브 앱(안드로이드) — Firebase 서비스계정 JSON 필요(HTTP v1)
#   각 채널은 키/자격증명이 설정돼 있을 때만 동작하고, 없으면 조용히 건너뛴다.
# ============================================================

import json
import threading
import queue
import time

from ..config import settings

# ----- 알림 종류별 휴대폰 표시 문구 -----
# 메시지는 발신자 이름을 제목으로 올려 카톡처럼 보이게 하고, 본문은 미리보기를 쓴다.
_BODY_TEXTS = {
    "like": "님이 회원님의 게시물을 좋아해요 ♥",
    "comment": "님이 회원님의 게시물에 댓글을 남겼어요",
    "follow": "님이 회원님을 팔로우해요",
    "message": "님이 메시지를 보냈어요",
}

_queue: "queue.Queue[dict]" = queue.Queue()
_worker_started = False
_worker_lock = threading.Lock()

# FCM 자격증명/프로젝트ID 캐시
_fcm_credentials = None
_fcm_project_id = None
_fcm_unavailable_logged = False


def enqueue(*, user_id, actor_id=None, actor_nickname, notif_type, post_id=None, preview=None):
    """푸시 1건을 큐에 넣는다. 워커가 떠 있지 않으면 띄운다."""
    _ensure_worker()
    _queue.put(
        {
            "user_id": user_id,
            "actor_id": actor_id,
            "actor_nickname": actor_nickname or "RecoDate",
            "notif_type": notif_type,
            "post_id": post_id,
            "preview": preview,
        }
    )


def enqueue_room(*, user_id, room_id, room_name, sender_nickname, preview=None):
    """단체 채팅 푸시(제목=방 이름, 본문='발신자: 내용', 클릭 시 방으로 이동)."""
    _ensure_worker()
    _queue.put(
        {
            "user_id": user_id,
            "actor_id": None,
            "actor_nickname": sender_nickname or "RecoDate",
            "notif_type": "room_message",
            "room_id": room_id,
            "room_name": room_name,
            "preview": preview,
        }
    )


def _ensure_worker():
    global _worker_started
    if _worker_started:
        return
    with _worker_lock:
        if _worker_started:
            return
        thread = threading.Thread(target=_worker_loop, name="recodate-push", daemon=True)
        thread.start()
        _worker_started = True


def _worker_loop():
    while True:
        item = _queue.get()
        try:
            _process(item)
        except Exception as exc:  # 워커는 절대 죽지 않는다.
            print(f"[push] 처리 실패: {exc}")
        finally:
            _queue.task_done()


def _build_message(item):
    """알림 항목 → (title, body, data)."""
    actor = item["actor_nickname"]
    notif_type = item["notif_type"]
    preview = item.get("preview")
    if notif_type == "room_message":
        title = item.get("room_name") or "단체 채팅"
        body = f"{actor}: {preview}" if preview else f"{actor}님이 메시지를 보냈어요"
    elif notif_type == "message":
        title = actor
        body = preview or "메시지를 보냈어요"
    else:
        title = "RecoDate"
        body = f"{actor}{_BODY_TEXTS.get(notif_type, '님의 새 소식이 있어요')}"
    data = {
        "type": str(notif_type),
        "post_id": str(item["post_id"]) if item.get("post_id") is not None else "",
        "actor_id": str(item["actor_id"]) if item.get("actor_id") is not None else "",
        "room_id": str(item["room_id"]) if item.get("room_id") is not None else "",
        "actor": actor,
        "url": "https://recodate.com/",
    }
    return title, body, data


def _process(item):
    # 지연 import(순환참조 방지) + 매번 새 인스턴스는 가볍다(CREATE IF NOT EXISTS).
    from .community_repository import CommunityRepository

    repo = CommunityRepository()
    subscriptions = repo.list_push_subscriptions(item["user_id"])
    if not subscriptions:
        return
    title, body, data = _build_message(item)
    for sub in subscriptions:
        try:
            if sub["channel"] == "webpush":
                _send_webpush(repo, sub, title, body, data)
            elif sub["channel"] == "fcm":
                _send_fcm(repo, sub, title, body, data)
        except Exception as exc:
            print(f"[push] 전송 실패({sub['channel']}): {exc}")


# ----------------------- 웹푸시(VAPID) -----------------------

def _webpush_available():
    return bool(settings.vapid_public_key and settings.vapid_private_key)


def _send_webpush(repo, sub, title, body, data):
    if not _webpush_available():
        return
    if not (sub.get("p256dh") and sub.get("auth")):
        return
    from pywebpush import webpush, WebPushException

    subscription_info = {
        "endpoint": sub["endpoint"],
        "keys": {"p256dh": sub["p256dh"], "auth": sub["auth"]},
    }
    payload = json.dumps({"title": title, "body": body, **data})
    try:
        webpush(
            subscription_info=subscription_info,
            data=payload,
            vapid_private_key=settings.vapid_private_key,
            vapid_claims={"sub": settings.vapid_subject},
            timeout=10,
        )
    except WebPushException as exc:
        status = getattr(getattr(exc, "response", None), "status_code", None)
        # 만료/해지된 구독은 정리한다.
        if status in (404, 410):
            repo.delete_push_subscription_by_endpoint(sub["endpoint"])
        else:
            raise


# ----------------------- FCM(HTTP v1) -----------------------

def _load_fcm_credentials():
    """서비스계정 JSON으로 FCM 자격증명을 만든다(없으면 None)."""
    global _fcm_credentials, _fcm_project_id, _fcm_unavailable_logged
    if _fcm_credentials is not None:
        return _fcm_credentials
    path = settings.fcm_service_account_path
    if not path:
        if not _fcm_unavailable_logged:
            print("[push] FCM 비활성: FCM_SERVICE_ACCOUNT_PATH 미설정")
            _fcm_unavailable_logged = True
        return None
    try:
        from google.oauth2 import service_account

        creds = service_account.Credentials.from_service_account_file(
            path, scopes=["https://www.googleapis.com/auth/firebase.messaging"]
        )
        _fcm_credentials = creds
        # 프로젝트ID는 설정값 우선, 없으면 서비스계정 JSON에서 읽는다.
        _fcm_project_id = settings.fcm_project_id
        if not _fcm_project_id:
            with open(path, "r", encoding="utf-8") as fp:
                _fcm_project_id = json.load(fp).get("project_id", "")
        return _fcm_credentials
    except Exception as exc:
        if not _fcm_unavailable_logged:
            print(f"[push] FCM 자격증명 로드 실패: {exc}")
            _fcm_unavailable_logged = True
        return None


def _fcm_access_token():
    creds = _load_fcm_credentials()
    if creds is None:
        return None
    import google.auth.transport.requests

    if not creds.valid:
        creds.refresh(google.auth.transport.requests.Request())
    return creds.token


def _send_fcm(repo, sub, title, body, data):
    token = _fcm_access_token()
    if not token or not _fcm_project_id:
        return
    import requests

    device_token = sub["endpoint"]  # fcm 채널은 endpoint 칸에 디바이스 토큰을 저장한다.
    message = {
        "message": {
            "token": device_token,
            "notification": {"title": title, "body": body},
            "data": {k: str(v) for k, v in data.items()},
            "android": {
                "priority": "high",
                "notification": {"sound": "default", "default_sound": True},
            },
        }
    }
    url = f"https://fcm.googleapis.com/v1/projects/{_fcm_project_id}/messages:send"
    resp = requests.post(
        url,
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        data=json.dumps(message),
        timeout=10,
    )
    if resp.status_code == 200:
        return
    # 등록 해지된 토큰은 정리한다.
    text = resp.text or ""
    if resp.status_code == 404 or "UNREGISTERED" in text or "NOT_FOUND" in text or "InvalidRegistration" in text:
        repo.delete_push_subscription_by_endpoint(device_token)
        return
    print(f"[push] FCM 응답 {resp.status_code}: {text[:200]}")


def status():
    """설정 상태 점검용(디버그/헬스체크)."""
    return {
        "webpush": _webpush_available(),
        "fcm": bool(settings.fcm_service_account_path),
    }
