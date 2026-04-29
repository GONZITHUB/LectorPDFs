export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { fileId, query, searchType } = req.body;
  if (!fileId || !query) {
    return res.status(400).json({ error: "Missing fileId or query" });
  }

  try {
    const pdfUrl = `https://drive.usercontent.google.com/download?id=${fileId}&export=download&authuser=0`;
    const pdfRes = await fetch(pdfUrl);
    if (!pdfRes.ok) throw new Error(`No se pudo descargar: ${pdfRes.status}`);
    const pdfBuffer = Buffer.from(await pdfRes.arrayBuffer());

    // Extraer texto con pdfjs-dist
    const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const loadingTask = pdfjsLib.getDocument({ data: pdfBuffer });
    const pdf = await loadingTask.promise;

    const norm = (s) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const queryNorm = norm(query);
    const queryWords = queryNorm.split(/\s+/).filter(w => w.length > 2);

    const hits = [];

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const content = await page.getTextContent();
      const pageText = content.items.map(i => i.str).join(" ");
      const pageNorm = norm(pageText);

      if (pageNorm.includes(queryNorm) || queryWords.every(w => pageNorm.includes(w))) {
        const lines = pageText.split(/\r?\n/).filter(l => l.trim());
        for (const line of lines) {
          const lineNorm = norm(line);
          if (lineNorm.includes(queryNorm) || queryWords.every(w => lineNorm.includes(w))) {
            hits.push({ pagina: pageNum, texto: line.trim(), contexto: "" });
          }
        }
        // Si no encontró líneas individuales pero la página matchea
        if (!hits.find(h => h.pagina === pageNum)) {
          hits.push({ pagina: pageNum, texto: pageText.slice(0, 200).trim(), contexto: "Ver página completa" });
        }
      }
    }

    return res.status(200).json({ results: hits });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
  }
