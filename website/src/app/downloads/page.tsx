'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface Release {
  id: number;
  tag_name: string;
  name: string;
  published_at: string;
  html_url: string;
  body: string;
  assets: Array<{
    id: number;
    name: string;
    browser_download_url: string;
    size: number;
    download_count: number;
    content_type: string;
    created_at: string;
  }>;
}

export default function DownloadPage() {
  const [releases, setReleases] = useState<Release[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedReleases, setExpandedReleases] = useState<{[key: number]: boolean}>({});

  useEffect(() => {
    const fetchReleases = async () => {
      try {
        setLoading(true);
        const res = await fetch('https://api.github.com/repos/Triex/GitHub-VersionSync/releases');

        if (!res.ok) {
          throw new Error(`Failed to fetch releases: ${res.status}`);
        }

        const data = await res.json();
        setReleases(data);

        // Auto-expand the latest release if available
        if (data && data.length > 0) {
          setExpandedReleases(prev => ({
            ...prev,
            [data[0].id]: true // Expand the first (latest) release
          }));
        }
      } catch (err) {
        console.error('Error fetching releases:', err);
        setError(err instanceof Error ? err.message : 'Unknown error occurred');
      } finally {
        setLoading(false);
      }
    };

    fetchReleases();
  }, []);

  // Format the date
  const formatDate = (dateString: string) => {
    const options: Intl.DateTimeFormatOptions = {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    };
    return new Date(dateString).toLocaleDateString(undefined, options);
  };

  // Format file size
  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-sky-50 dark:from-slate-900 dark:to-slate-800 px-4 py-10">
      <div className="max-w-5xl mx-auto">
        <div className="mb-8">
          <Link
            href="/"
            className="inline-flex items-center text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 font-medium transition-colors"
          >
            <svg
              className="mr-2 h-5 w-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10 19l-7-7m0 0l7-7m-7 7h18"
              />
            </svg>
            Back to Home
          </Link>
        </div>
        <div className="text-center mb-16">
          <h1 className="text-4xl md:text-5xl font-bold text-slate-900 dark:text-white mb-4">
            Download GitHub Version Sync
          </h1>
          <p className="text-xl text-slate-600 dark:text-slate-300 max-w-3xl mx-auto">
            Get the latest version of our VS Code extension for seamless version
            management and GitHub releases.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-8 mb-16">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg p-8 transform transition-transform hover:scale-[1.02]">
            <div className="mb-4">
              <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2 flex items-center">
                VSCode Extension
                <span className="ml-2 px-2 py-1 text-xs font-semibold bg-amber-500 text-white rounded-full">Coming Soon</span>
              </h2>
              <p className="text-slate-600 dark:text-slate-300">
                Install our VSCode extension directly from the marketplace for
                automatic updates.
              </p>
            </div>
            <div className="flex justify-between items-center">
              <div>
                <button
                  disabled
                  className="inline-flex items-center px-4 py-2 bg-gray-400 text-white rounded-lg cursor-not-allowed opacity-75"
                >
                  <svg
                    className="mr-2 h-5 w-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                    />
                  </svg>
                  Install from Marketplace
                </button>
              </div>
              <div className="text-sm text-slate-500 dark:text-slate-400">
                For VSCode 1.80+
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg p-8 transform transition-transform hover:scale-[1.02]">
            <div className="mb-4">
              <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
                Manual Installation
              </h2>
              <p className="text-slate-600 dark:text-slate-300">
                Download the VSIX package and install manually using the VS Code
                extensions menu.
              </p>
            </div>
            <div className="flex justify-between items-center">
              <Link
                href="https://github.com/Triex/GitHub-VersionSync/releases"
                target="_blank"
                className="inline-flex items-center px-4 py-2 bg-sky-600 text-white rounded-lg hover:bg-sky-700 transition-colors"
              >
                <svg
                  className="mr-2 h-5 w-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
                  />
                </svg>
                GitHub Releases
              </Link>
              <div className="text-sm text-slate-500 dark:text-slate-400">
                For offline installation
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg overflow-hidden mb-16">
          <div className="p-6 border-b border-slate-200 dark:border-slate-700">
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center">
              <svg
                className="h-5 w-5 mr-2"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              Latest Releases
            </h2>
          </div>

          <div className="p-6">
            {loading ? (
              <div className="flex justify-center items-center p-12">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500"></div>
              </div>
            ) : error ? (
              <div className="p-6 text-center text-red-500">
                <p>Error loading releases: {error}</p>
                <Link
                  href="https://github.com/Triex/GitHub-VersionSync/releases"
                  target="_blank"
                  className="block mt-4 text-indigo-500 hover:underline"
                >
                  View releases on GitHub instead
                </Link>
              </div>
            ) : releases.length === 0 ? (
              <div className="p-6 text-center text-slate-600 dark:text-slate-400">
                <p>No releases found. Check back soon!</p>
                <Link
                  href="https://github.com/Triex/GitHub-VersionSync"
                  target="_blank"
                  className="block mt-4 text-indigo-500 hover:underline"
                >
                  Go to GitHub repository
                </Link>
              </div>
            ) : (
              <div className="space-y-8">
                {releases.map((release) => (
                  <div
                    key={release.id}
                    className="border-b border-slate-200 dark:border-slate-700 pb-8 last:border-0 last:pb-0"
                  >
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <h3 className="text-xl font-bold text-slate-900 dark:text-white">
                          {release.name || release.tag_name}
                        </h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                          Released on {formatDate(release.published_at)}
                        </p>
                      </div>
                      <Link
                        href={release.html_url}
                        target="_blank"
                        className="text-indigo-500 hover:underline text-sm inline-flex items-center"
                      >
                        <svg
                          className="h-4 w-4 mr-1"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                          xmlns="http://www.w3.org/2000/svg"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                          />
                        </svg>
                        View on GitHub
                      </Link>
                    </div>

                    <div className="prose prose-slate dark:prose-invert max-w-none text-sm mb-4">
                      {/* Display release notes with proper markdown rendering */}
                      {release.body ? (
                        <>
                          <div
                            className={
                              expandedReleases[release.id]
                                ? ""
                                : "max-h-28 overflow-hidden relative"
                            }
                          >
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                              {release.body}
                            </ReactMarkdown>
                            {!expandedReleases[release.id] && (
                              <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-white dark:from-slate-800 to-transparent"></div>
                            )}
                          </div>
                          <button
                            onClick={() =>
                              setExpandedReleases((prev) => ({
                                ...prev,
                                [release.id]: !prev[release.id],
                              }))
                            }
                            className="text-indigo-500 dark:text-indigo-400 text-xs font-medium mt-2 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors flex items-center"
                          >
                            {expandedReleases[release.id] ? (
                              <>
                                <svg
                                  className="w-4 h-4 mr-1"
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                  xmlns="http://www.w3.org/2000/svg"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M5 15l7-7 7 7"
                                  />
                                </svg>
                                Show Less
                              </>
                            ) : (
                              <>
                                <svg
                                  className="w-4 h-4 mr-1"
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                  xmlns="http://www.w3.org/2000/svg"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M19 9l-7 7-7-7"
                                  />
                                </svg>
                                Show More
                              </>
                            )}
                          </button>
                        </>
                      ) : (
                        <p>No release notes available.</p>
                      )}
                    </div>

                    {release.assets.length > 0 ? (
                      <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg">
                        <div className="grid grid-cols-1 gap-1">
                          {release.assets.map((asset) => (
                            <div
                              key={asset.id}
                              className="p-3 flex justify-between items-center hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
                            >
                              <div className="flex-1">
                                <p className="font-medium text-slate-900 dark:text-white">
                                  {asset.name}
                                </p>
                                <div className="flex text-xs text-slate-500 dark:text-slate-400 space-x-4">
                                  <span>{formatSize(asset.size)}</span>
                                  <span>{asset.download_count} downloads</span>
                                </div>
                              </div>
                              <a
                                href={asset.browser_download_url}
                                className="ml-4 px-3 py-1.5 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-lg text-sm font-medium hover:bg-indigo-200 dark:hover:bg-indigo-900/50 transition-colors inline-flex items-center"
                              >
                                <svg
                                  className="h-4 w-4 mr-1"
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                  xmlns="http://www.w3.org/2000/svg"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                                  />
                                </svg>
                                Download
                              </a>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="text-sm text-slate-500 dark:text-slate-400 italic">
                        No downloads available for this release
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="bg-indigo-600 dark:bg-indigo-700 text-white rounded-xl shadow-lg p-8 text-center">
          <h2 className="text-2xl font-bold mb-4">
            Need help getting started?
          </h2>
          <p className="mb-6">
            Check out our comprehensive documentation and setup guide.
          </p>
          <div className="flex justify-center space-x-4">
            <Link
              href="/docs"
              // inverse of the github button
              className="px-6 py-3 bg-black text-white dark:bg-white dark:text-black font-medium rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors flex items-center hover:dark:text-white"
            >
              <svg
                className="w-5 h-5 mr-2"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 10V3L4 14h7v7l9-5h-7z"
                />
              </svg>
              View Docs
            </Link>
            <Link
              href="https://github.com/Triex/GitHub-VersionSync"
              target="_blank"
              className="px-6 py-3 bg-white text-slate-800 dark:bg-slate-800 dark:text-white font-medium rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors flex items-center"
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
      </div>
    </div>
  );
}
