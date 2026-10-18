// Builds release/CrossyRoad.exe: the web build embedded in a small Go launcher.
// Requires Node and Go (https://go.dev/dl). Works on Windows, macOS and Linux.
import { execSync } from 'node:child_process';
import { cpSync, rmSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const launcher = join(root, 'desktop', 'launcher');
const out = join(root, 'release', 'CrossyRoad.exe');
const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const run = (cmd, opts = {}) => execSync(cmd, { stdio: 'inherit', ...opts });

console.log('› Building the web game…');
run('npx vite build', { cwd: root });

console.log('› Embedding it in the launcher…');
rmSync(join(launcher, 'dist'), { recursive: true, force: true });
cpSync(join(root, 'dist'), join(launcher, 'dist'), { recursive: true });

// Optional: exe icon and version info (go install github.com/tc-hib/go-winres@latest)
try {
  run(
    `go-winres simply --arch amd64 --icon icon.png --manifest gui ` +
      `--product-name "Crossy Road Custom Edition" --file-description "Crossy Road Custom Edition" ` +
      `--product-version ${version} --file-version ${version}`,
    { cwd: launcher, stdio: 'pipe' }
  );
  console.log('› Added icon and version info');
} catch {
  console.log('› go-winres not found: building without a custom icon');
}

console.log('› Compiling CrossyRoad.exe…');
mkdirSync(dirname(out), { recursive: true });
run(`go build -trimpath -ldflags "-H windowsgui -s -w" -o "${out}" .`, {
  cwd: launcher,
  env: { ...process.env, GOOS: 'windows', GOARCH: 'amd64', CGO_ENABLED: '0' },
});
if (!existsSync(out)) throw new Error('Build failed: no exe produced');
console.log(`✔ Done: ${out}`);
