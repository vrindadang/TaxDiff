export function cleanWebText(text: string): string {
  if (!text) return "";
  return text
    // Remove Gazette headers and artifacts
    .replace(/THE GAZETTE OF INDIA\s*:\s*EXTRAORDINARY/gi, "")
    .replace(/\[PART II—SEC\.\s*3\(i\)\]/gi, "")
    // Remove Hindi Gazette headers and characters
    .replace(/भारत\s*का\s*राजपत्र\s*:\s*असाधारण/g, "")
    .replace(/[\u0900-\u097F]+/g, " ")
    // Remove timestamps and common web artifacts
    .replace(/\d{1,2}\/\d{1,2}\/\d{2,4},\s\d{1,2}:\d{2}\s[AP]M/g, "")
    .replace(/about:blank/g, "")
    .replace(/Income Tax Department/g, "")
    // Remove lone page numbers on a line
    .replace(/^\s*\d+\s*$/gm, "")
    // Normalize whitespace while preserving structure
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n/g, "\n\n")
    .trim();
}

export function extractSection(
  fullText: string,
  query: string,
  type: "rule" | "form"
): { text: string; foundAt: number; charCount: number } | null {
  const cleanQuery = query.replace(/Rule\s+|Form\s+/i, "").trim();
  if (!cleanQuery) return null;

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // WHY THESE PATTERNS?
  // 
  // pdfjsLib joins all text items on a page with spaces:
  //   content.items.map(item => item.str).join(" ")
  // 
  // So "75. Other documents..." does NOT appear at start-of-line (^).
  // It appears MID-STRING after the previous rule's last sentence:
  //   "...has been exercised. 75. Other documents and information..."
  //
  // Patterns using ^ (start-of-line) FAIL because there are no real
  // line breaks within a page — only \n between pages.
  //
  // RULES format:  "75. Title of rule.— (1) ..."
  // FORMS format:  "FORM NO. 41 [See rule 75(1)]"
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  const startPatterns = type === "rule" 
    ? [
        // Pattern 1: "75." after sentence-ending punctuation (most common case)
        //   Matches: "...exercised. 75. Other documents..."
        new RegExp(`(?:[.;)\\]]\\s+)${cleanQuery}\\.\\s+[A-Z][a-z]`),

        // Pattern 2: "75." after a newline (rule starts on a new page)
        //   Matches: "\n75. Other documents..."
        new RegExp(`(?:^|\\n)\\s*${cleanQuery}\\.\\s+[A-Z][a-z]`, "m"),

        // Pattern 3: "75." after gazette page header artifacts
        //   Matches: "3(i)] 75. Other..." or "EXTRAORDINARY 75. Other..."
        new RegExp(`(?:3\\(i\\)\\]|EXTRAORDINARY)\\s+${cleanQuery}\\.\\s+[A-Z]`),

        // Pattern 4: "75." preceded by any whitespace (broadest non-anchored match)
        //   Matches: " 75. Other documents..."
        new RegExp(`(?:^|\\s)${cleanQuery}\\.\\s+[A-Z][a-z]`, "m"),

        // Pattern 5: Legacy "Rule 75" format (some PDFs may use it)
        new RegExp(`\\bRule\\s+${cleanQuery}\\b`, "i"),

        // Pattern 6: Broadest fallback — just the number followed by ". " and a word
        new RegExp(`(?:^|\\s)${cleanQuery}\\.\\s+\\w`, "m"),
      ]
    : [
        // FORMS: "FORM NO. 41" or "FORM NO.41" — these work fine because
        // "FORM NO." is a distinctive marker that doesn't need line anchoring
        new RegExp(`FORM\\s+NO\\.?\\s*${cleanQuery}\\b`, "i"),
        new RegExp(`\\[Form No\\.?\\s*${cleanQuery}\\]`, "im"),
        new RegExp(`FORM\\s+${cleanQuery}\\b`, "i"),
      ];

  let match: RegExpExecArray | null = null;

  for (let i = 0; i < startPatterns.length; i++) {
    match = startPatterns[i].exec(fullText);
    if (match) break;
  }

  if (!match) return null;

  // ━━━ Adjust start position to the actual rule/form number ━━━
  // The regex may have captured prefix chars (". ", "\n", etc.)
  // We want `start` to point at "75." or "FORM", not the prefix.
  let start = match.index;

  if (type === "rule") {
    const numPos = fullText.indexOf(`${cleanQuery}.`, start);
    if (numPos !== -1 && numPos <= start + match[0].length) {
      start = numPos;
    }
  } else {
    const formPos = fullText.indexOf("FORM", start);
    if (formPos !== -1 && formPos <= start + match[0].length) {
      start = formPos;
    }
  }

  // ━━━ Find the end boundary ━━━
  // We look for the NEXT rule/form number.
  const endPattern = type === "rule"
    ? new RegExp(`(?:[.;)\\]]\\s+|\\n\\s*)(?!${cleanQuery}\\.)\\d+\\.\\s+[A-Z]`, "m")
    : new RegExp(`FORM\\s+NO\\.?\\s*(?!${cleanQuery}\\b)\\d+`, "i");

  let end = fullText.length;
  // Skip the current start marker
  const nextMatch = endPattern.exec(fullText.substring(start + 20));
  if (nextMatch) {
    let matchPos = start + 20 + nextMatch.index;
    // Adjust back to the start of the number
    if (type === "rule") {
      const numMatch = /\d+\./.exec(nextMatch[0]);
      if (numMatch) {
        matchPos = start + 20 + nextMatch.index + nextMatch[0].indexOf(numMatch[0]);
      }
    }
    end = matchPos;
  }

  // If extracting rules, also stop if we hit the Forms section
  if (type === "rule") {
    const formMarker = fullText.substring(start + 20).search(/FORM\s+NO/i);
    if (formMarker !== -1) {
      end = Math.min(end, start + 20 + formMarker);
    }
  }

  // Cap length to avoid runaway extraction
  end = Math.min(end, start + 80000);

  const extracted = cleanWebText(fullText.substring(start, end));

  return { text: extracted, foundAt: start, charCount: extracted.length };
}

export function detectAndExtract(
  fullText: string,
  query: string,
  type: "rule" | "form"
): { text: string; foundAt: number; charCount: number; method: string } | null {
  const cleanQuery = query.replace(/Rule\s+|Form\s+/i, "").trim();
  
  // SCENARIO A (single-doc)
  if (fullText.length < 20000 && fullText.includes(cleanQuery)) {
    const first1000 = fullText.substring(0, 1000);
    if (first1000.includes(cleanQuery)) {
      const text = cleanWebText(fullText);
      return { text, foundAt: 0, charCount: text.length, method: 'single-doc' };
    }
  }

  // SCENARIO B: search
  const result = extractSection(fullText, query, type);
  if (result) {
    return { ...result, method: 'search' };
  }

  return null;
}

export function extractByPage(
  pageTexts: string[],
  targetPage: number,
  type: "rule" | "form"
): { text: string; charCount: number } | null {
  if (!pageTexts || targetPage < 1 || targetPage > pageTexts.length) return null;

  let combined = "";
  const startIdx = targetPage - 1;
  
  // Pattern for the START of ANY section (Rule or Form)
  const nextSectionPattern = type === "rule" 
    ? /^\s*\d+\.\s+.*?[.—–]/im 
    : /^\s*FORM\s+NO\.?\s*\d+/im;

  for (let i = startIdx; i < pageTexts.length; i++) {
    const pageText = pageTexts[i];
    
    // If it's not the first page we're adding, check if a new section starts here
    if (i > startIdx) {
      const match = nextSectionPattern.exec(pageText);
      if (match && match.index < 1000) { // If a new section starts near the top of the page
        combined += pageText.substring(0, match.index);
        break;
      }
    }
    
    combined += pageText + "\n";
    
    // Increased safety break for long legal documents
    if (combined.length > 150000) break;
  }

  const cleaned = cleanWebText(combined);
  return { text: cleaned, charCount: cleaned.length };
}
