import { useEffect, useState } from "react";
import { getProfilePhotoUrl } from "./profilePhotoStorage";

type Props = {
  name: string;
  initials: string;
  path?: string | null;
  className?: string;
};

/** A private-storage avatar with a resilient initials fallback. */
export function ProfilePhotoAvatar({ name, initials, path, className = "directory-person-avatar" }: Props) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void getProfilePhotoUrl(path).then((next) => { if (active) setUrl(next); });
    return () => { active = false; };
  }, [path]);

  return <span className={className} aria-hidden="true" title={`${name} profile photo`}>
    {url ? <img src={url} alt="" /> : initials}
  </span>;
}
