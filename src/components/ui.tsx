import type { ReactNode } from 'react';
import { X } from 'lucide-react';

export function Modal({ title, onClose, children, maxWidth = 'max-w-lg' }: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  maxWidth?: string;
}) {
  return (
    <div className="fixed inset-0 md:top-16 md:left-64 md:bottom-12 z-50 flex items-center justify-center p-2 sm:p-6 bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className={`bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full ${maxWidth} max-h-[94dvh] md:max-h-full flex flex-col border border-slate-200 dark:border-slate-800`} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3.5 sm:p-5 border-b border-slate-100 dark:border-slate-800 flex-shrink-0">
          <h3 className="font-semibold text-slate-800 dark:text-slate-100 text-base sm:text-lg truncate pr-2">{title}</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 dark:text-slate-500 flex-shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4 sm:p-5 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

export const inputCls = 'w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 transition';

export function Field({ label, children, required }: { label: string; children: ReactNode; required?: boolean }) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1.5">
        {label}{required && <span className="text-rose-500"> *</span>}
      </label>
      {children}
    </div>
  );
}

export function EmptyState({ icon: Icon, text }: { icon: typeof X; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <Icon className="w-12 h-12 text-slate-300 dark:text-slate-600 mb-3" />
      <p className="text-sm text-slate-400 dark:text-slate-500">{text}</p>
    </div>
  );
}

export function Spinner({ className = '' }: { className?: string }) {
  return <div className={`border-3 border-slate-200 dark:border-slate-700 border-t-cyan-500 rounded-full animate-spin ${className}`} style={{ width: '2rem', height: '2rem' }} />;
}
