import { motion } from 'motion/react';
import { useLocale } from '@/hooks/useLocale';
import styles from './styles.module.css';

const ICONS = {
  consistency: (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21v-2a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v2" />
    </svg>
  ),
  breakdown: (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
      <path d="M9 13h6" />
      <path d="M9 17h6" />
    </svg>
  ),
  models: (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  ),
  batch: (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  ),
};

const FEATURE_KEYS = ['consistency', 'breakdown', 'models', 'batch'] as const;

export default function Features() {
  const { t } = useLocale();

  return (
    <section className={styles.section}>
      <div className={styles.container}>
        <motion.h2
          className={styles.sectionTitle}
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        >
          {t('landing.features.sectionTitle')}
        </motion.h2>
        <motion.p
          className={styles.sectionSubtitle}
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.6, ease: 'easeOut', delay: 0.05 }}
        >
          {t('landing.features.sectionSubtitle')}
        </motion.p>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: 24,
          }}
        >
          {FEATURE_KEYS.map((key, idx) => (
            <motion.div
              key={key}
              initial={{ opacity: 0, y: 32 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ duration: 0.6, ease: 'easeOut', delay: idx * 0.08 }}
              whileHover={{ y: -4 }}
              style={{
                padding: 32,
                borderRadius: 16,
                background: 'linear-gradient(180deg, rgba(20,20,20,0.8) 0%, rgba(15,15,15,0.6) 100%)',
                border: '1px solid rgba(255,255,255,0.08)',
                cursor: 'default',
                transition: 'border-color 0.3s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'rgba(168,85,247,0.4)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)';
              }}
            >
              <div
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 12,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'rgba(168,85,247,0.12)',
                  color: '#c084fc',
                  marginBottom: 20,
                }}
              >
                {ICONS[key]}
              </div>
              <h3
                style={{
                  fontSize: 20,
                  fontWeight: 600,
                  color: '#fff',
                  margin: '0 0 12px',
                  letterSpacing: '-0.01em',
                }}
              >
                {t(`landing.features.items.${key}.title`)}
              </h3>
              <p style={{ fontSize: 14, color: '#999', margin: 0, lineHeight: 1.6 }}>
                {t(`landing.features.items.${key}.desc`)}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
