from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator

RecordType = Literal["A", "AAAA", "CNAME", "TXT", "MX", "NS", "PTR", "SRV", "CAA"]


class LoginRequest(BaseModel):
    email: str
    password: str


class ZoneCreate(BaseModel):
    name: str = Field(min_length=1, max_length=253)
    description: str = Field(default="", max_length=255)
    zone_type: Literal["public", "private"] = "public"
    vpc_region: str | None = None
    vpc_id: str | None = None

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str) -> str:
        value = value.strip().lower()
        if not value:
            raise ValueError("Domain name is required")
        name = value[:-1] if value.endswith(".") else value
        labels = name.split(".")
        if len(labels) < 2 or any(not label or len(label) > 63 for label in labels):
            raise ValueError("Enter a valid domain name such as example.com")
        if any(label.startswith("-") or label.endswith("-") or not all(ch.isalnum() or ch == "-" for ch in label) for label in labels):
            raise ValueError("Domain labels can contain only letters, numbers, and hyphens")
        return f"{name}."

    @model_validator(mode="after")
    def validate_private_zone(self):
        if self.zone_type == "private" and (not self.vpc_region or not self.vpc_id):
            raise ValueError("Private hosted zones require a VPC region and VPC ID")
        return self


class ZoneUpdate(BaseModel):
    description: str = Field(default="", max_length=255)


class RecordCreate(BaseModel):
    name: str = Field(default="", max_length=253)
    type: RecordType
    value: str = Field(min_length=1, max_length=4000)
    ttl: int = Field(default=300, ge=0, le=2147483647)
    routing_policy: str = Field(default="Simple", max_length=50)
    evaluate_target_health: bool = False

    @field_validator("name")
    @classmethod
    def clean_name(cls, value: str) -> str:
        return value.strip()


class RecordUpdate(RecordCreate):
    pass


class BindImportRequest(BaseModel):
    content: str = Field(min_length=1, max_length=1_000_000)


class BulkDeleteRequest(BaseModel):
    record_ids: list[str] = Field(min_length=1, max_length=100)
