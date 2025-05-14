import React from 'react';

interface SectionProps {
  children: React.ReactNode;
  className?: string;
  variant?: 'default' | 'gradient' | 'dark' | 'highlight';
  fullWidth?: boolean;
  id?: string;
}

export function Section({
  children,
  className = '',
  variant = 'default',
  fullWidth = false,
  id
}: SectionProps) {
  const variantStyles = {
    default: 'bg-slate-900',
    gradient: 'bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 section-gradient',
    dark: 'bg-slate-950',
    highlight: 'bg-gradient-to-r from-indigo-900/20 to-purple-900/20'
  };

  return (
    <section 
      id={id}
      className={`py-16 sm:py-24 ${variantStyles[variant]} ${className}`}
    >
      <div className={`${fullWidth ? 'px-4 sm:px-6' : 'container px-4 sm:px-6 mx-auto max-w-7xl'}`}>
        {children}
      </div>
    </section>
  );
}

export function SectionTitle({
  children,
  className = '',
  subtitle,
  centered = false,
  gradient = false
}: {
  children: React.ReactNode;
  className?: string;
  subtitle?: string;
  centered?: boolean;
  gradient?: boolean;
}) {
  return (
    <div className={`mb-12 ${centered ? 'text-center' : ''} ${className}`}>
      <h2 className={`text-3xl sm:text-4xl font-bold mb-4 ${gradient ? 'animated-gradient-text' : 'text-white'}`}>
        {children}
      </h2>
      {subtitle && (
        <p className="text-slate-400 max-w-3xl text-lg">
          {subtitle}
        </p>
      )}
    </div>
  );
}

// Adds a subtle "particle" effect background
export function ParticleBackground({
  children,
  className = ''
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`relative particle-background ${className}`}>
      {children}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-1/2 h-1/2 bg-indigo-500/5 rounded-full blur-3xl transform -translate-x-1/2 -translate-y-1/2"></div>
        <div className="absolute top-3/4 right-1/4 w-1/3 h-1/3 bg-purple-500/5 rounded-full blur-3xl"></div>
      </div>
    </div>
  );
}
