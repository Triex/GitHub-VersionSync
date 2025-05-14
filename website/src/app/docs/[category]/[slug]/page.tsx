import { getDocBySlug } from '@/lib/markdown';
import { MarkdownContent } from '@/components/documentation/MarkdownContent';
import { Badges } from '@/components/ui/Badges';
import Link from 'next/link';
import { notFound } from 'next/navigation';


// Simple type for params
type CategorySlugParams = {
  category: string;
  slug: string;
};

// Generate metadata for the page
export async function generateMetadata({ params }: { params: CategorySlugParams }) {
  const { category, slug } = params;

  try {
    const doc = await getDocBySlug(category, slug);

    if (!doc) {
      return { title: 'Not Found' };
    }

    return {
      title: doc.title,
      description: doc.title || 'Documentation',
    };
  } catch (error) {
    console.error('Metadata error:', error);
    return { title: 'Error' };
  }
}

// Simple page component
export default async function Page({ params }: { params: CategorySlugParams }) {
  // Extract params
  const { category, slug } = params;

  try {
    // Get doc
    const doc = await getDocBySlug(category, slug);

    if (!doc) {
      notFound();
    }

    // Simple navigation without prev/next
    return (
      <div className="max-w-4xl mx-auto py-4 sm:py-6 lg:py-10 px-2 sm:px-4 lg:px-8">
        <div className="flex justify-center mb-6">
          <Badges />
        </div>

        <nav className="mb-8">
          <Link href="/docs" className="text-blue-500 hover:text-blue-600 flex items-center gap-1">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Documentation
          </Link>
        </nav>

        <article className="prose dark:prose-invert max-w-none">
          {/* 
            Check if content already has a title heading (any of these conditions):
            1. Starts with "# Title" (exact match)
            2. First non-empty line after front matter is a level 1 heading
          */}
          {(() => {
            // Remove front matter if present (between --- markers)
            const contentWithoutFrontMatter = doc.content.replace(/^---[\s\S]*?---\s*/m, '').trim();
            
            // Check for heading at the start
            const hasLeadingH1 = !!contentWithoutFrontMatter.match(/^#\s+.+/m);
            
            // If first line is a heading, check if it approximately matches our title
            let firstHeading = '';
            if (hasLeadingH1) {
              const headingMatch = contentWithoutFrontMatter.match(/^#\s+(.+)$/m);
              if (headingMatch && headingMatch[1]) {
                firstHeading = headingMatch[1].trim();
              }
            }
            
            // Check if first heading is similar to title (exact match or substring)
            const isHeadingSimilarToTitle = 
              firstHeading.toLowerCase() === doc.title.toLowerCase() || 
              firstHeading.toLowerCase().includes(doc.title.toLowerCase()) ||
              doc.title.toLowerCase().includes(firstHeading.toLowerCase());
            
            // Only show title if there's no similar heading already in the content
            return !hasLeadingH1 || !isHeadingSimilarToTitle ? (
              <h1 className="text-3xl md:text-4xl font-bold mb-6">{doc.title}</h1>
            ) : null;
          })()} 
          <MarkdownContent content={doc.content} />
        </article>
      </div>
    );
  } catch (error) {
    console.error('Page render error:', error);
    return <div>Error loading documentation</div>;
  }
}
