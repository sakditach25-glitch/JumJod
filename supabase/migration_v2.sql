-- Run this SQL in your Supabase SQL Editor to set up the stock history & alert systems

-- 1. Create stock transactions history table
CREATE TABLE IF NOT EXISTS public.stock_transactions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  stock_id uuid REFERENCES public.stocks ON DELETE CASCADE NOT NULL,
  type text NOT NULL CHECK (type IN ('ADD', 'SUBTRACT', 'SET', 'CREATE', 'DELETE')),
  quantity_changed integer NOT NULL,
  quantity_before integer NOT NULL,
  quantity_after integer NOT NULL,
  notes text,
  created_at timestamptz DEFAULT now() NOT NULL
);

-- Enable RLS for stock transactions
ALTER TABLE public.stock_transactions ENABLE ROW LEVEL SECURITY;

-- Drop existing policies just in case
DROP POLICY IF EXISTS "Users can view their own transactions" ON public.stock_transactions;
DROP POLICY IF EXISTS "Users can insert their own transactions" ON public.stock_transactions;

-- RLS Policies
CREATE POLICY "Users can view their own transactions" 
  ON public.stock_transactions FOR SELECT 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own transactions" 
  ON public.stock_transactions FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

-- 2. Create PostgreSQL function to log transactions automatically on changes to public.stocks
CREATE OR REPLACE FUNCTION public.log_stock_transaction()
RETURNS TRIGGER AS $$
DECLARE
  v_qty_before INTEGER;
  v_qty_after INTEGER;
  v_qty_changed INTEGER;
  v_action TEXT;
  v_notes TEXT;
BEGIN
  IF (TG_OP = 'INSERT') THEN
    v_qty_before := 0;
    v_qty_after := NEW.quantity;
    v_qty_changed := NEW.quantity;
    v_action := 'CREATE';
    v_notes := 'สร้างรายการวัสดุใหม่';
  ELSIF (TG_OP = 'UPDATE') THEN
    IF (OLD.quantity IS DISTINCT FROM NEW.quantity) THEN
      v_qty_before := OLD.quantity;
      v_qty_after := NEW.quantity;
      IF (NEW.quantity > OLD.quantity) THEN
        v_qty_changed := NEW.quantity - OLD.quantity;
        v_action := 'ADD';
        v_notes := 'เติมสต็อก';
      ELSE
        v_qty_changed := OLD.quantity - NEW.quantity;
        v_action := 'SUBTRACT';
        v_notes := 'เบิกออก';
      END IF;
    ELSE
      -- No quantity change, do not log anything
      RETURN NEW;
    END IF;
  ELSIF (TG_OP = 'DELETE') THEN
    v_qty_before := OLD.quantity;
    v_qty_after := 0;
    v_qty_changed := OLD.quantity;
    v_action := 'DELETE';
    v_notes := 'ลบออกจากคลัง';
  END IF;

  -- Detect source channel based on auth.uid()
  -- If auth.uid() is null, it means it's executed via service role (like webhook / admin cron)
  IF (auth.uid() IS NULL) THEN
    v_notes := v_notes || ' (ผ่าน LINE Chatbot)';
  ELSE
    v_notes := v_notes || ' (ผ่านหน้าเว็บ)';
  END IF;

  INSERT INTO public.stock_transactions (
    user_id, stock_id, type, quantity_changed, quantity_before, quantity_after, notes
  ) VALUES (
    COALESCE(NEW.user_id, OLD.user_id),
    COALESCE(NEW.id, OLD.id),
    v_action,
    v_qty_changed,
    v_qty_before,
    v_qty_after,
    v_notes
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Bind trigger to public.stocks
DROP TRIGGER IF EXISTS on_stock_changed ON public.stocks;
CREATE TRIGGER on_stock_changed
  AFTER INSERT OR UPDATE OR DELETE ON public.stocks
  FOR EACH ROW EXECUTE PROCEDURE public.log_stock_transaction();

-- 3. Add due_reminder_sent column to items table if not exists
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS due_reminder_sent boolean DEFAULT false NOT NULL;
