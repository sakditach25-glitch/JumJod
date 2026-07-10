import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

async function sendLinePush(to: string, messages: any[]) {
  const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!channelAccessToken) {
    console.error('Missing LINE_CHANNEL_ACCESS_TOKEN');
    return false;
  }

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
      console.error('Error sending LINE push alert:', errorData);
      return false;
    }
    return true;
  } catch (error) {
    console.error('Fetch error sending LINE push alert:', error);
    return false;
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    
    // Authenticate the user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id, newQuantity } = await request.json();
    if (!id || newQuantity === undefined || isNaN(newQuantity)) {
      return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
    }

    // 1. Fetch current stock item
    const { data: stock, error: fetchError } = await supabase
      .from('stocks')
      .select('name, quantity, min_threshold, unit, user_id')
      .eq('id', id)
      .single();

    if (fetchError || !stock) {
      return NextResponse.json({ error: 'Stock item not found' }, { status: 404 });
    }

    // 2. Determine if it crosses threshold (from above threshold to below/equal)
    const isAlertTriggered = newQuantity <= stock.min_threshold && stock.quantity > stock.min_threshold;

    // 3. Update the stock quantity
    const { error: updateError } = await supabase
      .from('stocks')
      .update({ quantity: Math.max(0, newQuantity), updated_at: new Date().toISOString() })
      .eq('id', id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    // 4. Send push alert if threshold is crossed
    if (isAlertTriggered) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('line_user_id')
        .eq('id', user.id)
        .single();

      if (profile?.line_user_id) {
        console.log(`[STOCK ALERT] Sending push notification to user ${user.id} for "${stock.name}"`);
        
        await sendLinePush(profile.line_user_id, [
          {
            type: 'text',
            text: `⚠️ **แจ้งเตือนวัสดุใกล้หมดคลัง!**\n\n📦 วัสดุ: "${stock.name}"\nคงเหลือ: ${newQuantity} ${stock.unit}\n(เกณฑ์ขั้นต่ำที่กำหนดไว้: ${stock.min_threshold} ${stock.unit})\n\nกรุณาเติมวัสดุหรือวางแผนสั่งซื้อเพิ่มเติมด้วยครับ`
          }
        ]);
      }
    }

    return NextResponse.json({ success: true, newQuantity });
  } catch (error: any) {
    console.error('Error adjusting stock quantity:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
