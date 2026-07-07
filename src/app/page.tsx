import Image from 'next/image';

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-950 text-slate-100">
      <div className="flex flex-col items-center gap-4">
        <div className="w-16 h-16 rounded-2xl overflow-hidden bg-slate-150 flex items-center justify-center shadow-lg shadow-indigo-500/20 animate-pulse">
          <Image src="/Logo.png" alt="Logo" width={64} height={64} className="object-cover" />
        </div>
        <h1 className="text-xl font-bold bg-gradient-to-r from-violet-400 to-indigo-200 bg-clip-text text-transparent">
          จำจด • JumJod
        </h1>
        <div className="w-6 h-6 border-2 border-violet-500 border-t-transparent rounded-full animate-spin mt-2" />
      </div>
    </div>
  );
}
