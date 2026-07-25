import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
export const cn = (...values: ClassValue[]) => twMerge(clsx(values));

export function safeAccent(value?: string) {
  return value && /^#[0-9a-f]{6}$/i.test(value) ? value : undefined;
}
