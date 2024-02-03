# Music Embeds Spotify

This is sortof version 2 of https://github.com/Tricked-dev/musicembeds but instead it uses mpris to get the currently playing music making this solution only work on linux but with all music players instead you can change which music player to use in the server.tsx post file its currently hardcoded to spotify but you can change it to whatever.
Also everything needed to configure it can be found in .env.example

```ini
PORT=4124
SECRET=bwahaha
PUBLIC_URL=http://localhost:4124
```

To run the client run

```sh
bun client.tsx
```

to run the server run

```sh
bun i # the server requires some dependencies
```

```sh
bun server.tsx
```

The sourcecode is pretty simple and small so anyone should be able to understand / read it so feel free to do so this code is licensed under MIT OR APACHE 2.0
