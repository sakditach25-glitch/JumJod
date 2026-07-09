'use client';

import React, { useState, useEffect } from 'react';
import { X, Loader2, AlertCircle } from 'lucide-react';
import { StockItem } from '@/lib/types';
import { createClient } from '@/lib/supabase/client';
import { useMutation, useQueryClient } from '@tanstack/react-query';

interface StockModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  stockToEdit?: StockItem | null;
}

export default function StockModal({ isOpen, onClose, userId, stockToEdit }: StockModalProps) {
  const queryClient = useQueryClient();
  const supabase = createClient();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [quantity, setQuantity] = useState(0);
  const [unit, setUnit] = useState('ชิ้น');
  const [category, setCategory] = useState<'อุปกรณ์สำนักงาน' | 'Laboratory'>('อุปกรณ์สำนักงาน');
  const [minThreshold, setMinThreshold] = useState(0);
  const [priority, setPriority] = useState<'High' | 'Medium' | 'Low'>('Medium');

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Initialize form fields when opening or changing stockToEdit
  useEffect(() => {
    if (isOpen) {
      if (stockToEdit) {
        setName(stockToEdit.name);
        setDescription(stockToEdit.description || '');
        setQuantity(stockToEdit.quantity);
        setUnit(stockToEdit.unit);
        setCategory(stockToEdit.category as any);
        setMinThreshold(stockToEdit.min_threshold ?? 0);
        setPriority(stockToEdit.priority || 'Medium');
      } else {
        setName('');
        setDescription('');
        setQuantity(0);
        setUnit('ชิ้น');
        setCategory('อุปกรณ์สำนักงาน');
        setMinThreshold(0);
        setPriority('Medium');
      }
      setError(null);
    }
  }, [isOpen, stockToEdit]);

  const mutation = useMutation({
    mutationFn: async () => {
      setSubmitting(true);
      setError(null);

      const payload = {
        user_id: userId,
        name: name.trim(),
        description: description.trim() || null,
        quantity,
        unit: unit.trim(),
        category,
        min_threshold: minThreshold,
        priority,
        updated_at: new Date().toISOString(),
      };

      if (stockToEdit) {
        const { error } = await supabase
          .from('stocks')
          .update(payload)
          .eq('id', stockToEdit.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('stocks')
          .insert([payload]);

        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stocks'] });
      setSubmitting(false);
      onClose();
    },
    onError: (err: any) => {
      console.error('Error saving stock:', err);
      setError(err?.message || 'เกิดข้อผิดพลาดในการบันทึกข้อมูลวัสดุ');
      setSubmitting(false);
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('กรุณากรอกชื่อวัสดุ');
      return;
    }
    if (quantity < 0) {
      setError('จำนวนวัสดุห้ามต่ำกว่า 0');
      return;
    }
    if (minThreshold < 0) {
      setError('เกณฑ์เตือนสั่งเพิ่มห้ามต่ำกว่า 0');
      return;
    }
    mutation.mutate();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Glass backdrop overlay */}
      <div
        className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Modal Box */}
      <div className="relative w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden z-10 flex flex-col max-h-[90vh] animate-scale-up">
        {/* Header */}
        <div className="p-6 border-b border-slate-200 dark:border-slate-800/80 flex items-center justify-between">
          <h2 className="text-xl font-bold bg-gradient-to-r from-violet-650 to-indigo-650 dark:from-violet-400 dark:to-indigo-200 bg-clip-text text-transparent">
            {stockToEdit ? 'แก้ไขวัสดุในคลัง' : 'เพิ่มวัสดุใหม่'}
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-650 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">
          {error && (
            <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-700 dark:text-red-300 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Name */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-450 mb-1.5 uppercase tracking-wider">
              ชื่อวัสดุ (Material Name) *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="เช่น แอลกอฮอล์ 70%, กระดาษ A4..."
              className="w-full px-4 py-2.5 rounded-xl bg-slate-55/40 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-850 focus:border-violet-500 dark:focus:border-violet-500 focus:ring-1 focus:ring-violet-500 outline-none transition-all text-sm text-slate-800 dark:text-slate-200"
              required
            />
          </div>

          {/* Category */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-450 mb-1.5 uppercase tracking-wider">
              หมวดหมู่ (Category)
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as any)}
              className="w-full px-4 py-2.5 rounded-xl bg-white dark:bg-slate-950/65 border border-slate-200 dark:border-slate-850 focus:border-violet-500 dark:focus:border-violet-500 focus:ring-1 focus:ring-violet-500 outline-none transition-all text-sm text-slate-855 dark:text-slate-200"
            >
              <option value="อุปกรณ์สำนักงาน">💼 อุปกรณ์สำนักงาน (Office Supplies)</option>
              <option value="Laboratory">🔬 งาน Laboratory (Lab Supplies)</option>
            </select>
          </div>

          {/* Quantity and Unit */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-450 mb-1.5 uppercase tracking-wider">
                จำนวนคงเหลือ (Quantity)
              </label>
              <input
                type="number"
                min="0"
                value={quantity}
                onChange={(e) => setQuantity(Math.max(0, parseInt(e.target.value) || 0))}
                className="w-full px-4 py-2.5 rounded-xl bg-slate-55/40 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-850 focus:border-violet-500 dark:focus:border-violet-500 focus:ring-1 focus:ring-violet-500 outline-none transition-all text-sm text-slate-800 dark:text-slate-200"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-450 mb-1.5 uppercase tracking-wider">
                หน่วยนับ (Unit)
              </label>
              <input
                type="text"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                placeholder="เช่น ชิ้น, รีม, ขวด, กล่อง"
                className="w-full px-4 py-2.5 rounded-xl bg-slate-55/40 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-850 focus:border-violet-500 dark:focus:border-violet-500 focus:ring-1 focus:ring-violet-500 outline-none transition-all text-sm text-slate-800 dark:text-slate-200"
                required
              />
            </div>
          </div>

          {/* Threshold & Priority */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-450 mb-1.5 uppercase tracking-wider" title="ควรสั่งซื้อเพิ่มเมื่อจำนวนลดลงมาเท่ากับหรือต่ำกว่าระดับนี้">
                เกณฑ์แจ้งเตือนควรสั่งเพิ่ม *
              </label>
              <input
                type="number"
                min="0"
                value={minThreshold}
                onChange={(e) => setMinThreshold(Math.max(0, parseInt(e.target.value) || 0))}
                className="w-full px-4 py-2.5 rounded-xl bg-slate-55/40 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-850 focus:border-violet-500 dark:focus:border-violet-500 focus:ring-1 focus:ring-violet-500 outline-none transition-all text-sm text-slate-800 dark:text-slate-200"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-450 mb-1.5 uppercase tracking-wider">
                ลำดับความสำคัญ (Priority)
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as any)}
                className="w-full px-4 py-2.5 rounded-xl bg-white dark:bg-slate-950/65 border border-slate-200 dark:border-slate-850 focus:border-violet-500 dark:focus:border-violet-500 focus:ring-1 focus:ring-violet-500 outline-none transition-all text-sm text-slate-855 dark:text-slate-200"
              >
                <option value="High">🔴 ด่วนมาก (High)</option>
                <option value="Medium">🟡 ปานกลาง (Medium)</option>
                <option value="Low">🟢 ทั่วไป (Low)</option>
              </select>
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-450 mb-1.5 uppercase tracking-wider">
              รายละเอียดเพิ่มเติม (Description)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="ระบุสเปก สถานที่จัดเก็บ หรือโน้ตเพิ่มเติม..."
              rows={3}
              className="w-full px-4 py-2.5 rounded-xl bg-slate-55/40 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-850 focus:border-violet-500 dark:focus:border-violet-500 focus:ring-1 focus:ring-violet-500 outline-none transition-all text-sm text-slate-800 dark:text-slate-200 resize-none"
            />
          </div>
        </form>

        {/* Footer Actions */}
        <div className="p-6 border-t border-slate-200 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-950/20 flex items-center justify-end gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/50 transition-colors cursor-pointer"
          >
            ยกเลิก
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="px-5 py-2.5 rounded-xl text-sm font-semibold bg-gradient-to-r from-violet-650 to-indigo-650 hover:from-violet-600 hover:to-indigo-600 text-white shadow-lg shadow-indigo-650/10 active:scale-[0.98] transition-all flex items-center gap-2 disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>กำลังบันทึก...</span>
              </>
            ) : (
              <span>{stockToEdit ? 'บันทึกการแก้ไข' : 'สร้างรายการวัสดุ'}</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
