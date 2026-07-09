'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/components/providers/auth-provider';
import { useTheme } from '@/components/providers/theme-provider';
import { ClipboardList, Calendar, LogOut, User as UserIcon, Menu, Sun, Moon, CheckSquare, Package } from 'lucide-react';
import Image from 'next/image';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, signOut, loading } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [sidebarOpen, setSidebarOpen] = React.useState(true);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100 transition-colors duration-200">
        <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const navItems = [
    {
      name: 'บอร์ดรายการ',
      href: '/dashboard',
      icon: ClipboardList,
    },
    {
      name: 'สต็อกสินค้า',
      href: '/stock',
      icon: Package,
    },
    {
      name: 'ปฏิทิน',
      href: '/calendar',
      icon: Calendar,
    },
    {
      name: 'รายการสำเร็จ',
      href: '/completed',
      icon: CheckSquare,
    },
  ];

  const userAvatar = user?.user_metadata?.avatar_url;
  const userName = user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email?.split('@')[0] || 'User';
  const userEmail = user?.email || '';

  return (
    <div className="min-h-screen flex bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100 transition-colors duration-200">
      <aside
        className={`${sidebarOpen ? 'w-72' : 'w-20'
          } shrink-0 bg-white dark:bg-slate-900/40 border-r border-slate-200 dark:border-slate-800/80 backdrop-blur-md transition-all duration-300 flex flex-col justify-between z-20`}
      >
        <div>
          {/* Header Branding */}
          <div className="p-6 flex items-center justify-between border-b border-slate-200 dark:border-slate-800/60">
            <div className="flex items-center gap-3 overflow-hidden">
              <div className="w-10 h-10 rounded-xl overflow-hidden flex items-center justify-center shadow-md shrink-0 bg-slate-100">
                <Image src="/Logo.png" alt="Logo" width={40} height={40} className="object-cover" />
              </div>
              {sidebarOpen && (
                <span className="font-bold text-lg bg-gradient-to-r from-violet-600 to-indigo-500 dark:from-violet-400 dark:to-indigo-200 bg-clip-text text-transparent truncate">
                  จำจด • JumJod
                </span>
              )}
            </div>
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800/50 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-750 dark:hover:text-slate-200 transition-colors"
            >
              <Menu className="w-4 h-4" />
            </button>
          </div>

          {/* Navigation Links */}
          <nav className="p-4 space-y-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-all duration-200 group relative ${isActive
                    ? 'bg-violet-600/10 dark:bg-violet-600/20 text-violet-600 dark:text-violet-400 border-l-4 border-violet-500'
                    : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/40 hover:text-slate-800 dark:hover:text-slate-200'
                    }`}
                >
                  <Icon className={`w-5 h-5 shrink-0 ${isActive ? 'text-violet-600 dark:text-violet-400' : 'text-slate-400 group-hover:text-slate-700 dark:group-hover:text-slate-200'}`} />
                  {sidebarOpen && <span className="truncate">{item.name}</span>}

                  {/* Tooltip when collapsed */}
                  {!sidebarOpen && (
                    <div className="absolute left-full ml-4 px-2.5 py-1.5 rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-800 dark:text-slate-100 opacity-0 scale-95 origin-left pointer-events-none group-hover:opacity-100 group-hover:scale-100 transition-all duration-150 shadow-xl whitespace-nowrap z-30">
                      {item.name}
                    </div>
                  )}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* User profile & Logout footer */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800/60 bg-slate-50 dark:bg-slate-900/10">

          {/* Theme Toggle Switcher */}
          <button
            onClick={toggleTheme}
            className="w-full flex items-center justify-center gap-2 mb-4 px-3 py-2 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800/40 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition-all duration-200 cursor-pointer border border-slate-200/50 dark:border-slate-800"
          >
            {theme === 'light' ? (
              <>
                <Moon className="w-3.5 h-3.5" />
                {sidebarOpen && <span>โหมดมืด (Dark Mode)</span>}
              </>
            ) : (
              <>
                <Sun className="w-3.5 h-3.5 text-amber-400 animate-spin-slow" />
                {sidebarOpen && <span>โหมดสว่าง (Light Mode)</span>}
              </>
            )}
          </button>

          <div className="flex items-center justify-between gap-3 overflow-hidden mb-4">
            <div className="flex items-center gap-3 min-w-0">
              {userAvatar ? (
                <Image
                  src={userAvatar}
                  alt={userName}
                  width={36}
                  height={36}
                  className="rounded-full border border-violet-500/30 shrink-0"
                />
              ) : (
                <div className="w-9 h-9 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center shrink-0">
                  <UserIcon className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                </div>
              )}
              {sidebarOpen && (
                <div className="min-w-0">
                  <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-200 truncate">{userName}</h4>
                  <p className="text-[10px] text-slate-500 truncate">{userEmail}</p>
                </div>
              )}
            </div>
          </div>
          <button
            onClick={signOut}
            className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs font-semibold bg-red-500/10 dark:bg-red-950/20 border border-red-200 dark:border-red-900/30 text-red-650 dark:text-red-400 hover:bg-red-500/20 dark:hover:bg-red-950/40 hover:border-red-300 dark:hover:border-red-900/50 transition-all duration-200 cursor-pointer"
          >
            <LogOut className="w-4 h-4 shrink-0" />
            {sidebarOpen && <span>ออกจากระบบ (Logout)</span>}
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 relative">
        {/* Background decorative glows */}
        <div className="absolute top-0 right-1/4 w-[500px] h-[500px] bg-violet-600/[0.03] dark:bg-violet-600/5 blur-[120px] rounded-full pointer-events-none -z-10" />
        <div className="absolute bottom-0 left-1/4 w-[500px] h-[500px] bg-emerald-600/[0.03] dark:bg-emerald-600/5 blur-[120px] rounded-full pointer-events-none -z-10" />

        <div className="flex-1 overflow-auto p-8 relative">
          {children}
        </div>
      </main>
    </div>
  );
}
