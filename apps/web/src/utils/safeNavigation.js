export function safeInternalReturnTo(value, fallback) {
    if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("://") || value.includes("\\"))
        return fallback;
    return value;
}
