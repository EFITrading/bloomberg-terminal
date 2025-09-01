import './terminal.css';
import Background from '@/components/terminal/Background';
import Navigation from '@/components/terminal/Navigation';
import HeroSection from '@/components/terminal/HeroSection';
import ToolsSection from '@/components/terminal/ToolsSection';
import Footer from '@/components/terminal/Footer';

export default function Home() {
  return (
    <>
      <Background />
      <Navigation />
      <HeroSection />
      <ToolsSection />
      <Footer />
    </>
  );
}
