import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRequest, parseResponse, groupsToText, apiErrorMessage } from '../src/core/photo-ai.js';
import { parsePasted } from '../src/core/paste.js';

test('photo-ai: la petición lleva la imagen, la herramienta y el tipo', () => {
  const r = buildRequest({ base64: 'AAAA', kindLabel: 'Vidrio 9D' });
  assert.equal(r.model, 'claude-sonnet-5-5');
  assert.deepEqual(r.tool_choice, { type: 'tool', name: 'registrar_grupos' });
  assert.equal(r.messages[0].content[0].source.data, 'AAAA');
  assert.match(r.messages[0].content[1].text, /Vidrio 9D/);
});

test('photo-ai: entiende la respuesta y la convierte al formato de pegar', () => {
  const out = parseResponse({
    content: [{ type: 'tool_use', name: 'registrar_grupos', input: { grupos: [
      { modelos: ['iPhone 13', 'iPhone 14', ' iPhone 14 '], nota: 'Cámara justa' },
      { modelos: ['Galaxy A54', 'Galaxy A55'] },
      { modelos: ['Solo uno 5'] },
      { modelos: ['basura', 'sin numero'] },
    ] } }],
  });
  assert.deepEqual(out.groups, [['iPhone 13', 'iPhone 14'], ['Galaxy A54', 'Galaxy A55']]);
  const text = groupsToText(out, 'Vidrio 9D');
  assert.equal(text, 'Vidrio 9D: iPhone 13, iPhone 14\nNota: Cámara justa\nVidrio 9D: Galaxy A54, Galaxy A55');
  const p = parsePasted(text);
  assert.equal(p.groups.length, 2);
  assert.equal(p.groups[0].note, 'Cámara justa');
});

test('photo-ai: errores claros', () => {
  assert.throws(() => parseResponse({ content: [{ type: 'text', text: 'hola' }] }), /no devolvió una lista/);
  assert.match(apiErrorMessage(401), /llave/);
  assert.match(apiErrorMessage(429), /límite/);
  assert.match(apiErrorMessage(400, 'Your credit balance is too low'), /saldo/);
});
