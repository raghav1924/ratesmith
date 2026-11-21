#!/usr/bin/env node
/**
 * RateSmith Executable CLI Launcher
 * Author: Jatin Sharma (https://jatinsh.netlify.app/)
 */

import { runCli } from '../dist/cli.js';

runCli(process.argv.slice(2)).catch((err) => {
  console.error('Fatal RateSmith Error:', err);
  process.exit(1);
});
