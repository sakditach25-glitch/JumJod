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
export function createItemFlexBubble(item: any, appUrl: string) {
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
      : item.status === 'Purchasing' ? 'ติดต่อที่จัดซื้อ' 
      : 'สำเร็จ (ออก ITEM)';
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

  // Add reminder details if exists
  if (item.reminder_date) {
    const dateObj = new Date(item.reminder_date);
    const dateStr = dateObj.toLocaleDateString('th-TH', { dateStyle: 'short' });
    const timeStr = dateObj.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
    bubble.body.contents[bubble.body.contents.length - 1].contents.push({
      type: 'box',
      layout: 'horizontal',
      contents: [
        {
          type: 'text',
          text: 'แจ้งเตือน:',
          size: 'xs',
          color: '#94a3b8',
          flex: 2
        },
        {
          type: 'text',
          text: `🔔 ${dateStr} (เวลา ${timeStr} น.)`,
          size: 'xs',
          color: '#8b5cf6',
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
        label: '✅ สำเร็จ',
        data: `action=complete&itemId=${item.id}`
      }
    });
  }

  // 3. Edit button in LINE
  actions.push({
    type: 'button',
    style: 'secondary',
    height: 'sm',
    action: {
      type: 'postback',
      label: '✍️ แก้ไขรายการ',
      data: `action=request_edit&itemId=${item.id}`
    }
  });

  bubble.footer.contents = actions;

  return bubble;
}

/**
 * Creates a beautiful LINE Flex Message Bubble for stock selection.
 */
export function createStockListFlex(stocks: any[], op: string, qty: number | null, searchName: string) {
  const opLabel = op === 'SUBTRACT' ? 'เบิกออก' : op === 'ADD' ? 'เพิ่มสต็อก' : op === 'SET' ? 'ปรับยอด' : 'เช็กยอด';
  
  const contents = stocks.slice(0, 8).map(stock => {
    const postbackData = `action=stock_execute&id=${stock.id}&op=${op}&qty=${qty || ''}`;
    const isAlert = stock.quantity <= (stock.min_threshold ?? 0);
    const displayName = isAlert ? `⚠️ ${stock.name} (ใกล้หมด)` : stock.name;
    const nameColor = isAlert ? '#ef4444' : '#1e293b';
    const priorityLabel = stock.priority === 'High' ? '🔴 ด่วนมาก' : stock.priority === 'Medium' ? '🟡 ปานกลาง' : '🟢 ทั่วไป';
    
    return {
      type: 'box',
      layout: 'vertical',
      spacing: 'sm',
      margin: 'md',
      contents: [
        {
          type: 'box',
          layout: 'horizontal',
          contents: [
            {
              type: 'text',
              text: displayName,
              weight: 'bold',
              size: 'sm',
              color: nameColor,
              flex: 7,
              wrap: true
            },
            {
              type: 'text',
              text: `${stock.quantity} ${stock.unit}`,
              weight: 'bold',
              size: 'sm',
              color: isAlert ? '#ef4444' : '#10b981',
              align: 'end',
              flex: 3
            }
          ]
        },
        {
          type: 'text',
          text: `หมวดหมู่: ${stock.category} • ความสำคัญ: ${priorityLabel}`,
          size: 'xs',
          color: '#94a3b8'
        },
        {
          type: 'button',
          style: 'primary',
          color: op === 'SUBTRACT' ? '#ef4444' : '#8b5cf6',
          height: 'sm',
          action: {
            type: 'postback',
            label: `${opLabel} รายการนี้`,
            data: postbackData
          }
        },
        {
          type: 'separator',
          margin: 'sm'
        }
      ]
    };
  });

  // Append option to create as new item
  const createNewPostback = `action=stock_create_prompt&name=${searchName}&qty=${qty || ''}`;
  contents.push({
    type: 'box',
    layout: 'vertical',
    spacing: 'sm',
    margin: 'lg',
    contents: [
      {
        type: 'button',
        style: 'secondary',
        color: '#64748b',
        height: 'sm',
        action: {
          type: 'postback',
          label: `➕ เพิ่มเป็นวัสดุใหม่: "${searchName}"`,
          data: createNewPostback
        }
      }
    ]
  });

  return {
    type: 'bubble',
    size: 'mega',
    header: {
      type: 'box',
      layout: 'vertical',
      backgroundColor: '#f8fafc',
      contents: [
        {
          type: 'text',
          text: `📦 ค้นพบวัสดุในสต็อกสำหรับ: "${searchName}"`,
          weight: 'bold',
          size: 'sm',
          color: '#475569'
        },
        {
          type: 'text',
          text: `โปรดกดเลือกรายการคลังด้านล่างเพื่อต้องการ ${opLabel}`,
          size: 'xs',
          color: '#94a3b8',
          margin: 'xs'
        }
      ]
    },
    body: {
      type: 'box',
      layout: 'vertical',
      contents: contents
    }
  };
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

  const messages = Array.isArray(content)
    ? content.map(c => typeof c === 'string' ? { type: 'text', text: c } : c)
    : [typeof content === 'string' ? { type: 'text', text: content } : content];

  try {
    const response = await fetch('https://api.line.me/v2/bot/message/reply', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${channelAccessToken}`,
      },
      body: JSON.stringify({
        replyToken,
        messages,
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

          if (action === 'complete') {
            if (!itemId) continue;
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
          } else if (action === 'set_requested') {
            if (!itemId) continue;
            const { data: item, error: fetchError } = await supabaseAdmin
              .from('items')
              .select('title')
              .eq('id', itemId)
              .single();

            if (fetchError || !item) {
              await sendLineReply(replyToken, '❌ ไม่พบรายการจัดซื้อนี้ หรืออาจถูกลบไปแล้ว');
              continue;
            }

            const { error: updateError } = await supabaseAdmin
              .from('items')
              .update({
                item_request_status: 'Pending',
                status: 'Purchasing',
                updated_at: new Date().toISOString()
              })
              .eq('id', itemId);

            if (updateError) {
              await sendLineReply(replyToken, '❌ เกิดข้อผิดพลาดในการบันทึกข้อมูลแจ้งจัดซื้อ');
            } else {
              await sendLineReply(
                replyToken, 
                `⏳ แจ้งจัดซื้อแอดไอเทมเรียบร้อย!\nอัปเดตรายการ "${item.title}" เป็น "รอจัดซื้อแอด Item ใน AX" และย้ายไปคอลัมน์ "ติดต่อที่จัดซื้อ" บนบอร์ดแล้วครับ`
              );
            }
          } else if (action === 'delete') {
            if (!itemId) continue;
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
          } else if (action === 'request_edit') {
            if (!itemId) continue;
            const { data: item, error: fetchError } = await supabaseAdmin
              .from('items')
              .select('title')
              .eq('id', itemId)
              .single();

            if (fetchError || !item) {
              await sendLineReply(replyToken, '❌ ไม่พบรายการจัดซื้อนี้ หรืออาจถูกลบไปแล้ว');
              continue;
            }

            memoryStateCache.set(lineUserId, { action: 'editing', itemId: itemId, itemTitle: item.title });

            await sendLineReply(
              replyToken,
              `✍️ เตรียมแก้ไขรายการ: "${item.title}"\n\nกรุณาพิมพ์รายละเอียดใหม่ที่คุณต้องการแก้ไขเข้ามาได้เลยครับ เช่น:\n- "เครดิต 60 วัน"\n- "แก้ชื่อเป็น คอมพิวเตอร์ i7"\n- "แก้คำอธิบายเป็น ซื้อมาใช้ในออฟฟิศ"\n(บอทจะอัปเดตข้อมูลรายการนี้โดยตรง)`
            );
          } else if (action === 'view_items') {
            const statusParam = params.get('status');
            
            const { data: userProfile, error: profileErr } = await supabaseAdmin
              .from('profiles')
              .select('id')
              .eq('line_user_id', lineUserId)
              .single();

            if (profileErr || !userProfile) {
              await sendLineReply(replyToken, '❌ ไม่พบบัญชีผู้ใช้งานที่เชื่อมต่อกับไลน์นี้');
              continue;
            }

            let query = supabaseAdmin
              .from('items')
              .select('*')
              .eq('user_id', userProfile.id);

            if (statusParam === 'completed') {
              query = query.eq('status', 'Issuing Item');
            } else {
              query = query.neq('status', 'Issuing Item');
            }

            const { data: itemsList, error: listErr } = await query
              .order('updated_at', { ascending: false })
              .limit(10);

            if (listErr || !itemsList || itemsList.length === 0) {
              const statusName = statusParam === 'completed' ? 'ที่สำเร็จแล้ว' : 'ที่ยังไม่สำเร็จ';
              await sendLineReply(replyToken, `📋 ไม่พบรายการ${statusName}ในขณะนี้`);
              continue;
            }

            const requestUrl = new URL(request.url);
            const appUrl = requestUrl.origin;
            
            const bubbles = itemsList.map(item => createItemFlexBubble(item, appUrl));
            const flexMessage = {
              type: 'flex',
              altText: `📋 รายการจัดซื้อ`,
              contents: {
                type: 'carousel',
                contents: bubbles.slice(0, 10) // Carousel limit is 10 bubbles
              }
            };
            await sendLineReply(replyToken, flexMessage);
          } else if (action === 'stock_execute') {
            const id = params.get('id')!;
            const op = params.get('op')!;
            const qtyStr = params.get('qty');
            const qty = qtyStr ? parseInt(qtyStr) : null;

            const { data: stockItem, error: fetchError } = await supabaseAdmin
              .from('stocks')
              .select('*')
              .eq('id', id)
              .single();

            if (fetchError || !stockItem) {
              await sendLineReply(replyToken, '❌ ไม่พบวัสดุชิ้นนี้ในสต็อกแล้ว');
              continue;
            }

            if (qty !== null && !isNaN(qty)) {
              let newQty = stockItem.quantity;
              if (op === 'SUBTRACT') {
                newQty = Math.max(0, stockItem.quantity - qty);
              } else if (op === 'ADD') {
                newQty = stockItem.quantity + qty;
              } else if (op === 'SET') {
                newQty = qty;
              }

              const { error: updateError } = await supabaseAdmin
                .from('stocks')
                .update({ quantity: newQty, updated_at: new Date().toISOString() })
                .eq('id', id);

              if (updateError) {
                await sendLineReply(replyToken, '❌ เกิดข้อผิดพลาดในการปรับยอดสต็อก');
              } else {
                const opText = op === 'SUBTRACT' ? 'เบิกออก' : op === 'ADD' ? 'เติมสต็อก' : 'ปรับยอด';
                await sendLineReply(replyToken, `✅ ทำการ${opText}วัสดุ "${stockItem.name}" เรียบร้อยแล้วครับ!\n\nยอดเดิม: ${stockItem.quantity} ${stockItem.unit}\nทำรายการ: ${qty} ${stockItem.unit}\nยอดคงเหลือใหม่: ${newQty} ${stockItem.unit} 📦`);
              }
            } else {
              memoryStateCache.set(lineUserId, {
                action: 'stock_pending_qty',
                stockId: id,
                operation: op,
                stockName: stockItem.name,
                stockUnit: stockItem.unit
              });
              const opText = op === 'SUBTRACT' ? 'เบิก' : op === 'ADD' ? 'เติม' : 'ปรับยอด';
              await sendLineReply(replyToken, `📦 ต้องการ${opText}วัสดุ "${stockItem.name}" จำนวนเท่าไหร่ดีครับ?\n\n(กรุณาพิมพ์จำนวนเป็นตัวเลข เช่น "5" หรือ "10")`);
            }
          } else if (action === 'stock_create_prompt') {
            const name = params.get('name')!;
            const qtyStr = params.get('qty');
            const qty = qtyStr ? parseInt(qtyStr) : null;

            if (qty !== null && !isNaN(qty)) {
              const { data: userProfile, error: profileErr } = await supabaseAdmin
                .from('profiles')
                .select('id')
                .eq('line_user_id', lineUserId)
                .single();

              if (profileErr || !userProfile) {
                await sendLineReply(replyToken, '❌ ไม่พบบัญชีผู้ใช้งานที่เชื่อมต่อกับไลน์นี้');
                continue;
              }

              const category = name.includes('lab') || name.includes('แล็บ') || name.includes('สารเคมี') ? 'Laboratory' : 'อุปกรณ์สำนักงาน';
              const { data: newItem, error: createError } = await supabaseAdmin
                .from('stocks')
                .insert([{
                  user_id: userProfile.id,
                  name: name,
                  quantity: qty,
                  unit: 'ชิ้น',
                  category: category
                }])
                .select('*')
                .single();

              if (createError || !newItem) {
                await sendLineReply(replyToken, '❌ เกิดข้อผิดพลาดในการสร้างวัสดุใหม่');
              } else {
                await sendLineReply(replyToken, `✅ เพิ่มวัสดุใหม่ "${newItem.name}" จำนวน ${newItem.quantity} ${newItem.unit} เข้าคลังสำเร็จแล้วครับ! 📦`);
              }
            } else {
              memoryStateCache.set(lineUserId, {
                action: 'stock_pending_create_qty',
                stockName: name
              });
              await sendLineReply(replyToken, `📦 ต้องการสร้างวัสดุใหม่ "${name}"\nมีจำนวนเริ่มต้นเท่าไหร่ดีครับ?\n\n(กรุณาพิมพ์ตัวเลข เช่น "10")`);
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

      // 3. Stateful edit mode check & "รายการ" command interception
      if (messageText.trim() === 'รายการ' || messageText.trim() === 'ดูรายการ') {
        const listMenuFlex = {
          type: 'flex',
          altText: '📋 เมนูเลือกดูรายการ',
          contents: {
            type: 'bubble',
            size: 'mega',
            header: {
              type: 'box',
              layout: 'vertical',
              backgroundColor: '#8b5cf6',
              contents: [
                {
                  type: 'text',
                  text: '📋 เมนูเลือกดูรายการ',
                  weight: 'bold',
                  color: '#ffffff',
                  size: 'sm'
                }
              ]
            },
            body: {
              type: 'box',
              layout: 'vertical',
              spacing: 'md',
              contents: [
                {
                  type: 'text',
                  text: 'กรุณาเลือกรายการที่คุณต้องการตรวจสอบ:',
                  size: 'xs',
                  color: '#64748b',
                  wrap: true
                },
                {
                  type: 'button',
                  style: 'primary',
                  color: '#8b5cf6',
                  height: 'sm',
                  action: {
                    type: 'postback',
                    label: '⏳ รายการที่ยังไม่สำเร็จ',
                    data: 'action=view_items&status=active'
                  }
                },
                {
                  type: 'button',
                  style: 'secondary',
                  height: 'sm',
                  action: {
                    type: 'postback',
                    label: '✅ รายการที่สำเร็จแล้ว',
                    data: 'action=view_items&status=completed'
                  }
                }
              ]
            }
          }
        };

        await sendLineReply(replyToken, listMenuFlex);
        continue;
      }

      const userState = memoryStateCache.get(lineUserId);
      
      // Handle stock pending quantity input
      if (userState && userState.action === 'stock_pending_qty') {
        const qtyMatch = messageText.match(/\b(\d+)\b/);
        if (qtyMatch) {
          const qty = parseInt(qtyMatch[1]);
          const { data: stockItem } = await supabaseAdmin
            .from('stocks')
            .select('*')
            .eq('id', userState.stockId)
            .single();

          if (!stockItem) {
            await sendLineReply(replyToken, '❌ ไม่พบวัสดุชิ้นนี้ในสต็อกแล้ว');
            memoryStateCache.delete(lineUserId);
            continue;
          }

          let newQty = stockItem.quantity;
          if (userState.operation === 'SUBTRACT') {
            newQty = Math.max(0, stockItem.quantity - qty);
          } else if (userState.operation === 'ADD') {
            newQty = stockItem.quantity + qty;
          } else if (userState.operation === 'SET') {
            newQty = qty;
          }

          const { error: updateError } = await supabaseAdmin
            .from('stocks')
            .update({ quantity: newQty, updated_at: new Date().toISOString() })
            .eq('id', userState.stockId);

          memoryStateCache.delete(lineUserId);

          if (updateError) {
            await sendLineReply(replyToken, '❌ เกิดข้อผิดพลาดในการปรับยอดสต็อก');
          } else {
            const opText = userState.operation === 'SUBTRACT' ? 'เบิกออก' : userState.operation === 'ADD' ? 'เติมสต็อก' : 'ปรับยอด';
            await sendLineReply(replyToken, `✅ ทำการ${opText}วัสดุ "${stockItem.name}" เรียบร้อยแล้วครับ!\n\nยอดเดิม: ${stockItem.quantity} ${stockItem.unit}\nทำรายการ: ${qty} ${stockItem.unit}\nยอดคงเหลือใหม่: ${newQty} ${stockItem.unit} 📦`);
          }
        } else {
          await sendLineReply(replyToken, '❌ กรุณาระบุจำนวนเป็นตัวเลขอีกครั้งครับ เช่น "5" หรือ "10"');
        }
        continue;
      }

      // Handle stock pending create quantity input
      if (userState && userState.action === 'stock_pending_create_qty') {
        const qtyMatch = messageText.match(/\b(\d+)\b/);
        if (qtyMatch) {
          const qty = parseInt(qtyMatch[1]);
          const category = userState.stockName.includes('lab') || userState.stockName.includes('แล็บ') || userState.stockName.includes('สารเคมี') ? 'Laboratory' : 'อุปกรณ์สำนักงาน';
          
          const { data: newItem, error: createError } = await supabaseAdmin
            .from('stocks')
            .insert([{
              user_id: profile.id,
              name: userState.stockName,
              quantity: qty,
              unit: 'ชิ้น',
              category: category
            }])
            .select('*')
            .single();

          memoryStateCache.delete(lineUserId);

          if (createError || !newItem) {
            await sendLineReply(replyToken, '❌ เกิดข้อผิดพลาดในการสร้างวัสดุใหม่');
          } else {
            await sendLineReply(replyToken, `✅ เพิ่มวัสดุใหม่ "${newItem.name}" จำนวน ${newItem.quantity} ${newItem.unit} เข้าคลังสำเร็จแล้วครับ! 📦`);
          }
        } else {
          await sendLineReply(replyToken, '❌ กรุณาระบุจำนวนเริ่มต้นเป็นตัวเลขอีกครั้งครับ เช่น "10"');
        }
        continue;
      }

      if (userState && userState.action === 'editing') {
        let updateTitle = messageText;
        let credit_term: any = null;

        const creditMatch = messageText.match(/(?:เครดิต|credit|cr)\s*(30|60|90)\s*(?:วัน|days)?/i);
        if (creditMatch) {
          credit_term = Number(creditMatch[1]);
          updateTitle = messageText.replace(/(?:เครดิต|credit|cr)\s*(30|60|90)\s*(?:วัน|days)?/i, '').trim();
        }

        updateTitle = updateTitle.replace(/^(แก้ไข|แก้|เปลี่ยน|edit|update|ชื่อ|เป็น)\s*/i, '').trim();

        const updates: any = { updated_at: new Date().toISOString() };
        if (updateTitle) {
          updates.title = updateTitle;
        }
        if (credit_term) {
          const poDate = new Date().toISOString().substring(0, 10);
          updates.po_date = poDate;
          updates.credit_term = credit_term;
          updates.budget_due_date = calculateDueDate(poDate, credit_term);
        }

        const dateMatch = messageText.match(/\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})\b/);
        if (dateMatch) {
          const day = parseInt(dateMatch[1]);
          const month = parseInt(dateMatch[2]) - 1;
          let year = parseInt(dateMatch[3]);
          if (year < 100) year += 2000;
          else if (year > 2500) year -= 543;
          
          const remDate = new Date(year, month, day, 9, 0, 0);
          if (!isNaN(remDate.getTime())) {
            updates.reminder_date = remDate.toISOString();
            if (updates.title) {
              updates.title = updates.title.replace(/\b\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b/g, '').trim();
              updates.title = updates.title.replace(/(?:แจ้งเตือน|เตือน|วันจันทร์ที่|วันอังคารที่|วันพุธที่|วันพฤหัสบดีที่|วันศุกร์ที่|วันเสาร์ที่|วันอาทิตย์ที่|วันที่|วัน)\s*$/i, '').trim();
            }
          }
        }

        const { data: updatedItem, error: updateError } = await supabaseAdmin
          .from('items')
          .update(updates)
          .eq('id', userState.itemId)
          .select('*')
          .single();

        memoryStateCache.delete(lineUserId);

        if (updateError || !updatedItem) {
          await sendLineReply(replyToken, '❌ เกิดข้อผิดพลาดในการแก้ไขข้อมูลรายการ');
        } else {
          const requestUrl = new URL(request.url);
          const appUrl = requestUrl.origin;
          const bubble = createItemFlexBubble(updatedItem, appUrl);
          await sendLineReply(replyToken, [
            `✅ แก้ไขข้อมูลรายการ "${userState.itemTitle}" เรียบร้อยแล้วครับ!`,
            {
              type: 'flex',
              altText: `📄 รายการที่แก้ไขแล้ว`,
              contents: bubble
            }
          ]);
        }
        continue;
      }

      // 4. Initial Request intent classification using AI
      console.log(`[LINE BOT] Classifying user query: "${messageText}"`);
      const parsedResult = await classifyAndParseMessageWithAI(messageText, existingItems);

      switch (parsedResult.intent) {
        case 'STOCK': {
          const stockData = parsedResult.stock_data;
          if (!stockData) {
            await sendLineReply(replyToken, '❌ เกิดข้อผิดพลาดในการตีความข้อมูลสต็อก');
            continue;
          }

          const searchName = stockData.name || '';
          
          const { data: matchedStocks, error: searchError } = await supabaseAdmin
            .from('stocks')
            .select('*')
            .eq('user_id', profile.id)
            .ilike('name', `%${searchName}%`);

          if (searchError) {
            await sendLineReply(replyToken, '❌ เกิดข้อผิดพลาดในการค้นหาคลังวัสดุ');
            continue;
          }

          // Case 1: No match found
          if (!matchedStocks || matchedStocks.length === 0) {
            if (stockData.action === 'ADD' && stockData.quantity !== null) {
              // Create immediately
              const category = searchName.includes('lab') || searchName.includes('แล็บ') || searchName.includes('สารเคมี') ? 'Laboratory' : 'อุปกรณ์สำนักงาน';
              const { data: newItem, error: createError } = await supabaseAdmin
                .from('stocks')
                .insert([{
                  user_id: profile.id,
                  name: searchName,
                  quantity: stockData.quantity,
                  unit: stockData.unit || 'ชิ้น',
                  category: category,
                  priority: stockData.priority || 'Medium',
                  min_threshold: stockData.min_threshold || 0
                }])
                .select('*')
                .single();

              if (createError || !newItem) {
                await sendLineReply(replyToken, '❌ เกิดข้อผิดพลาดในการสร้างวัสดุใหม่');
              } else {
                await sendLineReply(replyToken, `✅ ไม่พบวัสดุในคลัง จึงทำการสร้างวัสดุใหม่:\n📦 "${newItem.name}" จำนวนเริ่มต้น ${newItem.quantity} ${newItem.unit} สำเร็จแล้วครับ!`);
              }
            } else {
              const createNewPostback = `action=stock_create_prompt&name=${searchName}&qty=${stockData.quantity || ''}`;
              
              const notFoundFlex = {
                type: 'bubble',
                body: {
                  type: 'box',
                  layout: 'vertical',
                  spacing: 'md',
                  contents: [
                    {
                      type: 'text',
                      text: `🔎 ไม่พบวัสดุชื่อ "${searchName}" ในคลัง`,
                      weight: 'bold',
                      size: 'md',
                      color: '#1e293b'
                    },
                    {
                      type: 'text',
                      text: 'คุณต้องการบันทึกแอดวัสดุชิ้นนี้เข้าไปในระบบสต็อกใหม่เลยไหมครับ?',
                      size: 'xs',
                      color: '#64748b',
                      wrap: true
                    },
                    {
                      type: 'button',
                      style: 'primary',
                      color: '#8b5cf6',
                      height: 'sm',
                      action: {
                        type: 'postback',
                        label: '➕ สร้างวัสดุใหม่ในคลัง',
                        data: createNewPostback
                      }
                    }
                  ]
                }
              };

              await sendLineReply(replyToken, {
                type: 'flex',
                altText: `⚠️ ไม่พบวัสดุ "${searchName}" ในคลัง`,
                contents: notFoundFlex
              });
            }
            continue;
          }

          // Case 2: Exact name match found (or exactly 1 match) and quantity is provided
          const exactMatch = matchedStocks.find(s => s.name.toLowerCase() === searchName.toLowerCase());
          const targetStock = exactMatch || (matchedStocks.length === 1 ? matchedStocks[0] : null);

          if (targetStock && stockData.quantity !== null) {
            let newQty = targetStock.quantity;
            if (stockData.action === 'SUBTRACT') {
              newQty = Math.max(0, targetStock.quantity - stockData.quantity);
            } else if (stockData.action === 'ADD') {
              newQty = targetStock.quantity + stockData.quantity;
            } else if (stockData.action === 'SET') {
              newQty = stockData.quantity;
            }

            const { error: updateError } = await supabaseAdmin
              .from('stocks')
              .update({ quantity: newQty, updated_at: new Date().toISOString() })
              .eq('id', targetStock.id);

            if (updateError) {
              await sendLineReply(replyToken, '❌ เกิดข้อผิดพลาดในการปรับยอดสต็อก');
            } else {
              const opText = stockData.action === 'SUBTRACT' ? 'เบิกออก' : stockData.action === 'ADD' ? 'เติมสต็อก' : 'ปรับยอด';
              await sendLineReply(replyToken, `✅ ทำการ${opText}วัสดุ "${targetStock.name}" เรียบร้อยแล้วครับ!\n\nยอดเดิม: ${targetStock.quantity} ${targetStock.unit}\nทำรายการ: ${stockData.quantity} ${targetStock.unit}\nยอดคงเหลือใหม่: ${newQty} ${targetStock.unit} 📦`);
            }
            continue;
          }

          // Case 3: Multiple matches or quantity is missing
          const sortedStocks = matchedStocks.sort((a, b) => a.name.localeCompare(b.name));
          const flexBubble = createStockListFlex(sortedStocks, stockData.action, stockData.quantity, searchName);
          
          await sendLineReply(replyToken, {
            type: 'flex',
            altText: `📦 รายการคลังที่ใกล้เคียงกับ "${searchName}"`,
            contents: flexBubble
          });
          break;
        }

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
