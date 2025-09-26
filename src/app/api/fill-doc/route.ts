import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs/promises";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { createReport } from "docx-templates";

export const runtime = "nodejs"; // required to use fs in App Router

type Answers = Record<string, unknown>;

function sanitizeFilename(name: string) {
    return (name || "").replace(/[\\/:*?"<>|]+/g, "_").trim() || "Student";
}

// Replace literal "(student name)" inside all string values and also expose {{student_name}}
function injectStudentName(answers: Answers, studentName: string): Answers {
    const out: Answers = {};
    const re = /\(student name\)/gi;
    for (const [k, v] of Object.entries(answers || {})) {
        out[k] = typeof v === "string" ? v.replace(re, studentName) : v;
    }
    out["student_name"] = studentName; // optional token for your docx
    return out;
}

export async function POST(req: NextRequest) {
    try {
        const { studentName, answers } = (await req.json()) as {
            studentName?: string;
            answers?: Answers;
        };

        if (!studentName || !answers || typeof answers !== "object") {
            return NextResponse.json(
                { ok: false, error: "studentName and answers are required." },
                { status: 400 }
            );
        }

        const root = process.cwd();
        const templatePath = path.join(root, "templates", "blank_form.docx");
        if (!existsSync(templatePath)) {
            return NextResponse.json(
                { ok: false, error: "templates/blank_form.docx not found." },
                { status: 404 }
            );
        }

        const data = injectStudentName(answers, studentName);
        const templateBuf = await fs.readFile(templatePath);

        // Use DOUBLE BRACES in your DOCX: {{performance_observed_1}}, {{example_action_1}}, ...
        const rendered = await createReport({
            template: templateBuf,
            data,
            cmdDelimiter: ["{{", "}}"],
        });

        const outDir = path.join(root, "output");
        if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

        const filename = `${sanitizeFilename(studentName)}_CHC33021.docx`;
        const outPath = path.join(outDir, filename);
        await fs.writeFile(outPath, rendered);

        const base64Docx = Buffer.from(rendered).toString("base64");
        return NextResponse.json({
            ok: true,
            filename,
            savedPath: `output/${filename}`,
            base64Docx,
        });
    } catch (err: any) {
        return NextResponse.json(
            { ok: false, error: err?.message || "Failed to fill doc" },
            { status: 500 }
        );
    }
}
