import { useState } from "react";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

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
    agent: "ExtractionAgent",
    input: "Extracted PDF text",
    output: "Structured 510(k) profile JSON",
  },
  {
    agent: "ReadinessReviewerAgent",
    input: "Structured 510(k) profile JSON",
    output: "Readiness score, strengths, risks, and next steps",
  },
  {
    agent: "eSTARDraftAgent",
    input: "510(k) profile + readiness review",
    output: "eSTAR-style draft packet outline JSON",
  },
  {
    agent: "PDF Writer",
    input: "eSTAR-style draft packet outline JSON",
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

function formatCurrentDate() {
  const parts = new Intl.DateTimeFormat(undefined, {
    timeZone: "America/New_York",
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).formatToParts(new Date());

  const getPart = (type) => parts.find((part) => part.type === type)?.value || "";

  return `${getPart("weekday")} · ${getPart("month")} ${getPart("day")} ${getPart(
    "year"
  )}`.toUpperCase();
}

function createTrace(steps, status = "pending") {
  return steps.map((step) => ({ ...step, status }));
}

function completeReturnedTrace(trace = []) {
  return trace.map((step) => ({ ...step, status: "complete" }));
}

function humanizeKey(key) {
  return key.replaceAll("_", " ");
}

function formatDisplayValue(value) {
  if (value === null || value === undefined || value === "") return "Missing";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.length > 0 ? value.join(", ") : "None";
  return String(value);
}

function normalizeReadinessScore(readinessReview, fallbackScore = 0) {
  const rawScore = readinessReview?.readiness_score ?? fallbackScore;
  const numericScore = Number(rawScore);

  if (!Number.isFinite(numericScore)) return 0;

  if (numericScore >= 0 && numericScore <= 10 && readinessReview?.readiness_level) {
    return Math.round(numericScore * 10);
  }

  return Math.max(0, Math.min(100, Math.round(numericScore)));
}

function statusClasses(status) {
  if (status === "complete") {
    return "border-cyan-300 bg-cyan-50/80 text-cyan-800";
  }

  if (status === "running") {
    return "border-cyan-400 bg-white text-cyan-900 shadow-[0_0_0_1px_rgba(34,211,238,0.18),0_20px_60px_rgba(8,145,178,0.12)]";
  }

  if (status === "error") {
    return "border-rose-300 bg-rose-50 text-rose-800";
  }

  return "border-slate-200 bg-white/70 text-slate-500";
}

function App() {
  const [file, setFile] = useState(null);
  const [result, setResult] = useState(null);
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(false);
  const [agentTrace, setAgentTrace] = useState([]);

  const completedSteps = agentTrace.filter((step) => step.status === "complete").length;
  const progress =
    agentTrace.length > 0 ? Math.round((completedSteps / agentTrace.length) * 100) : 0;
  const extraction = result?.extraction || result?.review?.fields || null;
  const readinessReview = result?.readiness_review || result?.review || null;
  const readinessScore = normalizeReadinessScore(
    readinessReview,
    result?.review?.completion_score
  );
  const extractionSections = extraction
    ? Object.values(extraction).some(
        (value) => value && typeof value === "object" && !Array.isArray(value)
      )
      ? Object.entries(extraction)
      : [["extracted_fields", extraction]]
    : [];

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
        { ...workflowSteps[5], status: "complete" },
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
    <main className="min-h-screen overflow-hidden bg-[#f3fbff] text-slate-950">
      <div className="pointer-events-none fixed inset-0 bg-[linear-gradient(to_right,rgba(15,118,110,0.07)_1px,transparent_1px),linear-gradient(to_bottom,rgba(15,118,110,0.07)_1px,transparent_1px)] bg-[size:32px_32px]" />
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_15%_20%,rgba(34,211,238,0.20),transparent_28%),radial-gradient(circle_at_90%_10%,rgba(14,165,233,0.10),transparent_35%)]" />

      <div className="relative mx-auto flex min-h-screen w-full max-w-7xl flex-col px-6 py-8">
        <header className="border-b border-cyan-500/40 pb-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="font-mono text-4xl font-black uppercase tracking-tighter text-slate-950 md:text-5xl">
                REGDOC AGENT{" "}
                <span className="text-cyan-700">/ ESTAR DRAFT</span>
              </h1>
            </div>

            <div className="flex items-center gap-4 font-mono text-[11px] uppercase tracking-[0.26em] text-slate-500">
              <span
                className={`inline-flex items-center rounded-md border px-3 py-1 ${
                  health
                    ? "border-cyan-300 bg-cyan-50 text-cyan-700"
                    : "border-slate-300 bg-white/70"
                }`}
              >
                <span
                  className={`mr-2 h-1.5 w-1.5 rounded-full ${
                    health ? "bg-cyan-500" : "bg-slate-400"
                  }`}
                />
                {health ? "On Air" : "Offline"}
              </span>

              <span>{formatCurrentDate()}</span>
              <span>Eastern Time</span>
            </div>
          </div>
        </header>

        <section className="grid flex-1 gap-10 py-10 lg:grid-cols-[330px_1fr]">
          <aside className="self-start rounded-xl border border-slate-200 bg-white/80 p-5 shadow-[0_24px_80px_rgba(8,145,178,0.16)] backdrop-blur">
            <div className="flex items-center gap-4">
              <div className="relative flex h-16 w-16 items-center justify-center rounded-full border border-cyan-200 bg-cyan-50">
                <div className="absolute h-12 w-12 rounded-full border border-cyan-200" />
                <div className="h-8 w-8 rounded-full bg-cyan-500 shadow-[0_0_24px_rgba(6,182,212,0.65)]" />
              </div>

              <div className="font-mono uppercase">
                <p className="text-[11px] tracking-[0.26em] text-slate-400">
                  RegDoc · Agent Line
                </p>
                <p className="mt-1 text-sm font-bold tracking-[0.22em] text-cyan-700">
                  {loading ? "Processing" : result ? "Complete" : "Standing By"}
                </p>
              </div>
            </div>

            <button
              onClick={checkBackend}
              className="mt-6 w-full rounded-md border border-slate-300 bg-slate-100 px-4 py-3 font-mono text-xs font-bold uppercase tracking-[0.22em] text-slate-700 transition hover:bg-white active:scale-[0.99]"
            >
              {health ? "Backend Online" : "Check Backend"}
            </button>

            <div className="mt-6 border-t border-slate-200 pt-5">
              <p className="font-mono text-[11px] font-bold uppercase tracking-[0.24em] text-cyan-700">
                Upload PDF
              </p>

              <label className="mt-4 block cursor-pointer rounded-md border border-dashed border-cyan-300 bg-cyan-50/60 p-4 transition hover:bg-cyan-50">
                <span className="block truncate font-mono text-xs font-bold uppercase tracking-[0.16em] text-slate-800">
                  {file ? file.name : "Choose file"}
                </span>
                <span className="mt-2 block font-mono text-[11px] uppercase tracking-[0.18em] text-slate-500">
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
                className="mt-4 w-full rounded-md bg-cyan-700 px-4 py-3 font-mono text-xs font-bold uppercase tracking-[0.2em] text-white transition hover:bg-cyan-600 active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {loading ? "Running Agents..." : "Start Review"}
              </button>
            </div>

            <div className="mt-6 border-t border-slate-200 pt-5">
              <p className="font-mono text-[11px] font-bold uppercase tracking-[0.24em] text-slate-400">
                Agent Message
              </p>
              <p className="mt-3 font-mono text-xs leading-5 text-slate-700">
                Hey, this is your regulatory document workflow. Upload one PDF and I’ll
                extract the relevant fields, run the agent handoff, and generate a
                draft packet.
              </p>
            </div>

            {health && (
              <div className="mt-5 rounded-md border border-cyan-200 bg-cyan-50 p-3 font-mono text-[11px] uppercase tracking-[0.18em] text-cyan-800">
                Health: {health.status}
              </div>
            )}
          </aside>

          <section className="min-w-0">
            <div className="mb-8 grid grid-cols-[42px_1fr] gap-5">
              <div className="font-mono text-xs font-bold text-cyan-700">01</div>
              <div>
                <h2 className="font-mono text-2xl font-black uppercase tracking-[0.12em] text-slate-950">
                  Workflow
                </h2>

                <div className="mt-6 grid gap-4 md:grid-cols-3">
                  {(agentTrace.length > 0 ? agentTrace : createTrace(workflowSteps)).map(
                    (step, index) => (
                      <div
                        key={`${step.agent}-${index}`}
                        className={`min-h-[122px] rounded-lg border p-4 transition ${statusClasses(
                          step.status
                        )}`}
                      >
                        <p className="font-mono text-3xl font-black leading-none tracking-tight">
                          {String(index + 1).padStart(2, "0")}
                        </p>
                        <p className="mt-4 font-mono text-xs font-bold uppercase tracking-[0.18em]">
                          {step.agent}
                        </p>
                        <p className="mt-3 text-xs leading-5 text-slate-500">
                          {step.output}
                        </p>
                      </div>
                    )
                  )}
                </div>
              </div>
            </div>

            <div className="mb-8 grid grid-cols-[42px_1fr] gap-5">
              <div className="font-mono text-xs font-bold text-slate-300">02</div>
              <div>
                <div className="flex items-center justify-between border-t border-slate-200 pt-5">
                  <h2 className="font-mono text-lg font-black uppercase tracking-[0.14em] text-slate-400">
                    Progress
                  </h2>
                  <span className="font-mono text-xs font-bold uppercase tracking-[0.2em] text-cyan-700">
                    {progress}%
                  </span>
                </div>

                <div className="mt-4 h-2 overflow-hidden rounded-full bg-white">
                  <div
                    className="h-full rounded-full bg-cyan-600 transition-all duration-500"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            </div>

            {result && (
              <div className="grid grid-cols-[42px_1fr] gap-5">
                <div className="font-mono text-xs font-bold text-slate-300">03</div>

                <div className="rounded-xl border border-slate-200 bg-white/80 p-6 shadow-[0_24px_80px_rgba(8,145,178,0.10)] backdrop-blur">
                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div>
                      <h2 className="font-mono text-2xl font-black uppercase tracking-[0.12em] text-slate-950">
                        Details
                      </h2>
                      <p className="mt-2 text-sm text-slate-500">
                        Extracted fields, agent findings, and generated draft output.
                      </p>
                    </div>

                    <span
                      className={`inline-flex rounded-md border px-3 py-1 font-mono text-[11px] font-bold uppercase tracking-[0.18em] ${
                        result.error
                          ? "border-rose-200 bg-rose-50 text-rose-700"
                          : "border-cyan-200 bg-cyan-50 text-cyan-700"
                      }`}
                    >
                      {result.error ? "Error" : result.status}
                    </span>
                  </div>

                  {result.error && (
                    <div className="mt-6 rounded-md border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
                      {result.message}
                    </div>
                  )}

                  {!result.error && (
                    <>
                      <div className="mt-6 grid gap-3 md:grid-cols-4">
                        <InfoCard label="Filename" value={result.filename || "Unknown"} />
                        <InfoCard label="Uploaded" value={formatDate(result.created_at)} />
                        <InfoCard label="File size" value={formatFileSize(result.size_bytes)} />
                        <InfoCard label="Readiness" value={`${readinessScore}%`} />
                      </div>

                      {result.download_url && (
                        <a
                          href={`${API_URL}${result.download_url}`}
                          download
                          className="mt-6 inline-flex w-full items-center justify-center rounded-md bg-slate-950 px-4 py-3 font-mono text-xs font-bold uppercase tracking-[0.18em] text-white transition hover:bg-cyan-700 active:scale-[0.99] md:w-auto"
                        >
                          Download eSTAR Draft PDF
                        </a>
                      )}

                      {readinessReview?.regulatory_takeaway && (
                        <div className="mt-6 rounded-lg border border-cyan-100 bg-cyan-50/70 p-5">
                          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                            <h3 className="font-mono text-xs font-black uppercase tracking-[0.2em] text-slate-950">
                              Readiness Takeaway
                            </h3>
                            {readinessReview.readiness_level && (
                              <span className="rounded-md bg-white px-3 py-1 font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-cyan-700">
                                {readinessReview.readiness_level} Readiness
                              </span>
                            )}
                          </div>
                          <p className="text-sm leading-6 text-slate-700">
                            {readinessReview.regulatory_takeaway}
                          </p>
                        </div>
                      )}

                      {extraction && (
                        <div className="mt-6 rounded-lg border border-slate-200 bg-white p-5">
                          <h3 className="font-mono text-xs font-black uppercase tracking-[0.2em] text-slate-950">
                            510(k) Extraction
                          </h3>

                          <div className="mt-4 grid gap-6 lg:grid-cols-2">
                            {extractionSections
                              .filter(
                                ([, value]) =>
                                  value && typeof value === "object" && !Array.isArray(value)
                              )
                              .map(([sectionKey, sectionValue]) => (
                                <DataSection
                                  key={sectionKey}
                                  title={humanizeKey(sectionKey)}
                                  data={sectionValue}
                                />
                              ))}
                          </div>

                          {extraction.missing_fields?.length > 0 && (
                            <div className="mt-6 border-t border-slate-100 pt-5">
                              <ListBlock
                                title="Missing Fields"
                                items={extraction.missing_fields}
                              />
                            </div>
                          )}
                        </div>
                      )}

                      {readinessReview && (
                        <div className="mt-6 rounded-lg border border-slate-200 bg-white p-5">
                          <h3 className="font-mono text-xs font-black uppercase tracking-[0.2em] text-slate-950">
                            Agent Readiness Review
                          </h3>

                          <div className="mt-4 grid gap-3 md:grid-cols-2">
                            <ListBlock title="Strengths" items={readinessReview.strengths} />
                            <ListBlock
                              title="Recommended Next Steps"
                              items={readinessReview.recommended_next_steps}
                            />
                          </div>

                          {readinessReview.gaps_or_risks?.length > 0 && (
                            <div className="mt-5">
                              <h4 className="font-mono text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">
                                Gaps or Risks
                              </h4>
                              <div className="mt-3 space-y-3">
                                {readinessReview.gaps_or_risks.map((risk, index) => (
                                  <div
                                    key={`${risk.issue}-${index}`}
                                    className="rounded-md border border-slate-100 bg-slate-50 p-4"
                                  >
                                    <div className="flex flex-wrap items-center gap-2">
                                      <span className="rounded bg-white px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-rose-700">
                                        {risk.severity || "Risk"}
                                      </span>
                                      <h5 className="text-sm font-semibold text-slate-950">
                                        {risk.issue}
                                      </h5>
                                    </div>
                                    <p className="mt-2 text-sm leading-6 text-slate-600">
                                      {risk.why_it_matters}
                                    </p>
                                    <p className="mt-2 text-sm leading-6 text-slate-800">
                                      <span className="font-semibold">Next step:</span>{" "}
                                      {risk.recommended_next_step}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {result.estar_draft?.sections && (
                        <div className="mt-6 rounded-lg border border-slate-200 bg-white p-5">
                          <h3 className="font-mono text-xs font-black uppercase tracking-[0.2em] text-slate-950">
                            eSTAR Draft Sections
                          </h3>

                          <div className="mt-4 space-y-5">
                            {result.estar_draft.sections.map((section) => (
                              <div
                                key={section.section_title}
                                className="border-b border-slate-100 pb-5 last:border-b-0 last:pb-0"
                              >
                                <h4 className="font-mono text-xs font-black uppercase tracking-[0.18em] text-cyan-700">
                                  {section.section_title}
                                </h4>
                                <p className="mt-2 text-sm leading-6 text-slate-700">
                                  {section.content}
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {result.text_preview && (
                        <details className="mt-6 rounded-lg border border-slate-200 bg-white p-5">
                          <summary className="cursor-pointer font-mono text-xs font-black uppercase tracking-[0.2em] text-slate-950">
                            Text Preview
                          </summary>
                          <pre className="mt-4 max-h-[260px] overflow-auto whitespace-pre-wrap rounded-md bg-slate-50 p-4 font-mono text-xs leading-5 text-slate-600">
                            {result.text_preview}
                          </pre>
                        </details>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}
          </section>
        </section>

        <footer className="border-t border-cyan-500/30 py-4 font-mono text-[11px] uppercase tracking-[0.26em] text-slate-400">
          Processed via FastAPI · Strands Agents · eSTAR-style PDF writer
        </footer>
      </div>
    </main>
  );
}

function InfoCard({ label, value }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white/80 p-4">
      <p className="font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-slate-400">
        {label}
      </p>
      <p className="mt-2 break-words text-sm font-semibold text-slate-950">
        {value}
      </p>
    </div>
  );
}

function DataSection({ title, data }) {
  return (
    <section>
      <h4 className="font-mono text-[11px] font-black uppercase tracking-[0.18em] text-cyan-700">
        {title}
      </h4>
      <div className="mt-3 divide-y divide-slate-100">
        {Object.entries(data).map(([key, value]) => (
          <div key={key} className="grid gap-2 py-3 sm:grid-cols-[180px_1fr]">
            <span className="font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">
              {humanizeKey(key)}
            </span>
            <span
              className={`text-sm leading-6 ${
                value === null || value === undefined || value === ""
                  ? "text-rose-700"
                  : "text-slate-900"
              }`}
            >
              {formatDisplayValue(value)}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function ListBlock({ title, items }) {
  const safeItems = Array.isArray(items) ? items : [];

  return (
    <div>
      <h4 className="font-mono text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">
        {title}
      </h4>
      {safeItems.length > 0 ? (
        <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-700">
          {safeItems.map((item, index) => (
            <li key={`${title}-${index}`}>{item}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-slate-500">None reported.</p>
      )}
    </div>
  );
}

export default App;
