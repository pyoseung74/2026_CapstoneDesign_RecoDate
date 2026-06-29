# ============================================================
# RecoDate 커뮤니티 저장소
# - community_posts: 사용자가 공유한 코스(코스 전체를 JSON 스냅샷으로 저장 —
#   원본 코스가 바뀌거나 지워져도 게시물이 깨지지 않는다)
# - post_likes: 좋아요(사용자당 게시물 1회)
# - friendships: 친구 관계(Phase 2에서 요청/수락 API가 붙지만,
#   '친구 공개' 글 필터에 필요해 테이블은 Phase 1부터 만든다)
# ============================================================

import base64
import json
import secrets
import sqlite3
from contextlib import closing
from datetime import datetime, timezone
from pathlib import Path

DATABASE_PATH = Path(__file__).resolve().parents[2] / "data" / "recodate_users.db"
UPLOAD_DIR = DATABASE_PATH.parent / "uploads"
MAX_IMAGES_PER_POST = 4
MAX_IMAGE_BYTES = 3 * 1024 * 1024
IMAGE_MAGIC_BYTES = {
    b"\xff\xd8\xff": "jpg",
    b"\x89PNG": "png",
    b"RIFF": "webp",
}


class CommunityRepository:
    def __init__(self):
        self.database_path = DATABASE_PATH
        self._initialize()

    def _connect(self):
        connection = sqlite3.connect(self.database_path)
        connection.row_factory = sqlite3.Row
        return connection

    def _now(self):
        return datetime.now(timezone.utc).isoformat()

    def _initialize(self):
        self.database_path.parent.mkdir(parents=True, exist_ok=True)
        with closing(self._connect()) as connection:
            # follows 테이블이 이번에 처음 만들어지는 경우에만 기존 친구 관계를 1회 이전한다.
            follows_existed = bool(
                connection.execute(
                    "SELECT name FROM sqlite_master WHERE type='table' AND name='follows'"
                ).fetchone()
            )
            connection.executescript(
                """
                CREATE TABLE IF NOT EXISTS community_posts (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    title TEXT NOT NULL,
                    comment TEXT NOT NULL DEFAULT '',
                    region_label TEXT NOT NULL DEFAULT '',
                    transport TEXT NOT NULL DEFAULT 'walk',
                    course_json TEXT NOT NULL,
                    visibility TEXT NOT NULL DEFAULT 'public',
                    like_count INTEGER NOT NULL DEFAULT 0,
                    created_at TEXT NOT NULL,
                    FOREIGN KEY(user_id) REFERENCES users(id)
                );
                CREATE TABLE IF NOT EXISTS post_likes (
                    post_id INTEGER NOT NULL,
                    user_id INTEGER NOT NULL,
                    created_at TEXT NOT NULL,
                    PRIMARY KEY(post_id, user_id)
                );
                CREATE TABLE IF NOT EXISTS friendships (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    requester_id INTEGER NOT NULL,
                    addressee_id INTEGER NOT NULL,
                    status TEXT NOT NULL DEFAULT 'pending',
                    created_at TEXT NOT NULL,
                    responded_at TEXT,
                    UNIQUE(requester_id, addressee_id)
                );
                CREATE TABLE IF NOT EXISTS chat_messages (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    sender_id INTEGER NOT NULL,
                    receiver_id INTEGER NOT NULL,
                    content TEXT NOT NULL DEFAULT '',
                    course_json TEXT NOT NULL DEFAULT '',
                    created_at TEXT NOT NULL,
                    read_at TEXT
                );
                CREATE TABLE IF NOT EXISTS chat_rooms (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL DEFAULT '',
                    creator_id INTEGER NOT NULL,
                    created_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS chat_room_members (
                    room_id INTEGER NOT NULL,
                    user_id INTEGER NOT NULL,
                    joined_at TEXT NOT NULL,
                    last_read_message_id INTEGER NOT NULL DEFAULT 0,
                    PRIMARY KEY(room_id, user_id)
                );
                CREATE TABLE IF NOT EXISTS chat_room_messages (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    room_id INTEGER NOT NULL,
                    sender_id INTEGER NOT NULL,
                    content TEXT NOT NULL DEFAULT '',
                    course_json TEXT NOT NULL DEFAULT '',
                    images TEXT NOT NULL DEFAULT '[]',
                    reply_to_id INTEGER,
                    created_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS post_comments (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    post_id INTEGER NOT NULL,
                    user_id INTEGER NOT NULL,
                    content TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS place_reviews (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    place_key TEXT NOT NULL,
                    place_id TEXT NOT NULL DEFAULT '',
                    place_name TEXT NOT NULL,
                    place_category TEXT NOT NULL DEFAULT '',
                    address TEXT NOT NULL DEFAULT '',
                    lat REAL,
                    lon REAL,
                    user_id INTEGER NOT NULL,
                    rating INTEGER NOT NULL,
                    content TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    UNIQUE(place_key, user_id)
                );
                CREATE TABLE IF NOT EXISTS reports (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    reporter_id INTEGER NOT NULL,
                    target_type TEXT NOT NULL,
                    target_id INTEGER NOT NULL,
                    reason TEXT NOT NULL DEFAULT '',
                    created_at TEXT NOT NULL,
                    UNIQUE(reporter_id, target_type, target_id)
                );
                CREATE TABLE IF NOT EXISTS user_blocks (
                    blocker_id INTEGER NOT NULL,
                    blocked_id INTEGER NOT NULL,
                    created_at TEXT NOT NULL,
                    PRIMARY KEY(blocker_id, blocked_id)
                );
                CREATE TABLE IF NOT EXISTS follows (
                    follower_id INTEGER NOT NULL,
                    followee_id INTEGER NOT NULL,
                    created_at TEXT NOT NULL,
                    PRIMARY KEY(follower_id, followee_id)
                );
                CREATE TABLE IF NOT EXISTS notifications (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    actor_id INTEGER NOT NULL,
                    type TEXT NOT NULL,
                    post_id INTEGER,
                    created_at TEXT NOT NULL,
                    read_at TEXT
                );
                CREATE TABLE IF NOT EXISTS push_subscriptions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    channel TEXT NOT NULL,
                    endpoint TEXT NOT NULL,
                    p256dh TEXT,
                    auth TEXT,
                    platform TEXT,
                    created_at TEXT NOT NULL,
                    UNIQUE(channel, endpoint)
                );
                CREATE TABLE IF NOT EXISTS couples (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    requester_id INTEGER NOT NULL,
                    addressee_id INTEGER NOT NULL,
                    status TEXT NOT NULL DEFAULT 'pending',
                    anniversary_date TEXT,
                    created_at TEXT NOT NULL,
                    accepted_at TEXT
                );
                CREATE INDEX IF NOT EXISTS idx_posts_created ON community_posts(created_at DESC);
                CREATE INDEX IF NOT EXISTS idx_friendships_users ON friendships(requester_id, addressee_id, status);
                CREATE INDEX IF NOT EXISTS idx_chat_pair ON chat_messages(sender_id, receiver_id, id);
                CREATE INDEX IF NOT EXISTS idx_chat_unread ON chat_messages(receiver_id, read_at);
                CREATE INDEX IF NOT EXISTS idx_room_messages ON chat_room_messages(room_id, id);
                CREATE INDEX IF NOT EXISTS idx_room_members_user ON chat_room_members(user_id);
                CREATE INDEX IF NOT EXISTS idx_comments_post ON post_comments(post_id, id);
                CREATE INDEX IF NOT EXISTS idx_place_reviews_place ON place_reviews(place_key, updated_at DESC);
                CREATE INDEX IF NOT EXISTS idx_place_reviews_user ON place_reviews(user_id, updated_at DESC);
                CREATE INDEX IF NOT EXISTS idx_reports_target ON reports(target_type, target_id);
                CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read_at, id);
                CREATE INDEX IF NOT EXISTS idx_follows_follower ON follows(follower_id);
                CREATE INDEX IF NOT EXISTS idx_follows_followee ON follows(followee_id);
                CREATE INDEX IF NOT EXISTS idx_couples_users ON couples(requester_id, addressee_id, status);
                """
            )
            if not follows_existed:
                # 기존 친구(accepted) → 맞팔로우(양방향), 대기 요청(pending) → 일방향 팔로우로 이전.
                connection.execute(
                    """
                    INSERT OR IGNORE INTO follows(follower_id, followee_id, created_at)
                    SELECT requester_id, addressee_id, created_at FROM friendships
                    WHERE status IN ('accepted', 'pending')
                    """
                )
                connection.execute(
                    """
                    INSERT OR IGNORE INTO follows(follower_id, followee_id, created_at)
                    SELECT addressee_id, requester_id, created_at FROM friendships
                    WHERE status = 'accepted'
                    """
                )
                connection.commit()
            columns = {row["name"] for row in connection.execute("PRAGMA table_info(community_posts)").fetchall()}
            if "post_type" not in columns:
                connection.execute("ALTER TABLE community_posts ADD COLUMN post_type TEXT NOT NULL DEFAULT 'course'")
            if "images" not in columns:
                connection.execute("ALTER TABLE community_posts ADD COLUMN images TEXT NOT NULL DEFAULT '[]'")
            # 커플 게시물: 작성 시점의 연인 스냅샷(닉네임이 바뀌어도 글은 그대로 유지)
            if "couple_partner_id" not in columns:
                connection.execute("ALTER TABLE community_posts ADD COLUMN couple_partner_id INTEGER")
            if "couple_partner_nickname" not in columns:
                connection.execute("ALTER TABLE community_posts ADD COLUMN couple_partner_nickname TEXT")
            chat_columns = {row["name"] for row in connection.execute("PRAGMA table_info(chat_messages)").fetchall()}
            if "images" not in chat_columns:
                connection.execute("ALTER TABLE chat_messages ADD COLUMN images TEXT NOT NULL DEFAULT '[]'")
            if "reply_to_id" not in chat_columns:
                connection.execute("ALTER TABLE chat_messages ADD COLUMN reply_to_id INTEGER")
            place_review_columns = {
                row["name"] for row in connection.execute("PRAGMA table_info(place_reviews)").fetchall()
            }
            if "images" not in place_review_columns:
                connection.execute("ALTER TABLE place_reviews ADD COLUMN images TEXT NOT NULL DEFAULT '[]'")
            if "community_post_id" not in place_review_columns:
                connection.execute("ALTER TABLE place_reviews ADD COLUMN community_post_id INTEGER")
            connection.commit()
        UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

    def save_images(self, data_urls):
        """data URL(base64) 이미지를 검증해 uploads 디렉토리에 저장하고 파일명 목록을 돌려준다."""
        filenames = []
        for data_url in (data_urls or [])[:MAX_IMAGES_PER_POST]:
            try:
                encoded = data_url.split(",", 1)[1] if "," in data_url else data_url
                raw = base64.b64decode(encoded)
            except (ValueError, IndexError) as exc:
                raise ValueError("이미지 형식이 올바르지 않습니다.") from exc
            if len(raw) > MAX_IMAGE_BYTES:
                raise ValueError("이미지는 장당 3MB 이하만 올릴 수 있어요.")
            extension = next(
                (ext for magic, ext in IMAGE_MAGIC_BYTES.items() if raw.startswith(magic)), None
            )
            if not extension:
                raise ValueError("JPG, PNG, WEBP 이미지만 올릴 수 있어요.")
            filename = f"comm_{secrets.token_hex(10)}.{extension}"
            (UPLOAD_DIR / filename).write_bytes(raw)
            filenames.append(filename)
        return filenames

    def image_path(self, filename):
        """디렉토리 탈출을 막고 업로드 파일의 실제 경로를 돌려준다."""
        safe = Path(filename).name
        if not safe.startswith("comm_"):
            return None
        path = UPLOAD_DIR / safe
        return path if path.exists() else None

    # 신고가 이 횟수 이상 쌓인 게시물은 피드에서 자동으로 숨긴다.
    POST_REPORT_HIDE_THRESHOLD = 5

    def _blocked_user_ids(self, connection, user_id):
        """양방향 차단: 내가 차단했거나 나를 차단한 사용자 집합."""
        rows = connection.execute(
            "SELECT blocker_id, blocked_id FROM user_blocks WHERE blocker_id = ? OR blocked_id = ?",
            (user_id, user_id),
        ).fetchall()
        blocked = set()
        for row in rows:
            blocked.add(row["blocked_id"] if row["blocker_id"] == user_id else row["blocker_id"])
        return blocked

    # ------------------- 팔로우/팔로잉 -------------------

    def _following_ids(self, connection, user_id):
        """user_id가 팔로우하는 사용자 집합."""
        return {
            row["followee_id"]
            for row in connection.execute(
                "SELECT followee_id FROM follows WHERE follower_id = ?", (user_id,)
            ).fetchall()
        }

    def _follower_ids(self, connection, user_id):
        """user_id를 팔로우하는 사용자 집합."""
        return {
            row["follower_id"]
            for row in connection.execute(
                "SELECT follower_id FROM follows WHERE followee_id = ?", (user_id,)
            ).fetchall()
        }

    def _mutual_follow_ids(self, connection, user_id):
        """맞팔로우(서로 팔로우) 집합 — 채팅 허용·친구 공개 글의 기준."""
        return self._following_ids(connection, user_id) & self._follower_ids(connection, user_id)

    def _follow_state(self, connection, viewer_id, other_id):
        """(내가 상대를 팔로우?, 상대가 나를 팔로우?)"""
        i_follow = bool(
            connection.execute(
                "SELECT 1 FROM follows WHERE follower_id = ? AND followee_id = ?", (viewer_id, other_id)
            ).fetchone()
        )
        follows_me = bool(
            connection.execute(
                "SELECT 1 FROM follows WHERE follower_id = ? AND followee_id = ?", (other_id, viewer_id)
            ).fetchone()
        )
        return i_follow, follows_me

    def create_post(self, user_id, title, comment, region_label, transport, course, visibility,
                    post_type="course", image_filenames=None, as_couple=False):
        title = (title or "").strip()[:60]
        comment = (comment or "").strip()[:500]
        if visibility not in ("public", "friends"):
            visibility = "public"
        if post_type not in ("course", "text"):
            post_type = "course"
        if post_type == "course":
            if not title:
                raise ValueError("코스 제목을 입력해 주세요.")
            if not isinstance(course, dict) or not course.get("places"):
                raise ValueError("공유할 코스 정보가 비어 있습니다.")
        else:
            # 글·사진 게시물: 본문 또는 사진 중 하나는 있어야 한다.
            if not comment and not image_filenames:
                raise ValueError("내용이나 사진을 입력해 주세요.")
            course = {}
        with closing(self._connect()) as connection:
            # 커플로 올리기: 작성 시점의 연인 스냅샷을 박아둔다(연인 있을 때만).
            couple_partner_id = couple_partner_nickname = None
            if as_couple:
                partner = self._partner_brief(connection, user_id)
                if partner:
                    couple_partner_id = partner["user_id"]
                    couple_partner_nickname = partner["nickname"]
            cursor = connection.execute(
                """
                INSERT INTO community_posts(user_id, title, comment, region_label, transport, course_json, visibility, created_at, post_type, images, couple_partner_id, couple_partner_nickname)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    user_id,
                    title,
                    comment,
                    (region_label or "").strip()[:40],
                    transport or "walk",
                    json.dumps(course, ensure_ascii=False),
                    visibility,
                    self._now(),
                    post_type,
                    json.dumps(image_filenames or []),
                    couple_partner_id,
                    couple_partner_nickname,
                ),
            )
            connection.commit()
            return self._serialize(connection, connection.execute(
                "SELECT * FROM community_posts WHERE id = ?", (cursor.lastrowid,)
            ).fetchone(), user_id)

    def list_posts(self, viewer_id, scope="all", sort="recent", limit=30, author_id=None):
        with closing(self._connect()) as connection:
            friends = self._mutual_follow_ids(connection, viewer_id)
            friend_params = list(friends) or [-1]
            placeholders = ",".join("?" for _ in friend_params)
            # 전체 공개 글 + (친구 공개 글 중 작성자가 맞팔이거나 본인인 것)만 보인다.
            visibility_clause = (
                f"(visibility = 'public' OR (visibility = 'friends' AND (user_id = ? OR user_id IN ({placeholders}))))"
            )
            params = [viewer_id, *friend_params]
            if scope == "friends":
                friend_scope = f"(user_id = ? OR user_id IN ({placeholders}))"
                visibility_clause += f" AND {friend_scope}"
                params += [viewer_id, *friend_params]
            elif scope == "mine":
                visibility_clause = "user_id = ?"
                params = [viewer_id]
            elif scope == "liked":
                visibility_clause += " AND id IN (SELECT post_id FROM post_likes WHERE user_id = ?)"
                params.append(viewer_id)
            if author_id is not None:
                visibility_clause += " AND user_id = ?"
                params.append(author_id)
            # 차단한(된) 사용자의 글 제외 + 신고 누적 게시물 자동 숨김(내 글은 scope=mine에서 보임)
            blocked = self._blocked_user_ids(connection, viewer_id)
            if blocked and scope != "mine":
                blocked_placeholders = ",".join("?" for _ in blocked)
                visibility_clause += f" AND user_id NOT IN ({blocked_placeholders})"
                params += list(blocked)
            visibility_clause += (
                " AND id NOT IN (SELECT target_id FROM reports WHERE target_type = 'post'"
                f" GROUP BY target_id HAVING COUNT(*) >= {self.POST_REPORT_HIDE_THRESHOLD})"
            )
            order = "like_count DESC, created_at DESC" if sort == "popular" else "created_at DESC"
            rows = connection.execute(
                f"SELECT * FROM community_posts WHERE {visibility_clause} ORDER BY {order} LIMIT ?",
                (*params, limit),
            ).fetchall()
            return [self._serialize(connection, row, viewer_id) for row in rows]

    # ------------------- 팔로우 관계 조회 -------------------

    def _mutual_connections(self, connection, viewer_id, other_id):
        """서로 아는 친구: 나(viewer)와 맞팔인 사람 중 상대(other)를 팔로우하는 사람들."""
        viewer_mutual = self._mutual_follow_ids(connection, viewer_id)
        other_followers = self._follower_ids(connection, other_id)
        blocked = self._blocked_user_ids(connection, viewer_id)
        common = (viewer_mutual & other_followers) - {viewer_id, other_id} - blocked
        names = []
        for uid in sorted(common)[:2]:
            brief = self._user_brief(connection, uid)
            if brief:
                names.append(brief["nickname"])
        return {"count": len(common), "names": names}

    def _user_brief(self, connection, user_id):
        row = connection.execute(
            "SELECT id, nickname, tripti_result FROM users WHERE id = ?", (user_id,)
        ).fetchone()
        if not row:
            return None
        tripti_result = self._decode_tripti_result(row["tripti_result"])
        return {
            "user_id": row["id"],
            "nickname": row["nickname"],
            "tripti": tripti_result.get("name") if tripti_result else None,
            "tripti_result": tripti_result,
            # 연인이 있으면 이름 옆 하트·프로필 표시용. 없으면 None.
            "partner": self._partner_brief(connection, row["id"]),
        }

    def _decode_tripti_result(self, value):
        if not value:
            return None
        try:
            result = json.loads(value)
        except (TypeError, ValueError):
            return None
        if not isinstance(result, dict):
            return None
        return {
            "code": result.get("code") or "",
            "name": result.get("name") or "",
            "desc": result.get("desc") or "",
            "scores": result.get("scores") or {},
        }

    def search_users(self, viewer_id, query, limit=20):
        query = (query or "").strip()
        if len(query) < 1:
            return []
        with closing(self._connect()) as connection:
            blocked = self._blocked_user_ids(connection, viewer_id)
            rows = connection.execute(
                "SELECT id FROM users WHERE nickname LIKE ? AND id != ? ORDER BY nickname LIMIT ?",
                (f"%{query}%", viewer_id, limit),
            ).fetchall()
            results = []
            for row in rows:
                if row["id"] in blocked:
                    continue
                brief = self._user_brief(connection, row["id"])
                if brief:
                    i_follow, follows_me = self._follow_state(connection, viewer_id, row["id"])
                    brief["i_follow"] = i_follow
                    brief["follows_me"] = follows_me
                    brief["mutual"] = i_follow and follows_me
                    results.append(brief)
            return results

    def _follow_list(self, connection, ids, viewer_id):
        """팔로워/팔로잉 목록용: 차단 제외, viewer 기준 팔로우 상태 포함."""
        blocked = self._blocked_user_ids(connection, viewer_id)
        users = []
        for uid in sorted(ids):
            if uid in blocked:
                continue
            brief = self._user_brief(connection, uid)
            if not brief:
                continue
            i_follow, follows_me = self._follow_state(connection, viewer_id, uid)
            brief["i_follow"] = i_follow
            brief["follows_me"] = follows_me
            brief["mutual"] = i_follow and follows_me
            brief["is_self"] = uid == viewer_id
            users.append(brief)
        return users

    def follow_user(self, follower_id, followee_id):
        """상대를 팔로우한다(일방향, 승인 불필요). 맞팔이 되면 채팅이 열린다."""
        if follower_id == followee_id:
            raise ValueError("자기 자신은 팔로우할 수 없어요.")
        with closing(self._connect()) as connection:
            if not connection.execute("SELECT 1 FROM users WHERE id = ?", (followee_id,)).fetchone():
                raise ValueError("사용자를 찾을 수 없습니다.")
            if followee_id in self._blocked_user_ids(connection, follower_id):
                raise ValueError("차단 관계인 사용자는 팔로우할 수 없어요.")
            inserted = connection.execute(
                "INSERT OR IGNORE INTO follows(follower_id, followee_id, created_at) VALUES (?, ?, ?)",
                (follower_id, followee_id, self._now()),
            ).rowcount
            if inserted:
                self._add_notification(connection, followee_id, follower_id, "follow")
            i_follow, follows_me = self._follow_state(connection, follower_id, followee_id)
            connection.commit()
            return {"i_follow": i_follow, "follows_me": follows_me, "mutual": i_follow and follows_me}

    def unfollow_user(self, follower_id, followee_id):
        """팔로우를 취소한다(내 일방향 팔로우만 삭제 — 상대의 팔로우는 유지)."""
        with closing(self._connect()) as connection:
            connection.execute(
                "DELETE FROM follows WHERE follower_id = ? AND followee_id = ?",
                (follower_id, followee_id),
            )
            # 아직 안 읽은 팔로우 알림은 거둬들인다.
            connection.execute(
                "DELETE FROM notifications WHERE user_id = ? AND actor_id = ? AND type = 'follow' AND read_at IS NULL",
                (followee_id, follower_id),
            )
            i_follow, follows_me = self._follow_state(connection, follower_id, followee_id)
            connection.commit()
            return {"i_follow": i_follow, "follows_me": follows_me, "mutual": i_follow and follows_me}

    def list_following(self, viewer_id, target_id=None):
        """target_id(미지정 시 본인)가 팔로우하는 사용자 목록."""
        with closing(self._connect()) as connection:
            ids = self._following_ids(connection, target_id or viewer_id)
            return self._follow_list(connection, ids, viewer_id)

    def list_followers(self, viewer_id, target_id=None):
        """target_id(미지정 시 본인)를 팔로우하는 사용자 목록."""
        with closing(self._connect()) as connection:
            ids = self._follower_ids(connection, target_id or viewer_id)
            return self._follow_list(connection, ids, viewer_id)

    def recommend_friends(self, viewer_id, limit=10):
        """추천 친구 = '내 친구의 친구'(내가 팔로우하는 사람들이 팔로우하는 사람).
        이미 팔로우 중·본인·차단 관계는 제외하고, 공통으로 팔로우하는 친구가 많은 순으로 돌려준다.
        """
        with closing(self._connect()) as connection:
            my_following = self._following_ids(connection, viewer_id)
            blocked = self._blocked_user_ids(connection, viewer_id)
            via_friends = {}  # 후보 id -> [그 후보를 팔로우하는 내 친구 id...]
            for friend_id in my_following:
                for candidate_id in self._following_ids(connection, friend_id):
                    if candidate_id == viewer_id or candidate_id in my_following or candidate_id in blocked:
                        continue
                    via_friends.setdefault(candidate_id, []).append(friend_id)
            # 공통 친구 많은 순 → 동률이면 id 순
            ordered = sorted(via_friends.items(), key=lambda item: (-len(item[1]), item[0]))
            results = []
            for candidate_id, friend_ids in ordered:
                if len(results) >= limit:
                    break
                # 후보가 나를 차단했으면 제외
                if viewer_id in self._blocked_user_ids(connection, candidate_id):
                    continue
                brief = self._user_brief(connection, candidate_id)
                if not brief:
                    continue
                i_follow, follows_me = self._follow_state(connection, viewer_id, candidate_id)
                brief["i_follow"] = i_follow
                brief["follows_me"] = follows_me
                brief["mutual"] = i_follow and follows_me
                brief["is_self"] = False
                via_names = []
                for fid in friend_ids[:2]:
                    via_brief = self._user_brief(connection, fid)
                    if via_brief:
                        via_names.append(via_brief["nickname"])
                brief["recommend_count"] = len(friend_ids)
                brief["recommend_via"] = via_names
                results.append(brief)
            return results

    def get_user_profile(self, viewer_id, user_id):
        with closing(self._connect()) as connection:
            brief = self._user_brief(connection, user_id)
            if not brief:
                raise ValueError("사용자를 찾을 수 없습니다.")
            stats = {
                "post_count": connection.execute(
                    "SELECT COUNT(*) AS c FROM community_posts WHERE user_id = ?", (user_id,)
                ).fetchone()["c"],
                "follower_count": len(self._follower_ids(connection, user_id)),
                "following_count": len(self._following_ids(connection, user_id)),
                "received_like_count": connection.execute(
                    "SELECT COALESCE(SUM(like_count), 0) AS c FROM community_posts WHERE user_id = ?", (user_id,)
                ).fetchone()["c"],
            }
            is_self = viewer_id == user_id
            if is_self:
                i_follow = follows_me = False
                mutual_connections = {"count": 0, "names": []}
            else:
                i_follow, follows_me = self._follow_state(connection, viewer_id, user_id)
                mutual_connections = self._mutual_connections(connection, viewer_id, user_id)
            blocked_by_me = bool(
                connection.execute(
                    "SELECT 1 FROM user_blocks WHERE blocker_id = ? AND blocked_id = ?", (viewer_id, user_id)
                ).fetchone()
            )
        posts = self.list_posts(viewer_id, scope="all", sort="recent", limit=20, author_id=user_id)
        with closing(self._connect()) as connection:
            couple_state = "none" if is_self else self._couple_state(connection, viewer_id, user_id)
        return {
            **brief,
            "stats": stats,
            "is_self": is_self,
            "i_follow": i_follow,
            "follows_me": follows_me,
            "mutual": i_follow and follows_me,
            "mutual_connections": mutual_connections,
            "blocked_by_me": blocked_by_me,
            "couple_state": couple_state,  # none | partners | request_sent | request_received
            "posts": posts,
        }

    # ------------------- 연인(커플) 맺기 -------------------
    # 한 사람당 연인은 한 명만(accepted), 맞팔로우한 친구끼리만 요청 가능.
    # 요청(pending) → 상대 수락(accepted). 헤어지면 행 삭제.

    def _partner_brief(self, connection, user_id):
        """user_id의 현재 연인(accepted) 정보. 없으면 None."""
        row = connection.execute(
            """
            SELECT CASE WHEN requester_id = ? THEN addressee_id ELSE requester_id END AS partner_id,
                   anniversary_date
            FROM couples
            WHERE status = 'accepted' AND (requester_id = ? OR addressee_id = ?)
            LIMIT 1
            """,
            (user_id, user_id, user_id),
        ).fetchone()
        if not row:
            return None
        partner = connection.execute(
            "SELECT id, nickname FROM users WHERE id = ?", (row["partner_id"],)
        ).fetchone()
        if not partner:
            return None
        return {
            "user_id": partner["id"],
            "nickname": partner["nickname"],
            "anniversary_date": row["anniversary_date"],
        }

    def _accepted_couple_row(self, connection, user_id):
        return connection.execute(
            "SELECT * FROM couples WHERE status = 'accepted' AND (requester_id = ? OR addressee_id = ?) LIMIT 1",
            (user_id, user_id),
        ).fetchone()

    def _couple_state(self, connection, viewer_id, other_id):
        """뷰어와 상대 사이의 커플 관계 상태."""
        row = connection.execute(
            """
            SELECT requester_id, addressee_id, status FROM couples
            WHERE (requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?)
            ORDER BY id DESC LIMIT 1
            """,
            (viewer_id, other_id, other_id, viewer_id),
        ).fetchone()
        if not row:
            return "none"
        if row["status"] == "accepted":
            return "partners"
        # pending
        return "request_sent" if row["requester_id"] == viewer_id else "request_received"

    def _days_together(self, anniversary_date):
        if not anniversary_date:
            return None
        try:
            start = datetime.strptime(anniversary_date, "%Y-%m-%d").date()
        except ValueError:
            return None
        today = datetime.now(timezone.utc).date()
        # 만난 날을 1일째로 센다(커플 앱 관례).
        return (today - start).days + 1

    def request_couple(self, requester_id, addressee_id):
        if requester_id == addressee_id:
            raise ValueError("자기 자신과는 연인을 맺을 수 없어요.")
        with closing(self._connect()) as connection:
            if not connection.execute("SELECT 1 FROM users WHERE id = ?", (addressee_id,)).fetchone():
                raise ValueError("사용자를 찾을 수 없습니다.")
            # 맞팔로우 친구끼리만
            i_follow, follows_me = self._follow_state(connection, requester_id, addressee_id)
            if not (i_follow and follows_me):
                raise PermissionError("맞팔로우(서로 팔로우)한 친구와만 연인을 맺을 수 있어요.")
            if addressee_id in self._blocked_user_ids(connection, requester_id):
                raise ValueError("차단 관계인 사용자와는 연인을 맺을 수 없어요.")
            if self._accepted_couple_row(connection, requester_id):
                raise ValueError("이미 연인이 있어요. 먼저 헤어진 뒤 신청해 주세요.")
            if self._accepted_couple_row(connection, addressee_id):
                raise ValueError("상대방이 이미 연인이 있어요.")
            # 상대가 나에게 보낸 대기 요청이 있으면 바로 수락(맞신청)
            incoming = connection.execute(
                "SELECT id FROM couples WHERE requester_id = ? AND addressee_id = ? AND status = 'pending'",
                (addressee_id, requester_id),
            ).fetchone()
            if incoming:
                return self._accept_couple_row(connection, incoming["id"], requester_id)
            # 내가 이미 보낸 대기 요청이 있으면 그대로
            existing = connection.execute(
                "SELECT id FROM couples WHERE requester_id = ? AND addressee_id = ? AND status = 'pending'",
                (requester_id, addressee_id),
            ).fetchone()
            if not existing:
                connection.execute(
                    "INSERT INTO couples(requester_id, addressee_id, status, created_at) VALUES (?, ?, 'pending', ?)",
                    (requester_id, addressee_id, self._now()),
                )
                self._add_notification(connection, addressee_id, requester_id, "couple_request")
                connection.commit()
            return {"couple_state": "request_sent"}

    def _accept_couple_row(self, connection, couple_id, accepter_id):
        row = connection.execute("SELECT * FROM couples WHERE id = ?", (couple_id,)).fetchone()
        if not row:
            raise ValueError("연인 요청을 찾을 수 없어요.")
        # 수락 직전에 둘 중 한 명이라도 이미 커플이면 막는다.
        if self._accepted_couple_row(connection, row["requester_id"]) or self._accepted_couple_row(
            connection, row["addressee_id"]
        ):
            raise ValueError("둘 중 한 명이 이미 연인이 있어요.")
        connection.execute(
            "UPDATE couples SET status = 'accepted', accepted_at = ? WHERE id = ?", (self._now(), couple_id)
        )
        # 두 사람과 얽힌 다른 대기 요청은 모두 정리
        for uid in (row["requester_id"], row["addressee_id"]):
            connection.execute(
                "DELETE FROM couples WHERE status = 'pending' AND (requester_id = ? OR addressee_id = ?) AND id != ?",
                (uid, uid, couple_id),
            )
        # 신청자에게 수락 알림(수락한 사람이 accepter)
        other = row["requester_id"] if accepter_id == row["addressee_id"] else row["addressee_id"]
        self._add_notification(connection, other, accepter_id, "couple_accept")
        connection.commit()
        return {"couple_state": "partners"}

    def respond_couple(self, user_id, requester_id, accept):
        with closing(self._connect()) as connection:
            row = connection.execute(
                "SELECT id FROM couples WHERE requester_id = ? AND addressee_id = ? AND status = 'pending'",
                (requester_id, user_id),
            ).fetchone()
            if not row:
                raise ValueError("받은 연인 요청이 없어요.")
            if accept:
                return self._accept_couple_row(connection, row["id"], user_id)
            connection.execute("DELETE FROM couples WHERE id = ?", (row["id"],))
            connection.commit()
            return {"couple_state": "none"}

    def cancel_couple_request(self, requester_id, addressee_id):
        with closing(self._connect()) as connection:
            connection.execute(
                "DELETE FROM couples WHERE requester_id = ? AND addressee_id = ? AND status = 'pending'",
                (requester_id, addressee_id),
            )
            connection.execute(
                "DELETE FROM notifications WHERE user_id = ? AND actor_id = ? AND type = 'couple_request' AND read_at IS NULL",
                (addressee_id, requester_id),
            )
            connection.commit()
            return {"couple_state": "none"}

    def breakup_couple(self, user_id):
        with closing(self._connect()) as connection:
            row = self._accepted_couple_row(connection, user_id)
            if not row:
                raise ValueError("연인이 없어요.")
            partner_id = row["addressee_id"] if row["requester_id"] == user_id else row["requester_id"]
            connection.execute("DELETE FROM couples WHERE id = ?", (row["id"],))
            self._add_notification(connection, partner_id, user_id, "couple_breakup")
            connection.commit()
            return {"couple_state": "none"}

    def set_anniversary(self, user_id, anniversary_date):
        anniversary_date = (anniversary_date or "").strip()
        if anniversary_date:
            try:
                datetime.strptime(anniversary_date, "%Y-%m-%d")
            except ValueError as exc:
                raise ValueError("기념일 형식이 올바르지 않아요.") from exc
        with closing(self._connect()) as connection:
            row = self._accepted_couple_row(connection, user_id)
            if not row:
                raise ValueError("연인이 없어요.")
            connection.execute(
                "UPDATE couples SET anniversary_date = ? WHERE id = ?", (anniversary_date or None, row["id"])
            )
            connection.commit()
            return self.couple_status(user_id)

    def couple_status(self, user_id):
        """내 커플 상태: 연인 정보 + 기념일 + 만난 일수 + 받은 연인 요청 목록."""
        with closing(self._connect()) as connection:
            partner = self._partner_brief(connection, user_id)
            incoming_rows = connection.execute(
                "SELECT requester_id FROM couples WHERE addressee_id = ? AND status = 'pending' ORDER BY id DESC",
                (user_id,),
            ).fetchall()
            blocked = self._blocked_user_ids(connection, user_id)
            incoming = []
            for r in incoming_rows:
                if r["requester_id"] in blocked:
                    continue
                brief = self._user_brief(connection, r["requester_id"])
                if brief:
                    incoming.append({"user_id": brief["user_id"], "nickname": brief["nickname"]})
            anniversary = partner["anniversary_date"] if partner else None
            return {
                "partner": {"user_id": partner["user_id"], "nickname": partner["nickname"]} if partner else None,
                "anniversary_date": anniversary,
                "days_together": self._days_together(anniversary),
                "incoming_requests": incoming,
            }

    # ------------------- 댓글 (Phase 4) -------------------

    MAX_COMMENT_LENGTH = 300

    def add_comment(self, post_id, user_id, content):
        content = (content or "").strip()[: self.MAX_COMMENT_LENGTH]
        if not content:
            raise ValueError("댓글 내용을 입력해 주세요.")
        with closing(self._connect()) as connection:
            post = connection.execute("SELECT user_id FROM community_posts WHERE id = ?", (post_id,)).fetchone()
            if not post:
                raise ValueError("게시물을 찾을 수 없습니다.")
            cursor = connection.execute(
                "INSERT INTO post_comments(post_id, user_id, content, created_at) VALUES (?, ?, ?, ?)",
                (post_id, user_id, content, self._now()),
            )
            self._add_notification(connection, post["user_id"], user_id, "comment", post_id)
            connection.commit()
            row = connection.execute("SELECT * FROM post_comments WHERE id = ?", (cursor.lastrowid,)).fetchone()
            return self._serialize_comment(connection, row, user_id)

    def list_comments(self, post_id, viewer_id):
        with closing(self._connect()) as connection:
            blocked = self._blocked_user_ids(connection, viewer_id)
            rows = connection.execute(
                "SELECT * FROM post_comments WHERE post_id = ? ORDER BY id ASC LIMIT 100", (post_id,)
            ).fetchall()
            return [
                self._serialize_comment(connection, row, viewer_id)
                for row in rows
                if row["user_id"] not in blocked
            ]

    def delete_comment(self, comment_id, user_id):
        """댓글 작성자 본인 또는 게시물 작성자가 지울 수 있다."""
        with closing(self._connect()) as connection:
            row = connection.execute("SELECT * FROM post_comments WHERE id = ?", (comment_id,)).fetchone()
            if not row:
                raise ValueError("댓글을 찾을 수 없습니다.")
            post = connection.execute(
                "SELECT user_id FROM community_posts WHERE id = ?", (row["post_id"],)
            ).fetchone()
            if row["user_id"] != user_id and (not post or post["user_id"] != user_id):
                raise PermissionError("내 댓글이나 내 게시물의 댓글만 삭제할 수 있습니다.")
            connection.execute("DELETE FROM post_comments WHERE id = ?", (comment_id,))
            connection.commit()
            return {"deleted": True}

    def _serialize_comment(self, connection, row, viewer_id):
        author = self._user_brief(connection, row["user_id"]) or {"nickname": "탈퇴한 사용자", "tripti": None}
        post = connection.execute(
            "SELECT user_id FROM community_posts WHERE id = ?", (row["post_id"],)
        ).fetchone()
        return {
            "id": row["id"],
            "post_id": row["post_id"],
            "author_id": row["user_id"],
            "author_nickname": author["nickname"],
            "content": row["content"],
            "is_mine": row["user_id"] == viewer_id,
            "can_delete": row["user_id"] == viewer_id or bool(post and post["user_id"] == viewer_id),
            "created_at": row["created_at"],
        }

    # ------------------- 신고 (Phase 4) -------------------

    REPORT_REASONS = ("스팸·홍보", "욕설·혐오", "음란물", "기타")

    def create_report(self, reporter_id, target_type, target_id, reason):
        if target_type not in ("post", "comment", "user"):
            raise ValueError("신고 대상이 올바르지 않습니다.")
        reason = (reason or "").strip()[:100] or "기타"
        with closing(self._connect()) as connection:
            if target_type == "post":
                target = connection.execute(
                    "SELECT user_id FROM community_posts WHERE id = ?", (target_id,)
                ).fetchone()
            elif target_type == "comment":
                target = connection.execute(
                    "SELECT user_id FROM post_comments WHERE id = ?", (target_id,)
                ).fetchone()
            else:
                target = connection.execute("SELECT id AS user_id FROM users WHERE id = ?", (target_id,)).fetchone()
            if not target:
                raise ValueError("신고 대상을 찾을 수 없습니다.")
            if target["user_id"] == reporter_id:
                raise ValueError("내 콘텐츠는 신고할 수 없어요.")
            inserted = connection.execute(
                "INSERT OR IGNORE INTO reports(reporter_id, target_type, target_id, reason, created_at) VALUES (?, ?, ?, ?, ?)",
                (reporter_id, target_type, target_id, reason, self._now()),
            ).rowcount
            connection.commit()
            if not inserted:
                raise ValueError("이미 신고한 콘텐츠예요.")
            return {"reported": True}

    # ------------------- 차단 (Phase 4) -------------------

    def block_user(self, blocker_id, blocked_id):
        if blocker_id == blocked_id:
            raise ValueError("자기 자신은 차단할 수 없어요.")
        with closing(self._connect()) as connection:
            if not connection.execute("SELECT 1 FROM users WHERE id = ?", (blocked_id,)).fetchone():
                raise ValueError("사용자를 찾을 수 없습니다.")
            connection.execute(
                "INSERT OR IGNORE INTO user_blocks(blocker_id, blocked_id, created_at) VALUES (?, ?, ?)",
                (blocker_id, blocked_id, self._now()),
            )
            # 차단하면 서로의 팔로우(양방향)도 함께 끊는다.
            connection.execute(
                """
                DELETE FROM follows
                WHERE (follower_id = ? AND followee_id = ?) OR (follower_id = ? AND followee_id = ?)
                """,
                (blocker_id, blocked_id, blocked_id, blocker_id),
            )
            connection.commit()
            return {"blocked": True}

    def unblock_user(self, blocker_id, blocked_id):
        with closing(self._connect()) as connection:
            deleted = connection.execute(
                "DELETE FROM user_blocks WHERE blocker_id = ? AND blocked_id = ?",
                (blocker_id, blocked_id),
            ).rowcount
            connection.commit()
            if not deleted:
                raise ValueError("차단한 사용자가 아닙니다.")
            return {"blocked": False}

    def list_blocked_users(self, user_id):
        """내가 차단한 사용자 목록(차단 해제 관리용)."""
        with closing(self._connect()) as connection:
            rows = connection.execute(
                "SELECT blocked_id FROM user_blocks WHERE blocker_id = ? ORDER BY created_at DESC",
                (user_id,),
            ).fetchall()
            blocked = []
            for row in rows:
                brief = self._user_brief(connection, row["blocked_id"])
                if brief:
                    blocked.append(brief)
            return blocked

    # ------------------- 알림 (좋아요·댓글·메시지·친구) -------------------

    def _add_notification(self, connection, user_id, actor_id, notif_type, post_id=None, preview=None):
        """활동 알림을 쌓는다. 본인 활동은 제외, 메시지는 읽지 않은 게 있으면 중복 생성하지 않는다.

        인앱 알림(notifications)을 남긴 뒤, 휴대폰 푸시도 best-effort로 보낸다.
        푸시 전송은 네트워크 호출이라 백그라운드 큐에 맡겨 요청/트랜잭션을 막지 않는다.
        """
        if user_id == actor_id:
            return
        if notif_type == "message":
            existing = connection.execute(
                "SELECT 1 FROM notifications WHERE user_id = ? AND actor_id = ? AND type = 'message' AND read_at IS NULL",
                (user_id, actor_id),
            ).fetchone()
            # 메시지 알림은 인앱 종(중복 방지)에만 한 번 쌓지만, 푸시는 매 메시지마다 보낸다.
            if not existing:
                connection.execute(
                    "INSERT INTO notifications(user_id, actor_id, type, post_id, created_at) VALUES (?, ?, ?, ?, ?)",
                    (user_id, actor_id, notif_type, post_id, self._now()),
                )
            self._enqueue_push(connection, user_id, actor_id, notif_type, post_id, preview)
            return
        connection.execute(
            "INSERT INTO notifications(user_id, actor_id, type, post_id, created_at) VALUES (?, ?, ?, ?, ?)",
            (user_id, actor_id, notif_type, post_id, self._now()),
        )
        self._enqueue_push(connection, user_id, actor_id, notif_type, post_id, preview)

    def _enqueue_push(self, connection, user_id, actor_id, notif_type, post_id, preview):
        """휴대폰 푸시 전송을 백그라운드 큐에 넣는다. 실패해도 알림 자체에는 영향 없음."""
        try:
            # 차단한 사이면 푸시도 보내지 않는다(인앱 목록과 동일 정책).
            blocked = self._blocked_user_ids(connection, user_id)
            if actor_id in blocked:
                return
            brief = self._user_brief(connection, actor_id)
            actor_nickname = brief["nickname"] if brief else "RecoDate"
            from . import push_service  # 지연 import (순환참조 방지)

            push_service.enqueue(
                user_id=user_id,
                actor_id=actor_id,
                actor_nickname=actor_nickname,
                notif_type=notif_type,
                post_id=post_id,
                preview=preview,
            )
        except Exception:
            # 푸시는 부가 기능이라 어떤 오류도 본 흐름을 막지 않는다.
            pass

    # ------------------- 푸시 구독 저장 (FCM / 웹푸시) -------------------

    def add_push_subscription(self, user_id, channel, endpoint, p256dh=None, auth=None, platform=""):
        """구독을 저장한다. 같은 endpoint가 다른 계정에 묶여 있었다면 이 계정으로 옮긴다."""
        if not endpoint:
            raise ValueError("구독 정보가 비어 있어요.")
        with closing(self._connect()) as connection:
            connection.execute(
                """
                INSERT INTO push_subscriptions(user_id, channel, endpoint, p256dh, auth, platform, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(channel, endpoint) DO UPDATE SET
                    user_id = excluded.user_id,
                    p256dh = excluded.p256dh,
                    auth = excluded.auth,
                    platform = excluded.platform
                """,
                (user_id, channel, endpoint, p256dh, auth, platform or "", self._now()),
            )
            connection.commit()
            return {"ok": True}

    def remove_push_subscription(self, user_id, endpoint):
        with closing(self._connect()) as connection:
            connection.execute(
                "DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?",
                (user_id, endpoint),
            )
            connection.commit()
            return {"ok": True}

    def list_push_subscriptions(self, user_id):
        with closing(self._connect()) as connection:
            rows = connection.execute(
                "SELECT channel, endpoint, p256dh, auth, platform FROM push_subscriptions WHERE user_id = ?",
                (user_id,),
            ).fetchall()
            return [dict(row) for row in rows]

    def delete_push_subscription_by_endpoint(self, endpoint):
        """죽은 구독(410/404/NotRegistered)을 정리할 때 사용."""
        with closing(self._connect()) as connection:
            connection.execute("DELETE FROM push_subscriptions WHERE endpoint = ?", (endpoint,))
            connection.commit()

    def list_notifications(self, user_id, limit=30):
        with closing(self._connect()) as connection:
            blocked = self._blocked_user_ids(connection, user_id)
            rows = connection.execute(
                "SELECT * FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT ?", (user_id, limit)
            ).fetchall()
            items = []
            for row in rows:
                if row["actor_id"] in blocked:
                    continue
                brief = self._user_brief(connection, row["actor_id"])
                items.append({
                    "id": row["id"],
                    "type": row["type"],
                    "actor_id": row["actor_id"],
                    "actor_nickname": brief["nickname"] if brief else "탈퇴한 사용자",
                    "post_id": row["post_id"],
                    "created_at": row["created_at"],
                    "read": row["read_at"] is not None,
                })
            return items

    def unread_notification_count(self, user_id):
        with closing(self._connect()) as connection:
            blocked = self._blocked_user_ids(connection, user_id)
            rows = connection.execute(
                "SELECT actor_id FROM notifications WHERE user_id = ? AND read_at IS NULL", (user_id,)
            ).fetchall()
            return sum(1 for row in rows if row["actor_id"] not in blocked)

    def mark_notifications_read(self, user_id):
        with closing(self._connect()) as connection:
            connection.execute(
                "UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL",
                (self._now(), user_id),
            )
            connection.commit()
            return {"ok": True}

    # ------------------- DM (Phase 3) -------------------
    # 채팅은 '수락된 친구' 사이에서만 가능하다. 폴링 방식이라 after_id로 증분 조회한다.

    MAX_CHAT_CONTENT = 500

    def _require_mutual_follow(self, connection, user_id, other_id):
        i_follow, follows_me = self._follow_state(connection, user_id, other_id)
        if not (i_follow and follows_me):
            raise PermissionError("서로 맞팔로우한 사이에서만 채팅할 수 있어요.")

    def _chat_preview_text(self, row):
        """답장 인용에 쓸 원본 메시지 한 줄 요약."""
        content = (row["content"] or "").strip()
        if content:
            return content[:60]
        if row["course_json"]:
            return "코스 공유"
        if "images" in row.keys() and row["images"] and row["images"] != "[]":
            return "사진"
        return ""

    def _serialize_message(self, connection, row, viewer_id):
        course = None
        if row["course_json"]:
            try:
                course = json.loads(row["course_json"])
            except ValueError:
                course = None
        try:
            images = json.loads(row["images"]) if "images" in row.keys() else []
        except (ValueError, TypeError):
            images = []
        reply = None
        reply_to_id = row["reply_to_id"] if "reply_to_id" in row.keys() else None
        if reply_to_id:
            original = connection.execute(
                """
                SELECT cm.content, cm.course_json, cm.images, u.nickname
                FROM chat_messages cm LEFT JOIN users u ON u.id = cm.sender_id
                WHERE cm.id = ?
                """,
                (reply_to_id,),
            ).fetchone()
            if original:
                reply = {
                    "id": reply_to_id,
                    "sender_nickname": original["nickname"] or "탈퇴한 사용자",
                    "preview": self._chat_preview_text(original),
                }
        return {
            "id": row["id"],
            "sender_id": row["sender_id"],
            "receiver_id": row["receiver_id"],
            "content": row["content"],
            "course": course,
            "images": images,
            "reply": reply,
            "is_mine": row["sender_id"] == viewer_id,
            "read": row["read_at"] is not None,
            "created_at": row["created_at"],
        }

    def send_chat_message(self, sender_id, receiver_id, content, course=None, image_filenames=None, reply_to_id=None):
        content = (content or "").strip()[: self.MAX_CHAT_CONTENT]
        has_course = isinstance(course, dict) and course.get("places")
        if not content and not has_course and not image_filenames:
            raise ValueError("메시지 내용을 입력해 주세요.")
        with closing(self._connect()) as connection:
            if not connection.execute("SELECT 1 FROM users WHERE id = ?", (receiver_id,)).fetchone():
                raise ValueError("사용자를 찾을 수 없습니다.")
            self._require_mutual_follow(connection,sender_id, receiver_id)
            # 답장 대상은 이 대화에 속한 메시지일 때만 인정한다.
            valid_reply_id = None
            if reply_to_id:
                valid_reply_id = connection.execute(
                    """
                    SELECT id FROM chat_messages
                    WHERE id = ? AND ((sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?))
                    """,
                    (reply_to_id, sender_id, receiver_id, receiver_id, sender_id),
                ).fetchone()
                valid_reply_id = valid_reply_id["id"] if valid_reply_id else None
            cursor = connection.execute(
                """
                INSERT INTO chat_messages(sender_id, receiver_id, content, course_json, created_at, images, reply_to_id)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    sender_id,
                    receiver_id,
                    content,
                    json.dumps(course, ensure_ascii=False) if has_course else "",
                    self._now(),
                    json.dumps(image_filenames or []),
                    valid_reply_id,
                ),
            )
            # 채팅 푸시에 본문 미리보기를 함께 보낸다(사진/코스만 보낸 경우 대체 문구).
            if content and content.strip():
                message_preview = content.strip()[:80]
            elif image_filenames:
                message_preview = "📷 사진"
            elif has_course:
                message_preview = "📍 코스를 공유했어요"
            else:
                message_preview = ""
            self._add_notification(connection, receiver_id, sender_id, "message", preview=message_preview)
            connection.commit()
            row = connection.execute("SELECT * FROM chat_messages WHERE id = ?", (cursor.lastrowid,)).fetchone()
            return self._serialize_message(connection, row, sender_id)

    def list_chat_messages(self, user_id, friend_id, after_id=0, limit=100):
        """두 사람 사이 메시지를 오래된 순으로 돌려주고, 내가 받은 메시지는 읽음 처리한다."""
        with closing(self._connect()) as connection:
            self._require_mutual_follow(connection,user_id, friend_id)
            rows = connection.execute(
                """
                SELECT * FROM chat_messages
                WHERE id > ?
                  AND ((sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?))
                ORDER BY id ASC LIMIT ?
                """,
                (after_id, user_id, friend_id, friend_id, user_id, limit),
            ).fetchall()
            connection.execute(
                "UPDATE chat_messages SET read_at = ? WHERE sender_id = ? AND receiver_id = ? AND read_at IS NULL",
                (self._now(), friend_id, user_id),
            )
            connection.commit()
            # 읽음 표시용: 내가 보낸 메시지 중 상대가 읽은 가장 최신 id
            # (이미 화면에 그려진 말풍선의 하트를 폴링으로 지우기 위해 필요)
            peer_last_read = connection.execute(
                "SELECT MAX(id) AS m FROM chat_messages WHERE sender_id = ? AND receiver_id = ? AND read_at IS NOT NULL",
                (user_id, friend_id),
            ).fetchone()["m"]
            return {
                "messages": [self._serialize_message(connection, row, user_id) for row in rows],
                "peer_last_read_id": peer_last_read or 0,
            }

    def chat_unread_summary(self, user_id):
        """안읽음 배지용: 전체 개수 + 보낸 사람별 개수. 차단한(된) 상대는 제외."""
        with closing(self._connect()) as connection:
            blocked = self._blocked_user_ids(connection, user_id)
            rows = connection.execute(
                """
                SELECT sender_id, COUNT(*) AS c FROM chat_messages
                WHERE receiver_id = ? AND read_at IS NULL
                GROUP BY sender_id
                """,
                (user_id,),
            ).fetchall()
            by_user = {str(row["sender_id"]): row["c"] for row in rows if row["sender_id"] not in blocked}
            return {"total": sum(by_user.values()), "by_user": by_user}

    # ------------------- 단체 채팅방 -------------------
    # 1:1 채팅(chat_messages)은 그대로 두고, 여러 명이 참여하는 방을 별도 시스템으로 둔다.
    # 채팅 목록 화면은 1:1 대화와 방을 시간순으로 합쳐 보여준다.

    def _require_room_member(self, connection, room_id, user_id):
        if not connection.execute(
            "SELECT 1 FROM chat_room_members WHERE room_id = ? AND user_id = ?", (room_id, user_id)
        ).fetchone():
            raise PermissionError("참여 중인 채팅방이 아니에요.")

    def _room_member_briefs(self, connection, room_id):
        rows = connection.execute(
            "SELECT user_id FROM chat_room_members WHERE room_id = ? ORDER BY joined_at, user_id", (room_id,)
        ).fetchall()
        briefs = []
        for row in rows:
            brief = self._user_brief(connection, row["user_id"])
            briefs.append({
                "user_id": row["user_id"],
                "nickname": brief["nickname"] if brief else "탈퇴한 사용자",
            })
        return briefs

    def _auto_room_name(self, member_briefs, viewer_id):
        """방 이름을 안 정했을 때, 나를 뺀 참여자 닉네임으로 자동 생성."""
        others = [m["nickname"] for m in member_briefs if m["user_id"] != viewer_id]
        if not others:
            return "단체 채팅방"
        if len(others) <= 3:
            return ", ".join(others)
        return ", ".join(others[:3]) + f" 외 {len(others) - 3}명"

    def _room_message_preview(self, row):
        content = (row["content"] or "").strip()
        if content:
            return content[:40]
        if row["course_json"]:
            return "📍 코스"
        if "images" in row.keys() and row["images"] and row["images"] != "[]":
            return "📷 사진"
        return ""

    def _serialize_room(self, connection, room_id, viewer_id):
        room = connection.execute("SELECT * FROM chat_rooms WHERE id = ?", (room_id,)).fetchone()
        if not room:
            return None
        members = self._room_member_briefs(connection, room_id)
        last = connection.execute(
            "SELECT * FROM chat_room_messages WHERE room_id = ? ORDER BY id DESC LIMIT 1", (room_id,)
        ).fetchone()
        my = connection.execute(
            "SELECT last_read_message_id FROM chat_room_members WHERE room_id = ? AND user_id = ?",
            (room_id, viewer_id),
        ).fetchone()
        last_read = my["last_read_message_id"] if my else 0
        unread = connection.execute(
            "SELECT COUNT(*) AS c FROM chat_room_messages WHERE room_id = ? AND id > ? AND sender_id != ?",
            (room_id, last_read, viewer_id),
        ).fetchone()["c"]
        return {
            "type": "room",
            "room_id": room_id,
            "name": room["name"] or self._auto_room_name(members, viewer_id),
            "custom_name": room["name"] or "",
            "creator_id": room["creator_id"],
            "members": members,
            "member_count": len(members),
            "last_message": self._room_message_preview(last) if last else "",
            "last_message_at": last["created_at"] if last else room["created_at"],
            "unread_count": unread,
        }

    def create_chat_room(self, creator_id, member_ids, name=""):
        """맞팔로우한 친구 2명 이상으로 방을 만든다. name이 비면 참여자 이름으로 자동."""
        member_ids = [int(m) for m in (member_ids or []) if int(m) != creator_id]
        member_ids = list(dict.fromkeys(member_ids))  # 중복 제거, 순서 유지
        if len(member_ids) < 2:
            raise ValueError("단체 채팅방은 친구를 2명 이상 선택해야 해요.")
        name = (name or "").strip()[:40]
        with closing(self._connect()) as connection:
            mutual = self._mutual_follow_ids(connection, creator_id)
            for member_id in member_ids:
                if member_id not in mutual:
                    raise PermissionError("맞팔로우한 친구만 초대할 수 있어요.")
            now = self._now()
            cursor = connection.execute(
                "INSERT INTO chat_rooms(name, creator_id, created_at) VALUES (?, ?, ?)",
                (name, creator_id, now),
            )
            room_id = cursor.lastrowid
            for user_id in [creator_id] + member_ids:
                connection.execute(
                    "INSERT INTO chat_room_members(room_id, user_id, joined_at, last_read_message_id) VALUES (?, ?, ?, 0)",
                    (room_id, user_id, now),
                )
            connection.commit()
            return self._serialize_room(connection, room_id, creator_id)

    def rename_chat_room(self, user_id, room_id, name):
        with closing(self._connect()) as connection:
            self._require_room_member(connection, room_id, user_id)
            connection.execute(
                "UPDATE chat_rooms SET name = ? WHERE id = ?", ((name or "").strip()[:40], room_id)
            )
            connection.commit()
            return self._serialize_room(connection, room_id, user_id)

    def list_chat_rooms(self, user_id):
        with closing(self._connect()) as connection:
            rows = connection.execute(
                "SELECT room_id FROM chat_room_members WHERE user_id = ?", (user_id,)
            ).fetchall()
            rooms = [self._serialize_room(connection, row["room_id"], user_id) for row in rows]
            rooms = [room for room in rooms if room]
            rooms.sort(key=lambda room: room["last_message_at"], reverse=True)
            return rooms

    def list_one_to_one_conversations(self, user_id):
        """1:1 대화 목록(상대별 마지막 메시지·안읽음). 차단한(된) 상대는 제외."""
        with closing(self._connect()) as connection:
            blocked = self._blocked_user_ids(connection, user_id)
            rows = connection.execute(
                "SELECT * FROM chat_messages WHERE sender_id = ? OR receiver_id = ? ORDER BY id DESC",
                (user_id, user_id),
            ).fetchall()
            seen = {}
            for row in rows:
                partner = row["receiver_id"] if row["sender_id"] == user_id else row["sender_id"]
                if partner == user_id or partner in blocked:
                    continue
                if partner not in seen:
                    seen[partner] = {"last": row, "unread": 0}
                if row["receiver_id"] == user_id and row["read_at"] is None:
                    seen[partner]["unread"] += 1
            conversations = []
            for partner, data in seen.items():
                brief = self._user_brief(connection, partner)
                if not brief:
                    continue
                last = data["last"]
                conversations.append({
                    "type": "direct",
                    "partner_id": partner,
                    "name": brief["nickname"],
                    "last_message": self._room_message_preview(last),
                    "last_message_at": last["created_at"],
                    "unread_count": data["unread"],
                })
            return conversations

    def list_chats(self, user_id):
        """채팅 탭 통합 목록: 1:1 대화 + 단체방을 최근 메시지순으로 합친다."""
        merged = self.list_one_to_one_conversations(user_id) + self.list_chat_rooms(user_id)
        merged.sort(key=lambda chat: chat["last_message_at"], reverse=True)
        return merged

    def _serialize_room_message(self, connection, row, viewer_id):
        course = None
        if row["course_json"]:
            try:
                course = json.loads(row["course_json"])
            except ValueError:
                course = None
        try:
            images = json.loads(row["images"]) if "images" in row.keys() else []
        except (ValueError, TypeError):
            images = []
        reply = None
        reply_to_id = row["reply_to_id"] if "reply_to_id" in row.keys() else None
        if reply_to_id:
            original = connection.execute(
                """
                SELECT cm.content, cm.course_json, cm.images, u.nickname
                FROM chat_room_messages cm LEFT JOIN users u ON u.id = cm.sender_id
                WHERE cm.id = ?
                """,
                (reply_to_id,),
            ).fetchone()
            if original:
                reply = {
                    "id": reply_to_id,
                    "sender_nickname": original["nickname"] or "탈퇴한 사용자",
                    "preview": self._chat_preview_text(original),
                }
        brief = self._user_brief(connection, row["sender_id"])
        return {
            "id": row["id"],
            "room_id": row["room_id"],
            "sender_id": row["sender_id"],
            "sender_nickname": brief["nickname"] if brief else "탈퇴한 사용자",
            "content": row["content"],
            "course": course,
            "images": images,
            "reply": reply,
            "is_mine": row["sender_id"] == viewer_id,
            "created_at": row["created_at"],
        }

    def send_room_message(self, sender_id, room_id, content, course=None, image_filenames=None, reply_to_id=None):
        content = (content or "").strip()[: self.MAX_CHAT_CONTENT]
        has_course = isinstance(course, dict) and course.get("places")
        if not content and not has_course and not image_filenames:
            raise ValueError("메시지 내용을 입력해 주세요.")
        with closing(self._connect()) as connection:
            self._require_room_member(connection, room_id, sender_id)
            valid_reply_id = None
            if reply_to_id:
                found = connection.execute(
                    "SELECT id FROM chat_room_messages WHERE id = ? AND room_id = ?", (reply_to_id, room_id)
                ).fetchone()
                valid_reply_id = found["id"] if found else None
            cursor = connection.execute(
                """
                INSERT INTO chat_room_messages(room_id, sender_id, content, course_json, created_at, images, reply_to_id)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    room_id,
                    sender_id,
                    content,
                    json.dumps(course, ensure_ascii=False) if has_course else "",
                    self._now(),
                    json.dumps(image_filenames or []),
                    valid_reply_id,
                ),
            )
            message_id = cursor.lastrowid
            # 보낸 사람은 자기 메시지까지 읽은 것으로 처리
            connection.execute(
                "UPDATE chat_room_members SET last_read_message_id = ? WHERE room_id = ? AND user_id = ?",
                (message_id, room_id, sender_id),
            )
            # 나를 뺀 멤버 전원에게 푸시("[방이름] 발신자: 내용")
            room = connection.execute("SELECT name FROM chat_rooms WHERE id = ?", (room_id,)).fetchone()
            members = self._room_member_briefs(connection, room_id)
            room_name = (room["name"] if room else "") or self._auto_room_name(members, sender_id)
            sender_brief = self._user_brief(connection, sender_id)
            sender_nickname = sender_brief["nickname"] if sender_brief else "RecoDate"
            if content:
                body_preview = content[:80]
            elif image_filenames:
                body_preview = "📷 사진"
            elif has_course:
                body_preview = "📍 코스를 공유했어요"
            else:
                body_preview = ""
            connection.commit()
            self._enqueue_room_push(room_id, room_name, sender_id, sender_nickname, body_preview, members)
            row = connection.execute("SELECT * FROM chat_room_messages WHERE id = ?", (message_id,)).fetchone()
            return self._serialize_room_message(connection, row, sender_id)

    def _enqueue_room_push(self, room_id, room_name, sender_id, sender_nickname, body_preview, members):
        """방 멤버(나 제외)에게 단체채팅 푸시를 보낸다. 실패해도 본 흐름 영향 없음."""
        try:
            from . import push_service

            for member in members:
                if member["user_id"] == sender_id:
                    continue
                push_service.enqueue_room(
                    user_id=member["user_id"],
                    room_id=room_id,
                    room_name=room_name,
                    sender_nickname=sender_nickname,
                    preview=body_preview,
                )
        except Exception:
            pass

    def list_room_messages(self, user_id, room_id, after_id=0, limit=100):
        with closing(self._connect()) as connection:
            self._require_room_member(connection, room_id, user_id)
            rows = connection.execute(
                "SELECT * FROM chat_room_messages WHERE room_id = ? AND id > ? ORDER BY id ASC LIMIT ?",
                (room_id, after_id, limit),
            ).fetchall()
            messages = [self._serialize_room_message(connection, row, user_id) for row in rows]
            # 내가 읽은 가장 최신 메시지 id 갱신(안읽음 배지 정리)
            latest = connection.execute(
                "SELECT MAX(id) AS m FROM chat_room_messages WHERE room_id = ?", (room_id,)
            ).fetchone()["m"]
            if latest:
                connection.execute(
                    "UPDATE chat_room_members SET last_read_message_id = ? WHERE room_id = ? AND user_id = ? AND last_read_message_id < ?",
                    (latest, room_id, user_id, latest),
                )
                connection.commit()
            room = self._serialize_room(connection, room_id, user_id)
            return {"messages": messages, "room": room}

    def total_chat_unread(self, user_id):
        """채팅 하단탭 배지용: 1:1 안읽음 + 방 안읽음 합계."""
        direct = self.chat_unread_summary(user_id)["total"]
        rooms = sum(room["unread_count"] for room in self.list_chat_rooms(user_id))
        return {"total": direct + rooms}

    def my_stats(self, user_id):
        with closing(self._connect()) as connection:
            post_count = connection.execute(
                "SELECT COUNT(*) AS c FROM community_posts WHERE user_id = ?", (user_id,)
            ).fetchone()["c"]
            received_likes = connection.execute(
                "SELECT COALESCE(SUM(like_count), 0) AS c FROM community_posts WHERE user_id = ?", (user_id,)
            ).fetchone()["c"]
            follower_count = len(self._follower_ids(connection, user_id))
            following_count = len(self._following_ids(connection, user_id))
            liked_count = connection.execute(
                "SELECT COUNT(*) AS c FROM post_likes WHERE user_id = ?", (user_id,)
            ).fetchone()["c"]
            return {
                "post_count": post_count,
                "received_like_count": received_likes,
                "follower_count": follower_count,
                "following_count": following_count,
                "liked_post_count": liked_count,
            }

    def toggle_like(self, post_id, user_id):
        with closing(self._connect()) as connection:
            post = connection.execute("SELECT id, user_id FROM community_posts WHERE id = ?", (post_id,)).fetchone()
            if not post:
                raise ValueError("게시물을 찾을 수 없습니다.")
            existing = connection.execute(
                "SELECT 1 FROM post_likes WHERE post_id = ? AND user_id = ?", (post_id, user_id)
            ).fetchone()
            if existing:
                connection.execute("DELETE FROM post_likes WHERE post_id = ? AND user_id = ?", (post_id, user_id))
                connection.execute(
                    "UPDATE community_posts SET like_count = MAX(like_count - 1, 0) WHERE id = ?", (post_id,)
                )
                # 좋아요 취소 시 아직 안 읽은 좋아요 알림은 거둬들인다.
                connection.execute(
                    "DELETE FROM notifications WHERE user_id = ? AND actor_id = ? AND type = 'like' AND post_id = ? AND read_at IS NULL",
                    (post["user_id"], user_id, post_id),
                )
                liked = False
            else:
                connection.execute(
                    "INSERT INTO post_likes(post_id, user_id, created_at) VALUES (?, ?, ?)",
                    (post_id, user_id, self._now()),
                )
                connection.execute(
                    "UPDATE community_posts SET like_count = like_count + 1 WHERE id = ?", (post_id,)
                )
                self._add_notification(connection, post["user_id"], user_id, "like", post_id)
                liked = True
            connection.commit()
            count = connection.execute(
                "SELECT like_count FROM community_posts WHERE id = ?", (post_id,)
            ).fetchone()["like_count"]
            return {"liked": liked, "like_count": count}

    def delete_post(self, post_id, user_id):
        with closing(self._connect()) as connection:
            post = connection.execute(
                "SELECT user_id, images FROM community_posts WHERE id = ?", (post_id,)
            ).fetchone()
            if not post:
                raise ValueError("게시물을 찾을 수 없습니다.")
            if post["user_id"] != user_id:
                raise PermissionError("내가 올린 코스만 삭제할 수 있습니다.")
            connection.execute("DELETE FROM community_posts WHERE id = ?", (post_id,))
            connection.execute("DELETE FROM post_likes WHERE post_id = ?", (post_id,))
            connection.commit()
        # 게시물 사진에는 개인정보가 담길 수 있으니 업로드 파일도 함께 지운다.
        try:
            self._delete_unreferenced_images(json.loads(post["images"] or "[]"))
        except (ValueError, OSError):
            pass
        return {"deleted": True}

    # ------------------- 장소 리뷰 -------------------

    MAX_PLACE_REVIEW_LENGTH = 500

    def _place_key(self, place_id="", place_name="", lat=None, lon=None):
        place_id = str(place_id or "").strip()
        if place_id:
            return f"id:{place_id[:120]}"
        normalized_name = "".join(str(place_name or "").lower().split())
        if lat is not None and lon is not None:
            try:
                return f"geo:{normalized_name}:{float(lat):.5f}:{float(lon):.5f}"
            except (TypeError, ValueError):
                pass
        return f"name:{normalized_name[:120]}"

    def _place_review_post_title(self, place_name, rating):
        return f"{place_name} RecoDate 리뷰 ★{rating}"[:60]

    def _place_review_post_comment(self, place_name, rating, content):
        stars = "★" * int(rating)
        return f"📍 {place_name}\n{stars}\n{content}".strip()[:500]

    def _upsert_place_review_feed_post(
        self,
        connection,
        user_id,
        community_post_id,
        place_name,
        place_category,
        address,
        rating,
        content,
        image_filenames,
    ):
        title = self._place_review_post_title(place_name, rating)
        comment = self._place_review_post_comment(place_name, rating, content)
        region_label = (address or place_name or "").strip()[:40]
        images_json = json.dumps(image_filenames or [])
        now = self._now()
        if community_post_id:
            existing = connection.execute(
                "SELECT id FROM community_posts WHERE id = ? AND user_id = ?",
                (community_post_id, user_id),
            ).fetchone()
            if existing:
                connection.execute(
                    """
                    UPDATE community_posts
                    SET title = ?, comment = ?, region_label = ?, transport = 'walk',
                        course_json = '{}', visibility = 'public', post_type = 'text', images = ?
                    WHERE id = ? AND user_id = ?
                    """,
                    (title, comment, region_label, images_json, community_post_id, user_id),
                )
                return community_post_id
        cursor = connection.execute(
            """
            INSERT INTO community_posts(
                user_id, title, comment, region_label, transport, course_json,
                visibility, created_at, post_type, images
            )
            VALUES (?, ?, ?, ?, 'walk', '{}', 'public', ?, 'text', ?)
            """,
            (user_id, title, comment, region_label, now, images_json),
        )
        return cursor.lastrowid

    def _image_is_referenced(self, connection, filename):
        needle = f'"{filename}"'
        tables = [
            ("community_posts", "images"),
            ("place_reviews", "images"),
            ("chat_messages", "images"),
            ("chat_room_messages", "images"),
        ]
        return any(
            connection.execute(
                f"SELECT 1 FROM {table} WHERE {column} LIKE ? LIMIT 1",
                (f"%{needle}%",),
            ).fetchone()
            for table, column in tables
        )

    def _delete_unreferenced_images(self, filenames):
        for filename in filenames or []:
            try:
                with closing(self._connect()) as connection:
                    if self._image_is_referenced(connection, filename):
                        continue
                path = self.image_path(filename)
                if path:
                    path.unlink(missing_ok=True)
            except OSError:
                pass

    def save_place_review(self, user_id, review, image_filenames=None):
        place_name = (review.place_name or "").strip()[:120]
        if not place_name:
            raise ValueError("장소 이름이 필요합니다.")
        rating = int(review.rating)
        if rating < 1 or rating > 5:
            raise ValueError("별점은 1점부터 5점까지 선택할 수 있습니다.")
        content = (review.content or "").strip()[: self.MAX_PLACE_REVIEW_LENGTH]
        if not content:
            raise ValueError("리뷰 내용을 입력해 주세요.")
        place_id = (review.place_id or "").strip()[:120]
        lat = review.lat
        lon = review.lon
        place_key = self._place_key(place_id, place_name, lat, lon)
        now = self._now()
        with closing(self._connect()) as connection:
            existing_review = connection.execute(
                "SELECT id, images, community_post_id FROM place_reviews WHERE place_key = ? AND user_id = ?",
                (place_key, user_id),
            ).fetchone()
            previous_images = []
            if existing_review:
                try:
                    previous_images = json.loads(existing_review["images"] or "[]")
                except (TypeError, ValueError):
                    previous_images = []
            final_images = image_filenames if image_filenames is not None else previous_images
            old_post_id = existing_review["community_post_id"] if existing_review else None
            # 피드에 올리기를 체크했을 때만 커뮤니티 글을 만든다(체크 해제 시 기존 글은 내린다).
            if getattr(review, "share_to_feed", False):
                community_post_id = self._upsert_place_review_feed_post(
                    connection,
                    user_id,
                    old_post_id,
                    place_name,
                    (review.place_category or "").strip()[:80],
                    (review.address or "").strip()[:240],
                    rating,
                    content,
                    final_images,
                )
            else:
                if old_post_id:
                    connection.execute(
                        "DELETE FROM community_posts WHERE id = ? AND user_id = ?", (old_post_id, user_id)
                    )
                community_post_id = None
            cursor = connection.execute(
                """
                INSERT INTO place_reviews(
                    place_key, place_id, place_name, place_category, address, lat, lon,
                    user_id, rating, content, created_at, updated_at, images, community_post_id
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(place_key, user_id) DO UPDATE SET
                    place_id = excluded.place_id,
                    place_name = excluded.place_name,
                    place_category = excluded.place_category,
                    address = excluded.address,
                    lat = excluded.lat,
                    lon = excluded.lon,
                    rating = excluded.rating,
                    content = excluded.content,
                    updated_at = excluded.updated_at,
                    images = excluded.images,
                    community_post_id = excluded.community_post_id
                """,
                (
                    place_key,
                    place_id,
                    place_name,
                    (review.place_category or "").strip()[:80],
                    (review.address or "").strip()[:240],
                    lat,
                    lon,
                    user_id,
                    rating,
                    content,
                    now,
                    now,
                    json.dumps(final_images or []),
                    community_post_id,
                ),
            )
            connection.commit()
            if image_filenames is not None:
                replaced = [name for name in previous_images if name not in (final_images or [])]
                self._delete_unreferenced_images(replaced)
            review_id = cursor.lastrowid
            if not review_id:
                row = connection.execute(
                    "SELECT id FROM place_reviews WHERE place_key = ? AND user_id = ?",
                    (place_key, user_id),
                ).fetchone()
                review_id = row["id"] if row else None
            return self.get_place_reviews(user_id, place_id, place_name, lat, lon, include_review_id=review_id)

    def get_place_reviews(self, viewer_id, place_id="", place_name="", lat=None, lon=None, limit=30, include_review_id=None):
        place_key = self._place_key(place_id, place_name, lat, lon)
        with closing(self._connect()) as connection:
            blocked = self._blocked_user_ids(connection, viewer_id)
            blocked_clause = ""
            blocked_params = []
            if blocked:
                blocked_clause = f" AND user_id NOT IN ({','.join('?' for _ in blocked)})"
                blocked_params = list(blocked)
            row = connection.execute(
                f"""
                SELECT COUNT(*) AS review_count, COALESCE(AVG(rating), 0) AS average_rating
                FROM place_reviews
                WHERE place_key = ?{blocked_clause}
                """,
                (place_key, *blocked_params),
            ).fetchone()
            my_row = connection.execute(
                "SELECT * FROM place_reviews WHERE place_key = ? AND user_id = ?",
                (place_key, viewer_id),
            ).fetchone()
            rows = connection.execute(
                f"""
                SELECT * FROM place_reviews
                WHERE place_key = ?{blocked_clause}
                ORDER BY updated_at DESC, id DESC
                LIMIT ?
                """,
                (place_key, *blocked_params, int(limit)),
            ).fetchall()
            reviews = [
                self._serialize_place_review(connection, item, viewer_id)
                for item in rows
            ]
            return {
                "place_key": place_key,
                "summary": {
                    "review_count": int(row["review_count"] or 0),
                    "average_rating": round(float(row["average_rating"] or 0), 1),
                },
                "my_review": self._serialize_place_review(connection, my_row, viewer_id) if my_row else None,
                "reviews": reviews,
                "saved_review_id": include_review_id,
            }

    def delete_place_review(self, review_id, user_id):
        with closing(self._connect()) as connection:
            row = connection.execute("SELECT * FROM place_reviews WHERE id = ?", (review_id,)).fetchone()
            if not row:
                raise ValueError("리뷰를 찾을 수 없습니다.")
            if row["user_id"] != user_id:
                raise PermissionError("내가 작성한 리뷰만 삭제할 수 있습니다.")
            try:
                image_filenames = json.loads(row["images"] or "[]") if "images" in row.keys() else []
            except (TypeError, ValueError):
                image_filenames = []
            community_post_id = row["community_post_id"] if "community_post_id" in row.keys() else None
            connection.execute("DELETE FROM place_reviews WHERE id = ?", (review_id,))
            if community_post_id:
                connection.execute("DELETE FROM community_posts WHERE id = ? AND user_id = ?", (community_post_id, user_id))
                connection.execute("DELETE FROM post_likes WHERE post_id = ?", (community_post_id,))
                connection.execute("DELETE FROM post_comments WHERE post_id = ?", (community_post_id,))
            connection.commit()
            self._delete_unreferenced_images(image_filenames)
            return self.get_place_reviews(user_id, row["place_id"], row["place_name"], row["lat"], row["lon"])

    def _serialize_place_review(self, connection, row, viewer_id):
        if not row:
            return None
        author = self._user_brief(connection, row["user_id"]) or {"nickname": "탈퇴한 사용자", "tripti": None}
        try:
            images = json.loads(row["images"] or "[]") if "images" in row.keys() else []
        except (TypeError, ValueError):
            images = []
        return {
            "id": row["id"],
            "place_key": row["place_key"],
            "place_id": row["place_id"],
            "place_name": row["place_name"],
            "community_post_id": row["community_post_id"] if "community_post_id" in row.keys() else None,
            "author_id": row["user_id"],
            "author_nickname": author["nickname"],
            "rating": row["rating"],
            "content": row["content"],
            "images": images,
            "is_mine": row["user_id"] == viewer_id,
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
        }

    def _serialize(self, connection, row, viewer_id):
        author = connection.execute(
            "SELECT nickname, tripti_result FROM users WHERE id = ?", (row["user_id"],)
        ).fetchone()
        liked = bool(
            connection.execute(
                "SELECT 1 FROM post_likes WHERE post_id = ? AND user_id = ?", (row["id"], viewer_id)
            ).fetchone()
        )
        tripti_name = None
        if author and author["tripti_result"]:
            try:
                tripti_name = json.loads(author["tripti_result"]).get("name")
            except (ValueError, AttributeError):
                tripti_name = None
        try:
            images = json.loads(row["images"]) if "images" in row.keys() else []
        except (ValueError, TypeError):
            images = []
        comment_count = connection.execute(
            "SELECT COUNT(*) AS c FROM post_comments WHERE post_id = ?", (row["id"],)
        ).fetchone()["c"]
        # 커플 게시물 스냅샷(작성 시점) + 작성자의 현재 연인 여부(이름 옆 하트용)
        keys = row.keys()
        couple_partner = None
        if "couple_partner_id" in keys and row["couple_partner_id"]:
            couple_partner = {
                "user_id": row["couple_partner_id"],
                "nickname": row["couple_partner_nickname"] or "연인",
            }
        author_partner = self._partner_brief(connection, row["user_id"])
        return {
            "id": row["id"],
            "comment_count": comment_count,
            "post_type": row["post_type"] if "post_type" in row.keys() else "course",
            "images": images,
            "author_id": row["user_id"],
            "author_nickname": author["nickname"] if author else "탈퇴한 사용자",
            "author_tripti": tripti_name,
            "couple_partner": couple_partner,
            "author_has_partner": bool(author_partner),
            "title": row["title"],
            "comment": row["comment"],
            "region_label": row["region_label"],
            "transport": row["transport"],
            "course": json.loads(row["course_json"]),
            "visibility": row["visibility"],
            "like_count": row["like_count"],
            "liked_by_me": liked,
            "is_mine": row["user_id"] == viewer_id,
            "created_at": row["created_at"],
        }
