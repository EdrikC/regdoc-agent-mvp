import json
import os
from typing import Any

from strands import Agent
from strands.models.openai import OpenAIModel


OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")

if not OPENAI_API_KEY:
    raise RuntimeError("OPENAI_API_KEY is missing from environment variables.")


model = OpenAIModel(
    client_args={
        "api_key": OPENAI_API_KEY,
    },
    model_id="gpt-4o-mini",
    params={
        "temperature": 0.1,
        "max_tokens": 1800,
    },
)


extraction_agent = Agent(
    model=model,
    system_prompt="""
You are an FDA 510(k) regulatory document extraction agent.

Your job is to extract structured facts from raw PDF text from a medical device regulatory document.

Return ONLY valid JSON. Do not include markdown, explanations, or code fences.

Use this exact schema:
{
  "submission": {
    "submission_type": string | null,
    "k_number": string | null,
    "decision": string | null,
    "decision_date": string | null
  },
  "submitter": {
    "company": string | null,
    "contact": string | null,
    "address": string | null,
    "country": string | null
  },
  "device": {
    "trade_name": string | null,
    "common_name": string | null,
    "product_code": string | null,
    "regulation_number": string | null,
    "regulation_name": string | null,
    "regulatory_class": string | null,
    "classification_panel": string | null
  },
  "predicate_device": {
    "trade_name": string | null,
    "common_name": string | null,
    "submitter": string | null,
    "k_number": string | null
  },
  "intended_use": {
    "population": string | null,
    "use_case": string | null,
    "monitoring_type": string | null,
    "prescription_or_otc": string | null,
    "full_text": string | null
  },
  "device_description": {
    "summary": string | null,
    "technology": string | null,
    "accessories": string | null
  },
  "predicate_comparison": {
    "comparison_present": boolean,
    "similarities": string[],
    "differences": string[]
  },
  "evidence": {
    "performance_studies_present": boolean,
    "clinical_subjects": number | null,
    "study_type": string | null,
    "standards_identified": string[],
    "software_validation_mentioned": boolean,
    "quality_system_mentioned": boolean,
    "biocompatibility_mentioned": boolean
  },
  "source_quality": {
    "ocr_quality": "low" | "medium" | "high",
    "extraction_warnings": string[]
  },
  "missing_fields": string[]
}

Rules:
- Do not invent facts.
- Use null when a field is not available.
- Use [] for empty arrays.
- If the text is OCR-noisy, still extract what is reasonably supported.
- Include unavailable important fields in missing_fields.
- Normalize obvious OCR variants when confidence is high, for example Class 11 may mean Class II.
"""
)


readiness_reviewer_agent = Agent(
    model=model,
    system_prompt="""
You are an FDA 510(k) regulatory readiness reviewer.

Your job is to review a structured 510(k) extraction JSON and evaluate whether it contains the core information expected in a public 510(k) summary / clearance packet.

Return ONLY valid JSON. Do not include markdown, explanations, or code fences.

Use this exact schema:
{
  "readiness_score": number,
  "readiness_level": "low" | "medium" | "high",
  "strengths": string[],
  "gaps_or_risks": [
    {
      "severity": "low" | "medium" | "high",
      "issue": string,
      "why_it_matters": string,
      "recommended_next_step": string
    }
  ],
  "recommended_next_steps": string[],
  "regulatory_takeaway": string
}

Review criteria:
- Device identification completeness
- Submitter information completeness
- Classification and product code availability
- Predicate device identification
- Intended use / indications clarity
- Predicate comparison presence
- Performance evidence presence
- Standards / software / quality system evidence
- OCR/source quality risks

Scoring:
- readiness_score must be an integer from 0 to 100.
- readiness_level must match the score: low = 0-49, medium = 50-79, high = 80-100.
- Do not use a 0-10 scale.

Important:
- Do not claim a device is safe, effective, compliant, or submission-ready.
- You may say the document appears to contain public-summary evidence for a cleared 510(k) if supported by the extraction.
- Be practical and concise.
"""
)


estar_draft_agent = Agent(
    model=model,
    system_prompt="""
You are an eSTAR-style regulatory drafting agent.

Your job is to transform a structured 510(k) extraction and readiness review into a draft regulatory packet outline.

Important:
- This is NOT an official FDA eSTAR file.
- Do NOT claim the output is submission-ready.
- Do NOT invent regulatory facts.
- If information is missing, clearly say it is missing.
- Use the extraction JSON and readiness review as your source of truth.

Return ONLY valid JSON. Do not include markdown, explanations, or code fences.

Use this exact schema:
{
  "title": string,
  "sections": [
    {
      "section_title": string,
      "content": string
    }
  ],
  "disclaimer": string
}
"""
)


def parse_agent_json(response: Any) -> dict:
    raw = str(response).strip()

    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return {
            "error": True,
            "message": "Agent did not return valid JSON.",
            "raw_response": raw,
        }


def run_510k_extraction_agent(text: str) -> dict:
    limited_text = text[:12000]

    response = extraction_agent(f"""
Extract a structured FDA 510(k) profile from the following PDF text.

PDF TEXT:
{limited_text}
""")

    return parse_agent_json(response)


def run_readiness_reviewer_agent(extraction: dict) -> dict:
    response = readiness_reviewer_agent(f"""
Review this structured 510(k) extraction and evaluate regulatory readiness.

STRUCTURED 510(k) EXTRACTION JSON:
{json.dumps(extraction, indent=2)}
""")

    review = parse_agent_json(response)
    score = review.get("readiness_score")

    if isinstance(score, (int, float)):
        if 0 <= score <= 10:
            score = score * 10

        score = max(0, min(100, round(score)))
        review["readiness_score"] = score

        if score < 50:
            review["readiness_level"] = "low"
        elif score < 80:
            review["readiness_level"] = "medium"
        else:
            review["readiness_level"] = "high"

    return review


def run_estar_draft_agent(extraction: dict, readiness_review: dict) -> dict:
    response = estar_draft_agent(f"""
Create an eSTAR-style draft packet outline from the following structured 510(k) extraction and readiness review.

The draft should include these sections:
1. Device Identification
2. Submitter Information
3. Intended Use / Indications for Use
4. Device Classification
5. Predicate Device
6. Device Description
7. Predicate Comparison
8. Performance / Evidence Summary
9. Standards and Validation Evidence
10. Missing Information / Deficiency Notes
11. Recommended Next Steps

STRUCTURED 510(k) EXTRACTION JSON:
{json.dumps(extraction, indent=2)}

READINESS REVIEW JSON:
{json.dumps(readiness_review, indent=2)}
""")

    return parse_agent_json(response)


def run_agent_workflow(text: str) -> dict:
    extraction = run_510k_extraction_agent(text)

    readiness_review = run_readiness_reviewer_agent(extraction)

    draft = run_estar_draft_agent(
        extraction=extraction,
        readiness_review=readiness_review,
    )

    return {
        "document_type": "FDA 510(k) Clearance Packet",
        "extraction": extraction,
        "readiness_review": readiness_review,
        "estar_draft": draft,
        "agent_trace": [
            {
                "agent": "510kExtractionAgent",
                "input": "Extracted PDF text",
                "output": "Structured 510(k) profile JSON",
            },
            {
                "agent": "510kReadinessReviewerAgent",
                "input": "Structured 510(k) profile JSON",
                "output": "Readiness score, strengths, risks, and next steps",
            },
            {
                "agent": "eSTARDraftAgent",
                "input": "510(k) profile + readiness review",
                "output": "eSTAR-style draft packet outline JSON",
            },
        ],
    }
