import { useEffect } from "react";

// M8.13 — per-page SEO. index.html already carries the SITE-level OG/Twitter
// tags and the real og-image.png (M8.1) — this hook only ever *overrides*
// title/description/og:image/og:url for the current route, restoring the
// site defaults on unmount, rather than re-declaring the whole tag set.
//
// No react-helmet or similar: this is a client-rendered SPA with no SSR (the
// index.html tags are what a link-unfurler actually reads, since most don't
// execute JS), so a per-page <head> library would only ever affect the
// in-browser <title>/meta — which document.title + a few direct DOM writes
// already does, at zero new dependency weight. If server-rendering or
// pre-rendering is ever added, per-page OG tags become load-bearing for
// unfurling too and this should be revisited.

export interface DocumentHead {
  title: string;
  description?: string;
  /** Absolute URL. Defaults to the site's own og-image.png (set in index.html) when omitted. */
  image?: string;
  /** Path (e.g. "/marketplace/abc") — combined with location.origin for og:url. */
  path?: string;
  /** Pages that should never be indexed (admin) — adds <meta name="robots" content="noindex, nofollow">. */
  noindex?: boolean;
}

const SITE_TITLE = "Game On Portugal";

function setMeta(property: string, content: string, attr: "property" | "name" = "property"): () => void {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${property}"]`);
  const existed = !!el;
  const previous = el?.getAttribute("content") ?? null;
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, property);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);

  return () => {
    if (!el) return;
    if (existed && previous !== null) {
      el.setAttribute("content", previous);
    } else if (!existed) {
      el.remove();
    }
  };
}

export function useDocumentHead(head: DocumentHead): void {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = head.title === SITE_TITLE ? SITE_TITLE : `${head.title} — ${SITE_TITLE}`;

    const cleanups: Array<() => void> = [];
    cleanups.push(setMeta("og:title", head.title));
    if (head.description) {
      cleanups.push(setMeta("description", head.description, "name"));
      cleanups.push(setMeta("og:description", head.description));
    }
    if (head.image) {
      cleanups.push(setMeta("og:image", head.image));
    }
    const url = `${window.location.origin}${head.path ?? window.location.pathname}`;
    cleanups.push(setMeta("og:url", url));

    let robotsCleanup: (() => void) | undefined;
    if (head.noindex) {
      robotsCleanup = setMeta("robots", "noindex, nofollow", "name");
    }

    return () => {
      document.title = previousTitle;
      for (const cleanup of cleanups) cleanup();
      robotsCleanup?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [head.title, head.description, head.image, head.path, head.noindex]);
}
