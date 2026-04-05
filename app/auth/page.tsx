'use client';
export const dynamic = 'force-dynamic';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Clapperboard } from 'lucide-react';

export default function AuthPage() {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const supabase = createClient();

  const handleSubmit = async () => {
    setError(null);
    setSuccess(null);
    setLoading(true);

    try {
      if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        setSuccess('Account created! Check your email to confirm, then log in.');
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        window.location.href = '/';
      }
    } catch (err: any) {
      setError(err.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm space-y-6">

        <div className="text-center space-y-2">
          <div className="flex items-center justify-center gap-2 text-primary">
            <span className="text-xl font-semibold">Clip App</span>
          </div>
          <p className="text-sm text-muted-foreground">
            {mode === 'login' ? 'Ingresa a tu cuenta' : 'Create an account'}
          </p>
        </div>

        <div className="bg-card border border-border rounded-xl p-6 space-y-4">
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Email</label>
              <Input
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                disabled={loading}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Contraseña</label>
              <Input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                disabled={loading}
              />
            </div>
          </div>

          {error && (
            <div className="text-xs text-destructive bg-destructive/10 border border-destructive/30 px-3 py-2 rounded">
              {error}
            </div>
          )}
          {success && (
            <div className="text-xs text-green-600 bg-green-500/10 border border-green-500/30 px-3 py-2 rounded">
              {success}
            </div>
          )}

          <Button onClick={handleSubmit} disabled={loading} className="w-full gap-2">
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {mode === 'login' ? 'Ingresar' : 'Create account'}
          </Button>
        </div>
      </div>
    </div>
  );
}