import os
from dotenv import load_dotenv

load_dotenv()

MODEL_ID = os.getenv("MODEL_ID", "gpt-4o")
MAX_TOKENS = 1024
MAX_IMAGE_SIZE_MB = 5
SUPPORTED_FORMATS = [".jpg", ".jpeg", ".png", ".gif", ".webp"]

# Description parameters
PLATFORM_PROMPT = """
You are a professional copywriter for an e-commerce platform.
Analyze the image(s) and create a structured description in English:

1. **title** (up to 80 characters) - Catchy, with keywords
2. **short_description** (1-2 sentences) - For product card preview
3. **full_description** (3-5 sentences) - Details, materials, features
4. **tags** (5-10 items) - Comma-separated, for SEO and filtering
5. **category** - Suggest the most appropriate category

Respond strictly in JSON format without markdown wrapping.
"""
