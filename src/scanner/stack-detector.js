import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

const FRAMEWORK_MAP = {
  next: { name: 'Next.js', type: 'fullstack' },
  '@nestjs/core': { name: 'NestJS', type: 'api' },
  express: { name: 'Express', type: 'api' },
  fastify: { name: 'Fastify', type: 'api' },
  '@hono/node-server': { name: 'Hono', type: 'api' },
  hono: { name: 'Hono', type: 'api' },
  react: { name: 'React', type: 'spa' },
  vue: { name: 'Vue', type: 'spa' },
  '@angular/core': { name: 'Angular', type: 'spa' },
  svelte: { name: 'Svelte', type: 'spa' },
  remix: { name: 'Remix', type: 'fullstack' },
  '@remix-run/node': { name: 'Remix', type: 'fullstack' },
  astro: { name: 'Astro', type: 'fullstack' },
};

const ORM_MAP = {
  prisma: 'Prisma',
  '@prisma/client': 'Prisma',
  typeorm: 'TypeORM',
  drizzle: 'Drizzle',
  'drizzle-orm': 'Drizzle',
  sequelize: 'Sequelize',
  mongoose: 'Mongoose',
  knex: 'Knex',
  '@mikro-orm/core': 'MikroORM',
};

const DB_MAP = {
  pg: 'PostgreSQL', '@neondatabase/serverless': 'PostgreSQL (Neon)',
  mysql2: 'MySQL', mysql: 'MySQL',
  'better-sqlite3': 'SQLite', 'sqlite3': 'SQLite',
  mongodb: 'MongoDB', mongoose: 'MongoDB',
  redis: 'Redis', ioredis: 'Redis',
};

const TEST_MAP = {
  vitest: 'Vitest', jest: 'Jest', mocha: 'Mocha',
  '@playwright/test': 'Playwright', cypress: 'Cypress',
};

const UI_MAP = {
  '@shadcn/ui': 'shadcn/ui', '@radix-ui/react-primitive': 'shadcn/ui',
  '@mui/material': 'Material UI', 'antd': 'Ant Design',
  '@chakra-ui/react': 'Chakra UI', 'tailwindcss': 'Tailwind CSS',
};

export function detectStack(cwd, configFiles) {
  const pkgPath = join(cwd, 'package.json');
  if (!existsSync(pkgPath)) return { language: 'Unknown', framework: null };

  let pkg;
  try {
    pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  } catch {
    return { language: 'Unknown', framework: null };
  }

  const allDeps = {
    ...pkg.dependencies,
    ...pkg.devDependencies,
    ...pkg.peerDependencies,
  };

  const hasTsConfig = configFiles.some((f) => f.includes('tsconfig'));
  const language = hasTsConfig || allDeps.typescript ? 'TypeScript' : 'JavaScript';

  const framework = detectFramework(allDeps);
  const orm = detectByMap(allDeps, ORM_MAP);
  const database = detectByMap(allDeps, DB_MAP);
  const testFramework = detectByMap(allDeps, TEST_MAP);
  const uiLibrary = detectByMap(allDeps, UI_MAP);
  const packageManager = detectPackageManager(cwd);
  const buildTool = detectBuildTool(allDeps, configFiles);

  const keyDeps = extractKeyDeps(allDeps, framework?.name);

  return {
    language,
    runtime: 'Node.js',
    framework,
    orm,
    database,
    testFramework,
    uiLibrary,
    packageManager,
    buildTool,
    keyDeps,
    projectName: pkg.name || null,
    version: pkg.version || null,
  };
}

function detectFramework(deps) {
  for (const [pkg, meta] of Object.entries(FRAMEWORK_MAP)) {
    if (deps[pkg]) {
      const version = deps[pkg].replace(/[^0-9.]/g, '');
      return { ...meta, version, package: pkg };
    }
  }
  return null;
}

function detectByMap(deps, map) {
  for (const [pkg, name] of Object.entries(map)) {
    if (deps[pkg]) return name;
  }
  return null;
}

function detectPackageManager(cwd) {
  if (existsSync(join(cwd, 'pnpm-lock.yaml'))) return 'pnpm';
  if (existsSync(join(cwd, 'yarn.lock'))) return 'yarn';
  if (existsSync(join(cwd, 'bun.lockb'))) return 'bun';
  return 'npm';
}

function detectBuildTool(deps, configFiles) {
  if (configFiles.some((f) => f.includes('vite.config'))) return 'Vite';
  if (deps.turbopack || configFiles.some((f) => f.includes('turbo.json'))) return 'Turbopack';
  if (deps.webpack || configFiles.some((f) => f.includes('webpack'))) return 'Webpack';
  if (deps.esbuild) return 'esbuild';
  return null;
}

function extractKeyDeps(allDeps, frameworkName) {
  const IMPORTANT = [
    'zod', 'react-query', '@tanstack/react-query', 'zustand', 'jotai', 'recoil',
    'axios', 'swr', 'react-hook-form', 'formik',
    'jsonwebtoken', 'bcrypt', 'passport',
    'socket.io', 'ws',
    'bull', 'bullmq',
    'stripe', '@stripe/stripe-js',
    'next-auth', '@auth/core',
    'react-router-dom', 'react-router',
    'date-fns', 'dayjs', 'luxon',
    'lodash', 'ramda',
  ];

  const result = {};
  for (const dep of IMPORTANT) {
    if (allDeps[dep]) result[dep] = allDeps[dep];
  }
  return result;
}
