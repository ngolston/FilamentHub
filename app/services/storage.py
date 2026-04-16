"""MinIO / S3-compatible object storage service."""

import uuid
from io import BytesIO

import boto3
from botocore.exceptions import ClientError
from fastapi import UploadFile

from app.core.config import get_settings

settings = get_settings()


def _get_client():
    return boto3.client(
        "s3",
        endpoint_url=f"{'https' if settings.MINIO_SECURE else 'http'}://{settings.MINIO_ENDPOINT}",
        aws_access_key_id=settings.MINIO_ACCESS_KEY,
        aws_secret_access_key=settings.MINIO_SECRET_KEY,
    )


def _ensure_bucket(client) -> None:
    try:
        client.head_bucket(Bucket=settings.MINIO_BUCKET)
    except ClientError:
        client.create_bucket(Bucket=settings.MINIO_BUCKET)
        # Make the bucket publicly readable (presigned URLs work either way)
        client.put_bucket_policy(
            Bucket=settings.MINIO_BUCKET,
            Policy=f"""{{
                "Version": "2012-10-17",
                "Statement": [{{
                    "Effect": "Allow",
                    "Principal": {{"AWS": ["*"]}},
                    "Action": ["s3:GetObject"],
                    "Resource": ["arn:aws:s3:::{settings.MINIO_BUCKET}/*"]
                }}]
            }}""",
        )


async def upload_spool_photo(spool_id: int, file: UploadFile) -> str:
    """Upload a spool photo to MinIO and return its public URL."""
    ext = file.filename.rsplit(".", 1)[-1].lower() if "." in (file.filename or "") else "jpg"
    key = f"spools/{spool_id}/{uuid.uuid4().hex}.{ext}"

    content = await file.read()
    client = _get_client()
    _ensure_bucket(client)

    client.put_object(
        Bucket=settings.MINIO_BUCKET,
        Key=key,
        Body=BytesIO(content),
        ContentType=file.content_type or "image/jpeg",
    )

    base = f"{'https' if settings.MINIO_SECURE else 'http'}://{settings.MINIO_ENDPOINT}"
    return f"{base}/{settings.MINIO_BUCKET}/{key}"


async def upload_avatar(user_id: str, file: UploadFile) -> str:
    """Upload a user avatar to MinIO and return its public URL."""
    ext = file.filename.rsplit(".", 1)[-1].lower() if "." in (file.filename or "") else "jpg"
    if ext not in {"jpg", "jpeg", "png", "webp", "gif"}:
        ext = "jpg"
    key = f"avatars/{user_id}/{uuid.uuid4().hex}.{ext}"

    content = await file.read()
    client = _get_client()
    _ensure_bucket(client)

    client.put_object(
        Bucket=settings.MINIO_BUCKET,
        Key=key,
        Body=BytesIO(content),
        ContentType=file.content_type or "image/jpeg",
    )

    base = f"{'https' if settings.MINIO_SECURE else 'http'}://{settings.MINIO_ENDPOINT}"
    return f"{base}/{settings.MINIO_BUCKET}/{key}"


async def delete_object(key: str) -> None:
    client = _get_client()
    client.delete_object(Bucket=settings.MINIO_BUCKET, Key=key)
