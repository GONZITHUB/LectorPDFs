import { useState, useCallback, useRef } from "react";

const DRIVE_API_KEY = import.meta.env.VITE_GOOGLE_API_KEY;
const FOLDER_ID = "1HuFOnjJVx-n-6WnZIm-u4Z3FB4rid-ry";

async function listPDFs() {
  const url = `https://www.googleapis.com/drive/v3/files?q='${FOLDER_ID}'+in+parents+and+mimeType='application/pdf'&key=${DRIVE_API_KEY}&fields=files(id,name)&pageSize=100`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Drive API error: ${res.status}`);
  const data = await res.json();
  return data.files || [];
}

async function searchInFile(fileId, query, searchType) {
  const res = await fetch("/api/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fileId, query, searchType }),
  });
  if (!res.ok) throw new Error(`Search error: ${res.status}`);
  const data = await res.json();
  return data.results || [];
}

export default function App() {
  const [query, setQuery] = useState("");
  const [searchType, setSearchType] = useState("nombre");
  const [status, setStatus] = useState("idle");
  const [log, setLog] = useState([]);
  const [results, setResults] = useState([]);
  const [errorMsg, setErrorMsg] = useState("");
  const abortRef = useRef(false);

  const addLog = (msg) => setLog((l) => [...l, msg]);

  const handleSearch = useCallback(async () => {
    if (!query.trim()) return;
    abortRef.current = false;
    setStatus("loading");
    setLog([]);
    setResults([]);
    setErrorMsg("");

    try {
      addLog("📁 Listando archivos en Google Drive…");
      const files = await listPDFs();

      if (!files.length) throw new Error("No se encontraron PDFs en la carpeta.");
      addLog(`✅ ${files.length} archivo(s) encontrado(s)`);

      const found = [];

      for (let i = 0; i < files.length; i++) {
        if (abortRef.current) break;
        const file = files[i];
        addLog(`🔍 Buscando en: ${file.name} (${i + 1}/${files.length})…`);

        try {
          const matches = await searchInFile(file.id, query, searchType);
          if (matches.length > 0) {
            found.push({ file: file.name, fileId: file.id, matches });
            addLog(`  ✅ ${matches.length} resultado(s) en ${file.name}`);
          } else {
            addLog(`  — Sin resultados en ${file.name}`);
          }
        } catch (e) {
          addLog(`  ❌ Error en ${file.name}: ${e.message}`);
        }
      }

      setResults(found);
      setStatus("done");
      const total = found.reduce((a, r) => a + r.matches.length, 0);
      addLog(
        total
          ? `\n🎯 Búsqueda completa: ${total} resultado(s) en ${found.length} archivo(s).`
          : "\n🔎 Búsqueda completa. Sin resultados."
      );
    } catch (e) {
      setErrorMsg(e.message);
      setStatus("error");
    }
  }, [query, searchType]);

  const handleStop = () => {
    abortRef.current = true;
    addLog("⛔ Búsqueda cancelada.");
    setStatus("done");
  };

  const totalResults = results.reduce((a, r) => a + r.matches.length, 0);

  return (
    <div style={s.root}>
      <div style={s.header}>
        <div style={s.badge}>PADRÓN ELECTORAL</div>
        <h1 style={s.title}>Buscador de Padrón</h1>
        <p style={s.subtitle}>Nombre · DNI · Dirección</p>
      </div>

      <div style={s.card}>
        <label style={s.label}>🔎 Término de búsqueda</label>
        <input
          style={s.input}
          placeholder="Pérez Carlos · 12345678 · Av. San Martín 123"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          disabled={status === "loading"}
          onKeyDown={(e) =>
            e.key === "Enter" && status !== "loading" && handleSearch()
          }
        />

        <label style={s.label}>Tipo de búsqueda</label>
        <div style={s.typeRow}>
          {[
            { v: "nombre", icon: "👤", label: "Nombre / Apellido" },
            { v: "dni", icon: "🪪", label: "DNI" },
            { v: "direccion", icon: "🏠", label: "Dirección" },
          ].map(({ v, icon, label }) => (
            <button
              key={v}
              style={{
                ...s.typeBtn,
                ...(searchType === v ? s.typeBtnActive : {}),
              }}
              onClick={() => setSearchType(v)}
              disabled={status === "loading"}
            >
              {icon} {label}
            </button>
          ))}
        </div>

        <div style={s.actionRow}>
          <button
            style={{
              ...s.btn,
              opacity: status === "loading" || !query ? 0.45 : 1,
            }}
            onClick={handleSearch}
            disabled={status === "loading" || !query}
          >
            {status === "loading" ? "⏳ Buscando…" : "Buscar"}
          </button>
          {status === "loading" && (
            <button style={s.stopBtn} onClick={handleStop}>
              Detener
            </button>
          )}
        </div>
      </div>

      {log.length > 0 && (
        <div style={s.logBox}>
          {log.map((l, i) => (
            <div key={i} style={s.logLine}>{l}</div>
          ))}
        </div>
      )}

      {status === "error" && (
        <div style={s.errorBox}>⚠️ {errorMsg}</div>
      )}

      {status === "done" && results.length === 0 && log.length > 0 && (
        <div style={s.emptyBox}>
          <div style={{ fontSize: 36, marginBottom: 10 }}>🔍</div>
          <p>Sin resultados para <strong>"{query}"</strong></p>
          <p style={{ fontSize: 13, color: "#666", marginTop: 6 }}>
            Probá con otra variante del nombre o verificá el término.
          </p>
        </div>
      )}

      {results.length > 0 && (
        <div>
          <h2 style={s.resultsTitle}>
            {totalResults} resultado(s) en {results.length} archivo(s)
          </h2>
          {results.map((r, ri) => (
            <div key={ri} style={s.fileCard}>
              <div style={s.fileHeader}>
                <span style={{ fontSize: 18 }}>📄</span>
                <span style={s.fileName}>{r.file}</span>
                <span style={s.matchCount}>{r.matches.length} coincidencia(s)</span>
                <a
                  href={`https://drive.google.com/file/d/${r.fileId}/view`}
                  target="_blank"
                  rel="noreferrer"
                  style={s.driveLink}
                >
                  Abrir en Drive ↗
                </a>
              </div>
              {r.matches.map((m, mi) => (
                <div key={mi} style={s.matchRow}>
                  <span style={s.pageTag}>Pág. {m.pagina ?? "?"}</span>
                  <div>
                    <div style={s.matchText}>{m.texto}</div>
                    {m.contexto && (
                      <div style={s.matchContext}>{m.contexto}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const s = {
  root: { minHeight: "100vh", background: "#0d0d0d", color: "#e2dac8", fontFamily: "'Georgia', serif", padding: "28px 16px 60px", maxWidth: 760, margin: "0 auto" },
  header: { textAlign: "center", marginBottom: 32 },
  badge: { display: "inline-block", background: "#b8965a", color: "#0d0d0d", fontFamily: "monospace", fontWeight: 700, fontSize: 10, letterSpacing: 3, padding: "3px 12px", borderRadius: 2, marginBottom: 12 },
  title: { fontSize: "clamp(24px, 5vw, 38px)", fontWeight: 400, margin: "0 0 6px", letterSpacing: -0.5, color: "#f0e8d5" },
  subtitle: { fontSize: 14, color: "#666", margin: 0 },
  card: { background: "#181818", border: "1px solid #272727", borderRadius: 8, padding: "22px 22px", marginBottom: 18 },
  label: { display: "block", fontSize: 11, fontFamily: "monospace", color: "#b8965a", marginBottom: 7, marginTop: 16, letterSpacing: 0.8, textTransform: "uppercase" },
  input: { width: "100%", boxSizing: "border-box", background: "#111", border: "1px solid #2e2e2e", borderRadius: 5, padding: "11px 13px", color: "#e2dac8", fontSize: 15, fontFamily: "Georgia, serif", outline: "none" },
  typeRow: { display: "flex", gap: 8, marginTop: 6, flexWrap: "wrap" },
  typeBtn: { background: "#111", border: "1px solid #2e2e2e", borderRadius: 5, color: "#777", padding: "8px 14px", fontSize: 13, cursor: "pointer", fontFamily: "Georgia, serif" },
  typeBtnActive: { background: "#1a160e", border: "1px solid #b8965a", color: "#b8965a" },
  actionRow: { display:
