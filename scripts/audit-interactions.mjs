import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const sourceRoot = path.resolve("apps/web/src");
const outputFile = path.resolve("docs/security/INTERACTION_AUDIT.csv");
const interactiveTags = new Set(["button", "a", "Link", "select", "form", "input", "textarea"]);

function filesUnder(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    return entry.isDirectory() ? filesUnder(full) : entry.isFile() && /\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

function textOf(node, sourceFile) {
  return node.getText(sourceFile).replace(/\s+/g, " ").trim();
}

function attr(opening, name) {
  const item = opening.attributes.properties.find((property) =>
    ts.isJsxAttribute(property) && property.name.getText() === name,
  );
  return item && ts.isJsxAttribute(item) ? item.initializer?.getText() ?? "true" : "";
}

function labelFor(node, sourceFile, tag) {
  const opening = ts.isJsxElement(node) ? node.openingElement : node;
  const aria = attr(opening, "aria-label");
  if (aria) return aria.replace(/^['"]|['"]$/g, "");
  if (ts.isJsxElement(node)) {
    const content = node.children.map((child) => textOf(child, sourceFile)).join(" ").replace(/[{}<>]/g, " ").replace(/\s+/g, " ").trim();
    if (content) return content.slice(0, 160);
  }
  return attr(opening, "placeholder").replace(/^['"]|['"]$/g, "") || tag;
}

const rows = [[
  "Page/File", "Component", "Element", "Label", "Expected Action", "Backend/API Required",
  "Database Effect", "Notification Effect", "Audit Effect", "Permission Required",
  "Confirmation Required", "Success State", "Error State", "Empty State", "Current Status",
]];

for (const file of filesUnder(sourceRoot)) {
  const source = fs.readFileSync(file, "utf8");
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let component = path.basename(file, path.extname(file));

  function visit(node) {
    if ((ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node)) && node.parent) {
      const candidate = node.name?.getText() || (ts.isVariableDeclaration(node.parent) ? node.parent.name.getText() : "");
      if (/^[A-Z]/.test(candidate)) component = candidate;
    }
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
      const opening = ts.isJsxElement(node) ? node.openingElement : node;
      const tag = opening.tagName.getText();
      if (interactiveTags.has(tag)) {
        const handler = attr(opening, "onClick") || attr(opening, "onSubmit") || attr(opening, "onChange");
        const destination = attr(opening, "to") || attr(opening, "href");
        const disabled = attr(opening, "disabled");
        const type = attr(opening, "type");
        let status = "FUNCTIONAL";
        if (disabled) status = "INTENTIONALLY_DISABLED";
        else if ((tag === "button" || tag === "form") && !handler && type !== '"submit"' && type !== "'submit'") status = "NEEDS_NAVIGATION_CONNECTION";
        else if ((tag === "Link" || tag === "a") && !destination) status = "NEEDS_NAVIGATION_CONNECTION";
        const expected = destination ? `Navigate: ${destination}` : handler ? `Handler: ${handler.slice(0, 180)}` : type.includes("submit") ? "Submit enclosing form" : "Review required";
        rows.push([
          path.relative(process.cwd(), file), component, tag, labelFor(node, sourceFile, tag), expected,
          "REVIEW", "REVIEW", "REVIEW", "REVIEW", "REVIEW", "REVIEW", "REVIEW", "REVIEW", "REVIEW", status,
        ]);
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
}

const csv = rows.map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(",")).join("\n");
fs.mkdirSync(path.dirname(outputFile), { recursive: true });
fs.writeFileSync(outputFile, `${csv}\n`);
const counts = rows.slice(1).reduce((all, row) => ({ ...all, [row[14]]: (all[row[14]] || 0) + 1 }), {});
console.log(JSON.stringify({ outputFile, controls: rows.length - 1, counts }, null, 2));
