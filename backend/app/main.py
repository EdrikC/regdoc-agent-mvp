import json
from datetime import datetime, timezone
from pathlib import Path
import uuid

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response

from app.services.agent_service import run_agent_workflow
from app.services.pdf_writer import generate_estar_draft_pdf_bytes
from app.services.pdf_service import extract_text_from_pdf_bytes

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


def document_state_path(document_id: str) -> Path:
    return DATA_DIR / f"{document_id}.json"


def save_document_state(document_state: dict) -> None:
    document_state_path(document_state["document_id"]).write_text(
        json.dumps(document_state, indent=2),
        encoding="utf-8",
    )


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/documents/{document_id}")
def get_document(document_id: str):
    state_path = document_state_path(document_id)
    if not state_path.exists():
        raise HTTPException(status_code=404, detail="Document not found")

    return json.loads(state_path.read_text(encoding="utf-8"))


@app.post("/documents")
async def upload_document(file: UploadFile = File(...)):
    document_id = str(uuid.uuid4())
    content = await file.read()

    extracted_text = extract_text_from_pdf_bytes(content)

    workflow_result = run_agent_workflow(extracted_text)

    document_state = {
        "document_id": document_id,
        "filename": file.filename,
        "content_type": file.content_type,
        "size_bytes": len(content),
        "status": "processed",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "text_preview": extracted_text[:1000],
        "document_type": workflow_result["document_type"],
        "extraction": workflow_result["extraction"],
        "readiness_review": workflow_result["readiness_review"],
        "estar_draft": workflow_result["estar_draft"],
        "agent_trace": workflow_result["agent_trace"],
        "download_url": f"/documents/{document_id}/draft.pdf",
    }

    save_document_state(document_state)

    return document_state


@app.get("/documents/{document_id}/draft.pdf")
def download_draft_pdf(document_id: str):
    state_path = document_state_path(document_id)
    if not state_path.exists():
        raise HTTPException(status_code=404, detail="Document not found")

    document_state = json.loads(state_path.read_text(encoding="utf-8"))
    pdf_content = generate_estar_draft_pdf_bytes(document_state["estar_draft"])

    return Response(
        content=pdf_content,
        media_type="application/pdf",
        headers={
            "Content-Disposition": (
                f'attachment; filename="{document_id}_estar_draft.pdf"'
            )
        },
    )
