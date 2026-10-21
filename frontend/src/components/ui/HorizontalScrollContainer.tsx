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
      <div className="min-w-[768px]">
        {children}
      </div>
    </div>
  );
};
