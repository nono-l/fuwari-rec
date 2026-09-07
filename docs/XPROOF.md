# XProof 連携（Fuwari 側）

公開カードの身分は全部 XProof（`https://xauth.grok.me`、repo `nono-l/xproof`）から来る。
X / YouTube を手で書いて公開してはいけない。

XProof を作っているセッション向けの契約書は **向こうの
`docs/FUWARI.md`**。こちらはその受け側。

## 公開 URL

```
https://fuwa.pachimanzi.uk/c/{魂のID}
```

魂のIDは XProof の `soul_identities.soul_id`。Fuwari では選ばない。
未連携のあいだは公開カードを出さない。

## 開き方

`src/lib/profile/xproof.ts` の `xproofConnectUrl`:

```
https://xauth.grok.me/?client=fuwari
  &returnTo={origin}/profile
  &state={uuid}
  &nickname=Fuwari%20REC
```

ポップアップ優先。`postMessage` を待つ。来なければ `?token=` のフルページ戻り。

## 正本

ブラウザの JSON はヒント。保存はサーバの

```
POST https://xauth.grok.me/api/tauth/consume
{ "token", "client": "fuwari", "service_name": "Fuwari REC" }
```

が返す `soulId` と `identities` だけ。置き換え（マージしない）。

`src/lib/profile/server.ts` の `linkXproof`。
soulId が空、または別ユーザーが同じ魂のIDを使っていたら失敗。

## ファイル

| ファイル | 役割 |
| --- | --- |
| `src/lib/profile/types.ts` | `XPROOF_ORIGIN` / `XPROOF_CLIENT` |
| `src/lib/profile/xproof.ts` | 開き方、postMessage 検証、`/c/` URL |
| `src/lib/profile/server.ts` | consume と soul_id 保存 |
| `src/routes/profile.tsx` | 連携 UI。ハンドル入力なし |
| `src/routes/c.$soulId.tsx` | 公開カード |
| `migrations/0004_profiles_soul.sql` | `soul_id` 列 |

## 壊してはいけないこと

- ハンドル入力欄を「所有の証明」として復活させない
- consume を飛ばして postMessage の identities を DB に書かない
- 公開パスを `/u/{好きなslug}` に戻さない（互換で `/u/$slug` は `/c/` へリダイレクトだけ）
