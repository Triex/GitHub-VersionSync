import Link from 'next/link';
import { Suspense } from 'react';
import { Badges } from '@/components/ui/Badges';
import { getDocCategories, getDocBySlug } from '@/lib/markdown';

// Icons for each section
const sectionIcons: Record<string, React.ReactNode> = {
  'getting-started': (
    <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 6V9L16 5L12 1V4C7.58 4 4 7.58 4 12C4 13.57 4.46 15.03 5.24 16.26L6.7 14.8C6.25 13.97 6 13.01 6 12C6 8.69 8.69 6 12 6ZM18.76 7.74L17.3 9.2C17.74 10.04 18 10.99 18 12C18 15.31 15.31 18 12 18V15L8 19L12 23V20C16.42 20 20 16.42 20 12C20 10.43 19.54 8.97 18.76 7.74Z" />
    </svg>
  ),
  'configuration': (
    <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path d="M19.14,12.94c0.04-0.3,0.06-0.61,0.06-0.94c0-0.32-0.02-0.64-0.07-0.94l2.03-1.58c0.18-0.14,0.23-0.41,0.12-0.61 l-1.92-3.32c-0.12-0.22-0.37-0.29-0.59-0.22l-2.39,0.96c-0.5-0.38-1.03-0.7-1.62-0.94L14.4,2.81c-0.04-0.24-0.24-0.41-0.48-0.41 h-3.84c-0.24,0-0.43,0.17-0.47,0.41L9.25,5.35C8.66,5.59,8.12,5.92,7.63,6.29L5.24,5.33c-0.22-0.08-0.47,0-0.59,0.22L2.74,8.87 C2.62,9.08,2.66,9.34,2.86,9.48l2.03,1.58C4.84,11.36,4.8,11.69,4.8,12s0.02,0.64,0.07,0.94l-2.03,1.58 c-0.18,0.14-0.23,0.41-0.12,0.61l1.92,3.32c0.12,0.22,0.37,0.29,0.59,0.22l2.39-0.96c0.5,0.38,1.03,0.7,1.62,0.94l0.36,2.54 c0.05,0.24,0.24,0.41,0.48,0.41h3.84c0.24,0,0.44-0.17,0.47-0.41l0.36-2.54c0.59-0.24,1.13-0.56,1.62-0.94l2.39,0.96 c0.22,0.08,0.47,0,0.59-0.22l1.92-3.32c0.12-0.22,0.07-0.47-0.12-0.61L19.14,12.94z M12,15.6c-1.98,0-3.6-1.62-3.6-3.6 s1.62-3.6,3.6-3.6s3.6,1.62,3.6,3.6S13.98,15.6,12,15.6z" />
    </svg>
  ),
  'usage': (
    <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path d="M9 21c0 .55.45 1 1 1h4c.55 0 1-.45 1-1v-1H9v1zm3-19C8.14 2 5 5.14 5 9c0 2.38 1.19 4.47 3 5.74V17c0 .55.45 1 1 1h6c.55 0 1-.45 1-1v-2.26c1.81-1.27 3-3.36 3-5.74 0-3.86-3.14-7-7-7zm2.85 11.1l-.85.6V16h-4v-2.3l-.85-.6C7.8 12.16 7 10.63 7 9c0-2.76 2.24-5 5-5s5 2.24 5 5c0 1.63-.8 3.16-2.15 4.1z" />
    </svg>
  ),
  'contributing': (
    <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
    </svg>
  ),
  'troubleshooting': (
    <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path d="M11,9H13V7H11M12,20C7.59,20 4,16.41 4,12C4,7.59 7.59,4 12,4C16.41,4 20,7.59 20,12C20,16.41 16.41,20 12,20M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M11,17H13V11H11V17Z" />
    </svg>
  )
};

function DocCard({ title, slug, description, icon }: { title: string, slug: string, description: string, icon?: React.ReactNode }) {
  return (
    <Link href={`/docs/${slug}`} className="block">
      <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-md hover:shadow-lg transition-all hover:scale-[1.02] border border-transparent hover:border-indigo-100 dark:hover:border-indigo-900">
        <div className="flex items-center gap-3 mb-3">
          <div className="p-2 bg-indigo-100 dark:bg-indigo-900 rounded-lg text-indigo-600 dark:text-indigo-300">
            {icon}
          </div>
          <h3 className="text-xl font-semibold text-slate-900 dark:text-white">{title}</h3>
        </div>
        <p className="text-slate-600 dark:text-slate-300 mb-3">{description}</p>
        <div className="mt-2 text-indigo-600 dark:text-indigo-400 text-sm font-medium flex items-center">
          Read documentation
          <svg className="ml-1 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </div>
      </div>
    </Link>
  );
}

async function DocsList() {
  // Get categories from the actual docs directory structure
  const categories = await getDocCategories();
  // We'll get allDocs when we need to show badge counts or filter docs
  // const allDocs = await getAllDocs();

  // Create a mapping to display each category with a description
  const categoryDescriptions: Record<string, string> = {
    'getting-started': 'Learn how to install and configure GitHub Version Sync',
    'configuration': 'Configure the extension to match your workflow',
    'usage': 'Discover best practices and advanced usage patterns',
    'contributing': 'How to contribute to GitHub Version Sync',
    'troubleshooting': 'Common issues and their solutions'
  };

  return (
    <div className="grid md:grid-cols-2 gap-6">
      {categories.map((category) => {
        // We'll use this badge in the future if needed
        // const docsCount = allDocs.filter(doc => doc.category === category.slug).length;

        return (
          <DocCard
            key={category.slug}
            title={category.name}
            slug={category.slug}
            description={categoryDescriptions[category.slug] || `Documentation for ${category.name}`}
            icon={sectionIcons[category.slug] || sectionIcons['troubleshooting']}
          />
        );
      })}
    </div>
  );
}

function Loading() {
  return (
    <div className="flex justify-center items-center h-40">
      <div className="flex flex-col items-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500 mb-4"></div>
        <p className="text-slate-500 dark:text-slate-400">Loading documentation...</p>
      </div>
    </div>
  );
}

async function QuickStartGuide() {
  try {
    // Attempt to dynamically load the quick start guide content from the actual markdown file
    const quickStartDoc = await getDocBySlug('getting-started', 'quick-start');

    if (quickStartDoc) {
      return (
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg p-8 mb-16">
          <div className="flex items-center gap-4 mb-6">
            <div className="p-3 bg-indigo-100 dark:bg-indigo-900 rounded-xl text-indigo-600 dark:text-indigo-300">
              {sectionIcons['getting-started']}
            </div>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
              {quickStartDoc.title}
            </h2>
          </div>

          <div className="prose prose-slate dark:prose-invert max-w-none">
            <div className="mb-6">
              {quickStartDoc.excerpt && (
                <p className="text-lg text-slate-700 dark:text-slate-300 font-medium">
                  {quickStartDoc.excerpt}
                </p>
              )}
            </div>

            <div className="bg-slate-50 dark:bg-slate-900 p-6 rounded-lg border border-slate-200 dark:border-slate-700 mb-6">
              <h3 className="text-xl font-semibold mb-4">Key Steps</h3>
              <ol className="list-decimal list-inside space-y-2">
                <li className="flex items-start">
                  <span className="inline-flex items-center justify-center bg-indigo-100 dark:bg-indigo-900 text-indigo-600 dark:text-indigo-300 h-6 w-6 rounded-full mr-3 flex-shrink-0 font-bold">1</span>
                  <span>Install the extension from the <Link href="/downloads" className="text-indigo-600 dark:text-indigo-400 hover:underline">download page</Link> or VS Code marketplace</span>
                </li>
                <li className="flex items-start">
                  <span className="inline-flex items-center justify-center bg-indigo-100 dark:bg-indigo-900 text-indigo-600 dark:text-indigo-300 h-6 w-6 rounded-full mr-3 flex-shrink-0 font-bold">2</span>
                  <span>Configure your version preferences in VS Code settings</span>
                </li>
                <li className="flex items-start">
                  <span className="inline-flex items-center justify-center bg-indigo-100 dark:bg-indigo-900 text-indigo-600 dark:text-indigo-300 h-6 w-6 rounded-full mr-3 flex-shrink-0 font-bold">3</span>
                  <span>Select version type (patch, minor, major) when committing</span>
                </li>
                <li className="flex items-start">
                  <span className="inline-flex items-center justify-center bg-indigo-100 dark:bg-indigo-900 text-indigo-600 dark:text-indigo-300 h-6 w-6 rounded-full mr-3 flex-shrink-0 font-bold">4</span>
                  <span>Create GitHub releases automatically with generated changelogs</span>
                </li>
              </ol>
            </div>

            <div className="mt-6 text-right">
              <Link
                href="/docs/getting-started/quick-start"
                className="inline-flex items-center px-4 py-2 bg-indigo-100 dark:bg-indigo-900 text-indigo-600 dark:text-indigo-300 rounded-lg hover:bg-indigo-200 dark:hover:bg-indigo-800 transition-colors"
              >
                Read full quick start guide
                <svg className="ml-1 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            </div>
          </div>
        </div>
      );
    }
  } catch (error) {
    console.error('Error loading quick start guide:', error);
  }

  // Fallback static content if unable to load from markdown file
  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg p-8 mb-16">
      <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">
        Quick Start Guide
      </h2>
      <div className="prose prose-slate dark:prose-invert max-w-none">
        <h3>Installation</h3>
        <ol>
          <li>Open VS Code</li>
          <li>Go to Extensions (Ctrl+Shift+X)</li>
          <li>Search for &quot;GitHub Version Sync&quot;</li>
          <li>Click Install</li>
        </ol>

        <h3>Configuration</h3>
        <ol>
          <li>Open Command Palette (Ctrl+Shift+P)</li>
          <li>Type &quot;GitHub Version Sync: Open Settings&quot;</li>
          <li>Configure your preferences</li>
        </ol>

        <h3>Basic Usage</h3>
        <ol>
          <li>Make changes to your code</li>
          <li>Open Source Control panel</li>
          <li>Select version type (patch, minor, major)</li>
          <li>Commit your changes</li>
        </ol>

        <div className="mt-6 text-right">
          <Link
            href="/docs/getting-started"
            className="inline-flex items-center text-indigo-600 dark:text-indigo-400 hover:underline"
          >
            Read detailed documentation
            <svg className="ml-1 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function DocsPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-sky-50 dark:from-slate-900 dark:to-slate-800 px-4 py-10">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-16">
          <h1 className="text-4xl md:text-5xl font-bold text-slate-900 dark:text-white mb-4">
            Documentation
          </h1>
          <p className="text-xl text-slate-600 dark:text-slate-300 max-w-3xl mx-auto mb-6">
            Learn how to use GitHub Version Sync to streamline your version management workflow.
          </p>

          <div className="flex justify-center mb-4">
            <Badges className="max-w-2xl" />
          </div>
        </div>

        <div className="mb-16">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-8">
            Documentation Sections
          </h2>
          <Suspense fallback={<Loading />}>
            <DocsList />
          </Suspense>
        </div>

        <Suspense fallback={<Loading />}>
          <QuickStartGuide />
        </Suspense>

        <div className="bg-indigo-600 dark:bg-indigo-700 text-white rounded-xl shadow-lg p-8 text-center">
          <h2 className="text-2xl font-bold mb-4">Ready to get started?</h2>
          <p className="mb-6">Download the extension and streamline your version management workflow today.</p>
          <div className="flex justify-center space-x-4">
            <Link
              href="/downloads"
              className="px-6 py-2 bg-white text-indigo-600 font-medium rounded-lg hover:bg-indigo-50 transition-colors"
            >
              Download
            </Link>
            <Link
              href="https://github.com/Triex/GitHub-Version-Sync"
              target="_blank"
              className="px-6 py-2 bg-indigo-800 font-medium rounded-lg hover:bg-indigo-900 transition-colors flex items-center"
            >
              View Source
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
