import type {
  CurrentUser,
  Permission,
} from "../types/auth";

export function hasPermission(
  user: CurrentUser,
  permission: Permission,
): boolean {
  return user.permissions.includes(permission);
}

export function hasAnyPermission(
  user: CurrentUser,
  permissions: Permission[],
): boolean {
  return permissions.some((permission) =>
    user.permissions.includes(permission),
  );
}

export function hasAllPermissions(
  user: CurrentUser,
  permissions: Permission[],
): boolean {
  return permissions.every((permission) =>
    user.permissions.includes(permission),
  );
}