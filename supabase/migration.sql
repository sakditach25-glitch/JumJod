-- Run this SQL in your Supabase SQL Editor to support chatbot conversation states
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS pending_item_data JSONB;
