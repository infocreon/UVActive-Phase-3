const ts = require('typescript');
const fs = require('fs');
const path = require('path');

const config = JSON.parse(fs.readFileSync('tsconfig.json', 'utf8'));
const host = ts.createCompilerHost(config);
const program = ts.createProgram(['src/sessions/history-ticks.controller.ts', 'src/sessions/member-history-ticks.util.ts', 'src/sessions/session-recalc.util.ts', 'src/sessions/sessions.service.ts'], config, host);
const diagnostics = ts.getPreEmitDiagnostics(program).filter(d => d.file);
if (diagnostics.length === 0) {
  console.log('✓ All 4 files type-check clean');
  process.exit(0);
}
console.log(`✗ ${diagnostics.length} error(s):`);
for (const d of diagnostics) {
  const file = d.file?.fileName?.split('\\').pop() || d.file?.fileName?.split('/').pop() || '?';
  const line = d.file.getLineAndCharacterOfPosition(d.start ?? 0).line + 1;
  const col = d.file.getLineAndCharacterOfPosition(d.start ?? 0).character + 1;
  console.log(`  ${file}:${line}:${col} - error TS${d.code}: ${ts.flattenDiagnosticMessageText(d.messageText, '\n')}`);
}
process.exit(1);
