
import React from 'react';
import { IconCheck, IconX, IconEdit, IconEye, IconEyeOff } from '../constants';

// Notion-style Card
export const Card: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <div className={`bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-lg shadow-sm hover:shadow-md transition-shadow duration-200 ${className}`}>
    {children}
  </div>
);

// Notion-style Callout
export const Callout: React.FC<{ icon: string; children: React.ReactNode; color?: 'gray' | 'blue' | 'red' }> = ({ icon, children, color = 'gray' }) => {
  const bgColors = {
    gray: 'bg-gray-50 dark:bg-zinc-800/50 border-gray-100 dark:border-zinc-800 text-gray-800 dark:text-gray-200',
    blue: 'bg-blue-50 dark:bg-blue-900/20 border-blue-100 dark:border-blue-900/30 text-gray-800 dark:text-gray-200',
    red: 'bg-red-50 dark:bg-red-900/20 border-red-100 dark:border-red-900/30 text-gray-800 dark:text-gray-200'
  };

  return (
    <div className={`flex p-4 rounded-md border ${bgColors[color]} mb-4`}>
      <div className="mr-3 text-xl select-none">{icon}</div>
      <div className="text-sm leading-6">{children}</div>
    </div>
  );
};

// Notion-style Toggle
export const Toggle: React.FC<{ title: string; children: React.ReactNode; defaultOpen?: boolean }> = ({ title, children, defaultOpen = false }) => {
  const [isOpen, setIsOpen] = React.useState(defaultOpen);

  return (
    <div className="mb-2">
      <button 
        onClick={() => setIsOpen(!isOpen)} 
        className="flex items-center gap-2 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-zinc-800 px-2 py-1 rounded w-full text-left transition-colors select-none group"
      >
        <span className={`transform transition-transform text-gray-500 dark:text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300 ${isOpen ? 'rotate-90' : 'rotate-0'}`}>
           ▶
        </span>
        <span className="font-semibold text-sm">{title}</span>
      </button>
      {isOpen && (
        <div className="pl-6 mt-1 border-l border-gray-200 dark:border-zinc-800 ml-2.5">
          {children}
        </div>
      )}
    </div>
  );
};

// Notion-style Button
export const Button: React.FC<{
  children: React.ReactNode;
  onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  variant?: 'primary' | 'secondary' | 'ghost';
  className?: string;
  disabled?: boolean;
  title?: string;
}> = ({ children, onClick, variant = 'primary', className = '', disabled = false, title }) => {
  const baseStyle = "px-3 py-1.5 rounded text-sm font-medium transition-colors duration-150 flex items-center gap-2 select-none";
  const variants = {
    primary: "bg-black dark:bg-white text-white dark:text-black hover:bg-gray-800 dark:hover:bg-gray-200 disabled:bg-gray-300 dark:disabled:bg-gray-700",
    secondary: "bg-white dark:bg-zinc-800 border border-gray-300 dark:border-zinc-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-zinc-700 disabled:bg-gray-100 disabled:text-gray-400",
    ghost: "bg-transparent text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-zinc-800 disabled:text-gray-300"
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`${baseStyle} ${variants[variant]} ${className}`}
      title={title}
    >
      {children}
    </button>
  );
};

// Notion-style Header
export const PageHeader: React.FC<{ icon?: string; coverImage?: string; title: React.ReactNode }> = ({ icon, coverImage, title }) => (
  <div className="mb-8 group">
    {coverImage && (
      <div className="h-40 w-full overflow-hidden rounded-t-lg mb-8 relative">
        <img src={coverImage} alt="Cover" className="w-full h-full object-cover" loading="lazy" decoding="async" />
      </div>
    )}
    <div className="relative px-2">
      {icon && <div className={`text-6xl mb-4 relative z-10 ${coverImage ? '-mt-16' : ''}`}>{icon}</div>}
      <h1 className="text-3xl sm:text-4xl font-bold text-gray-800 dark:text-gray-100 tracking-tight">{title}</h1>
      <div className="h-[1px] bg-gray-200 dark:bg-zinc-800 mt-4 w-full"></div>
    </div>
  </div>
);

// Notion-style Property Row with Editing
interface PropertyRowProps {
  label: string;
  value: string | number | null;
  icon?: React.ReactNode;
  isEditable?: boolean;
  isEditing?: boolean;
  editValue?: string | number;
  onEdit?: () => void;
  onEditChange?: (val: string) => void;
  onSave?: () => void;
  onCancel?: () => void;
  inputType?: 'text' | 'number' | 'textarea' | 'select';
  options?: string[];
  isHidden?: boolean;
  onToggleVisibility?: () => void;
  editor?: React.ReactNode;       // replaces the built-in input while editing
  displayValue?: string;          // shown instead of value when not editing
  editorNote?: React.ReactNode;   // under the input while editing (a hint, a draft button)
}

export const PropertyRow: React.FC<PropertyRowProps> = React.memo(({ 
  label, value, icon, 
  isEditable = false, 
  isEditing = false, 
  editValue = '', 
  onEdit, 
  onEditChange, 
  onSave, 
  onCancel,
  inputType = 'text',
  options = [],
  isHidden = false,
  onToggleVisibility,
  editor,
  displayValue,
  editorNote,
}) => {
  const isEmpty = value === null || value === undefined || value === '';
  // A long answer being written gets the whole width on a phone, under its label
  const stacked = isEditing && inputType === 'textarea';

  return (
    // The label takes 2/5 of a phone's width (a fixed column on wider screens);
    // values wrap rather than being cut off, and the edit buttons always show
    // on touch screens, which have no hover
    <div
      data-label={label}
      className={`flex gap-3 py-2 ${stacked ? 'flex-col sm:flex-row items-stretch sm:items-start' : 'items-start'} border-b border-gray-50 dark:border-zinc-800/50 last:border-0 hover:bg-gray-50 dark:hover:bg-zinc-800/50 px-2 rounded-sm transition-colors group min-h-[40px] ${isHidden ? 'opacity-60 bg-gray-50/50 dark:bg-zinc-800/30' : ''}`}
    >
      <div className={`${stacked ? 'w-full' : 'w-2/5'} sm:w-48 flex-none min-w-0 text-gray-500 dark:text-gray-400 text-sm flex items-center gap-2 pt-1.5`}>
        {icon && <span className="text-gray-500 dark:text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300 transition-colors w-4 h-4">{icon}</span>}
        <span className="min-w-0 break-words">
          {isEmpty && !isEditing ? (
            // The dot stays with the label's last word when the label wraps
            <>
              {label.includes(' ') && `${label.slice(0, label.lastIndexOf(' '))} `}
              <span className="whitespace-nowrap">
                {label.slice(label.lastIndexOf(' ') + 1)}
                <span className="inline-block align-middle ml-1.5 w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" title="This field is empty" />
              </span>
            </>
          ) : label}
        </span>
      </div>

      <div className="flex-1 text-gray-800 dark:text-gray-200 text-sm font-medium flex items-start justify-between gap-2 min-w-0">
        {isEditing ? (
          <div className="flex items-start gap-2 w-full min-w-0">
            <div className="flex-1 min-w-0 flex flex-col gap-1.5">
            {editor ? (
                <div className="min-w-0">{editor}</div>
            ) : inputType === 'textarea' ? (
                <textarea
                  value={editValue}
                  onChange={(e) => onEditChange && onEditChange(e.target.value)}
                  className="w-full min-w-0 bg-white dark:bg-zinc-900 border border-gray-300 dark:border-zinc-700 rounded px-2 py-1.5 text-sm focus:ring-1 focus:ring-black dark:focus:ring-white focus:border-black dark:focus:border-white outline-none text-gray-900 dark:text-gray-100 min-h-[80px]"
                  autoFocus
                />
            ) : inputType === 'select' ? (
                <select
                  value={editValue}
                  onChange={(e) => onEditChange && onEditChange(e.target.value)}
                  className="w-full min-w-0 bg-white dark:bg-zinc-900 border border-gray-300 dark:border-zinc-700 rounded px-2 py-1.5 text-sm focus:ring-1 focus:ring-black dark:focus:ring-white focus:border-black dark:focus:border-white outline-none text-gray-900 dark:text-gray-100"
                  autoFocus
                >
                    <option value="" disabled>Select option</option>
                    {options.map(opt => (
                        <option key={opt} value={opt}>{opt}</option>
                    ))}
                </select>
            ) : (
              <input 
                  type={inputType}
                  value={editValue}
                  onChange={(e) => onEditChange && onEditChange(e.target.value)}
                  className="w-full min-w-0 bg-white dark:bg-zinc-900 border border-gray-300 dark:border-zinc-700 rounded px-2 py-1.5 text-sm focus:ring-1 focus:ring-black dark:focus:ring-white focus:border-black dark:focus:border-white outline-none text-gray-900 dark:text-gray-100"
                  autoFocus
              />
            )}
            {editorNote}
            </div>
            <div className="flex-none flex items-center gap-1 pt-1">
              <button onClick={onSave} aria-label="Save" title="Save" className="p-1 hover:bg-green-100 dark:hover:bg-green-900/30 text-green-600 dark:text-green-400 rounded">
                  <IconCheck />
              </button>
              <button onClick={onCancel} aria-label="Cancel" title="Cancel" className="p-1 hover:bg-red-100 dark:hover:bg-red-900/30 text-red-600 dark:text-red-400 rounded">
                  <IconX />
              </button>
            </div>
          </div>
        ) : (
          <>
            <span className={`flex-1 min-w-0 flex flex-wrap items-center gap-x-2 gap-y-1 pt-1.5 break-words ${inputType === 'textarea' ? 'whitespace-pre-wrap' : ''}`}>
              <span className="min-w-0 break-words">{(displayValue || value) || <span className="text-gray-500 dark:text-gray-400 italic text-xs">Empty</span>}</span>
              {isHidden && <span className="text-[10px] bg-gray-200 dark:bg-zinc-700 text-gray-500 dark:text-gray-300 px-1.5 rounded">Hidden</span>}
            </span>
            <div className={`flex-none flex items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 [@media(hover:none)]:opacity-100 transition-opacity pt-1`}>
              {isEditable && (
                <button 
                  onClick={onEdit}
                  className="text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 p-1 transition-colors"
                  title="Edit"
                >
                    <IconEdit />
                </button>
              )}
              {onToggleVisibility && (
                 <button 
                  onClick={onToggleVisibility}
                  className="text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 p-1 transition-colors"
                  title={isHidden ? "Show on profile" : "Hide from profile"}
                >
                    {isHidden ? <IconEyeOff /> : <IconEye />}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
});

// Helper for rendering select inputs
export const SelectField = ({ label, value, options, onChange }: { label: string, value?: string, options: string[], onChange: (val: string) => void }) => (
    <div className="flex flex-col gap-1">
        <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">{label}</label>
        <select 
          value={value || ''} 
          onChange={(e) => onChange(e.target.value)}
          className="w-full border border-gray-200 dark:border-zinc-700 rounded p-2 text-sm bg-gray-50 dark:bg-zinc-800 focus:bg-white dark:focus:bg-zinc-900 focus:ring-1 focus:ring-black dark:focus:ring-white outline-none transition-colors text-gray-900 dark:text-gray-100"
        >
            <option value="">Any</option>
            {options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
        </select>
    </div>
);

// Helper for Profile Sections
// badgeTone: 'new' (rose), 'done' (green: a section's reward earned), 'todo'
// (amber: answers still to give), 'required' (gray)
const BADGE_TONE = {
  new: 'bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300',
  done: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300',
  todo: 'bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200',
  required: 'bg-gray-100 dark:bg-zinc-800 text-gray-700 dark:text-gray-300',
} as const;

export const InfoSection = ({ title, badge, badgeTone = 'new', id, children }: {
  title: string, badge?: string, badgeTone?: keyof typeof BADGE_TONE, id?: string, children?: React.ReactNode,
}) => (
    <div className="mb-8 scroll-mt-4" id={id}>
        <h4 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-3 border-b border-gray-100 dark:border-zinc-800 pb-1 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <span>{title}</span>
          {badge && <span className={`normal-case tracking-normal text-[10px] font-bold px-1.5 py-0.5 rounded whitespace-nowrap ${BADGE_TONE[badgeTone]}`}>{badge}</span>}
        </h4>
        <div className="space-y-0.5">
            {children}
        </div>
    </div>
);
