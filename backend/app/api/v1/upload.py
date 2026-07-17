"""File upload API.

POST /api/v1/upload — upload one or more image files
"""

from fastapi import APIRouter, UploadFile, File, HTTPException, status
from app.services.file_storage import validate_file, save_upload

router = APIRouter(prefix="/upload", tags=["upload"])


@router.post("")
async def upload_images(files: list[UploadFile] = File(...)):
    """Upload image files. Accepts single or multiple files.

    Returns list of accessible URLs.
    """
    if not files:
        raise HTTPException(status_code=400, detail="没有上传文件")

    if len(files) > 9:
        raise HTTPException(status_code=400, detail="一次最多上传 9 张图片")

    urls: list[str] = []
    errors: list[dict] = []

    for file in files:
        # Validate content type
        content_type = file.content_type or "application/octet-stream"
        error = validate_file(content_type, 0)
        if error:
            errors.append({"filename": file.filename, "error": error})
            continue

        # Read file data
        file_data = await file.read()
        if not file_data:
            errors.append({"filename": file.filename, "error": "空文件"})
            continue

        # Validate size
        size_error = validate_file(content_type, len(file_data))
        if size_error:
            errors.append({"filename": file.filename, "error": size_error})
            continue

        # Save
        url = await save_upload(file_data, content_type)
        urls.append(url)

    return {
        "urls": urls,
        "errors": errors,
    }
