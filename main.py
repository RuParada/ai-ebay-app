import json

import click
from dotenv import load_dotenv

from describer import generate_description
from formatter import format_for_display, format_for_export

load_dotenv()


@click.command(context_settings={"help_option_names": ["--help"]})
@click.argument("image_path", type=click.Path(exists=True))
@click.option("--hint", "-h", default="", help="Hint about photo content")
@click.option("--json-out", "-j", is_flag=True, help="Output result in JSON")
@click.option(
    "--export",
    "-e",
    type=click.Path(),
    default=None,
    help="Save description to JSON file",
)
def main(image_path, hint, json_out, export):
    """Generates a photo description using Claude API."""
    click.echo(f"⏳ Analyzing image: {image_path}")

    result = generate_description(image_path, user_hint=hint)

    if json_out:
        click.echo(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        click.echo(format_for_display(result))

    if export:
        export_data = format_for_export(result)
        with open(export, "w", encoding="utf-8") as f:
            json.dump(export_data, f, ensure_ascii=False, indent=2)
        click.echo(f"\n✅ Description saved to: {export}")


if __name__ == "__main__":
    main()
