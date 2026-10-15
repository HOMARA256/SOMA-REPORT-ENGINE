import { Maximize2, Minimize2 } from "lucide-react";
import { useEffect, useState } from "react";
export function FullscreenButton({ className = "topbar-icon-button" }) {
    const [active, setActive] = useState(Boolean(document.fullscreenElement));
    useEffect(() => {
        const sync = () => setActive(Boolean(document.fullscreenElement));
        document.addEventListener("fullscreenchange", sync);
        return () => document.removeEventListener("fullscreenchange", sync);
    }, []);
    async function toggleFullscreen() {
        try {
            if (document.fullscreenElement)
                await document.exitFullscreen();
            else
                await document.documentElement.requestFullscreen();
        }
        catch {
            setActive(Boolean(document.fullscreenElement));
        }
    }
    return <button type="button" className={className} onClick={() => void toggleFullscreen()} aria-label={active ? "Exit full screen" : "Enter full screen"} title={active ? "Exit full screen" : "Full screen"} aria-pressed={active}>{active ? <Minimize2 size={18} aria-hidden="true"/> : <Maximize2 size={18} aria-hidden="true"/>}</button>;
}
