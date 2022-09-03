import AuthenticatedConnection from '../../src/authenticated-connection';
import { toAsyncIterable } from '../../src/pub-sub';
import { generateKeys } from '../../src/utils';

Promise.resolve()
  .then(async function() {
    const keys = await generateKeys();
    const session = await AuthenticatedConnection.connect(
      'ws://localhost:8000',
      keys
    );

    for await (const event of toAsyncIterable(session.messageEvents)) {
      console.log(event.data);
      session.send(JSON.stringify({ type: 'RESPONSE', data: 'Haha' }));
    }
  })
  .catch(console.error);
