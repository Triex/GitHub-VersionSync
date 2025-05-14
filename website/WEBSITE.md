# GitHub Version Sync - Website Plan

## Tech Stack

- **Framework**: Next.js 15 with App Router
- **Styling**: Tailwind CSS + shadcn/ui for components
- **Deployment**: Vercel
- **Content**: MDX for documentation (converts Markdown to React components)
- **Analytics**: Vercel Analytics

## Project Structure

```
/website                  # Root directory (could be in same repo or separate)
├── /app                  # Next.js App Router
│   ├── /page.tsx         # Home page (server component)
│   ├── /docs             # Documentation section
│   │   ├── /[slug]       # Dynamic route for doc pages
│   │   │   └── page.tsx  # Dynamic docs page
│   │   └── /page.tsx     # Docs index page
│   └── /layout.tsx       # Root layout
├── /components           # React components
│   ├── /ui               # UI components (buttons, cards, etc.)
│   ├── /layout           # Layout components (header, footer, etc.)
│   └── /features         # Feature-specific components
├── /content              # Content files (MDX)
│   └── /docs             # Documentation content
├── /lib                  # Utility functions, types, etc.
│   ├── /mdx              # MDX processing utilities
│   └── /utils            # General utilities
└── /public               # Static assets
    ├── /images           # Images
    └── /videos           # Demo videos
```

## Site Structure

### Home Page (`/`)

- **Hero Section**: Clean, modern design with the extension's icon, name, and a concise description
- **Features Grid**: Visual representation of key features with icons and short descriptions
- **Demo Section**: Interactive demo or video showing the extension in action
- **Testimonials**: User feedback and reviews (can be added later)
- **CTA Section**: Links to VSCode Marketplace, GitHub repo, and documentation
- **FAQ Section**: Common questions about the extension

### Documentation (`/docs`)

- **Introduction**: Quick start guide
- **Features**: Detailed explanation of all features
- **Configuration**: How to configure the extension
- **Troubleshooting**: Common issues and solutions
- **API Reference**: For developers who want to extend functionality

## Implementation Details

### Server Components & Actions

```tsx
// app/page.tsx
export default async function HomePage() {
  // This is a server component (implicit with Next.js 15)
  const extensionData = await getExtensionData(); // Server-side data fetching

  return (
    <div className="container">
      <HeroSection data={extensionData} />
      <FeaturesGrid features={extensionData.features} />
      <DemoSection />
      <DownloadCTA />
    </div>
  );
}
```

### Client Components for Interactivity

```tsx
// components/features/DemoSection.tsx
'use client'; // Explicitly mark as client component

import { useState } from 'react';

export default function DemoSection() {
  const [currentDemo, setCurrentDemo] = useState('version-update');

  return (
    <div className="demo-container">
      <DemoTabs current={currentDemo} onChange={setCurrentDemo} />
      <DemoDisplay demo={currentDemo} />
    </div>
  );
}
```

### Server Actions for Forms

```tsx
// app/actions.ts
'use server';

export async function subscribeToNewsletter(formData: FormData) {
  const email = formData.get('email') as string;

  try {
    await addSubscriber(email);
    return { success: true };
  } catch (error) {
    return { success: false, error: 'Failed to subscribe' };
  }
}
```

### Dynamic Documentation with MDX

```tsx
// app/docs/[slug]/page.tsx
import { MDXRemote } from 'next-mdx-remote/rsc';
import { getDocBySlug, getAllDocs } from '@/lib/mdx';

export async function generateStaticParams() {
  const docs = await getAllDocs();
  return docs.map(doc => ({ slug: doc.slug }));
}

export default async function DocPage({ params }: { params: { slug: string } }) {
  const doc = await getDocBySlug(params.slug);

  return (
    <article className="prose lg:prose-xl dark:prose-invert">
      <h1>{doc.title}</h1>
      <MDXRemote source={doc.content} />
    </article>
  );
}
```

## Loading States with Suspense

```tsx
// app/docs/page.tsx
import { Suspense } from 'react';
import Loading from './loading';

export default function DocsPage() {
  return (
    <div className="container">
      <h1>Documentation</h1>
      <Suspense fallback={<Loading />}>
        <DocsList />
      </Suspense>
    </div>
  );
}
```

## Responsive Design

- Mobile-first approach using Tailwind's responsive classes
- Dark mode support with Tailwind's dark mode utilities
- Accessible UI with proper ARIA attributes and keyboard navigation

## SEO Optimization

```tsx
// app/layout.tsx
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'GitHub Version Sync - Streamline version management in VS Code',
  description: 'Automatically update version numbers, create git tags, and publish GitHub releases with just a few clicks.',
  openGraph: {
    type: 'website',
    url: 'https://github-version-sync.dev',
    title: 'GitHub Version Sync',
    description: 'Streamline version management in VS Code',
    images: [{ url: '/images/og-image.png' }],
  },
};
```

## Repository Strategy

### Option 1: Same Repository (Recommended)

**Pros:**
- Single source of truth for extension and website
- Easier to keep documentation in sync
- Simplifies contribution process
- Can set up automated deployment when extension changes

**Implementation:**
```
/GitHub-VersionSync
├── /src                 # Extension source code
├── /website             # Website code
├── package.json         # Extension package.json
└── README.md            # Main README
```

### Option 2: Separate Repository

**Pros:**
- Clean separation of concerns
- Independent versioning and release cycles
- Focused PRs and issues for each project

**Implementation:**
- Main repo: `GitHub-Version-Sync`
- Website repo: `GitHub-Version-Sync-Website`
- Use GitHub Actions to sync documentation between repositories

## Development Plan

1. **Phase 1: Setup & Home Page**
   - Set up Next.js 15 project with App Router
   - Create basic layout components
   - Implement home page with key sections
   - Set up Tailwind CSS and component library

2. **Phase 2: Documentation System**
   - Implement MDX parsing and rendering
   - Create dynamic page routing for docs
   - Convert existing README to MDX format
   - Build documentation navigation

3. **Phase 3: Interactive Features**
   - Add interactive demos of the extension
   - Implement dark/light mode toggle
   - Add animations and transitions
   - Implement analytics

4. **Phase 4: Deployment & Optimization**
   - Set up Vercel deployment
   - Optimize images and assets
   - Implement SEO and social sharing
   - Performance testing and optimization

## Next Steps

1. Decide on repository strategy (same or separate)
2. Set up initial Next.js 15 project
3. Design basic wireframes for home page and docs
4. Start implementing the home page with core sections

## Domain Options

Consider one of these domain names for the website:
- github-version-sync.dev
- gvsync.dev
- version-sync.dev
- ghversionsync.com
