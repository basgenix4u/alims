'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { focusMain } from '@/lib/focus';

export function useRouteFocus(): void {
  const pathname = usePathname();
  useEffect(() => {
    focusMain();
  }, [pathname]);
}
