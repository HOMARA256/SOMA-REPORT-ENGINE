import { ArrowLeft } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useNavigationType } from "react-router-dom";
function isPlatformPath(path) {
    return path.startsWith("/platform/");
}
function isWorkspaceStartPath(path) {
    return new Set([
        "/dashboard",
        "/school/o-level",
        "/school/alevel",
        "/school/learners",
        "/people/users",
        "/setup/academic-years",
        "/setup/classes",
        "/setup/health",
        "/setup/teacher-allocations",
        "/setup/subjects",
        "/setup/assessments",
        "/marks/entry",
        "/marks/a-level-entry",
        "/marks/marksheet",
        "/marks/missing",
        "/marks/moderation",
        "/results/analysis",
        "/results/approvals",
        "/reports/cards",
        "/reports/archive",
        "/imports",
        "/audit",
        "/settings",
        "/profile",
        "/subscription",
        "/notifications",
        "/platform/dashboard",
        "/platform/schools",
        "/platform/subscriptions",
        "/platform/payments",
        "/platform/notifications",
        "/platform/catalogue/subjects",
        "/platform/catalogue/locations",
        "/platform/system/health",
        "/platform/security",
        "/platform/audit",
        "/platform/settings",
        "/platform/account",
    ]).has(path);
}
function isSafePreviousPath(current, previous) {
    return Boolean(previous)
        && !["/login", "/platform/login", "/reset-password", "/activate-school"].includes(previous)
        && isPlatformPath(current) === isPlatformPath(previous);
}
function getFallbackPath(path) {
    if (path.startsWith("/platform/schools/") || path === "/platform/schools/new")
        return "/platform/schools";
    if (path.startsWith("/platform/system/"))
        return "/platform/system/health";
    if (isPlatformPath(path))
        return "/platform/dashboard";
    if (path === "/school/o-level" || path === "/school/alevel")
        return path;
    const oLevelMatch = path.match(/^\/school\/o-level\/(classes|subjects|learners|teachers)(?:\/|$)/);
    if (oLevelMatch) {
        if (oLevelMatch[1] === "learners")
            return "/school/o-level/learners";
        const sectionPath = `/school/o-level/${oLevelMatch[1]}`;
        return path === sectionPath ? "/school/o-level" : sectionPath;
    }
    if (path.startsWith("/school/o-level/"))
        return "/school/o-level";
    if (/^\/school\/alevel\/classes\/(?:new|[^/]+)/.test(path))
        return "/school/alevel";
    if (path.startsWith("/school/alevel/combinations/new"))
        return "/school/alevel/combinations";
    if (path.startsWith("/school/alevel/"))
        return "/school/alevel";
    if (/^\/(?:school\/)?learners\/[^/]+/.test(path) || path === "/school/learners/new")
        return "/school/learners";
    if (/^\/(?:setup\/classes|setup\/subjects)\/(?:new|[^/]+)/.test(path))
        return path.startsWith("/setup/classes/") ? "/setup/classes" : "/setup/subjects";
    if (path.startsWith("/subscription/receipts"))
        return "/subscription";
    if (path.startsWith("/settings/"))
        return "/settings";
    if (path.startsWith("/setup/"))
        return "/dashboard";
    if (path.startsWith("/marks/") || path.startsWith("/results/") || path.startsWith("/reports/"))
        return "/dashboard";
    return "/dashboard";
}
export function BackNavigationButton() {
    const location = useLocation();
    const navigate = useNavigate();
    const navigationType = useNavigationType();
    const routeRef = useRef({ pathname: location.pathname, previous: "", navigationType });
    const [canGoBack, setCanGoBack] = useState(false);
    useEffect(() => {
        if (routeRef.current.pathname !== location.pathname) {
            const previous = routeRef.current.pathname;
            routeRef.current = {
                pathname: location.pathname,
                previous,
                navigationType,
            };
        }
        else {
            routeRef.current.navigationType = navigationType;
        }
        setCanGoBack((navigationType === "POP"
            || (isSafePreviousPath(location.pathname, routeRef.current.previous) && navigationType === "PUSH"))
            && Number(window.history.state?.idx) > 0);
    }, [location.pathname, navigationType]);
    const fallback = getFallbackPath(location.pathname);
    const isWorkspaceStart = isWorkspaceStartPath(location.pathname);
    if (isWorkspaceStart)
        return null;
    function goBack() {
        if (canGoBack)
            navigate(-1);
        else if (fallback !== location.pathname)
            navigate(fallback, { replace: true });
    }
    const disabled = !canGoBack && fallback === location.pathname;
    return (<button type="button" className="global-back-button" onClick={goBack} disabled={disabled} aria-label="Go back" title={disabled ? "You are at the start of this workspace" : "Go back"}>
      <ArrowLeft size={17} aria-hidden="true"/>
      <span>Back</span>
    </button>);
}
