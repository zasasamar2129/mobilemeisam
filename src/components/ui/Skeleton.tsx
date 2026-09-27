import React from 'react';
import { cn } from './Button';

export interface SkeletonProps {
  className?: string;
  width?: string | number;
  height?: string | number;
  rounded?: string;
}

export const Skeleton: React.FC<SkeletonProps> = ({ className, width, height = '1rem', rounded = 'rounded-lg' }) => {
  return (
    <div
      className={cn('bg-surface-subtle animate-pulse', rounded, className)}
      style={{ width, height }}
      aria-hidden
    />
  );
};