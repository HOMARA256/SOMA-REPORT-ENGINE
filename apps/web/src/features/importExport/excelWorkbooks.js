import ExcelJS from "exceljs";
import { getLearnerFullName } from "../learners/LearnerData";
export const MARKS_TEMPLATE_VERSION = "2";
export const allowedWorkbookExtensions = [".xlsx", ".csv"];
export const markStates = ["PRESENT", "MISSING", "ABSENT", "EXEMPT"];
function safeSpreadsheetText(value) {
    const text = String(value ?? "");
    return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
}
function downloadBlob(blob, fileName) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    URL.revokeObjectURL(url);
}
async function downloadWorkbook(workbook, fileName) {
    const buffer = await workbook.xlsx.writeBuffer();
    downloadBlob(new Blob([new Uint8Array(buffer)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), fileName);
}
function styleHeader(row) {
    row.font = { bold: true, color: { argb: "FFFFFFFF" } };
    row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F4E8C" } };
    row.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    row.height = 28;
}
function currentVersion(marks) {
    return [marks.continuousAssessment, marks.continuousAssessmentState, marks.examination, marks.examinationState].join("|");
}
export async function downloadMarksTemplate(context, roster, getMarks) {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "SOMA REPORT ENGINE";
    workbook.created = new Date();
    workbook.calcProperties.fullCalcOnLoad = false;
    const instructions = workbook.addWorksheet("INSTRUCTIONS", { views: [{ state: "frozen", ySplit: 1 }] });
    instructions.columns = [{ width: 5 }, { width: 95 }];
    instructions.addRow(["", "SOMA REPORT ENGINE MARKS IMPORT"]);
    styleHeader(instructions.getRow(1));
    [
        "Enter marks only in the AoI Mark and Exam Mark columns.",
        "Use PRESENT, MISSING, ABSENT or EXEMPT in status columns.",
        "PRESENT requires a numeric mark. Other statuses require a blank mark.",
        "Do not change learner identifiers, context, template identity or record version.",
        "Save as .xlsx and upload through SOMA REPORT ENGINE Marks Entry.",
        "SOMA REPORT ENGINE calculates totals, 3-point scores, descriptors and competencies after import.",
    ].forEach((instruction, index) => instructions.addRow([index + 1, instruction]));
    const sheet = workbook.addWorksheet("MARKS ENTRY", { views: [{ state: "frozen", ySplit: 7 }] });
    sheet.mergeCells("A1:J1");
    sheet.getCell("A1").value = context.schoolName;
    sheet.getCell("A1").font = { bold: true, size: 16, color: { argb: "FF1F4E8C" } };
    sheet.getCell("A1").alignment = { horizontal: "center" };
    sheet.mergeCells("A2:J2");
    sheet.getCell("A2").value = `${context.offering.subjectName} · ${context.className} ${context.stream} · ${context.termName} ${context.yearName}`;
    sheet.getCell("A2").alignment = { horizontal: "center" };
    sheet.mergeCells("A3:J3");
    sheet.getCell("A3").value = `Teacher: ${context.teacherName} · AoI /20 · Exam /80`;
    sheet.getCell("A3").alignment = { horizontal: "center" };
    sheet.addRow([]);
    sheet.addRow([]);
    sheet.addRow([]);
    sheet.addRow(["No.", "Learner ID", "Admission No.", "Learner Name", "AoI Mark", "AoI Status", "Exam Mark", "Exam Status", "Record Version", "Validation Note"]);
    styleHeader(sheet.getRow(7));
    sheet.columns = [{ width: 7 }, { width: 16 }, { width: 19 }, { width: 32 }, { width: 12 }, { width: 15 }, { width: 12 }, { width: 15 }, { width: 28 }, { width: 28 }];
    roster.forEach((learner, index) => {
        const marks = getMarks(learner.id);
        const row = sheet.addRow([index + 1, learner.id, safeSpreadsheetText(learner.admissionNumber), safeSpreadsheetText(getLearnerFullName(learner)), "", "PRESENT", "", "PRESENT", currentVersion(marks), ""]);
        row.getCell(5).protection = { locked: false };
        row.getCell(6).protection = { locked: false };
        row.getCell(7).protection = { locked: false };
        row.getCell(8).protection = { locked: false };
        row.getCell(5).dataValidation = { type: "decimal", operator: "between", allowBlank: true, formulae: [0, 20], showErrorMessage: true, errorTitle: "Invalid AoI mark", error: "Enter a value from 0 to 20." };
        row.getCell(7).dataValidation = { type: "decimal", operator: "between", allowBlank: true, formulae: [0, 80], showErrorMessage: true, errorTitle: "Invalid examination mark", error: "Enter a value from 0 to 80." };
        row.getCell(6).dataValidation = { type: "list", allowBlank: false, formulae: ['"PRESENT,MISSING,ABSENT,EXEMPT"'] };
        row.getCell(8).dataValidation = { type: "list", allowBlank: false, formulae: ['"PRESENT,MISSING,ABSENT,EXEMPT"'] };
    });
    sheet.autoFilter = { from: "A7", to: `J${Math.max(8, roster.length + 7)}` };
    await sheet.protect("OURSCHOOL", { selectLockedCells: true, selectUnlockedCells: true, formatCells: false, insertRows: false, deleteRows: false });
    const contextSheet = workbook.addWorksheet("CONTEXT", { state: "veryHidden" });
    const contextRows = {
        template_type: "MARKS", template_id: context.templateId, template_version: MARKS_TEMPLATE_VERSION,
        school_id: context.schoolId, academic_year_id: context.yearId, term_id: context.termId,
        programme: "O_LEVEL", class_name: context.className, stream: context.stream,
        subject_offering_id: context.offering.id, subject_code: context.offering.subjectCode,
        assessment: "End of Term", component: "AoI and Examination", maximum_mark: "100",
        teacher: context.teacherName, generated_at: new Date().toISOString(),
    };
    Object.entries(contextRows).forEach(([key, value]) => contextSheet.addRow([key, value]));
    const name = `SOMA_REPORT_ENGINE_${context.className.replaceAll(" ", "_").toUpperCase()}_${context.stream.toUpperCase()}_${context.offering.subjectCode}_${context.termName.replaceAll(" ", "_").toUpperCase()}_${context.yearName}.xlsx`;
    await downloadWorkbook(workbook, name);
    return { fileName: name, templateId: context.templateId, templateVersion: MARKS_TEMPLATE_VERSION };
}
export async function downloadALevelPaperMarksTemplate(context, roster, getMarks) {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "SOMA REPORT ENGINE";
    workbook.created = new Date();
    const instructions = workbook.addWorksheet("INSTRUCTIONS");
    instructions.columns = [{ width: 5 }, { width: 95 }];
    instructions.addRow(["", "SOMA REPORT ENGINE A-LEVEL PAPER MARKS IMPORT"]);
    styleHeader(instructions.getRow(1));
    ["This template is valid only for the displayed subject and paper.", "Enter a mark from 0 to 100 only when status is PRESENT.", "Blank, MISSING, ABSENT and EXEMPT are distinct states.", "Do not change learner identifiers or the hidden context sheet.", "Upload through the same A-Level marks workflow used for manual entry."].forEach((text, index) => instructions.addRow([index + 1, text]));
    const sheet = workbook.addWorksheet("MARKS ENTRY", { views: [{ state: "frozen", ySplit: 7 }] });
    sheet.mergeCells("A1:G1");
    sheet.getCell("A1").value = context.schoolName;
    sheet.getCell("A1").font = { bold: true, size: 16, color: { argb: "FF1F4E8C" } };
    sheet.getCell("A1").alignment = { horizontal: "center" };
    sheet.mergeCells("A2:G2");
    sheet.getCell("A2").value = `A-LEVEL · ${context.offering.subjectName} · ${context.paper.label} /100`;
    sheet.getCell("A2").alignment = { horizontal: "center" };
    sheet.mergeCells("A3:G3");
    sheet.getCell("A3").value = `${context.className} ${context.stream} · ${context.termName} ${context.yearName} · Teacher: ${context.teacherName}`;
    sheet.getCell("A3").alignment = { horizontal: "center" };
    sheet.addRow([]);
    sheet.addRow([]);
    sheet.addRow([]);
    sheet.addRow(["No.", "Learner ID", "Admission Number", "Learner Name", "Mark /100", "Status", "Record Version"]);
    styleHeader(sheet.getRow(7));
    sheet.columns = [{ width: 7 }, { width: 17 }, { width: 20 }, { width: 32 }, { width: 14 }, { width: 16 }, { width: 32 }];
    roster.forEach((learner, index) => { const mark = getMarks(learner.id)[context.paper.id] ?? { value: "", state: "MISSING" }; const row = sheet.addRow([index + 1, learner.id, safeSpreadsheetText(learner.admissionNumber), safeSpreadsheetText(getLearnerFullName(learner)), "", "MISSING", `${mark.value}|${mark.state}`]); row.getCell(5).protection = { locked: false }; row.getCell(6).protection = { locked: false }; row.getCell(5).dataValidation = { type: "decimal", operator: "between", allowBlank: true, formulae: [0, 100], showErrorMessage: true, errorTitle: "Invalid paper mark", error: "Enter a value from 0 to 100." }; row.getCell(6).dataValidation = { type: "list", allowBlank: false, formulae: ['"PRESENT,MISSING,ABSENT,EXEMPT"'] }; });
    sheet.autoFilter = { from: "A7", to: `G${Math.max(8, roster.length + 7)}` };
    await sheet.protect("OURSCHOOL", { selectLockedCells: true, selectUnlockedCells: true, insertRows: false, deleteRows: false });
    const metadata = workbook.addWorksheet("CONTEXT", { state: "veryHidden" });
    Object.entries({ template_type: "A_LEVEL_PAPER_MARKS", template_id: context.templateId, template_version: "1", school_id: context.schoolId, academic_year_id: context.yearId, term_id: context.termId, programme: "A_LEVEL", level: context.className, subject_offering_id: context.offering.id, subject_code: context.offering.subjectCode, paper_id: context.paper.id, paper_number: String(context.paper.paperNumber), maximum_mark: "100", generated_at: new Date().toISOString(), generated_by: context.teacherName }).forEach(([key, value]) => metadata.addRow([key, value]));
    const fileName = `SOMA_REPORT_ENGINE_${context.className.replaceAll(" ", "_").toUpperCase()}_${context.offering.subjectCode}_${context.paper.label.replaceAll(" ", "_").toUpperCase()}_${context.termName.replaceAll(" ", "_").toUpperCase()}_${context.yearName}.xlsx`;
    await downloadWorkbook(workbook, fileName);
    return { fileName, templateVersion: "1" };
}
function cellText(cell) {
    const value = cell.value;
    if (value && typeof value === "object" && "formula" in value)
        throw new Error(`Formula detected in editable cell ${cell.address}. Enter a value, not a formula.`);
    return String(value ?? "").trim();
}
export async function parseMarksWorkbook(file, expected, roster, getMarks, locked) {
    if (!file.name.toLowerCase().endsWith(".xlsx"))
        throw new Error("Upload a valid .xlsx workbook. Old .xls and macro-enabled files are not accepted.");
    if (file.size > 10 * 1024 * 1024)
        throw new Error("The workbook exceeds the 10 MB upload limit.");
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await file.arrayBuffer());
    const contextSheet = workbook.getWorksheet("CONTEXT");
    const sheet = workbook.getWorksheet("MARKS ENTRY");
    if (!contextSheet || !sheet)
        throw new Error("This is not a recognised SOMA REPORT ENGINE marks template.");
    const metadata = new Map();
    contextSheet.eachRow((row) => metadata.set(String(row.getCell(1).value ?? ""), String(row.getCell(2).value ?? "")));
    const mismatches = [
        ["template_type", "MARKS"], ["template_version", MARKS_TEMPLATE_VERSION], ["school_id", expected.schoolId],
        ["academic_year_id", expected.yearId], ["term_id", expected.termId], ["class_name", expected.className],
        ["stream", expected.stream], ["subject_offering_id", expected.offering.id],
    ].filter(([key, value]) => metadata.get(key) !== value);
    if (mismatches.length)
        throw new Error(`Template context mismatch: ${mismatches.map(([key]) => key.replaceAll("_", " ")).join(", ")}. Download a new template for the current selection.`);
    if (locked)
        throw new Error("Marks for this assessment are locked and cannot be changed through Excel import.");
    const rosterById = new Map(roster.map((learner) => [learner.id, learner]));
    const seen = new Set();
    const rows = [];
    for (let rowNumber = 8; rowNumber <= sheet.rowCount; rowNumber += 1) {
        const row = sheet.getRow(rowNumber);
        const learnerId = cellText(row.getCell(2));
        if (!learnerId)
            continue;
        const learner = rosterById.get(learnerId);
        const messages = [];
        let validation = "READY";
        if (!learner) {
            validation = "ERROR";
            messages.push("Learner does not belong to the selected class and stream.");
        }
        if (seen.has(learnerId)) {
            validation = "ERROR";
            messages.push("Duplicate learner row.");
        }
        seen.add(learnerId);
        if (learner && cellText(row.getCell(3)) !== learner.admissionNumber) {
            validation = "ERROR";
            messages.push("Admission number was changed.");
        }
        const importedAoI = cellText(row.getCell(5));
        const aoiStatus = cellText(row.getCell(6)).toUpperCase();
        const importedExam = cellText(row.getCell(7));
        const examStatus = cellText(row.getCell(8)).toUpperCase();
        const marks = learner ? getMarks(learnerId) : { continuousAssessment: "", examination: "", continuousAssessmentState: "MISSING", examinationState: "MISSING" };
        const validateComponent = (mark, state, maximum, label) => {
            if (!markStates.includes(state)) {
                validation = "ERROR";
                messages.push(`${label} status is invalid.`);
                return;
            }
            if (state === "PRESENT" && (mark === "" || !/^\d+(?:\.\d+)?$/.test(mark))) {
                validation = "ERROR";
                messages.push(`${label} PRESENT requires a numeric mark.`);
                return;
            }
            if (state !== "PRESENT" && mark !== "") {
                validation = "ERROR";
                messages.push(`${label} must be blank when status is ${state}.`);
                return;
            }
            if (mark !== "" && (Number(mark) < 0 || Number(mark) > maximum)) {
                validation = "ERROR";
                messages.push(`${label} ${mark} is outside 0-${maximum}.`);
            }
        };
        validateComponent(importedAoI, aoiStatus, 20, "AoI mark");
        validateComponent(importedExam, examStatus, 80, "Exam mark");
        const unchanged = marks.continuousAssessment === importedAoI && marks.continuousAssessmentState === aoiStatus && marks.examination === importedExam && marks.examinationState === examStatus;
        const stale = cellText(row.getCell(9)) !== currentVersion(marks);
        if (validation !== "ERROR" && stale) {
            validation = "ERROR";
            messages.push("CONFLICT: marks changed after this template was downloaded.");
        }
        else if (validation !== "ERROR" && unchanged) {
            validation = "UNCHANGED";
            messages.push("Matches the current system record.");
        }
        else if (validation !== "ERROR" && (marks.continuousAssessment || marks.examination)) {
            validation = "WARNING";
            messages.push("This will update existing marks. Confirm the change before import.");
        }
        rows.push({ rowNumber, learnerId, admissionNumber: learner?.admissionNumber ?? cellText(row.getCell(3)), learnerName: learner ? getLearnerFullName(learner) : cellText(row.getCell(4)), currentAoI: marks.continuousAssessment, importedAoI, aoiStatus, currentExam: marks.examination, importedExam, examStatus, validation, messages });
    }
    if (!rows.length)
        throw new Error("The workbook contains no learner rows.");
    return { templateId: metadata.get("template_id") ?? "", templateVersion: metadata.get("template_version") ?? "", rows };
}
export async function downloadSimpleTemplate(type) {
    const columns = {
        LEARNERS: ["Admission Number", "First Name", "Middle Name", "Last Name", "Gender", "Date of Birth", "Programme", "Class", "Stream", "Admission Date", "Status"],
        STAFF: ["Staff Number", "First Name", "Middle Name", "Last Name", "Email", "Telephone", "Department", "Role", "Teacher Initials", "Status"],
        TEACHER_ALLOCATIONS: ["Academic Year", "Term", "Teacher Staff Number", "Teacher Name", "Programme", "Class", "Stream", "Subject Code", "Subject Name", "Allocation Type"],
        ACADEMIC_STRUCTURE: ["Record Type", "Stable Reference", "Programme", "Class", "Stream", "Subject Code", "Status"],
        A_LEVEL_COMBINATIONS: ["Combination Code", "Combination Name", "Principal Subject 1", "Principal Subject 2", "Principal Subject 3", "Subsidiary Subject", "Status"],
        COMPETENCIES: ["Programme", "Subject Code", "Learning Area", "Topic", "Learning Outcome", "Competency", "Curriculum Version", "Status"],
    };
    const workbook = new ExcelJS.Workbook();
    const instructions = workbook.addWorksheet("INSTRUCTIONS");
    instructions.addRow([`SOMA REPORT ENGINE ${type.replaceAll("_", " ")} IMPORT`]);
    styleHeader(instructions.getRow(1));
    instructions.addRow(["Use stable identifiers, do not add passwords, and upload only through the controlled Import / Export page."]);
    const sheet = workbook.addWorksheet("IMPORT DATA", { views: [{ state: "frozen", ySplit: 1 }] });
    sheet.addRow(columns[type]);
    styleHeader(sheet.getRow(1));
    sheet.columns = columns[type].map(() => ({ width: 22 }));
    sheet.autoFilter = { from: "A1", to: `${String.fromCharCode(64 + columns[type].length)}1` };
    await downloadWorkbook(workbook, `SOMA_REPORT_ENGINE_${type}_IMPORT_TEMPLATE.xlsx`);
}
export async function parseSimpleWorkbook(file) {
    if (!file.name.toLowerCase().endsWith(".xlsx"))
        throw new Error("Upload the current .xlsx template. .xls and .xlsm files are rejected.");
    if (file.size > 10 * 1024 * 1024)
        throw new Error("The workbook exceeds the 10 MB upload limit.");
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await file.arrayBuffer());
    const sheet = workbook.getWorksheet("IMPORT DATA");
    if (!sheet)
        throw new Error("The workbook does not contain the required IMPORT DATA worksheet.");
    const headerValues = sheet.getRow(1).values;
    const headers = (Array.isArray(headerValues) ? headerValues.slice(1) : Object.values(headerValues)).map((value) => String(value ?? "").trim());
    const rows = [];
    for (let index = 2; index <= sheet.rowCount; index += 1) {
        const row = sheet.getRow(index);
        const record = {};
        headers.forEach((header, column) => { const cell = row.getCell(column + 1); record[header] = cellText(cell); });
        if (Object.values(record).some(Boolean))
            rows.push(record);
    }
    if (!rows.length)
        throw new Error("The workbook contains no import rows.");
    return { headers, rows };
}
export async function exportSchoolDataXlsx(type, learners, staff, marksRows) {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet(type, { views: [{ state: "frozen", ySplit: 1 }] });
    if (type === "LEARNERS") {
        sheet.addRow(["Admission Number", "Learner", "Programme", "Class", "Stream", "Gender", "Status"]);
        learners.forEach((item) => sheet.addRow([safeSpreadsheetText(item.admissionNumber), safeSpreadsheetText(getLearnerFullName(item)), item.programme, item.className, item.stream, item.gender, item.status]));
    }
    else if (type === "STAFF") {
        sheet.addRow(["Staff Number", "Name", "Email", "Department", "Role", "Teacher Initials", "Status"]);
        staff.forEach((item) => sheet.addRow([item.staffNumber, safeSpreadsheetText(item.name), safeSpreadsheetText(item.email), item.department, item.role, item.initials, item.accountStatus]));
    }
    else {
        sheet.addRow(["Admission Number", "Learner", "Class", "Stream", "Subject", "AoI /20", "Exam /80", "Mark % /100", "Status"]);
        marksRows.forEach((row) => sheet.addRow(row.map(safeSpreadsheetText)));
    }
    styleHeader(sheet.getRow(1));
    sheet.columns = Array.from({ length: sheet.columnCount }, () => ({ width: 22 }));
    sheet.autoFilter = { from: "A1", to: `${String.fromCharCode(64 + sheet.columnCount)}${Math.max(1, sheet.rowCount)}` };
    await downloadWorkbook(workbook, `SOMA_REPORT_ENGINE_${type}_EXPORT_${new Date().toISOString().slice(0, 10)}.xlsx`);
}
