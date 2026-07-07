'use client';

import React, { useState, useEffect } from 'react';
import { X, Calendar, Image as ImageIcon, Loader2, AlertCircle } from 'lucide-react';
import { Item, ItemStatus } from '@/lib/types';
import { createClient } from '@/lib/supabase/client';
import { uploadItemImage } from '@/lib/supabase/storage';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import Image from 'next/image';

interface ItemModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  itemToEdit?: Item | null;
}

function calculateDueDate(poDateStr: string | null, creditTerm: number | null): string | null {
  if (!poDateStr || !creditTerm) return null;
  const date = new Date(poDateStr);
  if (isNaN(date.getTime())) return null;
  
  // Add credit term days
  date.setDate(date.getDate() + creditTerm);
  
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export default function ItemModal({ isOpen, onClose, userId, itemToEdit }: ItemModalProps) {
  const queryClient = useQueryClient();
  const supabase = createClient();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<ItemStatus>('Pending');
  const [reminderDate, setReminderDate] = useState('');
  const [poDate, setPoDate] = useState('');
  const [creditTerm, setCreditTerm] = useState<30 | 60 | 90 | null>(null);
  const [budgetDueDate, setBudgetDueDate] = useState<string | null>(null);
  
  // Image Upload States
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [existingImageUrl, setExistingImageUrl] = useState<string | null>(null);
  
  // UI Status States
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Initialize form fields when opening or changing itemToEdit
  useEffect(() => {
    if (isOpen) {
      if (itemToEdit) {
        setTitle(itemToEdit.title);
        setDescription(itemToEdit.description || '');
        setStatus(itemToEdit.status);
        setReminderDate(itemToEdit.reminder_date ? itemToEdit.reminder_date.substring(0, 16) : '');
        setPoDate(itemToEdit.po_date || '');
        setCreditTerm(itemToEdit.credit_term);
        setBudgetDueDate(itemToEdit.budget_due_date);
        setExistingImageUrl(itemToEdit.image_url);
        setImagePreview(itemToEdit.image_url);
      } else {
        // Reset form for new item
        setTitle('');
        setDescription('');
        setStatus('Pending');
        setReminderDate('');
        setPoDate('');
        setCreditTerm(null);
        setBudgetDueDate(null);
        setExistingImageUrl(null);
        setImagePreview(null);
      }
      setImageFile(null);
      setError(null);
    }
  }, [isOpen, itemToEdit]);

  // Auto-calculate budget due date when poDate or creditTerm changes
  useEffect(() => {
    if (poDate && creditTerm) {
      const calculated = calculateDueDate(poDate, creditTerm);
      setBudgetDueDate(calculated);
    } else {
      setBudgetDueDate(null);
    }
  }, [poDate, creditTerm]);

  // Adjust credit terms and PO dates when status changes
  useEffect(() => {
    // If not in a PO stage, reset PO-related fields
    if (status === 'Pending') {
      setPoDate('');
      setCreditTerm(null);
    }
  }, [status]);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  // TanStack Query Mutation for Create / Update
  const mutation = useMutation({
    mutationFn: async () => {
      setSubmitting(true);
      setError(null);
      
      let imageUrl = existingImageUrl;
      
      // Upload new image if present
      if (imageFile) {
        imageUrl = await uploadItemImage(imageFile, userId);
      }

      const itemData = {
        user_id: userId,
        title,
        description: description || null,
        status,
        image_url: imageUrl,
        reminder_date: reminderDate ? new Date(reminderDate).toISOString() : null,
        po_date: poDate ? poDate : null,
        credit_term: creditTerm,
        budget_due_date: budgetDueDate,
        updated_at: new Date().toISOString(),
      };

      if (itemToEdit) {
        // Update Item
        const { error: updateError } = await supabase
          .from('items')
          .update(itemData)
          .eq('id', itemToEdit.id);
        
        if (updateError) throw updateError;
      } else {
        // Create Item
        const { error: createError } = await supabase
          .from('items')
          .insert([itemData]);
        
        if (createError) throw createError;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['items'] });
      setSubmitting(false);
      onClose();
    },
    onError: (err: any) => {
      console.error('Error saving item:', err);
      setError(err?.message || 'เกิดข้อผิดพลาดในการบันทึกข้อมูล');
      setSubmitting(false);
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('กรุณากรอกหัวข้อรายการ');
      return;
    }
    mutation.mutate();
  };

  if (!isOpen) return null;

  const isPoStage = status === 'Purchasing' || status === 'Issuing Item';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Glass backdrop overlay */}
      <div 
        className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm transition-opacity" 
        onClick={onClose}
      />

      {/* Modal Box */}
      <div className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden z-10 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-6 border-b border-slate-800/80 flex items-center justify-between">
          <h2 className="text-xl font-bold bg-gradient-to-r from-violet-400 to-indigo-200 bg-clip-text text-transparent">
            {itemToEdit ? 'แก้ไขรายการจัดซื้อ' : 'เพิ่มรายการจัดซื้อใหม่'}
          </h2>
          <button 
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">
          {error && (
            <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-red-950/40 border border-red-900/50 text-red-200 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-400 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Title */}
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wider">
              หัวข้อรายการ <span className="text-violet-500">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="เช่น ซื้อเซิร์ฟเวอร์, ค่าลิขสิทธิ์ซอฟต์แวร์"
              className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 focus:border-violet-500 focus:ring-1 focus:ring-violet-500 outline-none transition-all text-slate-200"
              required
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wider">
              รายละเอียดเพิ่มเติม (Description)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="กรอกรายละเอียด เช่น สเปก อุปกรณ์ จำนวน หรือข้อมูลอ้างอิง"
              rows={3}
              className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 focus:border-violet-500 focus:ring-1 focus:ring-violet-500 outline-none transition-all text-slate-200 resize-none"
            />
          </div>

          {/* Status Selection */}
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wider">
              สถานะ (Status Pipeline)
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(['Pending', 'Purchasing', 'Issuing Item'] as ItemStatus[]).map((s) => {
                const isSelected = status === s;
                let thaiName = 'กำลังดำเนินการ';
                let style = 'border-slate-800 text-slate-400 bg-slate-950 hover:bg-slate-900/50';

                if (s === 'Purchasing') thaiName = 'ติดต่อที่จัดซื้อ';
                if (s === 'Issuing Item') thaiName = 'กำลังออก ITEM';

                if (isSelected) {
                  if (s === 'Pending') style = 'border-amber-500/50 bg-amber-500/10 text-amber-400';
                  if (s === 'Purchasing') style = 'border-violet-500/50 bg-violet-500/10 text-violet-400';
                  if (s === 'Issuing Item') style = 'border-emerald-500/50 bg-emerald-500/10 text-emerald-400';
                }

                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setStatus(s)}
                    className={`py-2 px-3 border rounded-xl text-xs font-bold transition-all duration-200 ${style}`}
                  >
                    {thaiName}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Reminder Date */}
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wider">
              วันแจ้งเตือนการดำเนินการ (Reminder Date)
            </label>
            <div className="relative">
              <Calendar className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                type="datetime-local"
                value={reminderDate}
                onChange={(e) => setReminderDate(e.target.value)}
                className="w-full pl-11 pr-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 focus:border-violet-500 focus:ring-1 focus:ring-violet-500 outline-none transition-all text-slate-200"
              />
            </div>
          </div>

          {/* PO & Credit Term Logic */}
          {isPoStage && (
            <div className="p-4 rounded-xl border border-violet-500/10 bg-violet-950/10 space-y-4 animate-fade-in">
              <h3 className="text-xs font-bold text-violet-400 uppercase tracking-wider mb-2">
                ข้อมูลเครดิตและการชำระเงิน (PO & Credit Term)
              </h3>
              
              <div className="grid grid-cols-2 gap-4">
                {/* PO Date */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase">
                    วันที่จัดส่ง PO (PO Date)
                  </label>
                  <input
                    type="date"
                    value={poDate}
                    onChange={(e) => setPoDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 focus:border-violet-500 focus:ring-1 focus:ring-violet-500 outline-none transition-all text-xs text-slate-200"
                    required={isPoStage}
                  />
                </div>

                {/* Credit Term */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase">
                    ระยะเวลาเครดิต (Credit Term)
                  </label>
                  <select
                    value={creditTerm || ''}
                    onChange={(e) => setCreditTerm(e.target.value ? Number(e.target.value) as 30 | 60 | 90 : null)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 focus:border-violet-500 focus:ring-1 focus:ring-violet-500 outline-none transition-all text-xs text-slate-200"
                    required={isPoStage}
                  >
                    <option value="" disabled>เลือกเครดิตเทอม</option>
                    <option value={30}>30 วัน</option>
                    <option value={60}>60 วัน</option>
                    <option value={90}>90 วัน</option>
                  </select>
                </div>
              </div>

              {/* Auto-Calculated Budget Due Date */}
              {budgetDueDate && (
                <div className="pt-2 flex items-center justify-between border-t border-violet-950/50">
                  <span className="text-xs text-slate-400">วันครบกำหนดชำระจริง (Calculated Due Date):</span>
                  <span className="text-sm font-bold text-emerald-400">{budgetDueDate}</span>
                </div>
              )}
            </div>
          )}

          {/* Image Attachment */}
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wider">
              แนบเอกสาร/รูปภาพประกอบ (Image Attachment)
            </label>
            <div className="flex items-center gap-4">
              {imagePreview ? (
                <div className="relative w-20 h-20 rounded-xl overflow-hidden border border-slate-800 shrink-0">
                  <Image
                    src={imagePreview}
                    alt="Preview"
                    fill
                    sizes="80px"
                    className="object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setImageFile(null);
                      setImagePreview(null);
                      setExistingImageUrl(null);
                    }}
                    className="absolute top-1 right-1 p-0.5 rounded-full bg-slate-950/80 border border-slate-800 text-slate-300 hover:text-white"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ) : (
                <label className="w-20 h-20 rounded-xl border border-dashed border-slate-800 hover:border-violet-500/50 flex flex-col items-center justify-center cursor-pointer bg-slate-950/50 text-slate-500 hover:text-slate-400 transition-colors shrink-0">
                  <ImageIcon className="w-5 h-5 mb-1" />
                  <span className="text-[10px]">เลือกรูป</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageChange}
                    className="hidden"
                  />
                </label>
              )}
              <div className="text-xs text-slate-500 space-y-1">
                <p>รองรับไฟล์รูปภาพเท่านั้น (JPG, PNG, WebP)</p>
                <p>จะถูกอัปโหลดไปยังระบบจัดเก็บไฟล์ Supabase Storage</p>
              </div>
            </div>
          </div>
        </form>

        {/* Footer Actions */}
        <div className="p-6 border-t border-slate-800/80 bg-slate-950/20 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 transition-colors"
          >
            ยกเลิก
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="px-5 py-2.5 rounded-xl text-sm font-semibold bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white shadow-lg shadow-indigo-600/10 active:scale-[0.98] transition-all flex items-center gap-2 disabled:opacity-50 disabled:pointer-events-none"
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>กำลังบันทึก...</span>
              </>
            ) : (
              <span>{itemToEdit ? 'บันทึกการแก้ไข' : 'สร้างรายการ'}</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
