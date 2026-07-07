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

/**
 * Creates a beautiful LINE Flex Message Bubble for JodJum items.
 */
function createItemFlexBubble(item: any, appUrl: string) {
  const shortId = item.id.substring(item.id.length - 3);
  const editUrl = `${appUrl}/dashboard?edit=${item.id}`;
  
  // Determine Status text and badge color
  let statusText = 'บันทึกทั่วไป';
  let statusColor = '#64748b'; // slate
  let infoText = '';
  
  if (item.is_pr) {
    if (item.has_item_number) {
      if (item.pr_number) {
        statusText = `ออก PR แล้ว (#${item.pr_number})`;
        statusColor = '#10b981'; // green
        infoText = `📦 AX Item: ${item.item_number || 'มีเลขแล้ว'}`;
      } else {
        statusText = 'พร้อมออก PR';
        statusColor = '#8b5cf6'; // violet
        infoText = `📦 AX Item: ${item.item_number || 'มีเลขแล้ว'}`;
      }
    } else {
      if (item.item_request_status === 'Pending') {
        statusText = 'รอจัดซื้อแอด Item ใน AX';
        statusColor = '#f59e0b'; // amber
        infoText = '⏳ ส่งเรื่องจัดซื้อเรียบร้อยแล้ว (รอแอด Item)';
      } else {
        statusText = 'ยังไม่มีเลข Item';
        statusColor = '#ef4444'; // red
        infoText = '⚠️ รอดำเนินการแจ้งเรื่องจัดซื้อ';
      }
    }
  } else {
    // Non-PR status
    statusText = item.status === 'Pending' ? 'กำลังดำเนินการ' 
      : item.status === 'Purchasing' ? 'ติดต่อจัดซื้อ' 
      : 'สำเร็จ/ออก ITEM';
    statusColor = item.status === 'Pending' ? '#f59e0b'
      : item.status === 'Purchasing' ? '#8b5cf6'
      : '#10b981';
  }

  const bubble: any = {
    type: 'bubble',
    size: 'mega',
    body: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'box',
          layout: 'horizontal',
          contents: [
            {
              type: 'text',
              text: item.is_pr ? '🏷️ รายการ PR' : '📌 บันทึกทั่วไป',
              weight: 'bold',
              size: 'xs',
              color: item.is_pr ? '#8b5cf6' : '#64748b',
              flex: 1
            },
            {
              type: 'text',
              text: `#${shortId}`,
              weight: 'bold',
              size: 'xs',
              color: '#94a3b8',
              align: 'end',
              flex: 0
            }
          ]
        },
        {
          type: 'text',
          text: item.title,
          weight: 'bold',
          size: 'md',
          margin: 'md',
          wrap: true,
          color: '#1e293b'
        }
      ]
    }
  };

  // Add description if exists
  if (item.description) {
    bubble.body.contents.push({
      type: 'text',
      text: item.description,
      size: 'xs',
      color: '#64748b',
      margin: 'sm',
      wrap: true
    });
  }

  // Separator & Status Info
  bubble.body.contents.push(
    {
      type: 'separator',
      margin: 'md'
    },
    {
      type: 'box',
      layout: 'vertical',
      margin: 'md',
      spacing: 'sm',
      contents: [
        {
          type: 'box',
          layout: 'horizontal',
          contents: [
            {
              type: 'text',
              text: 'สถานะ:',
              size: 'xs',
              color: '#94a3b8',
              flex: 2
            },
            {
              type: 'text',
              text: statusText,
              size: 'xs',
              weight: 'bold',
              color: statusColor,
              flex: 8,
              wrap: true
            }
          ]
        }
      ]
    }
  );

  if (infoText) {
    bubble.body.contents[bubble.body.contents.length - 1].contents.push({
      type: 'box',
      layout: 'horizontal',
      contents: [
        {
          type: 'text',
          text: 'ข้อมูล:',
          size: 'xs',
          color: '#94a3b8',
          flex: 2
        },
        {
          type: 'text',
          text: infoText,
          size: 'xs',
          color: '#334155',
          flex: 8,
          wrap: true
        }
      ]
    });
  }

  // Add credit details if exists
  if (item.credit_term) {
    const formattedDate = item.budget_due_date ? new Date(item.budget_due_date).toLocaleDateString('th-TH', { dateStyle: 'short' }) : '-';
    bubble.body.contents[bubble.body.contents.length - 1].contents.push({
      type: 'box',
      layout: 'horizontal',
      contents: [
        {
          type: 'text',
          text: 'เครดิต:',
          size: 'xs',
          color: '#94a3b8',
          flex: 2
        },
        {
          type: 'text',
          text: `${item.credit_term} วัน (ครบกำหนด: ${formattedDate})`,
          size: 'xs',
          color: '#ef4444',
          weight: 'bold',
          flex: 8
        }
      ]
    });
  }

  // Footer Action buttons
  bubble.footer = {
    type: 'box',
    layout: 'vertical',
    spacing: 'sm',
    contents: []
  };

  // Action buttons depending on state
  const actions = [];
  
  // 1. "แจ้งสำเร็จ" button - always available if not finished yet
  if (item.status !== 'Issuing Item') {
    actions.push({
      type: 'button',
      style: 'primary',
      height: 'sm',
      color: '#10b981',
      action: {
        type: 'postback',
        label: '✅ สำเร็จ (ออก ITEM)',
        data: `action=complete&itemId=${item.id}`
      }
    });
  }

  // 2. "แจ้งส่งจัดซื้อแล้ว" button - if it's PR and item status is None (not requested yet)
  if (item.is_pr && !item.has_item_number && item.item_request_status === 'None') {
    actions.push({
      type: 'button',
      style: 'secondary',
      height: 'sm',
      action: {
        type: 'postback',
        label: '⏳ แจ้งจัดซื้อแอดไอเทม',
        data: `action=set_requested&itemId=${item.id}`
      }
    });
  }

  // 3. Link to web editor
  actions.push({
    type: 'button',
    style: 'link',
    height: 'sm',
    action: {
      type: 'uri',
      label: '🌐 เปิดแก้ในหน้าเว็บ',
      uri: editUrl
    }
  });

  bubble.footer.contents = actions;

  return bubble;
}


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

async function showLineLoadingAnimation(chatId: string) {
  const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!channelAccessToken) return;

  try {
    await fetch('https://api.line.me/v2/bot/chat/loading/start', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${channelAccessToken}`,
      },
      body: JSON.stringify({
        chatId,
        loadingSeconds: 5,
      }),
    });
  } catch (error) {
    console.error('Failed to start LINE loading animation:', error);
  }
}

async function markLineMessagesAsRead(markAsReadToken: string) {
  const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!channelAccessToken) return;

  try {
    const response = await fetch('https://api.line.me/v2/bot/chat/markAsRead', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${channelAccessToken}`,
      },
      body: JSON.stringify({
        markAsReadToken,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Error marking LINE messages as read:', errorData);
    }
  } catch (error) {
    console.error('Failed to mark LINE messages as read:', error);
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
      const replyToken = event.replyToken;
      const lineUserId = event.source.userId;
      const messageText = event.type === 'message' && event.message.type === 'text' ? event.message.text.trim() : '';
      const markAsReadToken = event.markAsReadToken;

      if (!replyToken || !lineUserId) continue;

      // Trigger LINE typing/loading animation immediately in the background
      showLineLoadingAnimation(lineUserId).catch(console.error);

      // Mark messages as read in the background
      if (markAsReadToken) {
        markLineMessagesAsRead(markAsReadToken).catch(console.error);
      }

      // A. Postback Event handling (stateless actions: complete or delete)
      if (event.type === 'postback') {
        try {
          const params = new URLSearchParams(event.postback.data);
          const action = params.get('action');
          const itemId = params.get('itemId');

          if (!itemId) continue;

          if (action === 'complete') {
            const { data: item, error: fetchError } = await supabaseAdmin
              .from('items')
              .select('title, po_date, credit_term')
              .eq('id', itemId)
              .single();

            if (fetchError || !item) {
              await sendLineReply(replyToken, '❌ ไม่พบรายการจัดซื้อนี้ หรืออาจถูกลบไปแล้ว');
              continue;
            }

            const finalPoDate = item.po_date || new Date().toISOString().substring(0, 10);
            const finalCreditTerm = item.credit_term || 30;
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
              .eq('id', itemId);

            if (completeError) {
              await sendLineReply(replyToken, '❌ เกิดข้อผิดพลาดในการบันทึกข้อมูลสำเร็จ');
            } else {
              const formattedDate = new Date(calculatedDueDate!).toLocaleDateString('th-TH', { dateStyle: 'medium' });
              await sendLineReply(
                replyToken, 
                `🎉 บันทึกสำเร็จแล้ว!\nอัปเดตรายการ "${item.title}" เป็น "สำเร็จ (ออก ITEM)" เรียบร้อยแล้ว\n📅 วันครบกำหนดชำระ: ${formattedDate}\n*รายการนี้จะย้ายจากบอร์ดไปแสดงที่หน้า 'รายการสำเร็จ' ทันที*`
              );
            }
          } else if (action === 'delete') {
            const { data: item, error: fetchError } = await supabaseAdmin
              .from('items')
              .select('title')
              .eq('id', itemId)
              .single();

            if (fetchError || !item) {
              await sendLineReply(replyToken, '❌ ไม่พบรายการจัดซื้อนี้ หรืออาจถูกลบไปแล้ว');
              continue;
            }

            const { error: deleteError } = await supabaseAdmin
              .from('items')
              .delete()
              .eq('id', itemId);

            if (deleteError) {
              await sendLineReply(replyToken, '❌ เกิดข้อผิดพลาดในการลบรายการจัดซื้อ');
            } else {
              await sendLineReply(replyToken, `🗑️ ลบรายการ "${item.title}" เรียบร้อยแล้วครับ!`);
            }
          }
        } catch (error) {
          console.error('Error handling postback:', error);
          await sendLineReply(replyToken, '❌ เกิดข้อผิดพลาดในการประมวลผลคำสั่ง');
        }
        continue;
      }

      if (event.type !== 'message' || event.message.type !== 'text') {
        continue;
      }

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

      // 3. (Stateful Check Removed - We now save immediately and use stateless postbacks)

      // 4. Initial Request intent classification using AI
      console.log(`[LINE BOT] Classifying user query: "${messageText}"`);
      const parsedResult = await classifyAndParseMessageWithAI(messageText, existingItems);

      switch (parsedResult.intent) {
        case 'SEARCH': {
          const query = parsedResult.search_query || '';
          
          const { data: searchResults, error: searchError } = await supabaseAdmin
            .from('items')
            .select('*')
            .eq('user_id', profile.id)
            .or(`title.ilike.%${query}%,description.ilike.%${query}%`)
            .order('updated_at', { ascending: false })
            .limit(10);

          if (searchError || !searchResults || searchResults.length === 0) {
            await sendLineReply(replyToken, `🔍 ไม่พบรายการบันทึกใดๆ ที่เกี่ยวข้องกับ "${query}"`);
          } else {
            const requestUrl = new URL(request.url);
            const appUrl = requestUrl.origin;
            
            const bubbles = searchResults.map(item => createItemFlexBubble(item, appUrl));
            const flexMessage = {
              type: 'flex',
              altText: `🔍 ผลการค้นหาสำหรับ "${query}"`,
              contents: {
                type: 'carousel',
                contents: bubbles
              }
            };
            await sendLineReply(replyToken, flexMessage);
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
              await sendLineReply(replyToken, '❌ เกิดข้อผิดพลาดในการลบรายการ');
            } else {
              await sendLineReply(replyToken, `🗑️ ลบรายการ "${itemToDelete?.title || 'รายการ'}" เรียบร้อยแล้วครับ!`);
            }
          } else {
            await sendLineReply(replyToken, '❌ ไม่พบรายการที่คุณต้องการลบ กรุณาระบุชื่อรหัสท้าย 3 ตัวของรายการให้ชัดเจนในข้อความครับ');
          }
          break;
        }

        case 'COMPLETE': {
          if (parsedResult.item_id) {
            const { data: itemToComplete } = await supabaseAdmin
              .from('items')
              .select('*')
              .eq('id', parsedResult.item_id)
              .single();

            if (!itemToComplete) {
              await sendLineReply(replyToken, '❌ ไม่พบรายการที่ระบุ');
              break;
            }

            const { data: completedItem, error: completeError } = await supabaseAdmin
              .from('items')
              .update({
                status: 'Issuing Item',
                updated_at: new Date().toISOString()
              })
              .eq('id', parsedResult.item_id)
              .select('*')
              .single();

            if (completeError || !completedItem) {
              await sendLineReply(replyToken, '❌ เกิดข้อผิดพลาดในการบันทึกสำเร็จ');
            } else {
              const requestUrl = new URL(request.url);
              const appUrl = requestUrl.origin;
              const bubble = createItemFlexBubble(completedItem, appUrl);
              await sendLineReply(replyToken, {
                type: 'flex',
                altText: `🎉 บันทึกความสำเร็จรายการ "${completedItem.title}" เรียบร้อยแล้ว`,
                contents: bubble
              });
            }
          } else {
            await sendLineReply(replyToken, '❌ ไม่พบรายการที่ต้องการตั้งค่าให้เสร็จสิ้น กรุณาระบุชื่อหรือรหัสท้าย 3 ตัวให้ชัดเจนขึ้นครับ');
          }
          break;
        }

        case 'UPDATE': {
          if (parsedResult.item_id && parsedResult.update_data) {
            const { data: itemToUpdate } = await supabaseAdmin
              .from('items')
              .select('*')
              .eq('id', parsedResult.item_id)
              .single();

            if (itemToUpdate) {
              const updates: any = { ...parsedResult.update_data };
              
              // Handle credit terms update if credit term provided
              if (updates.credit_term) {
                const finalPoDate = updates.po_date || itemToUpdate.po_date || new Date().toISOString().substring(0, 10);
                const finalCreditTerm = updates.credit_term;
                updates.po_date = finalPoDate;
                updates.budget_due_date = calculateDueDate(finalPoDate, finalCreditTerm);
              }
              updates.updated_at = new Date().toISOString();

              const { data: updatedItem, error: updateError } = await supabaseAdmin
                .from('items')
                .update(updates)
                .eq('id', parsedResult.item_id)
                .select('*')
                .single();

              if (updateError || !updatedItem) {
                await sendLineReply(replyToken, '❌ เกิดข้อผิดพลาดในการแก้ไขข้อมูลรายการ');
              } else {
                const requestUrl = new URL(request.url);
                const appUrl = requestUrl.origin;
                const bubble = createItemFlexBubble(updatedItem, appUrl);
                await sendLineReply(replyToken, {
                  type: 'flex',
                  altText: `✅ แก้ไขรายการ "&apos;${updatedItem.title}&apos;" สำเร็จแล้ว`,
                  contents: bubble
                });
              }
            } else {
              await sendLineReply(replyToken, '❌ ไม่พบรายการที่ระบุสำหรับการแก้ไข');
            }
          } else {
            await sendLineReply(replyToken, '❌ ไม่พบรายการจัดซื้อหรือข้อมูลที่ต้องการแก้ไข กรุณาระบุชื่อ/รหัสย่อและข้อมูลที่ต้องการแก้ไขครับ');
          }
          break;
        }

        case 'UNKNOWN': {
          const helpMessage = parsedResult.message || `💡 ยินดีต้อนรับสู่ จำจด (JumJod) แชตบอต!\n\nคุณสามารถแชตสั่งบันทึกหรือจัดการได้ง่ายๆ ดังนี้:\n\n➕ **จดบันทึกใหม่:** พิมพ์ได้เลย เช่น "ซื้อหมึกพิมพ์ 5 กล่อง เครดิต 30 วัน"\n🔍 **ค้นหา/ดูรายการ:** พิมพ์คำว่า "ค้นหา" หรือรหัสท้าย 3 ตัว เช่น "ค้นหา หมึก" หรือพิมพ์ "#7fa"\n⏳ **แจ้งเรื่องส่งจัดซื้อ:** พิมพ์ "แจ้งจัดซื้อ [รหัสท้าย 3 ตัว]" เช่น "แจ้งจัดซื้อ 7fa"\n🎉 **แจ้งเสร็จสิ้น:** พิมพ์ "สำเร็จ [รหัสท้าย 3 ตัว]" เช่น "สำเร็จ 7fa"\n🗑️ **ลบรายการ:** พิมพ์ "ลบ [รหัสท้าย 3 ตัว]" เช่น "ลบ 7fa"`;
          await sendLineReply(replyToken, helpMessage);
          break;
        }

        case 'CREATE':
        default: {
          const createData = parsedResult.create_data;
          if (!createData) {
            await sendLineReply(replyToken, '❌ ไม่เข้าใจคำสั่งซื้อ กรุณาลองพิมพ์ข้อความใหม่อีกครั้ง');
            continue;
          }

          // Determine initial status based on credit_term
          const status = createData.credit_term ? 'Purchasing' : 'Pending';
          const isPr = messageText.toLowerCase().includes('pr') || messageText.toLowerCase().includes('ax') || messageText.toLowerCase().includes('ซื้อ');

          // Insert directly into items table
          const { data: insertedItem, error: insertError } = await supabaseAdmin
            .from('items')
            .insert([
              {
                user_id: profile.id,
                title: createData.title,
                description: createData.description || `บันทึกผ่าน LINE Bot: ${messageText}`,
                status,
                reminder_date: createData.reminder_date,
                po_date: createData.po_date,
                credit_term: createData.credit_term,
                budget_due_date: createData.budget_due_date,
                is_pr: isPr
              },
            ])
            .select('*')
            .single();

          if (insertError || !insertedItem) {
            console.error('Error inserting item from LINE:', insertError);
            await sendLineReply(replyToken, '❌ เกิดข้อผิดพลาดในการบันทึกข้อมูล กรุณาลองใหม่อีกครั้ง');
            continue;
          }

          const requestUrl = new URL(request.url);
          const appUrl = requestUrl.origin;
          
          const bubble = createItemFlexBubble(insertedItem, appUrl);
          const flexMessage = {
            type: 'flex',
            altText: `✅ บันทึกรายการ "${insertedItem.title}" สำเร็จ`,
            contents: bubble
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
