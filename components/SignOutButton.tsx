'use client';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { LogOut } from 'lucide-react';

export function SignOutButton() {
  const supabase = createClient();

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    window.location.href = '/auth';
  };

  return (
    <Button variant="ghost" size="sm" onClick={handleSignOut} className="gap-2">
      <LogOut className="w-4 h-4" />
      Sign out
    </Button>
  );
}