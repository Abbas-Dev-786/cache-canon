# Cache Canon

Cache Canon is a daily target-finding game played inside Reddit. Aim your cannon, fire shells across the board, and uncover three hidden caches before using all of your shots. Compete for the highest score on the daily leaderboard or create your own custom boards to challenge other players.

## Who It Is For

- Redditors looking for a quick daily strategy game.
- Communities that want a shared competitive challenge.
- Players who enjoy creating and sharing custom puzzles.
- Moderators who want to add an interactive game post without managing external hosting.

## How To Play

1. Open a Cache Canon post and select **Start**.
2. Choose **Official Run** or **Practice**.
3. Aim the cannon toward your chosen target.
4. Fire a shell onto the board.
5. Reveal hidden caches by landing shots in the correct locations.
6. Find all three hidden caches before running out of shots.

Each shot reveals part of the board, helping narrow down the remaining cache locations. Careful planning and efficient shot placement lead to higher scores.

## Daily Runs

- Every UTC day uses the same hidden cache layout for all players.
- A logged-in player can submit one official run per UTC day.
- Practice runs are always available and do not change the leaderboard.
- Logged-out users can play practice runs but cannot submit official scores.
- The server validates official submissions before accepting a score.

## Scores And Leaderboards

- Finding hidden caches awards points.
- Using fewer shots results in higher scores.
- Accepted official runs appear on the daily leaderboard.
- Players can compare their daily performance with the community.

## Custom Boards

Logged-in players can create their own challenge boards by hiding three caches anywhere on the grid.

- Create a custom board by placing three hidden caches.
- Generate a shareable link for your board.
- Share your challenge with friends or the community.
- Anyone with the link can play your custom board.
- Custom boards are separate from the official daily challenge and never affect the daily leaderboard.

## Accessibility And Feedback

The settings screen includes:

- Sound on or off.
- Haptics on or off where supported.
- Reduced motion.
- High contrast.

## Moderator Instructions

No app configuration is required for the core daily game.

- Installing the app creates an initial Cache Canon post in the community.
- To create another post, open the subreddit moderator menu and select **Create a new post**.
- The app uses Reddit identity for official runs and Devvit Redis for game data.

## Data Use

Cache Canon stores only data required to operate the game:

- Reddit usernames associated with official scores.
- Daily leaderboard entries.
- Official gameplay validation data.
- Custom board data and share identifiers.
- Local browser settings and local best scores.

Gameplay data is stored with Devvit Redis. Cache Canon does not use an external gameplay API or external analytics service.

## Development

Requires Node.js 22.2 or newer.

- `npm run dev`: Start Devvit playtest mode.
- `npm run build`: Build client and server bundles.
- `npm run lint`: Run ESLint.
- `npm run test`: Run type-checking and project tests.
- `npm run deploy`: Type-check, lint, and upload a private test version.
- `npm run launch`: Type-check, lint, and publish a patch version for review.

## Architecture

- **Client:** Phaser-based web experience running inside Devvit.
- **Server:** Hono server responsible for gameplay logic, score validation, and synchronization with Devvit Redis.
- **Platform:** Built using the Reddit Devvit web platform.

## Launch

Complete Reddit playtest verification on mobile and web before publishing. Test with developer, moderator, and regular-user accounts.

1. Authenticate with `npm run login`.
2. Confirm the active account with `npx devvit whoami`.
3. Run `npm run test`, `npm run lint`, and `npm run build`.
4. Run `npm run dev`.
5. Verify gameplay, official runs, practice mode, leaderboard updates, custom board creation and sharing, and moderator post creation.
6. Publish an unlisted patch release with `npm run launch -- --bump patch`.

Use `npm run launch -- --bump minor` or `npm run launch -- --bump major` when appropriate. To publish a specific stable version, use `npm run launch -- --version 1.0.1`.

Cache Canon is a game, so the default unlisted publish mode is recommended. Use `npm run launch -- --public` only if the app should be listed for installation by moderators of any community.