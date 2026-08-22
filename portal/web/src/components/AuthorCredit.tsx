import { monogram, monogramColor } from "../lib/psn";
import type { Author } from "../lib/api/client";

/**
 * M10.5 — who made this, wherever the portal shows somebody's content.
 *
 * The API returns a display name and a **re-hosted** avatar URL
 * (media.game-on-portugal.pt, never cdn.discordapp.com — see
 * portal/api/src/repositories/credit.ts), so this component never has to know
 * a Discord id existed. It cannot construct one either, which is the point.
 *
 * Three states, all real and all rendered rather than hidden:
 *   - name + avatar — the common case once the bot's profile sync has run
 *   - name, no avatar — the member uses Discord's generated default, or the
 *     re-host failed. Falls back to the same hashed monogram tile the trophy
 *     leaderboard uses (`lib/psn.ts`), so a row is never a blank square.
 *   - no author at all — the bot has no cached profile yet, or the account is
 *     gone. Renders nothing; the caller keeps showing the content, because
 *     hiding an uncredited screenshot would make the gallery's own count lie.
 *
 * The avatar is a plain `<img>`, not `LazyImage`: it is a 128px picture
 * rendered at 20-28px, so viewport-gating it would cost an IntersectionObserver
 * per tile to save nothing. `loading="lazy"` still applies. It is also
 * `aria-hidden` — the name beside it is the accessible content, and "avatar
 * de X" next to "X" is noise in a screen reader.
 */
export function AuthorCredit({
  author,
  messageUrl,
  size = "sm",
}: {
  author: Author | null;
  /** Discord permalink. When present, the credit links to it. */
  messageUrl?: string | null;
  size?: "sm" | "md";
}) {
  if (!author) return null;

  const avatarSize = size === "md" ? "h-7 w-7 text-xs" : "h-5 w-5 text-[10px]";
  const textSize = size === "md" ? "text-sm" : "text-[11px]";

  const body = (
    <>
      {author.avatarUrl ? (
        <img
          src={author.avatarUrl}
          alt=""
          aria-hidden
          loading="lazy"
          decoding="async"
          className={`${avatarSize} shrink-0 rounded-full object-cover`}
        />
      ) : (
        <span
          aria-hidden
          className={`${avatarSize} grid shrink-0 place-items-center rounded-full font-display font-extrabold text-background`}
          style={{ backgroundColor: monogramColor(author.name) }}
        >
          {monogram(author.name)}
        </span>
      )}
      <span className={`${textSize} truncate text-white/70`}>{author.name}</span>
    </>
  );

  if (!messageUrl) {
    return <span className="flex min-w-0 items-center gap-1.5">{body}</span>;
  }

  return (
    <a
      href={messageUrl}
      target="_blank"
      rel="noreferrer"
      // The permalink is what makes the credit verifiable rather than a claim
      // the portal invents (plan 09 decision 1) — so it is a real link, with
      // the destination named for anyone not seeing the Discord logo context.
      title="Ver a mensagem original no Discord"
      className="focus-glow flex min-w-0 items-center gap-1.5 rounded transition-colors hover:text-white"
      onClick={(event) => event.stopPropagation()}
    >
      {body}
      <span className="sr-only">(ver no Discord)</span>
    </a>
  );
}
