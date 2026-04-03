def format_for_display(data: dict) -> str:
    """Format the result for terminal output."""
    if "raw" in data:
        return f"[Raw response]\n{data['raw']}"

    lines = [
        f"📌 TITLE:\n  {data.get('title', '—')}",
        f"\n📝 SHORT DESCRIPTION:\n  {data.get('short_description', '—')}",
        f"\n📄 FULL DESCRIPTION:\n  {data.get('full_description', '—')}",
        f"\n🏷️  TAGS:\n  {data.get('tags', '—')}",
        f"\n📂 CATEGORY:\n  {data.get('category', '—')}",
    ]

    usage = data.get("_usage", {})
    if usage:
        cost_input = usage["input_tokens"] * 0.000001
        cost_output = usage["output_tokens"] * 0.000005
        lines.append(
            f"\n💰 TOKENS: input={usage['input_tokens']}, "
            f"output={usage['output_tokens']} "
            f"(~${cost_input + cost_output:.6f})"
        )

    return "\n".join(lines)


def format_for_export(data: dict) -> dict:
    """Return a clean dictionary for platform export (without service fields)."""
    export_keys = ["title", "short_description", "full_description", "tags", "category"]
    return {k: data[k] for k in export_keys if k in data}
