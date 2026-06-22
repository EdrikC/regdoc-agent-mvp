from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pathlib import Path
import uuid

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

    return {
        "document_id": document_id,
        "filename": file.filename,
        "status": "uploaded"
    }