const fs = require('fs');
const path = require('path');

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function copyFile(src, dest) {
  if (!fs.existsSync(src)) {
    console.warn(`[copy-assets] Fonte não encontrada: ${src}`);
    return;
  }

  ensureDir(path.dirname(dest));
  fs.copyFileSync(src, dest);
  console.log(`[copy-assets] Arquivo copiado: ${src} -> ${dest}`);
}

function main() {
  const projectRoot = path.resolve(__dirname, '..');
  const assets = [
    {
      src: path.join(projectRoot, 'src', 'agents', 'agents.json'),
      dest: path.join(projectRoot, 'dist', 'agents', 'agents.json'),
    },
  ];

  assets.forEach(({ src, dest }) => copyFile(src, dest));
}

main();

