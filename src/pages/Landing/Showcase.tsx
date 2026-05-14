import { motion } from 'motion/react';
import { useLocale } from '@/hooks/useLocale';
import styles from './styles.module.css';

const SHOWCASE_KEYS = ['characters', 'breakdown', 'editor', 'batch', 'asset', 'export'] as const;

// 占位渐变集合 — 后续替换为真实截图
const GRADIENTS: Record<(typeof SHOWCASE_KEYS)[number], string> = {
  characters: 'linear-gradient(135deg, #a855f7 0%, #6366f1 100%)',
  breakdown: 'linear-gradient(135deg, #ec4899 0%, #8b5cf6 100%)',
  editor: 'linear-gradient(135deg, #06b6d4 0%, #3b82f6 100%)',
  batch: 'linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)',
  asset: 'linear-gradient(135deg, #10b981 0%, #06b6d4 100%)',
  export: 'linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)',
};

export default function Showcase() {
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
          {t('landing.showcase.sectionTitle')}
        </motion.h2>
        <motion.p
          className={styles.sectionSubtitle}
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.6, ease: 'easeOut', delay: 0.05 }}
        >
          {t('landing.showcase.sectionSubtitle')}
        </motion.p>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: 20,
          }}
        >
          {SHOWCASE_KEYS.map((key, idx) => (
            <motion.div
              key={key}
              initial={{ opacity: 0, y: 32 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.2 }}
              transition={{ duration: 0.5, ease: 'easeOut', delay: (idx % 3) * 0.08 }}
              style={{
                borderRadius: 16,
                overflow: 'hidden',
                border: '1px solid rgba(255,255,255,0.08)',
                background: '#141414',
              }}
            >
              {/* TODO: 替换为真实截图 — 用户后续提供 6 张产品截图 */}
              <div
                style={{
                  aspectRatio: '16 / 10',
                  background: GRADIENTS[key],
                  position: 'relative',
                  overflow: 'hidden',
                  transition: 'transform 0.4s ease',
                }}
                className="showcase-cover"
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'scale(1.03)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'scale(1)';
                }}
              >
                {/* 半透明黑色遮罩 + 噪点 */}
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    background:
                      'radial-gradient(circle at center, transparent 0%, rgba(0,0,0,0.3) 100%)',
                  }}
                />
                <div
                  style={{
                    position: 'absolute',
                    bottom: 16,
                    left: 16,
                    color: 'rgba(255,255,255,0.6)',
                    fontSize: 11,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                  }}
                >
                  Preview
                </div>
              </div>
              <div style={{ padding: 20 }}>
                <h4 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: '#fff' }}>
                  {t(`landing.showcase.items.${key}`)}
                </h4>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
