import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Search, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { EASE_OUT_EXPO } from './MotionPrimitives';

export interface PremiumSelectOption {
  value: string;
  label: string;
  subLabel?: string;
  badge?: string;
}

interface PremiumSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: PremiumSelectOption[];
  placeholder?: string;
  searchable?: boolean;
  searchPlaceholder?: string;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
}

export function PremiumSelect({
  value,
  onChange,
  options,
  placeholder = 'Select an option...',
  searchable,
  searchPlaceholder = 'Search...',
  disabled = false,
  className = '',
  ariaLabel,
}: PremiumSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const isSearchable = searchable ?? options.length > 8;

  const selectedOption = useMemo(
    () => options.find((opt) => opt.value === value),
    [options, value]
  );

  const filteredOptions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options.slice(0, 120);
    return options
      .filter(
        (opt) =>
          opt.label.toLowerCase().includes(q) ||
          (opt.subLabel && opt.subLabel.toLowerCase().includes(q)) ||
          opt.value.toLowerCase().includes(q)
      )
      .slice(0, 120);
  }, [options, query]);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  useEffect(() => {
    if (open && isSearchable) {
      const id = setTimeout(() => searchInputRef.current?.focus(), 20);
      return () => clearTimeout(id);
    }
    if (!open) {
      setQuery('');
    }
  }, [open, isSearchable]);

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        type="button"
        disabled={disabled}
        aria-label={ariaLabel}
        aria-expanded={open}
        onClick={() => !disabled && setOpen((prev) => !prev)}
        className={`w-full px-3 py-2 text-left text-xs rounded-xl border bg-white flex items-center justify-between gap-2 transition-all ${
          disabled
            ? 'opacity-60 cursor-not-allowed border-[#E2D8CE] bg-stone-50'
            : open
            ? 'border-[#EA580C] ring-2 ring-[#EA580C]/15 shadow-xs'
            : 'border-[#E2D8CE] hover:border-stone-400'
        }`}
      >
        <span
          className={`truncate ${
            selectedOption ? 'text-stone-900 font-medium' : 'text-stone-400'
          }`}
        >
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-stone-400 shrink-0 transition-transform duration-200 ${
            open ? 'rotate-180 text-[#EA580C]' : ''
          }`}
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.16, ease: EASE_OUT_EXPO }}
            className="absolute left-0 right-0 mt-1.5 min-w-[220px] bg-white border border-[#EAE2D9] rounded-xl shadow-[0_18px_40px_-12px_rgba(28,25,23,0.18)] z-50 overflow-hidden"
          >
            {isSearchable && (
              <div className="p-2 border-b border-[#F4ECE3] bg-[#FAF6F1]/70">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-stone-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={searchPlaceholder}
                    className="w-full pl-8 pr-7 py-1.5 text-xs bg-white border border-[#E2D8CE] rounded-lg focus:outline-none focus:border-[#EA580C]"
                  />
                  {query && (
                    <button
                      type="button"
                      onClick={() => setQuery('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-700"
                      aria-label="Clear search"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
            )}

            <div className="max-h-60 overflow-y-auto py-1 divide-y divide-[#FAF6F1]">
              {filteredOptions.length === 0 ? (
                <div className="px-3 py-4 text-xs text-stone-500 text-center">
                  No matching options
                </div>
              ) : (
                filteredOptions.map((opt) => {
                  const isSelected = opt.value === value;
                  return (
                    <button
                      key={`${opt.value}-${opt.label}`}
                      type="button"
                      onClick={() => {
                        onChange(opt.value);
                        setOpen(false);
                      }}
                      className={`w-full px-3 py-2 text-left flex items-center justify-between gap-2 transition-colors ${
                        isSelected
                          ? 'bg-orange-50/90 text-[#C2410C]'
                          : 'text-stone-700 hover:bg-[#FAF6F1] hover:text-stone-900'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <p
                          className={`text-xs truncate ${
                            isSelected ? 'font-semibold' : 'font-medium'
                          }`}
                        >
                          {opt.label}
                        </p>
                        {opt.subLabel && (
                          <p className="text-[11px] font-mono text-stone-400 truncate mt-0.5">
                            {opt.subLabel}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {opt.badge && (
                          <span className="text-[11px] font-mono text-stone-500">
                            {opt.badge}
                          </span>
                        )}
                        {isSelected && (
                          <Check className="w-3.5 h-3.5 text-[#EA580C]" />
                        )}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
