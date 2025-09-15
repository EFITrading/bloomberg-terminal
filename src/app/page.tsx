import './terminal.css';
import HeroSection from '@/components/terminal/HeroSection';
import ToolsSection from '@/components/terminal/ToolsSection';
import Footer from '@/components/terminal/Footer';

export default function Home() {
  return (
    <>
      <HeroSection />
      <ToolsSection />
      <Footer />
    </>
  );
}
