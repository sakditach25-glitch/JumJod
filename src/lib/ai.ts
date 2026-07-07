import { ItemStatus } from './types';

export interface ParsedProcurementData {
  title: string;
  description: string;
  credit_term: 30 | 60 | 90 | null;
  po_date: string | null;
  budget_due_date: string | null;
  reminder_date: string | null;
}

/**
 * Calculates a due date based on the PO date and credit term (days).
 */
export function calculateDueDate(poDateStr: string | null, creditTerm: number | null): string | null {
  if (!poDateStr || !creditTerm) return null;
  const date = new Date(poDateStr);
  if (isNaN(date.getTime())) return null;
  date.setDate(date.getDate() + creditTerm);
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Parses user input messages from the LINE Bot to extract procurement information.
 * Features an easily swappable Gemini AI API structure or regex-based NLP backup.
 * 
 * @param messageText User message sent to the LINE Bot
 * @returns Parsed procurement data structure
 */
export async function processMessageWithAI(messageText: string): Promise<ParsedProcurementData> {
  // =========================================================================
  // OPTION: Google Gemini AI Integration (Uncomment and configure key to use)
  // =========================================================================
  /*
  const apiKey = process.env.GEMINI_API_KEY;
  if (apiKey) {
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: `You are an AI data extractor for JodJum (a procurement memory bot).
Extract procurement data from this Thai message: "${messageText}".
Identify the product/item name, credit terms (30, 60, or 90 days), any mentioned PO date, budget due date, or reminder date.
Today is ${new Date().toISOString().substring(0, 10)}.

Format the output strictly as a JSON object with:
{
  "title": "string (the product or purchase name, clean and concise)",
  "description": "string (additional details or full text)",
  "credit_term": 30 | 60 | 90 | null,
  "po_date": "YYYY-MM-DD (or null, default to today if credit term is matched)",
  "budget_due_date": "YYYY-MM-DD (calculated as po_date + credit_term if matched, otherwise null)",
  "reminder_date": "ISOString (any specific alert date mentioned, otherwise null)"
}
Output only valid JSON, no markdown formatting.`
            }]
          }]
        })
      });
      const data = await response.json();
      const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      // Clean JSON formatting backticks if present
      const cleanJson = rawText.replace(/```json/i, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleanJson);
      
      return {
        title: parsed.title || messageText.substring(0, 50),
        description: parsed.description || `บันทึกผ่าน LINE Bot: ${messageText}`,
        credit_term: parsed.credit_term || null,
        po_date: parsed.po_date || null,
        budget_due_date: parsed.budget_due_date || null,
        reminder_date: parsed.reminder_date || null,
      };
    } catch (err) {
      console.error('Gemini parsing failed, falling back to Regex NLP:', err);
    }
  }
  */

  // =========================================================================
  // FALLBACK: Regex-based NLP Parser
  // =========================================================================
  let title = messageText;
  let description = `บันทึกผ่าน LINE Bot: ${messageText}`;
  let credit_term: 30 | 60 | 90 | null = null;
  let po_date: string | null = null;
  let budget_due_date: string | null = null;
  let reminder_date: string | null = null;

  // 1. Extract Credit Term (30, 60, 90)
  const creditMatch = messageText.match(/(?:เครดิต|credit|cr)\s*(30|60|90)\s*(?:วัน|days)?/i);
  if (creditMatch) {
    credit_term = Number(creditMatch[1]) as 30 | 60 | 90;
    po_date = new Date().toISOString().substring(0, 10); // Default PO date to today
    budget_due_date = calculateDueDate(po_date, credit_term);
    // Clean title by removing match
    title = title.replace(creditMatch[0], '').trim();
  }

  // 2. Extract Date (format YYYY-MM-DD or YYYY/MM/DD or DD-MM-YYYY)
  const dateMatch = messageText.match(/(\d{4})[-/](\d{2})[-/](\d{2})/);
  if (dateMatch) {
    const extractedDate = `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`;
    if (credit_term) {
      po_date = extractedDate;
      budget_due_date = calculateDueDate(po_date, credit_term);
    } else {
      reminder_date = new Date(extractedDate).toISOString();
    }
    // Clean title
    title = title.replace(dateMatch[0], '').trim();
  }

  // Final cleanups
  title = title.replace(/\s+/g, ' ').trim();
  if (title.length > 80) {
    title = title.substring(0, 80) + '...';
  }

  return {
    title: title || 'รายการจัดซื้อไม่ได้ระบุชื่อ',
    description,
    credit_term,
    po_date,
    budget_due_date,
    reminder_date,
  };
}
