from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pathlib import Path
import uuid

from app.services.pdf_service import extract_text_from_pdf
from app.services.field_extractor import extract_regulatory_fields

app = FastAPI(title="RegDoc Agent MVP")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DATA_DIR = Path(__file__).parent / "data"
DATA_DIR.mkdir(exist_ok=True)

@app.get("/health")
def health():
    return {"status": "ok"}

@app.post("/documents")
async def upload_document(file: UploadFile = File(...)):
    document_id = str(uuid.uuid4())
    file_path = DATA_DIR / f"{document_id}.pdf"

    content = await file.read()
    file_path.write_bytes(content)

    extracted_text = extract_text_from_pdf(file_path)
    regulatory_review = extract_regulatory_fields(extracted_text)

    return {
        "document_id": document_id,
        "filename": file.filename,
        "content_type": file.content_type,
        "size_bytes": len(content),
        "status": "processed",
        "text_preview": extracted_text[:1000],
        "review": regulatory_review,
    }