export function hasPermission(user, permission) {
    return user.permissions.includes(permission);
}
export function hasAnyPermission(user, permissions) {
    return permissions.some((permission) => user.permissions.includes(permission));
}
export function hasAllPermissions(user, permissions) {
    return permissions.every((permission) => user.permissions.includes(permission));
}
