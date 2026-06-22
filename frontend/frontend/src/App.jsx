import { useState } from "react";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

const fieldLabels = {
  device_name: "Device Name",
  manufacturer: "Manufacturer",
  intended_use: "Intended Use",
  risk_class: "Risk Class",
  predicate_device: "Predicate Device",
};

const workflowSteps = [
  {
    agent: "Upload",
    input: "Selected PDF",
    output: "PDF received by FastAPI",
  },
  {
    agent: "PDF Extractor",
    input: "Uploaded PDF bytes",
    output: "Extracted document text",
  },
  {
    agent: "DocReviewAgent",
    input: "Extracted PDF text",
    output: "Structured regulatory review JSON",
  },
  {
    agent: "eSTARDraftAgent",
    input: "DocReviewAgent output",
    output: "eSTAR-style draft packet JSON",
  },
  {
    agent: "PDF Writer",
    input: "eSTAR-style draft packet JSON",
    output: "Downloadable draft PDF",
  },
];

function formatFileSize(bytes) {
  if (!Number.isFinite(bytes)) return "Unknown";
  return `${Math.round(bytes / 1024)} KB`;
}

function formatDate(value) {
  if (!value) return "Unknown";

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function createTrace(steps, status = "pending") {
  return steps.map((step) => ({ ...step, status }));
}

function completeReturnedTrace(trace = []) {
  return trace.map((step) => ({ ...step, status: "complete" }));
}

function App() {
  const [file, setFile] = useState(null);
  const [result, setResult] = useState(null);
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(false);
  const [agentTrace, setAgentTrace] = useState([]);

  async function checkBackend() {
    const res = await fetch(`${API_URL}/health`);
    const data = await res.json();
    setHealth(data);
  }

  async function uploadFile() {
    if (!file) return;

    setLoading(true);
    setResult(null);
    setAgentTrace(createTrace(workflowSteps));

    const timers = workflowSteps.map((_, stepIndex) =>
      setTimeout(() => {
        setAgentTrace((currentTrace) =>
          currentTrace.map((step, index) => {
            if (index < stepIndex) return { ...step, status: "complete" };
            if (index === stepIndex) return { ...step, status: "running" };
            return { ...step, status: "pending" };
          })
        );
      }, stepIndex * 1200)
    );

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch(`${API_URL}/documents`, {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.detail || "Upload failed");
      }

      setResult(data);
      setAgentTrace([
        { ...workflowSteps[0], status: "complete" },
        { ...workflowSteps[1], status: "complete" },
        ...completeReturnedTrace(data.agent_trace),
        { ...workflowSteps[4], status: "complete" },
      ]);
    } catch (err) {
      setResult({
        error: true,
        message: err.message,
      });
      setAgentTrace((currentTrace) =>
        currentTrace.map((step) =>
          step.status === "running"
            ? { ...step, status: "error" }
            : step
        )
      );
    } finally {
      timers.forEach(clearTimeout);
      setLoading(false);
    }
  }

  return (
  <main className="min-h-screen bg-slate-950 text-slate-100">
    <div className="mx-auto flex min-h-screen max-w-4xl flex-col px-6 py-10">
      <header className="mb-10">
        <div className="mb-3 inline-flex rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-xs font-medium text-slate-300">
          FastAPI · Docker · Strands · MCP
        </div>

        <h1 className="text-4xl font-semibold tracking-tight text-white">
          RegDoc Agent MVP
        </h1>

        <p className="mt-3 mx-auto max-w-xl text-sm leading-6 text-slate-400">
          Upload a regulatory-style PDF, send it to the FastAPI backend, and
          prepare it for document extraction, agent review, and MCP tool access.
        </p>
      </header>

      <div className="grid gap-6 md:grid-cols-[1fr_1.1fr]">
        <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 shadow-xl shadow-black/20">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-medium text-white">
                Backend Status
              </h2>
              <p className="text-sm text-slate-400">
                Confirm the frontend can reach FastAPI.
              </p>
            </div>

            <span
              className={`h-3 w-3 rounded-full ${
                health ? "bg-emerald-400" : "bg-slate-600"
              }`}
            />
          </div>

          <button
            onClick={checkBackend}
            className="w-full rounded-xl bg-slate-100 px-4 py-2.5 text-sm font-medium text-slate-950 transition hover:bg-white active:scale-[0.99]"
          >
            Check Backend
          </button>

          {health && (
            <pre className="mt-4 overflow-auto rounded-xl border border-slate-800 bg-slate-950 p-4 text-xs text-emerald-300">
              {JSON.stringify(health, null, 2)}
            </pre>
          )}
        </section>

        <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 shadow-xl shadow-black/20">
          <h2 className="text-lg font-medium text-white">Upload Document</h2>
          <p className="mt-1 text-sm text-slate-400">
            Start with one PDF. Keep the flow intentionally narrow.
          </p>

          <label className="mt-5 flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-slate-700 bg-slate-950/60 px-6 py-10 text-center transition hover:border-slate-500 hover:bg-slate-950">
            <span className="text-sm font-medium text-slate-200">
              {file ? file.name : "Choose a PDF file"}
            </span>

            <span className="mt-1 text-xs text-slate-500">
              {file
                ? `${Math.round(file.size / 1024)} KB selected`
                : "PDF only for this MVP"}
            </span>

            <input
              className="hidden"
              type="file"
              accept="application/pdf"
              onChange={(e) => setFile(e.target.files[0])}
            />
          </label>

          <button
            disabled={!file || loading}
            onClick={uploadFile}
            className="mt-5 w-full rounded-xl bg-indigo-500 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-indigo-400 active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
          >
            {loading ? "Uploading..." : "Upload PDF"}
          </button>
        </section>
      </div>

      {(loading || agentTrace.length > 0) && (
        <section className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/70 p-5 shadow-xl shadow-black/20">
          <div className="mb-5 flex items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-medium text-white">Agent Trace</h2>
              <p className="text-sm text-slate-400">
                Live workflow status for extraction, review, drafting, and PDF generation.
              </p>
            </div>

            <span
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                loading
                  ? "bg-indigo-500/10 text-indigo-300"
                  : result?.error
                    ? "bg-red-500/10 text-red-300"
                    : "bg-emerald-500/10 text-emerald-300"
              }`}
            >
              {loading ? "Running" : result?.error ? "Stopped" : "Complete"}
            </span>
          </div>

          <div className="space-y-3">
            {agentTrace.map((step, index) => (
              <div
                key={`${step.agent}-${index}`}
                className="flex gap-4 rounded-xl border border-slate-800 bg-slate-950 p-4"
              >
                <div className="flex flex-col items-center">
                  <span
                    className={`flex h-8 w-8 items-center justify-center rounded-full border text-xs font-semibold ${
                      step.status === "complete"
                        ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-300"
                        : step.status === "running"
                          ? "border-indigo-400/40 bg-indigo-400/10 text-indigo-300"
                          : step.status === "error"
                            ? "border-red-400/40 bg-red-400/10 text-red-300"
                            : "border-slate-700 bg-slate-900 text-slate-500"
                    }`}
                  >
                    {step.status === "complete" ? "OK" : index + 1}
                  </span>
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-medium text-white">
                      {step.agent}
                    </h3>

                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-medium capitalize ${
                        step.status === "complete"
                          ? "bg-emerald-500/10 text-emerald-300"
                          : step.status === "running"
                            ? "bg-indigo-500/10 text-indigo-300"
                            : step.status === "error"
                              ? "bg-red-500/10 text-red-300"
                              : "bg-slate-800 text-slate-400"
                      }`}
                    >
                      {step.status}
                    </span>
                  </div>

                  <p className="mt-2 text-sm leading-6 text-slate-300">
                    <span className="text-slate-500">Input:</span> {step.input}
                  </p>
                  <p className="text-sm leading-6 text-slate-300">
                    <span className="text-slate-500">Output:</span> {step.output}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {result && (
        <section className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/70 p-5 shadow-xl shadow-black/20">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-medium text-white">Document Review</h2>
              <p className="text-sm text-slate-400">
                Saved document state, extracted fields, and agent review.
              </p>
            </div>

            <span
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                result.error
                  ? "bg-red-500/10 text-red-300"
                  : "bg-emerald-500/10 text-emerald-300"
              }`}
            >
              {result.error ? "Error" : result.status}
            </span>
          </div>

          {result.download_url && !result.error && (
            <a
              href={`${API_URL}${result.download_url}`}
              download
              className="mb-6 inline-flex w-full items-center justify-center rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-emerald-400 active:scale-[0.99] md:w-auto"
            >
              Download eSTAR Draft PDF
            </a>
          )}

          {result.error && (
            <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-200">
              {result.message}
            </div>
          )}

          {!result.error && (
            <div className="mb-6 grid gap-3 md:grid-cols-2">
              <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
                <p className="text-xs uppercase tracking-wide text-slate-500">
                  Document ID
                </p>
                <p className="mt-2 break-all text-sm font-medium text-slate-100">
                  {result.document_id}
                </p>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
                <p className="text-xs uppercase tracking-wide text-slate-500">
                  Uploaded
                </p>
                <p className="mt-2 text-sm font-medium text-slate-100">
                  {formatDate(result.created_at)}
                </p>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
                <p className="text-xs uppercase tracking-wide text-slate-500">
                  Filename
                </p>
                <p className="mt-2 break-words text-sm font-medium text-slate-100">
                  {result.filename || "Unknown"}
                </p>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
                <p className="text-xs uppercase tracking-wide text-slate-500">
                  Content Type
                </p>
                <p className="mt-2 text-sm font-medium text-slate-100">
                  {result.content_type || "Unknown"}
                </p>
              </div>
            </div>
          )}

          {result.review && (
            <div className="mb-6 grid gap-4 md:grid-cols-3">
              <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
                <p className="text-xs uppercase tracking-wide text-slate-500">
                  Completion
                </p>
                <p className="mt-2 text-3xl font-semibold text-white">
                  {result.review.completion_score}%
                </p>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
                <p className="text-xs uppercase tracking-wide text-slate-500">
                  Missing Fields
                </p>
                <p className="mt-2 text-3xl font-semibold text-white">
                  {result.review.missing_fields?.length ?? 0}
                </p>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
                <p className="text-xs uppercase tracking-wide text-slate-500">
                  File Size
                </p>
                <p className="mt-2 text-3xl font-semibold text-white">
                  {formatFileSize(result.size_bytes)}
                </p>
              </div>
            </div>
          )}

          {result.review?.summary && (
            <div className="mb-6 rounded-xl border border-slate-800 bg-slate-950 p-4">
              <div className="mb-3 flex items-center justify-between gap-4">
                <h3 className="text-sm font-medium text-white">
                  Agent Summary
                </h3>

                {result.review.confidence && (
                  <span className="rounded-full bg-indigo-500/10 px-3 py-1 text-xs font-medium capitalize text-indigo-300">
                    {result.review.confidence} confidence
                  </span>
                )}
              </div>

              <p className="text-sm leading-6 text-slate-300">
                {result.review.summary}
              </p>
            </div>
          )}

          {result.review?.fields && (
            <div className="mb-6 rounded-xl border border-slate-800 bg-slate-950 p-4">
              <h3 className="mb-3 text-sm font-medium text-white">
                Extracted Fields
              </h3>

              <div className="space-y-3">
                {Object.entries(result.review.fields).map(([key, value]) => (
                  <div
                    key={key}
                    className="flex items-start justify-between gap-4 border-b border-slate-800 pb-3 last:border-b-0 last:pb-0"
                  >
                    <span className="text-sm text-slate-400">
                      {fieldLabels[key] || key.replaceAll("_", " ")}
                    </span>

                    <span
                      className={`max-w-md text-right text-sm ${
                        value ? "text-slate-100" : "text-red-300"
                      }`}
                    >
                      {value || "Missing"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {result.text_preview && (
            <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
              <h3 className="mb-3 text-sm font-medium text-white">
                Text Preview
              </h3>

              <pre className="max-h-[260px] overflow-auto whitespace-pre-wrap text-xs leading-5 text-slate-300">
                {result.text_preview}
              </pre>
            </div>
          )}
        </section>
      )}
    </div>
  </main>
);
}

export default App;
