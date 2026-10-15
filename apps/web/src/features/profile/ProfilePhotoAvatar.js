import { useEffect, useState } from "react";
import { getProfilePhotoUrl } from "./profilePhotoStorage";
/** A private-storage avatar with a resilient initials fallback. */
export function ProfilePhotoAvatar({ name, initials, path, className = "directory-person-avatar" }) {
    const [url, setUrl] = useState(null);
    useEffect(() => {
        let active = true;
        void getProfilePhotoUrl(path).then((next) => { if (active)
            setUrl(next); });
        return () => { active = false; };
    }, [path]);
    return <span className={className} aria-hidden="true" title={`${name} profile photo`}>
    {url ? <img src={url} alt=""/> : initials}
  </span>;
}
