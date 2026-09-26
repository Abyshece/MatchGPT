import { useEffect, useState } from 'react';
import { useAuth } from './AuthContext';
import { checkIsAdmin } from './adminService';

// Whether the signed-in user is an admin, as decided by the database.
// null while the check is still running.
export function useIsAdmin(): boolean | null {
  const { session } = useAuth();
  const userId = session?.user.id;
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  useEffect(() => {
    if (!userId) {
      setIsAdmin(false);
      return;
    }
    let active = true;
    setIsAdmin(null);
    checkIsAdmin().then((result) => {
      if (active) setIsAdmin(result);
    });
    return () => {
      active = false;
    };
  }, [userId]);

  return isAdmin;
}
