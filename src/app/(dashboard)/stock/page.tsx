'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/components/providers/auth-provider';
import { StockItem } from '@/lib/types';
import { Plus, Search, Edit2, Trash2, AlertCircle, Package, Minus, ArrowUpDown, AlertTriangle } from 'lucide-react';
import StockModal from '@/components/dashboard/stock-modal';

export default function StockPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const supabase = createClient();

  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState<'all' | 'อุปกรณ์สำนักงาน' | 'Laboratory'>('all');
  const [sortBy, setSortBy] = useState<'name-asc' | 'priority-desc' | 'alert-first' | 'qty-asc'>('name-asc');
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedStock, setSelectedStock] = useState<StockItem | null>(null);

  // Fetch stocks using TanStack Query
  const { data: stocks = [], isLoading, error } = useQuery<StockItem[]>({
    queryKey: ['stocks'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('stocks')
        .select('*');

      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.id,
  });

  // Adjust quantity mutation
  const adjustQuantityMutation = useMutation({
    mutationFn: async ({ id, newQuantity }: { id: string; newQuantity: number }) => {
      const { error } = await supabase
        .from('stocks')
        .update({ quantity: Math.max(0, newQuantity), updated_at: new Date().toISOString() })
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stocks'] });
    },
  });

  // Delete stock item mutation
  const deleteStockMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('stocks')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stocks'] });
    },
  });

  const handleAddStock = () => {
    setSelectedStock(null);
    setModalOpen(true);
  };

  const handleEditStock = (stock: StockItem) => {
    setSelectedStock(stock);
    setModalOpen(true);
  };

  const handleDeleteStock = (id: string) => {
    if (confirm('คุณแน่ใจหรือไม่ว่าต้องการลบวัสดุชิ้นนี้ออกจากคลัง?')) {
      deleteStockMutation.mutate(id);
    }
  };

  const handleAdjustQuantity = (stock: StockItem, amount: number) => {
    const newQty = Math.max(0, stock.quantity + amount);
    adjustQuantityMutation.mutate({ id: stock.id, newQuantity: newQty });
  };

  const handleToggleCategory = (stock: StockItem) => {
    const newCategory = stock.category === 'Laboratory' ? 'อุปกรณ์สำนักงาน' : 'Laboratory';
    supabase
      .from('stocks')
      .update({ category: newCategory, updated_at: new Date().toISOString() })
      .eq('id', stock.id)
      .then(({ error }) => {
        if (!error) {
          queryClient.invalidateQueries({ queryKey: ['stocks'] });
        }
      });
  };

  // Filter items
  const filteredStocks = stocks.filter((stock) => {
    const matchesSearch = stock.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
      (stock.description && stock.description.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesCategory = filterCategory === 'all' || stock.category === filterCategory;
    return matchesSearch && matchesCategory;
  });

  // Sort items
  const sortedStocks = [...filteredStocks].sort((a, b) => {
    if (sortBy === 'name-asc') {
      return a.name.localeCompare(b.name, 'th');
    }
    if (sortBy === 'qty-asc') {
      return a.quantity - b.quantity;
    }
    if (sortBy === 'priority-desc') {
      const priorityWeight = { High: 3, Medium: 2, Low: 1 };
      return (priorityWeight[b.priority] || 2) - (priorityWeight[a.priority] || 2);
    }
    if (sortBy === 'alert-first') {
      const aAlert = a.quantity <= (a.min_threshold ?? 0) ? 1 : 0;
      const bAlert = b.quantity <= (b.min_threshold ?? 0) ? 1 : 0;
      if (aAlert !== bAlert) return bAlert - aAlert; // Alerts first
      return a.quantity - b.quantity; // Then ascending quantity
    }
    return 0;
  });

  return (
    <div className="space-y-6">
      {/* Header Panel */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight bg-gradient-to-r from-slate-900 to-slate-700 dark:from-white dark:via-slate-100 dark:to-slate-400 bg-clip-text text-transparent">
            ระบบคลังวัสดุ & สต็อก (Inventory & Stock)
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            ตรวจเช็กและจัดการยอดสต็อกวัสดุสำนักงาน และงาน Laboratory ของคุณ
          </p>
        </div>
        <button
          onClick={handleAddStock}
          className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl font-bold bg-gradient-to-r from-violet-650 to-indigo-650 hover:from-violet-600 hover:to-indigo-600 text-white text-sm shadow-lg shadow-indigo-650/10 active:scale-[0.98] transition-all cursor-pointer shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>เพิ่มวัสดุ</span>
        </button>
      </div>

      {/* Filter, Search and Sorting Bar */}
      <div className="flex flex-col xl:flex-row xl:items-center gap-4 p-4 bg-white dark:bg-slate-900/45 border border-slate-200 dark:border-slate-800/80 rounded-2xl backdrop-blur-sm shadow-sm">
        
        {/* Category switcher */}
        <div className="flex bg-slate-100 dark:bg-slate-950 p-1 rounded-xl border border-slate-200 dark:border-slate-800 shrink-0 self-start xl:self-auto">
          <button
            onClick={() => setFilterCategory('all')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              filterCategory === 'all'
                ? 'bg-white dark:bg-slate-900 text-violet-650 dark:text-violet-400 shadow-sm'
                : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
            }`}
          >
            ทั้งหมด
          </button>
          <button
            onClick={() => setFilterCategory('อุปกรณ์สำนักงาน')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              filterCategory === 'อุปกรณ์สำนักงาน'
                ? 'bg-white dark:bg-slate-900 text-violet-650 dark:text-violet-400 shadow-sm'
                : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
            }`}
          >
            อุปกรณ์สำนักงาน
          </button>
          <button
            onClick={() => setFilterCategory('Laboratory')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              filterCategory === 'Laboratory'
                ? 'bg-white dark:bg-slate-900 text-violet-650 dark:text-violet-400 shadow-sm'
                : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
            }`}
          >
            Laboratory
          </button>
        </div>

        {/* Sorting Dropdown */}
        <div className="flex items-center gap-2 shrink-0">
          <ArrowUpDown className="w-4 h-4 text-slate-400 dark:text-slate-500" />
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-650 dark:text-slate-350 focus:border-violet-500 outline-none transition-all"
          >
            <option value="name-asc">🔤 เรียงตามชื่อ (ก-ฮ)</option>
            <option value="priority-desc">🚨 เรียงตามลำดับความสำคัญ (ด่วนที่สุด)</option>
            <option value="alert-first">⚠️ จัดสินค้าใกล้หมดขึ้นก่อน</option>
            <option value="qty-asc">📦 เรียงตามยอดน้อยไปมาก</option>
          </select>
        </div>

        {/* Search input */}
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="ค้นหาชื่อวัสดุ หรือรายละเอียด..."
            className="w-full pl-11 pr-4 py-2.5 rounded-xl bg-slate-100/50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 focus:border-violet-500 dark:focus:border-violet-500 focus:ring-1 focus:ring-violet-500 outline-none transition-all text-sm text-slate-800 dark:text-slate-200"
          />
        </div>
      </div>

      {/* Grid of Stock Items */}
      {isLoading ? (
        <div className="h-[50vh] flex flex-col items-center justify-center gap-3">
          <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-xs text-slate-400 font-semibold">กำลังโหลดข้อมูลสต็อกวัสดุ...</span>
        </div>
      ) : error ? (
        <div className="h-[40vh] flex flex-col items-center justify-center text-center p-6 border border-red-200/50 dark:border-red-900/30 bg-red-500/5 dark:bg-red-950/10 rounded-2xl gap-3">
          <AlertCircle className="w-8 h-8 text-red-500 dark:text-red-400" />
          <h3 className="text-sm font-bold text-red-700 dark:text-red-200">เกิดข้อผิดพลาดในการโหลดคลังวัสดุ</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">{(error as any)?.message}</p>
        </div>
      ) : sortedStocks.length === 0 ? (
        <div className="h-[40vh] border border-dashed border-slate-350 dark:border-slate-800/80 rounded-2xl flex flex-col items-center justify-center text-center p-8 bg-white dark:bg-slate-900/10 gap-3">
          <Package className="w-10 h-10 text-slate-400 dark:text-slate-650" />
          <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300">ไม่มีรายการวัสดุในคลัง</h3>
          <p className="text-xs text-slate-400 dark:text-slate-500 max-w-sm">
            {searchQuery ? 'ไม่พบวัสดุที่ตรงกับคำค้นหาของคุณ ลองใช้คำค้นอื่น' : 'ยังไม่มีวัสดุชิ้นใดในคลัง กดปุ่มเพิ่มวัสดุเพื่อสร้างรายการอ้างอิงใหม่'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-h-[calc(100vh-270px)] overflow-y-auto pr-1">
          {sortedStocks.map((stock) => {
            const isAlert = stock.quantity <= (stock.min_threshold ?? 0);
            
            // Priority Tag Style
            let priorityBadgeColor = 'text-slate-600 bg-slate-100 border-slate-200 dark:text-slate-300 dark:bg-slate-800 dark:border-slate-700';
            let priorityLabel = 'ทั่วไป (Low)';
            if (stock.priority === 'High') {
              priorityBadgeColor = 'text-red-700 bg-red-500/10 border-red-500/20 dark:text-red-400 dark:bg-red-500/10 dark:border-red-500/20';
              priorityLabel = 'ด่วนมาก (High) 🔴';
            } else if (stock.priority === 'Medium') {
              priorityBadgeColor = 'text-amber-700 bg-amber-500/10 border-amber-500/20 dark:text-amber-400 dark:bg-amber-500/10 dark:border-amber-500/20';
              priorityLabel = 'ปานกลาง (Medium) 🟡';
            }

            return (
              <div
                key={stock.id}
                className={`group relative backdrop-blur-sm bg-white dark:bg-slate-900/55 border rounded-2xl p-5 shadow-sm hover:shadow-md dark:shadow-none hover:border-slate-300 dark:hover:border-slate-700/80 transition-all duration-200 flex flex-col justify-between gap-4 ${
                  isAlert 
                    ? 'border-red-300 bg-red-50/20 dark:border-red-950/40 dark:bg-red-950/5' 
                    : 'border-slate-200 dark:border-slate-800/80'
                }`}
              >
                {/* Top Header */}
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className={`inline-block px-2.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wide ${
                        stock.category === 'Laboratory' 
                          ? 'text-emerald-700 dark:text-emerald-450 bg-emerald-500/10 border border-emerald-500/20' 
                          : 'text-violet-750 dark:text-violet-400 bg-violet-500/10 border border-violet-500/20'
                      }`}>
                        {stock.category === 'Laboratory' ? '🔬 Laboratory' : '💼 อุปกรณ์สำนักงาน'}
                      </span>
                      <button
                        onClick={() => handleToggleCategory(stock)}
                        className="px-2 py-0.5 border border-slate-200 dark:border-slate-800 rounded-lg text-[9px] font-bold text-slate-500 dark:text-slate-400 hover:text-violet-650 hover:bg-slate-100 dark:hover:bg-slate-850 cursor-pointer transition-colors"
                        title="ย้ายหมวดหมู่"
                      >
                        🔁 {stock.category === 'Laboratory' ? 'ย้ายไป สำนักงาน' : 'ย้ายไป Lab'}
                      </button>
                    </div>
                    <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 font-mono text-[9px] font-extrabold text-slate-400 dark:text-slate-550 select-all shrink-0">
                      #stk-{stock.id.substring(stock.id.length - 3)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-2 mt-3">
                    <h3 className="font-bold text-base text-slate-800 dark:text-slate-100 group-hover:text-violet-650 dark:group-hover:text-violet-400 transition-colors line-clamp-1 flex-1">
                      {stock.name}
                    </h3>
                    <span className={`px-2 py-0.5 border rounded-lg text-[9px] font-extrabold select-none shrink-0 ${priorityBadgeColor}`}>
                      {priorityLabel}
                    </span>
                  </div>
                  
                  {stock.description ? (
                    <p className="text-slate-500 dark:text-slate-400 text-xs mt-1.5 line-clamp-2 leading-relaxed">
                      {stock.description}
                    </p>
                  ) : (
                    <p className="text-slate-400 dark:text-slate-650 text-xs mt-1.5 italic">ไม่มีรายละเอียดวัสดุ</p>
                  )}

                  {/* Threshold & Alarm indicator */}
                  <div className="mt-3.5 flex items-center justify-between">
                    <span className="text-[10px] text-slate-400 dark:text-slate-500 font-semibold">
                      เกณฑ์ควรสั่งซื้อเพิ่ม: {stock.min_threshold ?? 0} {stock.unit}
                    </span>
                    {isAlert && (
                      <span className="flex items-center gap-1 text-[10px] font-black text-red-650 dark:text-red-400 bg-red-500/15 px-2 py-0.5 rounded-full select-none animate-pulse">
                        <AlertTriangle className="w-3 h-3 shrink-0" />
                        <span>ควรสั่งซื้อเพิ่ม!</span>
                      </span>
                    )}
                  </div>
                </div>

                {/* Quantity Adjuster & Actions */}
                <div className="pt-3 border-t border-slate-100 dark:border-slate-800/40 flex items-center justify-between gap-3 shrink-0">
                  {/* Quantity Control Panel */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleAdjustQuantity(stock, -1)}
                      disabled={stock.quantity <= 0 || adjustQuantityMutation.isPending}
                      className="w-8 h-8 rounded-lg flex items-center justify-center bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-750 text-slate-500 dark:text-slate-400 disabled:opacity-40 disabled:pointer-events-none transition-colors cursor-pointer"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    
                    <div className="text-center min-w-16">
                      <span className={`text-lg font-black transition-colors ${
                        isAlert ? 'text-red-605 dark:text-red-400' : 'text-slate-800 dark:text-slate-100'
                      }`}>{stock.quantity}</span>
                      <span className="text-[10px] text-slate-400 dark:text-slate-500 font-bold block leading-none">{stock.unit}</span>
                    </div>

                    <button
                      onClick={() => handleAdjustQuantity(stock, 1)}
                      disabled={adjustQuantityMutation.isPending}
                      className="w-8 h-8 rounded-lg flex items-center justify-center bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-750 text-slate-500 dark:text-slate-400 disabled:opacity-40 disabled:pointer-events-none transition-colors cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Edit & Delete Actions */}
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => handleEditStock(stock)}
                      className="p-2 rounded-lg bg-slate-55 dark:bg-slate-850 hover:bg-violet-100 dark:hover:bg-violet-650/20 text-slate-500 dark:text-slate-400 hover:text-violet-650 dark:hover:text-violet-400 transition-all cursor-pointer"
                      title="แก้ไขข้อมูลวัสดุ"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDeleteStock(stock.id)}
                      className="p-2 rounded-lg bg-slate-55 dark:bg-slate-850 hover:bg-red-100 dark:hover:bg-red-650/20 text-slate-500 dark:text-slate-400 hover:text-red-650 dark:hover:text-red-400 transition-all cursor-pointer"
                      title="ลบวัสดุออกจากคลัง"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Stock Modal */}
      {user && (
        <StockModal
          isOpen={modalOpen}
          onClose={() => setModalOpen(false)}
          userId={user.id}
          stockToEdit={selectedStock}
        />
      )}
    </div>
  );
}
