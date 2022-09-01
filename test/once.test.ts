import Once from '../src/once';
import { assertArrayEquals } from '../src/assert';

test('Once', async () => {
  const preEmit = new Once<number>();

  const events1: number[] = [];
  const events2: number[] = [];

  preEmit.emit(42);

  preEmit.addEventListener(event => {
    events1.push(event);
  });

  preEmit.emit(24);
  preEmit.emit(1);

  preEmit.addEventListener(event => {
    events2.push(event);
  });

  preEmit.emit(0);

  const expected1: number[] = [42];
  const expected2: number[] = [42];

  await new Promise<null>((resolve, reject) => {
    setTimeout(() => {
      try {
        assertArrayEquals(events1, expected1);
        assertArrayEquals(events2, expected2);

        resolve(null);
      } catch (e) {
        reject(e);
      }

      console.log("'Once' test passed");
    }, 100);
  });
});
