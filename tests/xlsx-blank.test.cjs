const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const c={HP:{},console};vm.createContext(c);vm.runInContext(fs.readFileSync('assets/xlsx-reader.js','utf8'),c);const f=c.HP.xlsxCell;
assert.equal(f('','n'),'');assert.equal(f(undefined,'n'),'');assert.equal(f('  ','n'),'');assert.equal(f('0','n'),0);assert.equal(f('0.0','n'),0);assert.equal(f('2.5','n'),2.5);
assert.equal(f('','s',['wrong']), '');assert.equal(f('0','s',['correct']), 'correct');assert.equal(f(undefined,'inlineStr',[],'文字'),'文字');assert.equal(f('',null,[],'',true),'公式未缓存');assert.equal(f('0',null,[],'',true),0);
console.log('PASS: blank XLSX cells remain missing; explicit zero remains zero; shared strings and cached formulas are distinct.');
