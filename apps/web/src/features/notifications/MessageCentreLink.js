import { MessageCircleMore } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
export function ContactPlatformSupportButton({ category = "GENERAL_SUPPORT", label = "Contact platform support" }) {
    const location = useLocation();
    const returnTo = `${location.pathname}${location.search}`;
    return <Link className="secondary-button" to={`/messages?category=${encodeURIComponent(category)}&returnTo=${encodeURIComponent(returnTo)}`}><MessageCircleMore size={16}/>{label}</Link>;
}
