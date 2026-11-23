/**
 * Compila native/SystemLoopback.cs com o csc do .NET Framework 4.x, que já vem em todo Windows 10/11.
 * Sem Visual Studio nem SDK extra. Fora do Windows não faz nada (o recurso é só de Windows).
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

if (process.platform !== 'win32') process.exit(0);

const src = path.join(__dirname, 'SystemLoopback.cs');
const outDir = path.join(__dirname, 'bin');
const out = path.join(outDir, 'SystemLoopback.exe');

if (fs.existsSync(out) && fs.statSync(out).mtimeMs >= fs.statSync(src).mtimeMs) process.exit(0);

const csc = path.join(process.env.WINDIR || 'C:\\Windows', 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe');
if (!fs.existsSync(csc)) {
  console.warn('[native] csc.exe do .NET Framework não encontrado; o áudio do PC na transmissão fica indisponível.');
  process.exit(0);
}

fs.mkdirSync(outDir, { recursive: true });
execFileSync(csc, ['/nologo', '/optimize+', '/target:exe', '/platform:x64', `/out:${out}`, src], { stdio: 'inherit' });
console.log('[native] SystemLoopback.exe compilado');
