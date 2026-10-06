import os
import sys
from pathlib import Path

os.environ["ROUTE53_DB_PATH"] = str(Path(__file__).parent / "test.db")
Path(os.environ["ROUTE53_DB_PATH"]).unlink(missing_ok=True)
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient

from app.main import app


def test_zone_and_record_workflow():
    with TestClient(app) as client:
        login = client.post("/api/auth/login", json={"email": "khwaish.yadav@route53.local", "password": "password"})
        assert login.status_code == 200
        zone = client.post("/api/zones", json={"name": "example.com", "description": "Test"})
        assert zone.status_code == 201
        zone_id = zone.json()["id"]
        assert zone.json()["record_count"] == 2
        record = client.post(
            f"/api/zones/{zone_id}/records",
            json={"name": "www", "type": "A", "value": "192.0.2.1", "ttl": 300},
        )
        assert record.status_code == 201
        assert record.json()["name"] == "www.example.com."
        apex = client.post(
            f"/api/zones/{zone_id}/records",
            json={"name": "", "type": "A", "value": "192.0.2.2", "ttl": 60},
        )
        assert apex.status_code == 201
        assert apex.json()["name"] == "example.com."
        updated_apex = client.put(
            f"/api/zones/{zone_id}/records/{apex.json()['id']}",
            json={"name": "", "type": "A", "value": "192.0.2.3", "ttl": 120},
        )
        assert updated_apex.status_code == 200
        assert updated_apex.json()["name"] == "example.com."
        imported = client.post(
            f"/api/zones/{zone_id}/records/import",
            json={"content": """$ORIGIN example.com.
$TTL 600
api IN A 192.0.2.20
api IN A 192.0.2.21
text 60 IN TXT \"hello world\"
@ IN SOA ns.example.com. hostmaster.example.com. 1 7200 900 1209600 86400
@ IN NS ns.example.net.
"""},
        )
        assert imported.status_code == 200
        assert imported.json()["imported"] == 2
        assert imported.json()["skipped"] == 1
        exported_json = client.get(f"/api/zones/{zone_id}/export?format=json")
        assert exported_json.status_code == 200
        assert exported_json.json()["hosted_zone"]["name"] == "example.com."
        exported_bind = client.get(f"/api/zones/{zone_id}/export?format=bind")
        assert exported_bind.status_code == 200
        assert "$ORIGIN example.com." in exported_bind.text
        assert "api" in exported_bind.text
        imported_records = client.get(f"/api/zones/{zone_id}/records?search=api").json()["items"] + client.get(
            f"/api/zones/{zone_id}/records?search=text"
        ).json()["items"]
        bulk_deleted = client.post(
            f"/api/zones/{zone_id}/records:bulk-delete",
            json={"record_ids": [record["id"] for record in imported_records]},
        )
        assert bulk_deleted.status_code == 200
        assert bulk_deleted.json()["deleted"] == 2
        invalid_import = client.post(
            f"/api/zones/{zone_id}/records/import",
            json={"content": "$ORIGIN other.example.\nwww IN A 192.0.2.30"},
        )
        assert invalid_import.status_code == 422
        assert client.get(f"/api/zones/{zone_id}/records?search=www").json()["total"] == 1
        assert client.get("/api/zones?zone_type=public").json()["total"] == 1
        assert client.delete(f"/api/zones/{zone_id}").status_code == 204


def test_auth_validation_and_private_zone_rules():
    with TestClient(app) as client:
        assert client.get("/api/zones").status_code == 401
        assert client.post("/api/auth/login", json={"email": "khwaish.yadav@route53.local", "password": "wrong"}).status_code == 401
        assert client.post("/api/auth/login", json={"email": "khwaish.yadav@route53.local", "password": "password"}).status_code == 200
        invalid_domain = client.post("/api/zones", json={"name": "not-a-domain"})
        assert invalid_domain.status_code == 422
        missing_vpc = client.post("/api/zones", json={"name": "private.example", "zone_type": "private"})
        assert missing_vpc.status_code == 422
        private_zone = client.post(
            "/api/zones",
            json={"name": "private.example", "zone_type": "private", "vpc_region": "ap-south-1", "vpc_id": "vpc-123"},
        )
        assert private_zone.status_code == 201
        assert client.get("/api/zones?zone_type=private").json()["total"] == 1
        assert client.post("/api/auth/logout").status_code == 204
        assert client.get("/api/zones").status_code == 401


def test_supported_record_types_pagination_and_protected_records():
    with TestClient(app) as client:
        assert client.post(
            "/api/auth/login",
            json={"email": "khwaish.yadav@route53.local", "password": "password"},
        ).status_code == 200
        zone = client.post("/api/zones", json={"name": "records.example"}).json()
        zone_id = zone["id"]
        record_values = {
            "A": "192.0.2.10",
            "AAAA": "2001:db8::10",
            "CNAME": "target.records.example.",
            "TXT": '"placement-ready"',
            "MX": "10 mail.records.example.",
            "NS": "ns1.records.example.",
            "PTR": "host.records.example.",
            "SRV": "10 5 443 service.records.example.",
            "CAA": '0 issue "amazon.com"',
        }
        created = []
        for index, (record_type, value) in enumerate(record_values.items()):
            response = client.post(
                f"/api/zones/{zone_id}/records",
                json={"name": f"record-{index}", "type": record_type, "value": value, "ttl": 300},
            )
            assert response.status_code == 201
            created.append(response.json())

        first_page = client.get(f"/api/zones/{zone_id}/records?page=1&page_size=5")
        second_page = client.get(f"/api/zones/{zone_id}/records?page=2&page_size=5")
        assert first_page.status_code == 200
        assert len(first_page.json()["items"]) == 5
        assert len(second_page.json()["items"]) == 5
        assert client.get(f"/api/zones/{zone_id}/records?record_type=CAA").json()["total"] == 1

        updated = client.patch(f"/api/zones/{zone_id}", json={"description": "All record types"})
        assert updated.status_code == 200
        assert updated.json()["description"] == "All record types"

        apex_records = client.get(f"/api/zones/{zone_id}/records?search=records.example.").json()["items"]
        protected = next(record for record in apex_records if record["type"] == "SOA")
        assert client.delete(f"/api/zones/{zone_id}/records/{protected['id']}").status_code == 400
        assert client.post(
            f"/api/zones/{zone_id}/records:bulk-delete",
            json={"record_ids": [protected["id"], created[0]["id"]]},
        ).status_code == 400
        assert client.get(f"/api/zones/{zone_id}/export?format=xml").status_code == 422
        assert client.delete(f"/api/zones/{zone_id}").status_code == 204
