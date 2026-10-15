/** Match one workspace section without allowing a parent route to shadow its child. */
export function isWorkspaceSectionActive(pathname: string, sectionPath: string) {
  return sectionPath === "/school/o-level"
    ? pathname === sectionPath
    : pathname === sectionPath || pathname.startsWith(`${sectionPath}/`);
}
