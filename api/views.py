from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods

from describer import generate_description_from_bytes


@csrf_exempt
@require_http_methods(["POST"])
def describe(request):
    """
    multipart/form-data: field `file` - images, optionally `hint` - text, `ean` - string.
    """
    uploaded_files = request.FILES.getlist("file")
    if not uploaded_files:
        return JsonResponse({"error": "No files found in 'file' field"}, status=400)

    hint = (request.POST.get("hint") or "").strip()
    ean = (request.POST.get("ean") or "").strip()
    
    files_data = []
    for uploaded in uploaded_files:
        files_data.append((uploaded.read(), uploaded.name))

    try:
        result = generate_description_from_bytes(files_data, user_hint=hint, ean=ean)
    except ValueError as e:
        return JsonResponse({"error": str(e)}, status=400)
    except Exception as e:
        return JsonResponse({"error": str(e)}, status=500)

    return JsonResponse(result, json_dumps_params={"ensure_ascii": False})
