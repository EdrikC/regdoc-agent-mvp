from io import BytesIO
from pathlib import Path
from pypdf import PdfReader


def extract_text_from_pdf_bytes(content: bytes) -> str:
    reader = PdfReader(BytesIO(content))
    return extract_text_from_reader(reader)


def extract_text_from_pdf(file_path: Path) -> str:
    reader = PdfReader(str(file_path))
    return extract_text_from_reader(reader)


def extract_text_from_reader(reader: PdfReader) -> str:
    pages_text = []

    for page in reader.pages:
        text = page.extract_text() or ""
        pages_text.append(text)

    return "\n\n".join(pages_text).strip()
