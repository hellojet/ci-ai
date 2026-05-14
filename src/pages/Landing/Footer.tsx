import { useLocale } from '@/hooks/useLocale';
import { LogoIcon } from '@/components/Icons';

export default function LandingFooter() {
  const { t } = useLocale();

  return (
    <footer
      style={{
        position: 'relative',
        zIndex: 1,
        borderTop: '1px solid rgba(255, 255, 255, 0.06)',
        padding: '40px 0',
        background: 'rgba(12, 12, 12, 0.6)',
      }}
    >
      <div
        style={{
          maxWidth: 1200,
          margin: '0 auto',
          padding: '0 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <LogoIcon />
          <span style={{ color: '#888', fontSize: 13 }}>
            {t('landing.footer.copyright')}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 24, color: '#666', fontSize: 12 }}>
          <span>{t('landing.footer.contact')}</span>
          <span>v{__APP_VERSION__}</span>
        </div>
      </div>
    </footer>
  );
}
