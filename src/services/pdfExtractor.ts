export function cleanWebText(text: string): string {
  if (!text) return "";
  return text
    .replace(/\d{1,2}\/\d{1,2}\/\d{2,4},\s\d{1,2}:\d{2}\s[AP]M/g, "") // Timestamps
    .replace(/about:blank/g, "")
    .replace(/Income Tax Department/g, "")
    .replace(/^\s*\d+\s*$/gm, "") // Lone superscript/page numbers
    .replace(/\n{3,}/g, "\n\n") // Normalize whitespace
    .trim();
}

export function extractSection(
  fullText: string,
  query: string,
  type: "rule" | "form"
): { text: string; foundAt: number; charCount: number } | null {
  const cleanQuery = query.replace(/Rule\s+|Form\s+/i, "").trim();
  if (!cleanQuery) return null;

  const patterns = type === "rule" 
    ? [
        new RegExp(`^\\s*Rule\\s+${cleanQuery}\\b`, "im"),
        new RegExp(`^\\s*${cleanQuery}\\.\\s*Rule\\b`, "im"),
        new RegExp(`^\\s*${cleanQuery}\\.\\s*\\(1\\)`, "im"),
        new RegExp(`\\b\\d{1,3}\\s+${cleanQuery}\\.\\s*\\(1\\)`, "im"),
        new RegExp(`\\[[^\\]]+\\]\\.?\\s*\\n?\\s*${cleanQuery}\\.`, "im"),
        new RegExp(`^\\s*${cleanQuery}\\.\\s`, "im"),
        new RegExp(`^\\s*${cleanQuery}\\.\\s*\\(`, "im"),
        new RegExp(`^\\s*${cleanQuery}\\.\\s+`, "im"),
        new RegExp(`^\\s*${cleanQuery}\\s+`, "im"),
        new RegExp(`\\bRule\\s+${cleanQuery}\\b`, "i")
      ]
    : [
        new RegExp(`^\\s*FORM\\s+No[\\.\\s]*${cleanQuery}\\b`, "im"),
        new RegExp(`Form\\s+No[\\.\\s]*${cleanQuery}\\b`, "im"),
        new RegExp(`FORM\\s+NO[\\.\\s]*${cleanQuery}\\b`, "im"),
        new RegExp(`\\[Form No\\.?\\s*${cleanQuery}\\]`, "im"),
        new RegExp(`^FORM ${cleanQuery}\\b`, "im"),
        new RegExp(`\\bFORM\\s+NO\\.?\\s+${cleanQuery}\\b`, "i")
      ];

  let match: RegExpExecArray | null = null;
  let foundPatternIndex = -1;

  for (let i = 0; i < patterns.length; i++) {
    match = patterns[i].exec(fullText);
    if (match) {
      foundPatternIndex = i;
      break;
    }
  }

  if (!match) {
    // Last resort: simple indexOf
    const index = fullText.indexOf(cleanQuery);
    if (index !== -1) {
      const start = index;
      const end = Math.min(start + 15000, fullText.length);
      const text = cleanWebText(fullText.substring(start, end));
      return { text, foundAt: start, charCount: text.length };
    }
    return null;
  }

  const start = match.index;
  
  // Find end boundary
  const endPatterns = type === "rule"
    ? [
        new RegExp(`(?:^|\\n)\\s*Rule\\s+(?!${cleanQuery}\\b)\\d+`, "i"), 
        new RegExp(`(?:^|\\n)\\s*\\d+\\.\\s*\\(1\\)`, "i"), 
        /about:blank/i
      ]
    : [
        new RegExp(`(?:^|\\n)\\s*FORM\\s+No[\\.\\s]*(?!${cleanQuery}\\b)\\d+`, "i"),
        new RegExp(`(?:^|\\n)\\s*\\[?Form\\s+No[\\.\\s]*(?!${cleanQuery}\\b)\\d+`, "i"),
        /about:blank/i
      ];

  let end = fullText.length;
  for (const ep of endPatterns) {
    const nextMatch = ep.exec(fullText.substring(start + 10));
    if (nextMatch) {
      end = Math.min(end, start + 10 + nextMatch.index);
    }
  }

  // Cap length
  end = Math.min(end, start + 15000);

  const extracted = cleanWebText(fullText.substring(start, end));

  // If extracted < 300 chars, recurse to find next match if possible
  if (extracted.length < 300 && foundPatternIndex !== -1) {
    const nextSearch = fullText.substring(start + match[0].length);
    const nextResult = extractSection(nextSearch, query, type);
    if (nextResult) {
      return {
        ...nextResult,
        foundAt: start + match[0].length + nextResult.foundAt
      };
    }
  }

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
  
  const headingPattern = type === "rule" 
    ? /^\s*Rule\s+\d+/im 
    : /^\s*(?:\[)?FORM\s+No[.\s]*\d+/im;

  for (let i = startIdx; i < pageTexts.length; i++) {
    const pageText = pageTexts[i];
    
    // If it's not the first page we're adding, and we see a new heading, stop
    if (i > startIdx && headingPattern.test(pageText.substring(0, 500))) {
      break;
    }
    
    combined += pageText + "\n";
    
    // Safety break
    if (combined.length > 20000) break;
  }

  const cleaned = cleanWebText(combined);
  return { text: cleaned, charCount: cleaned.length };
}
