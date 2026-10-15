import {
  BookOpen,
  FileInput,
  GraduationCap,
  LayoutDashboard,
  Settings,
  CreditCard,
  Bell,
  MessageCircleMore,
  UserCog,
  Workflow,
  TrendingUp,
  UsersRound,
  ShieldCheck,
  IdCard,
  FolderOpen,
  ClipboardList,
  type LucideIcon,
} from "lucide-react";

import type { Permission } from "../types/auth";

export type NavigationItem = {
  label: string;
  path: string;
  icon: LucideIcon;
  permission: Permission;
};

export type NavigationGroup = {
  title: string;
  items: NavigationItem[];
};

export const navigationGroups: NavigationGroup[] = [
  {
    title: "OVERVIEW",

    items: [
      {
        label: "Dashboard",
        path: "/dashboard",
        icon: LayoutDashboard,
        permission: "dashboard.view",
      },
    ],
  },

  {
    title: "ACADEMIC MANAGEMENT",

    items: [
      {
        label: "Learners",
        path: "/learners",
        icon: UsersRound,
        permission: "learners.view",
      },

      {
        label: "Promotion & Progression",
        path: "/progression",
        icon: TrendingUp,
        permission: "academics.manage",
      },

      {
        label: "Academic Setup",
        path: "/setup/academic-years",
        icon: BookOpen,
        permission: "academics.manage",
      },
      {
        label: "A-Level Workspace",
        path: "/school/alevel",
        icon: GraduationCap,
        permission: "dashboard.view",
      },
      {
        label: "O-Level Workspace",
        path: "/school/o-level",
        icon: Workflow,
        permission: "dashboard.view",
      },
    ],
  },

  {
    title: "ADMINISTRATION",

    items: [
      {
        label: "Staff",
        path: "/staff",
        icon: UserCog,
        permission: "users.manage",
      },

      { label: "Admissions", path: "/admissions", icon: ClipboardList, permission: "admissions.manage" },
      { label: "ID Cards", path: "/id-cards", icon: IdCard, permission: "idcards.manage" },
      { label: "Document Library", path: "/documents", icon: FolderOpen, permission: "documents.manage" },

      {
        label: "Imports / Exports",
        path: "/imports",
        icon: FileInput,
        permission: "imports.manage",
      },

      {
        label: "Audit",
        path: "/audit",
        icon: ShieldCheck,
        permission: "audit.view",
      },

      {
        label: "Subscription",
        path: "/subscription",
        icon: CreditCard,
        permission: "subscription.view",
      },

      {
        label: "Notifications",
        path: "/notifications",
        icon: MessageCircleMore,
        permission: "dashboard.view",
      },

      {
          label: "Message Centre",
        path: "/messages",
        icon: Bell,
        permission: "dashboard.view",
      },

      {
        label: "Settings",
        path: "/settings",
        icon: Settings,
        permission: "settings.manage",
      },
    ],
  },
];
