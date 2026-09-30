import React from "react";
import { Link } from "react-router-dom";
import { LANDING_CONTENT } from "../content";
import { AssuranceCore } from "../visuals/AssuranceCore";
import { Shield } from "lucide-react";

export const ClosingSection: React.FC = () => {
  const { closing } = LANDING_CONTENT;

  return (
    <section
      id="closing"
      className="presentation-section relative z-10 overflow-hidden flex flex-col justify-between"
    >
      {/* Background Breathing Assurance Core (low opacity, perfectly still around text) */}
      <div className="absolute inset-0 flex items-center justify-center opacity-15 pointer-events-none -z-10">
        <AssuranceCore simplified={true} interactive={false} className="w-[700px] max-w-none" />
      </div>

      <div className="w-full" />

      {/* Main Closing Content */}
      <div className="w-full max-w-[1280px] mx-auto text-center space-y-8 py-12">
        {/* Small caps */}
        <div className="font-mono text-xs sm:text-sm font-semibold tracking-widest text-cyan-400 uppercase">
          {closing.event}
        </div>

        {/* Huge Title */}
        <h1 className="text-6xl sm:text-8xl lg:text-9xl font-black tracking-tight text-white leading-none">
          {closing.title}
        </h1>

        {/* Stacked Core Pillars */}
        <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-6 font-mono text-base sm:text-2xl font-bold tracking-widest text-cyan-200 uppercase">
          {closing.stackedWords.map((word, idx) => (
            <React.Fragment key={word}>
              <span className="hover:text-cyan-400 transition-colors">{word}</span>
              {idx < closing.stackedWords.length - 1 && (
                <span className="text-cyan-500/50 font-normal">·</span>
              )}
            </React.Fragment>
          ))}
        </div>

        {/* Presented By & Team Roster */}
        <div className="space-y-3 pt-4">
          <div className="font-bold text-sm sm:text-base text-white tracking-widest uppercase flex items-center justify-center gap-2">
            <span>{closing.presentedBy}</span>
            <span className="tricolor-dot" />
          </div>
          <p className="font-mono text-xs sm:text-sm text-slate-300 max-w-2xl mx-auto leading-relaxed">
            {closing.roster}
          </p>
          <div className="inline-block px-3 py-1 rounded bg-white/[0.04] border border-white/10 font-mono text-xs text-cyan-300 tracking-wider">
            {closing.problemStatement}
          </div>
        </div>

        {/* Closing Motto */}
        <div className="pt-2">
          <p className="text-base sm:text-lg text-slate-200 font-medium italic">
            "{closing.motto}"
          </p>
        </div>

        {/* Glowing Tricolour Hairline Underneath */}
        <div className="w-48 sm:w-72 h-[3px] mx-auto tricolor-hairline tricolor-hairline-glow rounded-full my-6" />
      </div>

      {/* Small Clean Footer for Presentation */}
      <footer className="w-full max-w-[1280px] mx-auto py-6 border-t border-white/[0.06] flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 font-mono gap-4">
        <div>{closing.copyright}</div>
        <div className="flex items-center gap-6">
          {closing.links.map((link) => (
            <Link
              key={link.label}
              to={link.href}
              className="text-slate-400 hover:text-cyan-300 transition-colors"
            >
              {link.label}
            </Link>
          ))}
        </div>
      </footer>
    </section>
  );
};
