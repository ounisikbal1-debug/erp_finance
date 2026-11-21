import { StringDecoder } from 'node:string_decoder';

export function readHiddenPassword(prompt: string): Promise<string> {
  const input = process.stdin;
  if (!input.isTTY || typeof input.setRawMode !== 'function') {
    throw new Error('L’outil doit être lancé dans un terminal interactif pour masquer la saisie.');
  }

  return new Promise((resolvePassword, rejectPassword) => {
    const decoder = new StringDecoder('utf8');
    let password = '';
    let complete = false;
    process.stderr.write(prompt);
    input.setRawMode(true);
    input.resume();

    const cleanup = () => {
      input.removeListener('data', onData);
      input.removeListener('end', onEnd);
      input.setRawMode(false);
      process.stderr.write('\n');
    };
    const finish = (error?: Error) => {
      if (complete) return;
      complete = true;
      cleanup();
      if (error) rejectPassword(error);
      else resolvePassword(password);
    };
    const onData = (chunk: Buffer) => {
      for (const character of decoder.write(chunk)) {
        if (character === '\r' || character === '\n') {
          finish();
          return;
        }
        if (character === '\u0003' || character === '\u0004') {
          finish(new Error('Saisie annulée.'));
          return;
        }
        if (character === '\u0008' || character === '\u007f') {
          password = Array.from(password).slice(0, -1).join('');
        } else if (character >= ' ' && character !== '\u007f') {
          password += character;
        }
      }
    };
    const onEnd = () => finish(new Error('Fin de saisie inattendue.'));
    input.on('data', onData);
    input.once('end', onEnd);
  });
}
