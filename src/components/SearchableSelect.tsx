"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { Search, ChevronDown, Check, X } from "lucide-react";

interface SearchableSelectProps {
  value: string;
  onChange: (val: string) => void;
  options: string[];
  placeholder: string;
  allOptionLabel?: string;
  disabled?: boolean;
  className?: string;
  dark?: boolean;
}

export function SearchableSelect({
  value,
  onChange,
  options,
  placeholder,
  allOptionLabel,
  disabled = false,
  className = "",
  dark = false,
}: SearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Reset query when dropdown closes
  useEffect(() => {
    if (!isOpen) {
      setQuery("");
    } else {
      setTimeout(() => searchInputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Filter options based on query
  const filteredOptions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((opt) => opt.toLowerCase().includes(q));
  }, [options, query]);

  function handleSelect(optionVal: string) {
    onChange(optionVal);
    setIsOpen(false);
  }

  const selectedText = value || placeholder;

  // Style classes based on dark/light mode
  const buttonBg = dark
    ? disabled
      ? "bg-navy-950/60 border-navy-800 text-slate-500 cursor-not-allowed"
      : "bg-navy-900 border-navy-700 text-white hover:bg-navy-850 focus:ring-1 focus:ring-amber-400 cursor-pointer"
    : disabled
    ? "bg-slate-100/70 border-slate-200 text-slate-400 cursor-not-allowed"
    : "bg-slate-50 border-slate-200 text-slate-800 hover:bg-slate-100 focus:bg-white focus:ring-2 focus:ring-amber-400/40 focus:border-amber-400 cursor-pointer";

  const popoverBg = dark
    ? "bg-navy-950 border-navy-800 text-white shadow-2xl"
    : "bg-white border-slate-200 text-slate-800 shadow-xl";

  const inputBg = dark
    ? "bg-navy-900 border-navy-700 text-white placeholder:text-slate-500 focus:ring-amber-400"
    : "bg-slate-50 border-slate-200 text-slate-800 placeholder:text-slate-400 focus:ring-amber-400";

  const optionHover = dark
    ? "hover:bg-navy-850 text-slate-200"
    : "hover:bg-slate-100 text-slate-700";

  const optionSelected = dark
    ? "bg-amber-400/20 text-amber-300 font-bold"
    : "bg-amber-50 text-amber-900 font-bold";

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      {/* Trigger Button */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen((prev) => !prev)}
        className={`w-full flex items-center justify-between border rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all ${buttonBg}`}
      >
        <span className="truncate pr-2">
          {value ? value : placeholder}
        </span>
        <ChevronDown size={14} className={`shrink-0 opacity-70 transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </button>

      {/* Searchable Dropdown Popover */}
      {isOpen && !disabled && (
        <div className={`absolute left-0 right-0 top-full mt-1.5 rounded-xl border p-2 z-50 min-w-[180px] ${popoverBg}`}>
          {/* Inner Search Box */}
          <div className="relative mb-2">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              ref={searchInputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search..."
              className={`w-full rounded-md border pl-8 pr-7 py-1 text-xs focus:outline-none focus:ring-1 transition-all ${inputBg}`}
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
              >
                <X size={12} />
              </button>
            )}
          </div>

          {/* Options List */}
          <div className="max-h-48 overflow-y-auto space-y-0.5 scrollbar-thin">
            {/* Clear / All Option */}
            {allOptionLabel && (
              <button
                type="button"
                onClick={() => handleSelect("")}
                className={`w-full flex items-center justify-between text-left px-2.5 py-1.5 rounded-md text-xs transition-colors italic ${
                  !value ? optionSelected : optionHover
                }`}
              >
                <span>{allOptionLabel}</span>
                {!value && <Check size={13} className="shrink-0 text-amber-400" />}
              </button>
            )}

            {filteredOptions.length === 0 ? (
              <div className="px-2.5 py-2 text-center text-xs text-slate-400 italic">
                No matching options
              </div>
            ) : (
              filteredOptions.map((opt) => {
                const isSelected = value === opt;
                return (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => handleSelect(opt)}
                    className={`w-full flex items-center justify-between text-left px-2.5 py-1.5 rounded-md text-xs transition-colors ${
                      isSelected ? optionSelected : optionHover
                    }`}
                  >
                    <span className="truncate">{opt}</span>
                    {isSelected && <Check size={13} className="shrink-0 text-amber-400" />}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
