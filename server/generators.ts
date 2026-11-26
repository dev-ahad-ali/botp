const ALNUM = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const FIRST_NAMES = ['James', 'Olivia', 'Liam', 'Emma', 'Noah', 'Ava', 'Ethan', 'Mia', 'Lucas', 'Zoe'];
const LAST_NAMES = ['Smith', 'Johnson', 'Brown', 'Davis', 'Miller', 'Wilson', 'Moore', 'Taylor'];

const pick = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];

export const randomPassword = (len = 16) =>
  Array.from({ length: len }, () => ALNUM[Math.floor(Math.random() * ALNUM.length)]).join('');

export const randomFirstName = () => pick(FIRST_NAMES);
export const randomLastName = () => pick(LAST_NAMES);
