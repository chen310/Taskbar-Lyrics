"use strict";


plugin.onLoad(async () => {
    const TaskbarLyricsAPI = this.api.TaskbarLyricsAPI;
    const pluginConfig = this.base.pluginConfig;
    const liblyric = loadedPlugins.liblyric;


    let observer = null;
    let parsedLyric = null;
    let currentIndex = 0;
    let musicId = 0;
    let currentLine = 0;


    // 监视软件内歌词变动
    const watchLyricsChange = async () => {
        const mLyric = await betterncm.utils.waitForElement("#x-g-mn .m-lyric");
        const MutationCallback = mutations => {
            for (const mutation of mutations) {
                let lyrics = {
                    basic: "",
                    extra: ""
                };

                if (mutation.addedNodes[2]) {
                    lyrics.basic = mutation.addedNodes[0].firstChild.textContent;
                    lyrics.extra = mutation.addedNodes[2].firstChild ? mutation.addedNodes[2].firstChild.textContent : "";
                } else {
                    lyrics.basic = mutation.addedNodes[0].textContent;
                }

                TaskbarLyricsAPI.lyrics(lyrics);
            }
        }

        observer = new MutationObserver(MutationCallback);
        observer.observe(mLyric, { childList: true, subtree: true });
    }


    // 音乐ID发生变化时
    async function play_load() {
        parsedLyric = null;

        // 获取歌曲信息
        const playingSong = betterncm.ncm.getPlayingSong();
        musicId = playingSong.data.id ?? 0;
        const name = playingSong.data.name ?? "";
        const artists = playingSong.data.artists ?? "";

        // 解析歌手名称
        let artistName = "";
        artists.forEach(item => artistName += ` / ${item.name}`);
        artistName = artistName.slice(3);

        // 发送歌曲信息
        TaskbarLyricsAPI.lyrics({
            "basic": name,
            "extra": artistName
        });

        // 解析歌词
        const lyricData = await liblyric.getLyricData(musicId);

        parsedLyric = liblyric.parseLyric(
            lyricData?.lrc?.lyric ?? "",
            lyricData?.tlyric?.lyric ?? "",
            lyricData?.romalrc?.lyric ?? ""
        ).filter(item => item.originalLyric != "");

        // 纯音乐只显示歌曲名与作曲家
        if (
            (parsedLyric.length == 1)
            && (parsedLyric[0].time == 0)
            && (parsedLyric[0].duration != 0)
        ) {
            parsedLyric = [];
        }

        currentIndex = 0;
    }


    // 音乐进度发生变化时
    async function play_progress(_, time) {
        const adjust = Number(pluginConfig.get("effect")["adjust"]);
        if (parsedLyric) {
            let nextIndex = parsedLyric.findIndex(item => item.time > (time + adjust) * 1000);
            nextIndex = (nextIndex <= -1) ? parsedLyric.length : nextIndex;

            if (nextIndex != currentIndex) {
                const currentLyric = parsedLyric[nextIndex - 1] ?? "";
                const nextLyric = parsedLyric[nextIndex] ?? "";

                const lyrics = {
                    "basic": currentLyric?.originalLyric ?? "",
                    "extra": currentLyric?.translatedLyric ?? nextLyric?.originalLyric ?? ""
                };

                const extra_show_value = pluginConfig.get("effect")["extra_show"]["value"];
                switch (extra_show_value) {
                    case "0": {
                        lyrics.extra = "";
                    } break;

                    case "1": {
                        const next_line_lyrics_position_value = pluginConfig.get("effect")["next_line_lyrics_position"]["value"];
                        switch (next_line_lyrics_position_value) {
                            case "0": {
                                lyrics.extra = nextLyric?.originalLyric ?? "";
                            } break;

                            case "1": {
                                lyrics.basic = nextLyric?.originalLyric ?? "";
                                lyrics.extra = currentLyric?.originalLyric ?? "";
                            } break;

                            case "2": {
                                if (currentLine == 0) {
                                    lyrics.basic = currentLyric?.originalLyric ?? "";
                                    lyrics.extra = nextLyric?.originalLyric ?? "";
                                    currentLine = 1;
                                } else {
                                    lyrics.basic = nextLyric?.originalLyric ?? "";
                                    lyrics.extra = currentLyric?.originalLyric ?? "";
                                    currentLine = 0;
                                }
                            } break;

                            default: {
                                lyrics.extra = nextLyric?.originalLyric ?? "";
                            } break;
                        }
                    } break;

                    case "2": {
                        lyrics.extra = currentLyric?.translatedLyric
                            ?? nextLyric?.originalLyric
                            ?? "";
                    } break;

                    case "3": {
                        lyrics.extra = currentLyric?.romanLyric
                            ?? currentLyric?.translatedLyric
                            ?? nextLyric?.originalLyric
                            ?? "";
                    } break;

                    default: {
                        lyrics.extra = currentLyric?.translatedLyric
                            ?? nextLyric?.originalLyric
                            ?? ""
                    } break;
                }

                TaskbarLyricsAPI.lyrics(lyrics);
                currentIndex = nextIndex;
            }
        }
    }


    // 开始获取歌词
    function startGetLyric() {
        const config = pluginConfig.get("lyrics");
        if (config["retrieval_method"]["value"] == "0") {
            legacyNativeCmder.appendRegisterCall("Load", "audioplayer", play_load);
            legacyNativeCmder.appendRegisterCall("PlayProgress", "audioplayer", play_progress);
            const playingSong = betterncm.ncm.getPlayingSong();
            if (playingSong && playingSong.data.id != musicId) {
                play_load();
            }
        }
        if (config["retrieval_method"]["value"] == "1") {
            watchLyricsChange();
        }
    }


    // 停止获取歌词
    function stopGetLyric() {
        const config = pluginConfig.get("lyrics");
        if (config["retrieval_method"]["value"] == "0") {
            legacyNativeCmder.removeRegisterCall("Load", "audioplayer", play_load);
            legacyNativeCmder.removeRegisterCall("PlayProgress", "audioplayer", play_progress);
        }
        if (config["retrieval_method"]["value"] == "1") {
            if (observer) {
                observer.disconnect();
                observer = null;
            }
        }
    }


    this.lyric = {
        startGetLyric,
        stopGetLyric
    }
});
