const PASSWORD_CLASSES = [
  'abcdefghijklmnopqrstuvwxyz',
  'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  '0123456789',
  '!@#$%^&*',
];
const PASSWORD_CHARS = PASSWORD_CLASSES.join('');
const FIRST_NAMES = ['James', 'Olivia', 'Liam', 'Emma', 'Noah', 'Ava', 'Ethan', 'Mia', 'Lucas', 'Zoe'];
const LAST_NAMES = ['Smith', 'Johnson', 'Brown', 'Davis', 'Miller', 'Wilson', 'Moore', 'Taylor'];

const pick = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];
const randomPasswordChar = (chars: string) => pick(chars.split(''));

/** Twilio requires 8+ chars, 3+ character classes, and no 3 identical chars in a row. */
export const randomPassword = (len = 16) => {
  const size = Math.max(8, Math.floor(len));
  // Guarantee all four classes (more than the required three), in a random order.
  const chars = PASSWORD_CLASSES.map(randomPasswordChar);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }

  while (chars.length < size) {
    const next = randomPasswordChar(PASSWORD_CHARS);
    const last = chars[chars.length - 1];
    const beforeLast = chars[chars.length - 2];
    if (last === beforeLast && next === last) continue;
    chars.push(next);
  }
  return chars.join('');
};

export const randomFirstName = () => pick(FIRST_NAMES);
export const randomLastName = () => pick(LAST_NAMES);
