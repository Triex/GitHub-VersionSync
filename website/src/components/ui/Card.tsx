import React from 'react';

interface CardProps {
  className?: string;
  gradient?: boolean;
  children: React.ReactNode;
  hover?: boolean;
}

export function Card({ 
  className = '', 
  gradient = false,
  hover = false,
  children 
}: CardProps) {
  return (
    <div 
      className={`
        bg-slate-800/80 backdrop-blur-sm border border-slate-700/50 rounded-xl overflow-hidden shadow-xl
        ${gradient ? 'gradient-border' : ''}
        ${hover ? 'transition-transform duration-300 hover:scale-[1.02] hover:shadow-indigo-500/10' : ''}
        ${className}
      `}
    >
      {children}
    </div>
  );
}

export function CardHeader({ 
  className = '', 
  children 
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`border-b border-slate-700/50 px-6 py-4 ${className}`}>
      {children}
    </div>
  );
}

export function CardTitle({ 
  className = '', 
  children 
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <h3 className={`text-xl font-bold text-white ${className}`}>
      {children}
    </h3>
  );
}

export function CardDescription({ 
  className = '', 
  children 
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <p className={`text-slate-400 text-sm ${className}`}>
      {children}
    </p>
  );
}

export function CardContent({ 
  className = '', 
  children 
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`px-6 py-5 ${className}`}>
      {children}
    </div>
  );
}

export function CardFooter({ 
  className = '', 
  children 
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`border-t border-slate-700/50 px-6 py-4 ${className}`}>
      {children}
    </div>
  );
}
