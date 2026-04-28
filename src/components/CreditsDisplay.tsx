import { ZapIcon } from '@/components/Icons';
import { useAuthStore } from '@/stores/authStore';

export default function CreditsDisplay() {
  const user = useAuthStore((state) => state.user);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#faad14' }}>
      <ZapIcon />
      <span style={{ fontSize: 13, fontWeight: 600 }}>{user?.credits ?? 0}</span>
    </div>
  );
}
