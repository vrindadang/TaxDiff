import { GoogleGenAI, Type } from "@google/genai";

const API_KEY = process.env.GEMINI_API_KEY || "";
const ai = new GoogleGenAI({ apiKey: API_KEY });

export interface TaxAnalysisInput {
  oldRuleText: string;
  oldFormText: string;
  newRuleText: string;
  newFormText: string;
  oldRuleNo: string;
  oldFormNo: string;
  newRuleNo: string;
  newFormNo: string;
  oldSection: string;
  newSection: string;
  selectedSections: string[];
}

export interface NavigatorEntry {
  label: string;
  oldLabel?: string;
  oldPage: number | null;
  newPage: number | null;
  description?: string;
}

function healJSON(json: string): string {
  let healed = json.trim();
  if (healed.endsWith(',')) healed = healed.slice(0, -1);
  const stack: string[] = [];
  let inString = false, escaped = false;
  for (let i = 0; i < healed.length; i++) {
    const char = healed[i];
    if (escaped) { escaped = false; continue; }
    if (char === '\\') { escaped = true; continue; }
    if (char === '"') { inString = !inString; continue; }
    if (!inString) {
      if (char === '{' || char === '[') stack.push(char);
      else if (char === '}' || char === ']') stack.pop();
    }
  }
  if (inString) healed += '"';
  while (stack.length > 0) {
    const last = stack.pop();
    if (last === '{') healed += '}';
    if (last === '[') healed += ']';
  }
  return healed;
}

export async function parseNavigatorTable(text: string): Promise<NavigatorEntry[]> {
  console.log("Parsing navigator table...");
  const prompt = `Extract a table of old and new form/rule mappings from the following text.
Text: ${text.substring(0, 20000)}`;
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              label: { type: Type.STRING },
              oldLabel: { type: Type.STRING },
              oldPage: { type: Type.NUMBER },
              newPage: { type: Type.NUMBER },
              description: { type: Type.STRING }
            },
            required: ["label"]
          }
        }
      },
    });
    const rawText = response.text || "[]";
    try { return JSON.parse(rawText); }
    catch { return JSON.parse(healJSON(rawText)); }
  } catch (error) {
    console.error("Error parsing navigator table:", error);
    return [];
  }
}

const SYSTEM_INSTRUCTION = `You are a senior international tax consultant producing a precise, consulting-grade comparative analysis report.

CRITICAL OUTPUT RULES:
- Produce ONE continuous report. Never restart, duplicate, or generate alternatives.
- No preamble, no "Agent" labels, no meta-commentary. Start directly with the first requested section.
- Use MARKDOWN for all formatting: tables with | pipes, **bold** for emphasis, inline redline tags.
- Be CONCISE. Every sentence must add analytical value. No filler prose.
- Prefer TABLES and STRUCTURED formats over paragraphs wherever possible.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
REDLINE FORMAT — MANDATORY RULES (READ CAREFULLY)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. For DELETED text, ALWAYS use:   [DEL: actual original text that was removed]
2. For ADDED text, ALWAYS use:     [ADD: actual new text that was inserted]
3. NEVER use [REMOVED CLAUSE] or [REMOVED] as a standalone tag. 
   Instead, ALWAYS include the original text inside a [DEL:] tag so the reader can see what was deleted.
4. NEVER use [NEW CLAUSE] as a standalone tag.
   Instead, ALWAYS include the actual new text inside an [ADD:] tag.
5. In Track Changes tables (Table 2), BOTH columns must show meaningful text:
   - "Old Text" column: Show the original text. Wrap portions that were deleted with [DEL: deleted portion].
   - "New Text" column: Show the replacement text. Wrap portions that were added with [ADD: added portion].
   - If an entire clause was removed, put the FULL original text in the Old Text column wrapped as [DEL: full original text], and write [DEL: Entire clause removed] in the New Text column.
   - If an entire clause is new, write [ADD: Entire clause is new] in the Old Text column, and put the FULL new text in the New Text column wrapped as [ADD: full new text].

EXAMPLES OF CORRECT REDLINE:
  Old Text: [DEL: on or before the end of the assessment year]
  New Text: [ADD: within 12 months from the end of the relevant tax year]

  Old Text: [DEL: Self-verification by assessee / authorized signatory]
  New Text: [ADD: Form No. 44 shall be verified by an accountant: (a) where the assessee is a company; or (b) foreign tax exceeds one lakh rupees.]

  Old Text: provisions of [DEL: section 115JB or section 115JC]
  New Text: provisions of [ADD: section 206]

EXAMPLES OF WRONG REDLINE (NEVER DO THIS):
  ✗ Old Text: [REMOVED CLAUSE]          ← Wrong! Missing the actual deleted text
  ✗ Old Text: [REMOVED]                 ← Wrong! Missing the actual deleted text  
  ✗ New Text: [NEW CLAUSE]              ← Wrong! Missing the actual new text
  ✗ Old Text: (empty or blank)          ← Wrong! Must show what existed before

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

SECTION STRUCTURE (use only the sections requested):

SECTION 1: FORM IDENTITY CARD
A comparison TABLE (not prose). Columns: Attribute | Old Form | New Form.
Rows MUST include: Form Number, Rule Reference, Governing Section, Who Must File, Filing Deadline, Mode of Filing, Filed With/To, Frequency.

SECTION 2: TRACK CHANGES (LINE-BY-LINE REDLINE)
Split into TWO sub-sections (2A: Rule changes, 2B: Form changes). Each sub-section has TWO tables:
- Table 1: Analysis table (4 columns: Clause/Sub-rule | Old Rule Text | New Rule Text | Redline Summary)
- Table 2: Track Change Text table (3 columns: S.No. | Old Text | New Text)

SECTION 2B must start on a new page.

CRITICAL TABLE 2 RULES:
- In Table 2, the "Old Text" column MUST contain the original statutory text with deleted portions wrapped in [DEL: ...].
- In Table 2, the "New Text" column MUST contain the replacement text with added portions wrapped in [ADD: ...].
- EVERY row must have meaningful text in BOTH the Old Text and New Text columns.
- NEVER leave the Old Text column as just [REMOVED CLAUSE] or [REMOVED] — always include the actual original words.
- Minimum 6 rows in each Table 2.

SECTION 3: CATEGORISED CHANGE ANALYSIS
A MARKDOWN TABLE with columns: # | Field / Clause | Change Description | Primary Category | Secondary Category | Tax Expert Note
Minimum 7 rows. Category tags MUST use the actual letter code [A] through [L] followed by the category name (e.g., [K] New Compliance Obligation). NEVER use [X].

SECTION 4: IT SYSTEM & RECORD-KEEPING IMPACT
A MARKDOWN TABLE with columns: # | System Area | Action Required | Triggered By | Description. Minimum 5 rows.

SECTION 5: RISK FLAGS FOR TAX PROFESSIONALS
Start with a 2-3 sentence introductory paragraph providing professional context about the overall risk landscape of this transition.
Then list exactly 5 risk flags as cards. Each flag must:
- Have a severity prefix: **High Risk**, **Medium Risk**, or **Data Matching Risk**
- Have a specific, descriptive title derived from the actual changes found in the source texts
- Contain 3-4 sentences with specific rule/form/section references from the analyzed documents
- Cover these 5 risk dimensions (adapt titles to the specific forms/rules being analyzed):
  1. The single most impactful new compliance obligation
  2. Any area of ambiguity or subjectivity introduced
  3. Any data-matching or cross-referencing risk enabled by new disclosure requirements
  4. Any transition risk between the old and new framework
  5. Any expanded reporting scope or catch-all clause that increases the disclosure burden
Do NOT hardcode titles — derive them from what the source texts actually say.

SECTION 6: EXECUTIVE SUMMARY
Purpose (1 sentence), Top 3 Changes (numbered, 2 sentences each), Biggest Action Item (1 sentence), Complexity Rating.`;

function buildContext(input: TaxAnalysisInput): string {
  return `━━━ METADATA ━━━
OLD: Rule ${input.oldRuleNo} | Form ${input.oldFormNo} | Section ${input.oldSection} | IT Act 1961 / Rules 1962
NEW: Rule ${input.newRuleNo} | Form ${input.newFormNo} | Section ${input.newSection} | IT Act 2025

━━━ OLD RULE TEXT ━━━
${input.oldRuleText || 'Not provided'}

━━━ OLD FORM TEXT ━━━
${input.oldFormText || 'Not provided'}

━━━ NEW RULE TEXT ━━━
${input.newRuleText || 'Not provided'}

━━━ NEW FORM TEXT ━━━
${input.newFormText || 'Not provided'}`;
}

async function callGemini(prompt: string, model: string = "gemini-3.1-pro-preview"): Promise<string> {
  console.log(`Calling Gemini API with model ${model}...`);
  const startTime = Date.now();
  try {
    const response = await ai.models.generateContent({
      model: model,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        temperature: 0.1,
        maxOutputTokens: 16384,
        systemInstruction: SYSTEM_INSTRUCTION,
      },
    });
    const duration = Date.now() - startTime;
    console.log(`Gemini API call completed in ${duration}ms`);
    return response.text || "";
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`Gemini API call failed after ${duration}ms:`, error);
    throw error;
  }
}

export async function analyzeTaxForms(input: TaxAnalysisInput): Promise<string> {
  console.log("Analyzing tax forms with input summary:", {
    oldFormNo: input.oldFormNo,
    newFormNo: input.newFormNo,
    oldFormTextLength: input.oldFormText?.length || 0,
    newFormTextLength: input.newFormText?.length || 0,
    oldRuleTextLength: input.oldRuleText?.length || 0,
    newRuleTextLength: input.newRuleText?.length || 0
  });
  
  // Truncate input texts if they are extremely long to stay within reasonable context limits
  const truncate = (t: string) => t.length > 30000 ? t.substring(0, 30000) + "... [TRUNCATED]" : t;
  const safeInput = {
    ...input,
    oldRuleText: truncate(input.oldRuleText),
    oldFormText: truncate(input.oldFormText),
    newRuleText: truncate(input.newRuleText),
    newFormText: truncate(input.newFormText)
  };

  const context = buildContext(safeInput);
  const wants = (s: string) => input.selectedSections.some(
    sel => sel.toUpperCase().includes(s.toUpperCase())
  );

  const promises: Promise<string | null>[] = [];

  // ── CALL 1: IDENTITY CARD + TRACK CHANGES ──────────────────────────────────
  if (wants("SECTION 1") || wants("SECTION 2")) {
    console.log("Preparing Call 1 (Identity Card + Track Changes)...");
    const prompt1 = `${context}

Produce a deep comparative analysis. Generate ONLY the sections listed below.

SECTION 1: FORM IDENTITY CARD
Create a MARKDOWN TABLE comparing the old and new forms. Use this exact format:

| Attribute | Old Form | New Form |
|-----------|----------|----------|
| Form Number | ... | ... |
| Rule Reference | ... | ... |
| Governing Section | ... | ... |
| Who Must File | ... | ... |
| Filing Deadline | ... | ... |
| Mode of Filing | ... | ... |
| Filed With / To | ... | ... |
| Frequency | ... | ... |

Do NOT write this as prose. It MUST be a markdown table.

SECTION 2: TRACK CHANGES (LINE-BY-LINE REDLINE)
Split into TWO clearly labelled sub-sections. Each sub-section has TWO tables:
- Table 1: Analysis table (4 columns: Clause/Sub-rule | Old Rule Text | New Rule Text | Redline Summary)
- Table 2: Track Change Text table (3 columns: S.No. | Old Text | New Text)

**SECTION 2A: CHANGES IN RULE**

Table 1 — Rule Analysis:
| Clause / Sub-rule | Old Rule Text | New Rule Text | Redline Summary |
|-------------------|--------------|--------------|-----------------|

Minimum 6 rows covering: Filing Deadline, Verification Authority, Refund Triggers, Disputed Tax Credit, MAT/AMT References, TT Buying Rate, Updated Return Reference.

Table 2 — Rule Track Changes:
| S.No. | Old Text (Rule ${input.oldRuleNo}) | New Text (Rule ${input.newRuleNo}) |
|-------|-----------------------------------|-----------------------------------|

CRITICAL TABLE 2 RULES:
- The "Old Text" column MUST contain the original statutory text. Wrap portions that were deleted in [DEL: ...].
- The "New Text" column MUST contain the replacement text. Wrap portions that were added in [ADD: ...].
- If an entire clause was removed, put the FULL original text in the Old Text column wrapped as [DEL: full original text], and write [DEL: Entire clause removed] in the New Text column.
- If an entire clause is new, write [ADD: Entire clause is new] in the Old Text column, and put the FULL new text in the New Text column wrapped as [ADD: full new text].
- Keep text concise — quote only the key phrase that changed, not entire paragraphs. Minimum 6 rows matching Table 1.

**SECTION 2B: CHANGES IN FORM**
(This sub-section MUST start on a new page in the report.)

Table 1 — Form Analysis:
| Field Group | Old Form | New Form | Redline Summary |
|------------|----------|----------|-----------------|

Minimum 5 rows covering: Form Title & Rule Reference, Basic Assessee Details, Tax Payable Columns, Verification by Accountant, Disputed Tax Intimation.

Table 2 — Form Track Changes:
| S.No. | Old Text (Form ${input.oldFormNo}) | New Text (Form ${input.newFormNo}) |
|-------|----------------------------------|----------------------------------|

CRITICAL TABLE 2 RULES:
- The "Old Text" column MUST contain the original form field text. Wrap portions that were deleted in [DEL: ...].
- The "New Text" column MUST contain the replacement text. Wrap portions that were added in [ADD: ...].
- If an entire field/clause was removed, put the FULL original text in the Old Text column wrapped as [DEL: full original text], and write [DEL: Entire clause removed] in the New Text column.
- If an entire field/clause is new, write [ADD: Entire clause is new] in the Old Text column, and put the FULL new text in the New Text column wrapped as [ADD: full new text].
- Minimum 5 rows matching Table 1.

CRITICAL: Start directly with "SECTION 1: FORM IDENTITY CARD". No preamble. No notes about metadata. No introductory sentences.`;
    
    promises.push(callGemini(prompt1));
  } else {
    promises.push(Promise.resolve(null));
  }

  // ── CALL 2: CATEGORISED ANALYSIS + SYSTEM IMPACT + RISKS + SUMMARY ────────
  const needsAnalysis = wants("SECTION 3") || wants("SECTION 4") || 
                         wants("SECTION 5") || wants("SECTION 6");
  
  if (needsAnalysis) {
    console.log("Preparing Call 2 (Analysis, Impact, Risks, Summary)...");
    const prompt2 = `${context}

Produce a deep comparative analysis. Generate ONLY the sections listed below. Do NOT generate Section 1 or Section 2.

SECTION 3: CATEGORISED CHANGE ANALYSIS
Output a MARKDOWN TABLE directly. No preamble, no intermediate "Row N:" format, no "Step 1/Step 2" process. Go straight to the table.

| # | Field / Clause | Change Description | Primary Category | Secondary Category | Tax Expert Note |
|---|----------------|-------------------|-----------------|-------------------|-----------------|

MANDATORY minimum 7 rows covering:
- Verification by Accountant (CA certification threshold for companies and FTC >= Rs.1 Lakh)
- Taxpayer Identification Number (foreign TIN — new field requirement)
- Income from outside India / Net Income definition (Note 6 — Gross minus expenses)
- Form 45 for Disputed Tax (new form for settlement intimation, also requiring CA cert)
- Consolidated Tax Payable (merged Normal and MAT/AMT columns into single column)
- DTAA Compliance Declaration (assessee and CA must explicitly declare DTAA alignment)
- Section References renumbering (Sec 90/90A -> 159; Sec 91 -> 160; Sec 115JB/JC -> 206)

Each row's Primary and Secondary Category MUST use the ACTUAL letter code from this list — never use [X]:
[A] Scope Enlargement | [B] Scope Reduction | [C] New Information Required | [D] Information Removed | [E] Threshold/Numerical | [F] Terminology/Language Change | [G] Section/Rule Renumbering | [H] Process/Procedural Change | [I] System/Digital Change | [J] Structural Reorganisation | [K] New Compliance Obligation | [L] Obligation Removed

Examples: "[K] New Compliance Obligation", "[C] New Information Required", "[G] Section/Rule Renumbering"
NEVER write "[X]" — always use the real letter A through L.
Each Tax Expert Note must include a specific system impact, risk exposure, or enforcement/data-matching insight.

SECTION 4: IT SYSTEM & RECORD-KEEPING IMPACT
Output a MARKDOWN TABLE directly. No preamble, no intermediate "Row N:" format, no "Step 1/Step 2" process. Go straight to the table.

| # | System Area | Action Required | Triggered By | Description |
|---|-------------|----------------|-------------|-------------|

MANDATORY 5 rows covering these system areas:
1. ERP / Master Data — Foreign TIN capture
2. Accounting / Computation — Net Income calculation automation
3. Workflow / Approvals — CA certification workflow integration
4. Compliance Tracking — Disputed tax settlement tracking (Form 45)
5. Record Keeping — Expense apportionment documentation

Each row's "Triggered By" must cite a specific rule sub-section or form field reference (e.g., "Rule 76(16)", "Form 44 Note 6").
Each "Description" must be a concrete, actionable sentence describing what must change in the IT system.

SECTION 5: RISK FLAGS FOR TAX PROFESSIONALS

Start with a 2-3 sentence introductory paragraph providing professional context about the overall risk landscape of this transition. Then list exactly 5 risk flags.

IMPORTANT: This tool analyzes ANY form/rule transition — not just Form 44/67. You must derive your risk flags from the ACTUAL source texts provided above. Do NOT hardcode titles — derive them from what the source texts actually say.

Format each flag as:
- **[Severity] - [Title derived from source text]:** [3-4 sentences with specific rule/form/section references from the analyzed documents. Explain the practical consequence for taxpayers and professionals.]

Severity levels: **High Risk**, **Medium Risk**, or **Data Matching Risk**

Cover these 5 risk dimensions (titles MUST be specific to the forms/rules being analyzed):
1. The single most impactful NEW compliance obligation introduced by the new framework
2. Any area of AMBIGUITY or SUBJECTIVITY created by the new rules (undefined terms, missing formulas, vague language)
3. Any DATA MATCHING or cross-referencing risk enabled by new disclosure fields or information requirements
4. Any TRANSITION risk between the old and new framework (legacy cases, procedural mismatches, retroactive applicability)
5. Any EXPANDED REPORTING scope or catch-all clause that broadens the disclosure burden

Order: High Risk flags first, then Medium Risk, then Data Matching Risk.

SECTION 6: EXECUTIVE SUMMARY
Format exactly as:

Purpose of the Form: [1 sentence describing what the new form/rule replaces and its function — derive from the actual metadata provided]

Top 3 Significant Changes:

1. **[Title]:** [2 sentences describing the change and its impact]

2. **[Title]:** [2 sentences describing the change and its impact]

3. **[Title]:** [2 sentences describing the change and its impact]

Biggest Compliance Action Item: [1 sentence directed at CFOs and Heads of Tax — specific to the forms/rules analyzed]

Overall Complexity Rating: [HIGH / MEDIUM / LOW]

CRITICAL: Start directly with "SECTION 3: CATEGORISED CHANGE ANALYSIS". No preamble. Do NOT repeat Section 1 or 2.`;

    promises.push(callGemini(prompt2));
  } else {
    promises.push(Promise.resolve(null));
  }

  // ── EXECUTE IN PARALLEL ──────────────────────────────────────────
  console.log("Executing Gemini calls in parallel...");
  const overallStartTime = Date.now();
  const [result1, result2] = await Promise.all(promises);
  console.log(`Parallel Gemini calls finished in ${Date.now() - overallStartTime}ms`);

  const rawCombined = [result1, result2]
    .filter(r => r !== null)
    .join('\n\n')
    .replace(/^(Okay|Sure|Here|Note:|I have|As a|Following|Let me|Below|This report)[^\n]*/gim, '') // strip preamble
    .replace(/^#{1,4}\s*/gm, '') // strip markdown heading prefixes (### SECTION -> SECTION)
    .trim();

  // ── DEDUPLICATION LOGIC ─────────────────────────────────────
  const sectionRegex = /^(SECTION\s+\d+[A-Z]?[:—\s].*?)$/gm;
  const parts = rawCombined.split(sectionRegex);
  
  const uniqueSections = new Map<string, string>();
  let currentHeader = "PREAMBLE";
  let skipDuplicate = false;

  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;

    if (trimmed.match(/^SECTION\s+\d+[A-Z]?[:—\s]/i)) {
      // Normalize to just the section number for dedup (e.g., "SECTION 3" regardless of subtitle)
      const sectionNum = trimmed.match(/^SECTION\s+\d+[A-Z]?/i)?.[0]?.toUpperCase().trim() || trimmed;
      currentHeader = sectionNum;
      if (!uniqueSections.has(currentHeader)) {
        uniqueSections.set(currentHeader, trimmed);
        skipDuplicate = false;
      } else {
        // This section already exists — skip all its content
        skipDuplicate = true;
      }
    } else if (currentHeader && !skipDuplicate) {
      const existing = uniqueSections.get(currentHeader) || "";
      if (!existing.includes(trimmed.substring(0, 50))) {
         uniqueSections.set(currentHeader, existing + (existing ? "\n\n" : "") + trimmed);
      }
    }
  }

  const preamble = uniqueSections.get("PREAMBLE");
  if (preamble === undefined || preamble.trim() === "") {
    uniqueSections.delete("PREAMBLE");
  }

  if (uniqueSections.size === 0 || (uniqueSections.size === 1 && uniqueSections.has("PREAMBLE"))) return rawCombined;

  return Array.from(uniqueSections.values()).join('\n\n');
}
