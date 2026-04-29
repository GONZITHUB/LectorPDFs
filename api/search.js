export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { fileId, query, searchType } = req.body;

  if (!fileId || !query) {
    return res.status(400).json({ error: "Missing fileId or query" });
  }

  try {
    // Descargar el PDF desde Drive
    const pdfUrl = `https://drive.usercontent.google.com/download?id=${fileId}&export=download&authuser=0`;
    const pdfRes = await fetch(pdfUrl);
    if (!pdfRes.ok) throw new Error(`No se pudo descargar el PDF: ${pdfRes.status}`);
    
    const pdfBuffer = await pdfRes.arrayBuffer();
    const pdfBase64 = Buffer.from(pdfBuffer).toString("base64");

    const systemPrompt = `Sos un asistente que busca personas en el padrón electoral argentino.
Dado el contenido de un PDF, buscá TODAS las coincidencias para el término indicado.
Considerá variaciones: orden (apellido nombre / nombre apellido), acentos, mayúsculas/minúsculas.
Para búsqueda por dirección: devolvé TODOS los registros que viven en esa dirección.
Respondé SOLO con un JSON array. Cada elemento debe tener:
{"pagina": N, "texto": "línea exacta del padrón", "contexto": "1-2 líneas de contexto adicional"}
Si no hay resultados, devolvé [].
Sin markdown, sin explicaciones, sin bloques de código. Solo el JSON array.`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: 4000,
        system: systemPrompt,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "document",
                source: {
                  type: "base64",
                  media_type: "application/pdf",
                  data: pdfBase64,
                },
              },
              {
                type: "text",
                text: `Buscá en este PDF el término: "${query}" (tipo de búsqueda: ${searchType}). Devolvé el JSON array como se indicó.`,
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      return res.status(500).json({ error: `Anthropic API error: ${err}` });
    }

    const data = await response.json();
    const raw = (data.content || [])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n");

    const match = raw.match(/\[[\s\S]*\]/);
    const results = match ? JSON.parse(match[0]) : [];

    return res.status(200).json({ results });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
