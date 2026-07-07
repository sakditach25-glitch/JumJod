'use client';

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Calendar as BigCalendar, momentLocalizer, Event as CalendarEvent } from 'react-big-calendar';
import moment from 'moment';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/components/providers/auth-provider';
import { useTheme } from '@/components/providers/theme-provider';
import { Item } from '@/lib/types';
import { 
  X, Calendar as CalendarIcon, Clock, 
  FileText, CreditCard, Image as ImageIcon, AlertCircle 
} from 'lucide-react';
import Image from 'next/image';

// Configure localizer for React Big Calendar
const localizer = momentLocalizer(moment);

interface CustomEvent extends CalendarEvent {
  id: string;
  type: 'reminder' | 'budget_due';
  item: Item;
}

export default function CalendarPage() {
  const { user } = useAuth();
  const { theme } = useTheme();
  const supabase = createClient();
  
  // Selected event state for detail drawer
  const [selectedEvent, setSelectedEvent] = useState<CustomEvent | null>(null);

  // Fetch items using TanStack Query
  const { data: items = [], isLoading, error } = useQuery<Item[]>({
    queryKey: ['items'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('items')
        .select('*');

      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.id,
  });

  // Map database items to calendar events
  const events: CustomEvent[] = [];

  items.forEach((item) => {
    // 1. Map Reminder Date
    if (item.reminder_date) {
      const remDate = new Date(item.reminder_date);
      // End date 1 hour after start
      const remEndDate = new Date(remDate.getTime() + 60 * 60 * 1000);
      
      events.push({
        id: `${item.id}-reminder`,
        title: `🔔 เตือน: ${item.title}`,
        start: remDate,
        end: remEndDate,
        allDay: false,
        type: 'reminder',
        item,
      });
    }

    // 2. Map Budget Due Date (PO Date + Credit Term)
    if (item.budget_due_date) {
      const dueDate = new Date(item.budget_due_date);
      events.push({
        id: `${item.id}-due`,
        title: `💰 ครบชำระ: ${item.title} (${item.credit_term} วัน)`,
        start: dueDate,
        end: dueDate,
        allDay: true,
        type: 'budget_due',
        item,
      });
    }
  });

  // Event Styling Customization
  const eventStyleGetter = (event: CustomEvent) => {
    const isDark = theme === 'dark';
    let backgroundColor = '';
    let textColor = '';
    let border = '';

    if (event.type === 'reminder') {
      backgroundColor = isDark ? 'rgba(217, 119, 6, 0.15)' : 'rgba(217, 119, 6, 0.08)'; // amber-600
      textColor = isDark ? '#fbbf24' : '#b45309'; // amber-400 / amber-700
      border = isDark ? '1px solid rgba(217, 119, 6, 0.3)' : '1px solid rgba(217, 119, 6, 0.2)';
    } else if (event.type === 'budget_due') {
      backgroundColor = isDark ? 'rgba(5, 150, 105, 0.15)' : 'rgba(5, 150, 105, 0.08)'; // emerald-600
      textColor = isDark ? '#34d399' : '#047857'; // emerald-400 / emerald-700
      border = isDark ? '1px solid rgba(5, 150, 105, 0.3)' : '1px solid rgba(5, 150, 105, 0.2)';
    }

    return {
      style: {
        backgroundColor,
        color: textColor,
        border,
        display: 'block',
      },
    };
  };

  return (
    <div className="space-y-6 min-h-[80vh] flex flex-col">
      {/* Header Panel */}
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-transparent dark:bg-gradient-to-r dark:from-white dark:via-slate-100 dark:to-slate-400 dark:bg-clip-text">
          ปฏิทินวางแผนจัดซื้อ & ความจำ (Procurement Calendar)
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
          ติดตามวันเตือนทำงานจัดซื้อ และวันครบกำหนดชำระจริง (PO Credit Terms)
        </p>
      </div>

      {/* Legend / Key indicator */}
      <div className="flex flex-wrap items-center gap-4 p-4 bg-white dark:bg-slate-900/30 border border-slate-200 dark:border-slate-800/80 rounded-2xl shadow-sm dark:shadow-none backdrop-blur-sm text-xs font-semibold">
        <span className="text-slate-500 dark:text-slate-400 font-bold">สัญลักษณ์กิจกรรม:</span>
        <div className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-400">
          <span className="w-2 h-2 rounded-full bg-amber-600 dark:bg-amber-400 animate-ping" />
          <span>🔔 วันแจ้งเตือนความจำ (Reminder Dates)</span>
        </div>
        <div className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-400">
          <span className="w-2 h-2 rounded-full bg-emerald-600 dark:bg-emerald-400 animate-ping" />
          <span>💰 วันชำระเงินเครดิตเทอม (Budget Due Dates)</span>
        </div>
      </div>

      {/* Main Calendar View Container */}
      <div className="flex-1 min-h-[550px] relative">
        {isLoading ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-950/20 z-10">
            <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-xs text-slate-400 font-semibold">กำลังโหลดข้อมูลปฏิทิน...</span>
          </div>
        ) : error ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6 border border-red-900/30 bg-red-950/10 rounded-2xl gap-3">
            <AlertCircle className="w-8 h-8 text-red-400" />
            <h3 className="text-sm font-bold text-red-200">เกิดข้อผิดพลาดในการโหลดปฏิทิน</h3>
            <p className="text-xs text-slate-400">{(error as any)?.message}</p>
          </div>
        ) : (
          <div className="h-full bg-white dark:bg-slate-950/20 rounded-2xl shadow-sm dark:shadow-none border border-slate-200/50 dark:border-slate-800/20">
            <BigCalendar
              localizer={localizer}
              events={events}
              startAccessor="start"
              endAccessor="end"
              style={{ height: 600 }}
              eventPropGetter={eventStyleGetter as any}
              onSelectEvent={(event) => setSelectedEvent(event as CustomEvent)}
              messages={{
                next: 'ถัดไป',
                previous: 'ก่อนหน้า',
                today: 'วันนี้',
                month: 'เดือน',
                week: 'สัปดาห์',
                day: 'วัน',
                agenda: 'รายละเอียดกิจกรรม',
              }}
            />
          </div>
        )}
      </div>

      {/* Detail Overlay Drawer */}
      {selectedEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-end">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm transition-opacity"
            onClick={() => setSelectedEvent(null)}
          />
          
          {/* Drawer Container */}
          <div className="relative w-full max-w-md h-full bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 shadow-2xl p-6 flex flex-col justify-between z-10 animate-slide-in">
            <div>
              {/* Close and Title */}
              <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800/80 mb-6">
                <h2 className="text-lg font-bold bg-gradient-to-r from-violet-650 to-indigo-650 dark:from-violet-400 dark:to-indigo-200 bg-clip-text text-transparent">
                  รายละเอียดกิจกรรมจัดซื้อ
                </h2>
                <button
                  onClick={() => setSelectedEvent(null)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Event specific type indicator */}
              <div className="mb-6">
                {selectedEvent.type === 'reminder' ? (
                  <div className="flex items-center gap-2 p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-400">
                    <Clock className="w-5 h-5" />
                    <div>
                      <h4 className="text-xs font-bold uppercase tracking-wider">วันแจ้งเตือนการจัดการ</h4>
                      <p className="text-[11px] text-amber-600 dark:text-amber-450/80 mt-0.5 font-semibold">
                        {moment(selectedEvent.start).format('DD MMMM YYYY, HH:mm น.')}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-400">
                    <CalendarIcon className="w-5 h-5" />
                    <div>
                      <h4 className="text-xs font-bold uppercase tracking-wider">วันครบกำหนดชำระจริง</h4>
                      <p className="text-[11px] text-emerald-600 dark:text-emerald-450/80 mt-0.5 font-semibold">
                        {moment(selectedEvent.start).format('DD MMMM YYYY')} (ชำระตามเครดิตเทอม)
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Core Item Parameters */}
              <div className="space-y-5">
                <div>
                  <label className="block text-[10px] font-bold text-slate-450 dark:text-slate-500 uppercase tracking-wider mb-1">
                    หัวข้อรายการ
                  </label>
                  <p className="text-base font-bold text-slate-800 dark:text-slate-100">{selectedEvent.item.title}</p>
                </div>

                {selectedEvent.item.description && (
                  <div>
                    <label className="block text-[10px] font-bold text-slate-450 dark:text-slate-500 uppercase tracking-wider mb-1">
                      รายละเอียด
                    </label>
                    <p className="text-xs text-slate-600 dark:text-slate-350 leading-relaxed bg-slate-50 dark:bg-slate-950/40 p-3 rounded-xl border border-slate-200/50 dark:border-slate-800/40">
                      {selectedEvent.item.description}
                    </p>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-450 dark:text-slate-500 uppercase tracking-wider mb-1">
                      สถานะงานปัจจุบัน
                    </label>
                    <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-extrabold tracking-wide uppercase ${
                      selectedEvent.item.status === 'Pending' ? 'text-amber-700 bg-amber-500/10' :
                      selectedEvent.item.status === 'Purchasing' ? 'text-violet-700 dark:text-violet-400 bg-violet-500/10' :
                      'text-emerald-700 dark:text-emerald-400 bg-emerald-500/10'
                    }`}>
                      {selectedEvent.item.status === 'Pending' ? 'กำลังดำเนินการ' :
                       selectedEvent.item.status === 'Purchasing' ? 'ติดต่อจัดซื้อ' :
                       'กำลังออก ITEM'}
                    </span>
                  </div>

                  {selectedEvent.item.credit_term && (
                    <div>
                      <label className="block text-[10px] font-bold text-slate-450 dark:text-slate-500 uppercase tracking-wider mb-1">
                        เงื่อนไขเครดิตชำระ
                      </label>
                      <span className="flex items-center gap-1 text-xs text-indigo-600 dark:text-indigo-400 font-bold">
                        <CreditCard className="w-3.5 h-3.5" />
                        <span>{selectedEvent.item.credit_term} วัน</span>
                      </span>
                    </div>
                  )}
                </div>

                {selectedEvent.item.po_date && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                        วันที่ออก PO
                      </label>
                      <span className="flex items-center gap-1 text-xs text-slate-300 font-medium">
                        <FileText className="w-3.5 h-3.5 text-slate-500" />
                        <span>{moment(selectedEvent.item.po_date).format('DD/MM/YYYY')}</span>
                      </span>
                    </div>
                    {selectedEvent.item.budget_due_date && (
                      <div>
                        <label className="block text-[10px] font-bold text-slate-450 dark:text-slate-500 uppercase tracking-wider mb-1">
                          วันที่จ่ายเงินจริง
                        </label>
                        <span className="flex items-center gap-1 text-xs text-emerald-650 dark:text-emerald-400 font-bold">
                          <CalendarIcon className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-500" />
                          <span>{moment(selectedEvent.item.budget_due_date).format('DD/MM/YYYY')}</span>
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* Uploaded image details */}
                {selectedEvent.item.image_url && (
                  <div>
                    <label className="block text-[10px] font-bold text-slate-450 dark:text-slate-500 uppercase tracking-wider mb-1.5">
                      เอกสารแนบประกอบ
                    </label>
                    <div className="relative w-full h-40 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800">
                      <Image
                        src={selectedEvent.item.image_url}
                        alt={selectedEvent.item.title}
                        fill
                        sizes="100vw"
                        className="object-cover"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Footer Close */}
            <div className="pt-4 border-t border-slate-200 dark:border-slate-800/80">
              <button
                onClick={() => setSelectedEvent(null)}
                className="w-full py-2.5 rounded-xl font-bold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-200 text-xs transition-all duration-200 cursor-pointer"
              >
                ปิดหน้าต่างรายละเอียด
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
