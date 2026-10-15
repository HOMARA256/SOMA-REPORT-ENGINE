import assert from "node:assert/strict";
import test from "node:test";
import { PDFDocument } from "pdf-lib";
import { makeIdentityCardPdf } from "../apps/web/src/features/admissions/identityCardPdf.ts";
test("student and staff print PDFs have two aligned ID-1 pages", async () => {
    for (const personType of ["LEARNER", "STAFF"]) {
        const bytes = await makeIdentityCardPdf({
            personType, schoolName: "Tenant Test School", fullName: "Sample Person",
            identifier: personType === "STAFF" ? "STAFF-001" : "SCHOOL/2026/0001",
            role: "TEACHER", department: "Mathematics", className: "Senior 1", streamName: "A",
            reference: "CARD-TEST-001", verificationToken: "opaque-test-token",
            verificationBaseUrl: "https://example.test", issueDate: "2026-10-11",
        });
        const pdf = await PDFDocument.load(bytes);
        assert.equal(pdf.getPageCount(), 2);
        for (const page of pdf.getPages()) {
            assert.ok(Math.abs(page.getWidth() - 85.6 * 72 / 25.4) < 0.01);
            assert.ok(Math.abs(page.getHeight() - 54 * 72 / 25.4) < 0.01);
        }
    }
});
