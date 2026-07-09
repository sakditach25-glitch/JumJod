'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/components/providers/auth-provider';
import { StockItem } from '@/lib/types';
import { Plus, Search, Edit2, Trash2, AlertCircle, Package, Minus } from 'lucide-react';
import StockModal from '@/components/dashboard/stock-modal';

export default function StockPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const supabase = createClient();

  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState<'all' | 'อุปกรณ์สำนักงาน' | 'Laboratory'>('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedStock, setSelectedStock] = useState<StockItem | null>(null);

  // Fetch stocks using TanStack Query
  const { data: stocks = [], isLoading, error } = useQuery<StockItem[]>({
    queryKey: ['stocks'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('stocks')
        .select('*')
        .order('name', { ascending: true });

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
    if (confirm('คุณแน่ใจหรือไม่ว่าต้องการลบสินค้าชิ้นนี้ออกจากคลัง?')) {
      deleteStockMutation.mutate(id);
    }
  };

  const handleAdjustQuantity = (stock: StockItem, amount: number) => {
    const newQty = Math.max(0, stock.quantity + amount);
    adjustQuantityMutation.mutate({ id: stock.id, newQuantity: newQty });
  };

  // Filter items
  const filteredStocks = stocks.filter((stock) => {
    const matchesSearch = stock.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
      (stock.description && stock.description.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesCategory = filterCategory === 'all' || stock.category === filterCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="space-y-6">
      {/* Header Panel */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight bg-gradient-to-r from-slate-900 to-slate-700 dark:from-white dark:via-slate-100 dark:to-slate-400 bg-clip-text text-transparent">
            ระบบคลังสินค้า & สต็อก (Inventory & Stock)
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            ตรวจเช็กและจัดการยอดสต็อกอุปกรณ์สำนักงาน และงาน Laboratory ของคุณ
          </p>
        </div>
        <button
          onClick={handleAddStock}
          className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl font-bold bg-gradient-to-r from-violet-650 to-indigo-650 hover:from-violet-600 hover:to-indigo-600 text-white text-sm shadow-lg shadow-indigo-650/10 active:scale-[0.98] transition-all cursor-pointer shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>เพิ่มสินค้า</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3 p-3 bg-white dark:bg-slate-900/45 border border-slate-200 dark:border-slate-800/80 rounded-2xl backdrop-blur-sm shadow-sm">
        {/* Category switcher */}
        <div className="flex bg-slate-100 dark:bg-slate-950 p-1 rounded-xl border border-slate-200 dark:border-slate-800 shrink-0">
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

        {/* Search input */}
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="ค้นหาชื่อสินค้าคลัง หรือคำอธิบาย..."
            className="w-full pl-11 pr-4 py-2.5 rounded-xl bg-slate-100/50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 focus:border-violet-500 dark:focus:border-violet-500 focus:ring-1 focus:ring-violet-500 outline-none transition-all text-sm text-slate-800 dark:text-slate-200"
          />
        </div>
      </div>

      {/* Grid of Stock Items */}
      {isLoading ? (
        <div className="h-[50vh] flex flex-col items-center justify-center gap-3">
          <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-xs text-slate-400 font-semibold">กำลังโหลดข้อมูลสต็อก...</span>
        </div>
      ) : error ? (
        <div className="h-[40vh] flex flex-col items-center justify-center text-center p-6 border border-red-200/50 dark:border-red-900/30 bg-red-500/5 dark:bg-red-950/10 rounded-2xl gap-3">
          <AlertCircle className="w-8 h-8 text-red-500 dark:text-red-400" />
          <h3 className="text-sm font-bold text-red-700 dark:text-red-200">เกิดข้อผิดพลาดในการโหลดคลังสินค้า</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">{(error as any)?.message}</p>
        </div>
      ) : filteredStocks.length === 0 ? (
        <div className="h-[40vh] border border-dashed border-slate-350 dark:border-slate-800/80 rounded-2xl flex flex-col items-center justify-center text-center p-8 bg-white dark:bg-slate-900/10 gap-3">
          <Package className="w-10 h-10 text-slate-400 dark:text-slate-650" />
          <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300">ไม่มีรายการสินค้าในสต็อก</h3>
          <p className="text-xs text-slate-400 dark:text-slate-500 max-w-sm">
            {searchQuery ? 'ไม่พบคลังที่ตรงกับคำค้นหาของคุณ ลองใช้คำค้นอื่น' : 'ยังไม่มีสินค้าชิ้นใดในคลัง กดปุ่มเพิ่มสินค้าเพื่อสร้างรายการอ้างอิงใหม่'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-h-[calc(100vh-270px)] overflow-y-auto pr-1">
          {filteredStocks.map((stock) => (
            <div
              key={stock.id}
              className="group relative backdrop-blur-sm bg-white dark:bg-slate-900/55 border border-slate-200 dark:border-slate-800/80 rounded-2xl p-5 shadow-sm hover:shadow-md dark:shadow-none hover:border-slate-300 dark:hover:border-slate-700/80 transition-all duration-200 flex flex-col justify-between gap-4"
            >
              {/* Top Header */}
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className={`inline-block px-2.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wide ${
                    stock.category === 'Laboratory' 
                      ? 'text-emerald-700 dark:text-emerald-450 bg-emerald-500/10 border border-emerald-500/20' 
                      : 'text-violet-750 dark:text-violet-400 bg-violet-500/10 border border-violet-500/20'
                  }`}>
                    {stock.category === 'Laboratory' ? '🔬 Laboratory' : '💼 อุปกรณ์สำนักงาน'}
                  </span>
                  <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 font-mono text-[9px] font-extrabold text-slate-400 dark:text-slate-550 select-all shrink-0">
                    #stk-{stock.id.substring(stock.id.length - 3)}
                  </span>
                </div>

                <h3 className="font-bold text-base text-slate-800 dark:text-slate-100 mt-3 group-hover:text-violet-650 dark:group-hover:text-violet-400 transition-colors line-clamp-1">
                  {stock.name}
                </h3>
                
                {stock.description ? (
                  <p className="text-slate-500 dark:text-slate-400 text-xs mt-1.5 line-clamp-2 leading-relaxed">
                    {stock.description}
                  </p>
                ) : (
                  <p className="text-slate-400 dark:text-slate-600 text-xs mt-1.5 italic">ไม่มีรายละเอียดสินค้า</p>
                )}
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
                    <span className="text-lg font-black text-slate-800 dark:text-slate-100">{stock.quantity}</span>
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
                    className="p-2 rounded-lg bg-slate-50 hover:bg-violet-100 dark:bg-slate-850 dark:hover:bg-violet-650/20 text-slate-500 dark:text-slate-400 hover:text-violet-650 dark:hover:text-violet-400 transition-all cursor-pointer"
                    title="แก้ไขข้อมูลสินค้า"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDeleteStock(stock.id)}
                    className="p-2 rounded-lg bg-slate-50 hover:bg-red-100 dark:bg-slate-850 dark:hover:bg-red-650/20 text-slate-500 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 transition-all cursor-pointer"
                    title="ลบสินค้าออกจากคลัง"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
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
