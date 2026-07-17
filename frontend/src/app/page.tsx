import SpiritLensHero from "@/components/home/SpiritLensHero";
import ToolGrid from "@/components/home/ToolGrid";
import FeaturedWorks from "@/components/home/FeaturedWorks";
import "./spiritlens-hero.css";

export default function Page() {
  return (
    <div className="spirit-home-page">
      <SpiritLensHero />
      <div className="home-content-shell">
        <div className="home-mountain-reflection" aria-hidden="true" />
        <ToolGrid />
        <FeaturedWorks />
      </div>
    </div>
  );
}
