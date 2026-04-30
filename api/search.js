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

    const PDFParser = (await import("pdf2json")).default;

    const text = await new Promise((resolve, reject) => {
      const parser = new PDFParser(null, true);
      parser.on("pdfParser_dataReady", () => {
        resolve(parser.getRawTextContent());
      });
      parser.on("pdfParser_dataError", reject);
      parser.parseBuffer(pdfBuffer);
    });

    const norm = (s) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const queryNorm = norm(query);
    const queryWords = queryNorm.split(/\s+/).filter(w => w.length > 2);

    const hits = [];
    const lines = text.split(/\r?\n/).filter(l => l.trim().length > 5);

    // Detectar número de página (pdf2json inserta "----------------Page (N) Break----------------")
    let currentPage = 1;
    for (const line of lines) {
      const pageMatch = line.match(/Page \((\d+)\) Break/);
      if (pageMatch) {
        currentPage = parseInt(pageMatch[1]) + 1;
        continue;
      }
      const lineNorm = norm(line);
      const matches = lineNorm.includes(queryNorm) ||
        (searchType === "nombre" && queryWords.length > 1 && queryWords.every(w => lineNorm.includes(w)));

      if (matches) {
        hits.push({ pagina: currentPage, texto: line.trim(), contexto: "" });
      }
    }

    return res.status(200).json({ results: hits });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
