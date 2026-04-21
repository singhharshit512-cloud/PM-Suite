import fs from 'fs';

const file = 'server.ts';
let code = fs.readFileSync(file, 'utf8');

code = code.replace(/catch\s*\(([^)]+)\)\s*\{/g, (match, p1) => {
    return `${match}\n    logError(${p1.replace(': any', '').trim()}, req);`;
});

fs.writeFileSync(file, code);
console.log('Fixed catch blocks in server.ts');
