import { reddit } from '@devvit/web/server';

export const createPost = async () => {
  return await reddit.submitCustomPost({
    title: 'Bootstrap Cache Hunt',
    entry: 'game',
    textFallback: {
      text: '🎯 Cache Hunt!\n\nAim your cannon and find 3 hidden caches!',
    },
    styles: {
      backgroundColor: '#f5f5f5FF',
      backgroundColorDark: '#1a1a2eFF',
      height: 'TALL' as any,
    },
  });
};
