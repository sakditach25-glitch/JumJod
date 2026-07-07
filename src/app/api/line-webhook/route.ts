import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { ItemStatus } from '@/lib/types';

// Initialize Supabase admin client using the service role key to bypass RLS policies
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function verifySignature(body: string, signature: string, channelSecret: string): boolean {
  const hash = crypto
    .createHmac('SHA256', channelSecret)
    .update(body)
    .digest('base64');
  return hash === signature;
}

async function sendLineReply(replyToken: string, text: string) {
  const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!channelAccessToken) {
    console.error('Missing LINE_CHANNEL_ACCESS_TOKEN in environment variables.');
    return;
  }

  try {
    const response = await fetch('https://api.line.me/v2/bot/message/reply', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${channelAccessToken}`,
      },
      body: JSON.stringify({
        replyToken,
        messages: [
          {
            type: 'text',
            text,
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Error replying to LINE:', errorData);
    }
  } catch (error) {
    console.error('Failed to send LINE reply:', error);
  }
}

// Calculate due date utility
function calculateDueDate(poDateStr: string, creditTerm: number): string {
  const date = new Date(poDateStr);
  date.setDate(date.getDate() + creditTerm);
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export async function POST(request: Request) {
  try {
    const rawBody = await request.text();
    const signature = request.headers.get('x-line-signature');
    const channelSecret = process.env.LINE_CHANNEL_SECRET;

    // Verify signature if secret is provided in environment variables
    if (channelSecret && signature) {
      const isValid = verifySignature(rawBody, signature, channelSecret);
      if (!isValid) {
        return new Response('Invalid signature', { status: 401 });
      }
    } else {
      console.warn('Skipping LINE webhook signature verification because LINE_CHANNEL_SECRET is not configured.');
    }

    const payload = JSON.parse(rawBody);
    const events = payload.events || [];

    for (const event of events) {
      if (event.type !== 'message' || event.message.type !== 'text') {
        continue;
      }

      const replyToken = event.replyToken;
      const lineUserId = event.source.userId;
      const messageText = event.message.text.trim();

      if (!replyToken || !lineUserId) continue;

      // 1. Check if the user is attempting to link their account
      const linkMatch = messageText.match(/^#link\s+(\w+)/i);
      if (linkMatch) {
        const linkCode = linkMatch[1].toUpperCase();
        console.log(`[LINK ATTEMPT] User ${lineUserId} trying to link code: ${linkCode}`);
        
        // Find profile with valid link code
        const { data: profile, error: findError } = await supabaseAdmin
          .from('profiles')
          .select('id, email')
          .eq('link_code', linkCode)
          .gt('link_code_expires_at', new Date().toISOString())
          .single();

        if (findError || !profile) {
          console.error(`[LINK FAILED] Code ${linkCode} not found or expired. Error:`, findError);
          await sendLineReply(
            replyToken,
            '❌ รหัสเชื่อมต่อไม่ถูกต้อง หรือหมดอายุแล้ว กรุณาสร้างรหัสใหม่จากหน้าเว็บจำจดแล้วพิมพ์ใหม่อีกครั้ง'
          );
          continue;
        }

        console.log(`[LINK SUCCESS] Found profile ${profile.email} for code: ${linkCode}`);

        // Link LINE account to Supabase profile
        const { error: updateError } = await supabaseAdmin
          .from('profiles')
          .update({
            line_user_id: lineUserId,
            link_code: null,
            link_code_expires_at: null,
            updated_at: new Date().toISOString()
          })
          .eq('id', profile.id);

        if (updateError) {
          await sendLineReply(replyToken, '❌ เกิดข้อผิดพลาดในระบบฐานข้อมูล กรุณาลองใหม่อีกครั้งภายหลัง');
        } else {
          await sendLineReply(
            replyToken,
            `✅ เชื่อมต่อบัญชีเรียบร้อยแล้ว!\nอีเมลที่เชื่อมต่อ: ${profile.email}\n\nคุณสามารถพิมพ์บันทึกรายการจัดซื้อผ่านแชตนี้ได้ทันที`
          );
        }
        continue;
      }

      // 2. Fetch profile associated with this lineUserId
      const { data: profile, error: profileError } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .eq('line_user_id', lineUserId)
        .single();

      if (profileError || !profile) {
        await sendLineReply(
          replyToken,
          '🔔 ยินดีต้อนรับสู่ จำจด (JumJod)!\n\nบัญชี LINE นี้ยังไม่ได้เชื่อมต่อกับระบบ เพื่อเริ่มช่วยจำกรุณาดำเนินการดังนี้:\n\n1. เข้าสู่ระบบทางหน้าเว็บจำจด\n2. ไปที่หน้าตั้งค่าและรับ "รหัสเชื่อมต่อไลน์"\n3. พิมพ์รหัสกลับมาในแชตนี้ ในรูปแบบ: #link รหัสของคุณ\n(เช่น #link ABC123D)'
        );
        continue;
      }

      // 3. User is linked, parse the message to extract procurement details
      // Supported format: [Title] [Credit term 30/60/90] [Reminder Date YYYY-MM-DD]
      // We can also extract values intelligently:
      let title = messageText;
      let description = `บันทึกผ่าน LINE Bot: ${messageText}`;
      let status: ItemStatus = 'Pending';
      let creditTerm: 30 | 60 | 90 | null = null;
      let poDate: string | null = null;
      let budgetDueDate: string | null = null;
      let reminderDate: string | null = null;

      // Extract Credit Term (30/60/90)
      const creditMatch = messageText.match(/(?:เครดิต|credit)\s*(30|60|90)\s*(?:วัน|days)?/i);
      if (creditMatch) {
        creditTerm = Number(creditMatch[1]) as 30 | 60 | 90;
        status = 'Purchasing'; // Promote to purchasing since credit term is specified
        poDate = new Date().toISOString().substring(0, 10); // Default PO date to today
        budgetDueDate = calculateDueDate(poDate, creditTerm);
        // Clean title
        title = title.replace(creditMatch[0], '').trim();
      }

      // Extract Dates (format YYYY-MM-DD or YYYY/MM/DD)
      const dateMatch = messageText.match(/(\d{4})[-/](\d{2})[-/](\d{2})/);
      if (dateMatch) {
        const extractedDate = `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`;
        // If poDate was set (credit term was matched), use this date as PO Date
        if (creditTerm) {
          poDate = extractedDate;
          budgetDueDate = calculateDueDate(poDate, creditTerm);
        } else {
          // Otherwise, set it as a Reminder Date
          reminderDate = new Date(extractedDate).toISOString();
        }
        // Clean title
        title = title.replace(dateMatch[0], '').trim();
      }

      // Final cleaning of title to look neat
      title = title.replace(/\s+/g, ' ').trim();
      if (title.length > 80) {
        title = title.substring(0, 80) + '...';
      }

      // Insert item into Supabase
      const { error: insertError } = await supabaseAdmin.from('items').insert([
        {
          user_id: profile.id,
          title,
          description,
          status,
          reminder_date: reminderDate,
          po_date: poDate,
          credit_term: creditTerm,
          budget_due_date: budgetDueDate,
        },
      ]);

      if (insertError) {
        console.error('Error inserting item from LINE:', insertError);
        await sendLineReply(replyToken, '❌ เกิดข้อผิดพลาดในการบันทึกข้อมูลจัดซื้อลงระบบ กรุณาลองใหม่อีกครั้ง');
      } else {
        let replyMsg = `📌 จำจดบันทึกให้เรียบร้อยแล้ว!\nรายการ: "${title}"\nสถานะ: ${
          status === 'Pending' ? 'กำลังดำเนินการ' : 'ติดต่อที่จัดซื้อ (มีเครดิตเทอม)'
        }`;

        if (creditTerm && budgetDueDate) {
          replyMsg += `\n💵 เครดิต: ${creditTerm} วัน\n📅 วันครบชำระ: ${new Date(
            budgetDueDate
          ).toLocaleDateString('th-TH', { dateStyle: 'medium' })}`;
        }

        if (reminderDate) {
          replyMsg += `\n⏰ วันแจ้งเตือน: ${new Date(reminderDate).toLocaleDateString(
            'th-TH',
            { dateStyle: 'medium' }
          )}`;
        }

        await sendLineReply(replyToken, replyMsg);
      }
    }

    return new Response('OK', { status: 200 });
  } catch (error) {
    console.error('LINE webhook error:', error);
    return new Response('Internal Server Error', { status: 550 });
  }
}
