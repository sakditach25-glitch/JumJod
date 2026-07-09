-- Run this SQL in your Supabase SQL Editor to support chatbot conversation states
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS pending_item_data JSONB;

-- เพิ่มฟิลด์สำหรับจัดการข้อมูล PR และรหัส Item
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS is_pr boolean DEFAULT false NOT NULL;
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS has_item_number boolean DEFAULT false NOT NULL;
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS item_number text;
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS item_request_status text DEFAULT 'None' NOT NULL;
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS pr_number text;
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS pr_status text DEFAULT 'Pending' NOT NULL;

-- เพิ่มข้อจำกัดเช็คค่าสถานะ (Constraint checks)
ALTER TABLE public.items DROP CONSTRAINT IF EXISTS item_request_status_check;
ALTER TABLE public.items ADD CONSTRAINT item_request_status_check CHECK (item_request_status IN ('None', 'Pending', 'Added'));

ALTER TABLE public.items DROP CONSTRAINT IF EXISTS pr_status_check;
ALTER TABLE public.items ADD CONSTRAINT pr_status_check CHECK (pr_status IN ('Pending', 'Ready', 'Issued'));

-- เพิ่มฟิลด์ตรวจสอบว่าส่งการแจ้งเตือนในไลน์บอทไปแล้วหรือยัง เพื่อป้องกันการแจ้งเตือนซ้ำ
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS reminder_sent boolean DEFAULT false NOT NULL;


-- =========================================================================
-- CREATE STOCKS TABLE FOR INVENTORY MANAGEMENT
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.stocks (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  description text,
  quantity integer DEFAULT 0 NOT NULL,
  unit text DEFAULT 'ชิ้น' NOT NULL,
  category text DEFAULT 'อุปกรณ์สำนักงาน' NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

-- Enable RLS for stocks table
ALTER TABLE public.stocks ENABLE ROW LEVEL SECURITY;

-- Create policies for stocks table
DROP POLICY IF EXISTS "Users can view their own stocks" ON public.stocks;
CREATE POLICY "Users can view their own stocks" 
  ON public.stocks FOR SELECT 
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own stocks" ON public.stocks;
CREATE POLICY "Users can insert their own stocks" 
  ON public.stocks FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own stocks" ON public.stocks;
CREATE POLICY "Users can update their own stocks" 
  ON public.stocks FOR UPDATE 
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own stocks" ON public.stocks;
CREATE POLICY "Users can delete their own stocks" 
  ON public.stocks FOR DELETE 
  USING (auth.uid() = user_id);

-- ADD min_threshold and priority columns to public.stocks
ALTER TABLE public.stocks ADD COLUMN IF NOT EXISTS min_threshold integer DEFAULT 0 NOT NULL;
ALTER TABLE public.stocks ADD COLUMN IF NOT EXISTS priority text DEFAULT 'Medium' NOT NULL;

-- Add check constraint for priority column
ALTER TABLE public.stocks DROP CONSTRAINT IF EXISTS stocks_priority_check;
ALTER TABLE public.stocks ADD CONSTRAINT stocks_priority_check CHECK (priority IN ('High', 'Medium', 'Low'));



