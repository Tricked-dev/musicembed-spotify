let lastSong = "";
let it = 0;

const resetLim = parseInt(process.env.RESET_LIM ?? "10");
const interval = parseInt(process.env.INTERVAL ?? "1000");

let errored = false;

const debug = process.env.DEBUG == "1";

for (;;) {
  try {
    await new Promise((r) => setTimeout(r, interval));
    const text =
      await Bun.$`playerctl metadata --format "{{artist}}%{{title}}%{{mpris:artUrl}}%{{mpris:length}}%{{position}}"`
        .text()
        .then((r) => r.trim().split("%"));
    if (text[1] == lastSong && it != resetLim) {
      it++;
      continue;
    } else {
      it = 0;
      lastSong = text[1];
    }
    const s = await fetch(process.env.PUBLIC_URL as string, {
      method: "POST",
      headers: {
        secret: process.env.SECRET as string,
      },
      body: text.join("%"),
    });
    if (debug) console.log("Done updating!", text, s.status, s.statusText);
    errored = false;
  } catch (e) {
    // only log this error once so the console is not spammed with errorr klol
    if (!errored) console.log("Cooking failed error occured ", e);
    errored = true;
  }
}
