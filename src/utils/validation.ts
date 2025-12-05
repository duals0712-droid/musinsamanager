const loginIdPattern = /^(?![0-9]+$)[A-Za-z0-9]+$/;

export const sanitizeLoginId = (value: string) => value.replace(/[^A-Za-z0-9]/g, '');

export const isValidLoginId = (value: string) => loginIdPattern.test(value);
