'use client';

import React, { useState } from 'react';
import { X, Loader2, AlertCircle, History, ArrowUpRight, ArrowDownLeft, Settings, Plus, Trash2, Search } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';

interface StockHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function StockHistoryModal({ isOpen, onClose }: StockHistoryModalProps) {
  const supabase = createClient();
  const [searchQuery, setSearchQuery] = useState('');

  // Fetch transactions using react-query
  const { data: transactions = [], isLoading, error } = useQuery<any[]>({
    queryKey: ['stock-transactions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('stock_transactions')
        .select(`
          id,
          type,
          quantity_changed,
          quantity_before,
          quantity_after,
          notes,
          created_at,
          stocks (
            name,
            unit
          )
        `)
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      return data || [];
    },
    enabled: isOpen,
  });

  if (!isOpen) return null;

  // Filter transactions by item name or notes
  const filteredTransactions = transactions.filter((tx) => {
    const itemName = tx.stocks?.name?.toLowerCase() || '';
    const notes = tx.notes?.toLowerCase() || '';
    const search = searchQuery.toLowerCase();
    return itemName.includes(search) || notes.includes(search);
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Modal Box */}
      <div className="relative w-full max-w-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden z-10 flex flex-col max-h-[85vh] animate-scale-up">
        {/* Header */}
        <div className="p-6 border-b border-slate-200 dark:border-slate-800/80 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-violet-500/10 text-violet-650 dark:text-violet-400">
              <History className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold bg-gradient-to-r from-violet-650 to-indigo-650 dark:from-violet-400 dark:to-indigo-200 bg-clip-text text-transparent">
                ประวัติการเบิก-จ่าย & ปรับปรุงคลัง
              </h2>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                รายการประวัติย้อนหลัง 100 รายการล่าสุด
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-650 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search Filter Bar */}
        <div className="px-6 py-3 bg-slate-50/50 dark:bg-slate-950/20 border-b border-slate-200 dark:border-slate-800/50 relative">
          <Search className="absolute left-9.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-450 dark:text-slate-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="ค้นหาตามชื่อวัสดุ หรือช่องทางทำรายการ..."
            className="w-full pl-9 pr-4 py-2 rounded-xl bg-slate-100/50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 focus:border-violet-500 dark:focus:border-violet-500 focus:ring-1 focus:ring-violet-500 outline-none transition-all text-sm text-slate-800 dark:text-slate-200"
          />
        </div>

        {/* Logs Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {isLoading ? (
            <div className="h-48 flex flex-col items-center justify-center gap-3">
              <Loader2 className="w-7 h-7 text-violet-500 animate-spin" />
              <span className="text-xs text-slate-400 font-semibold">กำลังดึงข้อมูลประวัติ...</span>
            </div>
          ) : error ? (
            <div className="flex items-start gap-2.5 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-700 dark:text-red-300 text-sm">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <span>{(error as any)?.message || 'เกิดข้อผิดพลาดในการโหลดประวัติสต็อก'}</span>
            </div>
          ) : filteredTransactions.length === 0 ? (
            <div className="h-48 flex flex-col items-center justify-center gap-2 text-slate-400">
              <History className="w-8 h-8 opacity-40" />
              <span className="text-xs font-semibold">ไม่พบข้อมูลประวัติทำรายการ</span>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800/40">
              {filteredTransactions.map((tx) => {
                const date = new Date(tx.created_at).toLocaleString('th-TH', {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                });
                
                // Styling based on Transaction Type
                let typeIcon = <Settings className="w-4 h-4" />;
                let typeColor = 'bg-slate-100 text-slate-650 dark:bg-slate-800 dark:text-slate-400';
                let typeLabel = 'ปรับปรุง';
                let qtyDisplay = `${tx.quantity_changed}`;

                if (tx.type === 'ADD') {
                  typeIcon = <ArrowUpRight className="w-4 h-4" />;
                  typeColor = 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-450';
                  typeLabel = 'เติมสต็อก';
                  qtyDisplay = `+${tx.quantity_changed}`;
                } else if (tx.type === 'SUBTRACT') {
                  typeIcon = <ArrowDownLeft className="w-4 h-4" />;
                  typeColor = 'bg-rose-100 text-rose-700 dark:bg-rose-500/10 dark:text-rose-450';
                  typeLabel = 'เบิกออก';
                  qtyDisplay = `-${tx.quantity_changed}`;
                } else if (tx.type === 'CREATE') {
                  typeIcon = <Plus className="w-4 h-4" />;
                  typeColor = 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-400';
                  typeLabel = 'เพิ่มใหม่';
                  qtyDisplay = `+${tx.quantity_changed}`;
                } else if (tx.type === 'DELETE') {
                  typeIcon = <Trash2 className="w-4 h-4" />;
                  typeColor = 'bg-red-100 text-red-700 dark:bg-red-500/10 dark:text-red-400';
                  typeLabel = 'ลบวัสดุ';
                  qtyDisplay = `-${tx.quantity_changed}`;
                }

                const itemName = tx.stocks?.name || '(วัสดุถูกลบแล้ว)';
                const itemUnit = tx.stocks?.unit || 'ชิ้น';

                return (
                  <div key={tx.id} className="py-3 flex items-center justify-between gap-4 first:pt-0 last:pb-0">
                    <div className="flex items-center gap-3 min-w-0">
                      {/* Icon type */}
                      <div className={`p-2 rounded-xl shrink-0 ${typeColor}`}>
                        {typeIcon}
                      </div>

                      {/* Info text */}
                      <div className="min-w-0">
                        <span className="font-bold text-sm text-slate-800 dark:text-slate-100 block truncate">
                          {itemName}
                        </span>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500">
                            {date}
                          </span>
                          <span className="w-1 h-1 rounded-full bg-slate-300 dark:bg-slate-700" />
                          <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">
                            {tx.notes}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Change quantity */}
                    <div className="text-right shrink-0">
                      <span className={`text-sm font-black ${
                        tx.type === 'ADD' || tx.type === 'CREATE'
                          ? 'text-emerald-600 dark:text-emerald-450'
                          : tx.type === 'SUBTRACT' || tx.type === 'DELETE'
                          ? 'text-rose-600 dark:text-rose-450'
                          : 'text-slate-500 dark:text-slate-400'
                      }`}>
                        {qtyDisplay} {itemUnit}
                      </span>
                      <span className="text-[9px] text-slate-400 dark:text-slate-500 font-semibold block mt-0.5">
                        ยอดหลังทำ: {tx.quantity_after} {itemUnit}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
