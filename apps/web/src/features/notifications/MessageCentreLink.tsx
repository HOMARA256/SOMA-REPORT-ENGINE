import { MessageCircleMore } from "lucide-react";
import { Link, useLocation } from "react-router-dom";

export function ContactPlatformSupportButton({ category="GENERAL_SUPPORT", label="Contact platform support", relatedType, relatedId }: { category?: string; label?: string; relatedType?: string; relatedId?: string }) {
  const location = useLocation();
  const returnTo = `${location.pathname}${location.search}`;
  const query = new URLSearchParams({ category, returnTo });
  if (relatedType) query.set("relatedType", relatedType);
  if (relatedId) query.set("relatedId", relatedId);
  return <Link className="secondary-button" to={`/messages?${query.toString()}`}><MessageCircleMore size={16} />{label}</Link>;
}
