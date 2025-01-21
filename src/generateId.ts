const randomString = (length: number) => [...Array(length)].map(() => "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"[Math.floor(Math.random() * 36)]).join('');

export const generateId = (length: number = 6) => randomString(length);
