import { useState } from 'react';
import LandingHeader from './Header';
import Hero from './Hero';
import Features from './Features';
import Workflow from './Workflow';
import Showcase from './Showcase';
import CtaSection from './CtaSection';
import LandingFooter from './Footer';
import TrialRequestModal from './TrialRequestModal';
import styles from './styles.module.css';

export default function LandingPage() {
  const [trialOpen, setTrialOpen] = useState(false);

  const openTrial = () => setTrialOpen(true);

  return (
    <div className={styles.page}>
      {/* 背景光斑 */}
      <div className={styles.glow} aria-hidden="true">
        <div className={`${styles.glowBlob} ${styles.glowBlob1}`} />
        <div className={`${styles.glowBlob} ${styles.glowBlob2}`} />
        <div className={`${styles.glowBlob} ${styles.glowBlob3}`} />
      </div>

      <LandingHeader onRequestTrial={openTrial} />

      <main>
        <Hero onRequestTrial={openTrial} />
        <Features />
        <Workflow />
        <Showcase />
        <CtaSection onRequestTrial={openTrial} />
      </main>

      <LandingFooter />

      <TrialRequestModal open={trialOpen} onClose={() => setTrialOpen(false)} />
    </div>
  );
}
