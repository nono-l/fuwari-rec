create table if not exists fuwari_songs (
  id text primary key,
  title text not null,
  title_kana text not null default '',
  artist text not null,
  artist_kana text not null default '',
  lyricist text not null default '',
  composer text not null default '',
  genre text not null default 'other',
  tieup text not null default '',
  karaoke_no text not null default '',
  lyrics text not null default '',
  key_note text not null default '',
  youtube_url text not null default '',
  created_by text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists fuwari_songs_title_idx on fuwari_songs (title);
create index if not exists fuwari_songs_artist_idx on fuwari_songs (artist);
create index if not exists fuwari_songs_genre_idx on fuwari_songs (genre);
create index if not exists fuwari_songs_karaoke_idx on fuwari_songs (karaoke_no);
create index if not exists fuwari_songs_updated_idx on fuwari_songs (updated_at desc);

insert into fuwari_songs (
  id, title, title_kana, artist, artist_kana, lyricist, composer,
  genre, tieup, karaoke_no, lyrics, key_note, created_by
) values
(
  's_pd_sakura',
  'さくらさくら',
  'さくらさくら',
  '日本古謡',
  'にほんこよう',
  '不詳',
  '不詳',
  'doyo',
  '',
  'FW-0001',
  'さくらさくら のやまもさとみ みわたすかぎり かすみか雲か あさひににおう さくらさくら はなざかり',
  'A3',
  ''
),
(
  's_pd_furusato',
  'ふるさと',
  'ふるさと',
  '文部省唱歌',
  'もんぶしょうしょうか',
  '高野辰之',
  '岡野貞一',
  'doyo',
  '',
  'FW-0002',
  'うさぎおいし かのやま こぶなつりし かのかわ ゆめはいまも めぐりて わすれがたき ふるさと',
  'F4',
  ''
),
(
  's_pd_haru',
  '春が来た',
  'はるがきた',
  '文部省唱歌',
  'もんぶしょうしょうか',
  '高野辰之',
  '岡野貞一',
  'doyo',
  '',
  'FW-0003',
  'はるがきた はるがきた どこにきた やまにきた さとにきた のにもきた',
  'C4',
  ''
),
(
  's_pd_oboro',
  '朧月夜',
  'おぼろづきよ',
  '文部省唱歌',
  'もんぶしょうしょうか',
  '高野辰之',
  '岡野貞一',
  'doyo',
  '',
  'FW-0004',
  'なのはなばたけに いるなみじかき ゆうぐれどき あめあがりの にほひただよふ をかしきや',
  'Eb4',
  ''
),
(
  's_pd_kojo',
  '荒城の月',
  'こうじょうのつき',
  '滝廉太郎',
  'たきれんたろう',
  '土井晩翠',
  '滝廉太郎',
  'doyo',
  '',
  'FW-0005',
  '春高楼の 花の宴 めぐる盃 かげさして 千代の松が枝 分け出でし むかしの光 いまいずこ',
  'D4',
  ''
),
(
  's_pd_hotaru',
  '蛍の光',
  'ほたるのひかり',
  '日本古謡',
  'にほんこよう',
  '稲垣千頴',
  'スコットランド民謡',
  'doyo',
  '',
  'FW-0006',
  'ほたるのひかり まどのゆき ふみよむつき日 かさねつつ いつしかとしも すぎのとを あけてぞけさは わかれゆく',
  'G4',
  ''
),
(
  's_pd_haruogawa',
  '春の小川',
  'はるのおがわ',
  '文部省唱歌',
  'もんぶしょうしょうか',
  '高野辰之',
  '岡野貞一',
  'doyo',
  '',
  'FW-0007',
  '春の小川は さらさらゆくよ 岸のすみれや れんげの花に すがたやさしく 色うつくしく 咲いています 咲いています',
  'F4',
  ''
),
(
  's_pd_momiji',
  '紅葉',
  'もみじ',
  '文部省唱歌',
  'もんぶしょうしょうか',
  '高野辰之',
  '岡野貞一',
  'doyo',
  '',
  'FW-0008',
  '秋の夕日に 照らされて 山の紅葉は ええてます 濃いも薄いも 数ある中に 松を緑に かこまれて',
  'F4',
  ''
)
on conflict (id) do nothing;
