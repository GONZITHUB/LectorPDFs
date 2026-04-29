import pdfParse from "pdf-parse/lib/pdf-parse.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { fileId, query, searchType } = req.body;
  if (!fileId || !query) {
    return res.status(400).json({ error: "Missing fileId or query" });
  }

  try {
    // Descargar PDF
    const pdfUrl = `https://drive.usercontent.google.com/download?id=${fileId}&export=download&authuser=0`;
    const pdfRes = await fetch(pdfUrl);
    if (!pdfRes.ok) throw new Error(`No se pudo descargar el PDF: ${pdfRes.status}`);
    const pdfBuffer = Buffer.from(await pdfRes.arrayBuffer());

    // Extraer texto página por página
    let pages = [];
    await pdfParse(pdfBuffer, {
      pagerender: function(pageData) {
        return pageData.getTextContent().then(function(textContent) {
          const text = textContent.items.map(i => i.str).join(" ");
          pages.push(text);
          return text;
        });
      }
    });

    // Normalizar para búsqueda
    const norm = (s) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const queryNorm = norm(query);

    // Buscar en cada página
    const hits = [];
    pages.forEach((pageText, idx) => {
      if (norm(pageText).includes(queryNorm)) {
        // Encontrar la línea exacta
        const lines = pageText.split(/\n|(?<=\d{4})\s+(?=\d)/);
        lines.forEach(line => {
          if (norm(line).includes(queryNorm)) {
            hits.push({
              pagina: idx + 1,
              texto: line.trim(),
              contexto: ""
            });
          }
        });
      }
    });

    // Si no hay hits exactos, usar Claude con fragmento relevante
    if (hits.length === 0) {
      // Mandar solo las páginas que contienen coincidencias aproximadas a Claude
      const relevantPages = pages
        .map((text, idx) => ({ text, page: idx + 1 }))
        .filter(p => {
          const words = queryNorm.split(/\s+/);
          return words.some(w => w.length > 3 && norm(p.text).includes(w));
        })
        .slice(0, 5); // máximo 5 páginas

      if (relevantPages.length > 0) {
        const excerpt = relevantPages
          .map(p => `--- PÁGINA ${p.page} ---\n${p.text}`)
          .join("\n\n");

        const response = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": process.env.ANTHROPIC_API_KEY,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: "claude-haiku-4-5",
            max_tokens: 2000,
            messages: [{
              role: "user",
              content: `Buscá "${query}" (tipo: ${searchType}) en este texto del padrón. Considerá variaciones de orden (apellido nombre / nombre apellido), acentos. Devolvé SOLO un JSON array: [{"pagina": N, "texto": "línea exacta", "contexto": "contexto"}]. Si no hay resultados devolvé []. Sin markdown.\n\n${excerpt}`
            }]
          }),
        });

        if (response.ok) {
          const data = await response.json();
          const raw = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("\n");
          const match = raw.match(/\[[\s\S]*\]/);
          if (match) return res.status(200).json({ results: JSON.parse(match[0]) });
        }
      }
    }

    return res.status(200).json({ results: hits });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
