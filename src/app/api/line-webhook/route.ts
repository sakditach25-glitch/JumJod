import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { ItemStatus } from '@/lib/types';
import { classifyAndParseMessageWithAI, calculateDueDate } from '@/lib/ai';

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

      // 1. Link LINE accounts via link code (#link CODE)
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
        .select('*')
        .eq('line_user_id', lineUserId)
        .single();

      if (profileError || !profile) {
        await sendLineReply(
          replyToken,
          '🔔 ยินดีต้อนรับสู่ จำจด (JumJod)!\n\nบัญชี LINE นี้ยังไม่ได้เชื่อมต่อกับระบบ เพื่อเริ่มช่วยจำกรุณาดำเนินการดังนี้:\n\n1. เข้าสู่ระบบทางหน้าเว็บจำจด\n2. ไปที่หน้าตั้งค่าและรับ "รหัสเชื่อมต่อไลน์"\n3. พิมพ์รหัสกลับมาในแชตนี้ ในรูปแบบ: #link รหัสของคุณ\n(เช่น #link ABC123D)'
        );
        continue;
      }

      // Fetch user's existing items for AI context matching
      const { data: itemsData } = await supabaseAdmin
        .from('items')
        .select('*')
        .eq('user_id', profile.id)
        .order('updated_at', { ascending: false })
        .limit(30);
      const existingItems = itemsData || [];

      // 3. Stateful Conversation Check (Check if user has a pending item flow)
      const pendingData = profile.pending_item_data || memoryStateCache.get(lineUserId);

      if (pendingData) {
        const choice = messageText.toUpperCase();
        
        if (choice === 'PR' || choice === '1' || choice.includes('พีอาร์')) {
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

          await supabaseAdmin.from('profiles').update({ pending_item_data: null }).eq('id', profile.id);
          memoryStateCache.delete(lineUserId);

        } else if (choice === 'ITEM' || choice === '2' || choice.includes('ไอเทม')) {
          const status: ItemStatus = 'Issuing Item';
          
          const { error: insertError } = await supabaseAdmin.from('items').insert([
            {
              user_id: profile.id,
              title: pendingData.title,
              description: pendingData.description,
              status,
              reminder_date: pendingData.reminder_date,
              po_date: pendingData.po_date || new Date().toISOString().substring(0, 10),
              credit_term: pendingData.credit_term || 30,
              budget_due_date: pendingData.budget_due_date || calculateDueDate(new Date().toISOString().substring(0, 10), 30),
            },
          ]);

          if (insertError) {
            console.error('Error inserting item from LINE:', insertError);
            await sendLineReply(replyToken, '❌ เกิดข้อผิดพลาดในการบันทึกข้อมูล กรุณาลองใหม่อีกครั้ง');
          } else {
            const finalDueDate = pendingData.budget_due_date || calculateDueDate(new Date().toISOString().substring(0, 10), 30);
            const formattedDate = new Date(finalDueDate!).toLocaleDateString('th-TH', { dateStyle: 'medium' });
            
            let replyText = `✅ บันทึกเป็น "ITEM (รายการสำเร็จ)" สำเร็จ!\nรายการ: "${pendingData.title}"\n📅 วันครบกำหนดชำระ: ${formattedDate}\n*รายการนี้จะแสดงเฉพาะในหน้า 'รายการสำเร็จ' เท่านั้น*`;
            await sendLineReply(replyToken, replyText);
          }

          await supabaseAdmin.from('profiles').update({ pending_item_data: null }).eq('id', profile.id);
          memoryStateCache.delete(lineUserId);

        } else if (choice === 'ยกเลิก' || choice === 'CANCEL' || choice === '3') {
          await supabaseAdmin.from('profiles').update({ pending_item_data: null }).eq('id', profile.id);
          memoryStateCache.delete(lineUserId);
          await sendLineReply(replyToken, '❌ ยกเลิกการบันทึกรายการจัดซื้อเรียบร้อยแล้ว');
        } else {
          await sendLineReply(
            replyToken,
            `⚠️ คำสั่งไม่ถูกต้อง\n\nกรุณาพิมพ์ตอบ 'PR' เพื่อบันทึกเป็นใบขอซื้อ หรือ 'ITEM' เพื่อบันทึกเป็นรายการสำเร็จ (หรือพิมพ์ 'ยกเลิก' เพื่อยกเลิก)`
          );
        }
        continue;
      }

      // 4. Initial Request intent classification using AI
      console.log(`[LINE BOT] Classifying user query: "${messageText}"`);
      const parsedResult = await classifyAndParseMessageWithAI(messageText, existingItems);

      switch (parsedResult.intent) {
        case 'SEARCH': {
          const query = parsedResult.search_query || '';
          
          const { data: searchResults, error: searchError } = await supabaseAdmin
            .from('items')
            .select('id, title, status, credit_term, budget_due_date')
            .eq('user_id', profile.id)
            .or(`title.ilike.%${query}%,description.ilike.%${query}%`)
            .order('updated_at', { ascending: false })
            .limit(5);

          if (searchError || !searchResults || searchResults.length === 0) {
            await sendLineReply(replyToken, `🔍 ไม่พบรายการจัดซื้อใดๆ ที่เกี่ยวข้องกับ "${query}"`);
          } else {
            let replyText = `🔍 ผลการค้นหาค้างจ่าย/จัดซื้อสำหรับ "${query}":\n`;
            searchResults.forEach((item, index) => {
              const statusEmoji = item.status === 'Pending' ? '🔹 [กำลังดำเนินการ]' 
                : item.status === 'Purchasing' ? '🔸 [ติดต่อจัดซื้อ]' 
                : '✅ [สำเร็จ/ออก ITEM]';
              
              replyText += `\n${index + 1}. ${item.title}\nสถานะ: ${statusEmoji}`;
              if (item.budget_due_date) {
                const formattedDate = new Date(item.budget_due_date).toLocaleDateString('th-TH', { dateStyle: 'short' });
                replyText += `\nวันครบชำระ: ${formattedDate}`;
              }
              replyText += '\n';
            });
            await sendLineReply(replyToken, replyText.trim());
          }
          break;
        }

        case 'DELETE': {
          if (parsedResult.item_id) {
            const { data: itemToDelete } = await supabaseAdmin
              .from('items')
              .select('title')
              .eq('id', parsedResult.item_id)
              .single();

            const { error: deleteError } = await supabaseAdmin
              .from('items')
              .delete()
              .eq('id', parsedResult.item_id);

            if (deleteError) {
              await sendLineReply(replyToken, '❌ เกิดข้อผิดพลาดในการลบรายการจัดซื้อ');
            } else {
              await sendLineReply(replyToken, `🗑️ ลบรายการ "${itemToDelete?.title || 'รายการจัดซื้อ'}" เรียบร้อยแล้วครับ!`);
            }
          } else {
            await sendLineReply(replyToken, '❌ ไม่พบรายการจัดซื้อที่คุณต้องการลบ กรุณาระบุชื่อรายการจัดซื้อให้ชัดเจนขึ้นในข้อความครับ');
          }
          break;
        }

        case 'COMPLETE': {
          if (parsedResult.item_id) {
            const { data: itemToComplete } = await supabaseAdmin
              .from('items')
              .select('title, po_date, credit_term')
              .eq('id', parsedResult.item_id)
              .single();

            const finalPoDate = itemToComplete?.po_date || new Date().toISOString().substring(0, 10);
            const finalCreditTerm = itemToComplete?.credit_term || 30;
            const calculatedDueDate = calculateDueDate(finalPoDate, finalCreditTerm);

            const { error: completeError } = await supabaseAdmin
              .from('items')
              .update({
                status: 'Issuing Item',
                po_date: finalPoDate,
                credit_term: finalCreditTerm,
                budget_due_date: calculatedDueDate,
                updated_at: new Date().toISOString()
              })
              .eq('id', parsedResult.item_id);

            if (completeError) {
              await sendLineReply(replyToken, '❌ เกิดข้อผิดพลาดในการบันทึกข้อมูลสำเร็จ');
            } else {
              const formattedDate = new Date(calculatedDueDate!).toLocaleDateString('th-TH', { dateStyle: 'medium' });
              await sendLineReply(
                replyToken, 
                `🎉 บันทึกสำเร็จแล้ว!\nอัปเดตรายการ "${itemToComplete?.title}" เป็น "สำเร็จ (ออก ITEM)" เรียบร้อยแล้ว\n📅 วันครบกำหนดชำระ: ${formattedDate}\n*รายการนี้จะย้ายจากบอร์ดไปแสดงที่หน้า 'รายการสำเร็จ' ทันที*`
              );
            }
          } else {
            await sendLineReply(replyToken, '❌ ไม่พบรายการค้างทำที่ต้องการตั้งค่าให้เสร็จสิ้น กรุณาระบุชื่อให้ชัดเจนขึ้นครับ');
          }
          break;
        }

        case 'UPDATE': {
          if (parsedResult.item_id && parsedResult.update_data) {
            const { data: itemToUpdate } = await supabaseAdmin
              .from('items')
              .select('title, po_date, credit_term')
              .eq('id', parsedResult.item_id)
              .single();

            if (itemToUpdate) {
              const updates: Record<string, any> = { ...parsedResult.update_data };
              const finalPoDate = updates.po_date || itemToUpdate.po_date || new Date().toISOString().substring(0, 10);
              const finalCreditTerm = updates.credit_term || itemToUpdate.credit_term || 30;
              
              updates.po_date = finalPoDate;
              updates.credit_term = finalCreditTerm;
              updates.budget_due_date = calculateDueDate(finalPoDate, finalCreditTerm);
              updates.updated_at = new Date().toISOString();

              const { error: updateError } = await supabaseAdmin
                .from('items')
                .update(updates)
                .eq('id', parsedResult.item_id);

              if (updateError) {
                await sendLineReply(replyToken, '❌ เกิดข้อผิดพลาดในการแก้ไขข้อมูลรายการ');
              } else {
                let replyText = `✅ แก้ไขรายการ "${itemToUpdate.title}" สำเร็จแล้ว!`;
                if (updates.credit_term) {
                  const formattedDate = new Date(updates.budget_due_date!).toLocaleDateString('th-TH', { dateStyle: 'medium' });
                  replyText += `\n💵 อัปเดตเครดิต: ${updates.credit_term} วัน\n📅 วันครบชำระใหม่: ${formattedDate}`;
                }
                await sendLineReply(replyToken, replyText);
              }
            } else {
              await sendLineReply(replyToken, '❌ ไม่พบรายการจัดซื้อที่ระบุสำหรับการแก้ไข');
            }
          } else {
            await sendLineReply(replyToken, '❌ ไม่พบรายการจัดซื้อหรือข้อมูลที่ต้องการแก้ไข กรุณาระบุชื่อรายการและจุดที่ต้องการเปลี่ยนใหม่ครับ');
          }
          break;
        }

        case 'UNKNOWN': {
          const helpMessage = parsedResult.message || `💡 ยินดีต้อนรับสู่ จำจด (JumJod) แชตบอต!\n\nคุณสามารถคุยสั่งงานบอทได้ดังนี้:\n\n➕ **บันทึกรายการจัดซื้อ:** พิมพ์สินค้าได้เลย เช่น "ซื้อหมึกพิมพ์ 5 กล่อง เครดิต 30 วัน"\n🔍 **ค้นหารายการ:** พิมพ์คำว่า "ค้นหา" ตามด้วยชื่อ เช่น "ค้นหา กระดาษ"\n✏️ **แก้ไขรายการ:** พิมพ์คำว่า "แก้ไข" ตามด้วยข้อมูลใหม่ เช่น "แก้ไข รายการซื้อคอมพิวเตอร์ เปลี่ยนเครดิตเป็น 60 วัน"\n🗑️ **ลบรายการ:** พิมพ์คำว่า "ลบ" ตามด้วยชื่อสินค้า เช่น "ลบ ซื้อคอมพิวเตอร์"\n🎉 **แจ้งสำเร็จ (ITEM):** พิมพ์คำว่า "สำเร็จ" ตามด้วยชื่อสินค้า เช่น "ซื้อหมึกพิมพ์สำเร็จแล้ว"`;
          await sendLineReply(replyToken, helpMessage);
          break;
        }

        case 'CREATE':
        default: {
          const createData = parsedResult.create_data;
          if (!createData) {
            await sendLineReply(replyToken, '❌ ไม่เข้าใจคำสั่งซื้อ กรุณาลองพิมข้อความใหม่อีกครั้ง');
            continue;
          }

          // Save pending state in DB and cache
          const { error: saveStateError } = await supabaseAdmin
            .from('profiles')
            .update({ pending_item_data: createData })
            .eq('id', profile.id);

          if (saveStateError) {
            console.warn('Failed to save pending state in profiles:', saveStateError.message);
          }
          memoryStateCache.set(lineUserId, createData);

          // Reply with LINE Flex Message Confirmation
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
                    text: `"${createData.title}"`,
                    weight: 'bold',
                    size: 'sm',
                    margin: 'md',
                    wrap: true,
                    color: '#1e293b'
                  },
                  {
                    type: 'text',
                    text: createData.credit_term 
                      ? `📅 เครดิต: ${createData.credit_term} วัน (ครบชำระ: ${new Date(createData.budget_due_date!).toLocaleDateString('th-TH', { dateStyle: 'short' })})`
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
          break;
        }
      }
    }

    return new Response('OK', { status: 200 });
  } catch (error) {
    console.error('LINE webhook error:', error);
    return new Response('Internal Server Error', { status: 500 });
  }
}
