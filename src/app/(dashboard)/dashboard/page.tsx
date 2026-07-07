'use client';

import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/components/providers/auth-provider';
import { Item, ItemStatus, Profile } from '@/lib/types';
import ItemModal from '@/components/dashboard/item-modal';
import {
  Plus, Search, Edit2, Trash2, Calendar,
  ArrowRight, ArrowLeft, Image as ImageIcon,
  FileText, Clock, CreditCard, ChevronRight, AlertCircle, CheckCircle2
} from 'lucide-react';
import Image from 'next/image';

export default function DashboardPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const supabase = createClient();

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('');

  // Modal states
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);

  // Drag-and-Drop & Toast states
  const [activeDragColumn, setActiveDragColumn] = useState<ItemStatus | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'info' } | null>(null);
  const [auditedItems, setAuditedItems] = useState<Record<string, boolean>>({});

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

  const showToast = (message: string, type: 'success' | 'info' = 'success') => {
    setToast({ message, type });
    const timer = setTimeout(() => {
      setToast(null);
    }, 4000);
    return () => clearTimeout(timer);
  };

  const isImageFile = (url: string | null) => {
    if (!url) return false;
    const ext = url.split('.').pop()?.toLowerCase();
    return ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext || '');
  };

  function calculateDueDate(poDateStr: string | null, creditTerm: number | null): string | null {
    if (!poDateStr || !creditTerm) return null;
    const date = new Date(poDateStr);
    if (isNaN(date.getTime())) return null;
    date.setDate(date.getDate() + creditTerm);
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  // Subscribe to Supabase Realtime updates
  useEffect(() => {
    const channel = supabase
      .channel('schema-db-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'items'
        },
        (payload) => {
          queryClient.invalidateQueries({ queryKey: ['items'] });

          if (payload.eventType === 'INSERT') {
            const newItem = payload.new as Item;
            showToast(`➕ บันทึกรายการใหม่: "${newItem.title}" จาก LINE Bot!`, 'info');
          } else if (payload.eventType === 'UPDATE') {
            const updatedItem = payload.new as Item;
            const oldItem = payload.old as Item;
            if (oldItem && oldItem.status !== updatedItem.status) {
              const statusName =
                updatedItem.status === 'Pending' ? 'กำลังดำเนินการ' :
                  updatedItem.status === 'Purchasing' ? 'ติดต่อจัดซื้อ' : 'กำลังออก ITEM';
              showToast(`🔄 อัปเดตรายการ: "${updatedItem.title}" เป็น "${statusName}"`, 'info');
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, queryClient]);

  // Drag and Drop handlers
  const handleDragStart = (e: React.DragEvent, itemId: string) => {
    e.dataTransfer.setData('text/plain', itemId);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDragEnter = (e: React.DragEvent, status: ItemStatus) => {
    e.preventDefault();
    setActiveDragColumn(status);
  };

  const handleDragLeave = () => {
    setActiveDragColumn(null);
  };

  const handleDrop = (e: React.DragEvent, nextStatus: ItemStatus) => {
    e.preventDefault();
    setActiveDragColumn(null);
    const itemId = e.dataTransfer.getData('text/plain');
    if (itemId) {
      const item = items.find((i) => i.id === itemId);
      if (item && item.status !== nextStatus) {
        moveStatusMutation.mutate({ itemId, nextStatus });
      }
    }
  };

  // Fetch user profile using React Query
  const { data: profile, refetch: refetchProfile } = useQuery<Profile>({
    queryKey: ['profile'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user?.id)
        .single();

      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  // Link code generation mutation
  const generateLinkCodeMutation = useMutation({
    mutationFn: async () => {
      const code = Math.random().toString(36).substring(2, 8).toUpperCase();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 minutes
      const { error } = await supabase
        .from('profiles')
        .update({
          link_code: code,
          link_code_expires_at: expiresAt,
          updated_at: new Date().toISOString()
        })
        .eq('id', user?.id);

      if (error) throw error;
    },
    onSuccess: () => {
      refetchProfile();
    },
  });

  // Fetch Items using React Query
  const { data: items = [], isLoading, error } = useQuery<Item[]>({
    queryKey: ['items'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('items')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.id,
  });

  // Delete Mutation
  const deleteMutation = useMutation({
    mutationFn: async (itemId: string) => {
      const { error } = await supabase.from('items').delete().eq('id', itemId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['items'] });
    },
  });

  // Move Status Mutation
  const moveStatusMutation = useMutation({
    mutationFn: async ({ itemId, nextStatus }: { itemId: string; nextStatus: ItemStatus }) => {
      const updates: Partial<Item> = {
        status: nextStatus,
        updated_at: new Date().toISOString()
      };

      const currentItem = items.find(i => i.id === itemId);

      // Reset PO details if moved back to Pending
      if (nextStatus === 'Pending') {
        updates.po_date = null;
        updates.credit_term = null;
        updates.budget_due_date = null;
      } else if (nextStatus === 'Purchasing' || nextStatus === 'Issuing Item') {
        if (currentItem) {
          // If it doesn't have a PO date, default to today
          const finalPoDate = currentItem.po_date || new Date().toISOString().substring(0, 10);
          // If it doesn't have a credit term, default to 30 days
          const finalCreditTerm = currentItem.credit_term || 30;
          // Calculate budget due date
          const calculatedDueDate = calculateDueDate(finalPoDate, finalCreditTerm);

          updates.po_date = finalPoDate;
          updates.credit_term = finalCreditTerm;
          updates.budget_due_date = calculatedDueDate;
        }
      }

      const { error } = await supabase
        .from('items')
        .update(updates)
        .eq('id', itemId);

      if (error) throw error;

      return {
        title: currentItem?.title || '',
        nextStatus,
        calculatedDueDate: updates.budget_due_date,
        creditTerm: updates.credit_term
      };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['items'] });
      if (data?.calculatedDueDate) {
        const dateStr = new Date(data.calculatedDueDate).toLocaleDateString('th-TH', { dateStyle: 'medium' });
        showToast(`อัปเดตเครดิต ${data.creditTerm} วันสำเร็จ! ครบกำหนดชำระจริงวันที่: ${dateStr}`);
      } else {
        const statusName =
          data?.nextStatus === 'Pending' ? 'กำลังดำเนินการ' :
            data?.nextStatus === 'Purchasing' ? 'ติดต่อจัดซื้อ' : 'กำลังออก ITEM';
        showToast(`ย้ายสถานะเป็น "${statusName}" เรียบร้อยแล้ว`);
      }
    },
  });

  const handleEditItem = (item: Item) => {
    setSelectedItem(item);
    setModalOpen(true);
  };

  const handleAddItem = () => {
    setSelectedItem(null);
    setModalOpen(true);
  };

  const handleDeleteItem = (itemId: string) => {
    if (confirm('คุณต้องการลบรายการจัดซื้อนี้ใช่หรือไม่?')) {
      deleteMutation.mutate(itemId);
    }
  };

  const handleCompleteItem = (item: Item) => {
    if (confirm(`คุณต้องการบันทึกความสำเร็จรายการ "${item.title}" ใช่หรือไม่?\n(รายการจะถูกย้ายไปยังหน้าประวัติสำเร็จ)`)) {
      moveStatusMutation.mutate(
        { itemId: item.id, nextStatus: 'Issuing Item' },
        {
          onSuccess: () => {
            const saved = localStorage.getItem('audited_items');
            let audited: Record<string, boolean> = {};
            if (saved) {
              try { audited = JSON.parse(saved); } catch (e) {}
            }
            audited[item.id] = true;
            localStorage.setItem('audited_items', JSON.stringify(audited));
            setAuditedItems(audited);
            showToast(`🎉 ยินดีด้วย! บันทึกความสำเร็จรายการ "${item.title}" เรียบร้อยแล้ว`);
          }
        }
      );
    }
  };

  const handleMoveStatus = (item: Item, direction: 'left' | 'right') => {
    const statuses: ItemStatus[] = ['Pending', 'Purchasing', 'Issuing Item'];
    const currentIndex = statuses.indexOf(item.status);
    let nextIndex = currentIndex + (direction === 'right' ? 1 : -1);

    if (nextIndex >= 0 && nextIndex < statuses.length) {
      moveStatusMutation.mutate({
        itemId: item.id,
        nextStatus: statuses[nextIndex],
      });
    }
  };

  // Filter items by search query and exclude audited items
  const filteredItems = items.filter(
    (item) =>
      !auditedItems[item.id] &&
      (item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (item.description && item.description.toLowerCase().includes(searchQuery.toLowerCase())))
  );

  const columns: { status: ItemStatus; title: string; subtitle: string; colorClass: string; borderClass: string }[] = [
    {
      status: 'Pending',
      title: 'กำลังดำเนินการ (Pending)',
      subtitle: 'รายการขอซื้อเริ่มต้น / ตรวจสอบสเปก',
      colorClass: 'text-amber-600 dark:text-amber-400 bg-amber-500/10',
      borderClass: 'border-amber-500/20',
    },
    {
      status: 'Purchasing',
      title: 'ติดต่อที่จัดซื้อ (Purchasing)',
      subtitle: 'ประสานงาน PO / เลือกเงื่อนไขเครดิต',
      colorClass: 'text-violet-600 dark:text-violet-400 bg-violet-500/10',
      borderClass: 'border-violet-500/20',
    },
    {
      status: 'Issuing Item',
      title: 'กำลังออก ITEM (Issuing Item)',
      subtitle: 'ออกรหัส ITEM / รอจัดส่งมอบงาน',
      colorClass: 'text-emerald-600 dark:text-emerald-450 bg-emerald-500/10',
      borderClass: 'border-emerald-500/20',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header Panel */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight bg-gradient-to-r from-slate-900 to-slate-700 dark:from-white dark:via-slate-100 dark:to-slate-400 bg-clip-text text-transparent">
            บันทึกช่วยจำ
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            ระบบบันทึกช่วยจำ สำหรับการเปิด PR / PO / เพิ่ม Item
          </p>
        </div>
        <button
          onClick={handleAddItem}
          className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl font-bold bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white text-sm shadow-lg shadow-indigo-600/10 active:scale-[0.98] transition-all cursor-pointer shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>จดบันทึก</span>
        </button>
      </div>

      {/* LINE Connection Banner */}
      {profile && (
        <div className="backdrop-blur-sm bg-white dark:bg-slate-900/35 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0">
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M24 11.5c0-5.247-5.383-9.5-12-9.5C5.383 2 0 6.253 0 11.5c0 4.697 4.283 8.637 10.094 9.398-.393.818-1.547 3.398-1.77 4.398-.225 1.002.404.99 1.077.545C10.027 25.39 15.016 20.35 17.5 17.5c4.15-1.047 6.5-3.663 6.5-6m-13.62 3.125c-.562 0-1.018-.456-1.018-1.018v-4.8c0-.562.456-1.018 1.018-1.018s1.018.456 1.018 1.018v4.8c0 .562-.456 1.018-1.018 1.018m3.93 0c-.562 0-1.018-.456-1.018-1.018v-4.8c0-.562.456-1.018 1.018-1.018s1.018.456 1.018 1.018v2.215h1.764v-2.215c0-.562.456-1.018 1.018-1.018s1.018.456 1.018 1.018v4.8c0 .562-.456 1.018-1.018 1.018s-1.018-.456-1.018-1.018v-1.579h-1.764v1.579c0 .562-.456 1.018-1.018 1.018m5.603 0c-.562 0-1.018-.456-1.018-1.018v-4.8c0-.562.456-1.018 1.018-1.018.562 0 1.018.456 1.018 1.018v4.8c0 .562-.456 1.018-1.018 1.018" />
              </svg>
            </div>
            <div>
              <h4 className="text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider">
                เชื่อมต่อผู้ช่วย LINE Bot (LINE Assistant Link)
              </h4>
              {profile.line_user_id ? (
                <p className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold mt-0.5">
                  🟢 บัญชี LINE เชื่อมต่อแล้ว! สั่งจำจดจัดซื้อพิมพ์บอกบอททางแชตได้ทุกที่
                </p>
              ) : (
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  เชื่อมต่อเพื่อสั่งบันทึกการจัดซื้อหรือแจ้งเตือนเครดิตทางการเงินผ่านข้อความ LINE
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {!profile.line_user_id && (
              <>
                {profile.link_code && new Date(profile.link_code_expires_at!) > new Date() ? (
                  <div className="px-3.5 py-1.5 bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl flex items-center gap-3">
                    <div>
                      <span className="text-[9px] text-slate-500 block uppercase font-extrabold leading-none mb-1">รหัสส่งหาไลน์บอท:</span>
                      <span className="text-sm font-extrabold text-violet-600 dark:text-violet-400 select-all tracking-widest">{profile.link_code}</span>
                    </div>
                    <div className="text-[10px] text-slate-500 border-l border-slate-200 dark:border-slate-800 pl-3">
                      พิมพ์ส่งบอท:<br />
                      <code className="text-violet-600 dark:text-violet-400 font-bold select-all">#link {profile.link_code}</code>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => generateLinkCodeMutation.mutate()}
                    className="px-4 py-2.5 rounded-xl text-xs font-bold bg-violet-600/10 dark:bg-violet-600/20 border border-violet-200 dark:border-violet-500/30 text-violet-600 dark:text-violet-400 hover:bg-violet-600/20 dark:hover:bg-violet-600/30 active:scale-[0.98] transition-all cursor-pointer"
                  >
                    รับรหัสเชื่อมต่อ LINE
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="flex items-center gap-3 p-3 bg-white dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800/80 rounded-2xl backdrop-blur-sm shadow-sm">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="ค้นหาชื่อรายการ หรือคำอธิบาย..."
            className="w-full pl-11 pr-4 py-2.5 rounded-xl bg-slate-100/50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 focus:border-violet-500 dark:focus:border-violet-500 focus:ring-1 focus:ring-violet-500 outline-none transition-all text-sm text-slate-800 dark:text-slate-200"
          />
        </div>
      </div>

      {/* Main Kanban Board */}
      {isLoading ? (
        <div className="h-[60vh] flex flex-col items-center justify-center gap-3">
          <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-xs text-slate-400 font-semibold">กำลังดึงข้อมูล...</span>
        </div>
      ) : error ? (
        <div className="h-[40vh] flex flex-col items-center justify-center text-center p-6 border border-red-200/50 dark:border-red-900/30 bg-red-500/5 dark:bg-red-950/10 rounded-2xl gap-3">
          <AlertCircle className="w-8 h-8 text-red-500 dark:text-red-400" />
          <h3 className="text-sm font-bold text-red-700 dark:text-red-200">เกิดข้อผิดพลาดในการโหลดบอร์ดรายการ</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">{(error as any)?.message || 'โปรดตรวจสอบสิทธิ์เชื่อมต่อหรือรีเฟรชหน้าเว็บ'}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {columns.map((column) => {
            const columnItems = filteredItems.filter((item) => item.status === column.status);
            const isColumnHovered = activeDragColumn === column.status;

            return (
              <div
                key={column.status}
                onDragOver={handleDragOver}
                onDragEnter={(e) => handleDragEnter(e, column.status)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, column.status)}
                className={`flex flex-col rounded-2xl min-h-[60vh] p-4 transition-all duration-200 ${isColumnHovered
                  ? 'bg-violet-500/5 dark:bg-violet-500/10 border-2 border-dashed border-violet-500/40'
                  : 'bg-slate-100/40 dark:bg-slate-900/20 border border-slate-200 dark:border-slate-800/50'
                  }`}
              >
                {/* Column Title */}
                <div className="mb-4 pb-3 border-b border-slate-200 dark:border-slate-800/50 flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200 flex items-center gap-2">
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold tracking-wider uppercase ${column.colorClass}`}>
                        {columnItems.length}
                      </span>
                      <span>{column.title.split(' ')[0]}</span>
                    </h3>
                    <p className="text-[10px] text-slate-500 mt-0.5">{column.subtitle}</p>
                  </div>
                </div>

                {/* Cards List */}
                <div className="flex-1 space-y-3.5 overflow-y-auto max-h-[70vh] pr-1">
                  {columnItems.length === 0 ? (
                    <div className="h-28 border border-dashed border-slate-300 dark:border-slate-800 rounded-xl flex items-center justify-center text-center p-4">
                      <span className="text-[11px] text-slate-400 dark:text-slate-500 font-medium">ไม่มีรายการในสถานะนี้</span>
                    </div>
                  ) : (
                    columnItems.map((item) => (
                      <div
                        key={item.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, item.id)}
                        className={`group relative backdrop-blur-sm bg-white dark:bg-slate-900/55 border border-slate-200 dark:border-slate-800/80 rounded-xl p-4 shadow-sm hover:shadow-md dark:shadow-none hover:border-slate-400 dark:hover:border-slate-700/80 transition-all duration-200 flex flex-col justify-between gap-3 cursor-grab active:cursor-grabbing`}
                      >
                        {/* Image or File Attachment Preview */}
                        {item.image_url && (
                          isImageFile(item.image_url) ? (
                            <div className="relative w-full h-36 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-800 mb-2 shrink-0">
                              <Image
                                src={item.image_url}
                                alt={item.title}
                                fill
                                sizes="(max-width: 768px) 100vw, 30vw"
                                className="object-cover transition-transform duration-300 group-hover:scale-102"
                              />
                            </div>
                          ) : (
                            <div className="flex items-center gap-2.5 p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40 mb-2 shrink-0">
                              <FileText className="w-6 h-6 text-violet-500 shrink-0" />
                              <div className="min-w-0">
                                <p className="text-[9px] text-slate-500 uppercase font-extrabold leading-none">เอกสารแนบ</p>
                                <a
                                  href={item.image_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  className="text-xs font-bold text-violet-600 dark:text-violet-400 hover:underline truncate block mt-1"
                                >
                                  เปิดดูไฟล์แนบ
                                </a>
                              </div>
                            </div>
                          )
                        )}

                        {/* Title and Description */}
                        <div>
                          <h4 className="font-bold text-sm text-slate-800 dark:text-slate-200 group-hover:text-violet-600 dark:group-hover:text-violet-300 transition-colors line-clamp-1">
                            {item.title}
                          </h4>
                          {item.description && (
                            <p className="text-slate-500 dark:text-slate-400 text-xs mt-1 line-clamp-2 leading-relaxed">
                              {item.description}
                            </p>
                          )}
                        </div>

                        {/* Badges and Dates */}
                        <div className="space-y-1.5 pt-2 border-t border-slate-100 dark:border-slate-800/40">
                          {/* Reminder Badge */}
                          {item.reminder_date && (
                            <div className="flex items-center gap-1.5 text-[10px] text-amber-600 dark:text-amber-400 bg-amber-500/5 px-2 py-0.5 rounded-md w-fit font-semibold border border-amber-500/10">
                              <Clock className="w-3.5 h-3.5" />
                              <span>แจ้งเตือน: {new Date(item.reminder_date).toLocaleDateString('th-TH', { dateStyle: 'short' })}</span>
                            </div>
                          )}

                          {/* PO Date Badge */}
                          {item.po_date && (
                            <div className="flex items-center gap-1.5 text-[10px] text-violet-600 dark:text-violet-400 bg-violet-500/5 px-2 py-0.5 rounded-md w-fit font-semibold border border-violet-500/10">
                              <FileText className="w-3.5 h-3.5" />
                              <span>PO: {new Date(item.po_date).toLocaleDateString('th-TH', { dateStyle: 'short' })}</span>
                            </div>
                          )}

                          {/* Credit Term Badge */}
                          {item.credit_term && (
                            <div className="flex items-center gap-1.5 text-[10px] text-indigo-650 dark:text-indigo-400 bg-indigo-500/5 px-2 py-0.5 rounded-md w-fit font-semibold border border-indigo-500/10">
                              <CreditCard className="w-3.5 h-3.5" />
                              <span>เครดิต: {item.credit_term} วัน</span>
                            </div>
                          )}

                          {/* Budget Due Date Badge */}
                          {item.budget_due_date && (
                            <div className="flex items-center gap-1.5 text-[10px] text-emerald-650 dark:text-emerald-450 bg-emerald-500/10 px-2 py-0.5 rounded-md w-fit font-extrabold border border-emerald-500/20">
                              <Calendar className="w-3.5 h-3.5" />
                              <span>วันครบกำหนด: {new Date(item.budget_due_date).toLocaleDateString('th-TH', { dateStyle: 'short' })}</span>
                            </div>
                          )}
                        </div>

                        {/* Controls & Actions */}
                        <div className="flex items-center justify-end mt-1 pt-1.5 border-t border-slate-100 dark:border-slate-800/40">
                          {/* CRUD Actions */}
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleCompleteItem(item)}
                              className="p-1 rounded-md bg-slate-100 dark:bg-slate-800/50 hover:bg-emerald-100 dark:hover:bg-emerald-650/30 text-slate-500 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-450 transition-colors cursor-pointer"
                              title="ทำเครื่องหมายว่าสำเร็จ"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleEditItem(item)}
                              className="p-1 rounded-md bg-slate-100 dark:bg-slate-800/50 hover:bg-violet-100 dark:hover:bg-violet-650/30 text-slate-500 dark:text-slate-400 hover:text-violet-600 dark:hover:text-violet-300 transition-colors cursor-pointer"
                              title="แก้ไขรายการ"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeleteItem(item.id)}
                              className="p-1 rounded-md bg-slate-100 dark:bg-slate-800/50 hover:bg-red-100 dark:hover:bg-red-650/30 text-slate-500 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-450 transition-colors cursor-pointer"
                              title="ลบรายการ"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Form Modal */}
      {user && (
        <ItemModal
          isOpen={modalOpen}
          onClose={() => setModalOpen(false)}
          userId={user.id}
          itemToEdit={selectedItem}
        />
      )}

      {/* Toast Alert */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4 py-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-white shadow-2xl animate-slide-in backdrop-blur-md">
          <div className={`w-2 h-2 rounded-full ${toast.type === 'success' ? 'bg-emerald-500 animate-pulse' : 'bg-violet-500 animate-pulse'}`} />
          <span className="text-xs font-semibold leading-relaxed">{toast.message}</span>
        </div>
      )}
    </div>
  );
}
