import React from 'react';

interface HorizontalScrollContainerProps {
  children: React.ReactNode;
  className?: string;
}

export const HorizontalScrollContainer: React.FC<HorizontalScrollContainerProps> = ({
  children,
  className = '',
}) => {
  return (
    <div className={`overflow-x-auto w-full relative scrollbar-thin scrollbar-thumb-slate-300 dark:scrollbar-thumb-slate-700 ${className}`}>
      {/* Sticky wrapper to keep scrollbar visible if needed,
          though simple overflow-x-auto is the baseline.
          For true sticky scrollbar: requires complex wrapper/JS or specific CSS grid.
          Applying standard sticky bottom as a best-effort improvement for now. */}
      <div className="min-w-[768px] pb-2">
        {children}
      </div>
    </div>
  );
};
