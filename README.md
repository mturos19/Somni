# 🌙 Somni - Magical Bedtime Stories

Somni is a beautiful web application that creates personalized children's stories using AI and reads them aloud in a cloned voice of a loved one. Perfect for when parents travel or simply want to create magical bedtime moments.

![Somni](https://images.unsplash.com/photo-1503454537195-1dcabb73ffb9?w=1200&h=400&fit=crop)

## ✨ Features

- **AI Story Generation** - Create unique, age-appropriate bedtime stories using GPT-4
- **Voice Cloning** - Clone a parent's voice using ElevenLabs for personalized narration
- **Beautiful UI** - Dreamy, child-friendly design with night mode for bedtime reading
- **Story Library** - Save and organize all your stories in one place
- **Personalization** - Include your child's name to make them the hero of every story
- **Age Groups** - Stories tailored for toddlers (1-3), preschoolers (3-5), early readers (5-7), and chapter book readers (7-10)

## 🚀 Getting Started

### Prerequisites

- Node.js 18+ 
- PostgreSQL database
- OpenAI API key
- ElevenLabs API key

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/somni.git
   cd somni
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   ```
   
   Then edit `.env` with your credentials:
   - `DATABASE_URL` - Your PostgreSQL connection string
   - `AUTH_SECRET` - Generate with `openssl rand -base64 32`
   - `OPENAI_API_KEY` - Get from [OpenAI Platform](https://platform.openai.com/api-keys)
   - `ELEVENLABS_API_KEY` - Get from [ElevenLabs](https://elevenlabs.io/app/settings/api-keys)

4. **Set up the database**
   ```bash
   npx prisma migrate dev --name init
   npx prisma generate
   ```

5. **Start the development server**
   ```bash
   npm run dev
   ```

6. **Open your browser**
   
   Visit [http://localhost:3000](http://localhost:3000)

## 🛠️ Tech Stack

- **Framework**: [Next.js 15](https://nextjs.org/) with App Router
- **Language**: [TypeScript](https://www.typescriptlang.org/)
- **Database**: [PostgreSQL](https://www.postgresql.org/) with [Prisma ORM](https://www.prisma.io/)
- **Authentication**: [NextAuth.js v5](https://authjs.dev/)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/)
- **AI**: [OpenAI GPT-4](https://openai.com/)
- **Voice**: [ElevenLabs](https://elevenlabs.io/)
- **Animations**: [Framer Motion](https://www.framer.com/motion/)

## 📁 Project Structure

```
somni/
├── src/
│   ├── app/
│   │   ├── (auth)/           # Auth pages (login, register)
│   │   ├── (dashboard)/      # Protected pages (dashboard, create, stories, voices)
│   │   ├── api/              # API routes
│   │   │   ├── auth/         # Authentication endpoints
│   │   │   ├── stories/      # Story CRUD & audio generation
│   │   │   └── voices/       # Voice cloning management
│   │   ├── globals.css       # Global styles & design system
│   │   ├── layout.tsx        # Root layout
│   │   └── page.tsx          # Landing page
│   ├── components/           # Reusable components
│   ├── lib/                  # Utilities & integrations
│   │   ├── auth.ts           # NextAuth configuration
│   │   ├── prisma.ts         # Prisma client
│   │   ├── openai.ts         # Story generation
│   │   └── elevenlabs.ts     # Voice cloning & TTS
│   └── types/                # TypeScript type definitions
├── prisma/
│   └── schema.prisma         # Database schema
└── public/                   # Static assets
```

## 🎨 Design System

Somni uses a dreamy, calming color palette perfect for bedtime:

- **Night**: `#1a1b2e` - Deep background
- **Twilight**: `#2d2f4e` - Secondary background
- **Lavender**: `#9b8dc7` - Primary accent
- **Golden**: `#ffd166` - Call-to-action
- **Coral**: `#ff8fa3` - Warm accents
- **Mint**: `#7dd3c0` - Success states

## 📖 API Reference

### Stories

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/stories` | Get all user stories |
| POST | `/api/stories` | Create a new story |
| GET | `/api/stories/[id]` | Get a specific story |
| DELETE | `/api/stories/[id]` | Delete a story |
| POST | `/api/stories/[id]/audio` | Generate audio for story |

### Voices

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/voices` | Get all user voices |
| POST | `/api/voices` | Clone a new voice |
| DELETE | `/api/voices/[id]` | Delete a cloned voice |

## 🔒 Security

- Passwords are hashed using bcrypt
- JWT-based session management
- API routes are protected with authentication middleware
- User data is isolated per account

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 💜 Acknowledgments

- Inspired by the magic of bedtime storytelling
- Built with love for families everywhere
- Thanks to OpenAI and ElevenLabs for their amazing APIs

---

<p align="center">
  Made with 💜 for bedtime dreamers everywhere
</p>
