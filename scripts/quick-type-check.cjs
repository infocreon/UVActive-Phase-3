const ts = require('../node_modules/typescript/lib/_tsc.js');
const fs = require('fs');

const config = JSON.parse(fs.readFileSync('tsconfig.json', 'utf8'));
const host = ts.createCompilerHost(config);
const program = ts.createProgram(
  ['src/sessions/history-ticks.controller.ts',
   'src/sessions/member-history-ticks.util.ts',
   'src/sessions/session-recalc.util.ts',
   'src/sessions/sessions.service.ts'],
  config, host
);

const allDiags = ts.getPreEmitDiagnostics(program);
const diags = allDiags.filter(d => d.file && [
  'src/sessions/history-ticks.controller.ts',
  'src/sessions/member-history-ticks.util.ts',
  'src/sessions/session-recalc.util.ts',
  'src/sessions/sessions.service.ts'
].includes(d.file.fileName.replace(/\\/g, '/')));
if (diags.length === 0) {
  console.log('✓ All 4 files type-check clean');
  process.exit(0);
}
console.log('✗ ' + diags.length + ' error(s):');
for (const d of diags) {
  const f = (d.file && d.file.fileName) ? d.file.fileName.split('\\').pop() || d.file.fileName.split('/').pop() : '?';
  const pos = d.file.getLineAndCharacterOfPosition(d.start ?? 0);
  const ln = pos.line + 1;
  const col = pos.character + 1;
  console.log(f + ':' + ln + ':' + col + ' TS' + d.code + ': ' + ts.flattenDiagnosticMessageText(d.messageText, ' '));
}
process.exit(1);
