import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";

export type AdmissionRecordInput = {
  schoolName: string; schoolLogo?: string; schoolAddress?: string; schoolPhone?: string; schoolEmail?: string;
  reference: string; admissionNumber: string; version: number; generatedAt: Date;
  learnerName: string; dateOfBirth?: string; gender?: string; nationality?: string; photoUrl?: string;
  admissionType?: string; admissionDate?: string; previousSchool?: string;
  academicYear?: string; className?: string; streamName?: string;
  guardianName?: string; guardianRelationship?: string; guardianPhone?: string; guardianAlternatePhone?: string;
  guardianEmail?: string; guardianAddress?: string; notes?: string;
  documents: Array<{ type: string; status: string }>;
};

const pageWidth = 595.28;
const pageHeight = 841.89;
const margin = 46;
const ink = rgb(0.08, 0.17, 0.31);
const muted = rgb(0.35, 0.43, 0.55);
const blue = rgb(0.13, 0.33, 0.66);

function printable(value: string, font: PDFFont) {
  return Array.from(value).map((char) => {
    try { font.encodeText(char); return char; } catch { return "?"; }
  }).join("");
}

function wrap(value: string, font: PDFFont, size: number, width: number) {
  const result: string[] = [];
  let line = "";
  for (const word of printable(value || "Not recorded", font).split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (line && font.widthOfTextAtSize(next, size) > width) { result.push(line); line = word; }
    else line = next;
  }
  if (line) result.push(line);
  return result.length ? result : ["Not recorded"];
}

export async function makeAdmissionRecordPdf(input: AdmissionRecordInput): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`School Admission Record · ${input.reference} · v${input.version}`);
  pdf.setCreator("SOMA REPORT ENGINE");
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const embedImage = async (url: string): Promise<PDFImage | null> => {
    const response = await fetch(url);
    if (!response.ok) return null;
    const blob = await response.blob();
    if (blob.type === "image/png") return pdf.embedPng(await blob.arrayBuffer());
    if (blob.type === "image/jpeg") return pdf.embedJpg(await blob.arrayBuffer());
    if (blob.type === "image/webp" && typeof document !== "undefined") {
      const bitmap = await createImageBitmap(blob);
      const canvas = document.createElement("canvas"); canvas.width = bitmap.width; canvas.height = bitmap.height;
      canvas.getContext("2d")?.drawImage(bitmap, 0, 0); bitmap.close();
      const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
      return png ? pdf.embedPng(await png.arrayBuffer()) : null;
    }
    return null;
  };
  let page: PDFPage = pdf.addPage([pageWidth, pageHeight]);
  let y = pageHeight - margin;
  const drawText = (text: string, x: number, baseline: number, size = 10, strong = false, color = ink) => {
    page.drawText(printable(text, strong ? bold : regular), { x, y: baseline, size, font: strong ? bold : regular, color });
  };
  const nextPage = () => {
    page = pdf.addPage([pageWidth, pageHeight]); y = pageHeight - margin;
    drawText(`${input.schoolName} · School Admission Record · ${input.reference}`, margin, y, 9, true, muted);
    y -= 28;
  };
  const ensure = (height: number) => { if (y - height < margin + 38) nextPage(); };
  const section = (title: string) => {
    ensure(50); y -= 15;
    page.drawRectangle({ x: margin, y: y - 10, width: pageWidth - margin * 2, height: 27, color: rgb(0.93, 0.96, 1) });
    drawText(title, margin + 9, y, 11, true, blue); y -= 31;
  };
  const row = (label: string, value?: string) => {
    if (!value?.trim()) return;
    const lines = wrap(value.trim(), regular, 10, pageWidth - margin * 2 - 170);
    ensure(20 + lines.length * 13);
    drawText(label, margin + 4, y, 9, true, muted);
    for (const line of lines) { drawText(line, margin + 165, y, 10); y -= 13; }
    y -= 8;
  };

  page.drawRectangle({ x: 0, y: pageHeight - 118, width: pageWidth, height: 118, color: rgb(0.05, 0.18, 0.38) });
  let logoOffset = 0;
  if (input.schoolLogo) {
    try {
      const image = await embedImage(input.schoolLogo);
      if (image) {
        page.drawImage(image, { x: margin, y: pageHeight - 100, width: 65, height: 65 });
        logoOffset = 78;
      }
    } catch { /* The record remains printable when a remote badge is unavailable. */ }
  }
  const headerName = wrap(input.schoolName, bold, 16, pageWidth - margin * 2 - logoOffset);
  headerName.slice(0, 2).forEach((line, index) => drawText(line, margin + logoOffset, pageHeight - 58 - index * 19, 16, true, rgb(1, 1, 1)));
  y = pageHeight - 144;
  drawText("SCHOOL ADMISSION RECORD", margin, y, 17, true); y -= 25;
  drawText(`Reference ${input.reference}  ·  Admission number ${input.admissionNumber}`, margin, y, 10, true, blue); y -= 18;
  drawText(`Version ${input.version}  ·  Generated ${input.generatedAt.toLocaleDateString()}`, margin, y, 9, false, muted); y -= 14;
  page.drawLine({ start: { x: margin, y }, end: { x: pageWidth - margin, y }, thickness: 1, color: rgb(0.83, 0.88, 0.94) });
  section("School and admission");
  row("School address", input.schoolAddress);
  row("School contact", [input.schoolPhone, input.schoolEmail].filter(Boolean).join(" · "));
  row("Admission date", input.admissionDate);
  row("Admission type", input.admissionType?.replaceAll("_", " "));
  row("Previous school", input.previousSchool);
  row("Academic year", input.academicYear);
  row("Class / stream", [input.className, input.streamName].filter(Boolean).join(" / "));
  section("Learner identity");
  row("Legal name", input.learnerName);
  row("Date of birth", input.dateOfBirth);
  row("Gender", input.gender);
  row("Nationality", input.nationality);
  if (input.photoUrl) {
    try {
      const image = await embedImage(input.photoUrl);
      if (image) {
        ensure(82);
        page.drawImage(image, { x: margin + 165, y: y - 72, width: 62, height: 72 });
        drawText("Learner photograph", margin + 4, y - 10, 9, true, muted); y -= 85;
      }
    } catch { /* Optional photo may be unavailable while the record remains valid. */ }
  }
  section("Guardian and emergency contact");
  row("Guardian", input.guardianName);
  row("Relationship", input.guardianRelationship);
  row("Primary phone", input.guardianPhone);
  row("Alternative phone", input.guardianAlternatePhone);
  row("Email", input.guardianEmail);
  row("Address", input.guardianAddress);
  section("Document checklist");
  if (input.documents.length === 0) row("Documents", "No checklist items were recorded.");
  else input.documents.forEach((document) => row(document.type, document.status.replaceAll("_", " ")));
  if (input.notes?.trim()) { section("Restricted school notes"); row("Notes", input.notes); }
  ensure(55); y -= 10;
  page.drawLine({ start: { x: margin, y }, end: { x: margin + 190, y }, thickness: 1, color: ink });
  page.drawLine({ start: { x: margin + 270, y }, end: { x: pageWidth - margin, y }, thickness: 1, color: ink });
  drawText("Authorized signature / date", margin, y - 14, 8, false, muted);
  drawText("School stamp", margin + 270, y - 14, 8, false, muted);
  const count = pdf.getPageCount();
  pdf.getPages().forEach((item, index) => {
    item.drawText(`Confidential school file · ${input.reference} · Page ${index + 1} of ${count}`, {
      x: margin, y: 26, size: 8, font: regular, color: muted,
    });
  });
  return pdf.save();
}
