import React, { useState } from "react";
import { LANDING_CONTENT, TeamMember } from "../content";
import { TiltCard } from "../visuals/TiltCard";
import { Award, Shield, Heart } from "lucide-react";

interface TeamAvatarProps {
  member: TeamMember;
  size?: "default" | "large";
}

const TeamAvatar: React.FC<TeamAvatarProps> = ({ member, size = "default" }) => {
  const [imgError, setImgError] = useState(false);

  const sizeClasses = size === "large" ? "w-24 h-24 text-2xl" : "w-18 h-18 sm:w-20 sm:h-20 text-xl";

  return (
    <div
      className={`relative ${sizeClasses} rounded-full overflow-hidden border-2 border-white/20 shadow-xl flex items-center justify-center mx-auto select-none`}
    >
      {!imgError && member.photo ? (
        <img
          src={member.photo}
          alt={member.name}
          onError={() => setImgError(true)}
          className="w-full h-full object-cover"
        />
      ) : (
        /* Gradient Initials Placeholder */
        <div className="w-full h-full bg-gradient-to-tr from-cyan-900 via-blue-800 to-indigo-950 flex items-center justify-center font-bold text-white font-mono tracking-wider">
          {member.initials}
        </div>
      )}
      {/* Subtle glass rim */}
      <div className="absolute inset-0 rounded-full border border-white/20 pointer-events-none" />
    </div>
  );
};

export const TeamSection: React.FC = () => {
  const { lead, members, heading, subtitle, tagline, quote } = LANDING_CONTENT.team;

  return (
    <section id="team" className="presentation-section relative z-10">
      <div className="w-full max-w-[1280px] mx-auto space-y-12">
        {/* Section Header */}
        <div className="space-y-2 text-center max-w-2xl mx-auto">
          <div className="font-mono text-xs sm:text-sm font-semibold tracking-widest text-cyan-400 uppercase">
            {LANDING_CONTENT.team.sectionNum} / {LANDING_CONTENT.team.sectionLabel}
          </div>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-white">
            {heading}
          </h2>
          <p className="text-sm sm:text-base text-slate-400 italic">
            "{subtitle}"
          </p>
        </div>

        {/* Team Cards Container */}
        <div className="space-y-8">
          {/* Top: Team Lead Centered Card (Larger, Tricolour top edge) */}
          <div className="flex justify-center">
            <TiltCard className="p-8 max-w-sm w-full text-center space-y-4 relative overflow-hidden">
              {/* Thin Tricolour Top Edge */}
              <div className="absolute top-0 inset-x-0 h-1 tricolor-hairline" />

              {/* Team Lead Badge */}
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-cyan-950/80 border border-cyan-400/40 text-cyan-300 font-mono text-[11px] font-bold tracking-widest uppercase shadow-sm">
                <Award className="w-3.5 h-3.5 text-cyan-400" />
                <span>{lead.role}</span>
              </div>

              {/* Avatar */}
              <TeamAvatar member={lead} size="large" />

              {/* Name & Role */}
              <div className="space-y-1">
                <h3 className="text-xl font-bold text-white tracking-wide">
                  {lead.name}
                </h3>
                <p className="font-mono text-xs text-cyan-300 tracking-wider">
                  TEAM JAI HIND
                </p>
              </div>
            </TiltCard>
          </div>

          {/* Bottom: Five Team Members in One Row on Desktop */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 lg:gap-6">
            {members.map((member) => (
              <TiltCard key={member.id} className="p-6 text-center space-y-3.5 flex flex-col justify-between">
                <div className="space-y-3">
                  <TeamAvatar member={member} />
                  <div>
                    <h4 className="text-base font-bold text-white tracking-wide">
                      {member.name}
                    </h4>
                    <p className="font-mono text-[11px] text-slate-400 tracking-wider mt-0.5">
                      {member.role}
                    </p>
                  </div>
                </div>

                <div className="pt-2 border-t border-white/[0.06] text-[10px] font-mono text-cyan-400/70">
                  DEFENCE AI LAB
                </div>
              </TiltCard>
            ))}
          </div>
        </div>

        {/* Footer Statement */}
        <div className="text-center pt-4 space-y-1">
          <div className="font-bold text-base sm:text-lg tracking-widest text-white uppercase flex items-center justify-center gap-2">
            <span>{tagline}</span>
            <span className="tricolor-dot" />
          </div>
          <p className="text-sm text-slate-400 italic">
            "{quote}"
          </p>
        </div>
      </div>
    </section>
  );
};
