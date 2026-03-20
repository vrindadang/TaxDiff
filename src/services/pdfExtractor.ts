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

  // Precise Rule Start: <number>. <Title>.[—–] (1)
  // Precise Form Start: FORM NO. <number> [See rule ...]
  
  const startPatterns = type === "rule" 
    ? [
        new RegExp(`^\\s*${cleanQuery}\\.\\s+.*?[.—–]`, "im"),
        new RegExp(`^\\s*${cleanQuery}\\.\\s+`, "im"),
        new RegExp(`\\bRule\\s+${cleanQuery}\\b`, "i")
      ]
    : [
        new RegExp(`^\\s*FORM\\s+NO\\.?\\s*${cleanQuery}\\b`, "im"),
        new RegExp(`FORM\\s+NO\\.?\\s*${cleanQuery}\\b`, "im"),
        new RegExp(`\\[Form No\\.?\\s*${cleanQuery}\\]`, "im")
      ];

  let match: RegExpExecArray | null = null;
  for (const p of startPatterns) {
    match = p.exec(fullText);
    if (match) break;
  }

  if (!match) return null;

  const start = match.index;
  
  // Find end boundary
  // For Rule: next sequential rule start marker
  // For Form: next FORM NO. <number> marker
  
  const endPattern = type === "rule"
    ? new RegExp(`(?:^|\\n)\\s*(?!${cleanQuery}\\.)\\d+\\.\\s+`, "i")
    : new RegExp(`(?:^|\\n)\\s*FORM\\s+NO\\.?\\s*(?!${cleanQuery}\\b)\\d+`, "i");

  let end = fullText.length;
  // Skip the start marker to find the next one
  const nextMatch = endPattern.exec(fullText.substring(start + 20));
  if (nextMatch) {
    end = start + 20 + nextMatch.index;
  }

  // Cap length to avoid runaway extraction if end marker is missing
  end = Math.min(end, start + 60000);

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
