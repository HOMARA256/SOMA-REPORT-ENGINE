import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import QRCode from "qrcode";
// ISO/IEC 7810 ID-1: 85.6 × 54 mm. Each PDF page is one side at actual size.
const width = 85.6 * 72 / 25.4;
const height = 54 * 72 / 25.4;
const navy = rgb(0.06, 0.16, 0.32);
const blue = rgb(0.13, 0.34, 0.68);
const burgundy = rgb(0.40, 0.13, 0.25);
const muted = rgb(0.38, 0.45, 0.55);
const white = rgb(1, 1, 1);
function safe(text, font) {
    return Array.from(text).map((character) => { try {
        font.encodeText(character);
        return character;
    }
    catch {
        return "?";
    } }).join("");
}
function fit(text, font, size, maxWidth) {
    let line = safe(text, font);
    while (line.length > 1 && font.widthOfTextAtSize(line, size) > maxWidth)
        line = `${line.slice(0, -2)}…`;
    return line;
}
async function image(pdf, url) {
    if (!url)
        return null;
    try {
        const response = await fetch(url);
        if (!response.ok)
            return null;
        const blob = await response.blob();
        if (blob.type === "image/png")
            return pdf.embedPng(await blob.arrayBuffer());
        if (blob.type === "image/jpeg")
            return pdf.embedJpg(await blob.arrayBuffer());
        if (blob.type === "image/webp") {
            const bitmap = await createImageBitmap(blob);
            const canvas = document.createElement("canvas");
            canvas.width = bitmap.width;
            canvas.height = bitmap.height;
            canvas.getContext("2d")?.drawImage(bitmap, 0, 0);
            bitmap.close();
            const png = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
            return png ? pdf.embedPng(await png.arrayBuffer()) : null;
        }
    }
    catch { /* Explicit initials fallback; never synthesize a person photograph. */ }
    return null;
}
export async function makeIdentityCardPdf(input) {
    const pdf = await PDFDocument.create();
    const regular = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const accent = input.personType === "STAFF" ? burgundy : blue;
    const logo = await image(pdf, input.schoolLogo);
    const photo = await image(pdf, input.photoUrl);
    const front = pdf.addPage([width, height]);
    const back = pdf.addPage([width, height]);
    const label = input.personType === "STAFF" ? "STAFF CREDENTIAL" : "LEARNER ID CARD";
    const text = (page, value, x, y, size, strong = false, color = navy, maxWidth = width - x - 8) => page.drawText(fit(value, strong ? bold : regular, size, maxWidth), { x, y, size, font: strong ? bold : regular, color });
    const header = (page, subtitle) => {
        page.drawRectangle({ x: 0, y: height - 38, width, height: 38, color: navy });
        if (logo)
            page.drawImage(logo, { x: 9, y: height - 32, width: 24, height: 24 });
        text(page, input.schoolName, logo ? 40 : 10, height - 18, 10.5, true, white, width - (logo ? 49 : 19));
        text(page, subtitle, logo ? 40 : 10, height - 29, 6.5, false, rgb(0.78, 0.87, 1), width - (logo ? 49 : 19));
    };
    header(front, "OFFICIAL SCHOOL IDENTIFICATION");
    header(back, "OFFICIAL SCHOOL CREDENTIAL");
    front.drawRectangle({ x: 0, y: 0, width: 7, height: height - 38, color: accent });
    text(front, input.personType === "STAFF" ? "STAFF CREDENTIAL" : "LEARNER IDENTITY", 15, height - 51, 6.3, true, accent, width - 30);
    front.drawRectangle({ x: 15, y: 30, width: 61, height: 69, color: rgb(0.94, 0.96, 0.99), borderColor: rgb(0.84, 0.88, 0.93), borderWidth: 0.7 });
    if (photo)
        front.drawImage(photo, { x: 16, y: 31, width: 59, height: 67 });
    else {
        text(front, input.fullName.split(/\s+/).slice(0, 2).map((part) => part[0] ?? "").join(""), 34, 59, 18, true, accent, 44);
    }
    text(front, input.fullName, 86, 84, 10.5, true, navy, width - 95);
    if (input.personType === "STAFF")
        text(front, "EMPLOYMENT NO.", 86, 76, 5.4, true, muted, width - 95);
    text(front, input.identifier, 86, 68, 8.5, true, accent, width - 95);
    if (input.personType === "STAFF") {
        text(front, `ROLE: ${(input.role || "Staff member").replaceAll("_", " ")}`, 86, 52, 8, true, accent, width - 95);
        text(front, input.staffTelephone ? `TEL: ${input.staffTelephone}` : "Telephone not recorded", 86, 39, 7, false, muted, width - 95);
    }
    else {
        text(front, [input.className, input.streamName].filter(Boolean).join(" · ") || "Class not recorded", 86, 52, 8, true, navy, width - 95);
        if (input.academicYear)
            text(front, `Academic year ${input.academicYear}`, 86, 39, 6.8, false, muted, width - 95);
    }
    text(front, `CARD · ${input.reference}`, 86, 24, 6.2, true, navy, width - 95);
    text(front, `Issued ${input.issueDate}${input.expiryDate ? `   Expires ${input.expiryDate}` : ""}`, 15, 11, 6.5, false, muted, width - 23);
    const verifyUrl = new URL(`/verify/id/${encodeURIComponent(input.verificationToken)}`, input.verificationBaseUrl).toString();
    const qrData = await QRCode.toDataURL(verifyUrl, { margin: 0, width: 300, errorCorrectionLevel: "M" });
    const qr = await pdf.embedPng(qrData);
    back.drawImage(qr, { x: width - 87, y: 35, width: 72, height: 72 });
    text(back, "If found, please return to:", 14, 101, 8, true, accent, width - 107);
    text(back, input.schoolName, 14, 86, 8, true, navy, width - 107);
    if (input.schoolAddress)
        text(back, input.schoolAddress, 14, 73, 7, false, muted, width - 107);
    if (input.schoolPhone)
        text(back, `Tel: ${input.schoolPhone}`, 14, 61, 7, false, muted, width - 107);
    if (input.schoolEmail)
        text(back, input.schoolEmail, 14, 50, 6.2, false, muted, width - 107);
    text(back, `Issue ${input.issueDate}`, 14, 38, 6.5, false, navy, width - 107);
    if (input.expiryDate)
        text(back, `Expiry ${input.expiryDate}`, 14, 28, 6.5, false, navy, width - 107);
    back.drawLine({ start: { x: 14, y: 19 }, end: { x: 116, y: 19 }, thickness: 0.5, color: muted });
    text(back, "Authorized signature", 14, 9, 6.3, false, muted, 102);
    text(back, "Scan to verify", width - 86, 23, 6.3, true, accent, 78);
    pdf.setTitle(`${label} ${input.reference}`);
    pdf.setCreator("SOMA REPORT ENGINE");
    return pdf.save();
}
