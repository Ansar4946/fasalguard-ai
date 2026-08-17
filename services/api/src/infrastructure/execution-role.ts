export type ProcessRole = 'api' | 'worker' | 'all';

export const processRole = (): ProcessRole => {
  const role = process.env.PROCESS_ROLE;
  return role === 'api' || role === 'worker' ? role : 'all';
};

export const workersEnabled = (): boolean => processRole() !== 'api';
export const schedulerEnabled = (): boolean => processRole() !== 'worker';
