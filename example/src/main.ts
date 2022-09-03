import AuthenticatedConnection from '../../src/authenticated-connection';
import { generateKeys, getClientId } from '../../src/utils';

Promise.resolve()
  .then(async function() {
    const keys = await generateKeys();
    const session = await AuthenticatedConnection.connect(
      'http://localhost:8000',
      keys
    );
  })
  .catch(console.error);
