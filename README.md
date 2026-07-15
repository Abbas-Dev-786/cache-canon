# Cache Canon

Cache Canon is a Devvit game where players aim their cannons, shoot shells, and attempt to find 3 hidden caches. It is built using the Devvit web platform and Phaser.

## How to Play
- **Launch the Game:** Click the launch button from the Reddit post.
- **Shoot:** Aim your cannon and fire to uncover hidden caches on the board.
- **Compete:** The top 5 scores are recorded on the leaderboard.

## Development & Deployment

### Commands
- `npm run dev`: Starts a development server where you can develop your application live on Reddit.
- `npm run build`: Builds your client and server projects.
- `npm run launch`: Publishes your app for review.

## Architecture
- **Client**: Web view built with Phaser.
- **Server**: Hono server handling gameplay logic and state synchronization with Devvit's Redis cache.
