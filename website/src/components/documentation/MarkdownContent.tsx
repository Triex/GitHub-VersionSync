'use client';

import React from 'react';
import dynamic from 'next/dynamic';

// Dynamically import ESM modules to avoid issues
const MDXRemote = dynamic(() => import('next-mdx-remote').then(mod => mod.MDXRemote));

// Import types
import type { MDXRemoteSerializeResult } from 'next-mdx-remote';

// Async imports for the server component
async function serializeMdx(content: string) {
  const { serialize } = await import('next-mdx-remote/serialize');
  const remarkGfm = await import('remark-gfm');
  const rehypeHighlight = await import('rehype-highlight');
  
  return serialize(content, {
    mdxOptions: {
      remarkPlugins: [remarkGfm.default],
      rehypePlugins: [rehypeHighlight.default],
    },
  });
}

interface MarkdownContentProps {
  content: string;
}

export function MarkdownContent({ content }: MarkdownContentProps) {
  // Use the proper type from the dynamic import
  const [mdxSource, setMdxSource] = React.useState<MDXRemoteSerializeResult | null>(null);

  React.useEffect(() => {
    // Use our defined serializeMdx function
    const parseMdx = async () => {
      try {
        const result = await serializeMdx(content);
        setMdxSource(result);
      } catch (error) {
        console.error('Error processing markdown:', error);
      }
    };

    parseMdx();
  }, [content]);

  if (!mdxSource) {
    return (
      <div className="animate-pulse">
        <div className="h-6 bg-slate-700/20 rounded w-3/4 mb-4"></div>
        <div className="h-4 bg-slate-700/20 rounded w-full mb-2"></div>
        <div className="h-4 bg-slate-700/20 rounded w-5/6 mb-2"></div>
        <div className="h-4 bg-slate-700/20 rounded w-4/5 mb-6"></div>
        <div className="h-24 bg-slate-700/10 rounded w-full mb-4"></div>
      </div>
    );
  }

  return (
    <article className="prose prose-slate dark:prose-invert max-w-none 
      prose-headings:text-indigo-600 dark:prose-headings:text-indigo-300
      prose-a:text-indigo-600 dark:prose-a:text-indigo-300 prose-a:no-underline hover:prose-a:underline
      prose-code:text-indigo-600 dark:prose-code:text-indigo-300
      prose-pre:bg-slate-800 prose-pre:text-slate-200 prose-pre:shadow-lg
      prose-img:rounded-xl prose-img:shadow-lg">
      <MDXRemote {...mdxSource} />
    </article>
  );
}
