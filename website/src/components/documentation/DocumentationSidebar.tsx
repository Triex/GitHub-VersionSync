'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

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
  const router = useRouter();
  const [isNavigating, setIsNavigating] = useState(false);

  const handleNavigation = (href: string, e: React.MouseEvent) => {
    if (pathname === href) return; // Do nothing if already on this page

    e.preventDefault();
    setIsNavigating(true);

    // Short delay before navigation for a smoother transition
    setTimeout(() => {
      router.push(href);
      // Reset navigating status after navigation
      setTimeout(() => setIsNavigating(false), 100);
    }, 50);
  };

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
                      onClick={(e) => handleNavigation(`/docs/${category.slug}/${item.slug}`, e)}
                      className={`
                        block py-2 px-3 text-sm rounded-lg transition-all duration-200
                        ${isActive
                          ? 'bg-indigo-100 dark:bg-indigo-900/25 text-indigo-800 dark:text-indigo-300 font-medium'
                          : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-indigo-900/30'
                        }
                        ${isNavigating ? 'opacity-70 pointer-events-none' : ''}
                      `}
                      prefetch={true}
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
