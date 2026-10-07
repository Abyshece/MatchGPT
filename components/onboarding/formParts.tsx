import React from 'react';

// ============================================================================
// The sign-up steps' form pieces (StepBasicInfo, StepBackground): a labelled
// field, a plain select, and the input style they share.
// ============================================================================

// "(optional)" is set small and in lower case, so a label fits on one line
// beside its neighbour and paired fields line up
const OPTIONAL = ' (optional)';
export const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => {
  const optional = label.endsWith(OPTIONAL);
  return (
    <div>
      <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-1.5">
        {optional ? label.slice(0, -OPTIONAL.length) : label}
        {optional && <>{' '}<span className="normal-case tracking-normal font-medium">(optional)</span></>}
      </label>
      {children}
    </div>
  );
};

export const Select: React.FC<{
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder?: string;
}> = ({ value, onChange, options, placeholder }) => (
  <select
    value={value}
    onChange={(e) => onChange(e.target.value)}
    className="form-input cursor-pointer"
  >
    <option value="" disabled>{placeholder || 'Select'}</option>
    {options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
  </select>
);

export const FormInputStyles: React.FC = () => (
  <style>{`
        .form-input {
          width: 100%;
          height: 2.75rem;
          padding: 0 0.75rem;
          border: 1px solid rgb(209 213 219);
          border-radius: 0.375rem;
          background: white;
          font-size: 0.95rem;
          outline: none;
          transition: all 150ms;
        }
        .form-input:focus {
          border-color: black;
          box-shadow: 0 0 0 1px black;
        }
        .dark .form-input {
          background: rgb(24 24 27);
          border-color: rgb(63 63 70);
          color: white;
        }
        .dark .form-input:focus {
          border-color: white;
          box-shadow: 0 0 0 1px white;
        }
  `}</style>
);
