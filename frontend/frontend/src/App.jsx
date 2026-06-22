import { useState } from "react";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

function App() {
  const [file, setFile] = useState(null);
  const [result, setResult] = useState(null);
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(false);

  async function checkBackend() {
    const res = await fetch(`${API_URL}/health`);
    const data = await res.json();
    setHealth(data);
  }

  async function uploadFile() {
    if (!file) return;

    setLoading(true);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch(`${API_URL}/documents`, {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      setResult(data);
    } catch (err) {
      setResult({
        error: true,
        message: err.message,
      });
    } finally {
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

      {result && (
        <section className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/70 p-5 shadow-xl shadow-black/20">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-medium text-white">Document Review</h2>
              <p className="text-sm text-slate-400">
                Extracted fields and missing information from the backend.
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
                  {result.review.missing_fields.length}
                </p>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
                <p className="text-xs uppercase tracking-wide text-slate-500">
                  File Size
                </p>
                <p className="mt-2 text-3xl font-semibold text-white">
                  {Math.round(result.size_bytes / 1024)} KB
                </p>
              </div>
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
                      {key.replaceAll("_", " ")}
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