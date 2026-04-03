from openai import OpenAI
import base64
import json
from pathlib import Path

from config import MODEL_ID, MAX_TOKENS, PLATFORM_PROMPT, MAX_IMAGE_SIZE_MB

client = OpenAI()  # reads OPENAI_API_KEY from environment

MEDIA_TYPE_MAP = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",
}


def _validate_size_mb(data: bytes) -> None:
    size_mb = len(data) / (1024 * 1024)
    if size_mb > MAX_IMAGE_SIZE_MB:
        raise ValueError(f"File is too large: {size_mb:.1f} MB (max {MAX_IMAGE_SIZE_MB} MB)")


def _media_type_for_suffix(suffix: str) -> str:
    suf = suffix.lower() if suffix.startswith(".") else f".{suffix.lower()}"
    media_type = MEDIA_TYPE_MAP.get(suf)
    if not media_type:
        raise ValueError(f"Unsupported format: {suffix}")
    return media_type


def _call_openai(images: list[tuple[str, str]], user_hint: str = "", ean: str = "") -> dict:
    prompt_text = "Describe this product image for the platform." if len(images) == 1 else "Describe this product based on the provided images (different angles) for the platform."
    if ean:
        prompt_text += f"\nEAN/Article: {ean}"
    if user_hint:
        prompt_text += f"\nHint: {user_hint}"

    content = []
    for image_data_b64, media_type in images:
        content.append({
            "type": "image_url",
            "image_url": {
                "url": f"data:{media_type};base64,{image_data_b64}"
            },
        })
    content.append({"type": "text", "text": prompt_text})

    messages = [
        {"role": "system", "content": PLATFORM_PROMPT},
        {
            "role": "user",
            "content": content,
        }
    ]

    response = client.chat.completions.create(
        model=MODEL_ID,
        max_tokens=MAX_TOKENS,
        response_format={"type": "json_object"},
        messages=messages,
    )

    raw_text = response.choices[0].message.content

    try:
        result = json.loads(raw_text)
    except Exception:
        result = {"raw": raw_text}

    if response.usage:
        result["_usage"] = {
            "input_tokens": response.usage.prompt_tokens,
            "output_tokens": response.usage.completion_tokens,
        }
    return result


def load_image(image_path: str) -> tuple[str, str]:
    """Load an image and return (base64_data, media_type)."""
    path = Path(image_path)
    if not path.exists():
        raise FileNotFoundError(f"File not found: {image_path}")

    raw = path.read_bytes()
    _validate_size_mb(raw)
    media_type = _media_type_for_suffix(path.suffix.lower())
    image_data = base64.standard_b64encode(raw).decode("utf-8")

    return image_data, media_type


def generate_description(image_path: str, user_hint: str = "", ean: str = "") -> dict:
    """
    Send the image to Claude and get a structured description.

    Args:
        image_path: Path to the image file
        user_hint: Optional hint (e.g., 'this is a kitchen item')
        ean: Optional EAN/Barcode

    Returns:
        dict with fields: title, short_description, full_description, tags, category
    """
    image_data, media_type = load_image(image_path)
    return _call_openai([(image_data, media_type)], user_hint, ean)


def generate_description_from_bytes(
    files: list[tuple[bytes, str]],
    user_hint: str = "",
    ean: str = "",
) -> dict:
    """
    Same as generate_description, but from bytes of the uploaded files.
    """
    images = []
    for data, filename in files:
        _validate_size_mb(data)
        suffix = Path(filename).suffix.lower() or ".jpg"
        media_type = _media_type_for_suffix(suffix)
        image_data = base64.standard_b64encode(data).decode("utf-8")
        images.append((image_data, media_type))
        
    return _call_openai(images, user_hint, ean)
