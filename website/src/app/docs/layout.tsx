import React from 'react';
import { DocumentationSidebar } from '@/components/documentation/DocumentationSidebar';
import { getDocCategories, getDocsByCategory } from '@/lib/markdown';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { Section } from '@/components/ui/Section';
import { PageTransition } from '@/components/ui/PageTransition';

export const metadata = {
  title: 'Documentation | GitHub Version Sync',
  description: 'Documentation and guides for using GitHub Version Sync extension',
};

// Server component for documentation layout
export default async function DocsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Fetch all documentation categories
  const categories = await getDocCategories();

  // Prepare categories with their items for the sidebar
  const categoriesWithItems = await Promise.all(
    categories.map(async (category) => {
      const docs = await getDocsByCategory(category.slug);
      return {
        ...category,
        items: docs.map((doc) => ({
          title: doc.title,
          slug: doc.slug,
        })),
      };
    })
  );

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800 text-slate-200">
      <Section
        variant="gradient"
        className="py-4 sm:py-4 md:py-4 border-b border-slate-800"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <Link
            href="/"
            className="text-white text-xl font-semibold hover:text-indigo-300 transition-colors"
          >
            ← Back to Home
          </Link>

          <div className="flex items-center space-x-4">
            <Link
              href="/downloads"
              className="px-6 py-2 bg-indigo-600 dark:bg-indigo-700 text-white font-medium rounded-lg hover:bg-indigo-700 dark:hover:bg-indigo-800 transition-colors flex items-center"
            >
              <svg
                className="w-5 h-5 mr-2"
                fill="currentColor"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM17 13l-5 5-5-5h3V9h4v4h3z" />
              </svg>
              Download Extension
            </Link>
            <Link
              href="https://github.com/Triex/GitHub-VersionSync"
              target="_blank"
              className="px-6 py-2 bg-white text-slate-800 dark:bg-slate-800 dark:text-white font-medium rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors flex items-center"
            >
              <svg
                className="w-5 h-5 mr-2"
                fill="currentColor"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
              </svg>
              View on GitHub
            </Link>
          </div>
        </div>
      </Section>

      <div className="container mx-auto px-2 sm:px-4 py-4 sm:py-6 lg:py-8">
        <div className="flex flex-col lg:flex-row gap-4 sm:gap-6 lg:gap-10">
          {/* Sidebar navigation for documentation */}
          <aside className="lg:w-72 flex-shrink-0">
            <div className="lg:sticky lg:top-8 overflow-y-auto pb-12">
              <Card gradient className="p-6">
                <DocumentationSidebar categories={categoriesWithItems} />
              </Card>
            </div>
          </aside>

          {/* Main content area */}
          <main className="flex-1 min-w-0">
            <Card className="p-0 sm:p-0 lg:p-0">
              <PageTransition>{children}</PageTransition>
            </Card>
          </main>
        </div>
      </div>
    </div>
  );
}
