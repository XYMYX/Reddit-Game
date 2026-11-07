import { reddit } from '@devvit/web/server';

export const createPost = async (title = 'eXploit: guess the password') => {
  return await reddit.submitCustomPost({ title });
};

const prettyDate = (date: string) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });

export const createDailyPost = async (date: string) =>
  createPost(`Daily eXploit ${prettyDate(date)}: can you crack today's password?`);
