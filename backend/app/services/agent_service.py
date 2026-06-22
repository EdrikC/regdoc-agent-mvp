import json
import os

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
        "max_tokens": 1400,
    },
)


doc_review_agent = Agent(
    model=model,
    system_prompt="""
You are a medical device regulatory document review agent.

Your job is to review extracted PDF text and identify information relevant to a medical device submission.

Return ONLY valid JSON. Do not include markdown, explanations, or code fences.

Use this exact schema:
{
  "fields": {
    "device_name": string | null,
    "manufacturer": string | null,
    "intended_use": string | null,
    "risk_class": string | null,
    "predicate_device": string | null
  },
  "missing_fields": string[],
  "weak_fields": string[],
  "risk_notes": string[],
  "completion_score": number,
  "summary": string,
  "confidence": "low" | "medium" | "high"
}

Rules:
- Do not invent facts.
- If information is absent, use null and include the field in missing_fields.
- If information is vague, include it in weak_fields.
- completion_score should be from 0 to 100.
"""
)


estar_draft_agent = Agent(
    model=model,
    system_prompt="""
You are an eSTAR-style regulatory drafting agent.

Your job is to transform a document review JSON into a draft regulatory packet.

Important:
- This is NOT an official FDA eSTAR file.
- Do NOT claim the output is submission-ready.
- Do NOT invent regulatory facts.
- If information is missing, clearly say it is missing.
- Use the previous review agent's findings as your source of truth.

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


def parse_agent_json(response) -> dict:
    raw = str(response).strip()

    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return {
            "error": True,
            "message": "Agent did not return valid JSON.",
            "raw_response": raw,
        }


def run_doc_review_agent(text: str) -> dict:
    limited_text = text[:8000]

    response = doc_review_agent(f"""
Review this extracted PDF text.

PDF TEXT:
{limited_text}
""")

    return parse_agent_json(response)


def run_estar_draft_agent(review: dict) -> dict:
    response = estar_draft_agent(f"""
Create an eSTAR-style draft packet from the following document review.

The draft should include these sections:
1. Device Identification
2. Intended Use / Indications for Use
3. Device Classification
4. Predicate Device
5. Summary of Available Evidence
6. Missing Information / Deficiency Notes

DOCUMENT REVIEW JSON:
{json.dumps(review, indent=2)}
""")

    return parse_agent_json(response)


def run_agent_workflow(text: str) -> dict:
    review = run_doc_review_agent(text)

    draft = run_estar_draft_agent(review)

    return {
        "review": review,
        "estar_draft": draft,
        "agent_trace": [
            {
                "agent": "DocReviewAgent",
                "input": "Extracted PDF text",
                "output": "Structured regulatory review JSON",
            },
            {
                "agent": "eSTARDraftAgent",
                "input": "DocReviewAgent output",
                "output": "eSTAR-style draft packet JSON",
            },
        ],
    }