

chrome.tabs.onUpdated.addListener(function (tabId, changeInfo, tab) {
  if (changeInfo.status == "complete" && tab.active) {
    if (tab.url.startsWith("https://music.youtube.com")) {
      chrome.scripting.executeScript({
        target: {
          tabId: tab.id
        },
        func: () => {
          function _(v) {
            return document.querySelector(v[0])

          }

          const loadData = async () => {
            const progressBar = _`#progress-bar`

            const [startString, endString] = progressBar.ariaValueText.split(" of ");

            const parseSeconds = (timeString) => {
              const [minutes, seconds] = timeString.split(":").map(Number);
              return minutes * 60 + seconds;
            };

            const startSeconds = parseSeconds(startString);
            const endSeconds = parseSeconds(endString);


            const vidId = new URLSearchParams(window.location.search).get("v")

            const data = {
              thumbnail: _`img.image.style-scope.ytmusic-player-bar`?.src,
              title: _`.title.style-scope.ytmusic-player-bar`
                ?.innerText,
              artist: _`.complex-string.ytmusic-player-bar.style-scope.byline > .yt-formatted-string.style-scope.yt-simple-endpoint`.innerHTML,
              duration: {
                at: startSeconds,
                end: endSeconds,
              },
              videoId: {
                youtube: vidId
              }
            }

            await fetch(process.env.PLASMO_PUBLIC_URL, {
              method: "POST",
              body: JSON.stringify(data),
              headers: {
                secret: process.env.PLASMO_PUBLIC_SECRET
              }
            })
          }
          const tryIt = async () => {
            try {
              await loadData()
            } catch (e) {
              console.error(e)
            }
          }
          tryIt()
          setInterval(tryIt, 5000)
        }
      })
    }
    // do your things
    console.log(tab.url)
    console.log(tab)
  }
})

export { }
