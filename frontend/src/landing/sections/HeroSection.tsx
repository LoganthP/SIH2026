import React from "react";
import { LANDING_CONTENT } from "../content";
import { AssuranceCore } from "../visuals/AssuranceCore";
import { Shield, ArrowDown, Users, Sparkles, CheckCircle2 } from "lucide-react";

interface HeroSectionProps {
  onScrollTo: (id: string) => void;
}

export const HeroSection: React.FC<HeroSectionProps> = ({ onScrollTo }) => {
  return (
    <section
      id="hero"
      className="presentation-section relative z-10 overflow-hidden flex flex-col justify-center"
    >
      <div className="w-full max-w-[1280px] mx-auto grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-center">
        {/* Left Column: Typography & CTAs */}
        <div className="lg:col-span-7 flex flex-col items-start text-left space-y-6">
          {/* SIH 2026 Presenter Badge */}
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/[0.04] border border-cyan-500/30 text-cyan-300 font-mono text-[11px] tracking-wider uppercase backdrop-blur-md shadow-sm">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
            <span>{LANDING_CONTENT.hero.badge}</span>
          </div>

          {/* Huge Title with subtle light shimmer sweep */}
          <div className="space-y-2">
            <h1 className="text-5xl sm:text-7xl lg:text-8xl font-black tracking-tight leading-[1.05] title-shimmer">
              {LANDING_CONTENT.hero.title}
            </h1>
            <p className="text-lg sm:text-xl lg:text-2xl text-slate-300 font-normal italic max-w-2xl leading-relaxed">
              {LANDING_CONTENT.hero.subtitle}
            </p>
          </div>

          {/* Problem Statement Chip */}
          <div className="inline-flex flex-wrap items-center gap-2 px-3 py-1.5 rounded-lg bg-cyan-950/40 border border-cyan-500/25 text-xs text-cyan-200 font-mono">
            <span className="font-semibold text-white">Problem Statement</span>
            <span className="px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 font-bold">
              SIH26228
            </span>
            <span className="text-slate-400">·</span>
            <span className="text-slate-300 font-sans">{LANDING_CONTENT.meta.theme}</span>
          </div>

          {/* Tagline & Core Philosophy */}
          <div className="pt-2 border-l-2 border-cyan-400/40 pl-4 space-y-1">
            <div className="font-mono text-sm sm:text-base font-bold tracking-widest text-cyan-300 uppercase">
              {LANDING_CONTENT.hero.tagline}
            </div>
            <div className="text-base sm:text-lg text-slate-200 font-medium italic">
              {LANDING_CONTENT.hero.motto}
            </div>
          </div>

          {/* CTAs */}
          <div className="pt-4 flex flex-wrap items-center gap-4">
            <button
              onClick={() => onScrollTo("problem")}
              className="flex items-center gap-2 px-6 py-3.5 rounded-xl bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-bold text-sm tracking-wide shadow-lg shadow-cyan-400/25 transition-all transform hover:-translate-y-0.5 active:translate-y-0 focus:outline-none"
            >
              <span>{LANDING_CONTENT.hero.primaryCta}</span>
              <ArrowDown className="w-4 h-4" />
            </button>

            <button
              onClick={() => onScrollTo("team")}
              className="flex items-center gap-2 px-6 py-3.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 text-slate-200 hover:text-white font-medium text-sm transition-all transform hover:-translate-y-0.5 active:translate-y-0 focus:outline-none"
            >
              <Users className="w-4 h-4 text-cyan-400" />
              <span>{LANDING_CONTENT.hero.secondaryCta}</span>
            </button>
          </div>
        </div>

        {/* Right Column: Glowing Assurance Core */}
        <div className="lg:col-span-5 flex items-center justify-center relative">
          <AssuranceCore interactive={true} />
        </div>
      </div>
    </section>
  );
};
