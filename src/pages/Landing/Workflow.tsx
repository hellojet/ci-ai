import { motion } from 'motion/react';
import { useLocale } from '@/hooks/useLocale';
import styles from './styles.module.css';

const STEP_KEYS = ['assets', 'breakdown', 'generate', 'export'] as const;

export default function Workflow() {
  const { t } = useLocale();

  return (
    <section
      className={styles.section}
      style={{
        background:
          'linear-gradient(180deg, transparent 0%, rgba(168,85,247,0.04) 50%, transparent 100%)',
      }}
    >
      <div className={styles.container}>
        <motion.h2
          className={styles.sectionTitle}
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        >
          {t('landing.workflow.sectionTitle')}
        </motion.h2>
        <motion.p
          className={styles.sectionSubtitle}
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.6, ease: 'easeOut', delay: 0.05 }}
        >
          {t('landing.workflow.sectionSubtitle')}
        </motion.p>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 24,
            position: 'relative',
          }}
        >
          {STEP_KEYS.map((key, idx) => (
            <motion.div
              key={key}
              initial={{ opacity: 0, y: 32 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ duration: 0.5, ease: 'easeOut', delay: idx * 0.1 }}
              style={{
                padding: '32px 24px',
                borderRadius: 16,
                background: 'rgba(20,20,20,0.6)',
                border: '1px solid rgba(255,255,255,0.06)',
                position: 'relative',
                textAlign: 'center',
              }}
            >
              <div
                style={{
                  fontSize: 56,
                  fontWeight: 700,
                  background:
                    'linear-gradient(135deg, rgba(168,85,247,0.6) 0%, rgba(236,72,153,0.4) 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  lineHeight: 1,
                  marginBottom: 16,
                  letterSpacing: '-0.04em',
                }}
              >
                {String(idx + 1).padStart(2, '0')}
              </div>
              <h3
                style={{
                  fontSize: 18,
                  fontWeight: 600,
                  color: '#fff',
                  margin: '0 0 10px',
                }}
              >
                {t(`landing.workflow.steps.${key}.title`)}
              </h3>
              <p
                style={{
                  fontSize: 13,
                  color: '#888',
                  margin: 0,
                  lineHeight: 1.6,
                }}
              >
                {t(`landing.workflow.steps.${key}.desc`)}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
