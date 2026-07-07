import { ItemStatus } from './types';

export interface ParsedProcurementData {
  title: string;
  description: string;
  credit_term: 30 | 60 | 90 | null;
  po_date: string | null;
  budget_due_date: string | null;
  reminder_date: string | null;
}

export interface GeminiParsedOutput {
  intent: 'CREATE' | 'SEARCH' | 'UPDATE' | 'DELETE' | 'COMPLETE' | 'UNKNOWN';
  search_query?: string;
  item_id?: string;
  create_data?: ParsedProcurementData;
  update_data?: {
    title?: string;
    description?: string;
    credit_term?: 30 | 60 | 90 | null;
    po_date?: string | null;
    budget_due_date?: string | null;
    status?: 'Pending' | 'Purchasing' | 'Issuing Item';
  };
  message?: string;
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
 * Helper to select one of the available Gemini API keys from env variables.
 */
function getGeminiApiKey(): string | undefined {
  const keys = [
    process.env.GEMINI_API_KEY_1,
    process.env.GEMINI_API_KEY_2,
    process.env.GEMINI_API_KEY_3,
    process.env.GEMINI_API_KEY_4,
    process.env.GEMINI_API_KEY
  ].filter(Boolean) as string[];

  if (keys.length === 0) return undefined;
  // Rotate key randomly to load balance and manage rate limits
  const randomIndex = Math.floor(Math.random() * keys.length);
  return keys[randomIndex];
}

/**
 * Helper to call Gemini API with a specific model and optional thinking configuration.
 */
async function callGeminiWithModel(
  modelName: string,
  apiKey: string,
  messageText: string,
  existingItems: any[],
  thinkingConfig?: { thinkingBudget?: number; thinkingLevel?: string }
): Promise<GeminiParsedOutput | null> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
  
  const body: any = {
    contents: [{
      parts: [{
        text: `You are an AI data parser for JodJum (จำจด) - a procurement planner system.
Today is ${new Date().toISOString().substring(0, 10)}.
Analyze this message from the user: "${messageText}"

Here is the list of active/recent items for this user:
${JSON.stringify(existingItems.map(item => ({ id: item.id, title: item.title, description: item.description, status: item.status, credit_term: item.credit_term })))}

Determine the user's intent:
1. CREATE: User wants to add/remember a new procurement item.
2. SEARCH: User wants to search or look up items (e.g. "ค้นหาระเบียบ", "หา กระดาษ", "มีรายการจัดซื้อค้างกี่อัน").
3. UPDATE: User wants to edit/change/update details of an existing item (e.g. "แก้ไข รายการซื้อหมึกพิมพ์ เพิ่มเครดิตเป็น 60 วัน", "แก้รายละเอียดคอมเป็นสเปก i7").
4. DELETE: User wants to delete or remove an item (e.g. "ลบรายการกระดาษ", "ลบเซิร์ฟเวอร์").
5. COMPLETE: User wants to mark an item as finished/done/completed/successful (e.g. "ซื้อกระดาษสำเร็จแล้ว", "เสร็จแล้วรายการซื้อคอม", "ออก ITEM รายการเซิร์ฟเวอร์แล้ว").
6. UNKNOWN: Conversational reply, hello, or command they don't understand.

Format the output strictly as a JSON object:
{
  "intent": "CREATE" | "SEARCH" | "UPDATE" | "DELETE" | "COMPLETE" | "UNKNOWN",
  "search_query": "string (for SEARCH intent, extract query keyword, e.g. 'กระดาษ')",
  "item_id": "string (for UPDATE, DELETE, or COMPLETE intents, the UUID of the closest matching item from the provided list, or null if no match)",
  "create_data": {
    "title": "string (clean item title, keep it short and descriptive)",
    "description": "string (optional description details)",
    "credit_term": 30 | 60 | 90 | null,
    "po_date": "YYYY-MM-DD (default to today if credit term is matched)",
    "budget_due_date": "YYYY-MM-DD (calculated as po_date + credit_term if matched, otherwise null)",
    "reminder_date": "ISOString (optional reminder date)"
  },
  "update_data": {
    "title": "string (optional new title)",
    "description": "string (optional new description)",
    "credit_term": 30 | 60 | 90 | null,
    "po_date": "YYYY-MM-DD",
    "budget_due_date": "YYYY-MM-DD",
    "status": "Pending" | "Purchasing" | "Issuing Item"
  },
  "message": "string (for UNKNOWN intent, friendly help guide on how they can command the bot, e.g. how to add, search, edit, delete, or complete)"
}`
      }]
    }],
    generationConfig: {
      responseMimeType: "application/json"
    }
  };

  if (thinkingConfig) {
    body.generationConfig.thinkingConfig = thinkingConfig;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    console.error(`Gemini API error for model ${modelName}: status ${response.status}`);
    return null;
  }

  const data = await response.json();
  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  if (!rawText) return null;

  const parsed = JSON.parse(rawText.trim()) as GeminiParsedOutput;

  // Ensure budget due date is calculated if credit term is set
  if (parsed.intent === 'CREATE' && parsed.create_data) {
    if (parsed.create_data.credit_term && !parsed.create_data.budget_due_date) {
      parsed.create_data.po_date = parsed.create_data.po_date || new Date().toISOString().substring(0, 10);
      parsed.create_data.budget_due_date = calculateDueDate(parsed.create_data.po_date, parsed.create_data.credit_term);
    }
  }

  return parsed;
}

/**
 * Helper to match item by last 3 digits of its ID.
 */
function findItemByShortId(messageText: string, items: any[]): any | null {
  if (items.length === 0) return null;
  // Match #7fa or 7fa at word boundary or end of string
  const match = messageText.match(/(?:#)?\b([a-f0-9]{3})\b/i) || messageText.match(/(?:#)?([a-f0-9]{3})$/i);
  if (match) {
    const shortId = match[1].toLowerCase();
    const found = items.find(item => item.id.toLowerCase().endsWith(shortId));
    if (found) return found;
  }
  return null;
}

/**
 * Classifies the user's message intent and extracts necessary fields using Google Gemini AI.
 * Falls back to a robust regex parser if API keys are missing or calls fail.
 * 
 * @param messageText User message sent to the LINE Bot
 * @param existingItems List of the user's current items for context matching
 */
export async function classifyAndParseMessageWithAI(
  messageText: string,
  existingItems: any[]
): Promise<GeminiParsedOutput> {
  const text = messageText.toLowerCase().trim();
  const matchedItem = findItemByShortId(messageText, existingItems);

  // 1. Intercept with explicit keywords + short ID if matched (100% accurate, no API delay)
  if (matchedItem) {
    // Check for COMPLETE
    if (/(สำเร็จ|เสร็จ|complete|finish|done|ออกรหัส|ออกไอเทม|ออก\s*pr\s*แล้ว)/i.test(text)) {
      return {
        intent: 'COMPLETE',
        item_id: matchedItem.id
      };
    }
    // Check for DELETE
    if (/(ลบ|ยกเลิก|delete|remove)/i.test(text)) {
      return {
        intent: 'DELETE',
        item_id: matchedItem.id
      };
    }
    // Check for request item AX status update
    if (/(แจ้งจัดซื้อ|ขอไอเทม|แอดไอเทม|ส่งจัดซื้อ)/i.test(text)) {
      return {
        intent: 'UPDATE',
        item_id: matchedItem.id,
        update_data: {
          item_request_status: 'Pending',
          status: 'Purchasing'
        } as any
      };
    }
    // Check for UPDATE (e.g. credit term)
    if (/(แก้ไข|แก้|update|edit)/i.test(text)) {
      const creditMatch = text.match(/(?:เครดิต|credit)\s*(30|60|90)/i);
      const credit_term = creditMatch ? Number(creditMatch[1]) as 30 | 60 | 90 : null;
      return {
        intent: 'UPDATE',
        item_id: matchedItem.id,
        update_data: credit_term ? { credit_term } : {}
      };
    }
    // If just the ID suffix is typed, e.g. "7fa" or "#7fa", or with search keywords
    const isJustId = text === matchedItem.id.substring(matchedItem.id.length - 3).toLowerCase() || 
                      text === '#' + matchedItem.id.substring(matchedItem.id.length - 3).toLowerCase();
    const isSearch = text.includes('ค้นหา') || text.includes('หา') || text.includes('search') || text.includes('find') || text.includes('ดู');
    
    if (isJustId || isSearch) {
      return {
        intent: 'SEARCH',
        search_query: matchedItem.title,
        item_id: matchedItem.id
      };
    }
  }

  // 2. Fallback to API if keys are available
  const apiKey = getGeminiApiKey();
  if (apiKey) {
    // Try gemini-2.5-flash first
    try {
      const parsed = await callGeminiWithModel(
        'gemini-2.5-flash',
        apiKey,
        messageText,
        existingItems,
        { thinkingBudget: 0 }
      );
      if (parsed) return parsed;
    } catch (err) {
      console.error('gemini-2.5-flash failed, trying fallback:', err);
    }

    // Fallback to gemini-3.5-flash
    try {
      const parsed = await callGeminiWithModel(
        'gemini-3.5-flash',
        apiKey,
        messageText,
        existingItems,
        { thinkingLevel: 'LOW' }
      );
      if (parsed) return parsed;
    } catch (err) {
      console.error('gemini-3.5-flash fallback failed:', err);
    }
  }

  // Fallback to Regex Parser
  return regexFallbackParser(messageText, existingItems);
}

/**
 * Regex-based fallback parser in case Gemini API is offline or not configured.
 */
function regexFallbackParser(messageText: string, existingItems: any[]): GeminiParsedOutput {
  const text = messageText.toLowerCase().trim();

  // 1. SEARCH intent
  if (text.startsWith('ค้นหา') || text.startsWith('หา') || text.startsWith('search') || text.startsWith('find') || text.startsWith('ดู')) {
    const query = messageText.replace(/^(ค้นหา|หา|search|find|ดู)\s*/i, '').trim();
    const matched = findClosestItem(query, existingItems);
    return { 
      intent: 'SEARCH', 
      search_query: matched ? matched.title : query,
      item_id: matched ? matched.id : undefined
    };
  }

  // 2. DELETE intent
  if (text.startsWith('ลบ') || text.startsWith('delete') || text.startsWith('ยกเลิก')) {
    const query = messageText.replace(/^(ลบ|delete|ยกเลิก)\s*/i, '').trim();
    const matched = findClosestItem(query, existingItems);
    return { intent: 'DELETE', item_id: matched?.id || undefined };
  }

  // 3. COMPLETE intent
  if (text.startsWith('เสร็จแล้ว') || text.startsWith('สำเร็จ') || text.startsWith('complete') || text.includes('เสร็จ') || text.includes('สำเร็จ') || text.includes('ออกรหัส') || text.includes('ออกไอเทม')) {
    const query = messageText.replace(/^(เสร็จแล้ว|สำเร็จ|complete|เสร็จ|ออกรหัส|ออกไอเทม)\s*/i, '').trim();
    const matched = findClosestItem(query, existingItems);
    return { intent: 'COMPLETE', item_id: matched?.id || undefined };
  }

  // 4. Request AX Item intent
  if (text.startsWith('แจ้งจัดซื้อ') || text.startsWith('ขอไอเทม') || text.startsWith('แอดไอเทม') || text.startsWith('ส่งจัดซื้อ')) {
    const query = messageText.replace(/^(แจ้งจัดซื้อ|ขอไอเทม|แอดไอเทม|ส่งจัดซื้อ)\s*/i, '').trim();
    const matched = findClosestItem(query, existingItems);
    return {
      intent: 'UPDATE',
      item_id: matched?.id || undefined,
      update_data: {
        item_request_status: 'Pending',
        status: 'Purchasing'
      } as any
    };
  }

  // 5. UPDATE intent
  if (text.startsWith('แก้ไข') || text.startsWith('แก้') || text.startsWith('edit') || text.startsWith('update')) {
    const query = messageText.replace(/^(แก้ไข|แก้|edit|update)\s*/i, '').trim();
    const creditMatch = query.match(/(?:เครดิต|credit)\s*(30|60|90)/i);
    const credit_term = creditMatch ? Number(creditMatch[1]) as 30 | 60 | 90 : null;

    let targetQuery = query.replace(/(?:เครดิต|credit)\s*(30|60|90)/i, '').trim();
    const matched = findClosestItem(targetQuery, existingItems);

    return {
      intent: 'UPDATE',
      item_id: matched?.id || undefined,
      update_data: credit_term ? { credit_term } : {}
    };
  }

  // 6. CREATE intent (default fallback)
  let credit_term: 30 | 60 | 90 | null = null;
  let po_date: string | null = null;
  let budget_due_date: string | null = null;

  const creditMatch = messageText.match(/(?:เครดิต|credit|cr)\s*(30|60|90)\s*(?:วัน|days)?/i);
  if (creditMatch) {
    credit_term = Number(creditMatch[1]) as 30 | 60 | 90;
    po_date = new Date().toISOString().substring(0, 10);
    budget_due_date = calculateDueDate(po_date, credit_term);
  }

  return {
    intent: 'CREATE',
    create_data: {
      title: messageText.replace(/(?:เครดิต|credit|cr)\s*(30|60|90)\s*(?:วัน|days)?/i, '').trim() || messageText,
      description: `บันทึกผ่าน LINE Bot: ${messageText}`,
      credit_term,
      po_date,
      budget_due_date,
      reminder_date: null
    }
  };
}

function findClosestItem(query: string, items: any[]): any | null {
  if (items.length === 0 || !query) return null;
  const cleanQuery = query.toLowerCase().trim();

  // Try matching by short ID first
  const shortIdMatch = cleanQuery.match(/(?:#)?\b([a-f0-9]{3})\b/) || cleanQuery.match(/(?:#)?([a-f0-9]{3})$/);
  if (shortIdMatch) {
    const shortId = shortIdMatch[1];
    const found = items.find(item => item.id.toLowerCase().endsWith(shortId));
    if (found) return found;
  }

  // Try direct substring match
  for (const item of items) {
    if (item.title.toLowerCase().includes(cleanQuery) || cleanQuery.includes(item.title.toLowerCase())) {
      return item;
    }
  }
  return items[0]; // fallback to latest
}
