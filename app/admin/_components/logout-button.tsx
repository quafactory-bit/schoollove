'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';

export function LogoutButton() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  async function handleLogout() {
    setIsLoading(true);
    try {
      await fetch('/api/admin/auth', { method: 'DELETE' });
      router.push('/admin/login');
      router.refresh();
    } catch {
      setIsLoading(false);
    }
  }

  return (
    <Button
      onClick={handleLogout}
      disabled={isLoading}
      variant="outline"
      size="sm"
    >
      {isLoading ? '로그아웃 중...' : '로그아웃'}
    </Button>
  );
}
