import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';

// Types for our documentation
export interface DocItem {
  title: string;
  slug: string;
  category: string;
  excerpt: string;
  content: string;
  order?: number;
}

export interface DocCategory {
  name: string;
  slug: string;
}

const contentDirectory = path.join(process.cwd(), 'src/content/docs');

/**
 * Get all documentation categories
 */
export async function getDocCategories(): Promise<DocCategory[]> {
  try {
    // Create the content directory if it doesn't exist
    if (!fs.existsSync(contentDirectory)) {
      fs.mkdirSync(contentDirectory, { recursive: true });
      return [];
    }
    
    const categories = fs
      .readdirSync(contentDirectory)
      .filter((dir) => fs.statSync(path.join(contentDirectory, dir)).isDirectory())
      .map((dir) => ({
        name: dir.replace(/-/g, ' '),
        slug: dir,
      }));

    // Sort categories with getting-started first
    return categories.sort((a, b) => {
      if (a.slug === 'getting-started') return -1;
      if (b.slug === 'getting-started') return 1;
      return a.name.localeCompare(b.name);
    });
  } catch (error) {
    console.error('Error getting documentation categories:', error);
    return [];
  }
}

/**
 * Get all documentation items
 */
export async function getAllDocs(): Promise<DocItem[]> {
  try {
    const categories = await getDocCategories();
    
    if (categories.length === 0) {
      return [];
    }
    
    const allDocs = categories.flatMap((category) => {
      const categoryPath = path.join(contentDirectory, category.slug);
      
      if (!fs.existsSync(categoryPath)) {
        return [];
      }
      
      return fs.readdirSync(categoryPath)
        .filter((file) => file.endsWith('.md'))
        .map((file) => {
          const filePath = path.join(categoryPath, file);
          const slug = file.replace(/\.md$/, '');
          
          const fileContent = fs.readFileSync(filePath, 'utf8');
          const { data, content } = matter(fileContent);
          
          return {
            title: data.title || slug.replace(/-/g, ' '),
            slug,
            category: category.slug,
            excerpt: data.excerpt || '',
            content,
            order: parseInt(data.order as string) || 999,
          };
        });
    });
    
    // Sort by category order and then by document order
    return allDocs.sort((a, b) => {
      // First sort by category
      if (a.category === 'getting-started' && b.category !== 'getting-started') return -1;
      if (a.category !== 'getting-started' && b.category === 'getting-started') return 1;
      
      if (a.category !== b.category) return a.category.localeCompare(b.category);
      
      // Then sort by order within category
      return (a.order || 999) - (b.order || 999);
    });
  } catch (error) {
    console.error('Error getting all documentation:', error);
    return [];
  }
}

/**
 * Get documents by category
 */
export async function getDocsByCategory(category: string): Promise<DocItem[]> {
  try {
    const allDocs = await getAllDocs();
    return allDocs
      .filter((doc) => doc.category === category)
      .sort((a, b) => (a.order || 999) - (b.order || 999));
  } catch (error) {
    console.error(`Error getting documents for category ${category}:`, error);
    return [];
  }
}

/**
 * Get a specific document by category and slug
 */
export async function getDocBySlug(category: string, slug: string): Promise<DocItem | null> {
  try {
    const filePath = path.join(contentDirectory, category, `${slug}.md`);
    
    if (!fs.existsSync(filePath)) {
      return null;
    }
    
    const fileContent = fs.readFileSync(filePath, 'utf8');
    const { data, content } = matter(fileContent);
    
    return {
      title: data.title || slug.replace(/-/g, ' '),
      slug,
      category,
      excerpt: data.excerpt || '',
      content,
      order: parseInt(data.order as string) || 999,
    };
  } catch (error) {
    console.error(`Error getting document ${category}/${slug}:`, error);
    return null;
  }
}
