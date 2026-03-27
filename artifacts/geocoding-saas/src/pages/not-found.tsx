import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { MapPin } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-950 p-4 font-sans selection:bg-indigo-100 selection:text-indigo-900">
      <div className="p-5 bg-indigo-100 dark:bg-indigo-900/30 rounded-full mb-8 shadow-inner">
        <MapPin className="w-16 h-16 text-indigo-600 dark:text-indigo-400" />
      </div>
      <h1 className="text-6xl font-extrabold text-slate-900 dark:text-white font-display mb-4 tracking-tight">404</h1>
      <p className="text-xl text-slate-600 dark:text-slate-400 mb-10 font-medium text-center">
        迷路了吗？您访问的页面好像不存在。
      </p>
      <Link 
        href="/" 
        className="inline-flex items-center justify-center rounded-xl px-10 py-4 text-base font-bold bg-gradient-to-r from-indigo-500 to-blue-600 hover:from-indigo-600 hover:to-blue-700 text-white shadow-lg shadow-indigo-500/25 hover:shadow-indigo-500/40 hover:-translate-y-0.5 active:translate-y-0 transition-all"
      >
        返回主控台
      </Link>
    </div>
  );
}
