'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface DocItem {
  title: string;
  slug: string;
}

interface Category {
  name: string;
  slug: string;
  items: DocItem[];
}

interface DocumentationSidebarProps {
  categories: Category[];
}

export function DocumentationSidebar({ categories }: DocumentationSidebarProps) {
  const pathname = usePathname();

  return (
    <nav className="documentation-nav">
      <div className="space-y-6">
        {categories.map((category) => (
          <div key={category.slug} className="pb-4">
            <h3 className="mb-3 text-lg font-semibold text-indigo-500 dark:text-indigo-400 capitalize">
              {category.name}
            </h3>
            
            <ul className="space-y-2">
              {category.items.map((item) => {
                const isActive = pathname === `/docs/${category.slug}/${item.slug}`;
                
                return (
                  <li key={item.slug}>
                    <Link
                      href={`/docs/${category.slug}/${item.slug}`}
                      className={`
                        block py-2 px-3 text-sm rounded-lg transition-all duration-200
                        ${isActive 
                          ? 'bg-indigo-100 dark:bg-indigo-900/20 text-indigo-800 dark:text-indigo-300 font-medium' 
                          : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/50'
                        }
                      `}
                    >
                      {item.title}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </nav>
  );
}
