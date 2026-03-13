# SongCloud

Responsive, clean music search + player UI with a small JSON API (search, trending, Spotify playlist fetch).

## Web (Next.js)

Install dependencies and start the dev server (defaults to port `8086` and binds to your LAN so mobile devices can reach it):

```bash
npm install
npm run dev
```

Open `http://localhost:8086` in your browser.

If `8086` is already in use:

```bash
PORT=3000 npm run dev
```

## Using The API In Other Apps

- Base URL (local): `http://localhost:8086`
- CORS: enabled for `GET` + `OPTIONS` (so you can call the API from another web app).

Optional security / config:

- `SONGCLOUD_API_KEY=...` to require `X-API-Key` on all `/api/*` routes.
- `SONGCLOUD_CORS_ORIGIN=https://yourapp.com` to restrict browser access to a single origin (default is `*`).
- `SPOTIFY_CLIENT_ID=...` and `SPOTIFY_CLIENT_SECRET=...` to use Spotify’s official client-credentials token (recommended for stability/quota).
- `NEXT_PUBLIC_APP_ORIGIN=http://<your-lan-ip>:8086` to make “Copy link” buttons generate shareable links (instead of `localhost`).

## Routes (UI)

- `GET /` Home + Search
- `GET /explore` Explore + Search
- `GET /library` Local playback history
- `GET /playlists` Local playlists (create / import)
- `GET /playlists/[id]` Playlist details (play / download / export)
- `GET /playlists/liked` Liked Songs (system playlist)

### Playlists (UI)

- Import Spotify playlist: click the `+` button in the search bar (or `Playlists → Import`).
- Add a track to a playlist: in Search results, use the `+` button on a track card.
- Like/unlike a track: use the heart button on a track card (adds/removes from `Liked Songs`).

## Routes (API)

All API routes are `GET` and respond with JSON.

### `GET /api/openapi`

Returns an OpenAPI 3 schema you can use to generate clients.

### `GET /api`

Response:

```ts
{
  service: string;
  version: string;
  port: number;
  features: string[];
  endpoints: Array<{
    path: string;
    method: "GET";
    params?: string[];
    description: string;
  }>;
}
```

### `GET /api/search?q=...&limit?=20&source?=spotify|jio|all`

Response:

```ts
type SearchResultItem = {
  id: string;
  title: string;
  subtitle?: string;
  image: string; // may be "" if unavailable
  source: "spotify" | "jio";
  url?: string; // only for some JioSaavn results
};

SearchResultItem[];
```

### `GET /api/trending?limit?=15`

Response:

```ts
type TrendingItem = {
  id: string;
  title: string;
  subtitle: string;
  image: string;
};

TrendingItem[];
```

### `GET /api/chart?id=...&limit?=50`

Fetches a JioSaavn chart (playlist) and returns its tracks.

Response:

```ts
type ChartResponse = {
  id: string;
  title: string;
  image: string;
  total: number;
  tracks: SearchResultItem[];
  truncated: boolean;
};
```

### `GET /api/playlist?id=...&limit?=1000`

`id` can be a playlist id, URL, or `spotify:playlist:...`.

Response:

```ts
type PlaylistResponse = {
  id: string;
  title: string;
  description: string;
  image: string; // may be "" if unavailable
  owner: string;
  total: number;
  tracks: SearchResultItem[];
  truncated: boolean; // true if `total` > returned track count
};
```

Notes:

- If Spotify rate-limits you, this endpoint returns `429` with a `Retry-After` header.

### `GET /api/song?id=...&type?=spotify|jio`

Response:

```ts
type SongResponse = {
  mediaUrl?: string;
  quality?: string;
  duration?: number;
  album?: string;
  artists?: string;
  source?: "spotify" | "jio";
  error?: string;
};
```

## Build

```bash
npm run build
npm start
```

## Notes

- Uses system fonts (no Google Fonts fetch at build time).
- Remote images are allowed from Spotify/JioSaavn CDNs via `next.config.ts`.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
