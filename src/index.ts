import { api as MisskeyAPI } from "misskey-js";

export interface Env {
  ORIGIN: string;
  TOKEN: string;
  CHANNEL_ID?: string;
  MISSKEY_EMOJIS: KVNamespace;
}

export type Emojis = {
  id: string;
  aliases: Array<string>;
  name: string;
  url: string;
  category: string;
  license: string;
}[];

const ping = async (
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  api: MisskeyAPI.APIClient,
): Promise<Response> => {
  const miResponse = await api.request('notes/create', {
    visibility: "followers",
    localOnly: true,
    text: "投稿テストです。",
  });
  return new Response(JSON.stringify(miResponse));
};

const newEmojiNote = async (
  event: ScheduledController | null,
  env: Env,
  ctx: ExecutionContext,
  api: MisskeyAPI.APIClient,
) => {
  const sinceId = (await env.MISSKEY_EMOJIS.get("sinceID")) as string;
  if (!sinceId) return new Response("Error: sinceId is not set");

  const emojis = await api.request('admin/emoji/list', {
      sinceId: sinceId,
      limit: 1,
  }) as Emojis;
  console.log(JSON.stringify(emojis));

  if (emojis.length <= 0) {
    console.log("no new emoji");
    return new Response("no new emoji");
  } else {
    const emoji = emojis[0]!;
    const nonEmpty = (s?: string | null) => s !== "" && s != null;

    const noteTexts = [`新しい絵文字:${emoji.name}:（\`${emoji.name}\`）が追加されました。`];

    if (nonEmpty(emoji.category)) {
      noteTexts.push(`この絵文字は\`${emoji.category}\`に分類されています。`);
    }

    if (nonEmpty(emoji.aliases[0])) {
      noteTexts.push(`また、この絵文字は\`${emoji.aliases.join(", ")}\`でも出す事が出来ます。`);
    }

    noteTexts.push(`$[x3 :${emoji.name}:]`);

    if (nonEmpty(emoji.license)) {
      const replacedMention = emoji.license.replaceAll("@", "@ ")
      noteTexts.push(`ライセンス： ${replacedMention}`);
    }

    console.log(emoji.name);
    await api.request('notes/create', {
      channelId: env.CHANNEL_ID,
      visibility: env.CHANNEL_ID ?  undefined : "followers",
      text: noteTexts.join('\n'),
    });

    await env.MISSKEY_EMOJIS.put("sinceID", emoji.id);

    return new Response("ok");
  }
};

const setSinceId = async (
  request: Request,
  env: Env,
  ctx: ExecutionContext
): Promise<Response> => {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("sinceId");
  if (!query) return new Response("no query");
  await env.MISSKEY_EMOJIS.put("sinceID", query);
  console.log(query);
  return new Response(query);
};

const getSinceId = async (
  request: Request,
  env: Env,
  ctx: ExecutionContext
): Promise<Response> => {
  const sinceId = (await env.MISSKEY_EMOJIS.get("sinceID")) as string;

  console.log(sinceId);

  if (!sinceId) return new Response("no sinceId");
  return new Response(sinceId);
};

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext
  ): Promise<Response> {
    const url = request.url;
    const api = new MisskeyAPI.APIClient({
      origin: env.ORIGIN,
      credential: env.TOKEN,
    });

    if (url.includes("ping")) return await ping(request, env, ctx, api);
    // if (url.includes('syncallemojis')) return await syncallemojis(request, env, ctx)
    if (url.includes("newemojicheck")) return await newEmojiNote(null, env, ctx, api);
    if (url.includes("setSinceId")) return await setSinceId(request, env, ctx);
    if (url.includes("getSinceId")) return await getSinceId(request, env, ctx);

    return new Response("not found");
  },
  async scheduled(event: ScheduledController, env: Env, ctx: ExecutionContext) {
    const api = new MisskeyAPI.APIClient({
      origin: env.ORIGIN,
      credential: env.TOKEN,
    });
    ctx.waitUntil(newEmojiNote(event, env, ctx, api));
  },
};
