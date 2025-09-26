import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI, Type } from '@google/genai'; // Using @google/genai as per user feedback
import fs from 'fs/promises';
import path from 'path';

// --- Configuration ---
// It's best practice to set your API key as an environment variable.
// Example: GEMINI_API_KEY='your_key_here' in your .env.local file
const API_KEY = process.env.GEMINI_API_KEY || ''; // Use environment variable for Gemini API Key
const MODEL_NAME = "gemini-2.5-pro"; // Using Gemini's latest flagship model.

// --- File Paths ---
// Define paths to your input files
const SCHEMA_PATH = path.join(process.cwd(), "schema.json");

async function readFileContent(filePath: string): Promise<string> {
    // A helper function to read content from a file.
    try {
        return await fs.readFile(filePath, 'utf-8');
    } catch (error) {
        console.error(`Error: File not found or could not be read at path: ${filePath}`, error);
        return "";
    }
}

function createDynamicJsonSchema(guideData: any): any | null { // Return type changed to 'any' for flexibility with Type enum
    // Dynamically creates a response schema based on the number of benchmark
    // questions in the provided guide data.
    const properties: { [key: string]: any } = {}; // Properties type changed to 'any'
    const required: string[] = [];

    try {
        const instructions = guideData?.rolePlayScenerio?.["instruction for roleplay"];
        if (!instructions) {
            console.warn("Warning: 'instruction for roleplay' not found in schema.json.");
            return null;
        }

        const benchmarkKeys = Object.keys(instructions).filter(k => !isNaN(Number(k))).sort((a, b) => Number(a) - Number(b));
        const numBenchmarks = benchmarkKeys.length;

        if (numBenchmarks === 0) {
            console.warn("Warning: No numbered benchmark questions found in schema.json.");
            return null;
        }

        for (let i = 1; i <= numBenchmarks; i++) {
            const perfKey = `performance_observed_${i}`;
            const actionKey = `example_action_${i}`;

            required.push(perfKey, actionKey);

            properties[perfKey] = {
                type: Type.STRING,
                description: `Evaluate student's performance for benchmark criterion ${i} based on the transcript.`
            };
            properties[actionKey] = {
                type: Type.STRING,
                description: `Provide a direct quote from the transcript as evidence for criterion ${i}.`
            };
        }

        return { type: Type.OBJECT, properties, required };

    } catch (e) {
        console.error(`Error: Could not create dynamic JSON schema: ${e}`);
        return null;
    }
}

export async function POST(req: NextRequest) {
    if (!API_KEY) {
        return NextResponse.json({ error: "Gemini API key not configured." }, { status: 500 });
    }

    try {
        const { studentName, transcript, gender } = await req.json();

        if (!studentName || !transcript || !gender) {
            return NextResponse.json({ error: "Missing studentName, transcript, or gender in request body." }, { status: 400 });
        }

        const ai = new GoogleGenAI({ apiKey: API_KEY });
        const model = MODEL_NAME; // Model name is passed directly to generateContentStream

        // --- Load Content from Files ---
        const schemaJsonText = await readFileContent(SCHEMA_PATH);

        if (!schemaJsonText) {
            return NextResponse.json({ error: "schema.json could not be read." }, { status: 500 });
        }

        // --- Create Dynamic Schema from the JSON guide ---
        let parsedSchemaGuide: any;
        try {
            parsedSchemaGuide = JSON.parse(schemaJsonText);
        } catch (error) {
            console.error("Error parsing schema.json:", error);
            return NextResponse.json({ error: "schema.json is not valid JSON." }, { status: 500 });
        }

        const dynamicSchema = createDynamicJsonSchema(parsedSchemaGuide);
        if (!dynamicSchema) {
            console.error("Error: Dynamic schema generation failed.");
            return NextResponse.json({ error: "Could not generate a dynamic schema." }, { status: 500 });
        }
        console.log("Dynamic Schema:", JSON.stringify(dynamicSchema, null, 2));

        // --- Construct the Prompt for Gemini ---
        // System instruction needs to be part of the user prompt for @google/genai
        const systemPromptText = `You are a highly experienced and qualified Vocational Education and Training (VET) Assessor specializing in the Australian Community Services sector. Your area of expertise is the CHC33021 Certificate III in Individual Support (Disability) qualification. You are professional, meticulous, and skilled at evaluating a student's verbal responses against formal assessment criteria.

Context:

You will be provided with two key pieces of information:

The Assessment Guide: The "Pre-filled 3. CHC33021 Certificate III in Individual Support (Disability) – Assessment Kit - Section C". This document contains the official role-play scenarios, questions, and crucially, the formatting and structure of a high-quality benchmark answer (e.g., "Performance to Observe," "Example Actions," "Conclusion").

The Student Transcript: A text transcript of a competency conversation between an assessor and a student for a specific question from the Assessment Guide.

Primary Objective:

Your goal is to act as the official assessor. Based on the evidence presented in the Student Transcript, you will write a new, comprehensive Benchmark Answer. This generated answer must evaluate the student's performance and be written in the exact format and professional tone of the examples found in the Assessment Guide.

Step-by-Step Instructions to Generate Each Benchmark Answer:

Analyze the Student Transcript:
Carefully read the entire student transcript for the specific question being assessed.
Identify and extract the key evidence from the student's responses. Look for specific examples, demonstrated skills, stated knowledge, and any gaps or areas where the response was weak.

Reference the Assessment Guide:
Locate the corresponding question in the Assessment Guide to understand the required criteria.
Pay close attention to the structure, headings (e.g., "Performance to Observe," "Example Actions"), and the level of detail expected in a benchmark answer. The guide is your template for style and format.

Synthesize and Write the Benchmark Answer:
Begin writing the new benchmark answer.
Under headings like "Performance to Observe," describe what the student actually did in the transcript. Synthesize their performance into a professional evaluation. For example: "(student name) effectively demonstrated respect for cultural identity by asking the client about..."
Under headings like "Example Actions," provide direct examples or close paraphrases from the transcript to justify your evaluation. For instance: Example Action: (student name) stated, "I understand that your faith is important to you, so I ensured the art group is women-only and respects cultural attire." This directly addresses the criterion.
Write a concise "Conclusion" that summarizes whether the student's performance in the transcript successfully met the requirements of the unit.

Apply Mandatory Formatting and Placeholders:
Structure: Your generated answer must follow the structure of the benchmark examples in the Assessment Guide (e.g., numbered points, bold headings, etc.).
Placeholders:
Use the placeholder (student name) when referring to the student.
Use the gender-neutral pronouns (he/She) and (his/her) as needed.

Repeat for All Questions:
Follow this process for every question and corresponding transcript section provided.`;

        const finalUserPrompt = `${systemPromptText}


Here is the student's transcript:
--- TRANSCRIPT START ---
${transcript}
--- TRANSCRIPT END ---

Here is the JSON guide for the assessment structure and content:
--- JSON GUIDE START ---
${schemaJsonText}
--- JSON GUIDE END ---

Here is the assessment guide content from the JSON guide:
--- ASSESSMENT GUIDE CONTENT START ---
${parsedSchemaGuide.assessmentGuideContent}
--- ASSESSMENT GUIDE CONTENT END ---

**Your Task:**
You must act as the VET Assessor. Your goal is to generate the final, real benchmark answer by analyzing the **transcript** and following the structure provided in the **JSON guide** above.

**Output Instructions:**
Your response MUST be a single, valid JSON object that strictly adheres to the following JSON Schema. Do NOT include any text, explanations, or markdown formatting outside of the JSON object itself.`;

        const contents = [
            {
                role: 'user',
                parts: [
                    { text: finalUserPrompt },
                ],
            },
        ];

        const config = {
            responseMimeType: 'application/json',
            responseSchema: dynamicSchema,
            temperature: 0.2,
        };

        console.log("Generating structured JSON response from Gemini...");
        console.log("Final User Prompt:", finalUserPrompt);

        const responseStream = await ai.models.generateContentStream({
            model,
            config,
            contents,
        });

        let responseContent = '';
        for await (const chunk of responseStream) {
            responseContent += chunk.text;
        }
        
        console.log("Raw Gemini Response Content:", responseContent);

        const parsedJson = JSON.parse(responseContent || '{}');
        console.log("Parsed Gemini JSON Response:", JSON.stringify(parsedJson, null, 2));

        return NextResponse.json(parsedJson);

    } catch (error: any) {
        console.error("Error in API route:", error.message, error.stack);
        return NextResponse.json({ error: error.message || "An unexpected error occurred." }, { status: 500 });
    }
}
