# Prisma Database Models

This directory contains the Prisma schema and database models for the Discord Bot TS project.

## Models

The schema includes the following models migrated from the original Sequelize implementation:

- **Ad**: For marketplace advertisements
- **LFGProfile**: Looking For Game user profiles
- **LFGGame**: Game sessions for the LFG feature
- **LFGParticipation**: User participation in LFG games
- **LFGEvent**: Events related to LFG activities
- **Screenshot**: User-submitted screenshots
- **TrophyProfile**: User trophy profiles
- **Trophies**: Individual trophies earned by users
- **StockUrls**: URLs for stock checking
- **SpecialChannel**: Special Discord channel configurations
- **CommandChannelLink**: Links between commands and channels

## Getting Started

### Installation

Make sure you have the required dependencies installed:

```bash
bun install
```

### Database Setup

1. Set up your database connection in the `.env` file:

```
DATABASE_URL="mysql://botuser:botpassword@mariadb:3306/discord_bot"
```

2. Generate the Prisma client:

```bash
bun run prisma:generate
```

3. Push the schema to your database:

```bash
bun run prisma:push
```

### Using Prisma Studio

To visually explore and edit your database, you can use Prisma Studio:

```bash
bun run prisma:studio
```

This will open a web interface at http://localhost:5555 where you can manage your data.

## Usage in Code

Import the Prisma client in your code:

```typescript
import { prisma } from '../lib/prisma';
```

Then use it to interact with your models:

```typescript
// Create a new ad
const ad = await prisma.ad.create({
  data: {
    name: 'PlayStation 5',
    price: '499€',
    // ...other fields
  }
});

// Query ads
const ads = await prisma.ad.findMany({
  where: {
    state: 'active'
  }
});
```

## Model Services

For more structured access to the models, use the service classes in the `src/models` directory:

```typescript
import { AdService } from '../models/ad';

// Create a new ad
const ad = await AdService.create({
  name: 'PlayStation 5',
  price: '499€',
  // ...other fields
});

// List active ads
const ads = await AdService.list({ state: 'active' });
```
