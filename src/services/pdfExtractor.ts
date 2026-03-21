export function cleanWebText(text: string): string {
  if (!text) return "";
  return text
    // Remove Gazette headers and artifacts
    .replace(/THE GAZETTE OF INDIA\s*:\s*EXTRAORDINARY/gi, "")
    .replace(/\[PART II—SEC\.\s*3\(i\)\]/gi, "")
    .replace(/\[\s*(?:P\s*(?:ART)?\s*)?II\s*—\s*S\s*(?:EC)?\s*\.\s*3\s*\(\s*i\s*\)\s*\]/gi, "")
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
        new RegExp(`FORM\\s+NO\\.?\\s*${cleanQuery}\\b[\\s\\S]{0,20}\\[\\s*[Ss]ee\\s+[Rr]ule`, "i"),
        new RegExp(`FORM\\s+NO\\.?\\s*${cleanQuery}\\s*\\n\\s*\\[`, "i"),
        new RegExp(`FORM\\s+NO\\.?\\s*${cleanQuery}\\s*\\[`, "i"),
        new RegExp(`FORM\\s+NO\\.?\\s*${cleanQuery}\\b`, "i"),
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
  let end = fullText.length;

  if (type === "rule") {
    const ruleNum = parseInt(cleanQuery, 10);
    if (!isNaN(ruleNum)) {
      // Only look for the NEXT SEQUENTIAL rule numbers (e.g., 238, 239, 240...)
      // NOT any random number like "1." or "8." inside tables
      for (let next = ruleNum + 1; next <= ruleNum + 5; next++) {
        const endCandidates = [
          new RegExp(`(?:[.;)\\]]\\s+)${next}\\.\\s+[A-Z][a-z]`),
          new RegExp(`(?:^|\\n)\\s*${next}\\.\\s+[A-Z][a-z]`, "m"),
          new RegExp(`(?:^|\\s)${next}\\.\\s+[A-Z][a-z]`, "m"),
        ];
        let found = false;
        for (const ep of endCandidates) {
          const endMatch = ep.exec(fullText.substring(start + 50));
          if (endMatch) {
            const candidateEnd = start + 50 + endMatch.index;
            // Skip cross-references like "section 238" or "rule 238(2)"
            const before = fullText.substring(Math.max(0, candidateEnd - 30), candidateEnd + 5);
            const numStr = `${next}.`;
            const numIdx = before.indexOf(numStr);
            if (numIdx > 0) {
              const textBefore = before.substring(0, numIdx);
              if (/(?:section|rule|sub-rule|form\s+no\.?|under|of|in)\s*$/i.test(textBefore)) {
                continue;
              }
            }
            const exactNumIdx = fullText.indexOf(`${next}.`, candidateEnd);
            if (exactNumIdx !== -1 && exactNumIdx <= candidateEnd + 10) {
              end = exactNumIdx;
            } else {
              end = candidateEnd;
            }
            found = true;
            break;
          }
        }
        if (found) break;
      }
    }
  } else {
    // Form end boundary - find next FORM NO. heading with [See rule
    const formEndPattern = new RegExp(
      `FORM\\s+NO\\.?\\s*(?!${cleanQuery}\\b)\\d+\\b[\\s\\S]{0,20}\\[\\s*[Ss]ee\\s+[Rr]ule`, "i"
    );
    const endMatch = formEndPattern.exec(fullText.substring(start + 50));
    if (endMatch) {
      const formIdx = fullText.substring(start + 50).toUpperCase().indexOf("FORM", endMatch.index);
      if (formIdx !== -1) {
        end = start + 50 + formIdx;
      }
    }
    // Fallback: any FORM NO. that isn't ours
    if (end === fullText.length) {
      const fallbackPattern = new RegExp(`FORM\\s+NO\\.?\\s*(?!${cleanQuery}\\b)\\d+`, "i");
      const fallbackMatch = fallbackPattern.exec(fullText.substring(start + 50));
      if (fallbackMatch) {
        const fIdx = fullText.substring(start + 50).toUpperCase().indexOf("FORM", fallbackMatch.index);
        if (fIdx !== -1) end = start + 50 + fIdx;
      }
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
