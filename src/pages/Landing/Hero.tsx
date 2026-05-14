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

export default function Hero({ onRequestTrial }: Props) {
  const navigate = useNavigate();
  const { token } = useAuthStore();
  const { t } = useLocale();

  const isAuthed = Boolean(token);

  return (
    <section
      className={styles.section}
      style={{
        paddingTop: 96,
        minHeight: 'calc(100vh - 64px)',
        display: 'flex',
        alignItems: 'center',
      }}
    >
      <div className={styles.container} style={{ textAlign: 'center' }}>
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: 'easeOut' }}
        >
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '6px 14px',
              borderRadius: 999,
              border: '1px solid rgba(168, 85, 247, 0.3)',
              background: 'rgba(168, 85, 247, 0.08)',
              color: '#c084fc',
              fontSize: 13,
              marginBottom: 32,
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: '#a855f7',
                boxShadow: '0 0 12px #a855f7',
              }}
            />
            CI.AI · AI Video Creation Platform
          </div>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 32 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: 'easeOut', delay: 0.1 }}
          style={{
            fontSize: 'clamp(48px, 7vw, 96px)',
            fontWeight: 700,
            letterSpacing: '-0.03em',
            lineHeight: 1.05,
            margin: 0,
            color: '#fff',
          }}
        >
          {t('landing.hero.titleLine1')}
          <br />
          <span
            style={{
              background: 'linear-gradient(120deg, #a855f7 0%, #ec4899 50%, #f59e0b 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
          >
            {t('landing.hero.titleLine2')}
          </span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: 'easeOut', delay: 0.3 }}
          style={{
            fontSize: 'clamp(16px, 1.4vw, 20px)',
            color: '#aaa',
            margin: '32px auto 0',
            maxWidth: 640,
            letterSpacing: '0.02em',
          }}
        >
          {t('landing.hero.subtitle')}
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: 'easeOut', delay: 0.5 }}
          style={{
            display: 'flex',
            justifyContent: 'center',
            gap: 16,
            marginTop: 48,
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
                {t('landing.hero.ctaPrimary')}
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
                {t('landing.hero.ctaSecondary')} <ArrowRightOutlined />
              </Button>
            </>
          )}
        </motion.div>
      </div>
    </section>
  );
}
