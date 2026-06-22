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
    <main style={{ padding: 32, fontFamily: "sans-serif" }}>
      <h1>RegDoc Agent MVP</h1>

      <section style={{ marginBottom: 24 }}>
        <button onClick={checkBackend}>Check Backend</button>

        {health && (
          <pre>{JSON.stringify(health, null, 2)}</pre>
        )}
      </section>

      <section>
        <input
          type="file"
          accept="application/pdf"
          onChange={(e) => setFile(e.target.files[0])}
        />

        <button disabled={!file || loading} onClick={uploadFile}>
          {loading ? "Uploading..." : "Upload PDF"}
        </button>
      </section>

      {result && (
        <section style={{ marginTop: 24 }}>
          <h2>Result</h2>
          <pre>{JSON.stringify(result, null, 2)}</pre>
        </section>
      )}
    </main>
  );
}

export default App;