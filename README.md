# Photo Description Generator

Python application: accepts a photo and generates a structured description for a marketplace eBay, stock photo site, or catalog via the **OpenAI API** (model configured in `config.py`).

## Requirements

- Python 3.10+
- OpenAI API Key

## Installation

```bash
python -m venv venv
venv\Scripts\activate   # Windows
# source venv/bin/activate  # Linux/macOS
pip install -r requirements.txt
```

Create a `.env` file and specify the real API key:

```
OPENAI_API_KEY=sk-...
```

## Usage

```bash
python main.py photo.jpg
python main.py photo.jpg --hint "leather product" --export result.json
python main.py photo.jpg --json-out
```

Help:

```bash
python main.py --help
```

## Project Structure

| File           | Purpose                                  |
| -------------- | ---------------------------------------- |
| `main.py`      | CLI                                      |
| `describer.py` | Image loading, OpenAI API call           |
| `formatter.py` | Console output and JSON export           |
| `config.py`    | Model, limits, system prompt             |

## Cost Estimate (Reference)

Depends on the OpenAI model used (e.g. `gpt-4o`). A typical request usually costs around **~$0.003** per photo (depending on image size and response length).

## Extensions (Ideas)

- Batch folder processing
- Different prompts for Amazon, Etsy, stock photos
- Response validation via Pydantic
- Retry mechanisms (e.g. using tenacity) and logging
- Web application interface
