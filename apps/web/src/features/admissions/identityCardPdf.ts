import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import QRCode from "qrcode";

export type IdentityCardPdfInput = {
  personType: "LEARNER" | "STAFF";
  schoolName: string; schoolLogo?: string; schoolPhone?: string; schoolEmail?: string; schoolAddress?: string;
  fullName: string; identifier: string; role?: string; department?: string; staffTelephone?: string;
  className?: string; streamName?: string; academicYear?: string; photoUrl?: string; signatureUrl?: string;
  headteacherName?: string; headteacherSignatureUrl?: string;
  reference: string; verificationToken: string; verificationBaseUrl: string;
  issueDate: string; expiryDate?: string; requireStaffImages?: boolean;
};

// ISO/IEC 7810 ID-1: 85.6 × 54 mm. Each PDF page is one side at actual size.
const width = 85.6 * 72 / 25.4;
const height = 54 * 72 / 25.4;
const navy = rgb(0.06, 0.16, 0.32);
const blue = rgb(0.13, 0.34, 0.68);
const burgundy = rgb(0.40, 0.13, 0.25);
const muted = rgb(0.38, 0.45, 0.55);
const white = rgb(1, 1, 1);

function safe(text: string, font: PDFFont) {
  return Array.from(text).map((character) => { try { font.encodeText(character); return character; } catch { return "?"; } }).join("");
}
function fit(text: string, font: PDFFont, size: number, maxWidth: number) {
  let line = safe(text, font);
  while (line.length > 1 && font.widthOfTextAtSize(line, size) > maxWidth) line = `${line.slice(0, -2)}…`;
  return line;
}
async function image(pdf: PDFDocument, url?: string): Promise<PDFImage | null> {
  if (!url) return null;
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const blob = await response.blob();
    if (blob.type === "image/png") return pdf.embedPng(await blob.arrayBuffer());
    if (blob.type === "image/jpeg") return pdf.embedJpg(await blob.arrayBuffer());
    if (blob.type === "image/webp") {
      const bitmap = await createImageBitmap(blob);
      const canvas = document.createElement("canvas"); canvas.width = bitmap.width; canvas.height = bitmap.height;
      canvas.getContext("2d")?.drawImage(bitmap, 0, 0); bitmap.close();
      const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
      return png ? pdf.embedPng(await png.arrayBuffer()) : null;
    }
  } catch { /* Explicit initials fallback; never synthesize a person photograph. */ }
  return null;
}

export async function makeIdentityCardPdf(input: IdentityCardPdfInput): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const accent = input.personType === "STAFF" ? burgundy : blue;
  const logo = await image(pdf, input.schoolLogo);
  const photo = await image(pdf, input.photoUrl);
  const signature = await image(pdf, input.signatureUrl);
  const headteacherSignature = await image(pdf, input.headteacherSignatureUrl);
  if (input.personType === "STAFF" && input.requireStaffImages && (!logo || !photo)) {
    throw new Error("The staff photo or school badge could not be embedded in the ID PDF. Refresh the card preview and try again.");
  }
  if (input.personType === "STAFF" && input.signatureUrl && !signature) {
    throw new Error("The teacher ID signature could not be embedded in the PDF. Refresh and try again.");
  }
  if (input.headteacherSignatureUrl && !headteacherSignature) throw new Error("The Headteacher’s authorized signature could not be embedded in the ID PDF. Refresh and try again.");
  const front = pdf.addPage([width, height]);
  const back = pdf.addPage([width, height]);
  const label = input.personType === "STAFF" ? "STAFF CREDENTIAL" : "LEARNER ID CARD";
  const text = (page: PDFPage, value: string, x: number, y: number, size: number, strong = false, color = navy, maxWidth = width - x - 8) =>
    page.drawText(fit(value, strong ? bold : regular, size, maxWidth), { x, y, size, font: strong ? bold : regular, color });
  const header = (page: PDFPage, subtitle: string) => {
    page.drawRectangle({ x: 0, y: height - 38, width, height: 38, color: navy });
    if (logo) page.drawImage(logo, { x: 9, y: height - 32, width: 24, height: 24 });
    text(page, "SCHOOL NAME", logo ? 40 : 10, height - 12, 5.2, true, rgb(0.78, 0.87, 1), width - (logo ? 49 : 19));
    text(page, input.schoolName, logo ? 40 : 10, height - 22, 9.5, true, white, width - (logo ? 49 : 19));
    text(page, subtitle, logo ? 40 : 10, height - 31, 5.8, false, rgb(0.78, 0.87, 1), width - (logo ? 49 : 19));
  };
  header(front, "OFFICIAL SCHOOL IDENTIFICATION"); header(back, "OFFICIAL SCHOOL CREDENTIAL");
  front.drawRectangle({ x: 0, y: 0, width: 7, height: height - 38, color: accent });
  text(front, input.personType === "STAFF" ? "STAFF CREDENTIAL" : "LEARNER IDENTITY", 15, height - 51, 6.3, true, accent, width - 30);
  front.drawRectangle({ x: 15, y: 34, width: 61, height: 65, color: rgb(0.94, 0.96, 0.99), borderColor: rgb(0.84, 0.88, 0.93), borderWidth: 0.7 });
  if (photo) front.drawImage(photo, { x: 16, y: 35, width: 59, height: 63 });
  else {
    text(front, input.fullName.split(/\s+/).slice(0, 2).map((part) => part[0] ?? "").join(""), 34, 59, 18, true, accent, 44);
  }
  if (input.personType === "STAFF") {
    const role = (input.role || "Staff member").replaceAll("_", " ");
    text(front, role.toUpperCase() === "TEACHER" ? "TEACHER'S NAME" : "HOLDER'S NAME", 86, 94, 5.3, true, muted, width - 95);
    text(front, input.fullName, 86, 84, 9.2, true, navy, width - 95);
    text(front, "ROLE", 86, 74, 5.3, true, muted, width - 95);
    text(front, role, 86, 65, 7.6, true, accent, width - 95);
    text(front, "ID NO.", 86, 55, 5.3, true, muted, width - 95);
    text(front, input.reference, 86, 46, 7.4, true, navy, width - 95);
    text(front, `STAFF NO. ${input.identifier}`, 86, 36, 5.8, false, muted, width - 95);
    text(front, "ISSUE DATE", 15, 24, 5.2, true, muted, 68);
    text(front, input.issueDate, 15, 15, 6.4, true, navy, 68);
    text(front, "EXPIRY DATE", 86, 24, 5.2, true, muted, 68);
    text(front, input.expiryDate || "Not set", 86, 15, 6.4, true, navy, 68);
    if (signature) {
      const bounds = signature.scaleToFit(width - 172, 15);
      front.drawImage(signature, { x: 162 + (width - 172 - bounds.width) / 2, y: 18, width: bounds.width, height: bounds.height });
    } else front.drawLine({ start: { x: 162, y: 17 }, end: { x: width - 10, y: 17 }, thickness: 0.5, color: muted });
    text(front, "HOLDER'S SIGNATURE", 162, 7, 5.1, true, muted, width - 172);
  } else {
    text(front, input.fullName, 86, 84, 10.5, true, navy, width - 95);
    text(front, input.identifier, 86, 68, 8.5, true, accent, width - 95);
    text(front, [input.className, input.streamName].filter(Boolean).join(" · ") || "Class not recorded", 86, 52, 8, true, navy, width - 95);
    if (input.academicYear) text(front, `Academic year ${input.academicYear}`, 86, 39, 6.8, false, muted, width - 95);
    text(front, `CARD · ${input.reference}`, 86, 24, 6.2, true, navy, width - 95);
    text(front, `Issued ${input.issueDate}${input.expiryDate ? `   Expires ${input.expiryDate}` : ""}`, 15, 11, 6.5, false, muted, width - 23);
  }

  const verifyUrl = new URL(`/verify/id/${encodeURIComponent(input.verificationToken)}`, input.verificationBaseUrl).toString();
  const qrData = await QRCode.toDataURL(verifyUrl, { margin: 0, width: 300, errorCorrectionLevel: "M" });
  const qr = await pdf.embedPng(qrData);
  back.drawImage(qr, { x: width - 87, y: 35, width: 72, height: 72 });
  text(back, "If found, please return to:", 14, 101, 8, true, accent, width - 107);
  text(back, input.schoolName, 14, 87, 8, true, navy, width - 107);
  text(back, `ADDRESS: ${input.schoolAddress || "Not provided"}`, 14, 73, 6.4, false, muted, width - 107);
  text(back, `CONTACT: ${input.schoolPhone || "Not provided"}`, 14, 61, 6.4, false, muted, width - 107);
  if (input.schoolEmail) text(back, `EMAIL: ${input.schoolEmail}`, 14, 50, 6, false, muted, width - 107);
  text(back, `Issued ${input.issueDate}${input.expiryDate ? ` · Expires ${input.expiryDate}` : ""}`, 14, 38, 6, false, navy, width - 107);
  if (headteacherSignature) {
    const bounds = headteacherSignature.scaleToFit(104, 18);
    back.drawImage(headteacherSignature, { x: 14, y: 17, width: bounds.width, height: bounds.height });
  } else back.drawLine({ start: { x: 14, y: 19 }, end: { x: 116, y: 19 }, thickness: 0.5, color: muted });
  text(back, input.headteacherName ? `HEADTEACHER · ${input.headteacherName}` : "HEADTEACHER'S AUTHORIZED SIGNATURE", 14, 9, 5.6, true, muted, 115);
  text(back, "Scan to verify", width - 86, 23, 6.3, true, accent, 78);
  pdf.setTitle(`${label} ${input.reference}`);
  pdf.setCreator("SOMA REPORT ENGINE");
  return pdf.save();
}
