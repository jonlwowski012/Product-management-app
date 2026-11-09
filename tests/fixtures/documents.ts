import AdmZip from "adm-zip";
export function pdfFixture(texts: string[]) {
  const objects: string[] = [];
  objects.push("<< /Type /Catalog /Pages 2 0 R >>");
  objects.push(
    `<< /Type /Pages /Kids [${texts.map((_, i) => `${4 + i * 2} 0 R`).join(" ")}] /Count ${texts.length} >>`,
  );
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  for (const [i, text] of texts.entries()) {
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + i * 2} 0 R >>`,
    );
    const stream = `BT /F1 12 Tf 50 720 Td (${text.replace(/[\\()]/g, (c) => "\\" + c)}) Tj ET`;
    objects.push(
      `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
    );
  }
  let raw = "%PDF-1.4\n",
    offsets = [0];
  for (const [i, o] of objects.entries()) {
    offsets.push(Buffer.byteLength(raw));
    raw += `${i + 1} 0 obj\n${o}\nendobj\n`;
  }
  const xref = Buffer.byteLength(raw);
  raw += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((n) => String(n).padStart(10, "0") + " 00000 n \n")
    .join(
      "",
    )}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(raw);
}
export function officeFixture(
  type: "pptx" | "docx",
  texts: string[],
  order?: number[],
) {
  const zip = new AdmZip();
  const escape = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  if (type === "pptx") {
    const sequence = order ?? texts.map((_, i) => i + 1);
    zip.addFile(
      "ppt/presentation.xml",
      Buffer.from(
        `<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:sldIdLst>${sequence.map((n) => `<p:sldId id="${255 + n}" r:id="rId${n}"/>`).join("")}</p:sldIdLst></p:presentation>`,
      ),
    );
    zip.addFile(
      "ppt/_rels/presentation.xml.rels",
      Buffer.from(
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${texts.map((_, i) => `<Relationship Id="rId${i + 1}" Target="slides/slide${i + 1}.xml" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide"/>`).join("")}</Relationships>`,
      ),
    );
    texts.forEach((text, i) =>
      zip.addFile(
        `ppt/slides/slide${i + 1}.xml`,
        Buffer.from(
          `<?xml version="1.0"?><p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:cSld><a:p><a:r><a:t>${escape(text)}</a:t></a:r></a:p></p:cSld></p:sld>`,
        ),
      ),
    );
  } else
    zip.addFile(
      "word/document.xml",
      Buffer.from(
        `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${texts.map((text) => `<w:p><w:r><w:t>${escape(text)}</w:t></w:r></w:p>`).join("")}</w:body></w:document>`,
      ),
    );
  return zip.toBuffer();
}
