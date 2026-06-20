"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { AnchorHTMLAttributes, MouseEvent } from "react";
import { useEffect } from "react";

type PreserveScrollLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  href: string;
};

declare global {
  interface Window {
    __novelWriterPreservedScrollY?: number;
  }
}

export function PreserveScrollLink({ onClick, ...props }: PreserveScrollLinkProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams.toString();

  useEffect(() => {
    const y = window.__novelWriterPreservedScrollY;
    delete window.__novelWriterPreservedScrollY;

    if (typeof y !== "number" || !Number.isFinite(y)) return;

    restoreScroll(y);
  }, [pathname, search]);

  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    if (
      event.button === 0 &&
      !event.metaKey &&
      !event.ctrlKey &&
      !event.shiftKey &&
      !event.altKey &&
      !event.defaultPrevented
    ) {
      event.preventDefault();
      const y = window.scrollY;
      window.__novelWriterPreservedScrollY = y;
      event.currentTarget.blur();
      router.push(props.href, { scroll: false });
      restoreScroll(y);
    }
    onClick?.(event);
  }

  return <a {...props} onClick={handleClick} />;
}

function restoreScroll(y: number) {
  const restore = () => window.scrollTo(0, y);

  requestAnimationFrame(() => {
    restore();
    requestAnimationFrame(restore);
  });
  window.setTimeout(restore, 40);
  window.setTimeout(restore, 140);
  window.setTimeout(restore, 260);
}
