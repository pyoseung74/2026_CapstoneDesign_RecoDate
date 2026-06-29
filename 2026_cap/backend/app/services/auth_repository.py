import hashlib
import hmac
import json
import re
import secrets
import sqlite3
from contextlib import closing
from datetime import datetime, timedelta, timezone
from pathlib import Path


DATABASE_PATH = Path(__file__).resolve().parents[2] / "data" / "recodate_users.db"


class AuthRepository:
    def __init__(self, database_path=DATABASE_PATH):
        self.database_path = Path(database_path)
        self._initialize()

    def _connect(self):
        connection = sqlite3.connect(self.database_path)
        connection.row_factory = sqlite3.Row
        return connection

    def _initialize(self):
        self.database_path.parent.mkdir(parents=True, exist_ok=True)
        with closing(self._connect()) as connection:
            connection.executescript(
                """
                CREATE TABLE IF NOT EXISTS users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    login_id TEXT NOT NULL UNIQUE,
                    email TEXT NOT NULL UNIQUE,
                    nickname TEXT NOT NULL,
                    password_salt TEXT NOT NULL,
                    password_hash TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS sessions (
                    token TEXT PRIMARY KEY,
                    user_id INTEGER NOT NULL,
                    expires_at TEXT NOT NULL,
                    FOREIGN KEY(user_id) REFERENCES users(id)
                );
                CREATE TABLE IF NOT EXISTS kakao_signup_pending (
                    pending_token TEXT PRIMARY KEY,
                    kakao_user_id TEXT NOT NULL,
                    email TEXT NOT NULL,
                    default_nickname TEXT NOT NULL,
                    expires_at TEXT NOT NULL
                );
                """
            )
            columns = {row["name"] for row in connection.execute("PRAGMA table_info(users)").fetchall()}
            if "phone" not in columns:
                connection.execute("ALTER TABLE users ADD COLUMN phone TEXT NOT NULL DEFAULT ''")
            if "tripti_result" not in columns:
                connection.execute("ALTER TABLE users ADD COLUMN tripti_result TEXT")
            if "agreed_terms" not in columns:
                connection.execute("ALTER TABLE users ADD COLUMN agreed_terms INTEGER NOT NULL DEFAULT 0")
            if "agreed_privacy" not in columns:
                connection.execute("ALTER TABLE users ADD COLUMN agreed_privacy INTEGER NOT NULL DEFAULT 0")
            if "agreed_location" not in columns:
                connection.execute("ALTER TABLE users ADD COLUMN agreed_location INTEGER NOT NULL DEFAULT 0")
            if "age_over_14" not in columns:
                connection.execute("ALTER TABLE users ADD COLUMN age_over_14 INTEGER NOT NULL DEFAULT 0")
            if "auth_provider" not in columns:
                connection.execute("ALTER TABLE users ADD COLUMN auth_provider TEXT NOT NULL DEFAULT 'password'")
            if "kakao_user_id" not in columns:
                connection.execute("ALTER TABLE users ADD COLUMN kakao_user_id TEXT")
            if "profile_image" not in columns:
                connection.execute("ALTER TABLE users ADD COLUMN profile_image TEXT NOT NULL DEFAULT ''")
            if "agreed_content_license" not in columns:
                # 사용자 작성 리뷰·게시물의 데이터 활용 동의(약관 라이선스 조항) 기록
                connection.execute("ALTER TABLE users ADD COLUMN agreed_content_license INTEGER NOT NULL DEFAULT 0")
            connection.execute(
                "CREATE UNIQUE INDEX IF NOT EXISTS idx_users_phone_unique ON users(phone) WHERE phone <> ''"
            )
            connection.execute(
                "CREATE UNIQUE INDEX IF NOT EXISTS idx_users_kakao_unique ON users(kakao_user_id) WHERE kakao_user_id IS NOT NULL AND kakao_user_id <> ''"
            )
            # 커뮤니티(친구 검색)용 닉네임 유니크 정책: 기존 중복자는 가입 순서대로 뒤에 숫자를 붙인다(민지 → 민지2).
            self._deduplicate_nicknames(connection)
            connection.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_nickname_unique ON users(nickname)")
            connection.commit()

    def _deduplicate_nicknames(self, connection):
        duplicates = connection.execute(
            "SELECT nickname FROM users GROUP BY nickname HAVING COUNT(*) > 1"
        ).fetchall()
        for row in duplicates:
            users = connection.execute(
                "SELECT id FROM users WHERE nickname = ? ORDER BY id", (row["nickname"],)
            ).fetchall()
            taken = {item["nickname"] for item in connection.execute("SELECT nickname FROM users").fetchall()}
            suffix = 2
            for user in users[1:]:
                candidate = f"{row['nickname']}{suffix}"
                while candidate in taken:
                    suffix += 1
                    candidate = f"{row['nickname']}{suffix}"
                connection.execute("UPDATE users SET nickname = ? WHERE id = ?", (candidate, user["id"]))
                taken.add(candidate)
                suffix += 1

    @staticmethod
    def _validate_password(password):
        """프론트와 같은 비밀번호 규칙을 서버에서도 강제한다(API 직접 호출 대비)."""
        value = password or ""
        if len(value) < 8 or any(character.isspace() for character in value):
            raise ValueError("비밀번호는 공백 없이 8자 이상이어야 합니다.")
        if not re.search(r"[^A-Za-z0-9가-힣]", value):
            raise ValueError("비밀번호에 특수문자를 1자 이상 포함해 주세요.")

    def register(self, email, phone, nickname, password, agreed_terms=False, agreed_privacy=False, agreed_location=False, age_over_14=False, agreed_content_license=False):
        self._validate_password(password)
        email = email.strip().lower()
        login_id = self._login_id_from_email(email)
        phone = "".join(character for character in phone if character.isdigit())
        salt = secrets.token_hex(16)
        password_hash = self._hash_password(password, salt)
        with closing(self._connect()) as connection:
            duplicate = connection.execute(
                """
                SELECT
                    CASE
                        WHEN login_id = ? THEN '아이디'
                        WHEN email = ? THEN '이메일'
                        WHEN phone = ? AND phone <> '' THEN '전화번호'
                        WHEN nickname = ? THEN '닉네임'
                    END AS field
                FROM users
                WHERE login_id = ? OR email = ? OR (phone = ? AND phone <> '') OR nickname = ?
                LIMIT 1
                """,
                (login_id, email, phone, nickname, login_id, email, phone, nickname),
            ).fetchone()
            if duplicate:
                raise ValueError(f"이미 사용 중인 {duplicate['field']}입니다.")
            try:
                cursor = connection.execute(
                    """
                    INSERT INTO users(
                        login_id, email, phone, nickname, password_salt, password_hash, created_at,
                        agreed_terms, agreed_privacy, agreed_location, age_over_14, agreed_content_license, auth_provider
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'password')
                    """,
                    (
                        login_id,
                        email,
                        phone,
                        nickname,
                        salt,
                        password_hash,
                        self._now().isoformat(),
                        int(bool(agreed_terms)),
                        int(bool(agreed_privacy)),
                        int(bool(agreed_location)),
                        int(bool(age_over_14)),
                        int(bool(agreed_content_license)),
                    ),
                )
            except sqlite3.IntegrityError as exc:
                raise ValueError("이미 가입에 사용된 이메일 또는 전화번호입니다.") from exc
            connection.commit()
            user = connection.execute("SELECT * FROM users WHERE id = ?", (cursor.lastrowid,)).fetchone()
            return self._public_user(user)

    def login(self, email, password):
        email = email.strip().lower()
        with closing(self._connect()) as connection:
            user = connection.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
            if not user or not hmac.compare_digest(user["password_hash"], self._hash_password(password, user["password_salt"])):
                raise ValueError("이메일 또는 비밀번호를 확인해 주세요.")
            return self._create_session(connection, user)

    def reset_password(self, email, phone, new_password):
        """비밀번호 찾기: 가입한 이메일+전화번호가 모두 일치하면 새 비밀번호로 재설정한다.
        (비밀번호는 해시로 저장되어 원문을 알려줄 수 없으므로 재설정 방식)"""
        email = (email or "").strip().lower()
        phone = "".join(character for character in (phone or "") if character.isdigit())
        self._validate_password(new_password)
        with closing(self._connect()) as connection:
            user = connection.execute(
                "SELECT * FROM users WHERE email = ? AND phone = ? AND phone <> ''", (email, phone)
            ).fetchone()
            if not user:
                # 어떤 항목이 틀렸는지 노출하지 않는다(계정 존재 여부 추측 방지).
                raise ValueError("입력한 정보와 일치하는 계정을 찾지 못했습니다.")
            salt = secrets.token_hex(16)
            connection.execute(
                "UPDATE users SET password_salt = ?, password_hash = ? WHERE id = ?",
                (salt, self._hash_password(new_password, salt), user["id"]),
            )
            # 보안: 재설정하면 기존 로그인 세션을 모두 끊는다.
            connection.execute("DELETE FROM sessions WHERE user_id = ?", (user["id"],))
            connection.commit()
            return {"ok": True}

    def login_or_prepare_kakao(self, kakao_user_id, email, nickname):
        kakao_user_id = str(kakao_user_id).strip()
        email = email.strip().lower()
        nickname = (nickname or "RecoDate 사용자").strip()[:30]
        if not kakao_user_id or not email:
            raise ValueError("카카오 계정에서 이메일 정보를 확인할 수 없습니다.")
        with closing(self._connect()) as connection:
            user = connection.execute("SELECT * FROM users WHERE kakao_user_id = ?", (kakao_user_id,)).fetchone()
            if user:
                return self._create_session(connection, user)
            user = connection.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
            if user:
                connection.execute(
                    "UPDATE users SET kakao_user_id = ?, auth_provider = ? WHERE id = ?",
                    (kakao_user_id, "kakao", user["id"]),
                )
                connection.commit()
                user = connection.execute("SELECT * FROM users WHERE id = ?", (user["id"],)).fetchone()
                return self._create_session(connection, user)
            pending_token = secrets.token_urlsafe(32)
            expires_at = self._now() + timedelta(minutes=20)
            connection.execute("DELETE FROM kakao_signup_pending WHERE kakao_user_id = ? OR email = ?", (kakao_user_id, email))
            connection.execute(
                """
                INSERT INTO kakao_signup_pending(pending_token, kakao_user_id, email, default_nickname, expires_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (pending_token, kakao_user_id, email, nickname, expires_at.isoformat()),
            )
            connection.commit()
            return {
                "status": "signup_required",
                "pending_token": pending_token,
                "email": email,
                "nickname": nickname,
            }

    def complete_kakao_signup(self, pending_token, nickname, agreed_terms=False, agreed_privacy=False, agreed_location=False, age_over_14=False):
        nickname = nickname.strip()
        if len(nickname) < 2:
            raise ValueError("닉네임은 2자 이상 입력해 주세요.")
        with closing(self._connect()) as connection:
            pending = connection.execute(
                "SELECT * FROM kakao_signup_pending WHERE pending_token = ? AND expires_at > ?",
                (pending_token, self._now().isoformat()),
            ).fetchone()
            if not pending:
                raise ValueError("카카오 가입 시간이 만료되었습니다. 다시 시도해 주세요.")
            user = connection.execute("SELECT * FROM users WHERE kakao_user_id = ?", (pending["kakao_user_id"],)).fetchone()
            if user:
                connection.execute("DELETE FROM kakao_signup_pending WHERE pending_token = ?", (pending_token,))
                connection.commit()
                return self._create_session(connection, user)
            user = connection.execute("SELECT * FROM users WHERE email = ?", (pending["email"],)).fetchone()
            if user:
                connection.execute(
                    "UPDATE users SET kakao_user_id = ?, auth_provider = ?, nickname = ? WHERE id = ?",
                    (pending["kakao_user_id"], "kakao", nickname, user["id"]),
                )
                connection.execute("DELETE FROM kakao_signup_pending WHERE pending_token = ?", (pending_token,))
                connection.commit()
                user = connection.execute("SELECT * FROM users WHERE id = ?", (user["id"],)).fetchone()
                return self._create_session(connection, user)
            salt = secrets.token_hex(16)
            password_hash = self._hash_password(secrets.token_urlsafe(32), salt)
            cursor = connection.execute(
                """
                INSERT INTO users(
                    login_id, email, phone, nickname, password_salt, password_hash, created_at,
                    agreed_terms, agreed_privacy, agreed_location, age_over_14, auth_provider, kakao_user_id
                )
                VALUES (?, ?, '', ?, ?, ?, ?, ?, ?, ?, ?, 'kakao', ?)
                """,
                (
                    self._login_id_from_email(pending["email"]),
                    pending["email"],
                    nickname,
                    salt,
                    password_hash,
                    self._now().isoformat(),
                    int(bool(agreed_terms)),
                    int(bool(agreed_privacy)),
                    int(bool(agreed_location)),
                    int(bool(age_over_14)),
                    pending["kakao_user_id"],
                ),
            )
            connection.execute("DELETE FROM kakao_signup_pending WHERE pending_token = ?", (pending_token,))
            connection.commit()
            user = connection.execute("SELECT * FROM users WHERE id = ?", (cursor.lastrowid,)).fetchone()
            return self._create_session(connection, user)

    def get_user_by_token(self, token):
        with closing(self._connect()) as connection:
            row = connection.execute(
                """
                SELECT users.*
                FROM sessions
                JOIN users ON users.id = sessions.user_id
                WHERE sessions.token = ? AND sessions.expires_at > ?
                """,
                (token, self._now().isoformat()),
            ).fetchone()
            return self._public_user(row) if row else None

    def logout(self, token):
        with closing(self._connect()) as connection:
            connection.execute("DELETE FROM sessions WHERE token = ?", (token,))
            connection.commit()

    def find_login_id(self, email):
        with closing(self._connect()) as connection:
            row = connection.execute("SELECT login_id FROM users WHERE email = ?", (email,)).fetchone()
            return row["login_id"] if row else None

    def update_profile(self, token, nickname=None, profile_image=None):
        with closing(self._connect()) as connection:
            user = connection.execute(
                """
                SELECT users.*
                FROM sessions
                JOIN users ON users.id = sessions.user_id
                WHERE sessions.token = ? AND sessions.expires_at > ?
                """,
                (token, self._now().isoformat()),
            ).fetchone()
            if not user:
                return None

            updates = []
            params = []
            if nickname is not None:
                nickname = nickname.strip()
                if len(nickname) < 2:
                    raise ValueError("닉네임은 2자 이상 입력해 주세요.")
                if len(nickname) > 30:
                    raise ValueError("닉네임은 30자 이하로 입력해 주세요.")
                duplicate = connection.execute(
                    "SELECT 1 FROM users WHERE nickname = ? AND id != ?",
                    (nickname, user["id"]),
                ).fetchone()
                if duplicate:
                    raise ValueError("이미 사용 중인 닉네임입니다.")
                updates.append("nickname = ?")
                params.append(nickname)

            if profile_image is not None:
                profile_image = profile_image.strip()
                if profile_image and not profile_image.startswith("data:image/"):
                    raise ValueError("프로필 사진 형식이 올바르지 않습니다.")
                updates.append("profile_image = ?")
                params.append(profile_image)

            if not updates:
                return self._public_user(user)

            params.append(user["id"])
            connection.execute(f"UPDATE users SET {', '.join(updates)} WHERE id = ?", params)
            connection.commit()
            updated = connection.execute("SELECT * FROM users WHERE id = ?", (user["id"],)).fetchone()
            return self._public_user(updated)

    def _create_session(self, connection, user):
        token = secrets.token_urlsafe(32)
        expires_at = self._now() + timedelta(days=30)
        connection.execute(
            "INSERT INTO sessions(token, user_id, expires_at) VALUES (?, ?, ?)",
            (token, user["id"], expires_at.isoformat()),
        )
        connection.commit()
        return {"token": token, "user": self._public_user(user)}

    def _login_id_from_email(self, email):
        base = email.split("@", 1)[0].strip().lower() or "user"
        base = "".join(character if character.isalnum() else "_" for character in base)
        if len(base) < 4:
            base = f"{base}_user"
        candidate = base[:30]
        with closing(self._connect()) as connection:
            index = 2
            while connection.execute("SELECT 1 FROM users WHERE login_id = ?", (candidate,)).fetchone():
                suffix = f"_{index}"
                candidate = f"{base[:30 - len(suffix)]}{suffix}"
                index += 1
        return candidate

    def get_profile_image(self, user_id):
        """아바타 서빙용: 해당 사용자의 profile_image(data URL)를 돌려준다."""
        with closing(self._connect()) as connection:
            row = connection.execute("SELECT profile_image FROM users WHERE id = ?", (user_id,)).fetchone()
            if not row:
                return ""
            return row["profile_image"] if "profile_image" in row.keys() else ""

    def get_tripti_result(self, token):
        with closing(self._connect()) as connection:
            row = connection.execute(
                """
                SELECT users.tripti_result
                FROM sessions
                JOIN users ON users.id = sessions.user_id
                WHERE sessions.token = ? AND sessions.expires_at > ?
                """,
                (token, self._now().isoformat()),
            ).fetchone()
            if not row:
                return None
            return self._decode_tripti_result(row["tripti_result"])

    def save_tripti_result(self, token, result):
        encoded = json.dumps(result, ensure_ascii=False)
        with closing(self._connect()) as connection:
            row = connection.execute(
                """
                SELECT users.id
                FROM sessions
                JOIN users ON users.id = sessions.user_id
                WHERE sessions.token = ? AND sessions.expires_at > ?
                """,
                (token, self._now().isoformat()),
            ).fetchone()
            if not row:
                return None
            connection.execute("UPDATE users SET tripti_result = ? WHERE id = ?", (encoded, row["id"]))
            connection.commit()
            return result

    def _hash_password(self, password, salt):
        return hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 180000).hex()

    def _public_user(self, row):
        return {
            "id": row["id"],
            "login_id": row["login_id"],
            "email": row["email"],
            "phone": row["phone"] or "",
            "nickname": row["nickname"],
            "auth_provider": row["auth_provider"] if "auth_provider" in row.keys() else "password",
            "profile_image": row["profile_image"] if "profile_image" in row.keys() else "",
            "tripti_result": self._decode_tripti_result(row["tripti_result"]) if "tripti_result" in row.keys() else None,
        }

    def _decode_tripti_result(self, value):
        if not value:
            return None
        try:
            return json.loads(value)
        except (TypeError, ValueError):
            return None

    def _now(self):
        return datetime.now(timezone.utc)
