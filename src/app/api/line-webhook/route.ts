import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { ItemStatus } from '@/lib/types';
import { processMessageWithAI, calculateDueDate } from '@/lib/ai';

// Initialize Supabase admin client using the service role key to bypass RLS policies
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Fallback in-memory cache for conversation states in case database column pending_item_data doesn't exist yet
const memoryStateCache = new Map<string, any>();

function verifySignature(body: string, signature: string, channelSecret: string): boolean {
  const hash = crypto
    .createHmac('SHA256', channelSecret)
    .update(body)
    .digest('base64');
  return hash === signature;
}

async function sendLineReply(replyToken: string, content: string | any) {
  const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!channelAccessToken) {
    console.error('Missing LINE_CHANNEL_ACCESS_TOKEN in environment variables.');
    return;
  }

  const message = typeof content === 'string'
    ? { type: 'text', text: content }
    : content;

  try {
    const response = await fetch('https://api.line.me/v2/bot/message/reply', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${channelAccessToken}`,
      },
      body: JSON.stringify({
        replyToken,
        messages: [message],
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
        .select('*') // Select all including potential pending_item_data
        .eq('line_user_id', lineUserId)
        .single();

      if (profileError || !profile) {
        await sendLineReply(
          replyToken,
          '🔔 ยินดีต้อนรับสู่ จำจด (JumJod)!\n\nบัญชี LINE นี้ยังไม่ได้เชื่อมต่อกับระบบ เพื่อเริ่มช่วยจำกรุณาดำเนินการดังนี้:\n\n1. เข้าสู่ระบบทางหน้าเว็บจำจด\n2. ไปที่หน้าตั้งค่าและรับ "รหัสเชื่อมต่อไลน์"\n3. พิมพ์รหัสกลับมาในแชตนี้ ในรูปแบบ: #link รหัสของคุณ\n(เช่น #link ABC123D)'
        );
        continue;
      }

      // 3. Stateful Conversation Check (Check if user has a pending item flow)
      const pendingData = profile.pending_item_data || memoryStateCache.get(lineUserId);

      if (pendingData) {
        const choice = messageText.toUpperCase();
        
        if (choice === 'PR' || choice === '1' || choice.includes('พีอาร์')) {
          // Store as PR (Pending or Purchasing depending on credit term)
          const status: ItemStatus = pendingData.credit_term ? 'Purchasing' : 'Pending';
          
          const { error: insertError } = await supabaseAdmin.from('items').insert([
            {
              user_id: profile.id,
              title: pendingData.title,
              description: pendingData.description,
              status,
              reminder_date: pendingData.reminder_date,
              po_date: pendingData.po_date,
              credit_term: pendingData.credit_term,
              budget_due_date: pendingData.budget_due_date,
            },
          ]);

          if (insertError) {
            console.error('Error inserting item from LINE:', insertError);
            await sendLineReply(replyToken, '❌ เกิดข้อผิดพลาดในการบันทึกข้อมูล กรุณาลองใหม่อีกครั้ง');
          } else {
            let replyText = `✅ บันทึกเป็น "PR (ใบขอซื้อ)" สำเร็จ!\nรายการ: "${pendingData.title}"`;
            if (pendingData.credit_term && pendingData.budget_due_date) {
              const formattedDate = new Date(pendingData.budget_due_date).toLocaleDateString('th-TH', { dateStyle: 'medium' });
              replyText += `\n💵 เครดิต: ${pendingData.credit_term} วัน\n📅 วันชำระเงินจริง: ${formattedDate} (คำนวณจากวันที่เริ่มออก)`;
            }
            await sendLineReply(replyToken, replyText);
          }

          // Clear State
          await supabaseAdmin.from('profiles').update({ pending_item_data: null }).eq('id', profile.id);
          memoryStateCache.delete(lineUserId);

        } else if (choice === 'ITEM' || choice === '2' || choice.includes('ไอเทม')) {
          // Store as ITEM (Issuing Item / Completed)
          const status: ItemStatus = 'Issuing Item';
          
          const { error: insertError } = await supabaseAdmin.from('items').insert([
            {
              user_id: profile.id,
              title: pendingData.title,
              description: pendingData.description,
              status,
              reminder_date: pendingData.reminder_date,
              po_date: pendingData.po_date || new Date().toISOString().substring(0, 10), // Default to today if empty
              credit_term: pendingData.credit_term || 30, // Default to 30 days if empty
              budget_due_date: pendingData.budget_due_date || calculateDueDate(new Date().toISOString().substring(0, 10), 30),
            },
          ]);

          if (insertError) {
            console.error('Error inserting item from LINE:', insertError);
            await sendLineReply(replyToken, '❌ เกิดข้อผิดพลาดในการบันทึกข้อมูล กรุณาลองใหม่อีกครั้ง');
          } else {
            const finalDueDate = pendingData.budget_due_date || calculateDueDate(new Date().toISOString().substring(0, 10), 30);
            const formattedDate = new Date(finalDueDate!).toLocaleDateString('th-TH', { dateStyle: 'medium' });
            
            let replyText = `✅ บันทึกเป็น "ITEM (รายการสำเร็จ)" สำเร็จ!\nรายการ: "${pendingData.title}"\n📅 วันครบกำหนดชำระ: ${formattedDate}`;
            await sendLineReply(replyToken, replyText);
          }

          // Clear State
          await supabaseAdmin.from('profiles').update({ pending_item_data: null }).eq('id', profile.id);
          memoryStateCache.delete(lineUserId);

        } else if (choice === 'ยกเลิก' || choice === 'CANCEL' || choice === '3') {
          // Cancel flow
          await supabaseAdmin.from('profiles').update({ pending_item_data: null }).eq('id', profile.id);
          memoryStateCache.delete(lineUserId);
          await sendLineReply(replyToken, '❌ ยกเลิกการบันทึกรายการจัดซื้อเรียบร้อยแล้ว');
        } else {
          // Invalid choice, ask again
          await sendLineReply(
            replyToken,
            `⚠️ คำสั่งไม่ถูกต้อง\n\nกรุณาพิมพ์ตอบ 'PR' เพื่อบันทึกเป็นใบขอซื้อ หรือ 'ITEM' เพื่อบันทึกเป็นรายการสำเร็จ (หรือพิมพ์ 'ยกเลิก' เพื่อยกเลิก)`
          );
        }
        continue;
      }

      // 4. Initial Request Parse using AI helper
      console.log(`[LINE BOT] Processing user message: "${messageText}"`);
      const parsedData = await processMessageWithAI(messageText);

      // Save pending state in DB (and in-memory map as fallback)
      const { error: saveStateError } = await supabaseAdmin
        .from('profiles')
        .update({ pending_item_data: parsedData })
        .eq('id', profile.id);

      if (saveStateError) {
        console.warn('Failed to save pending state in profiles table (migration might not be run yet):', saveStateError.message);
      }
      memoryStateCache.set(lineUserId, parsedData);

      // 5. Send LINE Flex Message Confirmation Options
      const flexMessage = {
        type: 'flex',
        altText: 'ยืนยันประเภทการบันทึกรายการจัดซื้อ',
        contents: {
          type: 'bubble',
          body: {
            type: 'box',
            layout: 'vertical',
            contents: [
              {
                type: 'text',
                text: '📌 ช่วยจำรายการจัดซื้อ',
                weight: 'bold',
                size: 'md',
                color: '#7c3aed'
              },
              {
                type: 'text',
                text: `"${parsedData.title}"`,
                weight: 'bold',
                size: 'sm',
                margin: 'md',
                wrap: true,
                color: '#1e293b'
              },
              {
                type: 'text',
                text: parsedData.credit_term 
                  ? `📅 เครดิต: ${parsedData.credit_term} วัน (ครบชำระ: ${new Date(parsedData.budget_due_date!).toLocaleDateString('th-TH', { dateStyle: 'short' })})`
                  : '📅 ยังไม่ได้ระบุเครดิตเทอมการจ่ายเงิน',
                size: 'xs',
                color: '#475569',
                margin: 'xs'
              },
              {
                type: 'separator',
                margin: 'lg'
              },
              {
                type: 'text',
                text: 'ต้องการออกรายการนี้ในรูปแบบใด?',
                size: 'xs',
                color: '#64748b',
                margin: 'md',
                weight: 'semibold'
              }
            ]
          },
          footer: {
            type: 'box',
            layout: 'vertical',
            spacing: 'sm',
            contents: [
              {
                type: 'button',
                style: 'primary',
                height: 'sm',
                color: '#6366f1',
                action: {
                  type: 'message',
                  label: '🔹 บันทึกเป็น PR (ใบขอซื้อ)',
                  text: 'PR'
                }
              },
              {
                type: 'button',
                style: 'primary',
                height: 'sm',
                color: '#10b981',
                action: {
                  type: 'message',
                  label: '🔸 บันทึกเป็น ITEM (สำเร็จ)',
                  text: 'ITEM'
                }
              },
              {
                type: 'button',
                style: 'link',
                height: 'sm',
                action: {
                  type: 'message',
                  label: '❌ ยกเลิก',
                  text: 'ยกเลิก'
                }
              }
            ]
          }
        }
      };

      await sendLineReply(replyToken, flexMessage);
    }

    return new Response('OK', { status: 200 });
  } catch (error) {
    console.error('LINE webhook error:', error);
    return new Response('Internal Server Error', { status: 500 });
  }
}
