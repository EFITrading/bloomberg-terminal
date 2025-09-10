import './terminal.css';
import Background from '@/components/terminal/Background';
import Navigation from '@/components/terminal/Navigation';
import HeroSection from '@/components/terminal/HeroSection';
import ToolsSection from '@/components/terminal/ToolsSection';
import Footer from '@/components/terminal/Footer';
import DataPreloader from '@/components/DataPreloader';

export default function Home() {
  return (
    <div className="terminal-app">
      <DataPreloader />
      <Background />
      <Navigation />
      <main className="main-content">
        <HeroSection />
        <ToolsSection />
      </main>
      <Footer />
    </div>
  );
}
