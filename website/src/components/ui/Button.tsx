import React from 'react';
import Link from 'next/link';

interface ButtonProps {
  children: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'link';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  href?: string;
  external?: boolean;
  onClick?: () => void;
  disabled?: boolean;
  type?: 'button' | 'submit' | 'reset';
  icon?: React.ReactNode;
}

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  className = '',
  href,
  external = false,
  onClick,
  disabled = false,
  type = 'button',
  icon
}: ButtonProps) {
  const baseStyles = 'inline-flex items-center justify-center rounded-lg font-medium transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-900';
  
  const variantStyles = {
    primary: 'bg-gradient-to-r from-indigo-500 to-indigo-600 text-white border border-indigo-500/20 hover:from-indigo-600 hover:to-indigo-700 shadow-lg shadow-indigo-500/20 focus:ring-indigo-500',
    secondary: 'bg-slate-800 border border-slate-700 text-white hover:bg-slate-700 shadow-lg shadow-slate-900/50 focus:ring-slate-600',
    outline: 'bg-transparent border border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white focus:ring-slate-600',
    ghost: 'bg-transparent text-slate-300 hover:bg-slate-800 hover:text-white focus:ring-slate-600',
    link: 'p-0 bg-transparent text-indigo-400 hover:text-indigo-300 underline-offset-4 hover:underline focus:ring-0'
  };
  
  const sizeStyles = {
    sm: 'text-xs px-3 py-1.5',
    md: 'text-sm px-4 py-2',
    lg: 'text-base px-6 py-3'
  };
  
  const disabledStyles = disabled ? 'opacity-50 cursor-not-allowed' : 'transform hover:scale-[1.02]';
  
  const buttonStyles = `${baseStyles} ${variantStyles[variant]} ${sizeStyles[size]} ${disabledStyles} ${className}`;
  
  const content = (
    <>
      {icon && <span className="mr-2">{icon}</span>}
      {children}
    </>
  );
  
  if (href) {
    return external ? (
      <a
        href={href}
        className={buttonStyles}
        target="_blank"
        rel="noopener noreferrer"
        onClick={onClick}
      >
        {content}
      </a>
    ) : (
      <Link
        href={href}
        className={buttonStyles}
        onClick={onClick}
      >
        {content}
      </Link>
    );
  }
  
  return (
    <button
      type={type}
      className={buttonStyles}
      onClick={onClick}
      disabled={disabled}
    >
      {content}
    </button>
  );
}
