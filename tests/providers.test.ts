import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createProject } from '../src/domain/project';
import { OpenAIEditor, OpenAITranscriber } from '../src/server/providers';

test('sin clave la API devuelve un error explícito, nunca una transcripción de muestra', async () => {
  const old = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  try {
    await assert.rejects(new OpenAITranscriber().transcribe(createProject()), /OPENAI_API_KEY/);
  } finally {
    if (old) process.env.OPENAI_API_KEY = old;
  }
});
test('el proveedor rechaza operaciones inválidas antes de proponer cambios (fetch simulado)', async () => {
  const oldKey = process.env.OPENAI_API_KEY,
    oldFetch = globalThis.fetch;
  process.env.OPENAI_API_KEY = 'unit-test-placeholder';
  globalThis.fetch = async () =>
    Response.json({
      choices: [
        {
          message: {
            content: JSON.stringify({
              notes: ['Test'],
              operations: [{ type: 'cut', start: 0, end: 999999 }],
            }),
          },
        },
      ],
    });
  try {
    await assert.rejects(new OpenAIEditor().plan(createProject()));
  } finally {
    globalThis.fetch = oldFetch;
    if (oldKey) process.env.OPENAI_API_KEY = oldKey;
    else delete process.env.OPENAI_API_KEY;
  }
});
