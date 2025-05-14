import { Badges } from '@/components/ui/Badges';
import Image from 'next/image';
import Link from 'next/link';

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center bg-gradient-to-b from-slate-50 to-sky-50 dark:from-slate-900 dark:to-slate-800">
      {/* Hero Section */}
      <div className="w-full bg-gradient-to-r from-blue-600 to-indigo-700 dark:from-blue-800 dark:to-indigo-900">
        <div className="max-w-7xl mx-auto py-20 px-4 sm:px-6 lg:px-8 text-center">
          <div className="relative h-24 w-24 mx-auto mb-6">
            <Image
              src="/images/icon.svg"
              alt="GitHub Version Sync Logo"
              fill
              className="object-contain"
              priority
            />
          </div>
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold text-white mb-6">
            GitHub Version Sync
          </h1>
          <p className="text-xl md:text-2xl text-blue-100 max-w-3xl mx-auto mb-6">
            Streamline version management and GitHub releases directly from VS
            Code.
          </p>

          {/* Badges */}
          <div className="mb-10 flex justify-center">
            <Badges className="max-w-2xl" />
          </div>
          <div className="flex flex-wrap justify-center gap-4">
            <Link
              // href="https://marketplace.visualstudio.com/items?itemName=TriexDev.github-versionsync"
              // target="_blank"
              // rel="noopener noreferrer"
              href="/downloads"
              className="px-6 py-3 bg-white text-blue-700 font-semibold rounded-lg shadow-md hover:bg-blue-50 transition-colors duration-300"
            >
              Get Extension
            </Link>
            <Link
              href="/docs"
              className="px-6 py-3 bg-indigo-700 text-white font-semibold rounded-lg shadow-md hover:bg-indigo-800 transition-colors duration-300"
            >
              Documentation
            </Link>
            {/* <Link
              href="/downloads"
              className="px-6 py-3 bg-blue-800 text-white font-semibold rounded-lg shadow-md hover:bg-blue-900 transition-colors duration-300"
            >
              Download Releases
            </Link> */}
          </div>
        </div>
      </div>

      {/* Features Section */}
      <div className="max-w-7xl mx-auto py-20 px-4 sm:px-6 lg:px-8">
        <h2 className="text-3xl font-bold text-slate-900 dark:text-white text-center mb-16">
          Streamline Your Version Management
        </h2>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
          {/* Feature 1 */}
          <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-lg transform transition-transform hover:scale-105">
            <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center mb-4">
              <svg
                className="w-6 h-6 text-blue-600 dark:text-blue-300"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 6v6m0 0v6m0-6h6m-6 0H6"
                />
              </svg>
            </div>
            <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">
              Automatic Version Management
            </h3>
            <p className="text-slate-600 dark:text-slate-300">
              One-click version bumping with support for major, minor, and patch
              updates following semantic versioning.
            </p>
          </div>

          {/* Feature 2 */}
          <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-lg transform transition-transform hover:scale-105">
            <div className="w-12 h-12 bg-indigo-100 dark:bg-indigo-900 rounded-full flex items-center justify-center mb-4">
              <svg
                className="w-6 h-6 text-indigo-600 dark:text-indigo-300"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10"
                />
              </svg>
            </div>
            <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">
              GitHub Release Integration
            </h3>
            <p className="text-slate-600 dark:text-slate-300">
              Create and publish GitHub releases directly from VS Code with
              auto-generated release notes.
            </p>
          </div>

          {/* Feature 3 */}
          <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-lg transform transition-transform hover:scale-105">
            <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900 rounded-full flex items-center justify-center mb-4">
              <svg
                className="w-6 h-6 text-purple-600 dark:text-purple-300"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"
                />
              </svg>
            </div>
            <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">
              Git Tag Automation
            </h3>
            <p className="text-slate-600 dark:text-slate-300">
              Automatically create and push Git tags with customizable prefixes
              when versions are updated.
            </p>
          </div>

          {/* Feature 4 */}
          <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-lg transform transition-transform hover:scale-105">
            <div className="w-12 h-12 bg-green-100 dark:bg-green-900 rounded-full flex items-center justify-center mb-4">
              <svg
                className="w-6 h-6 text-green-600 dark:text-green-300"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
            </div>
            <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">
              Flexible Configuration
            </h3>
            <p className="text-slate-600 dark:text-slate-300">
              Customize version file locations, release triggers, and tag
              formats to match your workflow.
            </p>
          </div>
        </div>
      </div>

      {/* Demo Section */}
      <div className="w-full bg-slate-100 dark:bg-slate-900">
        <div className="max-w-7xl mx-auto py-20 px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-slate-900 dark:text-white mb-4">
              See It In Action
            </h2>
            <p className="text-lg text-slate-600 dark:text-slate-300 max-w-3xl mx-auto">
              GitHub Version Sync integrates seamlessly with your VS Code
              workflow, making version management a breeze.
            </p>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl overflow-hidden max-w-[600px] mx-auto">
            <div className="aspect-video relative">
              <div className="relative w-full h-full">
                <Image
                  src="/images/version-panel.png"
                  alt="GitHub Version Sync Demo"
                  fill
                  className="object-cover"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* CTA Section */}
      <div className="w-full bg-blue-600 dark:bg-blue-800">
        <div className="max-w-7xl mx-auto py-16 px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl font-bold text-white mb-4">
            Ready to streamline your version management?
          </h2>
          <p className="text-xl text-blue-100 max-w-3xl mx-auto mb-8">
            Install GitHub Version Sync today and simplify your release process.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Link
              // href="https://marketplace.visualstudio.com/items?itemName=TriexDev.github-versionsync"
              // target="_blank"
              // rel="noopener noreferrer"
              href="/downloads"
              className="px-6 py-3 bg-white text-blue-700 font-semibold rounded-lg shadow-md hover:bg-blue-50 transition-colors duration-300"
            >
              Get Extension
            </Link>
            <Link
              href="/docs"
              className="px-6 py-3 bg-indigo-700 text-white font-semibold rounded-lg shadow-md border border-indigo-400 hover:bg-indigo-800 transition-colors duration-300"
            >
              Read Docs
            </Link>
            <a
              href="https://github.com/Triex/GitHub-VersionSync"
              target="_blank"
              rel="noopener noreferrer"
              className="px-6 py-3 bg-blue-800 text-white font-semibold rounded-lg shadow-md border border-blue-400 hover:bg-blue-900 transition-colors duration-300"
            >
              View Source
            </a>
          </div>
        </div>
      </div>
    </main>
  );
}
