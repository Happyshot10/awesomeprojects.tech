#!/usr/bin/env node
// Validates domains/. With --pr it also checks the pull request's changes:
//   PR_AUTHOR   GitHub login of the PR author
//   BASE_SHA    commit the PR is based on
//   MAINTAINERS comma-separated logins allowed to change anything
//   CHECK_ROOT  checkout to validate (default: this repo). CI runs main's copy of
//               this script against the PR's checkout so a PR can't edit the rules.
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const R = require('./rules');

const self = path.join(__dirname, '..');
const root = path.resolve(process.env.CHECK_ROOT || self);
const dir = path.join(root, 'domains');
const reserved = JSON.parse(fs.readFileSync(path.join(self, 'reserved.json'), 'utf8'));
const maintainers = (process.env.MAINTAINERS || '').split(',').map((s) => s.trim()).filter(Boolean);

const problems = []; // [file, message]
const entries = {};

for (const f of fs.readdirSync(dir).sort()) {
  if (f === '.gitkeep') continue;
  const name = R.nameFromFile(f);
  if (!name) { problems.push([`domains/${f}`, 'only .json files belong in domains/']); continue; }
  try {
    entries[name] = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  } catch (e) {
    problems.push([`domains/${f}`, `invalid JSON: ${e.message}`]);
  }
}

for (const [name, errs] of Object.entries(R.checkTree(entries, { reserved, maintainers }))) {
  for (const e of errs) problems.push([`domains/${name}.json`, e]);
}

if (process.argv.includes('--pr')) {
  const base = process.env.BASE_SHA;
  const author = process.env.PR_AUTHOR;
  if (!base || !author) {
    problems.push(['(pull request)', 'BASE_SHA and PR_AUTHOR must be set']);
  } else {
    const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' });
    const changes = git('diff', '--name-status', '--no-renames', `${base}...HEAD`)
      .trim().split('\n').filter(Boolean)
      .map((l) => { const [status, file] = l.split('\t'); return { status: status[0], file }; });
    const read = (rev) => (file) => {
      try { return JSON.parse(git('show', `${rev}:${file}`)); } catch { return undefined; }
    };
    const mergeBase = git('merge-base', base, 'HEAD').trim();
    for (const e of R.checkPullRequest({ changes, author, maintainers, before: read(mergeBase), after: read('HEAD') })) {
      problems.push(['(pull request)', e]);
    }
  }
}

if (problems.length) {
  const lines = problems.map(([f, m]) => `- \`${f}\`: ${m}`);
  console.error(`✗ ${problems.length} problem(s):\n${lines.join('\n')}`);
  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## ✗ Request needs changes\n\n${lines.join('\n')}\n`);
  }
  for (const [f, m] of problems) {
    if (process.env.GITHUB_ACTIONS && f.startsWith('domains/')) {
      console.log(`::error file=${path.relative(process.cwd(), path.join(root, f))}::${m}`);
    }
  }
  process.exit(1);
}
console.log(`✓ ${Object.keys(entries).length} subdomain file(s) look good`);
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, '## ✓ Request looks good\n');
