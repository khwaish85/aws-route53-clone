from __future__ import annotations

import json
import os
import secrets
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from uuid import uuid4

from fastapi import Cookie, Depends, FastAPI, HTTPException, Query, Response, status
from fastapi.middleware.cors import CORSMiddleware

from .bind import BindParseError, format_bind_zone, parse_bind_zone
from .database import db, initialize
from .schemas import BindImportRequest, BulkDeleteRequest, LoginRequest, RecordCreate, RecordUpdate, ZoneCreate, ZoneUpdate

SESSION_COOKIE = "route53_session"
DEFAULT_FRONTEND_ORIGINS = "http://localhost:3000,http://127.0.0.1:3000"
FRONTEND_ORIGINS = [
    origin.strip()
    for origin in os.getenv("FRONTEND_ORIGINS", DEFAULT_FRONTEND_ORIGINS).split(",")
    if origin.strip()
]
COOKIE_SECURE = os.getenv("COOKIE_SECURE", "false").lower() in {"1", "true", "yes", "on"}


@asynccontextmanager
async def lifespan(_: FastAPI):
    initialize()
    yield


app = FastAPI(title="Khwaish Yadav Route 53 Clone API", version="1.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=FRONTEND_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def current_user(route53_session: str | None = Cookie(default=None)) -> dict:
    if not route53_session:
        raise HTTPException(status_code=401, detail="Authentication required")
    with db() as connection:
        row = connection.execute(
            """SELECT u.id, u.email, u.display_name, u.account_id
               FROM sessions s JOIN users u ON u.id = s.user_id
               WHERE s.token = ? AND s.expires_at > ?""",
            (route53_session, datetime.now(timezone.utc).isoformat()),
        ).fetchone()
    if not row:
        raise HTTPException(status_code=401, detail="Session expired")
    return dict(row)


def zone_or_404(connection, zone_id: str):
    row = connection.execute(
        """SELECT z.*, COUNT(r.id) AS record_count
           FROM hosted_zones z LEFT JOIN records r ON r.zone_id = z.id
           WHERE z.id = ? GROUP BY z.id""",
        (zone_id,),
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Hosted zone not found")
    return row


def absolute_record_name(name: str, zone_name: str) -> str:
    cleaned = name.strip()
    if not cleaned or cleaned == "@":
        return zone_name
    return cleaned if cleaned.endswith(".") else f"{cleaned}.{zone_name}"


@app.get("/api/health")
def health():
    return {"status": "healthy"}


@app.post("/api/auth/login")
def login(payload: LoginRequest, response: Response):
    with db() as connection:
        user = connection.execute(
            "SELECT id, email, display_name, account_id FROM users WHERE email = ? AND password = ?",
            (payload.email.lower().strip(), payload.password),
        ).fetchone()
        if not user:
            raise HTTPException(status_code=401, detail="Incorrect email or password")
        token = secrets.token_urlsafe(32)
        expires = datetime.now(timezone.utc) + timedelta(days=7)
        connection.execute(
            "INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)",
            (token, user["id"], expires.isoformat()),
        )
    response.set_cookie(
        SESSION_COOKIE,
        token,
        max_age=7 * 24 * 60 * 60,
        httponly=True,
        samesite="lax",
        secure=COOKIE_SECURE,
    )
    return {"user": dict(user)}


@app.post("/api/auth/logout", status_code=204)
def logout(response: Response, route53_session: str | None = Cookie(default=None)):
    if route53_session:
        with db() as connection:
            connection.execute("DELETE FROM sessions WHERE token = ?", (route53_session,))
    response.delete_cookie(SESSION_COOKIE, httponly=True, samesite="lax", secure=COOKIE_SECURE)


@app.get("/api/auth/me")
def me(user: dict = Depends(current_user)):
    return {"user": user}


@app.get("/api/zones")
def list_zones(
    search: str = "",
    zone_type: str = "",
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=10, ge=1, le=100),
    _: dict = Depends(current_user),
):
    if zone_type not in ("", "public", "private"):
        raise HTTPException(status_code=422, detail="Hosted zone type must be public or private")
    needle = f"%{search.strip()}%"
    offset = (page - 1) * page_size
    type_clause = "AND zone_type = ?" if zone_type else ""
    params = [needle, needle] + ([zone_type] if zone_type else [])
    with db() as connection:
        total = connection.execute(
            f"SELECT COUNT(*) FROM hosted_zones WHERE (name LIKE ? OR description LIKE ?) {type_clause}", params
        ).fetchone()[0]
        rows = connection.execute(
            f"""SELECT z.*, COUNT(r.id) AS record_count
               FROM hosted_zones z LEFT JOIN records r ON r.zone_id = z.id
               WHERE (z.name LIKE ? OR z.description LIKE ?) {type_clause}
               GROUP BY z.id ORDER BY z.name LIMIT ? OFFSET ?""",
            params + [page_size, offset],
        ).fetchall()
    return {"items": [dict(row) for row in rows], "total": total, "page": page, "page_size": page_size}


@app.post("/api/zones", status_code=status.HTTP_201_CREATED)
def create_zone(payload: ZoneCreate, _: dict = Depends(current_user)):
    zone_id = f"Z{uuid4().hex[:12].upper()}"
    with db() as connection:
        try:
            connection.execute(
                """INSERT INTO hosted_zones (id, name, description, zone_type, vpc_region, vpc_id)
                   VALUES (?, ?, ?, ?, ?, ?)""",
                (zone_id, payload.name, payload.description, payload.zone_type, payload.vpc_region, payload.vpc_id),
            )
            # Route 53 automatically creates SOA and NS records for every hosted zone.
            ns_value = "\n".join([f"ns-{n}.awsdns-{n % 64}.com." for n in (112, 351, 824, 1459)])
            connection.executemany(
                "INSERT INTO records (id, zone_id, name, type, value, ttl) VALUES (?, ?, ?, ?, ?, ?)",
                [
                    (uuid4().hex, zone_id, payload.name, "NS", ns_value, 172800),
                    (uuid4().hex, zone_id, payload.name, "SOA", "ns-112.awsdns-48.com. awsdns-hostmaster.amazon.com. 1 7200 900 1209600 86400", 900),
                ],
            )
        except Exception as exc:
            if "UNIQUE" in str(exc):
                raise HTTPException(status_code=409, detail="A hosted zone with this name already exists") from exc
            raise
        return dict(zone_or_404(connection, zone_id))


@app.get("/api/zones/{zone_id}")
def get_zone(zone_id: str, _: dict = Depends(current_user)):
    with db() as connection:
        return dict(zone_or_404(connection, zone_id))


@app.get("/api/zones/{zone_id}/export")
def export_zone(zone_id: str, format: str = "json", _: dict = Depends(current_user)):
    if format not in ("json", "bind"):
        raise HTTPException(status_code=422, detail="Export format must be json or bind")
    with db() as connection:
        zone = dict(zone_or_404(connection, zone_id))
        records = [dict(row) for row in connection.execute(
            "SELECT * FROM records WHERE zone_id = ? ORDER BY name, type", (zone_id,)
        ).fetchall()]
    filename = zone["name"].rstrip(".")
    if format == "bind":
        return Response(
            content=format_bind_zone(zone["name"], records),
            media_type="text/dns",
            headers={"Content-Disposition": f'attachment; filename="{filename}.zone"'},
        )
    payload = {"hosted_zone": zone, "records": records, "exported_at": datetime.now(timezone.utc).isoformat()}
    return Response(
        content=json.dumps(payload, indent=2),
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="{filename}.json"'},
    )


@app.patch("/api/zones/{zone_id}")
def update_zone(zone_id: str, payload: ZoneUpdate, _: dict = Depends(current_user)):
    with db() as connection:
        zone_or_404(connection, zone_id)
        connection.execute(
            "UPDATE hosted_zones SET description = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            (payload.description, zone_id),
        )
        return dict(zone_or_404(connection, zone_id))


@app.delete("/api/zones/{zone_id}", status_code=204)
def delete_zone(zone_id: str, _: dict = Depends(current_user)):
    with db() as connection:
        zone_or_404(connection, zone_id)
        connection.execute("DELETE FROM hosted_zones WHERE id = ?", (zone_id,))


@app.get("/api/zones/{zone_id}/records")
def list_records(
    zone_id: str,
    search: str = "",
    record_type: str = "",
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    _: dict = Depends(current_user),
):
    offset = (page - 1) * page_size
    needle = f"%{search.strip()}%"
    type_clause = "AND type = ?" if record_type else ""
    params = [zone_id, needle, needle] + ([record_type] if record_type else [])
    with db() as connection:
        zone_or_404(connection, zone_id)
        total = connection.execute(
            f"SELECT COUNT(*) FROM records WHERE zone_id = ? AND (name LIKE ? OR value LIKE ?) {type_clause}", params
        ).fetchone()[0]
        rows = connection.execute(
            f"""SELECT * FROM records WHERE zone_id = ? AND (name LIKE ? OR value LIKE ?) {type_clause}
                ORDER BY name, type LIMIT ? OFFSET ?""",
            params + [page_size, offset],
        ).fetchall()
    return {"items": [dict(row) for row in rows], "total": total, "page": page, "page_size": page_size}


@app.post("/api/zones/{zone_id}/records/import")
def import_records(zone_id: str, payload: BindImportRequest, _: dict = Depends(current_user)):
    with db() as connection:
        zone = zone_or_404(connection, zone_id)
        try:
            parsed, warnings = parse_bind_zone(payload.content, zone["name"])
        except BindParseError as exc:
            raise HTTPException(status_code=422, detail={"message": "The BIND zone file contains errors", "errors": exc.errors}) from exc

        grouped: dict[tuple[str, str], dict] = {}
        for record in parsed:
            key = (record.name, record.type)
            if key not in grouped:
                grouped[key] = {"ttl": record.ttl, "values": []}
            elif grouped[key]["ttl"] != record.ttl:
                warnings.append(f"{record.name} {record.type}: mixed TTL values; using {grouped[key]['ttl']}")
            if record.value not in grouped[key]["values"]:
                grouped[key]["values"].append(record.value)

        existing = {(row["name"], row["type"]) for row in connection.execute(
            "SELECT name, type FROM records WHERE zone_id = ?", (zone_id,)
        ).fetchall()}
        imported = 0
        skipped = 0
        for (name, record_type), record in grouped.items():
            if (name, record_type) in existing:
                warnings.append(f"{name} {record_type}: record set already exists")
                skipped += 1
                continue
            connection.execute(
                """INSERT INTO records (id, zone_id, name, type, value, ttl)
                   VALUES (?, ?, ?, ?, ?, ?)""",
                (uuid4().hex, zone_id, name, record_type, "\n".join(record["values"]), record["ttl"]),
            )
            imported += 1
        updated_zone = zone_or_404(connection, zone_id)
    return {"imported": imported, "skipped": skipped, "record_count": updated_zone["record_count"], "warnings": warnings}


@app.post("/api/zones/{zone_id}/records:bulk-delete")
def bulk_delete_records(zone_id: str, payload: BulkDeleteRequest, _: dict = Depends(current_user)):
    record_ids = list(dict.fromkeys(payload.record_ids))
    placeholders = ",".join("?" for _ in record_ids)
    with db() as connection:
        zone = zone_or_404(connection, zone_id)
        records = connection.execute(
            f"SELECT id, name, type FROM records WHERE zone_id = ? AND id IN ({placeholders})",
            [zone_id, *record_ids],
        ).fetchall()
        if len(records) != len(record_ids):
            raise HTTPException(status_code=404, detail="One or more selected records no longer exist")
        if any(record["name"] == zone["name"] and record["type"] in ("NS", "SOA") for record in records):
            raise HTTPException(status_code=400, detail="Default NS and SOA records cannot be deleted")
        connection.executemany(
            "DELETE FROM records WHERE zone_id = ? AND id = ?",
            [(zone_id, record_id) for record_id in record_ids],
        )
    return {"deleted": len(record_ids)}


@app.post("/api/zones/{zone_id}/records", status_code=201)
def create_record(zone_id: str, payload: RecordCreate, _: dict = Depends(current_user)):
    record_id = uuid4().hex
    with db() as connection:
        zone = zone_or_404(connection, zone_id)
        name = absolute_record_name(payload.name, zone["name"])
        try:
            connection.execute(
                """INSERT INTO records (id, zone_id, name, type, value, ttl, routing_policy, evaluate_target_health)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                (record_id, zone_id, name, payload.type, payload.value, payload.ttl, payload.routing_policy, int(payload.evaluate_target_health)),
            )
        except Exception as exc:
            if "UNIQUE" in str(exc):
                raise HTTPException(status_code=409, detail="A record with this name and type already exists") from exc
            raise
        return dict(connection.execute("SELECT * FROM records WHERE id = ?", (record_id,)).fetchone())


@app.put("/api/zones/{zone_id}/records/{record_id}")
def update_record(zone_id: str, record_id: str, payload: RecordUpdate, _: dict = Depends(current_user)):
    with db() as connection:
        zone = zone_or_404(connection, zone_id)
        existing = connection.execute("SELECT * FROM records WHERE id = ? AND zone_id = ?", (record_id, zone_id)).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="Record not found")
        if existing["type"] in ("NS", "SOA") and existing["name"] == zone["name"]:
            raise HTTPException(status_code=400, detail="Default NS and SOA records cannot be edited")
        name = absolute_record_name(payload.name, zone["name"])
        try:
            connection.execute(
                """UPDATE records SET name=?, type=?, value=?, ttl=?, routing_policy=?, evaluate_target_health=?,
                   updated_at=CURRENT_TIMESTAMP WHERE id=?""",
                (name, payload.type, payload.value, payload.ttl, payload.routing_policy, int(payload.evaluate_target_health), record_id),
            )
        except Exception as exc:
            if "UNIQUE" in str(exc):
                raise HTTPException(status_code=409, detail="A record with this name and type already exists") from exc
            raise
        return dict(connection.execute("SELECT * FROM records WHERE id = ?", (record_id,)).fetchone())


@app.delete("/api/zones/{zone_id}/records/{record_id}", status_code=204)
def delete_record(zone_id: str, record_id: str, _: dict = Depends(current_user)):
    with db() as connection:
        zone = zone_or_404(connection, zone_id)
        record = connection.execute("SELECT * FROM records WHERE id = ? AND zone_id = ?", (record_id, zone_id)).fetchone()
        if not record:
            raise HTTPException(status_code=404, detail="Record not found")
        if record["type"] in ("NS", "SOA") and record["name"] == zone["name"]:
            raise HTTPException(status_code=400, detail="Default NS and SOA records cannot be deleted")
        connection.execute("DELETE FROM records WHERE id = ?", (record_id,))
