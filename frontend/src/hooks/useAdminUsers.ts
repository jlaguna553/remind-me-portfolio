'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import type { AdminUserRow } from '@/types/db';

export function useAdminUsers() {
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase.rpc('admin_list_users');
    if (err) setError(err.message);
    else setUsers(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function setActive(userId: string, active: boolean) {
    const { error: err } = await supabase.rpc('admin_set_user_active', {
      target_user_id: userId,
      new_active: active,
    });
    if (!err) await refresh();
    return { error: err?.message ?? null };
  }

  return { users, loading, error, setActive, refresh };
}
