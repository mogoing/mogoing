/* 莫古游戏 - PvZ 离线缓存 Service Worker
 * 首次进入 pvz.html 后，把整个游戏缓存到本地；
 * 之后进入直接读缓存（秒开、离线可玩）；
 * 版本更新（version.json 变化 -> pvz.html 带参重载 -> 注册 sw.js?v=N）时自动清旧缓存重新缓存。
 */
var CACHE_NAME = 'mogoing-pvz-v2';
/* ---- ab/（Flash 游戏）持久缓存：字节校验 + gz 解压 + 独立缓存 ----
 * 覆盖愤怒小鸟/割绳子/滑雪/登山赛车等 Ruffle 游戏的资源。
 * 命中 CacheStorage 直接返回（零网络、永不过期）；坏缓存/断流缓存自动删除重下。
 */
var CACHE_AB = 'ab-v53';
var GZ_WASM = ['72a20ef1c0b8ceb37720.wasm', '826bb0938097485a2c9d.wasm'];
var GZ_SIZE = { '72a20ef1c0b8ceb37720.wasm.gz': 4976993, '826bb0938097485a2c9d.wasm.gz': 4984326 };
var FILE_SIZE = {
  'ruffle.js': 465076,
  'core.ruffle.c80159b526e567babaf5.js': 108322,
  'core.ruffle.f000070ea72f8ae4fe3a.js': 114739,
  'angry_birds.swf': 7122218,
  'cursed-treasure-1.swf': 7987921,
  'skisafari.swf': 10319667
};
var PRECACHE = [
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/asp/GetImZombieCreateGameList222.asp",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/asp/GetUser.asp",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/audio/Look%20up%20at%20the%20Sky.mp3",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/audio/Look%20up%20at%20the%20Sky.ogg",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/audio/awooga.mp3",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/audio/awooga.ogg",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/audio/balloon_pop.mp3",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/audio/balloon_pop.ogg",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/audio/ballooninflate.mp3",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/audio/ballooninflate.ogg",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/audio/blover.mp3",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/audio/bowling.mp3",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/audio/bowling.ogg",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/audio/bowlingimpact.mp3",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/audio/bowlingimpact.ogg",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/audio/bowlingimpact2.mp3",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/audio/bowlingimpact2.ogg",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/audio/buttonclick.mp3",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/audio/buttonclick.ogg",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/audio/cherrybomb.mp3",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/audio/cherrybomb.ogg",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/audio/chomp.mp3",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/audio/chomp.ogg",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/audio/chompsoft.mp3",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/audio/chompsoft.ogg",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/audio/coffee.mp3",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/audio/coffee.ogg",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/audio/dancer.mp3",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/audio/dancer.ogg",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/audio/dolphin_appears.mp3",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/audio/dolphin_appears.ogg",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/audio/dolphin_before_jumping.mp3",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/audio/dolphin_before_jumping.ogg",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/audio/doomshroom.mp3",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/audio/doomshroom.ogg",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/audio/evillaugh.mp3",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/audio/evillaugh.ogg",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/audio/explosion.mp3",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/audio/explosion.ogg",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/audio/finalwave.mp3",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/audio/finalwave.ogg",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/audio/firepea.mp3",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/audio/firepea.ogg",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/audio/frozen.mp3",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/audio/frozen.ogg",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/audio/fume.mp3",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/audio/fume.ogg",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/audio/gargantuar_thump.mp3",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/audio/gargantuar_thump.ogg",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/audio/grassstep.mp3",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/audio/grassstep.ogg",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/audio/gravebusterchomp.mp3",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/audio/gravebusterchomp.ogg",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/audio/gravebutton.mp3",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/audio/gravebutton.ogg",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/audio/groan1.mp3",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/audio/groan1.ogg",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/audio/groan2.mp3",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/audio/groan2.ogg",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/audio/groan3.mp3",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/audio/groan3.ogg",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/audio/groan4.mp3",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/audio/groan4.ogg",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/audio/groan5.mp3",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/audio/groan5.ogg",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/audio/groan6.mp3",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/audio/groan6.ogg",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/audio/hugewave.mp3",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/audio/hugewave.ogg",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/audio/ignite.mp3",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/audio/ignite.ogg",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/audio/ignite2.mp3",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/audio/ignite2.ogg",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/audio/jack_surprise.mp3",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/audio/jack_surprise.ogg",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/audio/jackinthebox.mp3",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/audio/jackinthebox.ogg",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/audio/jalapeno.mp3",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/audio/jalapeno.ogg",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/audio/kernelpult.mp3",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/audio/kernelpult.ogg",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/audio/kernelpult2.mp3",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/audio/kernelpult2.ogg",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/audio/losemusic.mp3",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/audio/losemusic.ogg",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/audio/newspaper_rarrgh2.mp3",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/audio/newspaper_rarrgh2.ogg",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/audio/pause.mp3",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/audio/pause.ogg",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/audio/plant1.mp3",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/audio/plant1.ogg",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/audio/plant2.mp3",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/audio/plant2.ogg",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/audio/plantgrow.mp3",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/audio/plantgrow.ogg",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/audio/plantsgarden.mp3",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/audio/plantsgarden.ogg",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/audio/plastichit.mp3",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/audio/plastichit.ogg",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/audio/points.mp3",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/audio/points.ogg",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/audio/polevault.mp3",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/audio/polevault.ogg",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/audio/potato_mine.mp3",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/audio/potato_mine.ogg",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/audio/puff.mp3",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/audio/puff.ogg",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/audio/readysetplant.mp3",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/audio/readysetplant.ogg",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/audio/scream.mp3",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/audio/scream.ogg",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/audio/seedlift.mp3",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/audio/seedlift.ogg",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/audio/shieldhit.mp3",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/audio/shieldhit.ogg",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/audio/shieldhit2.mp3",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/audio/shieldhit2.ogg",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/audio/shovel.mp3",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/audio/shovel.ogg",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/audio/siren.mp3",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/audio/siren.ogg",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/audio/splat1.mp3",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/audio/splat1.ogg",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/audio/splat2.mp3",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/audio/splat2.ogg",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/audio/splat3.mp3",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/audio/splat3.ogg",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/audio/squash_hmm.mp3",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/audio/squash_hmm.ogg",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/audio/tap.mp3",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/audio/tap.ogg",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/audio/wakeup.mp3",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/audio/wakeup.ogg",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/audio/winmusic.mp3",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/audio/winmusic.ogg",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/audio/zamboni.mp3",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/audio/zamboni.ogg",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/audio/zombie_entering_water.mp3",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/audio/zombie_entering_water.ogg",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/favicon.ico",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/font/DwarvenTodcraft.ttf",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/font/PVZ2_Regular.ttf",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/font/briannetod.ttf",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/font/hkhb.TTF",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/g.css",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Card/Plants/Blover.png",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Card/Plants/BoomWallNut.png",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Card/Plants/Cactus.png",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Card/Plants/CherryBomb.png",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Card/Plants/Chomper.png",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Card/Plants/CoffeeBean.png",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Card/Plants/DoomShroom.png",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Card/Plants/FlowerPot.png",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Card/Plants/FumeShroom.png",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Card/Plants/Garlic.png",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Card/Plants/GatlingPea.png",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Card/Plants/GloomShroom.png",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Card/Plants/GraveBuster.png",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Card/Plants/HugeWallNut.png",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Card/Plants/HypnoShroom.png",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Card/Plants/IceShroom.png",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Card/Plants/Jalapeno.png",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Card/Plants/LilyPad.png",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Card/Plants/Peashooter.png",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Card/Plants/Plantern.png",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Card/Plants/PotatoMine.png",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Card/Plants/PuffShroom.png",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Card/Plants/PumpkinHead.png",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Card/Plants/Repeater.png",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Card/Plants/Repeater2.png",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Card/Plants/ScaredyShroom.png",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Card/Plants/SeaShroom.png",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Card/Plants/SnowPea.png",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Card/Plants/Spikerock.png",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Card/Plants/Spikeweed.png",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Card/Plants/SplitPea.png",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Card/Plants/Squash.png",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Card/Plants/Starfruit.png",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Card/Plants/SunFlower.png",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Card/Plants/SunShroom.png",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Card/Plants/TallNut.png",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Card/Plants/TangleKlep.png",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Card/Plants/Threepeater.png",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Card/Plants/Torchwood.png",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Card/Plants/TwinSunflower.png",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Card/Plants/WallNut.png",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Card/Zombies/BackupDancer.png",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Card/Zombies/Balloonzombie.png",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Card/Zombies/BucketheadZombie.png",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Card/Zombies/ConeheadZombie.png",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Card/Zombies/DancingZombie.png",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Card/Zombies/DolphinRiderZombie.png",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Card/Zombies/DuckyTubeZombie1.png",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Card/Zombies/FlagZombie.png",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Card/Zombies/FootballZombie.png",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Card/Zombies/Imp.png",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Card/Zombies/JackboxZombie.png",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Card/Zombies/NewspaperZombie.png",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Card/Zombies/PoleVaultingZombie.png",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Card/Zombies/ScreenDoorZombie.png",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Card/Zombies/SnorkelZombie.png",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Card/Zombies/Zombie.png",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Card/Zombies/Zomboni.png",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Plants/Blover/0.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Plants/Blover/Blover.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Plants/Cactus/0.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Plants/Cactus/Attack.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Plants/Cactus/Attack2.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Plants/Cactus/Cactus.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Plants/Cactus/Cactus2.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Plants/Cactus/Elongation.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Plants/Cactus/Shorten.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Plants/CherryBomb/0.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Plants/CherryBomb/Boom.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Plants/CherryBomb/CherryBomb.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Plants/Chomper/0.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Plants/Chomper/Chomper.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Plants/Chomper/ChomperAttack.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Plants/Chomper/ChomperDigest.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Plants/CoffeeBean/0.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Plants/CoffeeBean/CoffeeBean.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Plants/CoffeeBean/CoffeeBeanEat.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Plants/DoomShroom/0.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Plants/DoomShroom/BeginBoom.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Plants/DoomShroom/Boom.png",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Plants/DoomShroom/DoomShroom.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Plants/DoomShroom/Sleep.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Plants/DoomShroom/crater10.png",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Plants/DoomShroom/crater11.png",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Plants/DoomShroom/crater20.png",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Plants/DoomShroom/crater21.png",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Plants/DoomShroom/crater30.png",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Plants/DoomShroom/crater31.png",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Plants/FlowerPot/0.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Plants/FlowerPot/FlowerPot.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Plants/FumeShroom/0.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Plants/FumeShroom/FumeShroom.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Plants/FumeShroom/FumeShroomAttack.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Plants/FumeShroom/FumeShroomBullet.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Plants/FumeShroom/FumeShroomSleep.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Plants/Garlic/0.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Plants/Garlic/Garlic.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Plants/Garlic/Garlic_body2.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Plants/Garlic/Garlic_body3.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Plants/GatlingPea/0.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Plants/GatlingPea/GatlingPea.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Plants/GloomShroom/0.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Plants/GloomShroom/GloomShroom.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Plants/GloomShroom/GloomShroomAttack.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Plants/GloomShroom/GloomShroomBullet.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Plants/GloomShroom/GloomShroomSleep.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Plants/GraveBuster/0.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Plants/GraveBuster/GraveBuster.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Plants/HypnoShroom/0.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Plants/HypnoShroom/HypnoShroom.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Plants/HypnoShroom/HypnoShroomSleep.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Plants/IceShroom/0.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Plants/IceShroom/IceShroom.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Plants/IceShroom/IceShroomSleep.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Plants/IceShroom/Snow.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Plants/IceShroom/icetrap.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Plants/Jalapeno/0.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Plants/Jalapeno/Jalapeno.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Plants/Jalapeno/JalapenoAttack.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Plants/LilyPad/0.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Plants/LilyPad/LilyPad.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Plants/PB-10.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Plants/PB00.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Plants/PB01.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Plants/PB10.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Plants/PB11.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Plants/PeaBulletHit.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Plants/Peashooter/0.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Plants/Peashooter/Peashooter.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Plants/Plantern/0.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Plants/Plantern/Plantern.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Plants/Plantern/light.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Plants/PotatoMine/0.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Plants/PotatoMine/ExplosionSpudow.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Plants/PotatoMine/PotatoMine.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Plants/PotatoMine/PotatoMineNotReady.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Plants/PotatoMine/PotatoMine_mashed.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Plants/PuffShroom/0.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Plants/PuffShroom/PuffShroom.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Plants/PuffShroom/PuffShroomSleep.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Plants/PumpkinHead/0.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Plants/PumpkinHead/PumpkinHead.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Plants/PumpkinHead/PumpkinHead1.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Plants/PumpkinHead/PumpkinHead2.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Plants/PumpkinHead/Pumpkin_back.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Plants/PumpkinHead/pumpkin_damage1.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Plants/PumpkinHead/pumpkin_damage2.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Plants/Repeater/0.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Plants/Repeater/Repeater.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Plants/Repeater2/0.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Plants/Repeater2/Repeater2.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Plants/ScaredyShroom/0.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Plants/ScaredyShroom/ScaredyShroom.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Plants/ScaredyShroom/ScaredyShroomCry.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Plants/ScaredyShroom/ScaredyShroomSleep.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Plants/SeaShroom/0.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Plants/SeaShroom/SeaShroom.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Plants/SeaShroom/SeaShroomSleep.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Plants/ShroomBullet.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Plants/ShroomBulletHit.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Plants/SnowPea/0.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Plants/SnowPea/SnowPea.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Plants/Spikerock/0.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Plants/Spikerock/2.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Plants/Spikerock/3.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Plants/Spikerock/Spikerock.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Plants/Spikeweed/0.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Plants/Spikeweed/Spikeweed.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Plants/SplitPea/0.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Plants/SplitPea/SplitPea.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Plants/Squash/0.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Plants/Squash/Squash.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Plants/Squash/SquashAttack.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Plants/Squash/SquashL.png",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Plants/Squash/SquashR.png",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Plants/Starfruit/0.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Plants/Starfruit/Star.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Plants/Starfruit/Starfruit.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Plants/SunFlower/0.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Plants/SunFlower/SunFlower.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Plants/SunFlower/SunFlower1.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Plants/SunShroom/0.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Plants/SunShroom/SunShroom.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Plants/SunShroom/SunShroom2.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Plants/SunShroom/SunShroomSleep.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Plants/TallNut/0.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Plants/TallNut/TallNut.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Plants/TallNut/TallnutCracked1.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Plants/TallNut/TallnutCracked2.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Plants/TangleKlep/0.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Plants/TangleKlep/Float.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Plants/TangleKlep/Grab.png",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Plants/Threepeater/0.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Plants/Threepeater/Threepeater.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Plants/Torchwood/0.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Plants/Torchwood/SputteringFire.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Plants/Torchwood/Torchwood.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Plants/TwinSunflower/0.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Plants/TwinSunflower/TwinSunflower.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Plants/TwinSunflower/TwinSunflower1.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Plants/WallNut/0.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Plants/WallNut/1.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Plants/WallNut/2.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Plants/WallNut/BoomWallNutRoll.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Plants/WallNut/HugeWallNutRoll.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Plants/WallNut/WallNut.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Plants/WallNut/WallNutRoll.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Plants/WallNut/Wallnut_cracked1.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Plants/WallNut/Wallnut_cracked2.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Zombies/BackupDancer/Mound.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Zombies/BalloonZombie/Drop.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Zombies/BalloonZombie/Walk.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Zombies/BucketheadZombie/0.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Zombies/BucketheadZombie/1.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Zombies/BucketheadZombie/BucketheadZombie.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Zombies/BucketheadZombie/BucketheadZombieAttack.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Zombies/DancingZombie/Summon1.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Zombies/DancingZombie/Summon2.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Zombies/DancingZombie/Summon3.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Zombies/NewspaperZombie/1.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Zombies/PoleVaultingZombie/PoleVaultingZombieJump.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Zombies/PoleVaultingZombie/PoleVaultingZombieJump2.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Zombies/PoleVaultingZombie/PoleVaultingZombieWalk.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Zombies/Zombie/0.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Zombies/Zombie/2.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Zombies/Zombie/3.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Zombies/Zombie/BoomDie.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Zombies/Zombie/Zombie2.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Zombies/Zombie/Zombie3.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Zombies/Zombie/ZombieDie.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Zombies/Zombie/ZombieHead.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Zombies/Zomboni/2.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Zombies/Zomboni/3.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Zombies/Zomboni/4.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Zombies/Zomboni/ice.png",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/Zombies/Zomboni/ice_cap.png",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/interface/AjaxLoader.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/interface/Almanac_CloseButton.png",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/interface/Almanac_Ground.jpg",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/interface/Almanac_IndexBack.jpg",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/interface/Almanac_IndexBack.png",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/interface/Almanac_IndexButton.png",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/interface/Almanac_PlantBack.jpg",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/interface/Almanac_PlantCard.png",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/interface/Almanac_ZombieBack.jpg",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/interface/Almanac_ZombieCard.png",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/interface/Almanac_ZombieWindow2.png",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/interface/AwardScreen_Back.jpg",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/interface/Button.png",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/interface/Challenge.png",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/interface/Challenge_Background.jpg",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/interface/Dave.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/interface/Dave2.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/interface/Dave3.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/interface/FinalWave.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/interface/FlagMeterEmpty.png",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/interface/FlagMeterFull.png",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/interface/FlagMeterLevelProgress.png",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/interface/FlagMeterParts1.png",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/interface/FlagMeterParts2.png",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/interface/GrowSoil.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/interface/GrowSpray.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/interface/Help.png",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/interface/LargeWave.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/interface/LawnCleaner.png",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/interface/LoadBar.png",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/interface/Logo.jpg",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/interface/LogoWord.jpg",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/interface/OptionsBackButton32.png",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/interface/OptionsBackButton8.png",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/interface/OptionsMenuback32.png",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/interface/OptionsMenuback8.png",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/interface/PointerDown.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/interface/PointerUP.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/interface/PoolCleaner.png",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/interface/PrepareGrowPlants.png",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/interface/Scary_Pot.png",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/interface/SeedChooser_Background.png",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/interface/SelectorScreenAdventure_32.png",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/interface/SelectorScreenAdventure_8.png",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/interface/SelectorScreenChallenges.png",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/interface/SelectorScreenChallenges_32.png",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/interface/SelectorScreenChallenges_8.png",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/interface/SelectorScreenStartAdventur.png",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/interface/SelectorScreenStartAdventure_32.png",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/interface/SelectorScreenStartAdventure_8.png",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/interface/SelectorScreenSurvival_32.png",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/interface/SelectorScreenSurvival_8.png",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/interface/SelectorScreen_Almanac_32.png",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/interface/SelectorScreen_Almanac_8.png",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/interface/SelectorScreen_Shadow_Adventure.png",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/interface/SelectorScreen_Shadow_Challenge.png",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/interface/SelectorScreen_Shadow_Survival.png",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/interface/SelectorScreen_WoodSign1_32.png",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/interface/SelectorScreen_WoodSign1_8.png",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/interface/SelectorScreen_WoodSign2_32.png",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/interface/SelectorScreen_WoodSign2_8.png",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/interface/SelectorScreen_WoodSign3_32.png",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/interface/SelectorScreen_WoodSign3_8.png",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/interface/Shovel.png",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/interface/ShovelBack.png",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/interface/SodRoll.png",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/interface/SodRollCap.png",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/interface/Stripe.png",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/interface/Sun.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/interface/SunBack.png",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/interface/Sunflower_trophy32.png",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/interface/Sunflower_trophy8.png",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/interface/Surface.jpg",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/interface/Taco.png",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/interface/Tombstone_mounds.png",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/interface/Tombstones.png",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/interface/ZombieHand.png",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/interface/ZombieNote1.png",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/interface/ZombieNote2.png",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/interface/ZombieNote3.png",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/interface/ZombieNoteSmall.png",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/interface/ZombiesWon.png",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/interface/background1.jpg",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/interface/background1unsodded.jpg",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/interface/background1unsodded2.jpg",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/interface/background1unsodded_1.jpg",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/interface/background2.jpg",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/interface/background3.jpg",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/interface/background3_2.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/interface/background4.jpg",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/interface/balloon_zombie32.png",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/interface/bengji.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/interface/blank.png",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/interface/brain.png",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/interface/button_left.png",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/interface/button_middle.png",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/interface/button_right.png",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/interface/crater1.png",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/interface/dialog_bigbottomleft.png",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/interface/dialog_bigbottommiddle.png",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/interface/dialog_bigbottomright.png",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/interface/dialog_bottomleft.png",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/interface/dialog_bottommiddle.png",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/interface/dialog_bottomright.png",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/interface/dialog_centerleft.png",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/interface/dialog_centermiddle.png",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/interface/dialog_centerright.png",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/interface/dialog_header.png",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/interface/dialog_topleft.png",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/interface/dialog_topmiddle.png",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/interface/dialog_topright.png",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/interface/editbox.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/interface/plantshadow32.png",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/interface/plantshadow8.gif",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/interface/sod1row.png",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/interface/sod3row.png",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/interface/splash.png",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/interface/talk.png",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/interface/trophy.png",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/images/link/flash.swf",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/js/CPlants.js",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/js/CZombie.js",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/js/Cfunction.js",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/js/ggadsense.htm",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/js/json2.js",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/js/md5.js",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/level/0.js",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/level/1.js",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/level/10.js",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/level/11.js",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/level/12.js",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/level/13.js",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/level/14.js",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/level/15.js",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/level/16.js",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/level/17.js",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/level/18.js",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/level/19.js",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/level/2.js",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/level/20.js",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/level/21.js",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/level/22.js",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/level/23.js",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/level/24.js",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/level/25.js",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/level/26.js",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/level/27.js",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/level/28.js",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/level/29.js",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/level/3.js",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/level/30.js",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/level/31.js",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/level/32.js",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/level/33.js",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/level/34.js",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/level/35.js",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/level/4.js",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/level/5.js",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/level/6.js",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/level/7.js",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/level/8.js",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/level/9.js",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/new_skin/back.jpg",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/new_skin/game_ipt.png",
    "2025%E5%B9%B49%E6%9C%8825%E6%97%A5pvz/plantsvszombies.htm",
];

// 预缓存：逐个容错（单文件失败不影响整体），完成后接管页面
self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(CACHE_NAME).then(function(c) {
      return Promise.all(PRECACHE.map(function(u) {
        return c.add(u).catch(function() {});
      })).then(function() { return self.skipWaiting(); });
    })
  );
});

// 激活：清掉旧版本缓存，接管所有同源页面
self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(k) { return k !== CACHE_NAME && k !== CACHE_AB; })
            .map(function(k) { return caches.delete(k); })
      );
    }).then(function() { return self.clients.claim(); })
  );
});

// 请求策略：同源 GET 才拦截
//  - HTML/HTM 页面：网络优先（保证网页更新立即可见）
//  - 其他静态资源（图片/音频/js/关卡）：缓存优先，命中直接返回（不再下载）
//  - 跨域（看剧站/后端 API）：不拦截
self.addEventListener('fetch', function(e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url;
  try { url = new URL(req.url); } catch (err) { return; }
  if (url.origin !== self.location.origin) return;
  if (url.pathname.indexOf('sw.js') >= 0) return;

  if (req.mode === 'navigate' || url.pathname.endsWith('.html') || url.pathname.endsWith('.htm')) {
    e.respondWith(
      fetch(req).then(function(res) {
        if (res && res.status === 200) {
          var copy = res.clone();
          caches.open(CACHE_NAME).then(function(c) { c.put(req, copy); });
        }
        return res;
      }).catch(function() { return caches.match(req); })
    );
    return;
  }

  /* ---- ab/（Flash 游戏）专用分支：字节校验 + gz 解压 + 独立持久缓存 ---- */
  var ap = url.pathname;
  var isRawWasm = ap.indexOf('.wasm') > -1 && ap.indexOf('.wasm.gz') === -1 && GZ_WASM.some(function(w) { return ap.indexOf(w) > -1; });
  var isAbStatic = ap.indexOf('/ab/') === 0 && (/\\.(js|swf)$/.test(ap) || ap.indexOf('.wasm.gz') > -1);
  if (isRawWasm || isAbStatic) {
    e.respondWith((async function() {
      if (isRawWasm) {
        /* 原始 .wasm 请求：走 gz 缓存/下载 + 解压 */
        var gzName = ap + '.gz';
        var gzFile = gzName.split('/').pop();
        var gzSize = GZ_SIZE[gzFile];
        try {
          var abCache = await caches.open(CACHE_AB);
          var gzHit = await abCache.match(gzName);
          if (gzHit) {
            var gb = await gzHit.arrayBuffer();
            if (!gzSize || gb.byteLength === gzSize) return gz2wasm(gb);
            await abCache.delete(gzName);
          }
          for (var t = 0; t < 2; t++) {
            var gres = await fetch(gzName, { cache: 'reload' });
            if (!gres.ok) continue;
            var gbuf = await gres.arrayBuffer();
            if (!gzSize || gbuf.byteLength === gzSize) {
              try { await abCache.put(gzName, new Response(gbuf, { headers: { 'Content-Type': 'application/gzip' } })); } catch (err) {}
              return gz2wasm(gbuf);
            }
          }
          return new Response('bad gz', { status: 502 });
        } catch (err) {
          return fetch(e.request);
        }
      }
      /* js / swf / wasm.gz：缓存优先，写入前字节校验 */
      var abCache2 = await caches.open(CACHE_AB);
      var abHit = await abCache2.match(e.request);
      if (abHit) return abHit;
      var fname = ap.split('/').pop();
      var fsize = FILE_SIZE[fname];
      var fresp = await fetch(e.request);
      if (fresp && fresp.ok) {
        if (fsize) {
          var farr = await fresp.clone().arrayBuffer();
          if (farr.byteLength === fsize) {
            try { await abCache2.put(e.request, fresp.clone()); } catch (err) {}
          } else {
            try { await abCache2.delete(e.request); } catch (err) {}
            var fresp2 = await fetch(e.request, { cache: 'reload' });
            if (fresp2 && fresp2.ok) {
              var farr2 = await fresp2.clone().arrayBuffer();
              if (farr2.byteLength === fsize) { try { await abCache2.put(e.request, fresp2.clone()); } catch (err) {} }
            }
            return fresp2;
          }
        } else {
          try { await abCache2.put(e.request, fresp.clone()); } catch (err) {}
        }
      }
      return fresp;
    })());
    return;
  }

  /* ---- 其它资源：网络优先（拿到的永远是完整的），离线才用缓存 ----
     之前是「缓存优先」，一旦某次网络中断把半截响应缓存进去，游戏就会一直卡 0%，
     所以这里改成网络优先，成功响应覆盖缓存，坏缓存不再长期生效。 */
  e.respondWith(
    fetch(req).then(function(res) {
      if (res && res.status === 200) {
        var copy = res.clone();
        caches.open(CACHE_NAME).then(function(c) { c.put(req, copy); }).catch(function(){});
      }
      return res;
    }).catch(function() {
      return caches.match(req).then(function(hit) {
        return hit || new Response('', { status: 504, statusText: 'offline' });
      });
    })
  );


function gz2wasm(buf) {
  if (typeof DecompressionStream === 'undefined') throw new Error('no-decompression');
  return new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip')), {
    headers: { 'Content-Type': 'application/wasm' }
  });
}
});
