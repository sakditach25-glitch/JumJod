'use client';

import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/components/providers/auth-provider';
import { Item } from '@/lib/types';
import { 
  Search, FileText, CheckCircle2, Image as ImageIcon, 
  ExternalLink, Calendar, CreditCard, CheckSquare, Square,
  Clock, AlertCircle, RefreshCw, X
} from 'lucide-react';
import Image from 'next/image';
import moment from 'moment';

export default function CompletedItemsPage() {
  const { user } = useAuth();
  const supabase = createClient();
  
  const [searchQuery, setSearchQuery] = useState('');
  const [auditedItems, setAuditedItems] = useState<Record<string, boolean>>({});
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  // Load audited state from localStorage (only runs on client)
  useEffect(() => {
    const saved = localStorage.getItem('audited_items');
    if (saved) {
      try {
        setAuditedItems(JSON.parse(saved));
      } catch (e) {
        console.error(e);
      }
    }
  }, []);

  // Fetch Completed Items (status === 'Issuing Item') using TanStack Query
  const { data: items = [], isLoading, error, refetch } = useQuery<Item[]>({
    queryKey: ['completed-items'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('items')
        .select('*')
        .eq('status', 'Issuing Item')
        .order('updated_at', { ascending: false });

      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.id,
  });

  const toggleAudit = (itemId: string) => {
    const updated = {
      ...auditedItems,
      [itemId]: !auditedItems[itemId]
    };
    setAuditedItems(updated);
    localStorage.setItem('audited_items', JSON.stringify(updated));
  };

  // Filter items by search query
  const filteredItems = items.filter(
    (item) =>
      item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.description && item.description.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="space-y-6 min-h-[85vh]">
      {/* Header Panel */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-transparent dark:bg-gradient-to-r dark:from-white dark:via-slate-100 dark:to-slate-400 dark:bg-clip-text">
            ตรวจสอบรายการสำเร็จ (Completed Audit Log)
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            ทวนสอบรายการจัดซื้อทั้งหมดที่ออกรหัส ITEM สำเร็จเรียบร้อยแล้ว
          </p>
        </div>
        <button
          onClick={() => refetch()}
          className="flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-850 active:scale-[0.98] transition-all cursor-pointer shadow-sm shrink-0"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>ดึงข้อมูลล่าสุด</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex items-center gap-3 p-3 bg-white dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800/80 rounded-2xl shadow-sm backdrop-blur-sm">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="ค้นหาชื่อรายการสำเร็จ หรือคำอธิบาย..."
            className="w-full pl-11 pr-4 py-2.5 rounded-xl bg-slate-100/50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 focus:border-violet-500 dark:focus:border-violet-500 focus:ring-1 focus:ring-violet-500 outline-none transition-all text-sm text-slate-800 dark:text-slate-200"
          />
        </div>
      </div>

      {/* Completed Items Table */}
      {isLoading ? (
        <div className="h-[50vh] flex flex-col items-center justify-center gap-3">
          <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-xs text-slate-400 font-semibold">กำลังโหลดประวัติการทวนสอบ...</span>
        </div>
      ) : error ? (
        <div className="h-[40vh] flex flex-col items-center justify-center text-center p-6 border border-red-200/50 dark:border-red-900/30 bg-red-500/5 dark:bg-red-950/10 rounded-2xl gap-3">
          <AlertCircle className="w-8 h-8 text-red-500 dark:text-red-400" />
          <h3 className="text-sm font-bold text-red-700 dark:text-red-200">เกิดข้อผิดพลาดในการโหลดรายการ</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">{(error as any)?.message}</p>
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="h-[40vh] border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl flex flex-col items-center justify-center text-center p-8 bg-white/5">
          <CheckCircle2 className="w-10 h-10 text-slate-400 dark:text-slate-600 mb-3" />
          <h3 className="text-sm font-bold text-slate-700 dark:text-slate-350">ยังไม่มีรายการสำเร็จ</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xs mt-1 leading-relaxed">
            รายการที่ถูกเปลี่ยนสถานะเป็น "กำลังออก ITEM" จะแสดงรายการประวัติที่นี่เพื่อการตรวจสอบ
          </p>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900/20 border border-slate-200 dark:border-slate-800/80 rounded-2xl overflow-hidden shadow-sm backdrop-blur-sm">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-950/40 border-b border-slate-200 dark:border-slate-850/60 text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider">
                  <th className="py-4 px-5 w-16 text-center">ทวนสอบ</th>
                  <th className="py-4 px-4 min-w-[200px]">รายการจัดซื้อ</th>
                  <th className="py-4 px-4 min-w-[250px]">รายละเอียด</th>
                  <th className="py-4 px-4">วันที่ชำระเงินจริง</th>
                  <th className="py-4 px-4">เงื่อนไขเครดิต</th>
                  <th className="py-4 px-4">เอกสารแนบ</th>
                  <th className="py-4 px-4 w-28 text-center">วันที่บันทึกสำเร็จ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-150 dark:divide-slate-850/50 text-slate-700 dark:text-slate-300">
                {filteredItems.map((item, index) => {
                  const isAudited = auditedItems[item.id] || false;
                  
                  return (
                    <tr 
                      key={item.id}
                      className={`hover:bg-slate-50/50 dark:hover:bg-slate-900/20 transition-colors duration-150 ${
                        isAudited ? 'bg-emerald-500/[0.01] dark:bg-emerald-500/[0.02]' : ''
                      }`}
                    >
                      {/* Checkbox Audit column */}
                      <td className="py-4 px-5 text-center">
                        <button
                          onClick={() => toggleAudit(item.id)}
                          className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800/50 text-slate-400 dark:text-slate-500 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors cursor-pointer"
                        >
                          {isAudited ? (
                            <CheckSquare className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                          ) : (
                            <Square className="w-5 h-5" />
                          )}
                        </button>
                      </td>

                      {/* Title column */}
                      <td className="py-4 px-4">
                        <div className="font-bold text-sm text-slate-850 dark:text-slate-100 flex items-center gap-2">
                          {isAudited && (
                            <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                          )}
                          <span>{item.title}</span>
                        </div>
                        {item.po_date && (
                          <div className="flex items-center gap-1 text-[10px] text-slate-500 dark:text-slate-400 mt-1">
                            <Clock className="w-3 h-3" />
                            <span>ออก PO: {moment(item.po_date).format('DD/MM/YYYY')}</span>
                          </div>
                        )}
                      </td>

                      {/* Description column */}
                      <td className="py-4 px-4 max-w-xs">
                        <p className="line-clamp-2 leading-relaxed text-slate-600 dark:text-slate-400 text-xs">
                          {item.description || <span className="italic text-slate-400">ไม่มีข้อมูล</span>}
                        </p>
                      </td>

                      {/* Due Date column */}
                      <td className="py-4 px-4">
                        {item.budget_due_date ? (
                          <span className="flex items-center gap-1.5 font-bold text-emerald-600 dark:text-emerald-400">
                            <Calendar className="w-3.5 h-3.5 shrink-0" />
                            <span>{moment(item.budget_due_date).format('DD/MM/YYYY')}</span>
                          </span>
                        ) : (
                          <span className="text-slate-450 italic">ไม่ระบุ</span>
                        )}
                      </td>

                      {/* Credit Term column */}
                      <td className="py-4 px-4">
                        {item.credit_term ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-100 dark:border-indigo-500/20 text-indigo-700 dark:text-indigo-400 font-semibold text-[10px]">
                            <CreditCard className="w-3 h-3" />
                            <span>{item.credit_term} วัน</span>
                          </span>
                        ) : (
                          <span className="text-slate-450 italic">ไม่ระบุ</span>
                        )}
                      </td>

                      {/* Attachment column */}
                      <td className="py-4 px-4">
                        {item.image_url ? (
                          <button
                            onClick={() => setSelectedImage(item.image_url)}
                            className="inline-flex items-center gap-1 text-violet-600 dark:text-violet-400 hover:text-violet-750 dark:hover:text-violet-300 font-semibold hover:underline cursor-pointer"
                          >
                            <ImageIcon className="w-3.5 h-3.5" />
                            <span>เปิดดูเอกสาร</span>
                            <ExternalLink className="w-3 h-3" />
                          </button>
                        ) : (
                          <span className="text-slate-400 dark:text-slate-600">ไม่มีแนบ</span>
                        )}
                      </td>

                      {/* Date completed column */}
                      <td className="py-4 px-4 text-center text-slate-500 dark:text-slate-400">
                        {moment(item.updated_at).format('DD/MM/YYYY')}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Lightbox Modal for Attachment viewing */}
      {selectedImage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div 
            className="absolute inset-0 bg-slate-950/85 backdrop-blur-sm transition-opacity" 
            onClick={() => setSelectedImage(null)}
          />
          <div className="relative max-w-4xl max-h-[85vh] overflow-hidden bg-slate-900 border border-slate-800 rounded-2xl z-10 flex flex-col p-2">
            <button
              onClick={() => setSelectedImage(null)}
              className="absolute top-4 right-4 p-1.5 rounded-full bg-slate-950/70 border border-slate-800 text-slate-300 hover:text-white hover:bg-slate-900 transition-colors z-20"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="relative w-[80vw] h-[75vh] max-w-3xl rounded-lg overflow-hidden">
              <Image
                src={selectedImage}
                alt="Document attachment"
                fill
                sizes="80vw"
                className="object-contain"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
