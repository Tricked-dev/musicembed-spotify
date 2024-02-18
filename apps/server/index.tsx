import { getCookie, setCookie } from "hono/cookie";
import { html, raw } from 'hono/html'

import { Database } from "bun:sqlite"
import { Hono } from "hono";
import { cors } from 'hono/cors'
import { join } from "node:path";
import { logger } from "hono/logger";
import { readFile } from "node:fs/promises";
import satori from "satori";

const pico = await Bun.file("./pico.css").text();

const db = new Database("./database.sqlite3", {
  create: true,
  readwrite: true
})

db.exec(`
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(10) PRIMARY KEY,
    token VARCHAR(30),
    style VARCHAR(10),
    history BOOLEAN
);

CREATE TABLE IF NOT EXISTS history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id VARCHAR(10) REFERENCES users(id),
    song TEXT,
    artist TEXT,
    time TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
`)



const port = parseInt(
  process.env.PORT || "4124",
);

const host = process.env.HOSTNAME || process.env.HOST || "localhost";

type Bindings = {
  TOKEN: string
}
type User = {
  id: string,
  token: string,
  history: boolean;
  style: string;
}

type Variables = {
  user: User | undefined
}

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>({
  strict: false,
});

app.use('*', cors({
  origin: (c) => c,
  credentials: true
}))
app.use("*", logger());

app.use("*", async (c, next) => {
  c.header("Vary", "Origin")
  const token: string | undefined = getCookie(c, "token") ?? c.req.header("token") ?? c.req.header("secret")
  if (token) {
    const user = db.query<User, [string]>("SELECT * FROM users WHERE token = ?",).get(token);
    if (user) {
      c.set("user", user)
    }
  }
  await next();
})

const Layout = (props: any) => html`<!DOCTYPE html>
  <html>
    <head>
      <title>${props.title}</title>
      <style>
        ${raw(pico)}
      </style>
    </head>
    <body class="pico" style="display:flex">
      <main class="container"  style="max-width: 30rem; margin: 10px auto; width: 100%;">
        ${props.children}
      </main>
    </body>
  </html>`


let createToken = crypto.randomUUID();

app.get("/create", async (c) => {
  const { count = 0 } = db.query<{ count: number }, []>("SELECT COUNT(*) as count FROM users").get() ?? {};
  if (count > 0 && !c.get("user")) {
    return c.redirect("/login");
  }
  const data = html /*no-html*/`
    <form method="post">
      <fieldset>
      <label>
        Username
        <input
          name="username"
          placeholder="User name for user"
          autocomplete="username"
        />
        <input type="hidden" name="token" value="${createToken}">
      </label>
    </fieldset>
      <input
        type="submit"
        value="Create user"
      />
    </form>
  `
  return c.html(
    Layout({
      children: data,
      title: "Create User"
    })
  )
})

const generatePassword = (
  length = 20,
  characters = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
) =>
  Array.from(crypto.getRandomValues(new Uint32Array(length)))
    .map((x) => characters[x % characters.length])
    .join('')


app.post("/create", async (c) => {
  const search = new URLSearchParams(await c.req.text())
  if (search.get("token") != createToken) {
    return c.html(
      Layout({
        children: "Invalid token",
        title: "Invalid token"
      })
    )
  }
  const token = generatePassword();
  const username = search.get("username")
  db.exec(`INSERT INTO users (id, token, history, style) VALUES (?, ?, ?, ?)`, [username, token, true, "default"]);
  const body = html`
    <hgroup>
      <h2>User ${username}</h2>
      <p>User TOKEN: <pre>${token}</pre></p>
    </hgroup>
    <a href="/login">Login</a>
  `
  return c.html(
    Layout({
      children: body,
      title: "User created"
    })
  )
})




const fontPath = join(process.cwd(), "assets", "Roboto-Regular.ttf");
const fontData = await readFile(fontPath);

type SongData = {
  duration: {
    at: number
    end: number
  }
  title: string;
  artist: string;
  thumbnail: string;
  paused: boolean;
  videoId?: string
}

interface GameData {
  lastUpdated: number
  data: SongData | undefined
}

const users = new Map<string, GameData>();

app.get("/", (c) => {
  return new Response(
    undefined
  )
})

app.post("/", async (c) => {
  const user = c.get("user")
  if (!user) return c.json({ status: 401 }, 401)

  const body: SongData = await c.req.json();
  const game = users.get(user.id) ?? { lastUpdated: Date.now(), data: undefined };
  if (game.data?.title && user.history) {
    if (body.title != game.data?.title) {
      db.exec("INSERT INTO history (user_id, song, artist, id) VALUES (?, ?, ?, ?)", [
        user.id,
        body.title,
        body.artist,
        Date.now()
      ])
    }
  }
  game.lastUpdated = Date.now();

  if (game.data?.videoId && (JSON.stringify(game.data?.videoId) === JSON.stringify(body.videoId) && JSON.stringify(game.data.duration) === JSON.stringify(body.duration))) {
    game.data.paused = true;
    return c.json({ status: 200 }, 200);
  }

  game.data = body;
  users.set(user.id, game);
  return c.json({ status: 200 }, 200);
})

const emptySong = {
  duration: {
    at: 0,
    end: 0
  },
  artist: "",
  title: "",
  thumbnail: "",
  paused: true
}

app.get("/login", (c) => {
  const data = html /*no-html*/`
    <form method="post">
      <fieldset>
      <label>
        Token
        <input
          name="token"
          placeholder="User token"
          autocomplete="token"
        />
      </label>
    </fieldset>
      <input
        type="submit"
        value="Login"
      />
    </form>
  `
  return c.html(
    Layout({
      children: data,
      title: "Login"
    })
  )
})
app.post("/login", async (c) => {
  const search = new URLSearchParams(await c.req.text())
  const token = search.get("token")
  if (!token) return c.json({ status: 401 }, 401)
  const user = db.query<{ token: string }, [string]>("SELECT * FROM users WHERE token = ?",).get(token);
  if (!user) return c.json({ status: 401 }, 401)
  setCookie(c, "token", token)
  return c.redirect("/user")
})

app.get("/user", async (c) => {
  const user = c.get("user")
  if (!user) return c.redirect("/login")
  const data = html /*no-html*/`
    <hgroup>
      <h2>User ${user.id}</h2>
      <h2>Token <pre>${user.token}</pre></h2>
    </hgroup>
    <form method="post">
      <fieldset>
      <label>
        History Enabled
        <input
          name="history"
          type="checkbox"
          ${user.history ? "checked" : ""}
        />
      </label>
      <label>
        Style
        <select name="style">
          <option value="default" ${user.style == "default" ? "selected" : ""}>Default</option>
          <option value="square" ${user.style == "square" ? "selected" : ""}>Square</option>
        </select>
      </label>
    </fieldset>
      <input
        type="submit"
        value="Save"
      />
    </form>
    <img src="/${user.id}.svg" />
  `
  return c.html(
    Layout({
      children: data,
      title: "User"
    })
  )
})

app.post("/user", async (c) => {
  const user = c.get("user")
  if (!user) return c.json({ status: 401 }, 401)
  const search = new URLSearchParams(await c.req.text())
  const history = search.get("history") === "on"
  const style = search.get("style") ?? "default"
  db.exec("UPDATE users SET history = ?, style = ? WHERE id = ?", [history, style, user.id])
  return c.redirect("/user")
})



app.get("/:id", async (c) => {

  const [userId, ext] = c.req.param("id").split(".")
  if (!ext) return c.json({ status: 404 }, 404)
  const game = users.get(userId) ?? {
    lastUpdated: Date.now(), data: undefined
  } as GameData;
  if (!game.data) {
    const { user = "Tricked-dev" } = db.query<{ user: string }, [string]>("SELECT id as user FROM users WHERE id = ?",).get(userId) ?? {}
    game.data = {
      ...emptySong,
      artist: user
    }
  }
  let data = game.data

  const at = (data?.duration?.at ?? 0) + ((Date.now() - game.lastUpdated) / 1000);

  if (at > data.duration.end) {
    game.data = undefined;
    data = emptySong
  }

  const svg = await satori(
    <div
      style={{
        backgroundColor: "red",
        color: "black",
        display: "flex",
        flexDirection: "column",
        borderRadius: "10px",
        height: "100%",
        width: "100%",
      }}
    >

      <img
        style={{
          borderRadius: "10px",
          height: "100%",
          width: "100%",
          objectFit: "cover",
          position: "absolute",
          boxShadow: "inset 0px 0px 50px 50px rgba(0, 0, 0, 0.6)",
        }}
        height={230}
        width={500}
        src={data.thumbnail || 'https://lh3.googleusercontent.com/U9DTgHAZAXCDbXbaAm5AycnEqTOdaNngi6RoN796rvmXlHCZQjC4NV5FWA9QPmfMzmHTvDrYyAMvNZ00=w1500-h844-l90-rj'}
      />
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          marginLeft: "20px",
          height: "100%",
          width: "100%",
          justifyContent: "center",
          position: "absolute",
        }}
      >
        <p style={{ color: "white", margin: "0", fontSize: "25px", textShadow: "1px 1px 2px black" }}>
          {data.title || "Currently not playing anything"}
        </p>
        <p style={{ color: "whitesmoke", margin: "0", textShadow: "1px 1px 2px black" }}>{data.artist || "Tricked-dev"}</p>
      </div>
      <div
        style={{
          display: "flex",
          marginTop: "auto",
          marginLeft: "10px",
          marginRight: "10px",
          top: "-30px",
          color: "white",
        }}
      >

        <div
          style={{
            position: "absolute",
            top: "10px",
            width: "100%",
            height: "7px",
            backgroundColor: "gray",
            borderRadius: "5px",
            border: "none",
            overflow: "hidden",
            boxShadow: "12px 12px 2px 1px rgba(0, 0, 255, .2);"
          }}
        />
        <div
          style={{
            position: "absolute",
            top: "10px",
            width: `${Math.max((at / data.duration.end) * 100, 1) | 0}%`,
            height: "7px",
            backgroundColor: "white",
            borderRadius: "5px",
            border: "none",
            overflow: "hidden",
          }}
        />
      </div>
    </div>,
    {
      width: 500,
      height: 230,
      fonts: [
        {
          name: "Roboto",
          data: fontData,
          weight: 400,
          style: "normal",
        },
      ],
    },
  );

  return c.text(svg, 200, {
    "Content-Type": "image/svg+xml",
    "Cache-Control": "max-age=2",
  });
});

console.log(`Listening on port http://localhost:${port}`);

export default { ...app, port, hostname: host };
