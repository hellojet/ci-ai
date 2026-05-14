import { Button } from 'antd';
import { ArrowRightOutlined } from '@ant-design/icons';
import { motion } from 'motion/react';
import { useNavigate } from 'react-router';
import { useAuthStore } from '@/stores/authStore';
import { useLocale } from '@/hooks/useLocale';
import styles from './styles.module.css';

interface Props {
  onRequestTrial: () => void;
}

export default function CtaSection({ onRequestTrial }: Props) {
  const navigate = useNavigate();
  const { token } = useAuthStore();
  const { t } = useLocale();

  const isAuthed = Boolean(token);

  return (
    <section className={styles.section} style={{ paddingBottom: 160 }}>
      <div className={styles.container}>
        <motion.div
          initial={{ opacity: 0, y: 32 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.7, ease: 'easeOut' }}
          style={{
            padding: '80px 32px',
            borderRadius: 24,
            background:
              'radial-gradient(circle at top, rgba(168,85,247,0.18) 0%, rgba(20,20,20,0.4) 60%)',
            border: '1px solid rgba(168,85,247,0.2)',
            textAlign: 'center',
          }}
        >
          <h2
            style={{
              fontSize: 'clamp(32px, 4vw, 48px)',
              fontWeight: 700,
              letterSpacing: '-0.02em',
              color: '#fff',
              margin: '0 0 16px',
              lineHeight: 1.15,
            }}
          >
            {t('landing.cta.title')}
          </h2>
          <p
            style={{
              fontSize: 16,
              color: '#aaa',
              margin: '0 auto 40px',
              maxWidth: 560,
              lineHeight: 1.6,
            }}
          >
            {t('landing.cta.subtitle')}
          </p>

          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              gap: 16,
              flexWrap: 'wrap',
            }}
          >
            {isAuthed ? (
              <Button type="primary" size="large" onClick={() => navigate('/projects')}>
                {t('landing.header.enterApp')} <ArrowRightOutlined />
              </Button>
            ) : (
              <>
                <Button type="primary" size="large" onClick={() => navigate('/login')}>
                  {t('landing.cta.ctaPrimary')}
                </Button>
                <Button
                  size="large"
                  onClick={onRequestTrial}
                  style={{
                    background: 'transparent',
                    borderColor: 'rgba(255,255,255,0.2)',
                    color: '#fff',
                  }}
                >
                  {t('landing.cta.ctaSecondary')} <ArrowRightOutlined />
                </Button>
              </>
            )}
          </div>
        </motion.div>
      </div>
    </section>
  );
}
