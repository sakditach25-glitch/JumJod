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

