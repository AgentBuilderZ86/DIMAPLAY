import { normalizeMoroccanPhone } from '@/lib/phone';

it.each([
  ['06 12 34 56 78', '+212612345678'],
  ['0712345678', '+212712345678'],
  ['+212 6 12 34 56 78', '+212612345678'],
  ['00212612345678', '+212612345678'],
  ['212612345678', '+212612345678'],
  ['612345678', '+212612345678'],
  ['06-12-34-56-78', '+212612345678'],
])('normalises %s', (input, expected) => {
  expect(normalizeMoroccanPhone(input)).toBe(expected);
});

it.each(['', '0512345678', '06123456', '061234567890', 'abc', '+33612345678'])(
  'rejects %s',
  (input) => {
    expect(normalizeMoroccanPhone(input)).toBeNull();
  },
);
