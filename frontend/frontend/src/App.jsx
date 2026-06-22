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

function statusClasses(status) {
  if (status === "complete") {
    return "border-sky-200 bg-sky-50 text-sky-700";
  }

  if (status === "running") {
    return "active-step border-blue-300 bg-blue-50 text-blue-800";
  }

  if (status === "error") {
    return "border-rose-200 bg-rose-50 text-rose-700";
  }

  return "border-slate-200 bg-white text-slate-500";
}

function App() {
  const [file, setFile] = useState(null);
  const [result, setResult] = useState(null);
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(false);
  const [agentTrace, setAgentTrace] = useState([]);

  const activeStepIndex = agentTrace.findIndex((step) => step.status === "running");
  const completedSteps = agentTrace.filter((step) => step.status === "complete").length;
  const progress =
    agentTrace.length > 0
      ? Math.round((completedSteps / agentTrace.length) * 100)
      : 0;

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
          step.status === "running" ? { ...step, status: "error" } : step
        )
      );
    } finally {
      timers.forEach(clearTimeout);
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-sky-50 text-slate-900">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 py-6 sm:px-6 lg:px-8">
        <header className="mb-6 rounded-lg border border-sky-100 bg-white px-5 py-5 shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="mb-3 inline-flex rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-medium text-sky-700">
                FastAPI · Strands · eSTAR draft
              </div>
              <h1 className="text-3xl font-semibold tracking-tight text-slate-950">
                RegDoc Agent MVP
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                Upload a regulatory PDF, extract the key fields, review the document,
                and generate a downloadable draft packet.
              </p>
            </div>

            <button
              onClick={checkBackend}
              className="inline-flex items-center justify-center rounded-md border border-sky-200 bg-white px-4 py-2 text-sm font-medium text-sky-700 transition hover:bg-sky-50 active:scale-[0.99]"
            >
              {health ? "Backend online" : "Check backend"}
            </button>
          </div>
        </header>

        <section className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="rounded-lg border border-sky-100 bg-white p-5 shadow-sm">
            <h2 className="text-base font-semibold text-slate-950">Upload Document</h2>
            <p className="mt-1 text-sm text-slate-600">
              Select one PDF to start the review workflow.
            </p>

            <label className="mt-5 flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-sky-300 bg-sky-50 px-6 py-9 text-center transition hover:border-blue-400 hover:bg-blue-50">
              <span className="text-sm font-semibold text-slate-900">
                {file ? file.name : "Choose a PDF file"}
              </span>
              <span className="mt-1 text-xs text-slate-500">
                {file ? `${formatFileSize(file.size)} selected` : "PDF only"}
              </span>
              <input
                className="hidden"
                type="file"
                accept="application/pdf"
                onChange={(event) => setFile(event.target.files[0])}
              />
            </label>

            <button
              disabled={!file || loading}
              onClick={uploadFile}
              className="mt-4 inline-flex w-full items-center justify-center rounded-md bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {loading ? (
                <span className="inline-flex items-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                  Processing document
                </span>
              ) : (
                "Upload PDF"
              )}
            </button>

            {health && (
              <div className="mt-4 rounded-md border border-sky-100 bg-sky-50 p-3 text-left text-xs text-sky-800">
                Backend status: {health.status}
              </div>
            )}
          </div>

          <div className="rounded-lg border border-sky-100 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold text-slate-950">
                  Workflow
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  Sequential progress while the backend processes the document.
                </p>
              </div>
              <span className="rounded-full bg-sky-50 px-3 py-1 text-xs font-medium text-sky-700">
                {loading
                  ? activeStepIndex >= 0
                    ? `Step ${activeStepIndex + 1} of ${workflowSteps.length}`
                    : "Starting"
                  : result?.error
                    ? "Stopped"
                    : agentTrace.length > 0
                      ? "Complete"
                      : "Idle"}
              </span>
            </div>

            <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-blue-600 transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>

            <div className="mt-5 space-y-3">
              {(agentTrace.length > 0 ? agentTrace : createTrace(workflowSteps)).map(
                (step, index) => (
                  <div
                    key={`${step.agent}-${index}`}
                    className={`rounded-lg border p-4 transition ${statusClasses(
                      step.status
                    )}`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-current text-xs font-semibold">
                        {step.status === "complete" ? "OK" : index + 1}
                      </div>

                      <div className="min-w-0 flex-1 text-left">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <h3 className="text-sm font-semibold">{step.agent}</h3>
                          <span className="rounded-full bg-white/70 px-2.5 py-1 text-xs font-medium capitalize">
                            {step.status}
                          </span>
                        </div>
                        <p className="mt-2 text-sm text-slate-600">
                          {step.input} to {step.output}
                        </p>
                      </div>
                    </div>
                  </div>
                )
              )}
            </div>
          </div>
        </section>

        {result && (
          <section className="mt-4 rounded-lg border border-sky-100 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-950">
                  Document Review
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  Saved JSON state, extracted fields, and generated draft details.
                </p>
              </div>

              <span
                className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${
                  result.error
                    ? "bg-rose-50 text-rose-700"
                    : "bg-sky-50 text-sky-700"
                }`}
              >
                {result.error ? "Error" : result.status}
              </span>
            </div>

            {result.error && (
              <div className="mt-5 rounded-md border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
                {result.message}
              </div>
            )}

            {!result.error && (
              <>
                <div className="mt-5 grid gap-3 md:grid-cols-4">
                  <InfoCard label="Filename" value={result.filename || "Unknown"} />
                  <InfoCard label="Uploaded" value={formatDate(result.created_at)} />
                  <InfoCard label="File size" value={formatFileSize(result.size_bytes)} />
                  <InfoCard
                    label="Completion"
                    value={`${result.review?.completion_score ?? 0}%`}
                  />
                </div>

                {result.download_url && (
                  <a
                    href={`${API_URL}${result.download_url}`}
                    download
                    className="mt-5 inline-flex w-full items-center justify-center rounded-md bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 active:scale-[0.99] md:w-auto"
                  >
                    Download eSTAR Draft PDF
                  </a>
                )}

                {result.review?.summary && (
                  <div className="mt-5 rounded-lg border border-sky-100 bg-sky-50 p-4 text-left">
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-sm font-semibold text-slate-950">
                        Agent Summary
                      </h3>
                      {result.review.confidence && (
                        <span className="rounded-full bg-white px-3 py-1 text-xs font-medium capitalize text-sky-700">
                          {result.review.confidence} confidence
                        </span>
                      )}
                    </div>
                    <p className="text-sm leading-6 text-slate-700">
                      {result.review.summary}
                    </p>
                  </div>
                )}

                {result.review?.fields && (
                  <div className="mt-5 rounded-lg border border-slate-200 bg-white p-4 text-left">
                    <h3 className="text-sm font-semibold text-slate-950">
                      Extracted Fields
                    </h3>
                    <div className="mt-3 divide-y divide-slate-100">
                      {Object.entries(result.review.fields).map(([key, value]) => (
                        <div
                          key={key}
                          className="grid gap-2 py-3 sm:grid-cols-[180px_1fr]"
                        >
                          <span className="text-sm font-medium text-slate-500">
                            {fieldLabels[key] || key.replaceAll("_", " ")}
                          </span>
                          <span
                            className={`text-sm ${
                              value ? "text-slate-900" : "text-rose-700"
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
                  <details className="mt-5 rounded-lg border border-slate-200 bg-white p-4 text-left">
                    <summary className="cursor-pointer text-sm font-semibold text-slate-950">
                      Text Preview
                    </summary>
                    <pre className="mt-3 max-h-[260px] overflow-auto whitespace-pre-wrap rounded-md bg-slate-50 p-3 text-xs leading-5 text-slate-600">
                      {result.text_preview}
                    </pre>
                  </details>
                )}
              </>
            )}
          </section>
        )}
      </div>
    </main>
  );
}

function InfoCard({ label, value }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 text-left">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 break-words text-sm font-semibold text-slate-950">
        {value}
      </p>
    </div>
  );
}

export default App;
