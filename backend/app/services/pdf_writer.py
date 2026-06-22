from io import BytesIO
from pathlib import Path

from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer


def generate_estar_draft_pdf_bytes(draft: dict) -> bytes:
    buffer = BytesIO()

    build_estar_draft_pdf(
        target=buffer,
        draft=draft,
    )

    return buffer.getvalue()


def generate_estar_draft_pdf(
    document_id: str,
    draft: dict,
    output_dir: Path,
) -> Path:
    output_path = output_dir / f"{document_id}_estar_draft.pdf"

    build_estar_draft_pdf(
        target=str(output_path),
        draft=draft,
    )

    return output_path


def build_estar_draft_pdf(target, draft: dict) -> None:
    doc = SimpleDocTemplate(
        target,
        pagesize=letter,
        title=draft.get("title", "eSTAR-Style Draft Packet"),
    )

    styles = getSampleStyleSheet()
    story = []

    title = draft.get("title", "eSTAR-Style Draft Packet")

    story.append(Paragraph(title, styles["Title"]))
    story.append(Spacer(1, 16))

    disclaimer = draft.get(
        "disclaimer",
        "This is a draft support artifact and not an official FDA eSTAR submission.",
    )

    story.append(Paragraph(f"<b>Disclaimer:</b> {disclaimer}", styles["BodyText"]))
    story.append(Spacer(1, 16))

    sections = draft.get("sections", [])

    if not sections:
        story.append(
            Paragraph(
                "No draft sections were generated.",
                styles["BodyText"],
            )
        )

    for section in sections:
        section_title = section.get("section_title", "Untitled Section")
        content = section.get("content", "")

        story.append(Paragraph(section_title, styles["Heading2"]))
        story.append(Spacer(1, 6))
        story.append(Paragraph(content, styles["BodyText"]))
        story.append(Spacer(1, 14))

    doc.build(story)
