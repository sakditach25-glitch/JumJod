import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function sendLinePush(to: string, content: any) {
  const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!channelAccessToken) {
    console.error('Missing LINE_CHANNEL_ACCESS_TOKEN');
    return false;
  }

  const messages = Array.isArray(content)
    ? content.map(c => typeof c === 'string' ? { type: 'text', text: c } : c)
    : [typeof content === 'string' ? { type: 'text', text: content } : content];

  try {
    const response = await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${channelAccessToken}`,
      },
      body: JSON.stringify({
        to,
        messages,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Error sending LINE push:', errorData);
      return false;
    }
    return true;
  } catch (error) {
    console.error('Fetch error sending LINE push:', error);
    return false;
  }
}

export async function GET(request: Request) {
  try {
    const now = new Date().toISOString();
    const requestUrl = new URL(request.url);
    const appUrl = requestUrl.origin;
    let sentCount = 0;

    // ==========================================
    // 1. Handle normal user reminders (reminder_date)
    // ==========================================
    const { data: items, error } = await supabaseAdmin
      .from('items')
      .select('*')
      .lte('reminder_date', now)
      .eq('reminder_sent', false);

    if (error) {
      console.error('Error fetching items for reminders:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (items && items.length > 0) {
      console.log(`[CRON REMINDERS] Found ${items.length} normal reminders to process.`);
      for (const item of items) {
        const { data: profile, error: profileError } = await supabaseAdmin
          .from('profiles')
          .select('line_user_id')
          .eq('id', item.user_id)
          .single();

        if (profileError || !profile || !profile.line_user_id) {
          await supabaseAdmin
            .from('items')
            .update({ reminder_sent: true })
            .eq('id', item.id);
          continue;
        }

        const { createItemFlexBubble } = await import('../../line-webhook/route');
        const bubble = createItemFlexBubble(item, appUrl);
        
        const pushSuccess = await sendLinePush(profile.line_user_id, [
          `⏰ **แจ้งเตือนความจำจัดซื้อ!**\nถึงเวลาดำเนินการหรือแจ้งเตือนวันกำหนดของรายการ: "${item.title}" แล้วครับ`,
          {
            type: 'flex',
            altText: `⏰ แจ้งเตือน: ${item.title}`,
            contents: bubble
          }
        ]);

        if (pushSuccess) {
          await supabaseAdmin
            .from('items')
            .update({ reminder_sent: true })
            .eq('id', item.id);
          sentCount++;
        }
      }
    }

    // ==========================================
    // 2. Handle budget due date alerts (lacking Completed status)
    // ==========================================
    const threeDaysLater = new Date();
    threeDaysLater.setDate(threeDaysLater.getDate() + 3);
    const threeDaysStr = threeDaysLater.toISOString().substring(0, 10);

    const { data: dueItems, error: dueError } = await supabaseAdmin
      .from('items')
      .select('*')
      .neq('status', 'Issuing Item') // Not completed yet
      .lte('budget_due_date', threeDaysStr)
      .eq('due_reminder_sent', false);

    if (dueError) {
      console.error('Error fetching items for budget due reminders:', dueError);
    } else if (dueItems && dueItems.length > 0) {
      console.log(`[CRON REMINDERS] Found ${dueItems.length} budget due date alerts to process.`);
      for (const item of dueItems) {
        const { data: profile, error: profileError } = await supabaseAdmin
          .from('profiles')
          .select('line_user_id')
          .eq('id', item.user_id)
          .single();

        if (profileError || !profile || !profile.line_user_id) {
          await supabaseAdmin
            .from('items')
            .update({ due_reminder_sent: true })
            .eq('id', item.id);
          continue;
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const dueDate = new Date(item.budget_due_date!);
        dueDate.setHours(0, 0, 0, 0);

        const diffTime = dueDate.getTime() - today.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        let dayText = `ในอีก ${diffDays} วัน`;
        if (diffDays === 0) dayText = 'วันนี้';
        if (diffDays < 0) dayText = `ที่ผ่านมาแล้ว (เกินกำหนดชำระ ${Math.abs(diffDays)} วัน)`;

        const pushSuccess = await sendLinePush(profile.line_user_id, [
          `🚨 **แจ้งเตือนใบจัดซื้อใกล้ครบกำหนดเครดิตเทอมชำระเงิน!**\n\n📄 รายการ: "${item.title}"\n📅 วันที่ครบกำหนด: ${item.budget_due_date} (${dayText})\n💵 เครดิตเทอม: ${item.credit_term} วัน\n⚠️ สถานะปัจจุบัน: ${item.status}\n\nกรุณาเร่งรัดการจ่ายเงินหรือตรวจเช็กเอกสารจัดซื้อด้วยครับ`
        ]);

        if (pushSuccess) {
          await supabaseAdmin
            .from('items')
            .update({ due_reminder_sent: true })
            .eq('id', item.id);
          sentCount++;
        }
      }
    }

    return NextResponse.json({ message: `Successfully processed ${sentCount} reminders.` });
  } catch (err: any) {
    console.error('Unexpected error in cron reminders:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
