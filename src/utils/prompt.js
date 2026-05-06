import * as readline from 'readline';
import { bold, cyan, dim } from './color.js';

export function createPrompt() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  const ask = (question) =>
    new Promise((resolve) => rl.question(question, (ans) => resolve(ans.trim())));

  const close = () => rl.close();

  return { ask, close };
}

export async function select(label, options) {
  const { ask, close } = createPrompt();

  const optionText = options
    .map((o, i) => `${dim(`(${i + 1})`)} ${o.label}`)
    .join('  ');

  process.stdout.write(`  ${bold(label.padEnd(14))} ${cyan('»')} ${optionText}\n  ${' '.repeat(16)}`);

  while (true) {
    const ans = await ask('');
    const idx = parseInt(ans, 10) - 1;
    if (idx >= 0 && idx < options.length) {
      close();
      return options[idx];
    }
    process.stdout.write(`  ${' '.repeat(16)}Please enter a number between 1 and ${options.length}: `);
  }
}

export async function input(label, defaultValue = '') {
  const { ask, close } = createPrompt();
  const hint = defaultValue ? dim(` (${defaultValue})`) : '';
  const ans = await ask(`  ${bold(label.padEnd(14))} ${cyan('»')} ${hint} `);
  close();
  return ans || defaultValue;
}
