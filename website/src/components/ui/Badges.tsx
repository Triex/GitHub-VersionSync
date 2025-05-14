'use client';

import React from 'react';
import Image from 'next/image';
import Link from 'next/link';

type BadgeProps = {
  className?: string;
};

export function Badges({ className = '' }: BadgeProps) {
  return (
    <div className={`flex flex-wrap justify-center gap-2 ${className}`}>
      {/* Marketplace Badges */}
      <Link
        href="https://marketplace.visualstudio.com/items?itemName=TriexDev.github-versionsync"
        target="_blank"
        className="transition-transform hover:scale-105"
      >
        <Image
          src="https://img.shields.io/visual-studio-marketplace/v/TriexDev.github-versionsync?style=flat-square&logo=visualstudiocode&logoColor=white&label=Marketplace&labelColor=007ACC"
          alt="VS Code Marketplace"
          width={130}
          height={20}
        />
      </Link>

      <Link
        href="https://marketplace.visualstudio.com/items?itemName=TriexDev.github-versionsync"
        target="_blank"
        className="transition-transform hover:scale-105"
      >
        <Image
          src="https://img.shields.io/visual-studio-marketplace/i/TriexDev.github-versionsync?style=flat-square&logo=visualstudiocode&logoColor=white&label=Installs&labelColor=007ACC"
          alt="VS Code Installs"
          width={120}
          height={20}
        />
      </Link>

      <Link
        href="https://github.com/Triex/github-version-sync/blob/master/LICENSE"
        target="_blank"
        className="transition-transform hover:scale-105"
      >
        <Image
          src="https://img.shields.io/badge/License-Code_With_Credit-blue?style=flat-square"
          alt="License"
          width={130}
          height={20}
        />
      </Link>

      {/* Technology Stack Badges */}
      <Link
        href="https://www.typescriptlang.org/"
        target="_blank"
        className="transition-transform hover:scale-105"
      >
        <Image
          src="https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white"
          alt="TypeScript"
          width={100}
          height={20}
        />
      </Link>

      <Link
        href="https://code.visualstudio.com/api"
        target="_blank"
        className="transition-transform hover:scale-105"
      >
        <Image
          src="https://img.shields.io/badge/VS_Code_API-007ACC?style=flat-square&logo=visualstudiocode&logoColor=white"
          alt="VS Code API"
          width={100}
          height={20}
        />
      </Link>

      <Link
        href="https://nodejs.org/"
        target="_blank"
        className="transition-transform hover:scale-105"
      >
        <Image
          src="https://img.shields.io/badge/Node.js-339933?style=flat-square&logo=node.js&logoColor=white"
          alt="Node.js"
          width={85}
          height={20}
        />
      </Link>

      {/* Repository Badges */}
      <Link
        href="https://github.com/Triex/GitHub-VersionSync/stargazers"
        target="_blank"
        className="transition-transform hover:scale-105"
      >
        <Image
          src="https://img.shields.io/github/stars/Triex/GitHub-VersionSync?style=flat-square&logo=github"
          alt="GitHub Stars"
          width={100}
          height={20}
        />
      </Link>

      <Link
        href="https://github.com/Triex/GitHub-VersionSync/releases"
        target="_blank"
        className="transition-transform hover:scale-105"
      >
        <Image
          src="https://img.shields.io/github/release-date/Triex/GitHub-VersionSync?style=flat-square&logo=github"
          alt="GitHub Release Date"
          width={130}
          height={20}
        />
      </Link>
    </div>
  );
}
